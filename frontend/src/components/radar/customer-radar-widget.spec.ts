// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import CustomerRadarWidget from './CustomerRadarWidget.vue';
import type { ICustomerRadarData } from '@/api/radar';

// ── Mock Toast ──────────────────────────────────────────────────────────────
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock('@/composables/use-toast', () => ({
  useToast: () => ({
    success: mockToastSuccess,
    error: mockToastError,
    info: vi.fn(),
  }),
}));

// ── Mock API Module ─────────────────────────────────────────────────────────
const mockFetchContactRadar = vi.fn();
const mockSubmitRadarFeedback = vi.fn();

vi.mock('@/api/radar', async () => {
  const actual = await vi.importActual<any>('@/api/radar');
  return {
    ...actual,
    fetchContactRadar: (...args: any[]) => mockFetchContactRadar(...args),
    submitRadarFeedback: (...args: any[]) => mockSubmitRadarFeedback(...args),
  };
});

// ── Sample Radar Data Fixtures ───────────────────────────────────────────────
const preliminaryRadarData: ICustomerRadarData = {
  contactId: 'contact-test-1',
  contactMetadata: {
    fullName: 'Lê Thuỳ Dung',
    phone: '0901122334',
    source: 'Zalo Community',
    status: 'LEAD',
    posCustomerId: 555,
  },
  persona: {
    id: 'FNB_WORKSHOP_STUDENT',
    label: 'Học viên Workshop & Khởi nghiệp F&B',
    clusterBadge: 'Học viên WS',
    headline: 'Khách hàng quan tâm khóa học pha chế thực chiến',
    summary: 'Thường hỏi lịch học workshop và giáo trình công thức chuẩn vị quán.',
    predictedNeeds: ['Lịch Workshop gần nhất', 'Giáo trình công thức chuẩn quán'],
    talkingPoints: [
      'Gợi ý lịch học workshop gần nhất',
      'Giới thiệu các món hot-trend đang chuyển giao',
      'Đề xuất voucher Early Bird giảm 15%',
    ],
  },
  confidence: {
    score: 0.62,
    percentage: 62,
    tier: 'PRELIMINARY',
    color: 'amber',
  },
  evidenceSubgraph: {
    nodes: [
      { id: 'node-group-1', type: 'GROUP', label: 'Cộng đồng Skincare Văn Phòng' },
      { id: 'node-contact-1', type: 'CONTACT', label: 'Khách tương đồng: Thu Hà' },
    ],
    edges: [
      { source: 'contact-test-1', target: 'node-group-1', relation: 'IN_GROUP', weight: 1.0 },
    ],
    metrics: { sharedGroupsCount: 1, totalOrdersCount: 0, homophilyNeighborsCount: 3 },
  },
  nextBestAction: {
    actionType: 'SEND_ZALO_PROPOSAL',
    title: 'Tư vấn Routine Chống Khô Da Văn Phòng',
    scriptText: 'Dạ chào chị Dung, thời tiết hanh khô kèm ngồi điều hòa dễ làm da mất nước, bên em có combo dưỡng ẩm rất tiện...',
    suggestedProducts: ['Xịt khoáng HA', 'Gel dưỡng ẩm'],
    suggestedVoucher: 'OFFICE_HYDRA_10',
    voucherRationale: 'Ưu đãi kích hoạt đơn đầu cụm văn phòng',
  },
  cached: false,
  validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
};

