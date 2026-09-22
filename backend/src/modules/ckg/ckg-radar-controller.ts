/**
 * ckg-radar-controller.ts — Smart Customer Radar Controller & Service Orchestrator (Milestone 3 §R3, §R4)
 *
 * Nhiệm vụ cốt lõi:
 * 1. CkgRadarService (Facade Orchestrator):
 *    - Fast-path cache lookup (<10ms) từ bảng PostgreSQL inferred_customer_profiles.
 *    - Slow-path pipeline đa tầng: 2-hop Traversal -> Vector Centroid Lookalike ->
 *      Progressive Confidence Engine (50-65% vs 85-95%) -> LLM Graph RAG Synthesizer -> 24h Persistence.
 *    - Human-in-the-loop Edge Reweighting: CONFIRM (1.8), REJECT (0.2), OVERRIDE (1.5).
 *    - Cache invalidation (valid_until = NOW()), instant re-synthesis và trigger automation tags.
 * 2. CkgRadarController (Fastify Request Handler):
 *    - Kiểm soát an ninh đa khách hàng (Tenant Isolation & assertContactVisible IDOR guard).
 *    - Chuẩn hóa tham số, ánh xạ mã lỗi HTTP và định dạng payload phản hồi chuẩn.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { assertContactVisible } from '../contacts/contact-scope.js';
import { ckgTraversalService } from './ckg-traversal-service.js';
import { ckgLookalikeService } from './ckg-lookalike-service.js';
import { ckgConfidenceEngine } from './ckg-confidence-engine.js';
import { ckgRagSynthesizer } from './ckg-rag-synthesizer.js';
import { ckgAutomationService } from './ckg-automation-service.js';
import {
  ckgIngestionService,
  deriveNodeId,
  generateDeterministicCentroidVector,
} from './ckg-ingestion-service.js';
import {
  CkgEntityType,
  CkgRelationType,
  PersonaCluster,
  PERSONA_CLUSTERS_METADATA,
  ConfidenceTier,
  type ICustomerRadarApiResponse,
  type IRadarFeedbackRequest,
  type ICkgEvidenceSubgraph,
} from './ckg-types.js';

// ── 1. Dịch Vụ Phối Hợp Đa Tầng (CKG Radar Facade Service) ────────────────────

export class CkgRadarService {
  /**
   * Tổng hợp dữ liệu Smart Customer Radar cho một khách hàng.
   * Ưu tiên Fast Path (<10ms) khi có cache hợp lệ trong 24 giờ.
   */
  public async synthesizeCustomerRadar(
    orgId: string,
    contactId: string,
    options?: { forceRefresh?: boolean; userId?: string; skipAutomationTrigger?: boolean }
  ): Promise<ICustomerRadarApiResponse['data']> {
    // 1. Kiểm tra quyền tồn tại của Contact và lấy metadata cơ bản
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, orgId },
      select: {
        id: true,
        fullName: true,
        crmName: true,
        zaloUsername: true,
        phone: true,
        source: true,
        status: true,
        posCustomerId: true,
        tags: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!contact) {
      throw new Error(`Contact with ID ${contactId} not found in organization ${orgId}`);
    }

    const contactMetadata = {
      fullName: contact.fullName || contact.crmName || contact.zaloUsername || 'Khách hàng',
      phone: contact.phone || null,
      source: contact.source || null,
      status: contact.status || null,
      posCustomerId: contact.posCustomerId ? Number(contact.posCustomerId) : null,
    };

    // 2. Fast Path: Kiểm tra Cache 24 Giờ (<10ms SLA)
    if (!options?.forceRefresh) {
      const cached = await ckgRagSynthesizer.getCachedProfile(orgId, contactId);
      if (cached) {
        return {
          ...cached,
          contactMetadata,
          cached: true,
        };
      }
    }

    // 3. Slow Path: Kích hoạt Pipeline Phối Hợp Đa Tầng
    // ── Tầng 1: 2-Hop Traversal (Recursive CTE, <8ms)
    let evidenceSubgraph: ICkgEvidenceSubgraph;
    try {
      evidenceSubgraph = await ckgTraversalService.traverseCustomerSubgraph(orgId, contactId, {
        minWeight: 0.2, // Lấy cả cạnh có trọng số thấp để phát hiện phản hồi cũ
        maxNodes: 50,
        maxEdges: 100,
      });
    } catch (traversalErr) {
      logger.warn(`[CkgRadarService] Traversal error for ${contactId}, using empty fallback:`, traversalErr);
      evidenceSubgraph = {
        nodes: [{ id: deriveNodeId(orgId, CkgEntityType.CONTACT, contactId), type: CkgEntityType.CONTACT, label: contactMetadata.fullName }],
        edges: [],
        metrics: { sharedGroupsCount: 0, totalOrdersCount: 0, homophilyNeighborsCount: 0 },
      };
    }

    // ── Tầng 1.5: Làm giàu dữ liệu thực tế từ POS Orders & Lịch sử Zalo Chat
    const phoneDigits = contact.phone ? contact.phone.replace(/\D/g, '') : '';
    const phone9 = phoneDigits.length >= 9 ? phoneDigits.slice(-9) : '';

    let realOrderCount = 0;
    let realTotalSpent = 0;
    let realPurchasedItems: Array<{ product_name: string; total_qty: number; total_spent: number }> = [];

    let lastOrderDate: Date | null = null;
    try {
      const orderRows = await prisma.$queryRawUnsafe<Array<{ count: string | number; total: string | number; last_order_date: string | Date | null }>>(`
        SELECT
          COUNT(id)::int as count,
          COALESCE(SUM(COALESCE(grand_total, total_amount, 0)), 0)::float as total,
          MAX(COALESCE(order_date, created_at)) as last_order_date
        FROM pos_orders
        WHERE org_id = $1
          AND (
            contact_id = $2
            OR contact_id IN (SELECT id FROM contacts WHERE parent_contact_id = $2)
            ${contact.posCustomerId ? `OR pos_customer_id = ${Number(contact.posCustomerId)}` : ''}
            ${phone9 ? `OR RIGHT(REGEXP_REPLACE(COALESCE(customer_phone, ''), '\\D', '', 'g'), 9) = '${phone9}'` : ''}
          )
      `, orgId, contactId);

      if (orderRows && orderRows[0]) {
        realOrderCount = Number(orderRows[0].count) || 0;
        realTotalSpent = Number(orderRows[0].total) || 0;
        if (orderRows[0].last_order_date) {
          lastOrderDate = new Date(orderRows[0].last_order_date);
        }
      }

      realPurchasedItems = await prisma.$queryRawUnsafe<Array<{ product_name: string; total_qty: number; total_spent: number }>>(`
        SELECT i.product_name, SUM(i.quantity)::float as total_qty, SUM(i.total_price)::float as total_spent
        FROM pos_order_items i
        JOIN pos_orders o ON i.pos_order_id = o.id
        WHERE o.org_id = $1
          AND (
            o.contact_id = $2
            OR o.contact_id IN (SELECT id FROM contacts WHERE parent_contact_id = $2)
            ${contact.posCustomerId ? `OR o.pos_customer_id = ${Number(contact.posCustomerId)}` : ''}
            ${phone9 ? `OR RIGHT(REGEXP_REPLACE(COALESCE(o.customer_phone, ''), '\\D', '', 'g'), 9) = '${phone9}'` : ''}
          )
        GROUP BY i.product_name
        ORDER BY total_spent DESC
        LIMIT 10
      `, orgId, contactId);
    } catch (orderErr) {
      logger.warn(`[CkgRadarService] Error querying real orders for contact ${contactId}:`, orderErr);
    }

    // Bổ sung sản phẩm đã mua vào evidenceSubgraph
    for (const item of realPurchasedItems) {
      if (!evidenceSubgraph.edges.some((e) => e.target === item.product_name && e.relation === CkgRelationType.PURCHASED)) {
        evidenceSubgraph.edges.push({
          source: contactId,
          target: item.product_name,
          relation: CkgRelationType.PURCHASED,
          weight: Math.min(2.0, 1.0 + (item.total_qty > 1 ? 0.5 : 0.2)),
          properties: { totalQty: item.total_qty, totalSpent: item.total_spent },
        });
      }
      if (!evidenceSubgraph.nodes.some((n) => n.label === item.product_name)) {
        evidenceSubgraph.nodes.push({
          id: `prod_${item.product_name}`,
          type: CkgEntityType.PRODUCT,
          label: item.product_name,
        });
      }
    }

    // Kiểm tra tương tác về Workshop trong tin nhắn chat
    try {
      const wsMessage = await prisma.message.findFirst({
        where: {
          conversation: { contactId },
          senderType: 'contact',
          content: { contains: 'workshop', mode: 'insensitive' },
        },
        select: { content: true, sentAt: true },
      });

      if (wsMessage) {
        if (!evidenceSubgraph.edges.some((e) => e.relation === CkgRelationType.INQUIRED_WORKSHOP)) {
          evidenceSubgraph.edges.push({
            source: contactId,
            target: 'Workshop đào tạo & Chuyển giao công nghệ pha chế',
            relation: CkgRelationType.INQUIRED_WORKSHOP,
            weight: 2.0,
            properties: { inquiry: wsMessage.content, sentAt: wsMessage.sentAt },
          });
        }
        if (!evidenceSubgraph.nodes.some((n) => n.type === CkgEntityType.WORKSHOP)) {
          evidenceSubgraph.nodes.push({
            id: `ws_inquiry_${contactId}`,
            type: CkgEntityType.WORKSHOP,
            label: 'Workshop đào tạo & Chuyển giao công nghệ pha chế',
          });
        }
      }
    } catch (msgErr) {
      logger.warn(`[CkgRadarService] Error querying workshop messages for contact ${contactId}:`, msgErr);
    }

    const orderCount = Math.max(
      realOrderCount,
      evidenceSubgraph.metrics.totalOrdersCount || 0
    );
    const totalSpent = realTotalSpent > 0 ? realTotalSpent : (orderCount > 0 ? 500_000 * orderCount : 0);
    evidenceSubgraph.metrics.totalOrdersCount = orderCount;

    // ── Tầng 2: Vector Lookalike Centroid Matching (<2ms)
    const contactTags = Array.isArray(contact.tags) ? (contact.tags as string[]) : [];
    let contactEmbedding: number[];
    try {
      contactEmbedding = await ckgLookalikeService.aggregateContactEmbedding(
        orgId,
        contactId,
        evidenceSubgraph.nodes,
        evidenceSubgraph.edges,
        contactTags
      );
    } catch {
      contactEmbedding = generateDeterministicCentroidVector(PersonaCluster.TRIAL_EXPLORER);
    }

    const vectorMatches = await ckgLookalikeService.matchTopPersonas(orgId, contactEmbedding);

    // ── Tầng 3: Kiểm tra Trọng số Feedback Con người và Lịch sử Đơn hàng
    let humanFeedbackEdgeWeight: number | null = null;
    const belongsToEdge = evidenceSubgraph.edges.find((e) => e.relation === CkgRelationType.BELONGS_TO);
    if (belongsToEdge && belongsToEdge.weight) {
      humanFeedbackEdgeWeight = belongsToEdge.weight;
    }
    const touchpointCount =
      1 +
      contactTags.length +
      evidenceSubgraph.metrics.sharedGroupsCount +
      orderCount;

    const homophilyRatio = evidenceSubgraph.metrics.sharedGroupsCount > 0
      ? (evidenceSubgraph.metrics.homophilyNeighborsCount / evidenceSubgraph.metrics.sharedGroupsCount)
      : 0;

    const lookalikeEval = ckgLookalikeService.evaluateHybridLookalike(
      vectorMatches,
      humanFeedbackEdgeWeight,
      orderCount,
      orderCount,
      homophilyRatio,
      touchpointCount
    );

    // ── Tầng 4: Progressive Confidence Engine (50-65% sơ bộ vs 85-95% củng cố)
    const eventDates = [
      lastOrderDate,
      contact.updatedAt ? new Date(contact.updatedAt) : null,
      contact.createdAt ? new Date(contact.createdAt) : null,
    ].filter((d): d is Date => d instanceof Date && !isNaN(d.getTime()));

    const effectiveLastEventAt = eventDates.length > 0
      ? new Date(Math.max(...eventDates.map((d) => d.getTime())))
      : new Date();

    const confidence = ckgConfidenceEngine.evaluateConfidence({
      vectorSimilarity: lookalikeEval.vectorSimilarity,
      secondVectorSimilarity: lookalikeEval.allMatches?.[1]?.cosineSimilarity,
      graphEvidenceSubgraph: evidenceSubgraph,
      orderCount,
      totalSpent,
      touchpointCount,
      humanFeedbackEdgeWeight: humanFeedbackEdgeWeight || 1.0,
      lastEventAt: effectiveLastEventAt,
      targetPersonaId: lookalikeEval.topPersonaId,
    });

    // ── Tầng 5: LLM Graph RAG Synthesizer (Gemini Flash + 5-Persona Resilient Fallback + 24h Persistence)
    const synthesized = await ckgRagSynthesizer.synthesizeCustomerProfile({
      orgId,
      contactId,
      contact: {
        fullName: contact.fullName,
        crmName: contact.crmName,
        zaloName: contact.zaloUsername,
        phone: contact.phone,
        source: contact.source,
        tags: contactTags,
        status: contact.status,
        posCustomerId: contact.posCustomerId ? Number(contact.posCustomerId) : null,
      },
      evidenceSubgraph,
      lookalikeEval,
      confidence,
      orderHistory: {
        totalOrders: orderCount,
        totalSpent,
      },
      forceRefresh: options?.forceRefresh,
    });

    const resultData: ICustomerRadarApiResponse['data'] = {
      contactId,
      contactMetadata,
      persona: synthesized.persona,
      confidence: {
        score: confidence.score,
        percentage: confidence.percentage,
        tier: confidence.tier,
        color: confidence.color,
        decayStatus: {
          isDecayed: confidence.timeDecay.isDecayed,
          originalScore: confidence.components.instantScore,
          daysSinceLastEvent: confidence.timeDecay.elapsedDays,
        },
      },
      evidenceSubgraph: synthesized.evidenceSubgraph,
      nextBestAction: synthesized.nextBestAction,
      cached: false,
      validUntil: synthesized.validUntil,
    };

    // Trigger high-confidence lead automation in background
    if (!options?.skipAutomationTrigger && (confidence.score >= 0.80 || confidence.tier === ConfidenceTier.CONSOLIDATED)) {
      void ckgAutomationService.handleHighConfidenceLead({
        orgId,
        contactId,
        radarData: resultData,
        triggerSource: 'SYNTHESIS',
      }).catch((err) => {
        logger.debug('[CkgRadarService] High confidence synthesis trigger warning:', err);
      });
    }

    return resultData;
  }

  /**
   * Xử lý phản hồi của nhân viên Sale (Human-in-the-loop Feedback Loop).
   * Điểm tin cậy đồ thị được cập nhật tức thì và lưu vết vào CKG.
   */
  public async handleSaleFeedback(
    orgId: string,
    contactId: string,
    body: IRadarFeedbackRequest,
    userId: string
  ): Promise<{
    message: string;
    updatedConfidence: number;
    data: ICustomerRadarApiResponse['data'];
  }> {
    const rawAction = String(body.action || '').toUpperCase();
    const action = (rawAction === 'EDIT' ? 'OVERRIDE' : rawAction) as 'CONFIRM' | 'REJECT' | 'OVERRIDE';
    const note = body.note || body.reason || '';

    // 1. Xác định Persona hiện tại từ Cache hoặc Traversal
    const currentCached = await ckgRagSynthesizer.getCachedProfile(orgId, contactId);
    let currentPersonaId = currentCached?.persona?.id as PersonaCluster | undefined;
    if (!currentPersonaId) {
      const contactEmbedding = await ckgLookalikeService.aggregateContactEmbedding(orgId, contactId);
      const topMatches = await ckgLookalikeService.matchTopPersonas(orgId, contactEmbedding);
      currentPersonaId = topMatches[0]?.personaId || PersonaCluster.TRIAL_EXPLORER;
    }

    const targetPersonaId = (body.targetCluster || body.confirmedPersonaId || currentPersonaId) as PersonaCluster;
    const contactNodeId = deriveNodeId(orgId, CkgEntityType.CONTACT, contactId);

    // 2. Thực hiện Human-in-the-loop Graph Reweighting trực tiếp vào PostgreSQL
    if (action === 'CONFIRM') {
      const personaNodeId = deriveNodeId(orgId, CkgEntityType.PERSONA, targetPersonaId);
      await this.ensurePersonaNode(orgId, targetPersonaId);
      await this.upsertExactEdge(orgId, contactNodeId, personaNodeId, CkgRelationType.BELONGS_TO, 1.8, {
        setExactWeight: true,
        feedbackAction: 'CONFIRM',
        staffUserId: userId,
        note,
        confirmedAt: new Date().toISOString(),
      });
    } else if (action === 'REJECT') {
      if (currentPersonaId) {
        const oldPersonaNodeId = deriveNodeId(orgId, CkgEntityType.PERSONA, currentPersonaId);
        await this.upsertExactEdge(orgId, contactNodeId, oldPersonaNodeId, CkgRelationType.BELONGS_TO, 0.2, {
          setExactWeight: true,
          feedbackAction: 'REJECT',
          staffUserId: userId,
          note,
          rejectedAt: new Date().toISOString(),
        });
      }
    } else if (action === 'OVERRIDE') {
      // Giáng cấp cụm cũ xuống 0.2
      if (currentPersonaId && currentPersonaId !== targetPersonaId) {
        const oldPersonaNodeId = deriveNodeId(orgId, CkgEntityType.PERSONA, currentPersonaId);
        await this.upsertExactEdge(orgId, contactNodeId, oldPersonaNodeId, CkgRelationType.BELONGS_TO, 0.2, {
          setExactWeight: true,
          feedbackAction: 'OVERRIDDEN_FROM',
          staffUserId: userId,
          note,
          overriddenAt: new Date().toISOString(),
        });
      }
      // Nâng cụm mục tiêu mới lên 1.5
      const newPersonaNodeId = deriveNodeId(orgId, CkgEntityType.PERSONA, targetPersonaId);
      await this.ensurePersonaNode(orgId, targetPersonaId);
      await this.upsertExactEdge(orgId, contactNodeId, newPersonaNodeId, CkgRelationType.BELONGS_TO, 1.5, {
        setExactWeight: true,
        feedbackAction: 'OVERRIDE',
        staffUserId: userId,
        note,
        overriddenAt: new Date().toISOString(),
      });
    }

    // 3. Phát sự kiện vào Ingestion Engine để ghi nhận thống kê & touchpoint job
    try {
      ckgIngestionService.recordTouchpoint(orgId, contactId, 'SALE_FEEDBACK', {
        action,
        personaId: targetPersonaId,
        reason: note,
      });
    } catch (ingestErr) {
      logger.warn('[CkgRadarService] Ingestion recordTouchpoint error:', ingestErr);
    }

    // 4. Vô hiệu hóa cache 24h để ép buộc tính toán lại
    try {
      await prisma.$executeRawUnsafe(
        `
        UPDATE inferred_customer_profiles
        SET valid_until = NOW(), last_event_at = NOW(), updated_at = NOW()
        WHERE contact_id = $1 AND org_id = $2
        `,
        contactId,
        orgId
      );
    } catch (cacheErr) {
      logger.warn('[CkgRadarService] Cache invalidation update error:', cacheErr);
    }

    // 5. Tái tổng hợp tức thời (Instant Re-synthesis) để Sale nhìn thấy kết quả mới ngay lập tức
    // skipAutomationTrigger: true để tránh bắn trùng webhook / event 'SYNTHESIS' khi đã có trigger 'SALE_FEEDBACK' bên dưới
    const updatedRadar = await this.synthesizeCustomerRadar(orgId, contactId, {
      forceRefresh: true,
      userId,
      skipAutomationTrigger: true,
    });

    if (action === 'CONFIRM' || action === 'OVERRIDE') {
      void ckgAutomationService.handleHighConfidenceLead({
        orgId,
        contactId,
        radarData: updatedRadar,
        triggerSource: 'SALE_FEEDBACK',
      }).catch((err) => {
        logger.debug('[CkgRadarService] High confidence feedback trigger warning:', err);
      });
    }

    return {
      message: 'Cập nhật phản hồi thành công và đã điều chỉnh trọng số đồ thị tri thức.',
      updatedConfidence: updatedRadar.confidence.score,
      data: updatedRadar,
    };
  }

  /**
   * Đảm bảo Node Persona tồn tại trong bảng graph_nodes.
   */
  private async ensurePersonaNode(orgId: string, clusterId: PersonaCluster): Promise<void> {
    const meta = PERSONA_CLUSTERS_METADATA[clusterId];
    const label = meta?.label || clusterId;
    const nodeId = deriveNodeId(orgId, CkgEntityType.PERSONA, clusterId);
    const properties = JSON.stringify({
      clusterBadge: meta?.clusterBadge || '',
      description: meta?.description || '',
    });

    try {
      await prisma.$executeRawUnsafe(
        `
        INSERT INTO graph_nodes (id, org_id, entity_type, entity_id, label, properties, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW(), NOW())
        ON CONFLICT (org_id, entity_type, entity_id) DO UPDATE SET
          label = EXCLUDED.label,
          properties = graph_nodes.properties || EXCLUDED.properties,
          updated_at = NOW();
        `,
        nodeId,
        orgId,
        CkgEntityType.PERSONA,
        clusterId,
        label,
        properties
      );
    } catch (err) {
      logger.warn('[CkgRadarService] ensurePersonaNode error:', err);
    }
  }

  /**
   * Ghi đè chính xác trọng số cạnh (setExactWeight: true) trong graph_edges.
   */
  private async upsertExactEdge(
    orgId: string,
    sourceNodeId: string,
    targetNodeId: string,
    relationType: string,
    weight: number,
    properties: Record<string, unknown>
  ): Promise<void> {
    const clampedWeight = Math.min(2.0, Math.max(0.0, weight));
    const edgeId = deriveNodeId(orgId, 'EDGE', `${sourceNodeId}:${targetNodeId}:${relationType}`);
    const propsJson = JSON.stringify({ ...properties, setExactWeight: true });

    try {
      await prisma.$executeRawUnsafe(
        `
        INSERT INTO graph_edges (
          id, org_id, source_node_id, target_node_id, relation_type, weight, properties, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7::jsonb, NOW(), NOW()
        )
        ON CONFLICT (org_id, source_node_id, target_node_id, relation_type) DO UPDATE SET
          weight = EXCLUDED.weight,
          properties = graph_edges.properties || EXCLUDED.properties,
          updated_at = NOW();
        `,
        edgeId,
        orgId,
        sourceNodeId,
        targetNodeId,
        relationType,
        clampedWeight,
        propsJson
      );
    } catch (err) {
      logger.warn('[CkgRadarService] upsertExactEdge error:', err);
    }
  }

  /**
   * Tự động đăng ký và kích hoạt automationTriggers theo associatedTags của Persona.
   */
  private async triggerPersonaAutomationTags(
    orgId: string,
    contactId: string,
    personaCluster: PersonaCluster
  ): Promise<void> {
    const meta = PERSONA_CLUSTERS_METADATA[personaCluster];
    if (!meta || !meta.associatedTags || meta.associatedTags.length === 0) return;

    try {
      const { onTagAdded } = await import('../../shared/ee-registry/automation.js');
      for (const tagId of meta.associatedTags) {
        await onTagAdded({
          orgId,
          contactId,
          tagKind: 'crmTag',
          tagId,
        });
      }
    } catch (err) {
      logger.debug('[CkgRadarService] triggerPersonaAutomationTags non-blocking error:', err);
    }
  }
}

