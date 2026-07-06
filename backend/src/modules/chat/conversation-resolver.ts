/**
 * conversation-resolver.ts — Resolve/tạo conversation 1-1 CHỐNG XÉ (2026-06-22, anh chốt).
 *
 * NGUỒN CHÂN LÝ DUY NHẤT cho mọi đường "mở/tạo hội thoại theo người + nick". Gốc bug
 * (docs/rca-chat-split-conversation-20260622.md): 1 người Zalo × 1 nick có thể có NHIỀU UID
 * (per-account UID drift: findUser theo SĐT ra UID khác UID thread chat) → mỗi UID 1 conversation
 * → tin nhắn XÉ, UI "Chưa có tin nhắn".
 *
 * BẢO ĐẢM (anh chốt 2026-06-22): NGAY LÚC tạo phải check theo GLOBALID + UID per-nick. 1 (KH, nick)
 * = 1 hội thoại, KHÔNG BAO GIỜ 2 — không chờ tới lúc merge dọn. Mọi caller PHẢI đi qua đây.
 *
 * Thứ tự resolve (dừng ở match đầu tiên):
 *   1. Theo (nick, externalThreadId) — khớp UID này (đường nhanh, đa số trúng).
 *   2. GLOBALID: cùng người (Friend.zaloGlobalId) trên CÙNG nick nhưng UID khác → dùng lại hội
 *      thoại của UID anh-em. Đây là khoá chống-xé chắc nhất, không phụ thuộc contact đã merge chưa.
 *   3. A2 theo contactId — dự phòng khi chưa có globalId (contact đã resolve đúng).
 *   4. Chưa có gì → tạo mới.
 */
import { randomUUID } from 'node:crypto';
import { prisma } from '../../shared/database/prisma-client.js';

export interface ResolveConvArgs {
  orgId: string;
  nickId: string;
  externalThreadId: string;       // UID per-nick (zaloUidInNick)
  contactId: string | null;
  globalId?: string | null;       // Zalo globalId nếu caller có (ưu tiên — chắc nhất)
}

/**
 * CHỈ TÌM (không tạo) — trả conversationId hiện hữu của (KH, nick) theo bước 1-3, hoặc null.
 * Dùng cho caller muốn tự tạo (vd message-handler cần set aggregate lastMessageAt/unread).
 */
export async function findExistingUserConversation(args: ResolveConvArgs): Promise<string | null> {
  const { nickId, externalThreadId, contactId } = args;

  // 1. Khớp đúng UID này trên nick.
  const byThread = await prisma.conversation.findFirst({
    where: { zaloAccountId: nickId, externalThreadId, threadType: 'user' },
    select: { id: true },
  });
  if (byThread) return byThread.id;

  // 2. GLOBALID-AWARE: cùng globalId trên CÙNG nick (UID khác do drift) → dùng lại hội thoại đó.
  //    globalId từ caller; thiếu thì tra từ Friend row của UID này.
  let globalId = (args.globalId ?? '').trim();
  if (!globalId) {
    const thisFriend = await prisma.friend.findFirst({
      where: { zaloAccountId: nickId, zaloUidInNick: externalThreadId },
      select: { zaloGlobalId: true },
    });
    globalId = (thisFriend?.zaloGlobalId ?? '').trim();
  }
  if (globalId) {
    const siblingFriends = await prisma.friend.findMany({
      where: { zaloAccountId: nickId, zaloGlobalId: globalId, zaloUidInNick: { not: externalThreadId } },
      select: { zaloUidInNick: true },
    });
    const uids = siblingFriends.map((f) => f.zaloUidInNick).filter((u): u is string => !!u);
    if (uids.length) {
      const byGid = await prisma.conversation.findFirst({
        where: { zaloAccountId: nickId, externalThreadId: { in: uids }, threadType: 'user' },
        orderBy: { lastMessageAt: 'desc' },
        select: { id: true },
      });
      if (byGid) return byGid.id;
    }
  }

  // 3. A2 theo contactId (dự phòng): dùng lại conversation user sẵn có của contact trên nick.
  if (contactId) {
    const sibling = await prisma.conversation.findFirst({
      where: { zaloAccountId: nickId, contactId, threadType: 'user' },
      orderBy: { lastMessageAt: 'desc' },
      select: { id: true },
    });
    if (sibling) return sibling.id;
  }

  return null;
}

/** Tìm (globalId-aware) rồi tạo nếu chưa có. Trả conversationId. */
export async function resolveOrCreateUserConversation(args: ResolveConvArgs): Promise<string> {
  const existing = await findExistingUserConversation(args);
  if (existing) return existing;

  // Chưa có gì → tạo mới (KH này thật sự lần đầu có hội thoại với nick này).
  const created = await prisma.conversation.create({
    data: {
      id: randomUUID(), orgId: args.orgId, zaloAccountId: args.nickId,
      externalThreadId: args.externalThreadId, threadType: 'user', contactId: args.contactId,
    },
    select: { id: true },
  });
  return created.id;
}
