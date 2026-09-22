/**
 * Pure mapping helpers for POS customers.
 *
 * Cohort eligibility lives in `hisweetie-customer-cohort.ts` because it needs
 * invoice history as well as the customer payload; this module only maps fields.
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

/**
 * KH còn hoạt động phía POS.
 *
 * This permissive guard remains for local read-model callers. The cohort uses
 * the stricter explicit `isActive === true` rule in its own selector.
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