// ── 2. Bộ Điều Khiển REST API (Fastify Controller) ────────────────────────────

export class CkgRadarController {
  private readonly service: CkgRadarService;

  constructor(service?: CkgRadarService) {
    this.service = service || new CkgRadarService();
  }

  /**
   * GET /api/v1/contacts/:id/radar
   */
  public async getCustomerRadar(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = (request as any).user;
    if (!user || !user.orgId) {
      return reply.status(401).send({ success: false, error: 'Unauthorized' });
    }

    const { id: contactId } = request.params as { id: string };
    const query = (request.query || {}) as { forceRefresh?: string };
    const forceRefresh = query.forceRefresh === 'true';

    // Bảo mật IDOR: Kiểm tra phạm vi truy cập Contact
    const visible = await assertContactVisible({
      userId: user.id,
      orgId: user.orgId,
      legacyRole: user.role,
      contactId,
    });

    if (!visible) {
      return reply.status(404).send({ success: false, error: 'Contact not found' });
    }

    try {
      const data = await this.service.synthesizeCustomerRadar(user.orgId, contactId, {
        forceRefresh,
        userId: user.id,
      });

      return reply.status(200).send({
        success: true,
        data,
      });
    } catch (err: any) {
      logger.error(`[CkgRadarController] Error fetching radar for contact ${contactId}:`, err);
      return reply.status(500).send({
        success: false,
        error: err.message || 'Internal Server Error while computing Customer Radar',
      });
    }
  }

