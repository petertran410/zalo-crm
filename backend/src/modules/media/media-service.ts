/**
 * media-service.ts — Phase Media Library 2026-06-11.
 *
 * Tầng SERVICE của kho phương tiện. Biết Prisma + orgId; gọi xuống storage
 * (uploadBuffer đã dedup theo sha256) rồi upsert MediaAsset/MediaBlob.
 *
 * Kiến trúc 2 tầng (eng review E2):
 *   storage (minio-client) → trả {contentHash, deduped, url, ...}  ← KHÔNG biết DB
 *   service (file này)     → upsert MediaAsset (danh tính) + MediaBlob (variant)
 *
 * COUPLING bắt buộc (eng review D9): kể cả khi storage dedup-hit (deduped=true),
 * service VẪN upsert MediaBlob theo [orgId,contentHash] + tăng usageCount asset,
 * nếu không các lần dedup-hit (đặc biệt mirror tin khách) sẽ không vào catalog.
 *
 * Xử lý lỗi (eng review D10):
 *   • P2002 (2 sale upload cùng bytes đồng thời) → coi như dedup-hit, đọc lại bản có sẵn.
 *   • sharp lỗi (ảnh hỏng/format lạ) → fallback lưu ảnh GỐC + log warn (compressImage).
 */
import sharp from 'sharp';
import { imageSize } from 'image-size';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve as resolvePath, join as joinPath } from 'node:path';
import { tmpdir } from 'node:os';
import { prisma } from '../../shared/database/prisma-client.js';
import { uploadBuffer } from '../../shared/storage/minio-client.js';
import { candidateDownloadUrls } from '../chat/chat-media-helpers.js';
import { generateThumbnail, probeVideoFile } from '../../shared/video-processor.js';
import { sanitizeSvg } from '../../shared/svg-sanitizer.js';
import { logger } from '../../shared/utils/logger.js';
import type { MediaAsset, MediaBlob } from '@prisma/client';

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/**
 * Thang chất lượng của bộ mã hoá, KHÔNG phải mục tiêu dung lượng: không phải "còn 80%"
 * cũng không phải "giảm 80%". Đo thực tế cùng mức này: JPEG còn ~38%, WebP ~53%, PNG ~100%.
 */
const QUALITY = 80;

/**
 * PNG là định dạng không mất dữ liệu nên chỉ ép được mức nén lossless, gần như không nhỏ đi.
 * Muốn nhỏ thật phải palette hoá, mà ảnh chụp và gradient sẽ nổi vệt màu.
 */
const PNG_COMPRESSION_LEVEL = 9;

// GIF không đi qua sharp vì sẽ mất animation.
const COMPRESSIBLE = new Set(['image/jpeg', 'image/png', 'image/webp']);

export type MediaKind = 'image' | 'video' | 'file';
export type MediaSource = 'upload' | 'saved_from_chat';
/**
 * Phạm vi lưu trữ (2026-07-22, anh chốt):
 *   'catalog'        — kho phương tiện CŨ. media.view_all bypass được (admin/marketing thấy hết).
 *   'private_upload' — tệp tải lên từ tab Kho. CHỈ người tải lên + Chủ tài khoản (role='owner')
 *                      + người được chia sẻ liên kết. view_all KHÔNG bypass.
 */
export type MediaStorageScope = 'catalog' | 'private_upload';

/**
 * Chuẩn hóa tag/dự án (anh chốt 2026-06-15): gộp tag+dự án làm 1, KHÔNG phân biệt hoa/thường.
 * 'EGV' / 'egv' / ' Egv ' → 'egv'. Dùng CHUNG ở MỌI chỗ ghi tagIds (registerAsset, PATCH /:id,
 * PATCH /bulk, addTags lúc gửi) để lọc/đếm gộp đúng 1 nhóm. trim → lowercase → bỏ rỗng → dedup.
 */
export function normalizeTags(tags: string[] | null | undefined): string[] {
  if (!Array.isArray(tags)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of tags) {
    const v = String(t ?? '').trim().toLowerCase();
    if (v && !seen.has(v)) { seen.add(v); out.push(v); }
  }
  return out;
}

