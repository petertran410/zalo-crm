/**
 * hisweetie-billing.ts — Dựng + kiểm tra payload tạo hoá đơn (goal 4) từ chat CRM.
 *
 * Logic THUẦN (validate + build OrderInput), tách để test không cần DB/POS.
 *
 * ── RANH GIỚI (anh chốt 2026-07-16) ────────────────────────────────────────
 * File này CHỈ dựng + validate payload. KHÔNG gọi POS. Việc bắc cầu CRM → POS
 * (client.orders.create) BỊ KHOÁ tới khi có quyền ghi POS thật — xem
 * hisweetie-billing-service.ts (dispatch chặn cứng).
 *
 * OrderInput (theo @dieptra/mcp-client types.d.ts):
 *   customerId  = Contact.posCustomerId  (BẮT BUỘC — KH phải đã link POS)
 *   branchId    = chi nhánh xuất hàng    (BẮT BUỘC)
 *   items[]     = { productId, quantity, unitPrice, discount?, note? }
 *   orderDate?, paidAmount?, description?
 *
 * LƯU Ý: productId/unitPrice phải khớp POS. CRM KHÔNG có product catalog (roadmap:
 * product sống ở POS) → giá/sản phẩm phải lấy từ POS lúc tạo, không tự bịa.
 */

export interface BillingLineInput {
  productId: number;
  quantity: number;
  unitPrice: number;
  discount?: number;
  note?: string;
  // Snapshot SP lúc chốt (2026-07-18) — POS là nguồn catalog, CRM lưu tên/mã/đơn vị
  // vào items JSON để draft tự hiển thị được (không gọi POS lại) + gửi kèm khi dispatch.
  productName?: string;
  productCode?: string | null;
  unit?: string | null;
}

export interface BuildOrderArgs {
  posCustomerId: number | null;
  branchId: number | null;
  items: BillingLineInput[];
  paidAmount?: number;
  description?: string;
  orderDate?: string;
}

export interface OrderInputPayload {
  customerId: number;
  branchId: number;
  items: Array<{
    productId: number; quantity: number; unitPrice: number; discount?: number; note?: string;
    productName?: string; productCode?: string | null; unit?: string | null;
  }>;
  paidAmount?: number;
  description?: string;
  orderDate?: string;
}

export interface BuildOrderResult {
  ok: boolean;
  errors: string[];
  payload: OrderInputPayload | null;
  /** Tổng tiền (sum quantity×unitPrice − discount) — persist để hiện trong chat + đối soát. */
  totalAmount: number;
}

function lineSubtotal(l: BillingLineInput): number {
  const gross = l.quantity * l.unitPrice;
  const disc = l.discount ?? 0;
  return gross - disc;
}

/**
 * Validate + dựng OrderInput. Trả errors[] rỗng khi hợp lệ. KHÔNG bao giờ throw —
 * caller quyết định (route trả 400, service không persist).
 */
