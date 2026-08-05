/**
 * pos-billing.ts — API hoá đơn từ chat (goal 4) + catalogue sản phẩm POS.
 * Backend: hisweetie-billing-routes.ts.
 * 2026-07-18: cầu CRM → POS SANDBOX đã mở — draft lưu CRM rồi bấm "Gửi POS" riêng.
 */
import { api } from '@/api';

export interface PosBranch {
  id: number;
  name: string;
  code: string | null;
}

export interface PosProduct {
  id: number;
  code: string | null;
  name: string;
  unit: string | null;
  basePrice: number;
  vat: number | null;
  allowsSale: boolean;
}

export interface BillingLine {
  productId: number;
  quantity: number;
  unitPrice: number;
  discount?: number;
  note?: string;
  // Snapshot SP lúc chốt (backend lưu vào items JSON — 2026-07-18).
  productName?: string;
  productCode?: string | null;
  unit?: string | null;
}

export interface BillingDraft {
  id: string;
  status: string; // draft | pending_dispatch | sent | failed
  totalAmount: string;
  paidAmount: string | null;
  items: BillingLine[];
  branchId: number;
  description: string | null;
  posOrderId: number | null;
  posCustomerName: string | null;
  dispatchedAt: string | null;
  dispatchError: string | null;
  sourceMessageId: string | null;
  createdAt: string;
  createdBy: { id: string; fullName: string | null } | null;
}

export async function fetchPosBranches(): Promise<PosBranch[]> {
  const { data } = await api.get<{ items: PosBranch[] }>('/pos-catalog/branches');
  return data.items ?? [];
}

export async function searchPosProducts(params: { search?: string; branchId?: number; limit?: number }): Promise<PosProduct[]> {
  const { data } = await api.get<{ items: PosProduct[] }>('/pos-catalog/products', {
    params: { search: params.search || undefined, branchId: params.branchId, limit: params.limit ?? 20 },
  });
  return data.items ?? [];
}

export interface BillingDraftsResult {
  drafts: BillingDraft[];
  /** Nút "Gửi POS" chỉ hiện khi backend bật cờ dispatch (sandbox). */
  dispatchEnabled: boolean;
}

export async function fetchBillingDrafts(contactId: string): Promise<BillingDraftsResult> {
  const { data } = await api.get<BillingDraftsResult>(`/contacts/${contactId}/billing-drafts`);
  return { drafts: data.drafts ?? [], dispatchEnabled: data.dispatchEnabled === true };
}

export interface CreateDraftPayload {
  branchId: number;
  items: BillingLine[];
  paidAmount?: number;
  description?: string;
  sourceMessageId?: string;
}

export interface CreateDraftResult {
  draftId: string;
  totalAmount: number;
  status: string;
  dispatched: boolean;
  dispatchEnabled: boolean;
  note: string;
}

export async function createBillingDraft(contactId: string, payload: CreateDraftPayload): Promise<CreateDraftResult> {
  const { data } = await api.post<CreateDraftResult>(`/contacts/${contactId}/billing-drafts`, payload);
  return data;
}

export interface DispatchDraftResult {
  status: 'sent';
  posOrderId: number | null;
}

/** Gửi draft → POS sandbox. Lỗi (409 đã gửi, 502 POS lỗi…) throw qua axios interceptor. */
export async function dispatchBillingDraft(draftId: string): Promise<DispatchDraftResult> {
  const { data } = await api.post<DispatchDraftResult>(`/billing-drafts/${draftId}/dispatch`);
  return data;
}