export interface RegisterAssetInput {
  orgId: string;
  buffer: Buffer;
  mimeType: string;
  /** Phân loại để route nén/thumbnail. */
  kind: MediaKind;
  /** Tên hiển thị trong kho (mặc định = originalFilename). */
  name?: string;
  originalFilename?: string;
  ownerUserId?: string | null;
  createdById?: string | null;
  /** 'private' (mặc định, fail-closed) | 'public'. */
  visibility?: 'private' | 'public';
  source?: MediaSource;
  /** Nick Zalo nguồn (HIỂN THỊ "ảnh từ nick nào") — mọi ảnh lưu từ chat, cả nick thường. */
  sourceZaloAccountId?: string | null;
  /** Cờ ENFORCE privacy — true CHỈ khi nick nguồn là Riêng tư (privacyMode='main'). */
  sourceIsPrivateNick?: boolean;
  tagIds?: string[];
  folderId?: string | null;
  /** Mặc định 'catalog' (hành vi cũ). Tab Kho truyền 'private_upload'. */
  storageScope?: MediaStorageScope;
}

export interface RegisterAssetResult {
  asset: MediaAsset;
  blob: MediaBlob;
  /** true nếu bytes đã tồn tại từ trước (không tốn thêm ô lưu trữ MinIO). */
  deduped: boolean;
}

/**
 * Nén ảnh nhưng GIỮ NGUYÊN định dạng và kích thước: png ra png, jpg ra jpg, webp ra webp.
 * Trước đây ép hết sang WebP và thu về 2000px, khiến tải lên .png mà tải về là ruột WebP.
 */
export async function compressImage(
  buffer: Buffer,
  mimeType: string,
): Promise<{ buffer: Buffer; mimeType: string; width?: number; height?: number; compressed: boolean }> {
  // Phải đứng trước mọi nhánh khác để không rơi xuống fallback "lỗi thì lưu bản gốc" ở
  // cuối hàm, vì với SVG thì lưu bản gốc đúng bằng lưu thứ đang cố chặn.
  if (mimeType === 'image/svg+xml') {
    const clean = sanitizeSvg(buffer);
    let w: number | undefined;
    let h: number | undefined;
    try {
      const meta = await sharp(clean).metadata();
      w = meta.width;
      h = meta.height;
    } catch { /* thiếu kích thước không ảnh hưởng gì, vẫn lưu bản đã sạch */ }
    return { buffer: clean, mimeType, width: w, height: h, compressed: false };
  }

  if (!COMPRESSIBLE.has(mimeType)) {
    let w: number | undefined;
    let h: number | undefined;
    if (IMAGE_MIMES.has(mimeType)) {
      try {
        const dim = imageSize(buffer);
        w = dim.width;
        h = dim.height;
      } catch { /* bỏ qua */ }
    }
    return { buffer, mimeType, width: w, height: h, compressed: false };
  }
  try {
    // rotate() áp EXIF orientation vào pixel, nếu không ảnh chụp dọc sẽ nằm ngang ở chỗ
    // không đọc EXIF. keepIccProfile() giữ hồ sơ màu, bỏ đi thì ảnh hiệu chỉnh màu lệch tông.
    const pipeline = sharp(buffer, { failOn: 'error' }).rotate().keepIccProfile();

    const encoded =
      mimeType === 'image/png'
        ? pipeline.png({ compressionLevel: PNG_COMPRESSION_LEVEL })
        : mimeType === 'image/webp'
          ? pipeline.webp({ quality: QUALITY })
          : pipeline.jpeg({ quality: QUALITY, mozjpeg: true });

    const out = await encoded.toBuffer({ resolveWithObject: true });

    // PNG đã tối ưu sẵn và JPEG chất lượng thấp hay phình ra khi mã hoá lại.
    if (out.data.length >= buffer.length) {
      const dim = (() => { try { return imageSize(buffer); } catch { return undefined; } })();
      return {
        buffer,
        mimeType,
        width: dim?.width ?? out.info.width,
        height: dim?.height ?? out.info.height,
        compressed: false,
      };
    }

    return {
      buffer: out.data,
      mimeType,
      width: out.info.width,
      height: out.info.height,
      compressed: true,
    };
  } catch (err) {
    // D10(2): không để mất ảnh. Fallback này FAIL-OPEN nên chỉ an toàn với ảnh raster;
    // định dạng mang được mã như SVG phải chặn ở nhánh riêng bên trên, không rơi xuống đây.
    logger.warn('[media] compressImage failed, fallback to original:', (err as Error)?.message ?? err);
    return { buffer, mimeType, compressed: false };
  }
}

