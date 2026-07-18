/**
 * save-from-chat-helper.ts — extracted from media-routes for reuse by work-attachments.
 * Lưu 1 tin nhắn (ảnh/video/file) vào kho MediaAsset. KHÔNG throw — trả status.
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { registerAsset, resolveSavedVisibility, logMediaUsage, type MediaKind } from './media-service.js';
import { downloadMediaToTemp } from '../chat/chat-media-helpers.js';
import { scanOrPass } from '../../shared/security/clamav-client.js';
import { readFile } from 'node:fs/promises';
import { logger } from '../../shared/utils/logger.js';

export interface SaveOneResult {
  messageId: string;
  status: 'ok' | 'skipped' | 'blocked' | 'error';
  asset?: { id: string; name: string };
  deduped?: boolean;
  reason?: string;
}

const VIDEO_EXTS = new Set(['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v', '3gp']);
const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic']);

function kindFromExt(ext: string): MediaKind | null {
  const e = ext.replace(/^\./, '').toLowerCase();
  if (VIDEO_EXTS.has(e)) return 'video';
  if (IMAGE_EXTS.has(e)) return 'image';
  return null;
}

/**
 * Lưu 1 tin nhắn (ảnh/file) vào kho — DRY helper cho /save-from-chat + work-item auto-attach.
 */
export async function saveOneMessageToMedia(args: {
  orgId: string;
  userId: string;
  messageId: string;
  visibility?: 'private' | 'public';
}): Promise<SaveOneResult> {
  const { orgId, userId, messageId } = args;
  const message = await prisma.message.findFirst({
    where: { id: messageId, conversation: { orgId } },
    include: { conversation: { include: { zaloAccount: true } } },
  });
  if (!message) return { messageId, status: 'error', reason: 'Không tìm thấy tin nhắn' };

  const nick = message.conversation.zaloAccount;
  const isPrivateNick = nick.privacyMode === 'main';
  const vis = resolveSavedVisibility({
    nickPrivacyMode: nick.privacyMode,
    nickOwnerUserId: nick.ownerUserId,
    viewerUserId: userId,
    requested: args.visibility,
  });
  if (vis.blocked) {
    return { messageId, status: 'blocked', reason: 'Tin từ nick Riêng tư — chỉ chính chủ nick mới lưu được.' };
  }

  let parsed: any = {};
  try { parsed = JSON.parse(message.content || '{}'); } catch { /* not json */ }
  const url: string | undefined = parsed.href || parsed.hdUrl || parsed.normalUrl || parsed.url || parsed.fileUrl;
  if (!url) return { messageId, status: 'skipped', reason: 'Tin này không có media để lưu' };

  const ct = message.contentType;
  // Chỉ auto-attach image/video/file — skip text/sticker/voice/...
  if (!['image', 'video', 'file'].includes(ct || '')) {
    return { messageId, status: 'skipped', reason: 'Loại tin không hỗ trợ đính kèm' };
  }
  let kind: MediaKind = ct === 'image' ? 'image' : ct === 'video' ? 'video' : 'file';

  const urlBase = (() => { try { return decodeURIComponent(String(url).split('/').pop() || ''); } catch { return ''; } })();
  const fileExt: string = (() => {
    try {
      const p = typeof parsed.params === 'string' ? JSON.parse(parsed.params) : parsed.params;
      const e = String(p?.fileExt || '').replace(/^\./, '').toLowerCase().trim();
      return /^[a-z0-9]{1,5}$/.test(e) ? e : '';
    } catch { return ''; }
  })();
  let realName: string | undefined =
    parsed.title || parsed.fileName || parsed.name
    || (kind !== 'image' && urlBase && /\.[A-Za-z0-9]{2,5}$/.test(urlBase) ? urlBase : undefined);
  if (realName && fileExt && !/\.[A-Za-z0-9]{2,5}$/.test(realName)) {
    realName = `${realName}.${fileExt}`;
  }

  if (kind === 'file') {
    const extForKind = fileExt || (realName?.match(/\.([A-Za-z0-9]{2,5})$/)?.[1] ?? '');
    if (kindFromExt(extForKind) === 'video') {
      kind = 'video';
      logger.info(`[media][audit] nhận diện video từ đuôi .${extForKind} (Zalo gửi dạng file) msg=${messageId}`);
    }
  }

  const saver = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });
  const saleLast =
    (saver?.fullName ?? '').trim().split(/\s+/).pop()
    || (nick.displayName ?? '').trim().split(/\s+/).pop()
    || 'Chat';
  const ddmm = (message.sentAt ?? new Date()).toLocaleDateString('en-GB', {
    day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh',
  });
  const mediaName = realName || `${saleLast} ${ddmm}`;

  if (kind === 'file') {
    const fname = String(mediaName || url || '').toLowerCase();
    const DANGEROUS = ['.exe', '.bat', '.cmd', '.scr', '.com', '.pif', '.msi', '.js', '.jar', '.vbs', '.ps1', '.sh'];
    if (DANGEROUS.some((ext) => fname.endsWith(ext))) {
      logger.warn(`[media][audit] chặn lưu file nguy hiểm user=${userId} name=${fname}`);
      return { messageId, status: 'blocked', reason: 'Loại tệp này không được phép lưu vào kho (bảo mật).' };
    }
  }

  let tmp: { path: string; cleanup: () => Promise<void> } | null = null;
  try {
    tmp = await downloadMediaToTemp({ url, filename: realName }, ct);
    const buf = await readFile(tmp.path);
    const av = await scanOrPass(buf, { filename: realName, userId });
    if (av.blocked) return { messageId, status: 'blocked', reason: av.reason };
    const mimeType = parsed.mime
      || (kind === 'image' ? 'image/jpeg' : kind === 'video' ? 'video/mp4' : 'application/octet-stream');
    const res = await registerAsset({
      orgId, buffer: buf, mimeType, kind,
      name: mediaName,
      originalFilename: realName,
      ownerUserId: userId, createdById: userId,
      visibility: vis.visibility,
      source: 'saved_from_chat',
      sourceZaloAccountId: nick.id,
      sourceIsPrivateNick: isPrivateNick,
    });
    logger.info(`[media][audit] save_from_chat asset=${res.asset.id} user=${userId} visibility=${vis.visibility} fromPrivateNick=${isPrivateNick} deduped=${res.deduped}`);
    await logMediaUsage({
      orgId, mediaAssetId: res.asset.id, eventType: 'saved_from_chat', userId,
      conversationId: message.conversationId,
      meta: { visibility: vis.visibility, fromPrivateNick: isPrivateNick, deduped: res.deduped },
    });
    return { messageId, status: 'ok', asset: { id: res.asset.id, name: res.asset.name }, deduped: res.deduped };
  } catch (err: any) {
    logger.error('[media] save-from-chat error:', err);
    return { messageId, status: 'error', reason: err?.message ?? 'save failed' };
  } finally {
    await tmp?.cleanup().catch(() => {});
  }
}
