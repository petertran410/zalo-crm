// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import CustomerDebtWidget from './CustomerDebtWidget.vue';
import BranchInventoryWidget from './BranchInventoryWidget.vue';
import CustomerOrdersWidget from './CustomerOrdersWidget.vue';
import SyncHeaderWidget from './SyncHeaderWidget.vue';
import { usePosNotification } from '@/composables/use-pos-notification';
import { usePosSocket } from '@/composables/use-pos-socket';

// ── Mocks ──────────────────────────────────────────────────────────────────
const mockApiGet = vi.fn();
const mockApiPost = vi.fn();

vi.mock('@/api/index', () => ({
  api: {
    get: (...args: any[]) => mockApiGet(...args),
    post: (...args: any[]) => mockApiPost(...args),
  },
  createAppSocket: () => ({
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    connected: true,
  }),
}));

const mockPushWithAction = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
const mockToastInfo = vi.fn();

vi.mock('@/composables/use-toast', () => ({
  useToast: () => ({
    pushWithAction: mockPushWithAction,
    success: mockToastSuccess,
    error: mockToastError,
    info: mockToastInfo,
  }),
}));

const mockRouterPush = vi.fn().mockResolvedValue(true);
vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: mockRouterPush,
  }),
}));

const mockOpenDraft = vi.fn();
vi.mock('@/stores/use-order-drafts', () => ({
  useOrderDraftStore: () => ({
    canOpenNew: true,
    openDraft: mockOpenDraft,
  }),
}));

const mockUser = { id: 'u1', orgId: 'org-123', role: 'admin' };
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    isAdmin: true,
    isAuthenticated: true,
    user: mockUser,
    canAccess: () => true,
  }),
}));

