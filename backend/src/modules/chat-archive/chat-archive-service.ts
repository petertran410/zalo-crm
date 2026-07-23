/**
 * chat-archive-service.ts — Phase Lưu Hội Thoại 2026-07-22.
 *
 * Anh chốt: "lưu tin nhắn và ảnh vào một cơ sở dữ liệu để dùng về sau",
 * và "CHỈ Chủ tài khoản xem được — nhân viên và admin đều không".
 *
 * Bản lưu là ẢNH CHỤP ĐỘC LẬP: chép tên khách, tên nick, từng dòng tin, và URL ảnh
 * sang bảng riêng. Hội thoại gốc bị xoá / tin bị thu hồi về sau → bản lưu vẫn đọc được.
 * Vì thế ChatArchive KHÔNG khai FK sang Conversation/Message (xem ghi chú ở schema).
 *
 * Ảnh KHÔNG chép lại byte: media đến từ Zalo đã được mirror vĩnh viễn về kho lúc nhận
 * (message-handler.mirrorRemoteMediaUrl), và cron dọn thùng rác có invariant không đụng
 * byte. Bản lưu chỉ giữ URL + key object là đủ bền.
 *
 * 2 cách lưu (anh chốt) nằm chung 1 bản:
 *   • summary  — nhờ AI tóm tắt (tái dùng generateAiOutput type='summary')
 *   • verbatim — chép từng dòng kèm liên kết ảnh/tệp
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { keyFromPublicUrl } from '../../shared/storage/minio-client.js';
import { generateAiOutput } from '../ai/ai-service.js';
import { logger } from '../../shared/utils/logger.js';
import { buildArchiveLines, countMediaLines, type ArchivableMessage } from './chat-archive-extract.js';

export type ArchiveMode = 'summary' | 'verbatim' | 'both';

/** Trần số tin chép 1 lần — hội thoại vài chục nghìn tin không được nuốt hết RAM. */
const MAX_LINES = 5000;

export interface CreateArchiveInput {
  orgId: string;
  conversationId: string;
  createdById: string;
  mode?: ArchiveMode;
}

export interface CreateArchiveResult {
  archiveId: string;
  mode: ArchiveMode;
  messageCount: number;
  mediaCount: number;
  summaryText: string | null;
  /** Có yêu cầu tóm tắt nhưng AI không chạy được (tắt/hết quota/thiếu khoá) → lý do. */
  summarySkippedReason?: string;
  truncated: boolean;
}

/**
 * Chụp 1 hội thoại thành bản lưu.
 * Ném lỗi khi hội thoại không tồn tại trong org; các lỗi khác (AI) đều nuốt + báo lại
 * qua summarySkippedReason để bản chép từng dòng vẫn được lưu.
 */
export async function createChatArchive(input: CreateArchiveInput): Promise<CreateArchiveResult> {
  const { orgId, conversationId, createdById } = input;
  const mode: ArchiveMode = input.mode ?? 'both';

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, orgId },
    include: {
      contact: { select: { id: true, fullName: true } },
      zaloAccount: { select: { id: true, displayName: true } },
    },
  });
  if (!conversation) throw new Error('Không tìm thấy hội thoại');

  // Chép cả tin đã thu hồi (buildArchiveLines đổi nội dung thành nhãn) — bản lưu phải
  // phản ánh đúng là CÓ tin ở đó. Sort theo Snowflake Zalo như mọi chỗ list tin.
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: [{ sentAt: 'asc' }, { zaloMsgIdNum: 'asc' }],
    take: MAX_LINES + 1,
    select: {
      id: true, senderType: true, senderName: true, content: true,
      contentType: true, attachments: true, sentAt: true, isDeleted: true,
    },
  });
  const truncated = messages.length > MAX_LINES;
  const capped = truncated ? messages.slice(0, MAX_LINES) : messages;

  const lines = buildArchiveLines(capped as ArchivableMessage[]);
  const mediaCount = countMediaLines(lines);

  // ── Tóm tắt (nếu được yêu cầu) ──────────────────────────────────────────
  // AI tắt / hết hạn mức ngày / chưa cấu hình khoá → KHÔNG làm hỏng cả lần lưu:
  // vẫn lưu bản chép từng dòng, chỉ báo lại lý do thiếu tóm tắt.
  let summaryText: string | null = null;
  let summarySkippedReason: string | undefined;
  if ((mode === 'summary' || mode === 'both') && capped.length > 0) {
    try {
      const out = await generateAiOutput({ orgId, conversationId, type: 'summary' });
      summaryText = typeof out === 'object' && out && 'content' in out ? String((out as any).content) : null;
    } catch (err) {
      summarySkippedReason = (err as Error)?.message ?? 'AI tóm tắt lỗi';
      logger.warn(`[chat-archive] tóm tắt lỗi conv=${conversationId}:`, summarySkippedReason);
    }
  }

  const wantVerbatim = mode === 'verbatim' || mode === 'both';

  const archive = await prisma.$transaction(async (tx) => {
    const created = await tx.chatArchive.create({
      data: {
        orgId,
        conversationId,
        mode,
        contactName: conversation.contact?.fullName ?? null,
        contactId: conversation.contactId,
        channel: conversation.channel,
        zaloAccountId: conversation.zaloAccountId,
        nickName: conversation.zaloAccount?.displayName ?? null,
        summaryText,
        messageCount: wantVerbatim ? lines.length : 0,
        mediaCount: wantVerbatim ? mediaCount : 0,
        firstMessageAt: lines[0]?.sentAt ?? null,
        lastMessageAt: lines[lines.length - 1]?.sentAt ?? null,
        createdById,
      },
    });

    if (wantVerbatim && lines.length > 0) {
      // createMany theo lô — 5000 dòng 1 lệnh làm phình câu SQL.
      const BATCH = 500;
      for (let i = 0; i < lines.length; i += BATCH) {
        await tx.chatArchiveMessage.createMany({
          data: lines.slice(i, i + BATCH).map((l) => ({
            archiveId: created.id,
            seq: l.seq,
            sourceMessageId: l.sourceMessageId,
            senderType: l.senderType,
            senderName: l.senderName,
            content: l.content,
            contentType: l.contentType,
            mediaUrls: l.mediaUrls,
            // Key object để sau còn đọc byte kể cả khi tên miền đổi.
            mediaKeys: l.mediaUrls.map((u) => keyFromPublicUrl(u)).filter(Boolean),
            sentAt: l.sentAt,
          })),
        });
      }
    }
    return created;
  });

  logger.info(
    `[chat-archive] đã lưu conv=${conversationId} archive=${archive.id} mode=${mode} ` +
    `dòng=${wantVerbatim ? lines.length : 0} media=${mediaCount} bởi=${createdById}`,
  );

  return {
    archiveId: archive.id,
    mode,
    messageCount: wantVerbatim ? lines.length : 0,
    mediaCount: wantVerbatim ? mediaCount : 0,
    summaryText,
    summarySkippedReason,
    truncated,
  };
}
