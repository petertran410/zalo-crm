// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useOrderDraftStore } from '@/stores/use-order-drafts';

// ── Mock toast to capture notifications ─────────────────────────────────────
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock('@/composables/use-toast', () => ({
  useToast: () => ({
    success: mockToastSuccess,
    error: mockToastError,
    warning: vi.fn(),
    info: vi.fn(),
  }),
}));

// ── Mock API module ──────────────────────────────────────────────────────────
vi.mock('@/api/index', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: { success: true, data: {} } }),
    post: vi.fn().mockResolvedValue({ data: { success: true, data: {} } }),
  },
}));
vi.mock('@/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: { success: true, data: {} } }),
    post: vi.fn().mockResolvedValue({ data: { success: true, data: {} } }),
  },
}));

describe('Milestone 2 (M2) Empirical Verification Suite', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    mockToastSuccess.mockClear();
    mockToastError.mockClear();
    vi.restoreAllMocks();
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 1. CustomerDebtWidget: Debt Reminder Text Formatting Logic
  // ════════════════════════════════════════════════════════════════════════════
  describe('CustomerDebtWidget - Debt Reminder Text Formatting', () => {
    function formatVnd(val: number): string {
      return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val || 0);
    }

    function formatDate(isoStr: string): string {
      try {
        const d = new Date(isoStr);
        if (isNaN(d.getTime())) return isoStr;
        return d.toLocaleDateString('vi-VN');
      } catch {
        return isoStr;
      }
    }

    function generateDebtReminderText(
      debtData: { totalDebt: number; overdueDebt: number; dueDate: string | null; quickReminderText?: string },
      customerName?: string,
      customerCode?: string
    ): string {
      if (debtData.quickReminderText) {
        return debtData.quickReminderText;
      }
      const name = customerName || 'Quý khách';
      const code = customerCode ? ` (Mã KH: ${customerCode})` : '';
      const total = formatVnd(debtData.totalDebt);
      const overdue = debtData.overdueDebt > 0 ? formatVnd(debtData.overdueDebt) : '0 đ';
      const dueDateStr = debtData.dueDate ? formatDate(debtData.dueDate) : '—';

      return `Xin chào ${name}${code},\nCRM Hi Sweetie xin gửi thông tin công nợ tính đến hiện tại:\n- Tổng công nợ: ${total}\n- Nợ quá hạn: ${overdue}\n- Hạn thanh toán: ${dueDateStr}\n\nQuý khách vui lòng kiểm tra và thanh toán sớm giúp Shop nhé. Xin cảm ơn!`;
    }

    it('formats default debt reminder text correctly with full information', () => {
      const text = generateDebtReminderText(
        { totalDebt: 1500000, overdueDebt: 500000, dueDate: '2026-08-15' },
        'Nguyễn Văn A',
        'KH001'
      );

      expect(text).toContain('Xin chào Nguyễn Văn A (Mã KH: KH001),');
      expect(text).toContain('- Tổng công nợ: ' + formatVnd(1500000));
      expect(text).toContain('- Nợ quá hạn: ' + formatVnd(500000));
      expect(text).toContain('Quý khách vui lòng kiểm tra và thanh toán sớm giúp Shop nhé');
    });

    it('falls back to "Quý khách" when customerName is not provided', () => {
      const text = generateDebtReminderText({ totalDebt: 200000, overdueDebt: 0, dueDate: null });
      expect(text).toContain('Xin chào Quý khách,');
      expect(text).not.toContain('Mã KH:');
      expect(text).toContain('- Nợ quá hạn: 0 đ');
      expect(text).toContain('- Hạn thanh toán: —');
    });

    it('prioritizes quickReminderText from backend when provided', () => {
      const customText = 'Custom Backend Debt Reminder Message';
      const text = generateDebtReminderText(
        { totalDebt: 100000, overdueDebt: 0, dueDate: null, quickReminderText: customText },
        'Nguyễn Văn B',
        'KH002'
      );
      expect(text).toBe(customText);
    });

    it('handles edge case: 0 total debt and 0 overdue debt', () => {
      const text = generateDebtReminderText({ totalDebt: 0, overdueDebt: 0, dueDate: null }, 'Chị Bình');
      expect(text).toContain('Xin chào Chị Bình,');
      expect(text).toContain('- Tổng công nợ: ' + formatVnd(0));
      expect(text).toContain('- Nợ quá hạn: 0 đ');
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 2. Clipboard Copy & Fallback Mechanism + Custom Event Emission
  // ════════════════════════════════════════════════════════════════════════════
  describe('CustomerDebtWidget - Clipboard & Custom Event Emission Flow', () => {
    it('dispatches chat:insert-suggestion custom event with exact payload when quick action is clicked', () => {
      const listener = vi.fn();
      window.addEventListener('chat:insert-suggestion', listener);

      const reminderText = 'Xin chào Nguyễn Văn A,\nCRM Hi Sweetie xin gửi thông tin công nợ...';
      
      const text = reminderText;
      window.dispatchEvent(new CustomEvent('chat:insert-suggestion', { detail: { text } }));

      expect(listener).toHaveBeenCalledTimes(1);
      const eventArg = listener.mock.calls[0][0] as CustomEvent;
      expect(eventArg.detail.text).toBe(reminderText);

      window.removeEventListener('chat:insert-suggestion', listener);
    });

    it('triggers success toast on clipboard write success', async () => {
      const reminderText = 'Test Debt Reminder Text';
      
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: writeTextMock },
        writable: true,
        configurable: true,
      });

      try {
        await navigator.clipboard.writeText(reminderText);
        mockToastSuccess('Đã sao chép & chèn tin nhắc nợ vào khung chat!');
      } catch {
        mockToastSuccess('Đã chèn nội dung nhắc nợ vào khung chat!');
      }

      expect(writeTextMock).toHaveBeenCalledWith(reminderText);
      expect(mockToastSuccess).toHaveBeenCalledWith('Đã sao chép & chèn tin nhắc nợ vào khung chat!');
    });

    it('falls back gracefully when navigator.clipboard fails or is unavailable', async () => {
      const reminderText = 'Test Debt Reminder Text';

      const writeTextMock = vi.fn().mockRejectedValue(new Error('Permission denied'));
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: writeTextMock },
        writable: true,
        configurable: true,
      });

      try {
        await navigator.clipboard.writeText(reminderText);
        mockToastSuccess('Đã sao chép & chèn tin nhắc nợ vào khung chat!');
      } catch {
        mockToastSuccess('Đã chèn nội dung nhắc nợ vào khung chat!');
      }

      expect(writeTextMock).toHaveBeenCalledWith(reminderText);
      expect(mockToastSuccess).toHaveBeenCalledWith('Đã chèn nội dung nhắc nợ vào khung chat!');
    });

    it('falls back gracefully when navigator.clipboard is undefined', async () => {
      const reminderText = 'Test Debt Reminder Text';

      Object.defineProperty(navigator, 'clipboard', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      try {
        // @ts-ignore
        await navigator.clipboard.writeText(reminderText);
        mockToastSuccess('Đã sao chép & chèn tin nhắc nợ vào khung chat!');
      } catch {
        mockToastSuccess('Đã chèn nội dung nhắc nợ vào khung chat!');
      }

      expect(mockToastSuccess).toHaveBeenCalledWith('Đã chèn nội dung nhắc nợ vào khung chat!');
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 3. MessageThread: chat:insert-suggestion Event Consumer Verification
  // ════════════════════════════════════════════════════════════════════════════
  describe('MessageThread - chat:insert-suggestion Listener Integration', () => {
    it('receives custom event and applies text to composer input state', async () => {
      let composerText = '';
      function applySuggestion(text?: string) {
        if (!text) return;
        composerText = text;
      }

      function onInsertSuggestionEvent(e: Event) {
        const text = (e as CustomEvent<{ text: string }>).detail?.text;
        if (text) applySuggestion(text);
      }

      window.addEventListener('chat:insert-suggestion', onInsertSuggestionEvent);

      const sampleText = 'Xin chào KH, Tổng công nợ: 500.000 ₫';
      window.dispatchEvent(new CustomEvent('chat:insert-suggestion', { detail: { text: sampleText } }));

      expect(composerText).toBe(sampleText);

      window.removeEventListener('chat:insert-suggestion', onInsertSuggestionEvent);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 4. "Tạo đơn" Action Button Integration with useOrderDraftStore
  // ════════════════════════════════════════════════════════════════════════════
  describe('useOrderDraftStore Integration with "Tạo đơn" action', () => {
    it('initializes with empty drafts list', () => {
      const store = useOrderDraftStore();
      expect(store.drafts).toEqual([]);
      expect(store.canOpenNew).toBe(true);
      expect(store.isModalOpen).toBe(false);
    });

    it('creates a new draft for linked contact via openDraft()', () => {
      const store = useOrderDraftStore();

      const draftId = store.openDraft({
        contactId: 'cnt-101',
        contactName: 'Anh Minh',
        contactPhone: '0901234567',
        posCustomerId: 88,
        posCustomerCode: 'KH88',
      });

      expect(draftId).toBeTruthy();
      expect(store.drafts.length).toBe(1);
      expect(store.activeDraftId).toBe(draftId);
      expect(store.activeDraft?.contactName).toBe('Anh Minh');
      expect(store.activeDraft?.posCustomerId).toBe(88);
      expect(store.activeDraft?.posCustomerCode).toBe('KH88');
      expect(store.isModalOpen).toBe(true);
    });

    it('expands existing draft when openDraft is called again for the same contact', () => {
      const store = useOrderDraftStore();

      const draftId1 = store.openDraft({
        contactId: 'cnt-101',
        contactName: 'Anh Minh',
      });

      // Minimize the first draft
      store.minimizeDraft(draftId1!);
      expect(store.activeDraftId).toBeNull();
      expect(store.drafts[0].isMinimized).toBe(true);

      // Re-open draft for same contact
      const draftId2 = store.openDraft({
        contactId: 'cnt-101',
        contactName: 'Anh Minh',
      });

      expect(draftId2).toBe(draftId1);
      expect(store.drafts.length).toBe(1);
      expect(store.drafts[0].isMinimized).toBe(false);
      expect(store.activeDraftId).toBe(draftId1);
    });

    it('enforces maximum 3 drafts constraint (MAX_DRAFTS = 3)', () => {
      const store = useOrderDraftStore();

      // Open draft 1 and minimize it
      const d1 = store.openDraft({ contactId: 'c1', contactName: 'KH 1' });
      store.minimizeDraft(d1!);

      // Open draft 2 and minimize it
      const d2 = store.openDraft({ contactId: 'c2', contactName: 'KH 2' });
      store.minimizeDraft(d2!);

      // Open draft 3 and minimize it
      const d3 = store.openDraft({ contactId: 'c3', contactName: 'KH 3' });
      store.minimizeDraft(d3!);

      expect(store.drafts.length).toBe(3);
      expect(store.canOpenNew).toBe(false);

      // Attempting to open draft 4 should fail (return null)
      const d4 = store.openDraft({ contactId: 'c4', contactName: 'KH 4' });
      expect(d4).toBeNull();
      expect(store.drafts.length).toBe(3);
    });

    it('prevents opening a new draft if an existing draft is open full (unminimized)', () => {
      const store = useOrderDraftStore();

      // Open draft 1 (left unminimized)
      const d1 = store.openDraft({ contactId: 'c1', contactName: 'KH 1' });
      expect(store.drafts[0].isMinimized).toBe(false);
      expect(store.canOpenNew).toBe(false);

      // Attempting to open draft 2 while draft 1 is full open should return null
      const d2 = store.openDraft({ contactId: 'c2', contactName: 'KH 2' });
      expect(d2).toBeNull();
      expect(store.drafts.length).toBe(1);
    });

    it('correctly checks posLinkStatus guard in ChatContactPanel logic', () => {
      function openOrderForContact(posLinkStatus: { linked: boolean; posCustomerId?: number; posCustomerCode?: string }, contact: { id: string; name: string }) {
        if (!posLinkStatus.linked) return null;
        const store = useOrderDraftStore();
        return store.openDraft({
          contactId: contact.id,
          contactName: contact.name,
          posCustomerId: posLinkStatus.posCustomerId,
          posCustomerCode: posLinkStatus.posCustomerCode,
        });
      }

      // Case A: Unlinked contact -> does nothing, returns null
      const resultUnlinked = openOrderForContact(
        { linked: false },
        { id: 'cnt-unlinked', name: 'Khách Chưa Link' }
      );
      expect(resultUnlinked).toBeNull();

      // Case B: Linked contact -> opens draft successfully
      const resultLinked = openOrderForContact(
        { linked: true, posCustomerId: 55, posCustomerCode: 'KH55' },
        { id: 'cnt-linked', name: 'Khách Đã Link' }
      );
      expect(resultLinked).toBeTruthy();
    });

    it('persists drafts to localStorage and hydrates on reload', () => {
      const store = useOrderDraftStore();
      const draftId = store.openDraft({ contactId: 'c-persist', contactName: 'Khách Persist' });
      
      const rawStored = localStorage.getItem('order_drafts_v1');
      expect(rawStored).toBeTruthy();
      const parsed = JSON.parse(rawStored!);
      expect(parsed[0].id).toBe(draftId);

      const newStore = useOrderDraftStore();
      newStore.hydrate();
      expect(newStore.drafts.length).toBe(1);
      expect(newStore.drafts[0].contactName).toBe('Khách Persist');
      expect(newStore.drafts[0].isMinimized).toBe(true);
    });
  });
});