describe('Milestone 5 (M5) Criteria 2 & 4 Empirical Challenger Verification Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ════════════════════════════════════════════════════════════════════════
  // Criterion 2: Chat Zalo Customer 360 UI Widgets
  // ════════════════════════════════════════════════════════════════════════
  describe('Criterion 2 — Customer 360 Widgets', () => {
    it('2.1 Orders Widget: displays history, pagination, and triggers quick order creation', async () => {
      mockApiGet.mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            orders: [
              { id: 'o1', code: 'HD0001', orderStatus: 'Done', grandTotal: 1500000, createdAt: '2026-07-30T10:00:00Z', items: [{ productName: 'Sản phẩm A', quantity: 2 }] },
              { id: 'o2', code: 'HD0002', orderStatus: 'Confirmed', grandTotal: 2500000, createdAt: '2026-07-31T11:00:00Z', items: [{ productName: 'Sản phẩm B', quantity: 1 }] }
            ],
            summary: { totalCount: 2, totalGrandTotal: 4000000, actualDebt: 500000, estimatedDebt: 0 }
          }
        }
      });

      const wrapper = mount(CustomerOrdersWidget, {
        props: {
          contactId: 'c-100',
          isPosLinked: true,
          posCustomerId: 1001,
          posCustomerCode: 'KH0001',
          customerName: 'Nguyễn Văn A',
          customerPhone: '0901234567'
        }
      });

      await new Promise(r => setTimeout(r, 50));

      expect(mockApiGet).toHaveBeenCalledWith('/pos/customers/c-100/orders');
      expect(wrapper.text()).toContain('Lịch sử đơn hàng POS');
      expect(wrapper.text()).toContain('HD0001');
      expect(wrapper.text()).toContain('HD0002');

      const createBtn = wrapper.find('button');
      await createBtn.trigger('click');

      expect(mockOpenDraft).toHaveBeenCalledWith(expect.objectContaining({
        contactId: 'c-100',
        posCustomerId: 1001,
        posCustomerCode: 'KH0001',
        contactName: 'Nguyễn Văn A',
        contactPhone: '0901234567'
      }));
    });

    it('2.2 Debt Widget: highlights red alert threshold on overdue debt & inserts Zalo debt reminder text', async () => {
      mockApiGet.mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            totalDebt: 3000000,
            currentDebt: 1000000,
            overdueDebt: 2000000,
            dueDate: '2026-07-15',
            status: 'Danger',
            quickReminderText: 'Xin chào Nguyễn Văn A (Mã KH: KH0001), công nợ quá hạn: 2.000.000 đ'
          }
        }
      });

      let customEventDetail: any = null;
      const eventListener = (e: any) => { customEventDetail = e.detail; };
      window.addEventListener('chat:insert-suggestion', eventListener);

      const wrapper = mount(CustomerDebtWidget, {
        props: {
          contactId: 'c-100',
          customerName: 'Nguyễn Văn A',
          customerCode: 'KH0001',
          isPosLinked: true
        }
      });

      await new Promise(r => setTimeout(r, 50));

      const debtWidget = wrapper.find('.sp-debt-widget');
      expect(debtWidget.classes()).toContain('debt-alert-danger');
      expect(debtWidget.classes()).toContain('bg-red-50');
      expect(wrapper.text()).toContain('🚨 NỢ QUÁ HẠN');

      const reminderBtn = wrapper.find('button');
      expect(reminderBtn.text()).toContain('Chèn tin nhắc nợ');
      await reminderBtn.trigger('click');

      expect(wrapper.emitted('insert-debt-reminder')).toBeTruthy();
      expect(wrapper.emitted('insert-debt-reminder')![0][0]).toContain('Nguyễn Văn A');
      expect(customEventDetail?.text).toContain('Nguyễn Văn A');

      window.removeEventListener('chat:insert-suggestion', eventListener);
    });

    it('2.3 Branch Inventory Widget: searches items, filters by branch and status, inserts stock info', async () => {
      mockApiGet.mockResolvedValueOnce({
        data: {
          success: true,
          data: [
            { id: 1, name: 'Chi nhánh Q1' },
            { id: 2, name: 'Chi nhánh Q3' }
          ]
        }
      });

      mockApiGet.mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            items: [
              {
                id: 'inv-1',
                posProductId: 50,
                productCode: 'SKU123',
                productName: 'Kem dưỡng da',
                branchId: 1,
                branchName: 'Chi nhánh Q1',
                onHand: 15,
                reserved: 3,
                available: 12,
                status: 'InStock'
              }
            ]
          }
        }
      });

      const wrapper = mount(BranchInventoryWidget);
      await new Promise(r => setTimeout(r, 50));

      const input = wrapper.find('input.sp-search-input');
      await input.setValue('Kem');
      await input.trigger('keyup.enter');

      expect(mockApiGet).toHaveBeenCalledWith('/pos/inventory', expect.objectContaining({
        params: expect.objectContaining({ keyword: 'Kem' })
      }));

      await new Promise(r => setTimeout(r, 50));
      expect(wrapper.text()).toContain('Kem dưỡng da');
      expect(wrapper.text()).toContain('Chi nhánh Q1');
      expect(wrapper.text()).toContain('Khả dụng: 12');
    });

    it('2.4 SyncHeaderWidget: displays sync buttons and fetches active/historical sync jobs', async () => {
      mockApiGet.mockResolvedValueOnce({
        data: [
          { id: 'j1', entity: 'Order', status: 'Running', total: 100, processed: 45, startTime: new Date().toISOString() },
          { id: 'j2', entity: 'Customer', status: 'Completed', total: 50, processed: 50, startTime: new Date().toISOString() }
        ]
      });

      const wrapper = mount(SyncHeaderWidget);
      await new Promise(r => setTimeout(r, 50));

      expect(mockApiGet).toHaveBeenCalledWith('/sync/jobs');
      expect(wrapper.text()).toContain('Đồng bộ POS');
      expect(wrapper.text()).toContain('45%');
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // Criterion 4: Socket.IO Live Updates & Interactive Toast Notifications
  // ════════════════════════════════════════════════════════════════════════
  describe('Criterion 4 — Socket.IO Live Updates & Toast Notifications', () => {
    it('4.1 usePosNotification: triggers interactive Toast with action link on pos:data:updated event', () => {
      let registeredSocketHandler: ((payload: any) => void) | null = null;
      vi.spyOn(usePosSocket, 'usePosSocket' as any).mockImplementation((handler: any) => {
        registeredSocketHandler = handler;
        return { socket: {} as any };
      });

      usePosNotification();

      expect(registeredSocketHandler).not.toBeNull();

      // Simulate incoming POS webhook event for an Order
      registeredSocketHandler!({
        type: 'order',
        action: 'synced',
        orgId: 'org-123',
        timestamp: new Date().toISOString(),
        summary: 'Đã cập nhật đơn hàng #HD0005',
        data: { posOrderId: 105 }
      });

      expect(mockPushWithAction).toHaveBeenCalledWith(
        'Đã cập nhật đơn hàng #HD0005',
        expect.objectContaining({
          label: 'Xem đơn hàng',
          handler: expect.any(Function)
        }),
        'success',
        6000
      );

      // Execute toast action handler to verify router navigation
      const actionConfig = mockPushWithAction.mock.calls[0][1];
      actionConfig.handler();
      expect(mockRouterPush).toHaveBeenCalledWith('/pos?tab=orders&id=105');
    });

    it('4.2 usePosNotification: handles Debt event with warning toast and route parameter', () => {
      let registeredSocketHandler: ((payload: any) => void) | null = null;
      vi.spyOn(usePosSocket, 'usePosSocket' as any).mockImplementation((handler: any) => {
        registeredSocketHandler = handler;
        return { socket: {} as any };
      });

      usePosNotification();

      registeredSocketHandler!({
        type: 'debt',
        action: 'synced',
        orgId: 'org-123',
        timestamp: new Date().toISOString(),
        summary: 'Đã cập nhật công nợ KH Nguyễn Văn B',
        data: { posCustomerId: 2002 }
      });

      expect(mockPushWithAction).toHaveBeenCalledWith(
        'Đã cập nhật công nợ KH Nguyễn Văn B',
        expect.objectContaining({
          label: 'Xem công nợ',
          handler: expect.any(Function)
        }),
        'warning',
        6000
      );

      const actionConfig = mockPushWithAction.mock.calls[mockPushWithAction.mock.calls.length - 1][1];
      actionConfig.handler();
      expect(mockRouterPush).toHaveBeenCalledWith('/pos?tab=customers&id=2002');
    });
  });
});
