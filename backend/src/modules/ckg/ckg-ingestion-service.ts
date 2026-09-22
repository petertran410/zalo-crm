/**
 * ckg-ingestion-service.ts — High-Throughput Asynchronous CKG Ingestion Engine (Hardened v2)
 *
 * Đảm bảo:
 * 1. Độ trễ luồng chính <5ms (micro-batch in-memory buffer, ghi RAM < 0.05ms).
 * 2. Idempotent PostgreSQL Batch Upsert (UNNEST + ON CONFLICT DO UPDATE).
 * 3. Bảo toàn tên khách hàng (Guard chống ghi đè placeholder "Contact <id>").
 * 4. Bounded buffers (MAX_BUFFER_CAP = 10,000 trên cả 3 hàng đợi, drop FIFO + log throttling).
 * 5. Tăng cường trọng số cạnh lũy tiến và ưu tiên exact weight từ Human Feedback (clamped [0.0, 2.0]).
 * 6. Vệ sinh thuộc tính sạch sẽ (cleanProperties) loại bỏ undefined/null, chống ghi đè SĐT.
 * 7. Sinh ID tất định chuẩn hóa Unicode NFC và ép kiểu an toàn cho mọi ID.
 * 8. Widen UNNEST typed arrays lên varchar(64)[] khớp chuẩn schema DB.
 * 9. Bootstrapping seed 5 Persona Centroids kèm 768-dim unit embeddings phục vụ Lookalike.
 */

import { createHash } from 'node:crypto';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import {
  CkgEntityType,
  CkgRelationType,
  PersonaCluster,
  PERSONA_CLUSTERS_METADATA,
  type ICkgNodeInput,
  type ICkgEdgeInput,
  type ITouchpointPayload,
  type ITouchpointJob,
  type TouchpointType,
  type ICkgIngestionStats,
  type IBatchUpsertResult,
  type IPersonaSeedResult,
} from './ckg-types.js';
import { CANONICAL_PERSONA_CENTROIDS } from './ckg-lookalike-service.js';

// ── Configuration Constants ──────────────────────────────────────────────────

const FLUSH_INTERVAL_MS = 50;       // Chu kỳ tự động xả đệm (50 milliseconds)
const MAX_BATCH_SIZE = 100;         // Ngưỡng số lượng kích hoạt xả đệm tức thì
const MAX_BUFFER_CAP = 10_000;      // Ngưỡng trần chống tràn bộ nhớ (drop backpressure)
const WARN_THROTTLE_MS = 5_000;     // Chu kỳ tiết chế log cảnh báo tràn đệm (5s)

/**
 * Kiểm tra xem một nhãn (label) có phải là placeholder tự sinh hay không.
 */
export function isGenericPlaceholderLabel(label?: string): boolean {
  if (!label || label.trim() === '') return true;
  const trimmed = label.trim();
  return /^(Contact [a-zA-Z0-9_-]+|Nhóm Zalo [a-zA-Z0-9_-]+|Hội thoại [a-zA-Z0-9_-]+)$/.test(trimmed);
}

/**
 * Vệ sinh đối tượng properties, loại bỏ toàn bộ các trường undefined, null hoặc chuỗi rỗng.
 * Bảo toàn các giá trị hợp lệ kiểu boolean (false) hoặc số (0).
 */
export function cleanProperties(props?: Record<string, unknown>): Record<string, unknown> {
  if (!props || typeof props !== 'object') return {};
  const cleaned: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(props)) {
    if (val !== undefined && val !== null && val !== '') {
      cleaned[key] = val;
    }
  }
  return cleaned;
}

/**
 * Thuật toán sinh ID đỉnh tất định (Deterministic Node ID).
 * Chuẩn hóa Unicode NFC, ép kiểu string an toàn, format chuẩn RFC 4122 UUIDv4.
 */