/**
 * Đăng ký 1 media vào kho: nén (nếu ảnh) → upload dedup → upsert Asset+Blob.
 *
 * Dedup ở 2 tầng:
 *   1. Storage: uploadBuffer skip putObject nếu object đã tồn tại (deduped).
 *   2. DB: upsert MediaBlob theo [orgId,contentHash]; nếu trùng → đọc lại,
 *      tăng usageCount của asset đang trỏ tới (KHÔNG tạo asset mới).
 */
/**
 * Sinh thumbnail + metadata (duration/width/height) cho VIDEO upload vào kho (ffmpeg).
 * Trả thumbnailUrl (đã mirror lên MinIO) + durationSec/width/height. Lỗi ffmpeg → trả rỗng
 * (không chặn upload — video vẫn lưu, chỉ thiếu ảnh đại diện). KHÔNG throw.
 */
async function extractVideoMeta(buffer: Buffer): Promise<{
  thumbnailUrl: string | null; durationSec: number | null; width: number | null; height: number | null;
}> {
  const empty = { thumbnailUrl: null, durationSec: null, width: null, height: null };
  let dir: string | null = null;
  try {
    dir = await mkdtemp(joinPath(tmpdir(), 'zalocrm-media-vid-'));
    const vidPath = joinPath(dir, 'video.mp4');
    await writeFile(vidPath, buffer);
    // Probe metadata (ffprobe) — không chặn nếu lỗi.
    const meta = await probeVideoFile(vidPath).catch(() => ({} as any));
    // Thumbnail (ffmpeg) → mirror lên MinIO.
    let thumbnailUrl: string | null = null;
    try {
      const gen = await generateThumbnail(vidPath);
      const thumbBuf = await readFile(gen.path);
      const up = await uploadBuffer(thumbBuf, 'image/jpeg', 'video-thumb.jpg');
      thumbnailUrl = up.url;
      await gen.cleanup().catch(() => {});
    } catch (e) {
      logger.warn('[media] extractVideoMeta thumbnail failed:', (e as Error)?.message ?? e);
    }
    return {
      thumbnailUrl,
      durationSec: meta.durationMs ? Math.round(meta.durationMs / 1000) : null,
      width: meta.width ?? null,
      height: meta.height ?? null,
    };
  } catch (e) {
    logger.warn('[media] extractVideoMeta failed:', (e as Error)?.message ?? e);
    return empty;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function registerAsset(input: RegisterAssetInput): Promise<RegisterAssetResult> {
  const {
    orgId,
    mimeType,
    kind,
    ownerUserId = null,
    createdById = null,
    visibility = 'private',
    source = 'upload',
    sourceZaloAccountId = null,
    sourceIsPrivateNick = false,
    folderId = null,
    storageScope = 'catalog',
  } = input;
  // Chuẩn hóa tag NGAY tại tầng service — mọi nguồn ghi tag (upload/save-from-chat) đi qua đây.
  const tagIds = normalizeTags(input.tagIds ?? []);

  // 1. Nén (chỉ ảnh) — variant 'original' đã-nén là bytes thật lưu.
  const processed = kind === 'image'
    ? await compressImage(input.buffer, mimeType)
    : { buffer: input.buffer, mimeType, width: undefined, height: undefined, compressed: false };

  // 1b. VIDEO: sinh thumbnail + metadata (ffmpeg) để kho hiển thị đẹp (anh chốt 2026-06-12).
  const videoMeta = kind === 'video'
    ? await extractVideoMeta(input.buffer)
    : { thumbnailUrl: null, durationSec: null, width: null, height: null };

  const originalFilename = input.originalFilename ?? null;
  const name = input.name ?? originalFilename ?? 'Media';

  // 2. Upload dedup → contentHash của bytes THẬT LƯU.
  const up = await uploadBuffer(processed.buffer, processed.mimeType, originalFilename ?? undefined);

  // 3. Đã có blob với contentHash này trong org? → dedup-hit ở tầng DB.
  //
  // 2026-07-22 (Phase Kho Lưu Trữ) — dedup phải BIẾT CHỦ. Trước đây chỉ tra theo bytes:
  // người B tải lên đúng tệp người A đã có → trả về asset CỦA A. Với kho riêng tư điều đó
  // vừa sai (B không sở hữu gì cả) vừa rò rỉ (B biết tệp đó tồn tại, và cầm được id của nó).
  // Quy tắc: chỉ tái dùng asset khi nó KHÔNG riêng tư, hoặc riêng tư nhưng CÙNG CHỦ.
  const blobCandidates = await prisma.mediaBlob.findMany({
    where: { orgId, contentHash: up.contentHash },
    include: { asset: true },
    orderBy: { createdAt: 'asc' },
  });
  const isPrivateUpload = storageScope === 'private_upload';
  const existingBlob = blobCandidates.find((b) => {
    const a = b.asset;
    if (!a) return false;
    const assetIsPrivate = a.storageScope === 'private_upload';
    if (!assetIsPrivate && !isPrivateUpload) return true;      // kho chung ↔ kho chung: như cũ
    return assetIsPrivate && isPrivateUpload && a.ownerUserId === ownerUserId; // riêng tư: phải cùng chủ
  }) ?? null;
  if (existingBlob) {
    // S8 observability: log dedup-hit (đo tiết kiệm thật — bao nhiêu ô lưu trữ né được).
    logger.info(`[media][dedup] hit org=${orgId} hash=${up.contentHash.slice(0, 12)} reusedAsset=${existingBlob.assetId} source=${source}`);
    // FIX 2026-06-12 (anh báo file .doc/.xlsx lưu cũ kẹt tên "Lưu từ chat"): khi dedup-hit,
    // asset cũ có thể được lưu TỪ TRƯỚC lúc code chưa biết đọc tên thật → name placeholder +
    // originalFilename=null. Nếu lần lưu này CÓ tên thật tốt hơn (có đuôi) → VÁ tên + đuôi cho
    // asset cũ để hết kẹt "Lưu từ chat" và gửi đi không ra file .bin. Chỉ vá khi tên cũ là
    // placeholder/thiếu đuôi VÀ tên mới có đuôi (tránh ghi đè tên do người dùng tự đặt).
    const old = existingBlob.asset;
    const PLACEHOLDER = /^(Lưu từ chat|Tệp lưu từ chat|Media)$/;
    const oldHasExt = !!old?.name && /\.[A-Za-z0-9]{2,5}$/.test(old.name);
    const newHasExt = !!input.name && /\.[A-Za-z0-9]{2,5}$/.test(input.name);
    const shouldPatchName =
      !!input.name && newHasExt &&
      (!old?.originalFilename || (!oldHasExt && (PLACEHOLDER.test(old?.name ?? '') || old?.name === input.originalFilename)));
    // FIX 2026-06-12 (anh báo file 27.2MB là video Blue Fun...Post-2.mp4 lọt tab Tệp): Zalo gửi
    // 1 SỐ video dưới content_type='file' (người gửi đính kèm như file, không phải video native)
    // → asset cũ kẹt kind='file' nằm sai tab Tệp. Nếu lần lưu này nhận diện ĐÚNG là video (đuôi
    // .mp4/.mov/... ở media-routes nâng kind='video') VÀ asset cũ đang là 'file' → VÁ kind sang
    // 'video' + gắn thumbnail/metadata (videoMeta đã sinh ở trên vì kind='video'). Chỉ nâng
    // file→video (không hạ cấp), tránh đụng asset đã phân loại đúng.
    const shouldPatchKind = kind === 'video' && old?.kind === 'file';
    // GĐ13a D5 (2026-06-12): nếu asset cũ ĐANG trong thùng rác (archivedAt != null) mà sale
    // lưu LẠI đúng file đó → TỰ KHÔI PHỤC về kho (clear archivedAt + trashedById). Tránh
    // dedup đụng bản ẩn khiến sale "lưu rồi mà kho không hiện".
    const shouldRestore = !!old?.archivedAt;
    // PRIVACY (2026-06-15, code-review #1): dedup-hit phải NÂNG cờ sourceIsPrivateNick lên true
    // nếu lần lưu này từ nick Riêng tư mà asset cũ (do nick thường lưu trước cùng bytes) đang
    // false → nếu KHÔNG nâng, ảnh có nội dung nick Riêng tư bị public không cần xác nhận D11.
    // CHỈ nâng false→true (re-arm gate), KHÔNG hạ true→false. Gắn nick nguồn nếu asset cũ chưa có.
    const shouldArmPrivate = !!sourceIsPrivateNick && !old?.sourceIsPrivateNick;
    const shouldSetSourceNick = !!sourceZaloAccountId && !old?.sourceZaloAccountId;
    const asset = await prisma.mediaAsset.update({
      where: { id: existingBlob.assetId },
      data: {
        usageCount: { increment: 1 },
        lastUsedAt: new Date(),
        ...(shouldPatchName ? { name: input.name, originalFilename: input.originalFilename ?? input.name } : {}),
        ...(shouldPatchKind
          ? { kind: 'video', ...(videoMeta.thumbnailUrl ? { thumbnailUrl: videoMeta.thumbnailUrl } : {}) }
          : {}),
        ...(shouldRestore ? { archivedAt: null, trashedById: null } : {}),
        ...(shouldArmPrivate ? { sourceIsPrivateNick: true } : {}),
        ...(shouldSetSourceNick ? { sourceZaloAccountId } : {}),
      },
    });
    if (shouldArmPrivate) {
      logger.info(`[media][dedup] re-arm privacy gate asset=${existingBlob.assetId} (lưu lại từ nick Riêng tư)`);
    }
    if (shouldRestore) {
      logger.info(`[media][dedup] auto-restore asset=${existingBlob.assetId} (lưu lại đồ đang trong thùng rác → về kho)`);
    }
    if (shouldPatchKind) {
      // Vá luôn metadata video trên blob đã tồn tại (duration/width/height) để player hiển thị đúng.
      await prisma.mediaBlob.update({
        where: { id: existingBlob.id },
        data: {
          ...(videoMeta.durationSec != null ? { durationSec: videoMeta.durationSec } : {}),
          ...(videoMeta.width != null ? { width: videoMeta.width } : {}),
          ...(videoMeta.height != null ? { height: videoMeta.height } : {}),
        },
      }).catch((e) => logger.warn(`[media][dedup] vá metadata blob video lỗi: ${(e as Error)?.message}`));
      logger.info(`[media][dedup] vá kind asset=${existingBlob.assetId} file → video (${old?.name})`);
    }
    if (shouldPatchName) {
      logger.info(`[media][dedup] vá tên asset=${existingBlob.assetId} "${old?.name}" → "${input.name}"`);
    }
    return { asset, blob: existingBlob, deduped: true };
  }
  // S8: log MISS (bytes mới hoàn toàn) — để tính hit-rate = hit/(hit+miss).
  logger.info(`[media][dedup] miss org=${orgId} hash=${up.contentHash.slice(0, 12)} source=${source}`);

  // 4. Tạo Asset (danh tính) + Blob (variant original) trong 1 transaction.
  try {
    const result = await prisma.$transaction(async (tx) => {
      const asset = await tx.mediaAsset.create({
        data: {
          orgId,
          kind,
          name,
          ownerUserId,
          createdById,
          visibility,
          source,
          sourceZaloAccountId,
          sourceIsPrivateNick,
          folderId,
          tagIds,
          storageScope,
          originalFilename,
          // VIDEO: ảnh đại diện (ffmpeg) để kho không hiện <img> vỡ.
          thumbnailUrl: videoMeta.thumbnailUrl,
        },
      });
      const blob = await tx.mediaBlob.create({
        data: {
          orgId,
          assetId: asset.id,
          contentHash: up.contentHash,
          variantType: 'original',
          minioKey: up.key,
          publicUrl: up.url,
          mimeType: up.mimeType,
          sizeBytes: up.size,
          width: processed.width ?? videoMeta.width ?? null,
          height: processed.height ?? videoMeta.height ?? null,
          durationSec: videoMeta.durationSec,
        },
      });
      return { asset, blob };
    });
    return { ...result, deduped: up.deduped };
  } catch (err) {
    // D10(1): 2 sale upload cùng bytes đồng thời → 1 ăn P2002 trên [orgId,contentHash].
    // Coi như dedup-hit: đọc lại blob bản kia + tăng usageCount, KHÔNG báo lỗi 500.
    if ((err as { code?: string }).code === 'P2002') {
      // Khoá giờ là [orgId,contentHash,assetId] → tra theo bytes có thể ra nhiều hàng.
      const blob = await prisma.mediaBlob.findFirst({
        where: { orgId, contentHash: up.contentHash },
        include: { asset: true },
        orderBy: { createdAt: 'asc' },
      });
      if (blob) {
        const asset = await prisma.mediaAsset.update({
          where: { id: blob.assetId },
          data: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
        });
        return { asset, blob, deduped: true };
      }
    }
    throw err;
  }
}

/**
 * Quyết định visibility + có chặn không khi "Lưu vào Media" từ chat (privacy guard).
 * Hàm THUẦN (không DB) để test được rule bảo mật — khu vực đã từng lộ.
 *
 * Rule (eng review D11 + checklist điều 4):
 *  • Nick Riêng tư (privacyMode='main'):
 *      - viewer KHÔNG phải chủ nick → CHẶN (blocked=true).
 *      - viewer là chủ nick → cho lưu nhưng LUÔN private (kể cả xin public).
 *  • Nick Thường (sub/khác): theo lựa chọn của sale (requested ?? 'private').
 */
export function resolveSavedVisibility(args: {
  nickPrivacyMode: string | null | undefined;
  nickOwnerUserId: string | null | undefined;
  viewerUserId: string;
  requested?: 'private' | 'public';
}): { blocked: boolean; visibility: 'private' | 'public'; forcedPrivate: boolean } {
  const isPrivateNick = args.nickPrivacyMode === 'main';
  if (isPrivateNick) {
    if (args.nickOwnerUserId !== args.viewerUserId) {
      return { blocked: true, visibility: 'private', forcedPrivate: true };
    }
    // chủ nick lưu được nhưng ép private (không cho public lộ PII khách).
    return { blocked: false, visibility: 'private', forcedPrivate: true };
  }
  return { blocked: false, visibility: args.requested ?? 'private', forcedPrivate: false };
}

/**
 * Tăng lượt dùng khi 1 asset được gửi đi (chèn vào chat / album).
 */
export async function bumpUsage(assetId: string): Promise<void> {
  await prisma.mediaAsset
    .update({ where: { id: assetId }, data: { usageCount: { increment: 1 }, lastUsedAt: new Date() } })
    .catch(() => { /* asset đã archive/xóa — bỏ qua */ });
}

export type MediaUsageEventType =
  | 'sent_chat' | 'sent_album' | 'broadcast' | 'saved_from_chat' | 'made_public';

/**
 * Ghi 1 sự kiện dùng media (S8 observability + tách event type usageCount).
 * KHÔNG throw — log lỗi là phụ trợ, không được làm hỏng luồng gửi/lưu chính.
 */
export async function logMediaUsage(args: {
  orgId: string;
  mediaAssetId: string;
  eventType: MediaUsageEventType;
  userId?: string | null;
  conversationId?: string | null;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.mediaUsageEvent.create({
      data: {
        orgId: args.orgId,
        mediaAssetId: args.mediaAssetId,
        eventType: args.eventType,
        userId: args.userId ?? null,
        conversationId: args.conversationId ?? null,
        meta: (args.meta ?? undefined) as any,
      },
    });
  } catch (err) {
    logger.warn('[media] logMediaUsage failed:', (err as Error)?.message ?? err);
  }
}

// ── Watermark (GĐ2) — sinh blob variant 'watermarked' từ blob gốc ─────────────
// Logo HS đặt ở static/brand. Cache buffer 1 lần (không đọc đĩa mỗi lần watermark).
let _logoCache: Buffer | null = null;
async function loadLogo(): Promise<Buffer> {
  if (_logoCache) return _logoCache;
  const logoPath = resolvePath(process.cwd(), 'static', 'brand', 'zalocrm-logo-ngang.png');
  _logoCache = await readFile(logoPath);
  return _logoCache;
}

/**
 * Tạo bản WATERMARK của 1 asset (eng review E2/D13: watermark = blob variant MỚI).
 * Lấy blob 'original' → composite logo HS góc dưới-phải → upload (dedup theo hash)
 * → tạo MediaBlob variantType='watermarked'. Bản gốc giữ nguyên.
 *
 * @returns blob watermark (mới hoặc đã có nếu trùng hash).
 * @throws nếu asset không phải ảnh / không có blob gốc.
 */
export async function generateWatermarkVariant(args: {
  orgId: string;
  assetId: string;
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'center';
  opacity?: number; // 0..1, mặc định 0.65
}): Promise<{ blobId: string; url: string; deduped: boolean }> {
  const position = args.position ?? 'bottom-right';
  const opacityIn = Math.min(1, Math.max(0.1, args.opacity ?? 0.65));
  const asset = await prisma.mediaAsset.findFirst({
    where: { id: args.assetId, orgId: args.orgId },
    include: { blobs: true },
  });
  if (!asset) throw new Error('Asset không tồn tại');
  if (asset.kind !== 'image') throw new Error('Chỉ ảnh mới đóng được watermark');

  // BẬT/đổi góc-độ-mờ: nếu đã có variant watermark cũ → XÓA để sinh lại theo cấu hình mới.
  // (Trước đây trả luôn bản cũ → đổi góc/opacity không có tác dụng — đã sửa 2026-06-12.)
  const existed = asset.blobs.find((b) => b.variantType === 'watermarked');
  if (existed) {
    await prisma.mediaBlob.delete({ where: { id: existed.id } }).catch(() => { /* đã xóa */ });
  }

  const original = asset.blobs.find((b) => b.variantType === 'original');
  if (!original) throw new Error('Asset chưa có dữ liệu gốc');

  // Tải bytes gốc về — thử URL public rồi fallback host nội bộ s3Endpoint
  // (từ trong container, URL public có thể không resolve được — như forward media).
  let srcBuf: Buffer | null = null;
  for (const u of candidateDownloadUrls(original.publicUrl)) {
    try {
      const resp = await fetch(u, { signal: AbortSignal.timeout(30_000) });
      if (resp.ok) { srcBuf = Buffer.from(await resp.arrayBuffer()); break; }
    } catch { /* thử URL kế */ }
  }
  if (!srcBuf) throw new Error('Không tải được ảnh gốc để đóng watermark');
  const logo = await loadLogo();

  const base = sharp(srcBuf);
  const meta = await base.metadata();
  const bw = meta.width ?? 800;
  // Logo rộng ~22% ảnh, mờ theo opacity (tô lớp alpha đè để giảm độ đậm).
  const logoW = Math.max(80, Math.round(bw * 0.22));
  const opacity = opacityIn;
  // resize logo rồi nhân alpha bằng 1 lớp đen trong suốt qua composite 'dest-in'.
  const resized = await sharp(logo).resize(logoW).ensureAlpha().png().toBuffer();
  const dims = await sharp(resized).metadata();
  const alphaMask = await sharp({
    create: {
      width: dims.width ?? logoW,
      height: dims.height ?? logoW,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: opacity },
    },
  }).png().toBuffer();
  const logoResized = await sharp(resized)
    .composite([{ input: alphaMask, blend: 'dest-in' }])
    .png()
    .toBuffer();
  const gravity = {
    'bottom-right': 'southeast', 'bottom-left': 'southwest',
    'top-right': 'northeast', 'top-left': 'northwest', 'center': 'center',
  }[position] as string;

  const out = await base
    .composite([{ input: logoResized, gravity }])
    .webp({ quality: 85 })
    .toBuffer({ resolveWithObject: true });

  const up = await uploadBuffer(out.data, 'image/webp', `${asset.name}-wm.webp`);
  const blob = await prisma.mediaBlob.create({
    data: {
      orgId: args.orgId,
      assetId: asset.id,
      contentHash: up.contentHash,
      variantType: 'watermarked',
      minioKey: up.key,
      publicUrl: up.url,
      mimeType: up.mimeType,
      sizeBytes: up.size,
      width: out.info.width,
      height: out.info.height,
    },
  }).catch(async (err) => {
    // P2002: hash trùng blob khác (cực hiếm) → đọc lại.
    if ((err as { code?: string }).code === 'P2002') {
      // Khoá [orgId,contentHash,assetId]: variant của CHÍNH asset này mới là bản cần đọc lại.
      const b = await prisma.mediaBlob.findFirst({
        where: { orgId: args.orgId, contentHash: up.contentHash, assetId: asset.id },
      });
      if (b) return b;
    }
    throw err;
  });
  // Lưu cấu hình watermark per-ảnh → BẬT (gửi đi dùng bản watermark) + nhớ góc/độ mờ.
  await prisma.mediaAsset.update({
    where: { id: asset.id },
    data: { watermarkEnabled: true, watermarkPosition: position, watermarkOpacity: opacityIn },
  }).catch(() => { /* asset đã archive — bỏ qua */ });
  return { blobId: blob.id, url: blob.publicUrl, deduped: up.deduped };
}

/**
 * TẮT watermark per-ảnh: gỡ blob 'watermarked' + đặt watermarkEnabled=false.
 * Bản gốc luôn giữ. Gửi đi sau đó dùng lại bản gốc.
 */
/**
 * Lưu bản ANNOTATED từ FE canvas (PNG/JPEG base64 hoặc buffer).
 * Tạo MediaBlob variantType='annotated'. Bản gốc giữ nguyên.
 */
export async function saveAnnotatedVariant(args: {
  orgId: string;
  assetId: string;
  buffer: Buffer;
  mimeType?: string;
}): Promise<{ blobId: string; url: string; width: number | null; height: number | null; deduped: boolean }> {
  const asset = await prisma.mediaAsset.findFirst({
    where: { id: args.assetId, orgId: args.orgId },
    select: { id: true, kind: true, name: true },
  });
  if (!asset) throw new Error('Asset không tồn tại');
  if (asset.kind !== 'image') throw new Error('Chỉ ảnh mới annotate được');

  let outBuf = args.buffer;
  let mime = args.mimeType || 'image/png';
  let width: number | null = null;
  let height: number | null = null;
  try {
    const out = await sharp(args.buffer, { failOn: 'error' })
      .rotate()
      .webp({ quality: 88 })
      .toBuffer({ resolveWithObject: true });
    outBuf = out.data;
    mime = 'image/webp';
    width = out.info.width ?? null;
    height = out.info.height ?? null;
  } catch {
    try {
      const dim = imageSize(args.buffer);
      width = dim.width ?? null;
      height = dim.height ?? null;
    } catch { /* keep null */ }
  }

  const up = await uploadBuffer(outBuf, mime, `${asset.name}-annotated.webp`);
  const blob = await prisma.mediaBlob.create({
    data: {
      orgId: args.orgId,
      assetId: asset.id,
      contentHash: up.contentHash,
      variantType: 'annotated',
      minioKey: up.key,
      publicUrl: up.url,
      mimeType: up.mimeType,
      sizeBytes: up.size,
      width,
      height,
    },
  }).catch(async (err) => {
    if ((err as { code?: string }).code === 'P2002') {
      const b = await prisma.mediaBlob.findFirst({
        where: { orgId: args.orgId, contentHash: up.contentHash, assetId: asset.id },
      });
      if (b) return b;
    }
    throw err;
  });

  return {
    blobId: blob.id,
    url: blob.publicUrl,
    width: blob.width,
    height: blob.height,
    deduped: up.deduped,
  };
}

export async function disableWatermark(orgId: string, assetId: string): Promise<void> {
  const asset = await prisma.mediaAsset.findFirst({
    where: { id: assetId, orgId }, include: { blobs: { where: { variantType: 'watermarked' } } },
  });
  if (!asset) throw new Error('Asset không tồn tại');
  for (const b of asset.blobs) {
    await prisma.mediaBlob.delete({ where: { id: b.id } }).catch(() => { /* đã xóa */ });
  }
  await prisma.mediaAsset.update({ where: { id: assetId }, data: { watermarkEnabled: false } });
}