const consolidatedRadarData: ICustomerRadarData = {
  contactId: 'contact-test-2',
  persona: {
    id: 'FNB_SHOP_OWNER',
    label: 'Chủ quán Trà sữa / Cafe / Ăn vặt',
    clusterBadge: 'Chủ quán',
    headline: 'Chủ quán nhập nguyên liệu trà và topping định kỳ hàng tuần',
    summary: 'Thường xuyên đặt đơn sỉ theo thùng, thanh toán nhanh.',
    predictedNeeds: ['Bảng giá sỉ nguyên liệu theo thùng', 'Chính sách chiết khấu bậc thang'],
    talkingPoints: [
      'Thông báo chính sách chiết khấu theo thùng cho đơn từ 5 triệu',
      'Tư vấn chính sách vận chuyển chành xe miễn phí',
      'Giới thiệu mẫu dùng thử trân châu Ô Long Nhài Lermao mới',
    ],
  },
  confidence: {
    score: 0.94,
    percentage: 94,
    tier: 'CONSOLIDATED',
    color: 'emerald',
  },
  evidenceSubgraph: {
    nodes: [
      { id: 'node-group-2', type: 'GROUP', label: 'Hội Chủ Spa & Đại Lý Toàn Quốc' },
      { id: 'node-order-1', type: 'ORDER', label: 'Đơn sỉ #POS-9981' },
      { id: 'node-contact-2', type: 'CONTACT', label: 'Khách hàng tương đồng: Spa Hồng Nhung' },
    ],
    edges: [
      { source: 'contact-test-2', target: 'node-group-2', relation: 'IN_GROUP', weight: 1.5 },
      { source: 'contact-test-2', target: 'node-order-1', relation: 'PURCHASED', weight: 1.8 },
    ],
    metrics: { sharedGroupsCount: 4, totalOrdersCount: 5, homophilyNeighborsCount: 8 },
  },
  nextBestAction: {
    actionType: 'SEND_ZALO_PROPOSAL',
    title: 'Đề xuất bảng giá sỉ cấp 1',
    scriptText: 'Em chào chị, bên em vừa cập nhật bảng giá sỉ chiết khấu đặc quyền cho salon spa...',
    suggestedProducts: ['Bộ Peel Sinh Học', 'Serum Phục Hồi B5'],
    suggestedVoucher: 'SI_VIP_30',
    voucherRationale: 'Khách hàng sỉ thân thiết củng cố 94%',
  },
  cached: true,
  validUntil: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
};

