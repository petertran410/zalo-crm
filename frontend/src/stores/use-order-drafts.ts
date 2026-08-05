import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { CartItem } from '@/components/order-builder/types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OrderDraftEntry {
  id: string;
  contactId?: string;
  contactName: string;
  contactAvatar?: string;
  contactPhone?: string;
  posCustomerId?: number;
  posCustomerCode?: string;
  // Cart state
  cartItems: CartItem[];
  branchId: number | null;
  paymentMethod: string;
  orderStatus: number;
  priceBookId: string;
  orderDiscount: number;
  appliedPromoIds: string[];
  description: string;
  billNote?: string;
  shippingNote?: string;
  paidAmount: number;
  deliveryAddress: string;
  packageLength?: number;
  packageWidth?: number;
  packageHeight?: number;
  packageWeight?: number;
  orderDiscountType?: 'amount' | 'percent';
  orderDiscountValue?: number;
  // UI state
  activeSection: string;
  completedSections: string[];
  isMinimized: boolean;
  createdAt: string;
}

export interface OpenDraftOptions {
  contactId?: string;
  contactName: string;
  contactAvatar?: string;
  contactPhone?: string;
  posCustomerId?: number;
  posCustomerCode?: string;
}

// ── Store ──────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'order_drafts_v1';
const MAX_DRAFTS = 3;

function makeDraft(opts: OpenDraftOptions): OrderDraftEntry {
  return {
    id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    contactId: opts.contactId,
    contactName: opts.contactName || 'Khách hàng',
    contactAvatar: opts.contactAvatar,
    contactPhone: opts.contactPhone,
    posCustomerId: opts.posCustomerId,
    posCustomerCode: opts.posCustomerCode,
    cartItems: [],
    branchId: null,
    paymentMethod: 'cash',
    orderStatus: 1,
    priceBookId: 'standard',
    orderDiscount: 0,
    appliedPromoIds: [],
    description: '',
    billNote: '',
    shippingNote: '',
    paidAmount: 0,
    deliveryAddress: '',
    packageLength: undefined,
    packageWidth: undefined,
    packageHeight: undefined,
    packageWeight: undefined,
    orderDiscountType: 'amount',
    orderDiscountValue: 0,
    activeSection: 'customer',
    completedSections: [],
    isMinimized: false,
    createdAt: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
  };
}

export const useOrderDraftStore = defineStore('orderDrafts', () => {
  const drafts = ref<OrderDraftEntry[]>([]);

  // ID của draft đang hiển thị full modal (không minimize)
  const activeDraftId = ref<string | null>(null);

  // ── Computed ────────────────────────────────────────────────────────────────

  const activeDraft = computed(() =>
    activeDraftId.value ? drafts.value.find(d => d.id === activeDraftId.value) ?? null : null
  );

  // Chỉ hiện modal khi có active draft và draft đó không minimize
  const isModalOpen = computed(() =>
    !!activeDraft.value && !activeDraft.value.isMinimized
  );

  // Có thể mở draft mới không (chưa đến giới hạn 3, và không có modal nào đang mở full)
  const canOpenNew = computed(() => {
    const hasOpenFull = drafts.value.some(d => !d.isMinimized);
    return drafts.value.length < MAX_DRAFTS && !hasOpenFull;
  });

  // Draft đang mở full (nếu có)
  const openFullDraft = computed(() =>
    drafts.value.find(d => !d.isMinimized) ?? null
  );

  // ── Actions ─────────────────────────────────────────────────────────────────

  /**
   * Mở draft cho contact:
   * - Nếu contact đã có draft → expand draft đó (thu nhỏ cái đang mở nếu có)
   * - Nếu chưa có → tạo mới (chỉ khi canOpenNew)
   * Trả về id của draft được mở, hoặc null nếu không thể.
   */
  function openDraft(opts: OpenDraftOptions): string | null {
    // Tìm draft hiện có của contact này
    const existing = opts.contactId
      ? drafts.value.find(d => d.contactId === opts.contactId)
      : null;

    if (existing) {
      // Thu nhỏ cái đang mở (nếu khác) + expand cái existing + cập nhật avatar nếu có
      drafts.value = drafts.value.map(d => {
        if (d.id === existing.id) {
          return {
            ...d,
            isMinimized: false,
            contactAvatar: opts.contactAvatar || d.contactAvatar,
          };
        }
        if (!d.isMinimized) return { ...d, isMinimized: true };
        return d;
      });
      activeDraftId.value = existing.id;
      persist();
      return existing.id;
    }

    // Phải thu nhỏ cái đang full trước khi tạo mới
    const hasOpenFull = drafts.value.some(d => !d.isMinimized);
    if (hasOpenFull) return null;

    if (drafts.value.length >= MAX_DRAFTS) return null;

    const draft = makeDraft(opts);
    drafts.value = [...drafts.value, draft];  // immutable → trigger reactivity
    activeDraftId.value = draft.id;
    persist();
    return draft.id;
  }

  function minimizeDraft(id: string) {
    const draft = drafts.value.find(d => d.id === id);
    if (!draft) return;
    drafts.value = drafts.value.map(d =>
      d.id === id ? { ...d, isMinimized: true } : d
    );
    if (activeDraftId.value === id) activeDraftId.value = null;
    persist();
  }

  function expandDraft(id: string) {
    // Thu nhỏ tất cả + expand draft target
    drafts.value = drafts.value.map(d => {
      if (d.id === id) return { ...d, isMinimized: false };
      if (!d.isMinimized) return { ...d, isMinimized: true };
      return d;
    });
    activeDraftId.value = id;
    persist();
  }

  function closeDraft(id: string) {
    drafts.value = drafts.value.filter(d => d.id !== id);  // immutable
    if (activeDraftId.value === id) activeDraftId.value = null;
    persist();
  }

  function updateDraft(id: string, patch: Partial<Omit<OrderDraftEntry, 'id'>>) {
    drafts.value = drafts.value.map(d =>
      d.id === id ? { ...d, ...patch } : d
    );
    persist();
  }

  function setBranchDefault(id: string, branchId: number) {
    const draft = drafts.value.find(d => d.id === id);
    if (draft && !draft.branchId) {
      drafts.value = drafts.value.map(d =>
        d.id === id ? { ...d, branchId } : d
      );
      persist();
    }
  }

  // ── Persistence ─────────────────────────────────────────────────────────────

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts.value));
    } catch { /* quota exceeded — ignore */ }
  }

  function hydrate() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const loaded: OrderDraftEntry[] = JSON.parse(raw);
      // Validate + khi restore: tất cả draft đều minimize (không tự bật full modal)
      const valid = loaded.filter(d =>
        d && typeof d.id === 'string' && d.id && d.contactName && Array.isArray(d.cartItems)
      );
      drafts.value = valid.map(d => ({ ...d, isMinimized: true }));
      // Dọn nếu data hỏng
      if (valid.length !== loaded.length) persist();
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  return {
    drafts,
    activeDraftId,
    activeDraft,
    isModalOpen,
    canOpenNew,
    openFullDraft,
    openDraft,
    minimizeDraft,
    expandDraft,
    closeDraft,
    updateDraft,
    setBranchDefault,
    persist,
    hydrate,
  };
});
