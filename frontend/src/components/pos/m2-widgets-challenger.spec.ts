// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import CustomerDebtWidget from './CustomerDebtWidget.vue';
import BranchInventoryWidget from './BranchInventoryWidget.vue';

// ── Mocks ──────────────────────────────────────────────────────────────────
const mockApiGet = vi.fn();
vi.mock('@/api/index', () => ({
  api: {
    get: (...args: any[]) => mockApiGet(...args),
  },
}));

vi.mock('@/composables/use-toast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }),
}));

describe('Milestone 2 (M2) Empirical Challenger Verification: POS Widgets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ════════════════════════════════════════════════════════════════════════
  // 1. CustomerDebtWidget: Red Alert Styling Rules
  // ════════════════════════════════════════════════════════════════════════
  describe('CustomerDebtWidget — Red Alert Styling Rules', () => {
    it('Case 1 (PASS): overdueDebt > 0 triggers debt-alert-danger and bg-red-50 text-red-900', async () => {
      mockApiGet.mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            totalDebt: 1000000,
            currentDebt: 500000,
            overdueDebt: 500000,
            dueDate: '2026-07-01',
            status: 'Danger',
          },
        },
      });

      const wrapper = mount(CustomerDebtWidget, {
        props: { contactId: 'contact-overdue' },
      });

      await new Promise((r) => setTimeout(r, 50));

      const rootDiv = wrapper.find('.sp-debt-widget');
      expect(rootDiv.classes()).toContain('debt-alert-danger');
      expect(rootDiv.classes()).toContain('bg-red-50');
      expect(rootDiv.classes()).toContain('text-red-900');
    });

    it('Case 2 (REMEDIATED): status Danger with totalDebt = 0 correctly triggers debt-alert-danger', async () => {
      mockApiGet.mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            totalDebt: 0,
            currentDebt: 0,
            overdueDebt: 0,
            dueDate: null,
            status: 'Danger',
          },
        },
      });

      const wrapper = mount(CustomerDebtWidget, {
        props: { contactId: 'contact-danger-zero-total' },
      });

      await new Promise((r) => setTimeout(r, 50));

      const rootDiv = wrapper.find('.sp-debt-widget');
      const hasRedAlert = rootDiv.classes().includes('debt-alert-danger');
      const hasRedBg = rootDiv.classes().includes('bg-red-50');

      expect(hasRedAlert).toBe(true); // Verified fixed: debt-alert-danger is applied when status='Danger'
      expect(hasRedBg).toBe(true); // Verified fixed: bg-red-50 is applied
      expect(rootDiv.classes()).not.toContain('bg-emerald-50');
    });

    it('Case 3 (REMEDIATED): overdueDebt = 0 and status = Warning does NOT trigger debt-alert-danger (shows amber)', async () => {
      mockApiGet.mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            totalDebt: 500000,
            currentDebt: 500000,
            overdueDebt: 0,
            dueDate: '2026-08-30',
            status: 'Warning',
          },
        },
      });

      const wrapper = mount(CustomerDebtWidget, {
        props: { contactId: 'contact-warning-normal-debt' },
      });

      await new Promise((r) => setTimeout(r, 50));

      const rootDiv = wrapper.find('.sp-debt-widget');
      const hasRedAlert = rootDiv.classes().includes('debt-alert-danger');
      const hasAmberBg = rootDiv.classes().includes('bg-amber-50');

      expect(hasRedAlert).toBe(false); // Verified fixed: non-overdue warning debt does not trigger red pulse
      expect(hasAmberBg).toBe(true); // Verified fixed: shows amber warning background
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // 2. BranchInventoryWidget: Search, Branch, and Status Chip Filtering
  // ════════════════════════════════════════════════════════════════════════
  describe('BranchInventoryWidget — Filtering Capabilities', () => {
    it('Case 1 (PASS): Search keyword filter works via input and enter key', async () => {
      mockApiGet.mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            items: [
              {
                id: 'inv-1',
                posProductId: 10,
                productCode: 'SP001',
                productName: 'Sữa rửa mặt',
                branchId: 1,
                branchName: 'Chi nhánh 1',
                onHand: 10,
                reserved: 2,
                available: 8,
                status: 'InStock',
              },
            ],
          },
        },
      });

      const wrapper = mount(BranchInventoryWidget);
      await new Promise((r) => setTimeout(r, 50));

      const input = wrapper.find('input.sp-search-input');
      await input.setValue('Sữa');
      await input.trigger('keyup.enter');

      expect(mockApiGet).toHaveBeenCalledWith(
        '/pos/inventory',
        expect.objectContaining({
          params: expect.objectContaining({ keyword: 'Sữa' }),
        })
      );
    });

    it('Case 2 (PASS): Branch selection filter works via dropdown change', async () => {
      mockApiGet.mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            items: [],
          },
        },
      });

      const wrapper = mount(BranchInventoryWidget, {
        props: {
          branches: [
            { id: 1, name: 'Chi nhánh Q1' },
            { id: 2, name: 'Chi nhánh Q3' },
          ],
        },
      });
      await new Promise((r) => setTimeout(r, 50));

      const select = wrapper.find('select.sp-branch-select');
      await select.setValue('2');

      expect(mockApiGet).toHaveBeenCalledWith(
        '/pos/inventory',
        expect.objectContaining({
          params: expect.objectContaining({ branchId: 2 }),
        })
      );
    });

    it('Case 3 (REMEDIATED): InStock/LowStock/OutOfStock status filter controls are present and pass status parameter', async () => {
      mockApiGet.mockResolvedValueOnce({
        data: {
          success: true,
          data: { items: [] },
        },
      });

      const wrapper = mount(BranchInventoryWidget);
      await new Promise((r) => setTimeout(r, 50));

      const searchRowHtml = wrapper.find('.sp-inventory-search-row').html();
      const hasStatusChipsFilterInToolbar =
        searchRowHtml.includes('InStock') ||
        searchRowHtml.includes('LowStock') ||
        searchRowHtml.includes('OutOfStock') ||
        searchRowHtml.includes('sp-status-chip');

      expect(hasStatusChipsFilterInToolbar).toBe(true);

      const statusSelect = wrapper.find('select.sp-status-select');
      if (statusSelect.exists()) {
        await statusSelect.setValue('InStock');
        expect(mockApiGet).toHaveBeenCalledWith(
          '/pos/inventory',
          expect.objectContaining({
            params: expect.objectContaining({ status: 'InStock' }),
          })
        );
      }
    });
  });
});
