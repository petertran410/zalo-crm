/**
 * media-routes.ts — Phase Media Library 2026-06-11 (GĐ1).
 *
 * Kho phương tiện: list / upload / "Lưu từ chat" / chèn vào chat.
 * RBAC (checklist điều 2-3): authMiddleware toàn route + requireGrant('media', …).
 * Scope owner (checklist điều 1): sale chỉ thấy asset của mình (ownerUserId) HOẶC
 *   asset Công khai (visibility='public'); media.view_all bypass scope (admin/marketing).
 * Privacy (checklist điều 4): "Lưu từ chat" của nick Riêng tư (privacyMode='main')
 *   → asset mặc định private + ghi sourceZaloAccountId; chỉ chính chủ nick lưu được.
 * UID per-cặp-nick (checklist điều 7): chèn vào chat gửi theo conversation.externalThreadId.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Server } from 'socket.io';
import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireGrant } from '../rbac/rbac-middleware.js';
import { userHasGrant } from '../rbac/permission-group-service.js';
import { zaloPool } from '../zalo/zalo-pool.js';
import { zaloOps } from '../../shared/zalo-operations.js';
import { zaloRateLimiter } from '../zalo/zalo-rate-limiter.js';
import { registerAsset, bumpUsage, resolveSavedVisibility, generateWatermarkVariant, disableWatermark, saveAnnotatedVariant, logMediaUsage, normalizeTags, type MediaKind, type MediaStorageScope } from './media-service.js';
// Kho Lưu Trữ 2026-07-22 — luật "ai thấy tệp nào" + thư mục thật trên đĩa.
import { buildMediaScopeWhere, isOrgOwner, activeShareWhere } from './media-access.js';
import {
  createFolderOnDisk, mirrorAssetIntoFolder, unmirrorAssetFromFolder,
  renameFolderOnDisk, deleteFolderOnDisk,
  collectDescendantIds, folderDepth, MAX_FOLDER_DEPTH, findSiblingWithSameName,
} from './media-folder-service.js';
import { randomBytes } from 'node:crypto';
import { downloadMediaToTemp } from '../chat/chat-media-helpers.js';
import { createMediaMessage, getUserFullName } from '../chat/chat-helpers.js';
import { emitChatMessage } from '../../shared/realtime/emit-chat.js';
import { generateThumbnail, sendNativeVideo } from '../../shared/video-processor.js';
import { uploadBuffer, getObjectBuffer, keyFromPublicUrl } from '../../shared/storage/minio-client.js';
import { mimeToExt } from '../../shared/storage/types.js';
import { scanOrPass } from '../../shared/security/clamav-client.js';
import { readFile } from 'node:fs/promises';
import { logger } from '../../shared/utils/logger.js';
import { saveOneMessageToMedia, type SaveOneResult } from './save-from-chat-helper.js';

// SVG bắt buộc đi qua svg-sanitizer trước khi lưu. ICO là bitmap thuần, không mang được mã.
const ALLOWED_IMAGE = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'image/svg+xml',
  'image/x-icon', 'image/vnd.microsoft.icon',
];
const ALLOWED_VIDEO = ['video/mp4', 'video/quicktime', 'video/webm'];
// File types: tái dùng list của chat-attachment (KHÔNG mở rộng tùy tiện — checklist reuse).
const ALLOWED_FILE = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel', 'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'application/zip', 'application/x-zip-compressed',
];
/**
 * Hạn mức tải lên kho, áp cho mọi loại tệp. Đặt theo từng request qua request.parts()
 * chứ không sửa multipart toàn cục, vì gửi tệp trong chat cần trần rộng hơn nhiều.
 */
const PER_FILE_MAX = 10 * 1024 * 1024;
// 25 x 10MB = 250MB nên trần này chạm trước, cố ý để chặn một lượt tải ngốn hết RAM.
const REQUEST_TOTAL_MAX = 100 * 1024 * 1024;
const MAX_FILES_PER_REQUEST = 25;

// TODO(video): kho chưa dùng cho video. Trần 10MB chỉ đủ vài giây quay bằng điện thoại,
// muốn hỗ trợ thật thì phải cho kind='video' một trần riêng và tính lại chỗ lưu trữ.

// GĐ13a Thùng rác Media (2026-06-12): giữ trong thùng rác 30 ngày rồi cron tự dọn (xóa hàng DB,
// KHÔNG đụng byte MinIO). TRASH_EMPTY_BATCH: dọn-sạch-thủ-công xóa tối đa N/lần tránh khóa DB lâu.
export const TRASH_RETENTION_DAYS = 30;
const TRASH_EMPTY_BATCH = 500;

function classify(mime: string): MediaKind | null {
  if (ALLOWED_IMAGE.includes(mime)) return 'image';
  if (ALLOWED_VIDEO.includes(mime)) return 'video';
  if (ALLOWED_FILE.includes(mime)) return 'file';
  return null;
}

// Nhận diện loại media THẬT theo ĐUÔI file (anh chốt 2026-06-12). Zalo nhiều khi gửi
// video/ảnh dưới dạng ĐÍNH KÈM FILE (contentType='file') → mặc định lưu thành kind='file'
// → video lọt tab Tệp, gửi đi mất player. Đuôi cho biết thật sự là gì → nâng cấp kind.
const VIDEO_EXTS = new Set(['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v', '3gp']);
const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic']);
function kindFromExt(ext: string): MediaKind | null {
  const e = ext.replace(/^\./, '').toLowerCase();
  if (VIDEO_EXTS.has(e)) return 'video';
  if (IMAGE_EXTS.has(e)) return 'image';
  return null;
}

// mime → đuôi (chỉ các loại tệp được phép). Dùng để vá file cũ lưu trước khi có tên thật
// (mime octet-stream) hoặc tên không có đuôi → suy đuôi để Zalo bên nhận mở được.
const MIME_EXT: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-excel': '.xls',
  'text/csv': '.csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/zip': '.zip',
  'application/x-zip-compressed': '.zip',
};

/**
 * Tên file (kèm ĐUÔI) để gửi cho khách. zca-js lấy tên + đuôi mà khách NHÌN THẤY từ
 * basename của đường dẫn temp (path.basename + path.extname). Thiếu đuôi → Zalo hiển thị
 * "file lỗi/không mở được". Ưu tiên: original_filename → name. Nếu vẫn thiếu đuôi → suy
 * đuôi từ url-basename rồi từ mime. File cũ ("Lưu từ chat", mime octet-stream) → .bin
 * cuối cùng để ít nhất có đuôi (khách đổi tên mở được) thay vì file lỗi hoàn toàn.
 */
export function buildSendFileName(
  asset: { name: string; originalFilename?: string | null },
  blob: { mimeType: string; publicUrl: string },
): string {
  const base = (asset.originalFilename || asset.name || 'tep').replace(/[\\/]+/g, '_').trim();
  const hasExt = /\.[A-Za-z0-9]{2,5}$/.test(base);
  if (hasExt) return base;
  // suy đuôi từ url-basename (vd .../<hash>.pdf)
  let ext = '';
  try {
    const urlName = decodeURIComponent(new URL(blob.publicUrl).pathname.split('/').pop() || '');
    const m = urlName.match(/\.[A-Za-z0-9]{2,5}$/);
    if (m) ext = m[0];
  } catch { /* ignore */ }
  if (!ext) ext = MIME_EXT[blob.mimeType] || '.bin';
  return base + ext;
}