  /**
   * POST /api/v1/contacts/:id/radar/feedback
   */
  public async submitFeedback(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = (request as any).user;
    if (!user || !user.orgId) {
      return reply.status(401).send({ success: false, error: 'Unauthorized' });
    }

    const { id: contactId } = request.params as { id: string };
    const body = (request.body || {}) as IRadarFeedbackRequest;

    // Bảo mật IDOR: Kiểm tra phạm vi truy cập Contact
    const visible = await assertContactVisible({
      userId: user.id,
      orgId: user.orgId,
      legacyRole: user.role,
      contactId,
    });

    if (!visible) {
      return reply.status(404).send({ success: false, error: 'Contact not found' });
    }

    const action = String(body.action || '').toUpperCase();
    if (!['CONFIRM', 'REJECT', 'OVERRIDE', 'EDIT'].includes(action)) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid action. Supported actions: CONFIRM, REJECT, OVERRIDE, EDIT',
      });
    }

    try {
      const result = await this.service.handleSaleFeedback(user.orgId, contactId, body, user.id);

      return reply.status(200).send({
        success: true,
        message: result.message,
        updatedConfidence: result.updatedConfidence,
        data: result.data,
      });
    } catch (err: any) {
      logger.error(`[CkgRadarController] Error submitting feedback for contact ${contactId}:`, err);
      return reply.status(500).send({
        success: false,
        error: err.message || 'Internal Server Error while processing Sale Feedback',
      });
    }
  }
}

// Singleton instances
export const ckgRadarService = new CkgRadarService();
export const ckgRadarController = new CkgRadarController(ckgRadarService);