export function deriveNodeId(
  orgId: string,
  entityType: string,
  entityId: string | number
): string {
  const safeOrg = String(orgId ?? '').trim().normalize('NFC');
  const safeType = String(entityType ?? '').trim().toUpperCase().normalize('NFC');
  const safeId = String(entityId ?? '').trim().normalize('NFC');

  const hash = createHash('sha256')
    .update(`${safeOrg}:${safeType}:${safeId}`)
    .digest('hex');

  // Định dạng chuẩn UUID RFC 4122 (8-4-4-4-12)
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

/**
 * Tạo vector đơn vị 768 chiều tất định cho Persona Centroid phục vụ zero-token lookalike vector matching.
 * Đồng bộ tuyệt đối với CANONICAL_PERSONA_CENTROIDS (Mulberry32 PRNG + Box-Muller Gaussian).
 */
export function generateDeterministicCentroidVector(clusterId: string, _dims = 768): number[] {
  const canonical = CANONICAL_PERSONA_CENTROIDS[clusterId as PersonaCluster];
  if (canonical) {
    return canonical;
  }
  return CANONICAL_PERSONA_CENTROIDS[PersonaCluster.TRIAL_EXPLORER];
}

/**
 * Lớp CkgIngestionService quản lý bộ đệm và pipeline ghi nhận đồ thị tri thức.
 */
export class CkgIngestionService {
  private nodeBuffer: Map<string, ICkgNodeInput> = new Map();
  private edgeBuffer: Map<string, ICkgEdgeInput> = new Map();
  private touchpointBuffer: ITouchpointJob[] = [];

  private flushTimer: NodeJS.Timeout | null = null;
  private isFlushing = false;
  private lastCapWarnTimes: Record<string, number> = {};

  // Thống kê phục vụ Telemetry & Health check
  private stats: ICkgIngestionStats = {
    queuedNodes: 0,
    queuedEdges: 0,
    queuedTouchpoints: 0,
    totalNodesFlushed: 0,
    totalEdgesFlushed: 0,
    totalTouchpointsProcessed: 0,
    droppedNodes: 0,
    droppedEdges: 0,
    droppedTouchpoints: 0,
    errorCount: 0,
    lastFlushAt: null,
    avgFlushDurationMs: 0,
  };

  constructor() {
    this.startBackgroundTimer();
  }

  /**
   * Cảnh báo tràn bộ đệm có tiết chế (Throttled Log) tránh CPU spike do Intl.DateTimeFormat.
   */
  private warnCapThrottled(bufferName: string): void {
    const now = Date.now();
    const last = this.lastCapWarnTimes[bufferName] || 0;
    if (now - last > WARN_THROTTLE_MS) {
      this.lastCapWarnTimes[bufferName] = now;
      logger.warn(
        `[CkgIngestion] ${bufferName} reached capacity ceiling (${MAX_BUFFER_CAP}), dropping oldest entry under backpressure`
      );
    }
  }

  /**
   * Khởi động timer định kỳ xả đệm.
   */
  private startBackgroundTimer(): void {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, FLUSH_INTERVAL_MS);
    this.flushTimer.unref();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Public API Methods (Non-blocking, <5ms overhead guaranteed)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Thêm hoặc cập nhật một đỉnh trong đồ thị tri thức.
   * Thực thi trong bộ nhớ: < 0.05ms overhead.
   */
  public upsertNode(
    orgId: string,
    type: CkgEntityType | string,
    id: string | number,
    label: string,
    props: Record<string, unknown> = {},
    embedding?: number[]
  ): void {
    if (!orgId || !type || id === undefined || id === null) {
      logger.warn('[CkgIngestion] upsertNode skipped: missing required keys (orgId, type, id)');
      return;
    }

    const safeId = String(id).trim();

    const dedupeKey = `${orgId}:${type}:${safeId}`;

    // 1. Kiểm tra trần bộ nhớ chống tràn RAM (FIFO eviction)
    if (!this.nodeBuffer.has(dedupeKey) && this.nodeBuffer.size >= MAX_BUFFER_CAP) {
      const firstKey = this.nodeBuffer.keys().next().value;
      if (firstKey) this.nodeBuffer.delete(firstKey);
      this.stats.droppedNodes++;
      this.warnCapThrottled('nodeBuffer');
    }

    const existing = this.nodeBuffer.get(dedupeKey);

    // 2. Bảo toàn nhãn xác thực (Guard chống placeholder)
    let finalLabel = label || existing?.label || safeId;
    if (existing?.label && !isGenericPlaceholderLabel(existing.label) && isGenericPlaceholderLabel(label)) {
      finalLabel = existing.label;
    }

    // 3. Vệ sinh thuộc tính sạch sẽ
    const cleanedProps = cleanProperties(props);

    this.nodeBuffer.set(dedupeKey, {
      orgId,
      entityType: type,
      entityId: safeId,
      label: finalLabel,
      properties: { ...(existing?.properties || {}), ...cleanedProps },
      embedding: embedding || existing?.embedding,
    });

    this.stats.queuedNodes++;

    if (this.nodeBuffer.size >= MAX_BATCH_SIZE) {
      void this.flush();
    }
  }

  /**
   * Thêm hoặc cập nhật một cạnh quan hệ trong đồ thị tri thức.
   * Thực thi trong bộ nhớ: < 0.05ms overhead.
   */
  public upsertEdge(
    orgId: string,
    sourceNodeId: string,
    targetNodeId: string,
    relation: CkgRelationType | string,
    weight: number = 1.0,
    props: Record<string, unknown> = {}
  ): void {
    if (!orgId || !sourceNodeId || !targetNodeId || !relation) {
      logger.warn('[CkgIngestion] upsertEdge skipped: missing required keys');
      return;
    }

    const dedupeKey = `${orgId}:${sourceNodeId}:${targetNodeId}:${relation}`;

    // 1. Kiểm tra trần bộ nhớ chống tràn RAM
    if (!this.edgeBuffer.has(dedupeKey) && this.edgeBuffer.size >= MAX_BUFFER_CAP) {
      const firstKey = this.edgeBuffer.keys().next().value;
      if (firstKey) this.edgeBuffer.delete(firstKey);
      this.stats.droppedEdges++;
      this.warnCapThrottled('edgeBuffer');
    }

    const existing = this.edgeBuffer.get(dedupeKey);

    // 2. Tính toán trọng số chuẩn xác (Tôn trọng setExactWeight và chặn trần 0.0 - 2.0)
    const isExact = Boolean(props?.setExactWeight);
    const clampedInputWeight = Math.min(2.0, Math.max(0.0, Number(weight ?? 1.0)));

    let finalWeight: number;
    if (isExact) {
      finalWeight = clampedInputWeight;
    } else if (existing) {
      finalWeight = Math.min(2.0, Math.max(0.0, (existing.weight ?? 1.0) + 0.1));
    } else {
      finalWeight = clampedInputWeight;
    }

    // 3. Vệ sinh thuộc tính cạnh
    const cleanedProps = cleanProperties(props);

    this.edgeBuffer.set(dedupeKey, {
      orgId,
      sourceNodeId,
      targetNodeId,
      relationType: relation,
      weight: finalWeight,
      properties: { ...(existing?.properties || {}), ...cleanedProps },
    });

    this.stats.queuedEdges++;

    if (this.edgeBuffer.size >= MAX_BATCH_SIZE) {
      void this.flush();
    }
  }

  /**
   * Tiện ích nối cạnh trực tiếp giữa hai thực thể nguồn mà không cần biết trước Node UUID.
   * Tự động bảo đảm tạo sẵn Stub Nodes cho cả hai đầu mút để chống vi phạm Foreign Key.
   */
  public upsertEdgeByEntities(
    orgId: string,
    sourceType: CkgEntityType | string,
    sourceEntityId: string | number,
    targetType: CkgEntityType | string,
    targetEntityId: string | number,
    relation: CkgRelationType | string,
    weight: number = 1.0,
    props: Record<string, unknown> = {}
  ): void {
    const srcIdStr = String(sourceEntityId);
    const tgtIdStr = String(targetEntityId);

    const sourceNodeId = deriveNodeId(orgId, sourceType, srcIdStr);
    const targetNodeId = deriveNodeId(orgId, targetType, tgtIdStr);

    // Bảo đảm cả 2 đỉnh nguồn và đích có mặt trong buffer nếu chưa từng được nạp
    const srcKey = `${orgId}:${sourceType}:${srcIdStr}`;
    if (!this.nodeBuffer.has(srcKey)) {
      this.upsertNode(orgId, sourceType, srcIdStr, `${sourceType} ${srcIdStr}`, {});
    }
    const tgtKey = `${orgId}:${targetType}:${tgtIdStr}`;
    if (!this.nodeBuffer.has(tgtKey)) {
      this.upsertNode(orgId, targetType, tgtIdStr, `${targetType} ${tgtIdStr}`, {});
    }

    this.upsertEdge(orgId, sourceNodeId, targetNodeId, relation, weight, props);
  }

  /**
   * Ghi nhận một điểm chạm (Touchpoint) của khách hàng.
   * Có trần MAX_BUFFER_CAP chống OOM, vệ sinh thuộc tính, bảo toàn tên thật.
   */
  public recordTouchpoint(
    orgId: string,
    contactId: string,
    touchpointType: TouchpointType,
    payload: ITouchpointPayload = {}
  ): void {
    if (!orgId || !contactId || !touchpointType) {
      logger.warn('[CkgIngestion] recordTouchpoint skipped: missing orgId, contactId or touchpointType');
      return;
    }

    // 1. Kiểm tra trần bộ đệm touchpoint chống tràn heap
    if (this.touchpointBuffer.length >= MAX_BUFFER_CAP) {
      this.touchpointBuffer.shift();
      this.stats.droppedTouchpoints++;
      this.warnCapThrottled('touchpointBuffer');
    }

    // 2. Đẩy vào hàng đợi touchpoint
    this.touchpointBuffer.push({
      orgId,
      contactId,
      touchpointType,
      payload,
      timestamp: new Date().toISOString(),
    });

    this.stats.queuedTouchpoints++;

    // 3. Biến đổi sự kiện thành Nodes/Edges đưa vào buffer tức thời
    this.processTouchpointImmediate(orgId, contactId, touchpointType, payload);

    if (this.touchpointBuffer.length >= MAX_BATCH_SIZE) {
      void this.flush();
    }
  }

  /**
   * Biến đổi sự kiện touchpoint thành các Node và Edge cụ thể đưa vào In-Memory Buffer.
   */
  private processTouchpointImmediate(
    orgId: string,
    contactId: string,
    type: TouchpointType,
    payload: ITouchpointPayload
  ): void {
    const contactNodeId = deriveNodeId(orgId, CkgEntityType.CONTACT, contactId);

    // 1. Chuẩn bị thuộc tính Contact sạch sẽ (không truyền undefined)
    const contactProps: Record<string, unknown> = {
      lastTouchpoint: type,
      lastTouchpointAt: new Date().toISOString(),
    };
    if (payload.phone && String(payload.phone).trim() !== '') {
      contactProps.phone = String(payload.phone).trim();
    }
    if (payload.source) {
      contactProps.source = payload.source;
    }
    if (Array.isArray(payload.tags) && payload.tags.length > 0) {
      contactProps.tags = payload.tags;
    }

    // Xác định label cho Contact: ưu tiên fullName thật, nếu không có truyền placeholder Contact <id>
    const contactLabel = payload.fullName && payload.fullName.trim() !== ''
      ? payload.fullName.trim()
      : `Contact ${contactId}`;

    this.upsertNode(orgId, CkgEntityType.CONTACT, contactId, contactLabel, contactProps);

    // 2. Phân nhánh theo từng loại điểm chạm
    switch (type) {
      case 'GROUP_JOIN':
      case 'GROUP_SCAN': {
        if (payload.groupId) {
          const groupId = String(payload.groupId);
          const groupNodeId = deriveNodeId(orgId, CkgEntityType.GROUP, groupId);
          const groupLabel = payload.groupName && payload.groupName.trim() !== ''
            ? payload.groupName.trim()
            : `Nhóm Zalo ${groupId}`;

          this.upsertNode(orgId, CkgEntityType.GROUP, groupId, groupLabel, {
            role: payload.role || 'member',
          });

          this.upsertEdge(orgId, contactNodeId, groupNodeId, CkgRelationType.IN_GROUP, 1.0, {
            firstSeenAt: new Date().toISOString(),
            role: payload.role || 'member',
          });
        }
        break;
      }

      case 'POS_ORDER':
      case 'POS_BILLING_DRAFT': {
        const orderAmount = Number(payload.totalAmount || 0);
        const purchaseWeight = Math.min(2.0, 1.0 + Math.max(0, orderAmount) / 10_000_000);

        if (Array.isArray(payload.items) && payload.items.length > 0) {
          for (const item of payload.items) {
            const productCode = item.code || item.productCode;

            if (productCode) {
              const productName = item.name || item.productName || productCode || 'Sản phẩm';
              const productNodeId = deriveNodeId(orgId, CkgEntityType.PRODUCT, productCode);

              this.upsertNode(orgId, CkgEntityType.PRODUCT, productCode, productName, {
                price: item.price || item.unitPrice || 0,
              });

              this.upsertEdge(orgId, contactNodeId, productNodeId, CkgRelationType.PURCHASED, purchaseWeight, {
                orderId: payload.orderId || payload.draftId,
                amount: orderAmount,
                quantity: item.quantity || 1,
              });
            }
          }
        }
        break;
      }

      case 'CHAT_MESSAGE': {
        if (payload.conversationId) {
          const convId = String(payload.conversationId);
          const convNodeId = deriveNodeId(orgId, CkgEntityType.CONVERSATION, convId);

          this.upsertNode(orgId, CkgEntityType.CONVERSATION, convId, `Hội thoại ${convId}`, {
            senderType: payload.senderType || 'customer',
          });

          this.upsertEdge(orgId, contactNodeId, convNodeId, CkgRelationType.CHATTED_WITH, 1.0, {
            messageId: payload.messageId,
            contentSnippet: (payload.content || '').slice(0, 100),
          });
        }

        // Bóc tách sản phẩm quan tâm nếu có
        if (Array.isArray(payload.productMentions) && payload.productMentions.length > 0) {
          for (const prodCode of payload.productMentions) {
            const prodNodeId = deriveNodeId(orgId, CkgEntityType.PRODUCT, prodCode);
            this.upsertNode(orgId, CkgEntityType.PRODUCT, prodCode, prodCode, {});
            this.upsertEdge(orgId, contactNodeId, prodNodeId, CkgRelationType.INTERESTED_IN, 1.1, {
              source: 'chat_mention',
            });
          }
        }
        break;
      }

      case 'SALE_FEEDBACK': {
        if (payload.personaId) {
          const pId = payload.personaId;
          const meta = PERSONA_CLUSTERS_METADATA[pId as PersonaCluster];
          const pLabel = meta?.label || pId;
          const personaNodeId = deriveNodeId(orgId, CkgEntityType.PERSONA, pId);

          this.upsertNode(orgId, CkgEntityType.PERSONA, pId, pLabel, {
            description: meta?.description || '',
          });

          const isConfirm = payload.action === 'CONFIRM';
          const weight = isConfirm ? 1.8 : 1.3;

          this.upsertEdge(orgId, contactNodeId, personaNodeId, CkgRelationType.BELONGS_TO, weight, {
            setExactWeight: true,
            feedbackReason: payload.reason || '',
            confirmedAt: new Date().toISOString(),
          });
        }
        break;
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Flush Pipeline & Raw SQL Vectorized Batch Upsert
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Xả toàn bộ bộ đệm trong RAM xuống cơ sở dữ liệu PostgreSQL.
   */
  public async flush(): Promise<void> {
    if (this.isFlushing) return;
    if (this.nodeBuffer.size === 0 && this.edgeBuffer.size === 0 && this.touchpointBuffer.length === 0) {
      return;
    }

    this.isFlushing = true;
    const startTime = Date.now();

    // 1. Snapshot và clear buffers hiện tại để nhường chỗ cho request mới ngay lập tức
    const nodesToFlush = Array.from(this.nodeBuffer.values());
    const edgesToFlush = Array.from(this.edgeBuffer.values());
    const touchpointsToFlush = [...this.touchpointBuffer];

    this.nodeBuffer.clear();
    this.edgeBuffer.clear();
    this.touchpointBuffer = [];

    try {
      // 2. Ghi Nodes TRƯỚC (Bắt buộc để thỏa mãn Foreign Key của Edges)
      if (nodesToFlush.length > 0) {
        await this.batchUpsertNodesSql(nodesToFlush);
        this.stats.totalNodesFlushed += nodesToFlush.length;
      }

      // 3. Ghi Edges SAU
      if (edgesToFlush.length > 0) {
        await this.batchUpsertEdgesSql(edgesToFlush);
        this.stats.totalEdgesFlushed += edgesToFlush.length;
      }

      // 4. Vô hiệu hóa bộ đệm cache cho các contact bị tác động
      if (touchpointsToFlush.length > 0) {
        await this.invalidateAffectedProfiles(touchpointsToFlush);
        this.stats.totalTouchpointsProcessed += touchpointsToFlush.length;
      }

      const duration = Date.now() - startTime;
      this.stats.lastFlushAt = new Date();
      this.stats.avgFlushDurationMs =
        this.stats.avgFlushDurationMs === 0
          ? duration
          : Math.round((this.stats.avgFlushDurationMs * 4 + duration) / 5);

      logger.debug(
        `[CkgIngestion] Flushed ${nodesToFlush.length} nodes, ${edgesToFlush.length} edges in ${duration}ms`
      );
    } catch (error) {
      this.stats.errorCount++;
      logger.error('[CkgIngestion] Error during batch flush to PostgreSQL:', error);
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Raw SQL Batch Upsert Nodes sử dụng PostgreSQL UNNEST.
   * Hardened:
   * - Widen $3::varchar(64)[]
   * - Bảo toàn label thật, chống overwrite bởi Contact <id>
   * - Shallow merge JSONB an toàn
   */
  private async batchUpsertNodesSql(nodes: ICkgNodeInput[]): Promise<IBatchUpsertResult> {
    if (nodes.length === 0) return { insertedOrUpdated: 0, durationMs: 0 };
    const start = Date.now();

    const ids: string[] = [];
    const orgIds: string[] = [];
    const entityTypes: string[] = [];
    const entityIds: string[] = [];
    const labels: string[] = [];
    const propertiesJson: string[] = [];

    for (const n of nodes) {
      const nodeId = deriveNodeId(n.orgId, n.entityType, n.entityId);
      ids.push(nodeId);
      orgIds.push(n.orgId);
      entityTypes.push(n.entityType);
      entityIds.push(n.entityId);
      labels.push(n.label || n.entityId);
      propertiesJson.push(JSON.stringify(cleanProperties(n.properties)));
    }

    const sql = `
      INSERT INTO graph_nodes (
        id, org_id, entity_type, entity_id, label, properties, created_at, updated_at
      )
      SELECT
        u.id,
        u.org_id,
        u.entity_type,
        u.entity_id,
        u.label,
        u.properties::jsonb,
        NOW(),
        NOW()
      FROM unnest(
        $1::varchar(36)[],
        $2::varchar(36)[],
        $3::varchar(64)[],
        $4::varchar(255)[],
        $5::varchar(255)[],
        $6::text[]
      ) AS u(id, org_id, entity_type, entity_id, label, properties)
      ON CONFLICT (org_id, entity_type, entity_id) DO UPDATE SET
        label = CASE
          WHEN EXCLUDED.label IS NOT NULL 
               AND TRIM(EXCLUDED.label) != '' 
               AND EXCLUDED.label !~ '^(Contact [a-zA-Z0-9_-]+|Nhóm Zalo [a-zA-Z0-9_-]+|Hội thoại [a-zA-Z0-9_-]+)$'
          THEN EXCLUDED.label
          WHEN graph_nodes.label IS NOT NULL 
               AND TRIM(graph_nodes.label) != '' 
               AND graph_nodes.label !~ '^(Contact [a-zA-Z0-9_-]+|Nhóm Zalo [a-zA-Z0-9_-]+|Hội thoại [a-zA-Z0-9_-]+)$'
          THEN graph_nodes.label
          ELSE EXCLUDED.label
        END,
        properties = graph_nodes.properties || EXCLUDED.properties,
        updated_at = NOW();
    `;

    const count = await prisma.$executeRawUnsafe(
      sql,
      ids,
      orgIds,
      entityTypes,
      entityIds,
      labels,
      propertiesJson
    );

    return { insertedOrUpdated: Number(count), durationMs: Date.now() - start };
  }

  /**
   * Raw SQL Batch Upsert Edges sử dụng PostgreSQL UNNEST.
   * Hardened:
   * - Widen $5::varchar(64)[]
   * - Tôn trọng setExactWeight và chặn trần LEAST(2.0, GREATEST(0.0, weight))
   */
  private async batchUpsertEdgesSql(edges: ICkgEdgeInput[]): Promise<IBatchUpsertResult> {
    if (edges.length === 0) return { insertedOrUpdated: 0, durationMs: 0 };
    const start = Date.now();

    const ids: string[] = [];
    const orgIds: string[] = [];
    const sourceNodeIds: string[] = [];
    const targetNodeIds: string[] = [];
    const relationTypes: string[] = [];
    const weights: number[] = [];
    const propertiesJson: string[] = [];

    for (const e of edges) {
      const edgeHash = createHash('sha256')
        .update(`${e.orgId}:${e.sourceNodeId}:${e.targetNodeId}:${e.relationType}`)
        .digest('hex');
      const edgeId = `${edgeHash.slice(0, 8)}-${edgeHash.slice(8, 12)}-4${edgeHash.slice(13, 16)}-a${edgeHash.slice(17, 20)}-${edgeHash.slice(20, 32)}`;

      const clampedWeight = Math.min(2.0, Math.max(0.0, Number(e.weight ?? 1.0)));

      ids.push(edgeId);
      orgIds.push(e.orgId);
      sourceNodeIds.push(e.sourceNodeId);
      targetNodeIds.push(e.targetNodeId);
      relationTypes.push(e.relationType);
      weights.push(clampedWeight);
      propertiesJson.push(JSON.stringify(cleanProperties(e.properties)));
    }

    const sql = `
      INSERT INTO graph_edges (
        id, org_id, source_node_id, target_node_id, relation_type, weight, properties, created_at, updated_at
      )
      SELECT
        u.id,
        u.org_id,
        u.source_node_id,
        u.target_node_id,
        u.relation_type,
        u.weight,
        u.properties::jsonb,
        NOW(),
        NOW()
      FROM unnest(
        $1::varchar(36)[],
        $2::varchar(36)[],
        $3::varchar(36)[],
        $4::varchar(36)[],
        $5::varchar(64)[],
        $6::float8[],
        $7::text[]
      ) AS u(id, org_id, source_node_id, target_node_id, relation_type, weight, properties)
      ON CONFLICT (org_id, source_node_id, target_node_id, relation_type) DO UPDATE SET
        weight = CASE
          WHEN (EXCLUDED.properties->>'setExactWeight')::boolean IS TRUE 
            THEN LEAST(2.0, GREATEST(0.0, EXCLUDED.weight))
          ELSE LEAST(2.0, GREATEST(0.0, graph_edges.weight + 0.1))
        END,
        properties = graph_edges.properties || EXCLUDED.properties,
        updated_at = NOW();
    `;

    const count = await prisma.$executeRawUnsafe(
      sql,
      ids,
      orgIds,
      sourceNodeIds,
      targetNodeIds,
      relationTypes,
      weights,
      propertiesJson
    );

    return { insertedOrUpdated: Number(count), durationMs: Date.now() - start };
  }

  /**
   * Đánh dấu hết hạn bộ đệm cache trong `inferred_customer_profiles` cho các Contact có sự kiện mới.
   */
  private async invalidateAffectedProfiles(touchpoints: ITouchpointJob[]): Promise<void> {
    const contactIds = Array.from(new Set(touchpoints.map((t) => t.contactId)));
    if (contactIds.length === 0) return;

    try {
      await prisma.$executeRawUnsafe(
        `
        UPDATE inferred_customer_profiles
        SET valid_until = NOW(), last_event_at = NOW(), updated_at = NOW()
        WHERE contact_id = ANY($1::varchar(36)[])
        `,
        contactIds
      );
    } catch (err) {
      logger.warn('[CkgIngestion] Failed to invalidate inferred profiles cache:', err);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Persona Centroids Seed Bootstrapping (Milestone 2 Lookalike Enabler)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Khởi tạo và nạp 5 cụm Persona Centroid mặc định kèm 768-dim Unit Embeddings
   * vào bảng graph_nodes cho các Organization khi hệ thống khởi động.
   * Hỗ trợ Dual-mode: ghi trực tiếp cột native vector(768) nếu có, hoặc lưu JSONB fallback.
   */
  public async seedPersonaCentroids(targetOrgId?: string): Promise<IPersonaSeedResult> {
    const start = Date.now();
    let orgIds: string[] = [];

    if (targetOrgId) {
      orgIds = [targetOrgId];
    } else {
      try {
        const orgs = await prisma.organization.findMany({ select: { id: true } });
        orgIds = orgs.map((o) => o.id);
      } catch {
        orgIds = [];
      }
    }

    if (orgIds.length === 0) {
      return { seededCount: 0, orgCount: 0, durationMs: Date.now() - start, clustersSeeded: [] };
    }

    // Kiểm tra xem database có cột embedding vector(768) hay không
    let hasVectorColumn = false;
    try {
      const colCheck: any[] = await prisma.$queryRawUnsafe(`
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'graph_nodes' AND column_name = 'embedding'
      `);
      hasVectorColumn = Array.isArray(colCheck) && colCheck.length > 0;
    } catch {
      hasVectorColumn = false;
    }

    const clusters = Object.values(PersonaCluster);
    let totalSeeded = 0;

    for (const orgId of orgIds) {
      for (const cluster of clusters) {
        const meta = PERSONA_CLUSTERS_METADATA[cluster];
        if (!meta) continue;

        const nodeId = deriveNodeId(orgId, CkgEntityType.PERSONA, cluster);
        const vector = CANONICAL_PERSONA_CENTROIDS[cluster];
        const vectorStr = `[${vector.join(',')}]`;

        const properties = {
          clusterBadge: meta.clusterBadge,
          description: meta.description,
          defaultNeeds: meta.defaultNeeds,
          suggestedVoucher: meta.suggestedVoucher,
          recommendedProducts: meta.recommendedProducts,
          associatedTags: meta.associatedTags,
          isCentroid: true,
          embedding: vector,
          seededAt: new Date().toISOString(),
        };

        if (hasVectorColumn) {
          await prisma.$executeRawUnsafe(
            `
            INSERT INTO graph_nodes (
              id, org_id, entity_type, entity_id, label, properties, embedding, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::vector, NOW(), NOW())
            ON CONFLICT (org_id, entity_type, entity_id) DO UPDATE SET
              label = EXCLUDED.label,
              properties = graph_nodes.properties || EXCLUDED.properties,
              embedding = EXCLUDED.embedding,
              updated_at = NOW()
            `,
            nodeId,
            orgId,
            CkgEntityType.PERSONA,
            cluster,
            meta.label,
            JSON.stringify(properties),
            vectorStr
          );
        } else {
          await prisma.$executeRawUnsafe(
            `
            INSERT INTO graph_nodes (
              id, org_id, entity_type, entity_id, label, properties, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW(), NOW())
            ON CONFLICT (org_id, entity_type, entity_id) DO UPDATE SET
              label = EXCLUDED.label,
              properties = graph_nodes.properties || EXCLUDED.properties,
              updated_at = NOW()
            `,
            nodeId,
            orgId,
            CkgEntityType.PERSONA,
            cluster,
            meta.label,
            JSON.stringify(properties)
          );
        }

        totalSeeded++;
      }
    }

    const durationMs = Date.now() - start;
    logger.info(
      `[CkgIngestion] Seeded ${totalSeeded} Persona Centroid nodes across ${orgIds.length} organization(s) in ${durationMs}ms (pgvector native: ${hasVectorColumn})`
    );

    return {
      seededCount: totalSeeded,
      orgCount: orgIds.length,
      durationMs,
      clustersSeeded: clusters,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Lifecycle & Management Methods
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Lấy số liệu thống kê vận hành của Ingestion Engine.
   */
  public getStats(): ICkgIngestionStats {
    return {
      ...this.stats,
      queuedNodes: this.nodeBuffer.size,
      queuedEdges: this.edgeBuffer.size,
      queuedTouchpoints: this.touchpointBuffer.length,
    };
  }

  /**
   * Xả đệm tức thì và dừng timer (dùng khi tắt server / graceful shutdown).
   */
  public async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
    logger.info('[CkgIngestion] Service gracefully shut down, all buffers flushed.');
  }
}

// Singleton Instance xuất xưởng cho toàn bộ ứng dụng
export const ckgIngestionService = new CkgIngestionService();
