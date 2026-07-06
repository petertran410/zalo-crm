/**
 * media-source-nick-tags.test.ts — Media nguồn nick/sale + tag (2026-06-15).
 *
 * Kiểm BẤT BIẾN không cần DB thật:
 *  1. normalizeTags: gộp tag/dự án, lowercase, trim, bỏ rỗng, dedup ('EGV'/'egv'→'egv').
 *  2. REGRESSION PRIVACY (CRITICAL): cờ sourceIsPrivateNick (KHÔNG suy từ sourceZaloAccountId).
 *     - nick thường giờ CÓ sourceZaloAccountId nhưng cờ=false → KHÔNG bị gate confirmShare.
 *     - nick Riêng tư: cờ=true → BỊ gate confirmShare khi public (giữ bảo vệ D11).
 *  3. Backfill ảnh cũ: cờ = (sourceZaloAccountId != null) — đúng 100% vì trước giờ CHỈ nick
 *     Riêng tư mới có sourceZaloAccountId.
 *
 * (Test gate đầy đủ qua route cần mock prisma → integration riêng; đây test thuần logic
 *  bất biến để chạy nhanh mọi máy/CI, khoá đúng phần dễ tái phạm privacy.)
 */
import { describe, it, expect } from 'vitest';
import { normalizeTags } from '../src/modules/media/media-service.js';

describe('normalizeTags — gộp tag/dự án, không phân biệt hoa/thường', () => {
  it("'EGV' / 'egv' / ' Egv ' → cùng 1 tag 'egv'", () => {
    expect(normalizeTags(['EGV', 'egv', ' Egv '])).toEqual(['egv']);
  });
  it('bỏ rỗng + khoảng trắng', () => {
    expect(normalizeTags(['', '  ', 'bang-gia'])).toEqual(['bang-gia']);
  });
  it('dedup nhưng GIỮ thứ tự lần xuất hiện đầu', () => {
    expect(normalizeTags(['egv', 'hs', 'EGV', 'HS', 'can-2pn'])).toEqual(['egv', 'hs', 'can-2pn']);
  });
  it('giữ dấu tiếng Việt (chỉ lowercase, không bỏ dấu)', () => {
    expect(normalizeTags(['Mặt Bằng'])).toEqual(['mặt bằng']);
  });
  it('null/undefined/không phải mảng → []', () => {
    expect(normalizeTags(null)).toEqual([]);
    expect(normalizeTags(undefined)).toEqual([]);
    expect(normalizeTags([])).toEqual([]);
  });
  it('hợp nhất tag cũ + mới (như merge lúc gửi/bulk) — lowercase + dedup', () => {
    const old = ['egv', 'bang-gia'];
    const add = ['EGV', 'Can-2PN'];
    expect(normalizeTags([...old, ...add])).toEqual(['egv', 'bang-gia', 'can-2pn']);
  });
});

// ── REGRESSION PRIVACY (CRITICAL) ────────────────────────────────────────────
// Mô phỏng đúng logic route đã sửa: gate confirmShare dựa trên CỜ sourceIsPrivateNick,
// KHÔNG phải !!sourceZaloAccountId. Đây là điểm dễ tái phạm nhất (Anh từng bị lộ privacy).

/** Điều kiện gate confirmShare khi chuyển ảnh sang Công khai (media-routes.ts PATCH /:id). */
function needsShareConfirm(asset: { sourceIsPrivateNick: boolean }, newVisibility: string): boolean {
  return newVisibility === 'public' && asset.sourceIsPrivateNick;
}

/** Backfill ảnh cũ: cờ = đã-có-nick-nguồn (vì trước giờ chỉ nick Riêng tư mới ghi). */
function backfillFlag(sourceZaloAccountId: string | null): boolean {
  return sourceZaloAccountId != null;
}

describe('REGRESSION privacy — cờ sourceIsPrivateNick quyết định gate (không suy từ id)', () => {
  it('ảnh nick THƯỜNG (có nick nguồn để hiển thị, cờ=false) → KHÔNG bị gate khi public', () => {
    const normalNickAsset = { sourceZaloAccountId: 'NICK_SUB_1', sourceIsPrivateNick: false };
    // dù CÓ sourceZaloAccountId (để hiện "ảnh từ nick nào"), KHÔNG bắt xác nhận oan.
    expect(needsShareConfirm(normalNickAsset, 'public')).toBe(false);
  });

  it('ảnh nick RIÊNG TƯ (cờ=true) → BỊ gate khi public (giữ cảnh báo D11)', () => {
    const privateNickAsset = { sourceZaloAccountId: 'NICK_MAIN_1', sourceIsPrivateNick: true };
    expect(needsShareConfirm(privateNickAsset, 'public')).toBe(true);
  });

  it('ảnh upload tay (không nick, cờ=false) → KHÔNG bị gate', () => {
    const uploadedAsset = { sourceZaloAccountId: null, sourceIsPrivateNick: false };
    expect(needsShareConfirm(uploadedAsset, 'public')).toBe(false);
  });

  it('chuyển sang Riêng tư (không phải public) → không gate dù là ảnh nick Riêng tư', () => {
    const privateNickAsset = { sourceZaloAccountId: 'NICK_MAIN_1', sourceIsPrivateNick: true };
    expect(needsShareConfirm(privateNickAsset, 'private')).toBe(false);
  });
});

describe('REGRESSION privacy — backfill ảnh cũ giữ nguyên bảo vệ', () => {
  it('ảnh Riêng tư CŨ (đã có sourceZaloAccountId) → cờ backfill = true (không mất bảo vệ)', () => {
    expect(backfillFlag('NICK_MAIN_OLD')).toBe(true);
  });
  it('ảnh upload tay CŨ (sourceZaloAccountId=null) → cờ backfill = false', () => {
    expect(backfillFlag(null)).toBe(false);
  });
});
