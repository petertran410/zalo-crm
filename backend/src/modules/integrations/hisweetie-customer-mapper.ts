/**
 * hisweetie-customer-mapper.ts — Logic THUẦN cho POS customer sync (lọc + map field).
 *
 * Tách khỏi hisweetie-sync-cron.ts để test không cần DATABASE_URL/Redis (cron kéo
 * theo prisma-client → throw lúc import nếu thiếu env). Cùng pattern task-time.ts.
 *
 * ── Định nghĩa KH "engaged" (anh chốt 2026-07-15, verify live sandbox) ──────
 * POS trả 50.446 KH nhưng `isActive` VÔ DỤNG làm bộ lọc: 100% record đều
 * isActive=true (0 record false). Phải lọc bằng tín hiệu thương mại:
 *
 *   TIỀN TRỰC TIẾP  purchased>0 || debt!=0          5.150   → engaged
 *   ĐIỂM + có dấu vết tài chính (revenue/invoiced)    682   → engaged
 *   ĐIỂM nhưng KHÔNG dấu vết tài chính nào            294   → BỎ (anh chốt)
 *   ────────────────────────────────────────────────────────
 *   TỔNG SYNC                                       5.832
 *
 * Anh chốt BỎ nhóm 294 "điểm suông": có điểm nhưng revenue/invoiced/purchased/
 * debt đều = 0 → không chứng minh được giao dịch thật.
 * LƯU Ý cho người sửa sau: nhóm này KHÔNG phải rác — soi mẫu thấy toàn KH doanh
 * nghiệp có tên thật + đã gán sale (id 2136 "CÔNG TY BINGXUE VIỆT NAM (Sale 1)"
 * 8.370 điểm ₫0; id 293 "Trung tâm đào tạo Tiến Phan - Đà Nẵng (sale 2 - A2)").
 * Đây là quyết định NGHIỆP VỤ, không phải dọn data hỏng — muốn lấy lại thì bỏ
 * điều kiện hasFinancialTrace là ra 6.126.
 *
 * KHÔNG dùng totalPurchased một mình (chỉ 3.010 — hụt nửa tập): POS có 22.865 KH
 * `totalRevenue > 0` nhưng `totalPurchased = 0` — đó là KH ĐÃ XUẤT HOÁ ĐƠN NHƯNG
 * CHƯA TRẢ (tiền nằm ở totalDebt). Cũng KHÔNG lấy revenue/invoiced làm tín hiệu
 * ĐỘC LẬP (26.5k — quá rộng): chúng chỉ dùng để XÁC NHẬN nhóm có điểm.
 *
 * ── rewardPoint / totalPoint: CHƯA BIẾT NGHĨA NGHIỆP VỤ ────────────────────
 * SDK @dieptra/mcp-client KHÔNG document 2 field này (0 chỗ nhắc tới, kể cả
 * README). Tên gợi ý "điểm thưởng" nhưng CHƯA xác nhận với Hisweetie — đừng suy
 * diễn thêm nghĩa từ tên field.
 *
 * Sự thật ĐO ĐƯỢC (quét đủ 50.443 record sandbox 2026-07-15):
 *   - rewardPoint là NUMBER, totalPoint là STRING → luôn parse qua num().
 *   - rewardPoint > 0: 1.897 | totalPoint > 0: 1.102 | HỢP: 1.897
 *   - `totalPoint > 0` mà `rewardPoint == 0`: 0 CA (không có ngoại lệ)
 *     → totalPoint là TẬP CON THỰC SỰ của rewardPoint; term totalPoint DƯ (bỏ đi
 *       kết quả không đổi). Giữ làm lớp phòng thủ vì CHƯA verify trên PROD.
 *   - 2 field KHÁC nhau ở 1.113 record (vd id 2136: reward=8370, point="8";
 *     id 42745: reward=72, point="0") → KHÔNG phải alias của nhau, không có tỉ lệ
 *     cố định giữa 2 giá trị.
 */

export interface MappedPosCustomer {
  posCustomerId: number | null;
  posCustomerCode: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
}

function firstString(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/** POS trả số tiền dạng string ("127050") → parse an toàn, rác/null = 0. */
function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * KH "có tương tác thương mại" — xem header để biết vì sao bộ tín hiệu này.
 * Tiền trực tiếp → engaged ngay. Chỉ có điểm → cần thêm dấu vết tài chính
 * (revenue/invoiced) mới tính; điểm suông không đủ (anh chốt 2026-07-15).
 */
export function isEngagedCustomer(raw: Record<string, unknown>): boolean {
  if (num(raw.totalPurchased) > 0 || num(raw.totalDebt) !== 0) return true;

  const hasPoints = num(raw.rewardPoint) > 0 || num(raw.totalPoint) > 0;
  const hasFinancialTrace = num(raw.totalRevenue) > 0 || num(raw.totalInvoiced) > 0;
  return hasPoints && hasFinancialTrace;
}

/** Map record POS → field CRM. Field name verify từ payload sandbox thật (id 69248). */
export function extractCustomer(raw: Record<string, unknown>): MappedPosCustomer {
  const idRaw = raw.id ?? raw.customerId;
  const posCustomerId = typeof idRaw === 'number'
    ? idRaw
    : (idRaw != null && idRaw !== '' && Number.isFinite(Number(idRaw)) ? Number(idRaw) : null);
  const posCustomerCode = firstString(raw.code, raw.customerCode);
  const name = firstString(raw.name, raw.fullName, raw.customerName);
  const phone = firstString(raw.contactNumber, raw.phone, raw.phoneNumber);
  const email = firstString(raw.email);
  const addresses = Array.isArray(raw.addresses) ? raw.addresses as Record<string, unknown>[] : [];
  const address = firstString(
    addresses.find((a) => a?.isDefault)?.address,
    addresses[0]?.address,
    raw.address,
  );
  return { posCustomerId, posCustomerCode, name, phone, email, address };
}