export async function mediaRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  // ── GET /api/v1/media — list kho (scope owner + visibility) ────────────────
  app.get(
    '/api/v1/media',
    { preHandler: requireGrant('media', 'access') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const userId = (user as any).userId ?? user.id;
      const q = request.query as {
        kind?: string; tag?: string; folderId?: string;
        visibility?: string; q?: string; limit?: string;
        // Lever 2 (anh chốt 2026-06-12): lọc sâu.
        since?: string;        // '7d' | '30d' | '90d' — tải lên/dùng trong N ngày
        sizeMin?: string; sizeMax?: string; // byte
        sort?: string;         // 'recent' (mặc định, theo lastUsedAt) | 'newest' (createdAt) | 'most_used' | 'name'
        // 2026-06-16: phân trang theo trang (block picker) + lọc theo người tải lên.
        skip?: string;         // offset — bỏ qua N kết quả đầu (page * limit)
        ownerUserId?: string;  // chỉ ảnh của 1 sale cụ thể (dropdown người upload)
        // Kho Lưu Trữ 2026-07-22: lọc theo phạm vi — 'catalog' (kho chung) | 'private_upload'
        // (tệp tải lên tab Kho). Bỏ trống = cả hai (đúng quyền xem của người gọi).
        storageScope?: string;
      };

      // Kho Lưu Trữ 2026-07-22: luật scope gom về media-access.buildMediaScopeWhere.
      // view_all vẫn bypass kho CŨ, nhưng KHÔNG bypass tệp riêng tư của tab Kho.
      const canViewAll = await userHasGrant(userId, 'media', 'view_all');
      const scopeWhere = buildMediaScopeWhere({
        userId,
        canViewAll,
        isOwnerRole: isOrgOwner(user),
      });

      const where: any = {
        orgId: user.orgId,
        archivedAt: null,
        ...scopeWhere,
      };
      if (q.storageScope === 'catalog' || q.storageScope === 'private_upload') {
        // AND với scopeWhere: lọc hiển thị, KHÔNG nới quyền.
        where.AND = [...(where.AND ?? []), { storageScope: q.storageScope }];
      }
      if (q.kind) where.kind = q.kind;
      if (q.visibility) where.visibility = q.visibility;
      if (q.folderId) where.folderId = q.folderId;
      // Tag lưu lowercase (normalizeTags) → lọc cũng lowercase để khớp dù sale gõ hoa (code-review #2).
      if (q.tag) where.tagIds = { has: q.tag.trim().toLowerCase() };
      if (q.q) where.name = { contains: q.q, mode: 'insensitive' };
      // Lọc theo người tải lên (chủ sở hữu). AND với scopeWhere → sale thường chỉ thấy
      // ảnh CÔNG KHAI của người đó (đúng scope), admin view_all thấy tất cả.
      if (q.ownerUserId) where.ownerUserId = q.ownerUserId;
      // Thời gian: tải lên trong N ngày (createdAt).
      if (q.since) {
        const days = { '7d': 7, '30d': 30, '90d': 90 }[q.since];
        if (days) where.createdAt = { gte: new Date(Date.now() - days * 86400_000) };
      }
      // Size: lọc theo sizeBytes của blob 'original'.
      const sizeMin = q.sizeMin ? parseInt(q.sizeMin, 10) : null;
      const sizeMax = q.sizeMax ? parseInt(q.sizeMax, 10) : null;
      if (sizeMin || sizeMax) {
        where.blobs = { some: { variantType: 'original',
          ...(sizeMin ? { sizeBytes: { gte: sizeMin } } : {}),
          ...(sizeMax ? { sizeBytes: { lte: sizeMax } } : {}),
        } };
      }

      // Sắp xếp (Lever 2): recent (lastUsed) | newest (createdAt) | most_used | name.
      const orderBy: any = {
        recent: [{ lastUsedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        newest: [{ createdAt: 'desc' }],
        most_used: [{ usageCount: 'desc' }, { createdAt: 'desc' }],
        name: [{ name: 'asc' }],
      }[q.sort ?? 'recent'] ?? [{ lastUsedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }];

      const limit = Math.min(parseInt(q.limit ?? '60', 10) || 60, 200);
      const skip = Math.max(parseInt(q.skip ?? '0', 10) || 0, 0);
      // include owner + sourceZaloAccount để hiện "ảnh từ nick nào / sale nào" trong 1 query
      // (chống N+1 — eng-review #6). select chỉ field cần, không kéo nguyên row nick/user.
      // total: tổng số khớp filter (KHÔNG phụ thuộc skip/take) → FE hiện "Trang X/Y" + đếm.
      const [total, assets] = await Promise.all([
        prisma.mediaAsset.count({ where }),
        prisma.mediaAsset.findMany({
          where,
          orderBy,
          skip,
          take: limit,
          include: {
            blobs: { where: { variantType: { in: ['original', 'watermarked'] } } },
            owner: { select: { fullName: true } },
            sourceZaloAccount: { select: { displayName: true } },
          },
        }),
      ]);

      // Bộ ảnh yêu thích của user (để FE hiện trạng thái ⭐ ngay trong list/panel).
      const favAlbum = await prisma.mediaAlbum.findFirst({
        where: { orgId: user.orgId, ownerUserId: userId, kind: 'favorite' }, select: { id: true },
      });
      const favSet = new Set<string>();
      if (favAlbum) {
        const favItems = await prisma.mediaAlbumItem.findMany({
          where: { albumId: favAlbum.id }, select: { mediaAssetId: true },
        });
        for (const fi of favItems) favSet.add(fi.mediaAssetId);
      }

      const items = assets.map((a) => {
        const blob = a.blobs.find((b) => b.variantType === 'original');
        const wm = a.blobs.find((b) => b.variantType === 'watermarked');
        return {
          id: a.id,
          kind: a.kind,
          name: a.name,
          visibility: a.visibility,
          // Kho Lưu Trữ 2026-07-22 — FE hiện huy hiệu "Riêng tư / đã chia sẻ" + nút Chia sẻ
          // (chỉ chủ tệp mới thấy nút). mine=false + private_upload = xem nhờ liên kết.
          storageScope: a.storageScope,
          mine: a.ownerUserId === userId,
          ownerUserId: a.ownerUserId,
          tagIds: a.tagIds,
          usageCount: a.usageCount,
          url: blob?.publicUrl ?? null,
          // VIDEO/FILE KHÔNG fallback thumbnail = URL gốc (mp4/pdf) → tránh <img> vỡ.
          // Chỉ ẢNH mới dùng blob.publicUrl làm thumbnail. Video dùng thumbnailUrl thật (ffmpeg).
          thumbnailUrl: a.thumbnailUrl ?? (a.kind === 'image' ? blob?.publicUrl ?? null : null),
          sizeBytes: blob?.sizeBytes ?? null,
          durationSec: blob?.durationSec ?? null,
          createdAt: a.createdAt,
          // Watermark per-ảnh (GĐ2).
          watermarkEnabled: a.watermarkEnabled,
          watermarkPosition: a.watermarkPosition,
          watermarkOpacity: a.watermarkOpacity,
          watermarkUrl: wm?.publicUrl ?? null,
          // D11: ảnh lưu từ nick Riêng tư → FE hỏi xác nhận trước khi chia sẻ công khai.
          // 2026-06-15: đọc CỜ riêng (không suy từ sourceZaloAccountId nữa — nick thường giờ
          // cũng có id nguồn để hiển thị, nhưng KHÔNG phải Riêng tư).
          sourceFromPrivateNick: a.sourceIsPrivateNick,
          favorited: favSet.has(a.id),
          // Nguồn để HIỂN THỊ "ảnh từ nick nào / sale nào / kích thước" (createdAt đã có ở trên).
          source: a.source,
          ownerName: a.owner?.fullName ?? null,
          sourceNickName: a.sourceZaloAccount?.displayName ?? null,
          width: blob?.width ?? null,
          height: blob?.height ?? null,
        };
      });
      // total kèm theo để FE phân trang (block picker). Caller cũ chỉ đọc `items` → không vỡ.
      return { items, total };
    },
  );

  // ── GET /api/v1/media/uploaders — danh sách người tải lên (cho dropdown lọc) ──
  // Trả các sale có ảnh trong scope hiện tại + số lượng, để FE đổ vào dropdown "Người upload".
  // Nhận kind/visibility để dropdown KHỚP đúng view (vd block picker chỉ ảnh công khai).
  app.get(
    '/api/v1/media/uploaders',
    { preHandler: requireGrant('media', 'access') },
    async (request: FastifyRequest) => {
      const user = request.user!;
      const userId = (user as any).userId ?? user.id;
      const q = request.query as { kind?: string; visibility?: string };

      const canViewAll = await userHasGrant(userId, 'media', 'view_all');
      const scopeWhere = canViewAll
        ? {}
        : { OR: [{ ownerUserId: userId }, { visibility: 'public' }] };

      const where: any = {
        orgId: user.orgId,
        archivedAt: null,
        ownerUserId: { not: null },
        ...scopeWhere,
      };
      if (q.kind) where.kind = q.kind;
      if (q.visibility) where.visibility = q.visibility;

      // groupBy lấy số ảnh mỗi owner trong 1 query, rồi join tên (chống N+1).
      const rows = await prisma.mediaAsset.groupBy({
        by: ['ownerUserId'],
        where,
        _count: { _all: true },
      });
      const ids = rows.map((r) => r.ownerUserId).filter((id): id is string => !!id);
      const users = ids.length
        ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } })
        : [];
      const nameById = new Map(users.map((u) => [u.id, u.fullName]));
      const uploaders = rows
        .filter((r) => r.ownerUserId)
        .map((r) => ({ id: r.ownerUserId!, name: nameById.get(r.ownerUserId!) ?? 'Không rõ', count: r._count._all }))
        .sort((a, b) => b.count - a.count);
      return { uploaders };
    },
  );

  // ── POST /api/v1/media/upload — tải ảnh/file lên kho (multipart) ───────────
  // Đảo lại quyết định auth-only của 2026-07-22: tải lên nay đòi media.create do admin cấp,
  // nên ai chưa có quyền này sẽ mất quyền tải lên ngay khi bản này lên.
  app.post(
    '/api/v1/media/upload',
    { preHandler: requireGrant('media', 'create') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const userId = (user as any).userId ?? user.id;
      let visibility: 'private' | 'public' = 'private';
      let folderId: string | null = null;
      let tagIds: string[] = [];
      let storageScope: MediaStorageScope = 'private_upload';
      // BUG self-verify 2026-06-11: field 'visibility' có thể đến SAU file trong multipart
      // → đọc khi register thì còn 'private'. Fix: GOM file buffers + fields TRƯỚC, register SAU.
      const pending: Array<{ buffer: Buffer; mimeType: string; kind: MediaKind; filename: string }> = [];

      let totalBytes = 0;
      try {
        // fileSize chặn ngay ở tầng luồng nên tệp quá cỡ bị cắt từ lúc đọc, không nuốt trọn
        // 500MB vào RAM rồi mới từ chối.
        const parts = request.parts({
          limits: { fileSize: PER_FILE_MAX, files: MAX_FILES_PER_REQUEST },
        });
        for await (const part of parts) {
          if (part.type === 'field') {
            if (part.fieldname === 'visibility' && part.value === 'public') visibility = 'public';
            if (part.fieldname === 'folderId' && part.value) folderId = String(part.value);
            if (part.fieldname === 'tagIds' && part.value) {
              try { tagIds = JSON.parse(String(part.value)); } catch { /* ignore */ }
            }
            if (part.fieldname === 'storageScope' && part.value === 'catalog') storageScope = 'catalog';
            continue;
          }
          if (part.type !== 'file') continue;
          const kind = classify(part.mimetype);
          if (!kind) {
            return reply.status(415).send({ error: `Loại tệp không hỗ trợ: ${part.mimetype}` });
          }
          const buf = await part.toBuffer();

          // Busboy chỉ cắt cụt tệp chứ không nói tệp nào hỏng, nên vẫn cần kiểm ở đây để
          // báo đúng tên tệp cho người dùng.
          if (buf.length > PER_FILE_MAX || (part.file as any)?.truncated) {
            return reply.status(413).send({
              error: `Tệp "${part.filename}" vượt quá ${PER_FILE_MAX / 1024 / 1024}MB mỗi tệp`,
              code: 'FILE_TOO_LARGE',
            });
          }

          totalBytes += buf.length;
          if (totalBytes > REQUEST_TOTAL_MAX) {
            return reply.status(413).send({
              error: `Tổng dung lượng một lượt tải lên vượt ${REQUEST_TOTAL_MAX / 1024 / 1024}MB, chia nhỏ ra nhé`,
              code: 'UPLOAD_TOO_LARGE',
            });
          }
          // GĐ13b: quét virus (fail-open mặc định; AV tắt → skip ngay). Chặn nếu nhiễm.
          const av = await scanOrPass(buf, { filename: part.filename, userId });
          if (av.blocked) return reply.status(422).send({ error: av.reason, code: 'AV_BLOCKED' });
          pending.push({ buffer: buf, mimeType: part.mimetype, kind, filename: part.filename });
        }

        // Register SAU khi đã đọc hết parts → visibility/folderId/tagIds chắc chắn đầy đủ.
        const created: any[] = [];
        for (const p of pending) {
          const res = await registerAsset({
            orgId: user.orgId,
            buffer: p.buffer,
            mimeType: p.mimeType,
            kind: p.kind,
            originalFilename: p.filename,
            ownerUserId: userId,
            createdById: userId,
            visibility,
            source: 'upload',
            tagIds,
            folderId,
            storageScope,
          });
          // Thư mục THẬT trên đĩa (anh chốt): đặt liên kết cứng của tệp vào thư mục đã bỏ dấu.
          // Fire-and-forget — hỏng thư mục đĩa KHÔNG được làm hỏng lần tải lên.
          if (folderId) void mirrorAssetIntoFolder(user.orgId, res.asset.id, folderId);
          created.push({ id: res.asset.id, name: res.asset.name, deduped: res.deduped });
        }
        if (created.length === 0) return reply.status(400).send({ error: 'Không có tệp nào' });
        return { assets: created };
      } catch (err: any) {
        // Mấy nhánh dưới đều là lỗi TỆP của người dùng, không phải sự cố hệ thống, nên trả
        // mã lỗi kèm lý do cụ thể thay vì 500 "upload failed".
        if (err?.code === 'SVG_REJECTED') {
          logger.warn(`[media][av] từ chối SVG user=${userId}: ${err.message}`);
          return reply.status(422).send({ error: err.message, code: 'SVG_REJECTED' });
        }
        if (err?.code === 'FST_REQ_FILE_TOO_LARGE') {
          return reply.status(413).send({
            error: `Tệp vượt quá ${PER_FILE_MAX / 1024 / 1024}MB mỗi tệp`,
            code: 'FILE_TOO_LARGE',
          });
        }
        if (err?.code === 'FST_FILES_LIMIT') {
          return reply.status(413).send({
            error: `Tối đa ${MAX_FILES_PER_REQUEST} tệp mỗi lượt tải lên`,
            code: 'TOO_MANY_FILES',
          });
        }
        logger.error('[media] upload error:', err);
        return reply.status(500).send({ error: err?.message ?? 'upload failed' });
      }
    },
  );

  // ── POST /api/v1/media/save-from-chat — "Lưu vào Media" từ bong bóng chat ──
  app.post(
    '/api/v1/media/save-from-chat',
    { preHandler: requireGrant('media', 'create') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const userId = (user as any).userId ?? user.id;
      const body = request.body as { messageId: string; visibility?: 'private' | 'public' };
      if (!body?.messageId) return reply.status(400).send({ error: 'messageId required' });

      const r = await saveOneMessageToMedia({ orgId: user.orgId, userId, messageId: body.messageId, visibility: body.visibility });
      if (r.status === 'blocked') return reply.status(403).send({ error: r.reason, code: 'PRIVACY_LOCKED' });
      if (r.status === 'error') return reply.status(r.reason === 'Không tìm thấy tin nhắn' ? 404 : 500).send({ error: r.reason });
      if (r.status === 'skipped') return reply.status(400).send({ error: r.reason });
      return { asset: r.asset, deduped: r.deduped };
    },
  );

  // ── POST /api/v1/media/save-from-chat-batch — lưu NHIỀU tin (cả album / chọn 5-10 tấm) ──
  // Nhận messageIds[] (các tile cùng album, hoặc tập ảnh sale tự tick). Lưu lần lượt qua
  // dedup (ảnh trùng không tốn thêm). 1 ảnh lỗi/blocked KHÔNG làm hỏng cả batch — trả per-item.
  app.post(
    '/api/v1/media/save-from-chat-batch',
    { preHandler: requireGrant('media', 'create') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const userId = (user as any).userId ?? user.id;
      const body = request.body as { messageIds: string[]; visibility?: 'private' | 'public' };
      if (!body?.messageIds?.length) return reply.status(400).send({ error: 'messageIds required' });
      if (body.messageIds.length > 30) return reply.status(400).send({ error: 'Tối đa 30 ảnh/lần' });

      const results: SaveOneResult[] = [];
      for (const mid of body.messageIds) {
        results.push(await saveOneMessageToMedia({ orgId: user.orgId, userId, messageId: mid, visibility: body.visibility }));
      }
      const saved = results.filter((r) => r.status === 'ok');
      const blocked = results.filter((r) => r.status === 'blocked').length;
      const skipped = results.filter((r) => r.status === 'skipped').length;
      const failed = results.filter((r) => r.status === 'error').length;
      return {
        savedCount: saved.length,
        dedupedCount: saved.filter((r) => r.deduped).length,
        blocked, skipped, failed,
        assets: saved.map((r) => r.asset),
      };
    },
  );

  // ── POST /api/v1/media/:id/send — chèn 1 asset từ kho vào 1 hội thoại ──────
  app.post(
    '/api/v1/media/:id/send',
    { preHandler: requireGrant('media', 'access') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const userId = (user as any).userId ?? user.id;
      const { id } = request.params as { id: string };
      const body = request.body as { conversationId: string; caption?: string; addTags?: string[] };
      if (!body?.conversationId) return reply.status(400).send({ error: 'conversationId required' });

      // Asset phải thuộc org + (của mình HOẶC public HOẶC có view_all).
      const canViewAll = await userHasGrant(userId, 'media', 'view_all');
      const asset = await prisma.mediaAsset.findFirst({
        where: {
          id, orgId: user.orgId, archivedAt: null,
          ...(canViewAll ? {} : { OR: [{ ownerUserId: userId }, { visibility: 'public' }] }),
        },
        include: { blobs: { where: { variantType: { in: ['original', 'watermarked'] } } } },
      });
      if (!asset) return reply.status(404).send({ error: 'Không tìm thấy media trong kho' });
      // WATERMARK BẬT → gửi bản có logo; ngược lại gửi bản gốc. (Ảnh mới đóng dấu được.)
      const original = asset.blobs.find((b) => b.variantType === 'original');
      const watermarked = asset.blobs.find((b) => b.variantType === 'watermarked');
      const blob = (asset.kind === 'image' && asset.watermarkEnabled && watermarked) ? watermarked : original;
      if (!blob) return reply.status(400).send({ error: 'Media chưa có dữ liệu (đã xóa khỏi kho?)' });

      const conversation = await prisma.conversation.findFirst({
        where: { id: body.conversationId, orgId: user.orgId },
        include: { zaloAccount: true },
      });
      if (!conversation) return reply.status(404).send({ error: 'Không tìm thấy hội thoại' });
      // Multi-channel Phase 2 (2026-07-21): gửi media qua Zalo SDK → chỉ hội thoại Zalo.
      if (!conversation.zaloAccount || !conversation.zaloAccountId) {
        return reply.status(400).send({ error: 'Gửi media chỉ hỗ trợ hội thoại Zalo.', code: 'NOT_ZALO_CHANNEL' });
      }

      // T7b (YC2 2026-06-20): chặn gửi media qua nick ĐÃ XÓA (archivedAt) trước check kết nối.
      if (conversation.zaloAccount.archivedAt) {
        return reply.status(409).send({ error: 'Nick này đã bị xóa — chỉ xem lại lịch sử, không gửi được.', code: 'NICK_ARCHIVED' });
      }

      // Guard sớm: nick phải đang KẾT NỐI (status connected) — tránh treo khi nick
      // QR-pending/disconnected. zaloOps cũng check lại, nhưng báo sớm rõ hơn cho sale.
      const instance = zaloPool.getInstance(conversation.zaloAccountId);
      if (!instance?.api || instance.status !== 'connected') {
        return reply.status(400).send({
          error: 'Nick Zalo chưa kết nối (cần quét QR đăng nhập lại nick).',
          code: 'NICK_NOT_CONNECTED',
        });
      }

      // PRIVACY: nick Riêng tư → chỉ chính chủ gửi được (như chat-attachment).
      if (conversation.zaloAccount.privacyMode === 'main'
        && conversation.zaloAccount.ownerUserId !== userId) {
        return reply.status(403).send({ error: 'Nick Riêng tư — chỉ chính chủ gửi được.', code: 'PRIVACY_LOCKED' });
      }

      const limits = await zaloRateLimiter.checkLimits(conversation.zaloAccountId);
      if (!limits.allowed) return reply.status(429).send({ error: limits.reason });

      const threadId = conversation.externalThreadId || ''; // UID per-cặp-nick (điều 7)
      const threadType = conversation.threadType === 'group' ? 1 : 0;
      const io = (app as any).io as Server;
      const userFullName = await getUserFullName(user.id);
      const caption = body.caption ?? '';

      // GĐ1: tải object kho về temp → gửi từ local path (như chat hiện tại).
      // (GĐ3 sẽ tối ưu forward/cache per-nick — chưa làm ở GĐ1.)
      let tmp: { path: string; cleanup: () => Promise<void> } | null = null;
      try {
        // ẢNH/VIDEO: KHÔNG truyền filename (name "Lưu từ chat" không đuôi → temp mất đuôi →
        // Zalo coi ảnh thành FILE). Để downloadMediaToTemp lấy đuôi .webp/.mp4 từ URL.
        // FILE (pdf/excel/doc): BẮT BUỘC truyền tên thật + đuôi — zca-js lấy tên+đuôi khách
        // nhìn thấy từ basename temp; thiếu đuôi → "file lỗi". (anh báo 2026-06-12.)
        const sendName = asset.kind === 'file' ? buildSendFileName(asset, blob) : undefined;
        tmp = await downloadMediaToTemp({ url: blob.publicUrl, filename: sendName }, asset.kind);
        zaloRateLimiter.recordSend(conversation.zaloAccountId);

        // Guard nick connected ở trên. Gửi qua zaloOps (check status + reconnect).
        let zaloMsgId = '';
        let content = '';
        if (asset.kind === 'image') {
          // ẢNH: sendImage (đã fix có msg) → temp CÓ đuôi .webp → Zalo nhận ẢNH INLINE.
          const sendResult: any = await zaloOps.sendImage(
            conversation.zaloAccountId, threadId, threadType as 0 | 1, [tmp.path], io, caption,
          );
          zaloMsgId = String(sendResult?.msgId || sendResult?.data?.msgId || '');
          content = JSON.stringify({ href: blob.publicUrl, thumb: blob.publicUrl, size: blob.sizeBytes });
        } else if (asset.kind === 'video') {
          // VIDEO: gửi NATIVE (player + thumbnail + duration) như chat thường — KHÔNG sendFile
          // (sendFile làm video thành "file .mp4 tải về", mất player). Sinh thumbnail bằng ffmpeg,
          // mirror lên MinIO để lưu vào content. Native lỗi → fallback sendFile (vẫn gửi được).
          // (anh chốt 2026-06-12: video gửi từ kho phải đẹp như chat.)
          let thumbUrl: string = asset.thumbnailUrl ?? blob.publicUrl;
          let thumbPath: string | undefined;
          try {
            const gen = await generateThumbnail(tmp.path);
            thumbPath = gen.path;
            const thumbBuf = await readFile(gen.path);
            const up = await uploadBuffer(thumbBuf, 'image/jpeg', `${asset.name || 'video'}-thumb.jpg`);
            thumbUrl = up.url;
          } catch (e) {
            logger.warn('[media] video thumbnail gen failed (gửi từ kho):', (e as Error)?.message ?? e);
          }
          try {
            if (!instance?.api) throw new Error('nick api null');
            const sendResult: any = await sendNativeVideo({
              api: instance.api as any, videoPath: tmp.path, thumbnailPath: thumbPath,
              threadId, threadType: threadType as 0 | 1, message: caption,
            });
            zaloMsgId = String(sendResult?.msgId || sendResult?.data?.msgId || '');
          } catch (e) {
            logger.warn('[media] sendNativeVideo lỗi → fallback sendFile:', (e as Error)?.message ?? e);
            const sendResult: any = await zaloOps.sendFile(
              conversation.zaloAccountId, threadId, threadType as 0 | 1, [tmp.path], io, caption,
            );
            zaloMsgId = String(sendResult?.msgId || sendResult?.data?.msgId || '');
          }
          content = JSON.stringify({ href: blob.publicUrl, thumb: thumbUrl, thumbUrl, thumbnail: thumbUrl, size: blob.sizeBytes });
        } else {
          // FILE (pdf/excel/doc/zip): sendFile (zca-js đọc local path → đính kèm file).
          const sendResult: any = await zaloOps.sendFile(
            conversation.zaloAccountId, threadId, threadType as 0 | 1, [tmp.path], io, caption,
          );
          zaloMsgId = String(sendResult?.msgId || sendResult?.data?.msgId || '');
          content = JSON.stringify({ href: blob.publicUrl, name: asset.name, size: blob.sizeBytes, mime: blob.mimeType });
        }

        const msg = await createMediaMessage({
          conversationId: conversation.id,
          zaloAccount: conversation.zaloAccount,
          repliedByUserId: user.id,
          zaloMsgId,
          contentType: asset.kind as 'image' | 'video' | 'file',
          content,
          metadata: { sender: { kind: 'user_crm', name: userFullName } },
          sentVia: 'user',
        });

        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { lastMessageAt: new Date(), isReplied: true, unreadCount: 0 },
        });
        await bumpUsage(asset.id);
        // Gắn tag/dự án LÚC GỬI (anh chốt 2026-06-15): sale bấm chip gợi ý → tag dính vào ảnh,
        // bữa sau tìm lại dễ. Ghi tag TỰ DO (ai gửi cũng thêm được, kể cả ảnh công khai của
        // sale khác — Anh chốt ưu tiên tag phong phú cho ảnh dùng chung, KHÁC scope owner của
        // PATCH /:id và /bulk; CHỈ áp cho addTags lúc gửi, KHÔNG nới quyền sửa tên/visibility).
        if (Array.isArray(body.addTags) && body.addTags.length) {
          const merged = normalizeTags([...(asset.tagIds ?? []), ...body.addTags]);
          await prisma.mediaAsset.update({ where: { id: asset.id }, data: { tagIds: merged } });
        }
        await logMediaUsage({
          orgId: user.orgId, mediaAssetId: asset.id, eventType: 'sent_chat',
          userId, conversationId: conversation.id,
          meta: { watermarked: blob.variantType === 'watermarked', taggedOnSend: (body.addTags?.length ?? 0) > 0 },
        });

        await emitChatMessage({
          io,
          orgId: user.orgId,
          accountId: conversation.zaloAccountId,
          conversationId: conversation.id,
          message: msg,
          privacyMode: conversation.zaloAccount.privacyMode,
          ownerUserId: conversation.zaloAccount.ownerUserId,
        });
        return { message: msg };
      } catch (err: any) {
        logger.error('[media] send error:', err);
        return reply.status(500).send({ error: err?.message ?? 'send failed' });
      } finally {
        await tmp?.cleanup().catch(() => {});
      }
    },
  );

  // ── PATCH /api/v1/media/:id — sửa quyền/tên/tag (GĐ2) ──────────────────────
  app.patch(
    '/api/v1/media/:id',
    { preHandler: requireGrant('media', 'edit') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const userId = (user as any).userId ?? user.id;
      const { id } = request.params as { id: string };
      const body = request.body as {
        name?: string; visibility?: 'private' | 'public';
        tagIds?: string[]; folderId?: string | null; confirmShare?: boolean;
      };

      const canViewAll = await userHasGrant(userId, 'media', 'view_all');
      const asset = await prisma.mediaAsset.findFirst({
        where: { id, orgId: user.orgId, archivedAt: null, ...(canViewAll ? {} : { ownerUserId: userId }) },
      });
      if (!asset) return reply.status(404).send({ error: 'Không tìm thấy media (hoặc không thuộc bạn)' });

      // PRIVACY (D11 — anh chốt 2026-06-12: HỎI XÁC NHẬN thay vì chặn cứng):
      // Ảnh lưu từ nick Riêng tư → chuyển Công khai PHẢI kèm confirmShare=true (FE đã hiện
      // dialog "có thể chứa thông tin khách — chắc chắn chia sẻ?"). Thiếu → trả NEED_CONFIRM.
      // 2026-06-15: đọc CỜ sourceIsPrivateNick (KHÔNG suy từ sourceZaloAccountId — nick thường
      // giờ cũng có id nguồn nhưng không phải Riêng tư, không được bắt xác nhận oan).
      const sharingPrivateNickAsset = body.visibility === 'public' && asset.sourceIsPrivateNick;
      if (sharingPrivateNickAsset && !body.confirmShare) {
        return reply.status(409).send({
          error: 'Ảnh lưu từ nick Riêng tư — cần xác nhận trước khi chia sẻ Công khai.',
          code: 'NEED_SHARE_CONFIRM',
        });
      }

      // Gỡ liên kết cũ phải chạy TRƯỚC khi ghi folderId mới, vì unmirror đọc thư mục hiện
      // tại từ DB để biết gỡ ở đâu.
      const movingFolder = body.folderId !== undefined && body.folderId !== asset.folderId;
      if (movingFolder) await unmirrorAssetFromFolder(user.orgId, id);

      const updated = await prisma.mediaAsset.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.visibility !== undefined ? { visibility: body.visibility } : {}),
          ...(body.tagIds !== undefined ? { tagIds: normalizeTags(body.tagIds) } : {}),
          ...(body.folderId !== undefined ? { folderId: body.folderId } : {}),
        },
      });

      // Fire-and-forget: hỏng thư mục đĩa không được làm hỏng lần sửa.
      if (movingFolder && body.folderId) void mirrorAssetIntoFolder(user.orgId, id, body.folderId);

      // AUDIT privacy (S8): chuyển sang Công khai → ghi log (đặc biệt ảnh từ nick Riêng tư).
      if (body.visibility === 'public') {
        logger.info(`[media][audit] make_public asset=${id} user=${userId} fromPrivateNick=${asset.sourceIsPrivateNick}`);
        await logMediaUsage({
          orgId: user.orgId, mediaAssetId: id, eventType: 'made_public', userId,
          meta: { fromPrivateNick: asset.sourceIsPrivateNick, confirmed: !!body.confirmShare },
        });
      }
      return { asset: { id: updated.id, name: updated.name, visibility: updated.visibility, tagIds: updated.tagIds } };
    },
  );

  // ── PATCH /api/v1/media/bulk — gán folder / tag HÀNG LOẠT (GĐ12 multi-select) ─
  // Chỉ áp cho asset active CỦA MÌNH (hoặc view_all). KHÔNG đổi visibility ở bulk (tránh
  // vô tình chia sẻ ảnh nick Riêng tư — privacy; đổi visibility vẫn qua PATCH /:id đơn lẻ
  // có cổng confirmShare D11). folderId=null = bỏ khỏi thư mục.
  app.patch(
    '/api/v1/media/bulk',
    { preHandler: requireGrant('media', 'edit') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const userId = (user as any).userId ?? user.id;
      const body = request.body as { ids: string[]; folderId?: string | null; addTags?: string[] };
      if (!Array.isArray(body?.ids) || body.ids.length === 0) {
        return reply.status(400).send({ error: 'Thiếu danh sách ảnh (ids)' });
      }
      if (body.ids.length > 200) return reply.status(400).send({ error: 'Tối đa 200 mục/lần' });
      const canViewAll = await userHasGrant(userId, 'media', 'view_all');

      // Chỉ lấy asset active thuộc phạm vi cho phép → chống sửa của người khác / đồ đã xóa.
      const scoped = await prisma.mediaAsset.findMany({
        where: {
          id: { in: body.ids }, orgId: user.orgId, archivedAt: null,
          ...(canViewAll ? {} : { ownerUserId: userId }),
        },
        select: { id: true, tagIds: true },
      });
      if (scoped.length === 0) return reply.status(404).send({ error: 'Không có mục hợp lệ để cập nhật' });

      // Gán folder: 1 update chung cho tất cả (cùng giá trị).
      if (body.folderId !== undefined) {
        // Như PATCH /:id: gỡ liên kết cũ trước khi ghi folderId mới, đặt liên kết mới sau.
        for (const a of scoped) await unmirrorAssetFromFolder(user.orgId, a.id);

        await prisma.mediaAsset.updateMany({
          where: { id: { in: scoped.map((a) => a.id) } },
          data: { folderId: body.folderId },
        });

        if (body.folderId) {
          const target = body.folderId;
          for (const a of scoped) void mirrorAssetIntoFolder(user.orgId, a.id, target);
        }
      }
      // Gán thêm tag: hợp nhất tag mới vào tag cũ per-asset (không ghi đè tag đang có).
      // normalizeTags: lowercase + dedup (gộp tag/dự án, không phân biệt hoa/thường — 2026-06-15).
      if (body.addTags && body.addTags.length) {
        const clean = normalizeTags(body.addTags);
        for (const a of scoped) {
          const merged = normalizeTags([...(a.tagIds ?? []), ...clean]);
          await prisma.mediaAsset.update({ where: { id: a.id }, data: { tagIds: merged } });
        }
      }
      logger.info(`[media][audit] bulk_update user=${userId} count=${scoped.length} folder=${body.folderId !== undefined} tags=${body.addTags?.length ?? 0}`);
      return { ok: true, updated: scoped.length };
    },
  );

  // ── DELETE /api/v1/media/:id — vào THÙNG RÁC (xóa MỀM, giữ object MinIO) ────
  // GĐ13a (2026-06-12): archivedAt = dấu thùng rác. grant 'edit' đủ (sale xóa ảnh CỦA MÌNH).
  // Xóa của người khác cần view_all (admin). Ghi trashedById để audit + scope khôi phục.
  app.delete(
    '/api/v1/media/:id',
    { preHandler: requireGrant('media', 'edit') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const userId = (user as any).userId ?? user.id;
      const { id } = request.params as { id: string };
      const canViewAll = await userHasGrant(userId, 'media', 'view_all');
      // Kho Lưu Trữ 2026-07-22: tệp riêng tư của tab Kho KHÔNG cho view_all xoá hộ —
      // chỉ chủ tệp hoặc Chủ tài khoản. (Kho chung giữ nguyên luật cũ.)
      const asset = await prisma.mediaAsset.findFirst({
        where: {
          id, orgId: user.orgId, archivedAt: null,
          ...(isOrgOwner(user)
            ? {}
            : canViewAll
              ? { OR: [{ storageScope: 'catalog' }, { ownerUserId: userId }] }
              : { ownerUserId: userId }),
        },
      });
      if (!asset) return reply.status(404).send({ error: 'Không tìm thấy media' });
      // INVARIANT: chỉ vào thùng rác, KHÔNG xóa object MinIO (giữ lịch sử chat cũ trỏ tới).
      await prisma.mediaAsset.update({ where: { id }, data: { archivedAt: new Date(), trashedById: userId } });
      // Gỡ TÊN khỏi thư mục đĩa để cây thư mục không hiện tệp đã bỏ vào thùng rác.
      // Byte kho phẳng GIỮ NGUYÊN → khôi phục lại được.
      void unmirrorAssetFromFolder(user.orgId, id);
      logger.info(`[media][audit] trash asset=${id} user=${userId}`);
      return { ok: true };
    },
  );

  // ── GET /api/v1/media/download — tải file kho kèm ĐÚNG TÊN (2026-06-13, anh báo) ──────
  // Kho lưu object media/{hash}.ext → mở thẳng URL = tải về tên-hash. Endpoint proxy stream
  // file + Content-Disposition filename="tên thật" → trình duyệt tải đúng tên (như Zalo real).
  // Query: url (public URL kho) + name (tên hiển thị). Auth qua authMiddleware (hook preHandler).
  app.get(
    '/api/v1/media/download',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const q = request.query as { url?: string; name?: string };
      if (!q.url) return reply.status(400).send({ error: 'Thiếu url' });
      const key = keyFromPublicUrl(q.url);
      if (!key) return reply.status(400).send({ error: 'URL không thuộc kho' });
      // BUFFER (không pipe stream) — pipe MinIO-stream vào reply đôi khi TREO (socket hang up,
      // anh gặp 2 file). Đọc hết thành Buffer rồi send → ổn định, file kho nhỏ vài MB.
      const buf = await getObjectBuffer(key);
      if (!buf) return reply.status(404).send({ error: 'Không tìm thấy tệp' });
      // Tên tải về: name truyền lên (đã có đuôi) → fallback basename của key. Lọc ký tự cấm header.
      const rawName = (q.name && q.name.trim()) || decodeURIComponent(key.split('/').pop() || 'tep');
      // Dữ liệu cũ có ảnh bị nén thành WebP nhưng tên vẫn giữ đuôi .png, tải về Photoshop
      // và Word báo hỏng vì chúng tin vào đuôi. Lấy đuôi thật từ mimeType của blob.
      const blob = await prisma.mediaBlob.findFirst({
        where: { orgId: request.user!.orgId, minioKey: key },
        select: { mimeType: true },
      });
      const trueExt = blob ? mimeToExt(blob.mimeType) : '';
      const named = trueExt && !rawName.toLowerCase().endsWith(trueExt)
        ? `${rawName.replace(/\.[A-Za-z0-9]{1,8}$/, '')}${trueExt}`
        : rawName;
      const safeName = named.replace(/["\r\n]/g, '').slice(0, 200);
      // RFC5987 cho tên Unicode (tiếng Việt) — filename* để trình duyệt giữ dấu.
      reply
        .header('Content-Disposition', `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`)
        .header('Content-Type', 'application/octet-stream')
        .header('Content-Length', String(buf.length))
        .header('Cache-Control', 'private, max-age=0');
      return reply.send(buf);
    },
  );

  // ── GET /api/v1/media/trash — danh sách asset trong thùng rác ──────────────
  // GĐ13a: chỉ asset archivedAt != null. Scope owner (sale) / view_all (admin). Có limit+cursor.
  // Trả thêm archivedAt + trashedById + daysUntilPurge (30 - số ngày đã trong thùng).
  app.get(
    '/api/v1/media/trash',
    { preHandler: requireGrant('media', 'access') },
    async (request: FastifyRequest) => {
      const user = request.user!;
      const userId = (user as any).userId ?? user.id;
      const q = request.query as { kind?: string; limit?: string; cursor?: string };
      const canViewAll = await userHasGrant(userId, 'media', 'view_all');
      const limit = Math.min(parseInt(q.limit ?? '60', 10) || 60, 200);

      const where: any = {
        orgId: user.orgId,
        archivedAt: { not: null },
        ...(canViewAll ? {} : { ownerUserId: userId }),
        ...(q.kind ? { kind: q.kind } : {}),
      };
      const assets = await prisma.mediaAsset.findMany({
        where,
        orderBy: [{ archivedAt: 'desc' }, { id: 'asc' }],
        take: limit + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
        include: { blobs: { where: { variantType: 'original' }, take: 1 } },
      });
      const hasMore = assets.length > limit;
      const page = hasMore ? assets.slice(0, limit) : assets;
      const now = Date.now();
      const items = page.map((a) => {
        const archivedMs = a.archivedAt ? a.archivedAt.getTime() : now;
        const daysInTrash = Math.floor((now - archivedMs) / 86400000);
        return {
          id: a.id, kind: a.kind, name: a.name, originalFilename: a.originalFilename,
          thumbnailUrl: a.thumbnailUrl, visibility: a.visibility, tagIds: a.tagIds,
          sizeBytes: a.blobs[0]?.sizeBytes ?? null, durationSec: a.blobs[0]?.durationSec ?? null,
          archivedAt: a.archivedAt, trashedById: a.trashedById,
          daysUntilPurge: Math.max(0, TRASH_RETENTION_DAYS - daysInTrash),
        };
      });
      return { items, nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null };
    },
  );

  // ── POST /api/v1/media/:id/restore — khôi phục từ thùng rác về kho ─────────
  // GĐ13a: archivedAt về null + clear trashedById. Scope như DELETE (chủ / view_all).
  app.post(
    '/api/v1/media/:id/restore',
    { preHandler: requireGrant('media', 'edit') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const userId = (user as any).userId ?? user.id;
      const { id } = request.params as { id: string };
      const canViewAll = await userHasGrant(userId, 'media', 'view_all');
      const asset = await prisma.mediaAsset.findFirst({
        where: { id, orgId: user.orgId, archivedAt: { not: null }, ...(canViewAll ? {} : { ownerUserId: userId }) },
      });
      if (!asset) return reply.status(404).send({ error: 'Không tìm thấy media trong thùng rác' });
      await prisma.mediaAsset.update({ where: { id }, data: { archivedAt: null, trashedById: null } });
      // Bỏ vào thùng rác đã gỡ tên khỏi thư mục đĩa nên khôi phục phải đặt lại.
      if (asset.folderId) void mirrorAssetIntoFolder(user.orgId, id, asset.folderId);
      logger.info(`[media][audit] restore asset=${id} user=${userId}`);
      return { ok: true };
    },
  );

  // ── DELETE /api/v1/media/:id/permanent — xóa cứng 1 asset NGAY ─────────────
  // GĐ13a: cần grant media.delete (mạnh hơn edit). BẮT BUỘC asset đang ở thùng rác
  // (archivedAt != null) — chặn bypass xóa cứng asset active. KHÔNG đụng byte MinIO.
  app.delete(
    '/api/v1/media/:id/permanent',
    { preHandler: requireGrant('media', 'delete') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const userId = (user as any).userId ?? user.id;
      const { id } = request.params as { id: string };
      const canViewAll = await userHasGrant(userId, 'media', 'view_all');
      const asset = await prisma.mediaAsset.findFirst({
        where: { id, orgId: user.orgId, archivedAt: { not: null }, ...(canViewAll ? {} : { ownerUserId: userId }) },
      });
      if (!asset) return reply.status(404).send({ error: 'Chỉ xóa vĩnh viễn được media đang trong thùng rác' });
      // Cascade Prisma: xóa asset → blob + album_item + usage_event tự xóa. KHÔNG xóa byte MinIO.
      await prisma.mediaAsset.delete({ where: { id } });
      logger.info(`[media][audit] permanent_delete asset=${id} user=${userId} (DB only, MinIO byte giữ)`);
      return { ok: true };
    },
  );

  // ── DELETE /api/v1/media/trash/empty — dọn sạch thùng rác (DB) ─────────────
  // GĐ13a: cần grant media.delete. Sale xóa của mình; admin (view_all) xóa cả org.
  // Batch theo cap để không khóa DB lâu. KHÔNG đụng byte MinIO.
  app.delete(
    '/api/v1/media/trash/empty',
    { preHandler: requireGrant('media', 'delete') },
    async (request: FastifyRequest) => {
      const user = request.user!;
      const userId = (user as any).userId ?? user.id;
      const canViewAll = await userHasGrant(userId, 'media', 'view_all');
      const where: any = {
        orgId: user.orgId, archivedAt: { not: null },
        ...(canViewAll ? {} : { ownerUserId: userId }),
      };
      // Lấy id theo cap (deterministic) rồi xóa — tránh deleteMany ôm nghìn hàng 1 phát.
      const victims = await prisma.mediaAsset.findMany({
        where, select: { id: true }, orderBy: [{ archivedAt: 'asc' }, { id: 'asc' }], take: TRASH_EMPTY_BATCH,
      });
      if (victims.length === 0) return { ok: true, deleted: 0, hasMore: false };
      await prisma.mediaAsset.deleteMany({ where: { id: { in: victims.map((v) => v.id) } } });
      logger.info(`[media][audit] empty_trash user=${userId} deleted=${victims.length} (DB only)`);
      return { ok: true, deleted: victims.length, hasMore: victims.length === TRASH_EMPTY_BATCH };
    },
  );

  // ── POST /api/v1/media/:id/annotate — lưu bản annotated từ FE canvas (base64) ─
  app.post(
    '/api/v1/media/:id/annotate',
    { preHandler: requireGrant('media', 'edit') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const userId = (user as any).userId ?? user.id;
      const { id } = request.params as { id: string };
      const body = (request.body ?? {}) as { imageBase64?: string; mimeType?: string };

      const canViewAll = await userHasGrant(userId, 'media', 'view_all');
      const asset = await prisma.mediaAsset.findFirst({
        where: {
          id, orgId: user.orgId, archivedAt: null,
          ...(canViewAll ? {} : { OR: [{ ownerUserId: userId }, { visibility: 'public' }] }),
        },
        select: { id: true, kind: true },
      });
      if (!asset) return reply.status(404).send({ error: 'Không tìm thấy media' });
      if (asset.kind !== 'image') return reply.status(400).send({ error: 'Chỉ ảnh mới annotate được' });

      const raw = (body.imageBase64 || '').trim();
      if (!raw) return reply.status(400).send({ error: 'imageBase64 required' });
      // Accept data URL or raw base64
      const m = raw.match(/^data:([^;]+);base64,(.+)$/);
      const mimeType = m?.[1] || body.mimeType || 'image/png';
      const b64 = m?.[2] || raw;
      let buffer: Buffer;
      try {
        buffer = Buffer.from(b64, 'base64');
      } catch {
        return reply.status(400).send({ error: 'imageBase64 không hợp lệ' });
      }
      if (buffer.length < 32) return reply.status(400).send({ error: 'Ảnh annotate rỗng' });
      if (buffer.length > 25 * 1024 * 1024) return reply.status(400).send({ error: 'Ảnh annotate quá lớn (tối đa 25MB)' });

      try {
        const res = await saveAnnotatedVariant({
          orgId: user.orgId, assetId: id, buffer, mimeType,
        });
        return { blobId: res.blobId, url: res.url, width: res.width, height: res.height };
      } catch (err: any) {
        logger.error('[media] annotate error:', err);
        return reply.status(400).send({ error: err?.message ?? 'annotate failed' });
      }
    },
  );

  // ── POST /api/v1/media/:id/watermark — đóng dấu logo HS (sinh variant) ─────
  app.post(
    '/api/v1/media/:id/watermark',
    { preHandler: requireGrant('media', 'edit') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const userId = (user as any).userId ?? user.id;
      const { id } = request.params as { id: string };
      const body = (request.body ?? {}) as { position?: any; opacity?: number };

      const canViewAll = await userHasGrant(userId, 'media', 'view_all');
      const asset = await prisma.mediaAsset.findFirst({
        where: { id, orgId: user.orgId, archivedAt: null, ...(canViewAll ? {} : { ownerUserId: userId }) },
        select: { id: true },
      });
      if (!asset) return reply.status(404).send({ error: 'Không tìm thấy media' });
      try {
        const res = await generateWatermarkVariant({
          orgId: user.orgId, assetId: id, position: body.position, opacity: body.opacity,
        });
        return { blobId: res.blobId, url: res.url };
      } catch (err: any) {
        logger.error('[media] watermark error:', err);
        return reply.status(400).send({ error: err?.message ?? 'watermark failed' });
      }
    },
  );

  // ── DELETE /api/v1/media/:id/watermark — TẮT watermark (gửi lại ảnh gốc) ────
  app.delete(
    '/api/v1/media/:id/watermark',
    { preHandler: requireGrant('media', 'edit') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const userId = (user as any).userId ?? user.id;
      const { id } = request.params as { id: string };
      const canViewAll = await userHasGrant(userId, 'media', 'view_all');
      const asset = await prisma.mediaAsset.findFirst({
        where: { id, orgId: user.orgId, archivedAt: null, ...(canViewAll ? {} : { ownerUserId: userId }) },
        select: { id: true },
      });
      if (!asset) return reply.status(404).send({ error: 'Không tìm thấy media' });
      try {
        await disableWatermark(user.orgId, id);
        return { ok: true };
      } catch (err: any) {
        logger.error('[media] disable watermark error:', err);
        return reply.status(400).send({ error: err?.message ?? 'disable watermark failed' });
      }
    },
  );

  // ── GET /api/v1/media/folders — cây thư mục (scope owner + visibility) ─────
  app.get(
    '/api/v1/media/folders',
    { preHandler: requireGrant('media', 'access') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const userId = (user as any).userId ?? user.id;
      const canViewAll = await userHasGrant(userId, 'media', 'view_all');
      const folders = await prisma.mediaAlbum.findMany({
        where: {
          orgId: user.orgId,
          ...(canViewAll || isOrgOwner(user)
            ? {}
            : { OR: [{ ownerUserId: userId }, { visibility: 'public' }] }),
        },
        orderBy: { name: 'asc' },
        // FE tự dựng cây từ danh sách phẳng này bằng parentId.
        select: {
          id: true, name: true, kind: true, visibility: true,
          ownerUserId: true, diskSlug: true, parentId: true,
        },
      });
      return { folders };
    },
  );

  // ── POST /api/v1/media/folders — tạo thư mục ──────────────────────────────
  // Cùng grant với upload vì ai tải tệp lên được thì phải tạo được thư mục để xếp tệp.
  app.post(
    '/api/v1/media/folders',
    { preHandler: requireGrant('media', 'create') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const userId = (user as any).userId ?? user.id;
      const body = request.body as { name: string; visibility?: 'private' | 'public'; parentId?: string | null };
      if (!body?.name?.trim()) return reply.status(400).send({ error: 'Tên thư mục bắt buộc' });

      // kind='folder' để không cho lồng vào bộ sưu tập Yêu thích.
      const parentId = body.parentId?.trim() || null;
      if (parentId) {
        const parent = await prisma.mediaAlbum.findFirst({
          where: { id: parentId, orgId: user.orgId, kind: 'folder' },
          select: { id: true },
        });
        if (!parent) return reply.status(404).send({ error: 'Không tìm thấy thư mục cha' });
        if ((await folderDepth(user.orgId, parentId)) >= MAX_FOLDER_DEPTH) {
          return reply.status(400).send({ error: `Thư mục lồng quá sâu (tối đa ${MAX_FOLDER_DEPTH} cấp)` });
        }
      }

      // "Việt Nam" và "việt nam" ra chung một thư mục đĩa, nên thà báo lỗi còn hơn lặng lẽ
      // đẻ "viet_nam_2" khiến tên trên đĩa hết đối chiếu được với tên trong kho.
      // Trả kèm thư mục đang chiếm tên để bên tải-cả-thư-mục dùng lại thay vì báo hỏng.
      const clash = await findSiblingWithSameName(user.orgId, parentId, body.name.trim());
      if (clash) {
        return reply.status(409).send({
          error: `Đã có thư mục tên "${clash.name}" ở đây rồi`,
          code: 'FOLDER_NAME_TAKEN',
          folder: { id: clash.id, name: clash.name },
        });
      }

      const folder = await prisma.mediaAlbum.create({
        data: {
          orgId: user.orgId,
          name: body.name.trim(),
          kind: 'folder',
          visibility: body.visibility ?? 'private',
          ownerUserId: userId,
          createdById: userId,
          parentId,
        },
      });
      // ĐỢI mkdir (không fire-and-forget): FE hiện tên thư mục đĩa ngay sau khi tạo, và
      // mkdir chỉ tốn vài ms. Lỗi đĩa KHÔNG làm hỏng việc tạo thư mục trong kho (hàm tự nuốt).
      const diskSlug = await createFolderOnDisk(folder.id, folder.name, parentId);
      return { folder: { id: folder.id, name: folder.name, diskSlug, parentId } };
    },
  );

  // ── PATCH /api/v1/media/folders/:id — đổi tên thư mục (kéo theo thư mục đĩa) ──
  app.patch(
    '/api/v1/media/folders/:id',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const userId = (user as any).userId ?? user.id;
      const { id } = request.params as { id: string };
      const body = (request.body ?? {}) as { name?: string };
      if (!body.name?.trim()) return reply.status(400).send({ error: 'Tên thư mục bắt buộc' });

      // Chỉ chủ thư mục (hoặc Chủ tài khoản) mới đổi tên được.
      const folder = await prisma.mediaAlbum.findFirst({
        where: { id, orgId: user.orgId, ...(isOrgOwner(user) ? {} : { ownerUserId: userId }) },
        select: { id: true, parentId: true },
      });
      if (!folder) return reply.status(404).send({ error: 'Không tìm thấy thư mục' });

      // Đổi tên cũng phải né trùng tên anh em, nếu không sẽ lách được luật chặn lúc tạo.
      const clash = await findSiblingWithSameName(user.orgId, folder.parentId, body.name.trim(), folder.id);
      if (clash) {
        return reply.status(409).send({
          error: `Đã có thư mục tên "${clash.name}" ở đây rồi`,
          code: 'FOLDER_NAME_TAKEN',
          folder: { id: clash.id, name: clash.name },
        });
      }

      const updated = await prisma.mediaAlbum.update({
        where: { id: folder.id }, data: { name: body.name.trim() },
      });
      await renameFolderOnDisk(user.orgId, folder.id, updated.name);
      const after = await prisma.mediaAlbum.findUnique({
        where: { id: folder.id }, select: { diskSlug: true },
      });
      return { folder: { id: updated.id, name: updated.name, diskSlug: after?.diskSlug ?? null } };
    },
  );

  // ── DELETE /api/v1/media/folders/:id — xoá thư mục (kéo theo thư mục đĩa) ──
  // Tệp bên trong KHÔNG mất: MediaAsset.folderId SetNull (schema), byte kho phẳng giữ nguyên.
  // Chỉ các LIÊN KẾT trong thư mục đĩa bị gỡ (force=true).
  // FK cascade tự dọn thư mục con trong DB, nhưng tệp bên trong chúng phải tự trả về
  // "không thư mục" trước, nếu không sẽ giữ folderLinkName trỏ vào thư mục đã biến mất.
  app.delete(
    '/api/v1/media/folders/:id',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const userId = (user as any).userId ?? user.id;
      const { id } = request.params as { id: string };
      const folder = await prisma.mediaAlbum.findFirst({
        where: { id, orgId: user.orgId, kind: 'folder', ...(isOrgOwner(user) ? {} : { ownerUserId: userId }) },
        select: { id: true },
      });
      if (!folder) return reply.status(404).send({ error: 'Không tìm thấy thư mục' });

      // Cả cây: chính nó + con cháu. rm -r ở thư mục gốc của cây đã dọn hết đĩa một lượt.
      const treeIds = [folder.id, ...(await collectDescendantIds(user.orgId, folder.id))];
      await deleteFolderOnDisk(user.orgId, folder.id, true);
      await prisma.mediaAsset.updateMany({
        where: { orgId: user.orgId, folderId: { in: treeIds } },
        data: { folderId: null, folderLinkName: null },
      });
      await prisma.mediaAlbum.delete({ where: { id: folder.id } }); // cascade xoá thư mục con
      logger.info(`[media][audit] delete_folder tree=${treeIds.length} root=${folder.id} user=${userId}`);
      return { ok: true };
    },
  );

  // ── GET /api/v1/media/suggest?conversationId= — gợi ý ảnh theo NGỮ CẢNH (GĐ3a-4)
  // Match MediaAsset.tagIds với tag/dự án của Contact đang chat. Chỉ ảnh CÔNG KHAI
  // hoặc CỦA CHÍNH sale (không lộ ảnh riêng tư người khác — privacy).
  app.get(
    '/api/v1/media/suggest',
    { preHandler: requireGrant('media', 'access') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const userId = (user as any).userId ?? user.id;
      const q = request.query as { conversationId?: string };
      if (!q.conversationId) return { items: [], matchedTags: [], contactTags: [] };

      const conv = await prisma.conversation.findFirst({
        where: { id: q.conversationId, orgId: user.orgId },
        include: { contact: { select: { tags: true, autoTags: true } } },
      });
      if (!conv?.contact) return { items: [], matchedTags: [], contactTags: [] };

      // Gom tag khách (manual + auto, lowercase). Bỏ prefix 'auto:'.
      const raw = [
        ...(Array.isArray(conv.contact.tags) ? conv.contact.tags : []),
        ...(Array.isArray(conv.contact.autoTags) ? conv.contact.autoTags : []),
      ].map((t) => String(t).replace(/^auto:/, '').trim().toLowerCase()).filter(Boolean);
      const custTags = [...new Set(raw)];
      // 2026-06-20 (anh chốt): GỠ phần gợi-ý-ẢNH (items) — gợi ý không đúng + sale không dùng.
      // GIỮ contactTags để MediaSendPicker hiện chip "tag khách" khi sale gửi ảnh (vẫn dùng).
      // items/matchedTags trả rỗng để KHÔNG vỡ type FE cũ.
      void userId;
      return { items: [], matchedTags: [], contactTags: custTags };
    },
  );

  // ── GET /api/v1/media/tags — danh sách tag đang dùng (autocomplete) ─────────
  // 2026-06-15: gom tag distinct từ MediaAsset.tagIds (scope owner + public), kèm số lượng,
  // xếp theo phổ biến. Dùng cho autocomplete ô tag (panel chi tiết) + chip "tag hay dùng"
  // lúc gửi khi khách chưa có tag (empty-state). unnest mảng tagIds bằng raw SQL.
  app.get(
    '/api/v1/media/tags',
    { preHandler: requireGrant('media', 'access') },
    async (request: FastifyRequest) => {
      const user = request.user!;
      const userId = (user as any).userId ?? user.id;
      const q = request.query as { limit?: string };
      const limit = Math.min(parseInt(q.limit ?? '50', 10) || 50, 200);
      const canViewAll = await userHasGrant(userId, 'media', 'view_all');
      // Scope: view_all → cả org; thường → tag của ảnh mình HOẶC ảnh công khai (không lộ
      // tag riêng tư của sale khác). archived bỏ qua. Tag đã lowercase sẵn khi ghi.
      const rows = await prisma.$queryRaw<Array<{ tag: string; count: bigint }>>`
        SELECT lower(tag) AS tag, COUNT(*)::bigint AS count
        FROM "media_assets", unnest("tag_ids") AS tag
        WHERE "org_id" = ${user.orgId}
          AND "archived_at" IS NULL
          ${canViewAll ? Prisma.empty : Prisma.sql`AND ("owner_user_id" = ${userId} OR "visibility" = 'public')`}
        GROUP BY lower(tag)
        ORDER BY count DESC, tag ASC
        LIMIT ${limit}
      `;
      return { tags: rows.map((r) => ({ tag: r.tag, count: Number(r.count) })) };
    },
  );

  // ── GET /api/v1/media/stats — top ảnh hay dùng + tổng quan (GĐ4 đo hiệu quả) ──
  app.get(
    '/api/v1/media/stats',
    { preHandler: requireGrant('media', 'access') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const userId = (user as any).userId ?? user.id;
      const canViewAll = await userHasGrant(userId, 'media', 'view_all');
      const scope = canViewAll ? {} : { OR: [{ ownerUserId: userId }, { visibility: 'public' }] };

      // Top 10 ảnh dùng nhiều nhất.
      const top = await prisma.mediaAsset.findMany({
        where: { orgId: user.orgId, archivedAt: null, usageCount: { gt: 0 }, ...scope },
        orderBy: { usageCount: 'desc' },
        take: 10,
        include: { blobs: { where: { variantType: 'original' }, take: 1 } },
      });

      // Tổng quan: số asset, tổng lượt dùng, ước lượng tiết kiệm (số blob vs số lần dùng).
      const totalAssets = await prisma.mediaAsset.count({ where: { orgId: user.orgId, archivedAt: null, ...scope } });
      const agg = await prisma.mediaAsset.aggregate({
        where: { orgId: user.orgId, archivedAt: null, ...scope },
        _sum: { usageCount: true },
      });
      const totalUsage = agg._sum.usageCount ?? 0;

      return {
        totalAssets,
        totalUsage,
        topUsed: top.map((a) => ({
          id: a.id, name: a.name, kind: a.kind, usageCount: a.usageCount,
          thumbnailUrl: a.thumbnailUrl ?? a.blobs[0]?.publicUrl ?? null,
        })),
      };
    },
  );

  // ── Bộ sưu tập YÊU THÍCH cá nhân (GĐ5) — MediaAlbum kind='favorite', 1/user ─
  async function getOrCreateFavoriteAlbum(orgId: string, userId: string) {
    let fav = await prisma.mediaAlbum.findFirst({ where: { orgId, ownerUserId: userId, kind: 'favorite' } });
    if (!fav) {
      fav = await prisma.mediaAlbum.create({
        data: { orgId, name: '⭐ Yêu thích của tôi', kind: 'favorite', visibility: 'private', ownerUserId: userId, createdById: userId },
      });
    }
    return fav;
  }

  // POST /media/:id/favorite — toggle yêu thích (thêm/bỏ khỏi bộ sưu tập cá nhân).
  app.post(
    '/api/v1/media/:id/favorite',
    { preHandler: requireGrant('media', 'access') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const userId = (user as any).userId ?? user.id;
      const { id } = request.params as { id: string };
      // asset phải thuộc org + thấy được (của mình hoặc public).
      const canViewAll = await userHasGrant(userId, 'media', 'view_all');
      const asset = await prisma.mediaAsset.findFirst({
        where: { id, orgId: user.orgId, archivedAt: null, ...(canViewAll ? {} : { OR: [{ ownerUserId: userId }, { visibility: 'public' }] }) },
        select: { id: true },
      });
      if (!asset) return reply.status(404).send({ error: 'Không tìm thấy media' });

      const fav = await getOrCreateFavoriteAlbum(user.orgId, userId);
      const existing = await prisma.mediaAlbumItem.findUnique({
        where: { albumId_mediaAssetId: { albumId: fav.id, mediaAssetId: id } },
      });
      if (existing) {
        await prisma.mediaAlbumItem.delete({ where: { id: existing.id } });
        return { favorited: false };
      }
      await prisma.mediaAlbumItem.create({ data: { albumId: fav.id, mediaAssetId: id } });
      return { favorited: true };
    },
  );

  // GET /media/favorites — danh sách ảnh yêu thích của user.
  app.get(
    '/api/v1/media/favorites',
    { preHandler: requireGrant('media', 'access') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const userId = (user as any).userId ?? user.id;
      const fav = await prisma.mediaAlbum.findFirst({ where: { orgId: user.orgId, ownerUserId: userId, kind: 'favorite' } });
      if (!fav) return { items: [] };
      const items = await prisma.mediaAlbumItem.findMany({
        where: { albumId: fav.id, asset: { archivedAt: null } },
        include: { asset: { include: { blobs: { where: { variantType: 'original' }, take: 1 } } } },
        orderBy: { createdAt: 'desc' },
        take: 40,
      });
      return {
        items: items.map(({ asset: a }) => ({
          id: a.id, name: a.name, kind: a.kind, visibility: a.visibility,
          url: a.blobs[0]?.publicUrl ?? null,
          thumbnailUrl: a.thumbnailUrl ?? a.blobs[0]?.publicUrl ?? null,
          usageCount: a.usageCount,
        })),
      };
    },
  );

  // POST /media/album/send — gửi NHIỀU asset (cả album) vào 1 hội thoại 1 lần (GĐ5).
  app.post(
    '/api/v1/media/album/send',
    { preHandler: requireGrant('media', 'access') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const userId = (user as any).userId ?? user.id;
      const body = request.body as { assetIds: string[]; conversationId: string; caption?: string };
      if (!body?.assetIds?.length || !body.conversationId) return reply.status(400).send({ error: 'assetIds + conversationId required' });
      if (body.assetIds.length > 12) return reply.status(400).send({ error: 'Tối đa 12 ảnh/lần' });

      const canViewAll = await userHasGrant(userId, 'media', 'view_all');
      const found = await prisma.mediaAsset.findMany({
        where: { id: { in: body.assetIds }, orgId: user.orgId, archivedAt: null, kind: 'image',
          ...(canViewAll ? {} : { OR: [{ ownerUserId: userId }, { visibility: 'public' }] }) },
        include: { blobs: { where: { variantType: { in: ['original', 'watermarked'] } } } },
      });
      if (found.length === 0) return reply.status(404).send({ error: 'Không có ảnh hợp lệ' });

      // FIX 2026-06-12 (anh báo: album sai thứ tự): Prisma findMany với `in[]` KHÔNG giữ
      // thứ tự assetIds (Postgres trả theo thứ tự nội bộ DB). Zalo zca-js thì gán idInGroup
      // theo ĐÚNG thứ tự mảng truyền vào. → Phải sắp lại `assets` theo thứ tự body.assetIds
      // (= thứ tự sale tick chọn) để album hiển thị đúng ý sale.
      const byId = new Map(found.map((a) => [a.id, a]));
      const assets = body.assetIds.map((id) => byId.get(id)).filter((a): a is typeof found[number] => !!a);

      // Chọn variant đúng cho từng ảnh: watermark BẬT → bản có logo, ngược lại bản gốc.
      const pickBlob = (a: typeof assets[number]) => {
        const orig = a.blobs.find((b) => b.variantType === 'original');
        const wm = a.blobs.find((b) => b.variantType === 'watermarked');
        return (a.watermarkEnabled && wm) ? wm : orig;
      };

      const conversation = await prisma.conversation.findFirst({
        where: { id: body.conversationId, orgId: user.orgId }, include: { zaloAccount: true },
      });
      if (!conversation) return reply.status(404).send({ error: 'Không tìm thấy hội thoại' });
      // Multi-channel Phase 2 (2026-07-21): gửi media qua Zalo SDK → chỉ hội thoại Zalo.
      if (!conversation.zaloAccount || !conversation.zaloAccountId) {
        return reply.status(400).send({ error: 'Gửi media chỉ hỗ trợ hội thoại Zalo.', code: 'NOT_ZALO_CHANNEL' });
      }
      // T7b (YC2): chặn gửi qua nick ĐÃ XÓA trước check kết nối.
      if (conversation.zaloAccount.archivedAt) {
        return reply.status(409).send({ error: 'Nick này đã bị xóa — chỉ xem lại lịch sử, không gửi được.', code: 'NICK_ARCHIVED' });
      }
      const instance = zaloPool.getInstance(conversation.zaloAccountId);
      if (!instance?.api || instance.status !== 'connected') {
        return reply.status(400).send({ error: 'Nick Zalo chưa kết nối', code: 'NICK_NOT_CONNECTED' });
      }
      if (conversation.zaloAccount.privacyMode === 'main' && conversation.zaloAccount.ownerUserId !== userId) {
        return reply.status(403).send({ error: 'Nick Riêng tư — chỉ chính chủ gửi.', code: 'PRIVACY_LOCKED' });
      }
      const limits = await zaloRateLimiter.checkLimits(conversation.zaloAccountId);
      if (!limits.allowed) return reply.status(429).send({ error: limits.reason });

      const threadId = conversation.externalThreadId || '';
      const threadType = conversation.threadType === 'group' ? 1 : 0;
      const io = (app as any).io as Server;
      // (Bỏ placeholder album → không cần userFullName/createMediaMessage ở đây nữa.)

      // download tất cả ảnh về temp → gửi 1 lần (sendFile nhiều path).
      const tmps: Array<{ path: string; cleanup: () => Promise<void> }> = [];
      try {
        for (const a of assets) {
          const blob = pickBlob(a);
          if (!blob) continue;
          // KHÔNG truyền filename (name mất đuôi → file lạ). Để lấy đuôi .webp từ URL.
          const tmp = await downloadMediaToTemp({ url: blob.publicUrl }, 'image');
          tmps.push(tmp);
        }
        zaloRateLimiter.recordSend(conversation.zaloAccountId);
        // sendImage (KHÔNG sendFile) → album ảnh inline, không thành file.
        const sendResult: any = await zaloOps.sendImage(
          conversation.zaloAccountId, threadId, threadType as 0 | 1, tmps.map((t) => t.path), io, body.caption ?? '',
        );
        // FIX 2026-06-12 (anh chốt — bug album hiển thị 8+1 rời realtime):
        // KHÔNG tạo placeholder 1-dòng cho album. Placeholder cũ (albumKey=null) hiện RỜI
        // ngay sau gửi; echo Zalo (~1-2s) gom N-1 ảnh kia → "8 chung + 1 rời", F5 mới đủ.
        // Bỏ placeholder → echo Zalo về (mỗi ảnh có albumKey chung) tự hiện ĐỦ N ảnh 1 cụm,
        // KHÔNG bao giờ lệch. Tradeoff: sale chờ ~1-2s thấy album (chấp nhận được).
        // KHÔNG bumpUsage/log ở đây nữa — chuyển sang khi echo về (tránh đếm khi gửi lỗi).
        // Vẫn đếm usage NGAY vì gửi đã thành công (sendImage không throw):
        await prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date(), isReplied: true, unreadCount: 0 } });
        for (const a of assets) {
          await bumpUsage(a.id);
          await logMediaUsage({
            orgId: user.orgId, mediaAssetId: a.id, eventType: 'sent_album',
            userId, conversationId: conversation.id, meta: { albumCount: assets.length },
          });
        }
        const zaloMsgId = String(sendResult?.msgId || sendResult?.data?.msgId || '');
        return { sent: assets.length, zaloMsgId, viaEcho: true };
      } catch (err: any) {
        logger.error('[media] album send error:', err);
        // Lỗi mạng tạm thời khi upload nhiều ảnh (đã retry 3 lần vẫn fail) → báo rõ cho sale.
        const raw = String(err?.message ?? '');
        const isNet = /fetch failed|other side closed|socket|econnreset|und_err/i.test(raw);
        return reply.status(isNet ? 503 : 500).send({
          error: isNet
            ? `Gửi album ${assets.length} ảnh bị gián đoạn mạng (Zalo đóng kết nối khi tải nhiều ảnh). Thử lại, hoặc gửi ít ảnh hơn mỗi lần.`
            : (raw || 'gửi album lỗi'),
          code: isNet ? 'ALBUM_NETWORK' : undefined,
        });
      } finally {
        for (const t of tmps) await t.cleanup().catch(() => {});
      }
    },
  );

  // ══════════════════════════════════════════════════════════════════════════
  // CHIA SẺ TỆP RIÊNG TƯ — Phase Kho Lưu Trữ 2026-07-22
  // Tệp tải lên tab Kho mặc định chỉ người tải lên thấy. Muốn người khác xem →
  // chủ tệp tạo liên kết chia sẻ. KỂ CẢ admin cũng phải qua đường này (anh chốt).
  // Chỉ CHỦ TỆP (hoặc Chủ tài khoản) mới chia sẻ/thu hồi được.
  // ══════════════════════════════════════════════════════════════════════════

  /** Tệp này có phải của người đang gọi không (Chủ tài khoản coi như luôn đúng). */
  async function findOwnedAsset(orgId: string, assetId: string, userId: string, user: any) {
    return prisma.mediaAsset.findFirst({
      where: {
        id: assetId, orgId, archivedAt: null,
        ...(isOrgOwner(user) ? {} : { ownerUserId: userId }),
      },
      select: { id: true, name: true, ownerUserId: true, storageScope: true },
    });
  }

  // ── POST /api/v1/media/:id/share — tạo liên kết chia sẻ ────────────────────
  // body.userId (tuỳ chọn): chia sẻ ĐÍCH DANH — người đó mở tab Kho là thấy tệp.
  //   Bỏ trống → liên kết MỞ trong org: ai đã đăng nhập + cầm token đều xem được.
  // body.expiresInHours (tuỳ chọn): tự hết hạn sau N giờ.
  app.post(
    '/api/v1/media/:id/share',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const userId = (user as any).userId ?? user.id;
      const { id } = request.params as { id: string };
      const body = (request.body ?? {}) as { userId?: string; expiresInHours?: number };

      try {
        const asset = await findOwnedAsset(user.orgId, id, userId, user);
        if (!asset) return reply.status(404).send({ error: 'Không tìm thấy tệp (hoặc tệp không phải của bạn)' });

        // Người nhận phải cùng org — chống chia sẻ xuyên tổ chức.
        if (body.userId) {
          const target = await prisma.user.findFirst({
            where: { id: body.userId, orgId: user.orgId }, select: { id: true },
          });
          if (!target) return reply.status(400).send({ error: 'Người nhận không thuộc tổ chức' });
          if (target.id === asset.ownerUserId) {
            return reply.status(400).send({ error: 'Tệp đã là của người này' });
          }
        }

        const expiresAt = body.expiresInHours && body.expiresInHours > 0
          ? new Date(Date.now() + Math.min(body.expiresInHours, 24 * 365) * 3600_000)
          : null;
        const token = randomBytes(32).toString('base64url');

        // Chia sẻ lại cho người đã từng bị thu hồi → tái dùng hàng cũ + cấp token mới,
        // clear revokedAt (thay vì đẻ hàng mới mỗi lần bấm Chia sẻ).
        let share;
        if (body.userId) {
          // Đích danh: unique [mediaAssetId, sharedWithUserId] dùng được vì cả 2 đều khác null.
          share = await prisma.mediaShare.upsert({
            where: { mediaAssetId_sharedWithUserId: { mediaAssetId: asset.id, sharedWithUserId: body.userId } },
            create: {
              orgId: user.orgId, mediaAssetId: asset.id, token,
              sharedById: userId, sharedWithUserId: body.userId, expiresAt,
            },
            update: { token, revokedAt: null, expiresAt, sharedById: userId },
          });
        } else {
          // Liên kết MỞ (sharedWithUserId=null): KHÔNG upsert được — Postgres coi mỗi NULL là
          // khác nhau nên unique không ràng buộc nhánh này, và Prisma không nhận null trong
          // khoá phức. Tự tìm-rồi-sửa/tạo để mỗi tệp chỉ có đúng 1 liên kết mở.
          const existing = await prisma.mediaShare.findFirst({
            where: { mediaAssetId: asset.id, orgId: user.orgId, sharedWithUserId: null },
            orderBy: { createdAt: 'asc' },
          });
          share = existing
            ? await prisma.mediaShare.update({
                where: { id: existing.id },
                data: { token, revokedAt: null, expiresAt, sharedById: userId },
              })
            : await prisma.mediaShare.create({
                data: {
                  orgId: user.orgId, mediaAssetId: asset.id, token,
                  sharedById: userId, sharedWithUserId: null, expiresAt,
                },
              });
        }

        logger.info(`[media][audit] share asset=${asset.id} by=${userId} to=${body.userId ?? 'link'}`);
        return {
          share: {
            id: share.id,
            token: share.token,
            // Đường dẫn FE mở tệp bằng liên kết (FE ghép với origin của nó).
            path: `/media/shared/${share.token}`,
            sharedWithUserId: share.sharedWithUserId,
            expiresAt: share.expiresAt,
          },
        };
      } catch (err: any) {
        logger.error('[media] share error:', err);
        return reply.status(500).send({ error: err?.message ?? 'share failed' });
      }
    },
  );

  // ── GET /api/v1/media/:id/shares — ai đang xem được tệp này ────────────────
  app.get(
    '/api/v1/media/:id/shares',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const userId = (user as any).userId ?? user.id;
      const { id } = request.params as { id: string };

      const asset = await findOwnedAsset(user.orgId, id, userId, user);
      if (!asset) return reply.status(404).send({ error: 'Không tìm thấy tệp' });

      const shares = await prisma.mediaShare.findMany({
        where: { mediaAssetId: asset.id, orgId: user.orgId },
        include: { sharedWith: { select: { id: true, fullName: true } } },
        orderBy: { createdAt: 'desc' },
      });
      return {
        shares: shares.map((s) => ({
          id: s.id,
          sharedWithUserId: s.sharedWithUserId,
          sharedWithName: s.sharedWith?.fullName ?? null, // null = liên kết mở
          token: s.token,
          path: `/media/shared/${s.token}`,
          expiresAt: s.expiresAt,
          revokedAt: s.revokedAt,
          viewCount: s.viewCount,
          lastViewedAt: s.lastViewedAt,
        })),
      };
    },
  );

  // ── DELETE /api/v1/media/shares/:shareId — thu hồi ────────────────────────
  // Giữ hàng (audit: ai từng xem được, bao nhiêu lượt), chỉ set revokedAt.
  app.delete(
    '/api/v1/media/shares/:shareId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const userId = (user as any).userId ?? user.id;
      const { shareId } = request.params as { shareId: string };

      const share = await prisma.mediaShare.findFirst({
        where: { id: shareId, orgId: user.orgId },
        include: { asset: { select: { ownerUserId: true } } },
      });
      if (!share) return reply.status(404).send({ error: 'Không tìm thấy lượt chia sẻ' });
      if (!isOrgOwner(user) && share.asset.ownerUserId !== userId) {
        return reply.status(403).send({ error: 'Chỉ chủ tệp mới thu hồi được' });
      }
      await prisma.mediaShare.update({ where: { id: shareId }, data: { revokedAt: new Date() } });
      logger.info(`[media][audit] share_revoke share=${shareId} by=${userId}`);
      return { ok: true };
    },
  );

  // ── GET /api/v1/media/shared/:token — mở tệp bằng liên kết chia sẻ ─────────
  // VẪN cần đăng nhập (authMiddleware ở hook đầu file) — liên kết chỉ mở trong org,
  // không phải liên kết công khai ra Internet. Token sai/thu hồi/hết hạn → 404 (không
  // phân biệt lý do, tránh dò token).
  app.get(
    '/api/v1/media/shared/:token',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const userId = (user as any).userId ?? user.id;
      const { token } = request.params as { token: string };

      const share = await prisma.mediaShare.findFirst({
        where: { token, orgId: user.orgId, ...activeShareWhere() },
        include: {
          asset: {
            include: {
              blobs: { where: { variantType: 'original' }, take: 1 },
              owner: { select: { fullName: true } },
            },
          },
        },
      });
      if (!share || share.asset.archivedAt) {
        return reply.status(404).send({ error: 'Liên kết không hợp lệ hoặc đã hết hạn' });
      }
      // Chia sẻ ĐÍCH DANH: chỉ đúng người đó mới mở được, dù có token.
      if (share.sharedWithUserId && share.sharedWithUserId !== userId && !isOrgOwner(user)) {
        return reply.status(404).send({ error: 'Liên kết không hợp lệ hoặc đã hết hạn' });
      }

      // Đếm lượt mở (audit tệp riêng tư đã bị xem bao nhiêu lần). Không chặn phản hồi.
      void prisma.mediaShare
        .update({ where: { id: share.id }, data: { viewCount: { increment: 1 }, lastViewedAt: new Date() } })
        .catch((err) => logger.warn('[media] đếm lượt xem chia sẻ lỗi:', err?.message));

      const a = share.asset;
      const blob = a.blobs[0];
      return {
        asset: {
          id: a.id,
          kind: a.kind,
          name: a.name,
          url: blob?.publicUrl ?? null,
          thumbnailUrl: a.thumbnailUrl ?? (a.kind === 'image' ? blob?.publicUrl ?? null : null),
          sizeBytes: blob?.sizeBytes ?? null,
          durationSec: blob?.durationSec ?? null,
          width: blob?.width ?? null,
          height: blob?.height ?? null,
          createdAt: a.createdAt,
          ownerName: a.owner?.fullName ?? null,
        },
      };
    },
  );
}
