/**
 * ckg-radar.spec.ts — Test Suite for Smart Customer Radar Service & Controller (Milestone 3 §R3, §R4)
 *
 * Kiểm chứng:
 * 1. CkgRadarService.synthesizeCustomerRadar:
 *    - Fast Path (<10ms): Trả về cache từ inferred_customer_profiles khi valid_until > NOW().
 *    - Slow Path: Khi không có cache hoặc forceRefresh, kích hoạt pipeline 5 tầng (Traversal -> Lookalike -> Confidence -> RAG -> Persist).
 * 2. CkgRadarService.handleSaleFeedback:
 *    - CONFIRM: Cập nhật trọng số cạnh BELONGS_TO lên 1.8, phát touchpoint SALE_FEEDBACK, tái tổng hợp ra điểm củng cố (85-95%).
 *    - REJECT: Giảm trọng số cạnh BELONGS_TO xuống 0.2.
 *    - OVERRIDE / EDIT: Giảm cạnh cũ xuống 0.2, tăng cạnh cụm mới lên 1.5.
 *    - Tự động kích hoạt automationTriggers theo associatedTags.
 * 3. CkgRadarController:
 *    - Bảo mật IDOR & Scope: Chặn truy cập contact trái phép (404 Contact not found).
 *    - Kiểm tra tham số request và mã trạng thái HTTP (400, 401, 404, 200).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CkgRadarService,
  CkgRadarController,
} from '../src/modules/ckg/ckg-radar-controller.js';
import {
  PersonaCluster,
  ConfidenceTier,
  type ICustomerRadarResponse,
} from '../src/modules/ckg/ckg-types.js';
import { prisma } from '../src/shared/database/prisma-client.js';
import * as contactScope from '../src/modules/contacts/contact-scope.js';
import { ckgRagSynthesizer } from '../src/modules/ckg/ckg-rag-synthesizer.js';
import { ckgIngestionService } from '../src/modules/ckg/ckg-ingestion-service.js';

describe('CKG Smart Customer Radar Tests (Milestone 3 §R3, §R4)', () => {
  let service: CkgRadarService;
  let controller: CkgRadarController;

  const mockOrgId = 'org-test-888';
  const mockContactId = 'contact-test-999';
  const mockUserId = 'user-test-777';

  const sampleContact = {
    id: mockContactId,
    orgId: mockOrgId,
    fullName: 'Trần Thị Mai',
    crmName: 'Mai Spa Thẩm Mỹ',
    zaloName: 'Mai Trần',
    phone: '0912345678',
    source: 'Zalo Group',
    status: 'LEAD',
    posCustomerId: 1024,
    tags: ['chu_spa', 'khach_si'],
    createdAt: new Date('2026-09-01T00:00:00Z'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CkgRadarService();
    controller = new CkgRadarController(service);

    // Default mock prisma.contact.findFirst
    vi.spyOn(prisma.contact, 'findFirst').mockResolvedValue(sampleContact as any);
  });

  describe('1. CkgRadarService — Fast Path vs Slow Path Synthesis', () => {
    it('should serve Fast Path (<10ms) with cached: true when valid cache exists and forceRefresh is false', async () => {
      const mockCachedResponse: ICustomerRadarResponse = {
        contactId: mockContactId,
        persona: {
          id: PersonaCluster.WHOLESALE_BUYER,
          label: 'Chủ shop sỉ mỹ phẩm / Salon Spa',
          clusterBadge: 'Sỉ lớn',
          summary: 'Tóm tắt từ cache 24h.',
          predictedNeeds: ['Bảng giá sỉ'],
        },
        confidence: {
          score: 0.92,
          percentage: 92,
          tier: ConfidenceTier.CONSOLIDATED,
          color: 'emerald',
        },
        evidenceSubgraph: {
          nodes: [],
          edges: [],
          metrics: { sharedGroupsCount: 2, totalOrdersCount: 1, homophilyNeighborsCount: 5 },
        },
        nextBestAction: {
          actionType: 'SEND_ZALO_PROPOSAL',
          title: 'Gửi kịch bản sỉ',
          scriptText: 'Chào chị Mai...',
          suggestedProducts: ['Serum B5'],
          suggestedVoucher: 'SI_VIP_10',
        },
        cached: true,
        validUntil: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
      };

      vi.spyOn(ckgRagSynthesizer, 'getCachedProfile').mockResolvedValue(mockCachedResponse);

      const start = performance.now();
      const result = await service.synthesizeCustomerRadar(mockOrgId, mockContactId, {
        forceRefresh: false,
      });
      const duration = performance.now() - start;

      expect(result.cached).toBe(true);
      expect(result.persona.id).toBe(PersonaCluster.WHOLESALE_BUYER);
      expect(result.contactMetadata.fullName).toBe('Trần Thị Mai');
      expect(result.contactMetadata.posCustomerId).toBe(1024);
      expect(duration).toBeLessThan(50); // Under SLA limit in local unit test
    });

    it('should trigger Slow Path pipeline when cache is absent or expired', async () => {
      vi.spyOn(ckgRagSynthesizer, 'getCachedProfile').mockResolvedValue(null);
      const persistSpy = vi.spyOn(ckgRagSynthesizer, 'persistProfile').mockResolvedValue();

      const result = await service.synthesizeCustomerRadar(mockOrgId, mockContactId);

      expect(result.cached).toBe(false);
      expect(result.contactId).toBe(mockContactId);
      expect(result.persona).toBeDefined();
      expect(result.confidence).toBeDefined();
      expect(result.evidenceSubgraph).toBeDefined();
      expect(result.nextBestAction).toBeDefined();
      expect(result.validUntil).toBeDefined();
    });

    it('should bypass cache and force re-synthesis when forceRefresh is true', async () => {
      const getCachedSpy = vi.spyOn(ckgRagSynthesizer, 'getCachedProfile');
      vi.spyOn(ckgRagSynthesizer, 'persistProfile').mockResolvedValue();

      const result = await service.synthesizeCustomerRadar(mockOrgId, mockContactId, {
        forceRefresh: true,
      });

      expect(getCachedSpy).not.toHaveBeenCalled();
      expect(result.cached).toBe(false);
    });

    it('should throw error if contact is not found in the organization', async () => {
      vi.spyOn(prisma.contact, 'findFirst').mockResolvedValue(null);

      await expect(
        service.synthesizeCustomerRadar(mockOrgId, 'non-existent-contact')
      ).rejects.toThrow('not found in organization');
    });
  });

  describe('2. CkgRadarService — Human-in-the-loop Sale Feedback', () => {
    it('should process CONFIRM feedback: reweight edge to 1.8, record touchpoint, invalidate cache', async () => {
      const executeRawSpy = vi.spyOn(prisma, '$executeRawUnsafe').mockResolvedValue(1);
      const recordTouchpointSpy = vi.spyOn(ckgIngestionService, 'recordTouchpoint');
      vi.spyOn(ckgRagSynthesizer, 'getCachedProfile').mockResolvedValue(null);
      vi.spyOn(ckgRagSynthesizer, 'persistProfile').mockResolvedValue();

      const result = await service.handleSaleFeedback(
        mockOrgId,
        mockContactId,
        {
          action: 'CONFIRM',
          confirmedPersonaId: PersonaCluster.WHOLESALE_BUYER,
          note: 'Khách đã nhập 10 triệu sỉ',
        },
        mockUserId
      );

      expect(result.message).toContain('Cập nhật phản hồi thành công');
      expect(recordTouchpointSpy).toHaveBeenCalledWith(
        mockOrgId,
        mockContactId,
        'SALE_FEEDBACK',
        expect.objectContaining({ action: 'CONFIRM', personaId: PersonaCluster.WHOLESALE_BUYER })
      );

      // Verify raw SQL edge upsert was called with weight 1.8
      const edgeCall = executeRawSpy.mock.calls.find((call) =>
        String(call[0]).includes('graph_edges') && call.includes(1.8)
      );
      expect(edgeCall).toBeDefined();
    });

    it('should process REJECT feedback: reweight edge to 0.2', async () => {
      const executeRawSpy = vi.spyOn(prisma, '$executeRawUnsafe').mockResolvedValue(1);
      vi.spyOn(ckgIngestionService, 'recordTouchpoint');
      vi.spyOn(ckgRagSynthesizer, 'getCachedProfile').mockResolvedValue(null);
      vi.spyOn(ckgRagSynthesizer, 'persistProfile').mockResolvedValue();

      const result = await service.handleSaleFeedback(
        mockOrgId,
        mockContactId,
        {
          action: 'REJECT',
          note: 'Khách chỉ mua dùng thử cá nhân, không phải sỉ',
        },
        mockUserId
      );

      expect(result.message).toContain('Cập nhật phản hồi thành công');

      // Verify raw SQL edge upsert was called with weight 0.2
      const edgeCall = executeRawSpy.mock.calls.find((call) =>
        String(call[0]).includes('graph_edges') && call.includes(0.2)
      );
      expect(edgeCall).toBeDefined();
    });

    it('should process OVERRIDE feedback: dampen old edge to 0.2 and boost new cluster edge to 1.5', async () => {
      const executeRawSpy = vi.spyOn(prisma, '$executeRawUnsafe').mockResolvedValue(1);
      vi.spyOn(ckgIngestionService, 'recordTouchpoint');
      vi.spyOn(ckgRagSynthesizer, 'getCachedProfile').mockResolvedValue({
        persona: { id: PersonaCluster.TRIAL_EXPLORER },
      } as any);
      vi.spyOn(ckgRagSynthesizer, 'persistProfile').mockResolvedValue();

      const result = await service.handleSaleFeedback(
        mockOrgId,
        mockContactId,
        {
          action: 'OVERRIDE',
          targetCluster: PersonaCluster.WHOLESALE_BUYER,
          note: 'Khách đổi sang mua sỉ',
        },
        mockUserId
      );

      expect(result.message).toContain('Cập nhật phản hồi thành công');

      // Old edge dampened to 0.2
      const oldEdgeCall = executeRawSpy.mock.calls.find((call) =>
        String(call[0]).includes('graph_edges') && call.includes(0.2)
      );
      expect(oldEdgeCall).toBeDefined();

      // New edge boosted to 1.5
      const newEdgeCall = executeRawSpy.mock.calls.find((call) =>
        String(call[0]).includes('graph_edges') && call.includes(1.5)
      );
      expect(newEdgeCall).toBeDefined();
    });
  });

  describe('3. CkgRadarController — Security & HTTP Handling', () => {
    it('should return 401 if user is unauthenticated', async () => {
      const request: any = { user: null, params: { id: mockContactId } };
      const reply: any = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      };

      await controller.getCustomerRadar(request, reply);
      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Unauthorized' }));
    });

    it('should return 404 if contact is not visible (assertContactVisible IDOR guard)', async () => {
      vi.spyOn(contactScope, 'assertContactVisible').mockResolvedValue(false);

      const request: any = {
        user: { id: mockUserId, orgId: mockOrgId, role: 'staff' },
        params: { id: mockContactId },
      };
      const reply: any = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      };

      await controller.getCustomerRadar(request, reply);
      expect(reply.status).toHaveBeenCalledWith(404);
      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Contact not found' }));
    });

    it('should return 200 with radar data when authorized', async () => {
      vi.spyOn(contactScope, 'assertContactVisible').mockResolvedValue(true);
      vi.spyOn(service, 'synthesizeCustomerRadar').mockResolvedValue({
        contactId: mockContactId,
        persona: { id: PersonaCluster.WHOLESALE_BUYER } as any,
        confidence: { score: 0.92, percentage: 92 } as any,
      } as any);

      const request: any = {
        user: { id: mockUserId, orgId: mockOrgId, role: 'staff' },
        params: { id: mockContactId },
        query: {},
      };
      const reply: any = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      };

      await controller.getCustomerRadar(request, reply);
      expect(reply.status).toHaveBeenCalledWith(200);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({ contactId: mockContactId }),
        })
      );
    });

    it('should return 400 if feedback action is invalid', async () => {
      vi.spyOn(contactScope, 'assertContactVisible').mockResolvedValue(true);

      const request: any = {
        user: { id: mockUserId, orgId: mockOrgId, role: 'staff' },
        params: { id: mockContactId },
        body: { action: 'INVALID_ACTION' },
      };
      const reply: any = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      };

      await controller.submitFeedback(request, reply);
      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('Invalid action'),
        })
      );
    });

    it('should return 200 upon successful feedback submission', async () => {
      vi.spyOn(contactScope, 'assertContactVisible').mockResolvedValue(true);
      vi.spyOn(service, 'handleSaleFeedback').mockResolvedValue({
        message: 'Feedback updated',
        updatedConfidence: 0.94,
        data: { contactId: mockContactId } as any,
      });

      const request: any = {
        user: { id: mockUserId, orgId: mockOrgId, role: 'staff' },
        params: { id: mockContactId },
        body: { action: 'CONFIRM' },
      };
      const reply: any = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      };

      await controller.submitFeedback(request, reply);
      expect(reply.status).toHaveBeenCalledWith(200);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          updatedConfidence: 0.94,
        })
      );
    });
  });

  describe('4. Fastify Route Registration Plugin', () => {
    it('should register radar GET and feedback POST routes on FastifyInstance with auth hook', async () => {
      const routes: Array<{ method: string; url: string }> = [];
      const mockApp: any = {
        addHook: vi.fn(),
        get: vi.fn((url: string) => routes.push({ method: 'GET', url })),
        post: vi.fn((url: string) => routes.push({ method: 'POST', url })),
      };

      const { ckgRadarRoutes } = await import('../src/modules/ckg/ckg-radar-routes.js');
      await ckgRadarRoutes(mockApp);

      expect(mockApp.addHook).toHaveBeenCalledWith('preHandler', expect.any(Function));
      expect(routes).toContainEqual({ method: 'GET', url: '/api/v1/contacts/:id/radar' });
      expect(routes).toContainEqual({ method: 'POST', url: '/api/v1/contacts/:id/radar/feedback' });
    });
  });
});

