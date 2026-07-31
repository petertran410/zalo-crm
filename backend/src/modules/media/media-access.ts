/**
 * media-access.ts — Phase Kho Lưu Trữ (Storage) 2026-07-22.
 *
 * MỘT chỗ duy nhất định nghĩa "ai thấy tệp nào". Trước đây luật scope được viết tay
 * lặp lại ~15 chỗ trong media-routes.ts (`canViewAll ? {} : { OR: [...] }`), giờ mọi
 * route gọi buildMediaScopeWhere() để không lệch nhau.
 *
 * 2 phạm vi (MediaAsset.storageScope):
 *
 *   'catalog'  — kho phương tiện CŨ (ảnh bảng giá, lưu-từ-chat...). Luật GIỮ NGUYÊN:
 *                thấy tệp của mình HOẶC tệp Công khai; media.view_all bypass hết.
 *
 *   'private_upload' — tệp tải lên từ tab Kho. Anh chốt 2026-07-22:
 *                "mọi người đều tải lên được, nhưng người khác — KỂ CẢ admin — phải
 *                 được chia sẻ liên kết mới xem được."
 *                → media.view_all KHÔNG bypass. Chỉ: người tải lên, người được chia sẻ
 *                  (MediaShare còn hiệu lực), và Chủ tài khoản (User.role='owner').
 *
 * ⚠️ Giới hạn đã biết: byte thật được phục vụ tĩnh ở /files/{key} KHÔNG có xác thực
 *    (app.ts). Nên "riêng tư" ở đây = KHÔNG LỘ TRONG DANH SÁCH; ai cầm sẵn URL object
 *    vẫn mở được. Muốn kín thật phải đưa /files ra sau route ký — việc đó đụng cả
 *    đường tải ảnh chat, anh chưa chốt.
 */
import type { Prisma } from '@prisma/client';

/** Chủ tài khoản = vai trò cao nhất, mỗi org đúng 1 (user-routes chặn tạo thêm). */
export function isOrgOwner(user: { role?: string | null } | null | undefined): boolean {
  return user?.role === 'owner';
}

export interface MediaScopeInput {
  userId: string;
  /** Có grant media.view_all không (admin/marketing/trưởng phòng). */
  canViewAll: boolean;
  /** User.role === 'owner' — xem được mọi thứ, kể cả kho riêng tư. */
  isOwnerRole: boolean;
}

/**
 * Mảnh `where` Prisma lọc MediaAsset theo quyền xem của 1 người.
 * Ghép vào where của caller bằng spread: `{ orgId, archivedAt: null, ...buildMediaScopeWhere(...) }`.
 * Trả `{}` khi người đó thấy tất cả (Chủ tài khoản) — caller không cần rẽ nhánh.
 */
export function buildMediaScopeWhere(input: MediaScopeInput): Prisma.MediaAssetWhereInput {
  const { userId, canViewAll, isOwnerRole } = input;

  // Chủ tài khoản: thấy tất cả, cả kho chung lẫn kho riêng tư.
  if (isOwnerRole) return {};

  const now = new Date();

  // Nhánh kho CŨ — luật cũ nguyên vẹn.
  const catalogBranch: Prisma.MediaAssetWhereInput = canViewAll
    ? { storageScope: 'catalog' }
    : {
        storageScope: 'catalog',
        OR: [{ ownerUserId: userId }, { visibility: 'public' }],
      };

  // Nhánh kho RIÊNG TƯ — view_all KHÔNG có tác dụng ở đây (anh chốt).
  const privateBranch: Prisma.MediaAssetWhereInput = {
    storageScope: 'private_upload',
    OR: [
      { ownerUserId: userId },
      {
        shares: {
          some: {
            sharedWithUserId: userId,
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
        },
      },
    ],
  };

  return { OR: [catalogBranch, privateBranch] };
}

/**
 * Kiểm tra quyền xem 1 tệp CỤ THỂ (khi đã có asset trong tay, không muốn query lại).
 * shares: các bản chia sẻ CÒN HIỆU LỰC của asset dành cho userId (caller tự nạp, có thể rỗng).
 */
export function canViewAsset(
  asset: { ownerUserId: string | null; visibility: string; storageScope: string },
  input: MediaScopeInput & { hasValidShare?: boolean },
): boolean {
  if (input.isOwnerRole) return true;
  if (asset.ownerUserId === input.userId) return true;

  if (asset.storageScope === 'private_upload') {
    // view_all cố tình KHÔNG được xét ở nhánh này.
    return input.hasValidShare === true;
  }
  if (input.canViewAll) return true;
  return asset.visibility === 'public';
}

/**
 * Điều kiện "bản chia sẻ còn hiệu lực" — dùng chung cho mọi query MediaShare
 * (chưa thu hồi + chưa hết hạn).
 */
export function activeShareWhere(now = new Date()): Prisma.MediaShareWhereInput {
  return {
    revokedAt: null,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
}
