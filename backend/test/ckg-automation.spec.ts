/**
 * ckg-automation.spec.ts — Unit & Integration Tests for Marketing Automation Triggers
 * (Milestone 4 §R4)
 *
 * Kiểm chứng:
 * 1. isHighConfidence: Nhận diện khách hàng đạt chuẩn tin cậy cao (score >= 0.80 hoặc tier CONSOLIDATED).
 * 2. executeAutoTagging: Tự động gắn thẻ `auto:*` vào Contact.tags và kích hoạt hook onTagAdded mà không trùng lặp.
 * 3. dispatchDomainEvent: Phát sự kiện domain `ckg_lead_consolidated` lên automationEventBus với đầy đủ payload.
 * 4. dispatchOutboundWebhooks:
 *    - SSRF Guard: Chặn triệt để URL loopback (127.0.0.1, localhost) và mạng riêng tư (192.168.x.x, 10.x.x.x).
 *    - HMAC-SHA256: Sinh chữ ký bảo mật hợp lệ `sha256=<hex>` trên payload JSON gửi đi.
 * 5. checkCooldown & Idempotency: Cooldown 7 ngày chống spam trigger đối với SYNTHESIS, bỏ qua cooldown khi có SALE_FEEDBACK.
 * 6. handleHighConfidenceLead: Luồng tích hợp từ đầu đến cuối (end-to-end orchestration).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import {
  CkgAutomationService,
  ckgAutomationService,
} from '../src/modules/ckg/ckg-automation-service.js';
import {
  PersonaCluster,
  ConfidenceTier,
  type ICustomerRadarApiResponse,
} from '../src/modules/ckg/ckg-types.js';
import { prisma } from '../src/shared/database/prisma-client.js';
import { automationEventBus } from '../src/shared/ee-registry/event-bus.js';
import * as automationHooks from '../src/shared/ee-registry/automation.js';

describe('CKG Marketing Automation & Webhook Triggers (Milestone 4 §R4)', () => {
  let service: CkgAutomationService;

  const mockOrgId = 'org-auto-111';
  const mockContactId = 'contact-auto-222';

  const mockRadarData: ICustomerRadarApiResponse['data'] = {
    contactId: mockContactId,
    persona: {
      id: PersonaCluster.WHOLESALE_BUYER,
      label: 'Chủ shop sỉ mỹ phẩm / Salon Spa',
      clusterBadge: 'Sỉ lớn',
      summary: 'Khách hàng có hành vi nhập sỉ số lượng lớn từ nhóm Zalo Spa.',
      talkingPoints: [
        'Giới thiệu chính sách chiết khấu 25% cho đơn sỉ từ 10 triệu',
        'Tư vấn chính sách công nợ gối đầu 14 ngày',
        'Gợi ý dòng sản phẩm phục hồi bán chạy',
      ],
      predictedNeeds: ['Bảng giá sỉ', 'Hóa đơn VAT'],
    },
    confidence: {
      score: 0.88,
      percentage: 88,
      tier: ConfidenceTier.CONSOLIDATED,
      color: 'emerald',
    },
    evidenceSubgraph: {
      nodes: [],
      edges: [],
      metrics: { sharedGroupsCount: 3, totalOrdersCount: 2, homophilyNeighborsCount: 6 },
    },
    nextBestAction: {
      actionType: 'SEND_ZALO_PROPOSAL',
      title: 'Đề xuất chính sách sỉ VIP',
      scriptText: 'Chào bạn, bên mình đang có chương trình chiết khấu sỉ 25% kèm quà tặng cho spa.',
      suggestedProducts: ['Serum B5 Phục Hồi', 'Kem Dưỡng Ceramide'],
      suggestedVoucher: 'SI_VIP_25',
      voucherRationale: 'Khách hàng tiềm năng cụm sỉ đạt độ tin cậy 88%',
    },
    contactMetadata: {
      fullName: 'Nguyễn Thị Hương',
      phone: '0988776655',
      status: 'LEAD',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CkgAutomationService();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 1. High-Confidence Lead Qualification
  // ══════════════════════════════════════════════════════════════════════════
  describe('1. isHighConfidence qualification logic', () => {
    it('should qualify lead when score is >= 0.80', () => {
      expect(service.isHighConfidence(0.80, ConfidenceTier.PRELIMINARY)).toBe(true);
      expect(service.isHighConfidence(0.88, ConfidenceTier.CONSOLIDATED)).toBe(true);
      expect(service.isHighConfidence(0.95)).toBe(true);
    });

    it('should qualify lead when tier is CONSOLIDATED regardless of score', () => {
      expect(service.isHighConfidence(0.75, ConfidenceTier.CONSOLIDATED)).toBe(true);
      expect(service.isHighConfidence(0.70, 'CONSOLIDATED')).toBe(true);
    });

    it('should reject lead when score < 0.80 and tier is PRELIMINARY', () => {
      expect(service.isHighConfidence(0.79, ConfidenceTier.PRELIMINARY)).toBe(false);
      expect(service.isHighConfidence(0.55, ConfidenceTier.PRELIMINARY)).toBe(false);
      expect(service.isHighConfidence(0.20)).toBe(false);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 2. Auto-Tagging & onTagAdded Hook
  // ══════════════════════════════════════════════════════════════════════════
  describe('2. executeAutoTagging', () => {
    it('should append associatedTags to contact.tags without duplicates and trigger onTagAdded hook', async () => {
      // Mock existing contact with 1 tag
      vi.spyOn(prisma.contact, 'findFirst').mockResolvedValue({
        id: mockContactId,
        orgId: mockOrgId,
        tags: ['khach_cu'],
      } as any);

      const updateSpy = vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any);
      const tagHookSpy = vi.spyOn(automationHooks, 'onTagAdded').mockResolvedValue();

      // WHOLESALE_BUYER has tags ['auto:khach_si', 'auto:chu_spa']
      const addedTags = await service.executeAutoTagging(
        mockOrgId,
        mockContactId,
        PersonaCluster.WHOLESALE_BUYER
      );

      expect(addedTags).toEqual(['auto:khach_si', 'auto:chu_spa']);
      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: mockContactId },
        data: {
          tags: ['khach_cu', 'auto:khach_si', 'auto:chu_spa'],
        },
      });

      // Hook must be called for each newly added tag
      expect(tagHookSpy).toHaveBeenCalledTimes(2);
      expect(tagHookSpy).toHaveBeenCalledWith({
        orgId: mockOrgId,
        contactId: mockContactId,
        tagKind: 'crmTag',
        tagId: 'auto:khach_si',
      });
      expect(tagHookSpy).toHaveBeenCalledWith({
        orgId: mockOrgId,
        contactId: mockContactId,
        tagKind: 'crmTag',
        tagId: 'auto:chu_spa',
      });
    });

    it('should not re-add tags that are already present on the contact', async () => {
      vi.spyOn(prisma.contact, 'findFirst').mockResolvedValue({
        id: mockContactId,
        orgId: mockOrgId,
        tags: ['auto:khach_si'],
      } as any);

      const updateSpy = vi.spyOn(prisma.contact, 'update').mockResolvedValue({} as any);
      const tagHookSpy = vi.spyOn(automationHooks, 'onTagAdded').mockResolvedValue();

      const addedTags = await service.executeAutoTagging(
        mockOrgId,
        mockContactId,
        PersonaCluster.WHOLESALE_BUYER
      );

      // Only auto:chu_spa was newly added
      expect(addedTags).toEqual(['auto:chu_spa']);
      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: mockContactId },
        data: {
          tags: ['auto:khach_si', 'auto:chu_spa'],
        },
      });
      expect(tagHookSpy).toHaveBeenCalledTimes(1);
      expect(tagHookSpy).toHaveBeenCalledWith(
        expect.objectContaining({ tagId: 'auto:chu_spa' })
      );
    });

    it('should return empty array if contact is not found', async () => {
      vi.spyOn(prisma.contact, 'findFirst').mockResolvedValue(null);
      const updateSpy = vi.spyOn(prisma.contact, 'update');

      const addedTags = await service.executeAutoTagging(
        mockOrgId,
        'non-existent',
        PersonaCluster.GENZ_ACNE_GLOW
      );

      expect(addedTags).toEqual([]);
      expect(updateSpy).not.toHaveBeenCalled();
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 3. Domain Event Dispatch (automationEventBus)
  // ══════════════════════════════════════════════════════════════════════════
  describe('3. dispatchDomainEvent', () => {
    it('should emit ckg_lead_consolidated domain event with complete radar payload', async () => {
      const emitSpy = vi.spyOn(automationEventBus, 'emit');

      const success = await service.dispatchDomainEvent(mockOrgId, mockContactId, mockRadarData);

      expect(success).toBe(true);
      expect(emitSpy).toHaveBeenCalledTimes(1);
      expect(emitSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ckg_lead_consolidated',
          orgId: mockOrgId,
          contactId: mockContactId,
          payload: {
            personaId: PersonaCluster.WHOLESALE_BUYER,
            personaLabel: 'Chủ shop sỉ mỹ phẩm / Salon Spa',
            clusterBadge: 'Sỉ lớn',
            confidenceScore: 0.88,
            confidenceTier: ConfidenceTier.CONSOLIDATED,
            suggestedVoucher: 'SI_VIP_25',
            suggestedProducts: ['Serum B5 Phục Hồi', 'Kem Dưỡng Ceramide'],
            nbaScript: 'Chào bạn, bên mình đang có chương trình chiết khấu sỉ 25% kèm quà tặng cho spa.',
          },
        })
      );
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 4. Outbound Webhook Dispatch with HMAC & SSRF Guard
  // ══════════════════════════════════════════════════════════════════════════
  describe('4. dispatchOutboundWebhooks (SSRF Guard & HMAC Signature)', () => {
    it('should block unsafe SSRF URLs (loopback, private network) and NOT call fetch', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      vi.spyOn(prisma.automationTrigger, 'findMany').mockResolvedValue([]);

      // Attempt loopback URL
      const loopbackResult = await service.dispatchOutboundWebhooks(
        mockOrgId,
        mockContactId,
        mockRadarData,
        'https://127.0.0.1:9000/webhook'
      );
      expect(loopbackResult).toBe(0);
      expect(fetchSpy).not.toHaveBeenCalled();

      // Attempt private RFC1918 URL
      const privateNetResult = await service.dispatchOutboundWebhooks(
        mockOrgId,
        mockContactId,
        mockRadarData,
        'https://192.168.1.50:8443/hook'
      );
      expect(privateNetResult).toBe(0);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should dispatch POST to valid public HTTPS endpoint with valid HMAC-SHA256 signature', async () => {
      const targetUrl = 'https://hooks.zapier.com/hooks/catch/99999/ckg-lead';
      const secret = 'crm-ckg-secret-key';
      process.env.CKG_WEBHOOK_SECRET = secret;

      vi.spyOn(prisma.automationTrigger, 'findMany').mockResolvedValue([]);
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
      } as any);

      const dispatchedCount = await service.dispatchOutboundWebhooks(
        mockOrgId,
        mockContactId,
        mockRadarData,
        targetUrl
      );

      expect(dispatchedCount).toBe(1);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const [calledUrl, fetchOptions] = fetchSpy.mock.calls[0];
      expect(calledUrl).toBe(targetUrl);
      expect(fetchOptions?.method).toBe('POST');

      // Verify Headers
      const headers = (fetchOptions?.headers || {}) as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['X-CKG-Event']).toBe('ckg.lead.high_confidence');
      expect(headers['X-CKG-Signature']).toMatch(/^sha256=[a-f0-9]{64}$/);

      // Verify HMAC integrity
      const rawBody = fetchOptions?.body as string;
      const expectedHmac = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
      expect(headers['X-CKG-Signature']).toBe(`sha256=${expectedHmac}`);

      // Verify Payload contents
      const parsedBody = JSON.parse(rawBody);
      expect(parsedBody.event).toBe('ckg.lead.high_confidence');
      expect(parsedBody.contact.id).toBe(mockContactId);
      expect(parsedBody.radar.personaId).toBe(PersonaCluster.WHOLESALE_BUYER);
      expect(parsedBody.radar.suggestedVoucher).toBe('SI_VIP_25');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 5. Cooldown Guard (7 Days) & Idempotency
  // ══════════════════════════════════════════════════════════════════════════
  describe('5. checkCooldown and recordTriggerExecution', () => {
    it('should return true when trigger has already fired within 7 days', async () => {
      vi.spyOn(prisma.automationEventLog, 'findFirst').mockResolvedValue({
        id: 'log-123',
        orgId: mockOrgId,
        contactId: mockContactId,
        eventType: 'CKG_HIGH_CONFIDENCE_QUALIFIED',
        createdAt: new Date(),
      } as any);

      const isCooldown = await service.checkCooldown(
        mockOrgId,
        mockContactId,
        PersonaCluster.WHOLESALE_BUYER
      );

      expect(isCooldown).toBe(true);
    });

    it('should return false when no previous log exists', async () => {
      vi.spyOn(prisma.automationEventLog, 'findFirst').mockResolvedValue(null);

      const isCooldown = await service.checkCooldown(
        mockOrgId,
        mockContactId,
        PersonaCluster.WHOLESALE_BUYER
      );

      expect(isCooldown).toBe(false);
    });

    it('should persist execution log on recordTriggerExecution', async () => {
      const createSpy = vi.spyOn(prisma.automationEventLog, 'create').mockResolvedValue({} as any);

      await service.recordTriggerExecution(
        mockOrgId,
        mockContactId,
        PersonaCluster.WHOLESALE_BUYER
      );

      expect(createSpy).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orgId: mockOrgId,
          contactId: mockContactId,
          eventType: 'CKG_HIGH_CONFIDENCE_QUALIFIED',
          eventPriority: 'info',
        }),
      });
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 6. Full Orchestration Flow (handleHighConfidenceLead)
  // ══════════════════════════════════════════════════════════════════════════
  describe('6. handleHighConfidenceLead orchestration', () => {
    it('should return qualified: false and skip all triggers when lead confidence is low', async () => {
      const lowConfidenceData: ICustomerRadarApiResponse['data'] = {
        ...mockRadarData,
        confidence: {
          score: 0.55,
          percentage: 55,
          tier: ConfidenceTier.PRELIMINARY,
          color: 'amber',
        },
      };

      const tagSpy = vi.spyOn(service, 'executeAutoTagging');
      const eventSpy = vi.spyOn(service, 'dispatchDomainEvent');
      const webhookSpy = vi.spyOn(service, 'dispatchOutboundWebhooks');

      const result = await service.handleHighConfidenceLead({
        orgId: mockOrgId,
        contactId: mockContactId,
        radarData: lowConfidenceData,
        triggerSource: 'SYNTHESIS',
      });

      expect(result).toEqual({ qualified: false });
      expect(tagSpy).not.toHaveBeenCalled();
      expect(eventSpy).not.toHaveBeenCalled();
      expect(webhookSpy).not.toHaveBeenCalled();
    });

    it('should return cooldownActive: true and skip actions during SYNTHESIS when cooldown is active', async () => {
      vi.spyOn(service, 'checkCooldown').mockResolvedValue(true);
      const tagSpy = vi.spyOn(service, 'executeAutoTagging');

      const result = await service.handleHighConfidenceLead({
        orgId: mockOrgId,
        contactId: mockContactId,
        radarData: mockRadarData,
        triggerSource: 'SYNTHESIS',
      });

      expect(result).toEqual({ qualified: true, cooldownActive: true });
      expect(tagSpy).not.toHaveBeenCalled();
    });

    it('should bypass cooldown when triggerSource is SALE_FEEDBACK and execute all actions', async () => {
      // Cooldown would be true, but SALE_FEEDBACK must bypass it
      vi.spyOn(service, 'checkCooldown').mockResolvedValue(true);
      vi.spyOn(service, 'executeAutoTagging').mockResolvedValue(['auto:wholesale']);
      vi.spyOn(service, 'dispatchDomainEvent').mockResolvedValue(true);
      vi.spyOn(service, 'dispatchOutboundWebhooks').mockResolvedValue(1);
      vi.spyOn(service, 'recordTriggerExecution').mockResolvedValue();

      const result = await service.handleHighConfidenceLead({
        orgId: mockOrgId,
        contactId: mockContactId,
        radarData: mockRadarData,
        triggerSource: 'SALE_FEEDBACK',
      });

      expect(result).toEqual({
        qualified: true,
        cooldownActive: false,
        autoTagsApplied: ['auto:wholesale'],
        eventEmitted: true,
        webhookDispatched: true,
      });
    });
  });
});