export function buildOrderPayload(args: BuildOrderArgs): BuildOrderResult {
  const errors: string[] = [];

  if (args.posCustomerId == null) {
    errors.push('KH chưa liên kết POS (thiếu posCustomerId) — không thể tạo hoá đơn');
  }
  if (args.branchId == null) {
    errors.push('Thiếu chi nhánh (branchId)');
  }
  if (!Array.isArray(args.items) || args.items.length === 0) {
    errors.push('Hoá đơn phải có ít nhất 1 sản phẩm');
  }

  const items = Array.isArray(args.items) ? args.items : [];
  items.forEach((l, i) => {
    const n = i + 1;
    if (!Number.isInteger(l.productId) || l.productId <= 0) errors.push(`Dòng ${n}: productId không hợp lệ`);
    if (!Number.isFinite(l.quantity) || l.quantity <= 0) errors.push(`Dòng ${n}: số lượng phải > 0`);
    if (!Number.isFinite(l.unitPrice) || l.unitPrice < 0) errors.push(`Dòng ${n}: đơn giá không hợp lệ`);
    if (l.discount != null && (!Number.isFinite(l.discount) || l.discount < 0)) errors.push(`Dòng ${n}: giảm giá không hợp lệ`);
    if (l.discount != null && l.discount > l.quantity * l.unitPrice) errors.push(`Dòng ${n}: giảm giá vượt quá thành tiền`);
  });

  const totalAmount = items.reduce((sum, l) => sum + Math.max(0, lineSubtotal(l)), 0);

  if (args.paidAmount != null) {
    if (!Number.isFinite(args.paidAmount) || args.paidAmount < 0) errors.push('Số tiền đã trả không hợp lệ');
    else if (args.paidAmount > totalAmount) errors.push('Số tiền đã trả vượt quá tổng hoá đơn');
  }

  if (errors.length) return { ok: false, errors, payload: null, totalAmount };

  const payload: OrderInputPayload = {
    customerId: args.posCustomerId!,
    branchId: args.branchId!,
    // Whitelist field (kể cả snapshot) — chặn key rác từ client lọt vào items JSON.
    items: items.map((l) => ({
      productId: l.productId,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      ...(l.discount != null ? { discount: l.discount } : {}),
      ...(l.note ? { note: l.note } : {}),
      ...(l.productName ? { productName: l.productName } : {}),
      ...(l.productCode ? { productCode: l.productCode } : {}),
      ...(l.unit ? { unit: l.unit } : {}),
    })),
    ...(args.paidAmount != null ? { paidAmount: args.paidAmount } : {}),
    ...(args.description ? { description: args.description } : {}),
    ...(args.orderDate ? { orderDate: args.orderDate } : {}),
  };

  return { ok: true, errors: [], payload, totalAmount };
}

// ── Dispatch payload (2026-07-18 — mở cầu SANDBOX) ─────────────────────────────
// POS OrderInput CHỈ nhận field chuẩn (bài học goal 2: field lạ như `addresses` bị
// từ chối mọi shape) → tên KH + tên SP đi trong `description` + `note` (đều là field
// chính thức), KHÔNG gửi key tự chế.

export interface BuildDispatchArgs {
  draftId: string;
  posCustomerId: number;
  posCustomerName?: string | null;
  branchId: number;
  items: BillingLineInput[];
  paidAmount?: number | null;
  description?: string | null;
}

export interface DispatchOrderPayload {
  customerId: number;
  branchId: number;
  items: Array<{ productId: number; quantity: number; unitPrice: number; discount?: number; note?: string }>;
  paidAmount?: number;
  description: string;
  // Khớp index signature của OrderInput (@dieptra/mcp-client) — KHÔNG thêm key tự chế
  // vào payload thật (bài học `addresses` goal 2).
  [key: string]: unknown;
}

/** Dựng OrderInput gửi POS sandbox từ snapshot draft đã lưu. Thuần — không DB/POS. */
export function buildDispatchPayload(args: BuildDispatchArgs): DispatchOrderPayload {
  const who = args.posCustomerName?.trim()
    ? `KH: ${args.posCustomerName.trim()} (POS #${args.posCustomerId})`
    : `KH POS #${args.posCustomerId}`;
  const parts = [`[CRM draft ${args.draftId}]`, who];
  if (args.description?.trim()) parts.push(args.description.trim());

  return {
    customerId: args.posCustomerId,
    branchId: args.branchId,
    items: args.items.map((l) => {
      // note mang tên SP snapshot để dòng hàng bên POS tự mô tả được.
      const note = l.productName
        ? (l.note ? `${l.productName} — ${l.note}` : l.productName)
        : l.note;
      return {
        productId: l.productId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        ...(l.discount != null ? { discount: l.discount } : {}),
        ...(note ? { note } : {}),
      };
    }),
    ...(args.paidAmount != null ? { paidAmount: args.paidAmount } : {}),
    description: parts.join(' — '),
  };
}