describe('CustomerRadarWidget.vue — Milestone 4 Empirical Component Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 1. Initial Render & Progressive Confidence (Amber vs Emerald)
  // ══════════════════════════════════════════════════════════════════════════
  describe('1. Progressive Confidence Display Rules (Amber 50-65% vs Emerald 85-95%)', () => {
    it('Case 1: Preliminary confidence (62%) renders amber badge, amber meter bar, and "Sơ bộ"', async () => {
      mockFetchContactRadar.mockResolvedValueOnce(preliminaryRadarData);

      const wrapper = mount(CustomerRadarWidget, {
        props: { contactId: 'contact-test-1' },
        global: {
          stubs: { RadarFeedbackDialog: true },
        },
      });

      // Wait for composable loadRadar async call
      await new Promise((r) => setTimeout(r, 60));

      // Verify Persona Badge
      const personaBadge = wrapper.find('.persona-badge');
      expect(personaBadge.exists()).toBe(true);
      expect(personaBadge.text()).toContain('Văn phòng');
      expect(personaBadge.classes()).toContain('cluster-office_skincare');

      // Verify Confidence Badge
      const confBadge = wrapper.find('.confidence-badge');
      expect(confBadge.exists()).toBe(true);
      expect(confBadge.classes()).toContain('conf-amber');
      expect(confBadge.text()).toContain('Sơ bộ:');
      expect(confBadge.text()).toContain('62');

      // Verify Meter Bar
      const meterBar = wrapper.find('.confidence-meter-bar');
      expect(meterBar.classes()).toContain('bar-amber');
      expect((meterBar.element as HTMLElement).style.width).toBe('62%');

      // Verify Persona Headline
      expect(wrapper.find('.persona-headline').text()).toContain(
        'Khách hàng văn phòng quan tâm dưỡng ẩm, chống lão hóa'
      );
    });

    it('Case 2: Consolidated confidence (94%) renders emerald badge, emerald meter bar, and "Củng cố"', async () => {
      mockFetchContactRadar.mockResolvedValueOnce(consolidatedRadarData);

      const wrapper = mount(CustomerRadarWidget, {
        props: { contactId: 'contact-test-2' },
        global: {
          stubs: { RadarFeedbackDialog: true },
        },
      });

      await new Promise((r) => setTimeout(r, 60));

      const confBadge = wrapper.find('.confidence-badge');
      expect(confBadge.exists()).toBe(true);
      expect(confBadge.classes()).toContain('conf-emerald');
      expect(confBadge.text()).toContain('Củng cố:');
      expect(confBadge.text()).toContain('94');

      const meterBar = wrapper.find('.confidence-meter-bar');
      expect(meterBar.classes()).toContain('bar-emerald');
      expect((meterBar.element as HTMLElement).style.width).toBe('94%');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 2. Next Best Action (NBA), Voucher & Product Quick Insert
  // ══════════════════════════════════════════════════════════════════════════
  describe('2. Next Best Action & 1-Click Chat Insert', () => {
    it('should emit insert-suggestion event when clicking "Chèn vào chat"', async () => {
      mockFetchContactRadar.mockResolvedValueOnce(preliminaryRadarData);

      const wrapper = mount(CustomerRadarWidget, {
        props: { contactId: 'contact-test-1' },
        global: {
          stubs: { RadarFeedbackDialog: true },
        },
      });

      await new Promise((r) => setTimeout(r, 60));

      const insertBtn = wrapper.find('.btn-insert-pill');
      expect(insertBtn.exists()).toBe(true);
      await insertBtn.trigger('click');

      expect(wrapper.emitted('insert-suggestion')).toBeTruthy();
      const emittedText = wrapper.emitted('insert-suggestion')![0][0] as string;
      expect(emittedText).toContain('Dạ chào chị Dung, thời tiết hanh khô');
    });

    it('should display voucher ticket and insert voucher message when clicking "Dùng mã"', async () => {
      mockFetchContactRadar.mockResolvedValueOnce(preliminaryRadarData);

      const wrapper = mount(CustomerRadarWidget, {
        props: { contactId: 'contact-test-1' },
        global: {
          stubs: { RadarFeedbackDialog: true },
        },
      });

      await new Promise((r) => setTimeout(r, 60));

      const voucherTicket = wrapper.find('.voucher-ticket');
      expect(voucherTicket.exists()).toBe(true);
      expect(voucherTicket.text()).toContain('OFFICE_HYDRA_10');

      const useVoucherBtn = wrapper.find('.btn-voucher-insert');
      await useVoucherBtn.trigger('click');

      expect(wrapper.emitted('insert-suggestion')).toBeTruthy();
      const emittedPayload = wrapper.emitted('insert-suggestion')![0][0] as string;
      expect(emittedPayload).toContain('OFFICE_HYDRA_10');
    });

    it('should render recommended products and emit product recommendation text on chip click', async () => {
      mockFetchContactRadar.mockResolvedValueOnce(preliminaryRadarData);

      const wrapper = mount(CustomerRadarWidget, {
        props: { contactId: 'contact-test-1' },
        global: {
          stubs: { RadarFeedbackDialog: true },
        },
      });

      await new Promise((r) => setTimeout(r, 60));

      const productChips = wrapper.findAll('.product-chip');
      expect(productChips.length).toBe(2);
      expect(productChips[0].text()).toContain('Xịt khoáng HA');

      await productChips[0].trigger('click');
      expect(wrapper.emitted('insert-suggestion')).toBeTruthy();
      const emittedText = wrapper.emitted('insert-suggestion')![0][0] as string;
      expect(emittedText).toContain('Xịt khoáng HA');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 3. 3 Actionable Talking Points
  // ══════════════════════════════════════════════════════════════════════════
  describe('3. Actionable Talking Points (3 Điểm Chạm Tư Vấn)', () => {
    it('should display exactly 3 talking points with index badges', async () => {
      mockFetchContactRadar.mockResolvedValueOnce(preliminaryRadarData);

      const wrapper = mount(CustomerRadarWidget, {
        props: { contactId: 'contact-test-1' },
        global: {
          stubs: { RadarFeedbackDialog: true },
        },
      });

      await new Promise((r) => setTimeout(r, 60));

      const items = wrapper.findAll('.talking-point-item');
      expect(items.length).toBe(3);
      expect(items[0].find('.point-num').text()).toBe('1');
      expect(items[0].text()).toContain('Gợi ý combo xịt khoáng cấp ẩm');
      expect(items[1].find('.point-num').text()).toBe('2');
      expect(items[2].find('.point-num').text()).toBe('3');
    });

    it('should emit insert-suggestion when clicking the point insert icon', async () => {
      mockFetchContactRadar.mockResolvedValueOnce(preliminaryRadarData);

      const wrapper = mount(CustomerRadarWidget, {
        props: { contactId: 'contact-test-1' },
        global: {
          stubs: { RadarFeedbackDialog: true },
        },
      });

      await new Promise((r) => setTimeout(r, 60));

      const firstPoint = wrapper.findAll('.talking-point-item')[0];
      const insertBtn = firstPoint.find('.btn-point-icon[title="Chèn vào khung chat"]');
      await insertBtn.trigger('click');

      expect(wrapper.emitted('insert-suggestion')).toBeTruthy();
      const emitted = wrapper.emitted('insert-suggestion')![0][0] as string;
      expect(emitted).toContain('Gợi ý combo xịt khoáng cấp ẩm');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 4. Human Feedback Loop UI Actions
  // ══════════════════════════════════════════════════════════════════════════
  describe('4. Human Feedback Loop UI (Confirm, Override, Reject)', () => {
    it('should submit CONFIRM feedback when clicking "Xác nhận đúng"', async () => {
      mockFetchContactRadar.mockResolvedValueOnce(preliminaryRadarData);
      mockSubmitRadarFeedback.mockResolvedValueOnce({
        success: true,
        message: 'Đã xác nhận chân dung',
        updatedConfidence: 0.95,
        data: {
          ...preliminaryRadarData,
          confidence: {
            score: 0.95,
            percentage: 95,
            tier: 'CONSOLIDATED',
            color: 'emerald',
          },
        },
      });

      const wrapper = mount(CustomerRadarWidget, {
        props: { contactId: 'contact-test-1' },
        global: {
          stubs: { RadarFeedbackDialog: true },
        },
      });

      await new Promise((r) => setTimeout(r, 60));

      const confirmBtn = wrapper.find('.btn-confirm');
      await confirmBtn.trigger('click');

      expect(mockSubmitRadarFeedback).toHaveBeenCalledWith('contact-test-1', {
        action: 'CONFIRM',
        confirmedPersonaId: 'FNB_WORKSHOP_STUDENT',
      });
      expect(mockToastSuccess).toHaveBeenCalled();
    });

    it('should submit REJECT feedback when clicking "Chưa đúng"', async () => {
      mockFetchContactRadar.mockResolvedValueOnce(preliminaryRadarData);
      mockSubmitRadarFeedback.mockResolvedValueOnce({
        success: true,
        message: 'Đã ghi nhận phản hồi',
        updatedConfidence: 0.2,
      });

      const wrapper = mount(CustomerRadarWidget, {
        props: { contactId: 'contact-test-1' },
        global: {
          stubs: { RadarFeedbackDialog: true },
        },
      });

      await new Promise((r) => setTimeout(r, 60));

      const rejectBtn = wrapper.find('.btn-reject');
      await rejectBtn.trigger('click');

      expect(mockSubmitRadarFeedback).toHaveBeenCalledWith('contact-test-1', {
        action: 'REJECT',
      });
    });

    it('should open override dialog when clicking "Điều chỉnh"', async () => {
      mockFetchContactRadar.mockResolvedValueOnce(preliminaryRadarData);

      const wrapper = mount(CustomerRadarWidget, {
        props: { contactId: 'contact-test-1' },
        global: {
          stubs: { RadarFeedbackDialog: true },
        },
      });

      await new Promise((r) => setTimeout(r, 60));

      const overrideBtn = wrapper.find('.btn-override');
      await overrideBtn.trigger('click');

      const dialogStub = wrapper.findComponent({ name: 'RadarFeedbackDialog' });
      expect(dialogStub.exists()).toBe(true);
      expect(dialogStub.props('modelValue')).toBe(true);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 5. Accordion Expand/Collapse Behavior
  // ══════════════════════════════════════════════════════════════════════════
  describe('5. Accordion Behavior', () => {
    it('should toggle collapsed state when clicking the header', async () => {
      mockFetchContactRadar.mockResolvedValueOnce(preliminaryRadarData);

      const wrapper = mount(CustomerRadarWidget, {
        props: { contactId: 'contact-test-1' },
        global: {
          stubs: { RadarFeedbackDialog: true },
        },
      });

      await new Promise((r) => setTimeout(r, 60));

      const contentBody = wrapper.find('.radar-content-body');
      expect(contentBody.isVisible()).toBe(true);

      // Click header to collapse
      const header = wrapper.find('.radar-header');
      await header.trigger('click');
      expect(contentBody.isVisible()).toBe(false);

      // Click again to expand
      await header.trigger('click');
      expect(contentBody.isVisible()).toBe(true);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 6. Typography Standard Adherence Verification
  // ══════════════════════════════════════════════════════════════════════════
  describe('6. Typography & Anti-Orphan Compliance (.agents/rules/ui-typography-rules.md)', () => {
    it('should apply whitespace-nowrap and tabular-nums on badges and numbers', async () => {
      mockFetchContactRadar.mockResolvedValueOnce(preliminaryRadarData);

      const wrapper = mount(CustomerRadarWidget, {
        props: { contactId: 'contact-test-1' },
        global: {
          stubs: { RadarFeedbackDialog: true },
        },
      });

      await new Promise((r) => setTimeout(r, 60));

      // Persona Badge must have whitespace-nowrap
      expect(wrapper.find('.persona-badge').classes()).toContain('whitespace-nowrap');

      // Confidence strong tag must have tabular-nums
      const nums = wrapper.find('.conf-text strong');
      expect(nums.classes()).toContain('tabular-nums');

      // Headings must have text-balance
      expect(wrapper.find('.radar-title').classes()).toContain('text-balance');
      expect(wrapper.find('.persona-headline').classes()).toContain('text-balance');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 7. Evidence Subgraph Section Verification (Milestone 4 Remediation)
  // ══════════════════════════════════════════════════════════════════════════
  describe('7. Evidence Subgraph Rendering & Metrics Verification', () => {
    it('Case 1: Renders Evidence Subgraph header with text-balance and metric chips with tabular-nums', async () => {
      mockFetchContactRadar.mockResolvedValueOnce(preliminaryRadarData);

      const wrapper = mount(CustomerRadarWidget, {
        props: { contactId: 'contact-test-1' },
        global: {
          stubs: { RadarFeedbackDialog: true },
        },
      });

      await new Promise((r) => setTimeout(r, 60));

      const section = wrapper.find('.evidence-subgraph-section');
      expect(section.exists()).toBe(true);

      // Header must have text-balance
      const title = section.find('.evidence-title');
      expect(title.exists()).toBe(true);
      expect(title.classes()).toContain('text-balance');
      expect(title.text()).toContain('Bằng chứng đồ thị quan hệ');

      // Metric chips with whitespace-nowrap and tabular-nums
      const metricChips = section.findAll('.evidence-metric-chip');
      expect(metricChips.length).toBe(3);
      for (const chip of metricChips) {
        expect(chip.classes()).toContain('whitespace-nowrap');
        expect(chip.find('.tabular-nums').exists()).toBe(true);
      }

      // Check values for preliminary data: sharedGroupsCount: 1, totalOrdersCount: 0, homophilyNeighborsCount: 3
      expect(metricChips[0].text()).toContain('Nhóm chung:');
      expect(metricChips[0].text()).toContain('1');
      expect(metricChips[1].text()).toContain('Đơn hàng:');
      expect(metricChips[1].text()).toContain('0');
      expect(metricChips[2].text()).toContain('Khách tương đồng:');
      expect(metricChips[2].text()).toContain('3');

      // Supporting evidence nodes
      const nodeChips = section.findAll('.evidence-node-chip');
      expect(nodeChips.length).toBe(2);
      expect(nodeChips[0].classes()).toContain('whitespace-nowrap');
      expect(nodeChips[0].text()).toContain('Cộng đồng Skincare Văn Phòng');
      expect(nodeChips[1].text()).toContain('Khách tương đồng: Thu Hà');

      // Rationale paragraph with text-pretty and hyphens: none
      const rationale = section.find('.evidence-rationale');
      expect(rationale.exists()).toBe(true);
      expect(rationale.classes()).toContain('text-pretty');
      expect(rationale.attributes('style')).toContain('hyphens: none');
      expect(rationale.text()).toContain('Suy luận chân dung dựa trên phân tích đồ thị quan hệ:');
    });

    it('Case 2: Renders consolidated evidence metrics and nodes correctly', async () => {
      mockFetchContactRadar.mockResolvedValueOnce(consolidatedRadarData);

      const wrapper = mount(CustomerRadarWidget, {
        props: { contactId: 'contact-test-2' },
        global: {
          stubs: { RadarFeedbackDialog: true },
        },
      });

      await new Promise((r) => setTimeout(r, 60));

      const section = wrapper.find('.evidence-subgraph-section');
      expect(section.exists()).toBe(true);

      const metricChips = section.findAll('.evidence-metric-chip');
      expect(metricChips[0].text()).toContain('4'); // sharedGroupsCount
      expect(metricChips[1].text()).toContain('5'); // totalOrdersCount
      expect(metricChips[2].text()).toContain('8'); // homophilyNeighborsCount

      const nodeChips = section.findAll('.evidence-node-chip');
      expect(nodeChips.length).toBe(3);
      expect(nodeChips[0].text()).toContain('Hội Chủ Spa & Đại Lý Toàn Quốc');
      expect(nodeChips[1].text()).toContain('Đơn sỉ #POS-9981');
      expect(nodeChips[2].text()).toContain('Khách hàng tương đồng: Spa Hồng Nhung');
    });
  });
});
