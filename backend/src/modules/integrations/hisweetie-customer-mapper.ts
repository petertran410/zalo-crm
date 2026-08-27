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
  /** Tên công ty (POS `organization`) — chỉ khách tổ chức mới có. */
  organization?: string | null;
  taxCode?: string | null;
  /** POS `type`: 1 = tổ chức/hộ KD, 0 = cá nhân, thiếu = không rõ. */
  isOrganization?: boolean | null;
  /** Nhóm khách hàng chính tách từ `groups` (Khách buôn, Khách lẻ…). */
  segment?: string | null;
  /** Mã sale POS tách từ `groups` (vd "phuongnt") — map sang user CRM ở lớp hiển thị. */
  posSaleCode?: string | null;
}

function firstString(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/* ── groups: "nhóm khách hàng" của POS ──────────────────────────────────────
 * Public API trả groups là MỘT CHUỖI phân tách bằng '|', trộn hai loại token:
 *   "Khách buôn|phuongnt"        → nhãn nhóm + mã sale
 *   "Khách lẻ|phuongnt|Hiển Setup" → nhiều nhãn + mã sale
 * (SDK MCP cũ trả mảng [{name}] — parser giữ tương thích cả hai dạng.)
 *
 * Phân loại token theo HÌNH THỨC, không theo danh sách cứng:
 *   mã sale  = username ascii thường ("phuongnt", "anhmtv", "tranglt")
 *   nhãn nhóm= phần còn lại (luôn chứa hoa/khoảng trắng/dấu tiếng Việt)
 * Token lạ giữ nguyên trong tags — không vứt dữ liệu. Việc mã sale này là ai
 * do bảng PosSaleMapping quyết định ở lớp hiển thị, storage chỉ giữ mã thô.
 */

/** Username ascii thường ≥3 ký tự → coi là mã sale POS. */
export function looksLikePosSaleCode(token: string): boolean {
  return /^[a-z][a-z0-9._]{2,}$/.test(token);
}

export interface ParsedPosGroups {
  /** Nhóm khách hàng đại diện (theo thứ tự ưu tiên nghiệp vụ). */
  segment: string | null;
  /** Mã sale đầu tiên tìm thấy, nếu có. */
  saleCode: string | null;
  labels: string[];
  saleCodes: string[];
  /** Toàn bộ token gốc — luôn lưu đủ vào tags. */
  tags: string[];
}

const SEGMENT_PRIORITY = [
  'khách vip cty',
  'đại lý',
  'khách hàng chiến lược',
  'khách chuỗi',
  'khách buôn',
  'khách lẻ',
];

function pickSegment(labels: string[]): string | null {
  for (const p of SEGMENT_PRIORITY) {
    const hit = labels.find((l) => l.toLowerCase().includes(p));
    if (hit) return hit;
  }
  return labels[0] ?? null;
}

export function parseCustomerGroups(raw: unknown): ParsedPosGroups {
  let tokens: unknown[] = [];
  if (typeof raw === 'string') tokens = raw.split('|');
  else if (Array.isArray(raw)) tokens = raw;

  const cleaned = tokens
    .map((t) => (typeof t === 'string' ? t : (t as any)?.name ?? ''))
    .map((t: string) => t.trim())
    .filter(Boolean);

  const saleCodes: string[] = [];
  const labels: string[] = [];
  for (const t of cleaned) {
    if (looksLikePosSaleCode(t)) saleCodes.push(t);
    else labels.push(t);
  }

  return { segment: pickSegment(labels), saleCode: saleCodes[0] ?? null, labels, saleCodes, tags: cleaned };
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

/**
 * KH còn hoạt động phía POS.
 *
 * Chỉ loại khi `isActive === false` TƯỜNG MINH. Thiếu field / null / undefined
 * vẫn coi là còn hoạt động: payload POS không phải lúc nào cũng kèm `isActive`
 * (endpoint phụ, webhook), mà mặc định "false" ở đây sẽ chặn sạch dữ liệu.
 *
 * Đây là LỚP PHÒNG THỦ, không phải bộ lọc chính. Bộ lọc chính là không gửi
 * `includeInactive=true` khi gọi Public API — POS tự loại bản ghi ngừng hoạt
 * động ở server (doc mục 3), rẻ hơn nhiều so với kéo về rồi bỏ.
 */
export function isPosCustomerActive(raw: Record<string, unknown>): boolean {
  return raw.isActive !== false;
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
    raw.invoiceAddress,
    raw.address,
  );
  // POS `type`: 0 = cá nhân, 1 = tổ chức/hộ KD. Verify 500 khách thật:
  // 61/61 khách type=1 đều có organization + taxCode, type=0 thì không có.
  const isOrganization = raw.type === 1 ? true : raw.type === 0 ? false : null;
  const parsedGroups = parseCustomerGroups(raw.groups);

  return {
    posCustomerId, posCustomerCode, name, phone, email, address,
    organization: firstString(raw.organization),
    taxCode: firstString(raw.taxCode),
    isOrganization,
    segment: parsedGroups.segment,
    posSaleCode: parsedGroups.saleCode,
  };
}
