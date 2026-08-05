/**
 * hisweetie-customer-patch.ts — Dựng payload ghi ngược CRM → POS (goal 2).
 *
 * Logic THUẦN, tách riêng để test không cần DATABASE_URL/Redis/POS.
 *
 * ── POS KHÔNG NHẬN `addresses` (verify live sandbox 2026-07-16) ────────────
 * `crm_update_customer` BÁO LỖI với MỌI shape addresses đã thử:
 *   []                                      → lỗi
 *   [{address}]                             → lỗi
 *   [{address,isDefault}]                   → lỗi
 *   [{address,wardName,isDefault}]          → lỗi
 *   [{...object POS vừa TRẢ VỀ, y nguyên}]  → lỗi
 * Tức KHÔNG phải sai shape — tool này đơn giản là không cho sửa địa chỉ. Cùng lúc
 * đó name/phone/contactNumber/email update BÌNH THƯỜNG.
 *
 * → HỆ QUẢ NGHIỆP VỤ: yêu cầu "sale sửa địa chỉ bên CRM → POS cập nhật theo" KHÔNG
 *   làm được qua MCP hiện tại. Phải hỏi Hisweetie mở tool sửa địa chỉ. Nếu cứ gửi
 *   addresses thì MỌI push của KH có địa chỉ đều fail (retry 3 lần rồi chết) →
 *   TUYỆT ĐỐI không đưa addresses vào payload cho tới khi Hisweetie xác nhận.
 *
 * ── phone vs contactNumber ─────────────────────────────────────────────────
 * POS có CẢ HAI và data thật để trùng giá trị (vd KH 69248 cả 2 = "84795453491").
 * hisweetie-customer-mapper.ts đọc contactNumber TRƯỚC rồi mới tới phone → nếu chỉ
 * ghi `phone` thì contactNumber thành cũ, lần sync sau đọc phải số cũ. Vì vậy ghi
 * CẢ HAI cho khớp nhau.
 */

export interface PosCustomerPatchInput {
  crmName: string | null;
  fullName: string | null;
  phone: string | null;
  email: string | null;
}

/**
 * Trả về patch gửi POS, hoặc null nếu KHÔNG có gì đáng gửi (tránh gọi POS thừa).
 * `undefined` = không đụng field đó bên POS.
 */
export function buildPosCustomerPatch(c: PosCustomerPatchInput): Record<string, unknown> | null {
  const patch: Record<string, unknown> = {};

  const name = (c.crmName || c.fullName || '').trim();
  if (name) patch.name = name;

  const phone = (c.phone || '').trim();
  if (phone) {
    patch.phone = phone;
    patch.contactNumber = phone; // giữ 2 field POS khớp nhau — xem header
  }

  const email = (c.email || '').trim();
  if (email) patch.email = email;

  // KHÔNG BAO GIỜ thêm `addresses` — POS từ chối (xem header).

  return Object.keys(patch).length ? patch : null;
}
