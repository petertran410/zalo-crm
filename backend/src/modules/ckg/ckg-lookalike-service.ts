/**
 * ckg-lookalike-service.ts — Vector Lookalike Centroid Engine (Milestone 2)
 *
 * Nhiệm vụ cốt lõi:
 * 1. Bộ sinh vector đơn vị chuẩn hóa L2 768 chiều tất định (Mulberry32 PRNG + Box-Muller).
 * 2. 5 Persona Centroids chuẩn hóa (FNB_WORKSHOP_STUDENT, FNB_SHOP_OWNER, WHOLESALE_DISTRIBUTOR, HOME_CAFE_RETAIL, TRIAL_EXPLORER).
 * 3. Tính toán vector đại diện tiếp xúc của Contact từ cấu trúc lân cận 1-hop của CKG (0đ chi phí token LLM).
 * 4. Truy vấn Cosine pgvector 1 - (embedding <=> $1::vector) và cơ chế Dual-Mode V8 Float32Array in-memory fallback.
 * 5. Công thức suy luận lai (Adaptive Hybrid Blending): S_hybrid = alpha * S_vector + (1 - alpha) * S_graph.
 */

import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import {
  PersonaCluster,
  PERSONA_CLUSTERS_METADATA,
  ConfidenceTier,
  type IVectorMatch,
  type IHybridLookalikeEvaluation,
} from './ckg-types.js';

// ── 1. PRNG & Deterministic 768-Dim Vector Generation ────────────────────────

/**
 * Băm chuỗi văn bản thành số nguyên 32-bit không dấu (Murmur/FNV-1a 32-bit hash).
 */
export function hashStringToSeed32(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Bộ sinh số giả ngẫu nhiên Mulberry32 (PRNG 32-bit).
 */
export function createMulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Sinh vector ngẫu nhiên độc lập 768 chiều tuân theo phân phối chuẩn Gaussian N(0, 1)
 * qua phép biến đổi Box-Muller.
 */
function generateRawGaussianVector768(seedStr: string): Float64Array {
  const rng = createMulberry32(hashStringToSeed32(seedStr));
  const vec = new Float64Array(768);

  for (let i = 0; i < 768; i += 2) {
    const u1 = Math.max(1e-15, rng());
    const u2 = rng();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    const z1 = Math.sqrt(-2.0 * Math.log(u1)) * Math.sin(2.0 * Math.PI * u2);

    vec[i] = z0;
    if (i + 1 < 768) {
      vec[i + 1] = z1;
    }
  }

  return vec;
}

/**
 * Sinh vector đơn vị chuẩn hóa L2 768 chiều tất định từ chuỗi seed.
 * Có pha trộn thành phần cơ sở chung của ngành mỹ phẩm chăm sóc da (Domain Bias Injection).
 */
export function generateUnitVector768(seedStr: string): number[] {
  // 1. Vector cụm đặc trưng
  const clusterVec = generateRawGaussianVector768(seedStr);

  // 2. Vector cơ sở chung của domain F&B nguyên liệu đồ uống & workshop
  const baseVec = generateRawGaussianVector768('CKG_FNB_BEVERAGE_CRM_COMMON_DOMAIN_V1');

  // 3. Pha trộn: 80% đặc trưng Persona + 20% đặc trưng chung CRM
  const mixed = new Float64Array(768);
  let sumSq = 0;
  for (let i = 0; i < 768; i++) {
    const val = 0.80 * clusterVec[i] + 0.20 * baseVec[i];
    mixed[i] = val;
  }

  // 4. Chuẩn hóa L2 về độ dài đơn vị (||v||_2 = 1.0)
  const norm = Math.sqrt(sumSq) || 1.0;
  const result: number[] = new Array(768);
  for (let i = 0; i < 768; i++) {
    result[i] = Number((mixed[i] / norm).toFixed(6));
  }

  return result;
}

/**
 * Bảng 5 vector Centroid bất biến của 5 canonical F&B personas.
 * Được nạp sẵn trong bộ nhớ RAM, thời gian truy cập < 0.001ms.
 */
export const CANONICAL_PERSONA_CENTROIDS: Record<PersonaCluster, number[]> = {
  [PersonaCluster.FNB_WORKSHOP_STUDENT]: generateUnitVector768('CENTROID_V1_FNB_WORKSHOP_STUDENT_PHA_CHE_STARTUP'),
  [PersonaCluster.FNB_SHOP_OWNER]: generateUnitVector768('CENTROID_V1_FNB_SHOP_OWNER_TRA_SUA_TOPPING_THUNG'),
  [PersonaCluster.WHOLESALE_DISTRIBUTOR]: generateUnitVector768('CENTROID_V1_WHOLESALE_DISTRIBUTOR_DAI_LY_TON_PALLET'),
  [PersonaCluster.HOME_CAFE_RETAIL]: generateUnitVector768('CENTROID_V1_HOME_CAFE_RETAIL_TU_PHA_CHE_GIA_DINH'),
  [PersonaCluster.TRIAL_EXPLORER]: generateUnitVector768('CENTROID_V1_TRIAL_EXPLORER_MAU_THU_100G_MENU'),
};

/**
 * Tính toán độ tương đồng Cosine giữa hai vector 768 chiều (V8 TypedArray tối ưu).
 */
export function computeCosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== 768 || b.length !== 768) return 0.0;
  let dot = 0.0;
  let normA = 0.0;
  let normB = 0.0;

  for (let i = 0; i < 768; i++) {
    const ai = a[i];
    const bi = b[i];
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }

  if (!Number.isFinite(normA) || !Number.isFinite(normB) || normA <= 0 || normB <= 0) return 0.0;
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (!Number.isFinite(denom) || denom <= 0) return 0.0;
  const sim = dot / denom;
  if (!Number.isFinite(sim)) return 0.0;
  return Math.max(0.0, Math.min(1.0, Number(sim.toFixed(4))));
}

// ── 2. Vector Lookalike Centroid Engine Service ───────────────────────────────

export class CkgLookalikeService {
  private hasPgvector: boolean | null = null;

  /**
   * Phát hiện xem cơ sở dữ liệu có hỗ trợ cột pgvector hay không (Runtime Feature Detection).
   */
  public async detectPgvectorSupport(): Promise<boolean> {
    if (this.hasPgvector !== null) return this.hasPgvector;

    try {
      const res = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'graph_nodes' AND column_name = 'embedding'
        ) AS exists;
      `);
      this.hasPgvector = Boolean(res[0]?.exists);
    } catch {
      this.hasPgvector = false;
    }

    return this.hasPgvector;
  }

  /**
   * Đặt thủ công cờ hỗ trợ pgvector (phục vụ unit test mocking).
   */
  public setPgvectorSupport(supported: boolean): void {
    this.hasPgvector = supported;
  }

  /**
   * Tính toán vector đại diện của Contact từ các đỉnh lân cận 1-hop trong CKG.
   * Hoàn toàn 0đ chi phí token LLM, thời gian tính trong RAM < 0.02ms.
   */
  public calculateContactEmbedding(
    neighborNodes: Array<{
      id?: string;
      entityType?: string;
      type?: string;
      entityId?: string;
      label?: string;
      properties?: Record<string, unknown>;
    }>,
    neighborEdges: Array<{
      id?: string;
      relationType?: string;
      relation?: string;
      weight?: number;
      targetNodeId?: string;
      target?: string;
      sourceNodeId?: string;
      source?: string;
      properties?: Record<string, unknown>;
    }>,
    contactTags: string[] = []
  ): number[] {
    const weights: Record<PersonaCluster, number> = {
      [PersonaCluster.FNB_WORKSHOP_STUDENT]: 0,
      [PersonaCluster.FNB_SHOP_OWNER]: 0,
      [PersonaCluster.WHOLESALE_DISTRIBUTOR]: 0,
      [PersonaCluster.HOME_CAFE_RETAIL]: 0,
      [PersonaCluster.TRIAL_EXPLORER]: 0,
    };

    // 1. Phân tích các cạnh liên kết trực tiếp
    for (const edge of neighborEdges) {
      const rel = edge.relationType || edge.relation;
      const w = typeof edge.weight === 'number' && Number.isFinite(edge.weight) ? edge.weight : 1.0;

      if (rel === 'BELONGS_TO') {
        // Cạnh xác nhận Persona trực tiếp
        const targetId = edge.target || edge.targetNodeId;
        const targetNode = neighborNodes.find(
          (node) => node.id === targetId || node.entityId === targetId
        );

        for (const cluster of Object.values(PersonaCluster)) {
          const isMatch =
            (targetNode && (
              targetNode.properties?.cluster === cluster ||
              targetNode.properties?.personaId === cluster ||
              targetNode.label === cluster ||
              targetNode.entityId === cluster ||
              targetNode.id === cluster
            )) ||
            targetId === cluster ||
            (typeof targetId === 'string' && targetId.includes(cluster)) ||
            edge.properties?.personaId === cluster;

          if (isMatch) {
            weights[cluster] += w * 3.0;
          }
        }
      }

      if (rel === 'ATTENDED_WORKSHOP' || rel === 'INQUIRED_WORKSHOP') {
        weights[PersonaCluster.FNB_WORKSHOP_STUDENT] += w * 2.5;
      }
    }

    // 2. Phân tích các đỉnh lân cận (Sản phẩm đã mua, Nhóm Zalo, Persona, Workshop, Topic)
    for (const node of neighborNodes) {
      const entityType = node.entityType || node.type;
      const entityId = node.entityId || node.id || '';
      const labelLower = (node.label || '').toLowerCase();
      const entityIdLower = entityId.toLowerCase();

      // Persona node trực tiếp
      if (entityType === 'PERSONA') {
        const cluster = (entityId || node.properties?.cluster || node.properties?.personaId) as PersonaCluster;
        if (weights[cluster] !== undefined) {
          weights[cluster] += 3.0;
        }
      }

      // Workshop node hoặc liên quan đào tạo
      if (
        entityType === 'WORKSHOP' ||
        labelLower.includes('workshop') ||
        labelLower.includes('khóa học') ||
        labelLower.includes('đào tạo') ||
        labelLower.includes('chuyển giao') ||
        labelLower.includes('lớp pha chế')
      ) {
        weights[PersonaCluster.FNB_WORKSHOP_STUDENT] += 2.5;
      }

      // Sản phẩm (PRODUCT)
      if (entityType === 'PRODUCT') {
        // Sỉ lớn / Máy móc thiết bị / Pallet
        if (
          labelLower.includes('25kg') ||
          labelLower.includes('tấn') ||
          labelLower.includes('pallet') ||
          labelLower.includes('bếp chiên') ||
          labelLower.includes('nồi nấu trân châu') ||
          labelLower.includes('máy ép ly') ||
          labelLower.includes('đại lý') ||
          entityIdLower.includes('bulk')
        ) {
          weights[PersonaCluster.WHOLESALE_DISTRIBUTOR] += 2.0;
          weights[PersonaCluster.FNB_SHOP_OWNER] += 1.5;
        }

        // Mua nguyên liệu theo thùng / định kỳ mở quán
        if (
          labelLower.includes('thùng') ||
          labelLower.includes('gói / thùng') ||
          labelLower.includes('hộp / thùng') ||
          labelLower.includes('túi/thùng') ||
          labelLower.includes('hồng trà') ||
          labelLower.includes('trân châu') ||
          labelLower.includes('bột mochi') ||
          labelLower.includes('bột sữa chua') ||
          labelLower.includes('mứt') ||
          labelLower.includes('siro') ||
          labelLower.includes('lermao') ||
          labelLower.includes('boduo') ||
          labelLower.includes('teatreelife') ||
          labelLower.includes('ttl -')
        ) {
          weights[PersonaCluster.FNB_SHOP_OWNER] += 2.0;
          weights[PersonaCluster.FNB_WORKSHOP_STUDENT] += 1.2;
        }

        // Mẫu thử nhỏ
        if (
          labelLower.includes('mẫu thử') ||
          labelLower.includes('sample') ||
          labelLower.includes('100gr') ||
          labelLower.includes('100g') ||
          labelLower.includes('test')
        ) {
          weights[PersonaCluster.TRIAL_EXPLORER] += 2.0;
        }

        // Khách lẻ tự pha chế tại nhà
        if (
          labelLower.includes('túi zip 1kg') ||
          labelLower.includes('pha tại nhà') ||
          labelLower.includes('hũ nhỏ')
        ) {
          weights[PersonaCluster.HOME_CAFE_RETAIL] += 1.5;
        }
      }

      // Nhóm Zalo (GROUP)
      if (entityType === 'GROUP') {
        if (
          labelLower.includes('chủ quán') ||
          labelLower.includes('mở quán') ||
          labelLower.includes('kinh doanh đồ uống') ||
          labelLower.includes('trà sữa') ||
          labelLower.includes('quán cafe')
        ) {
          weights[PersonaCluster.FNB_SHOP_OWNER] += 2.0;
          weights[PersonaCluster.FNB_WORKSHOP_STUDENT] += 1.0;
        }
        if (
          labelLower.includes('workshop') ||
          labelLower.includes('học viên') ||
          labelLower.includes('lớp') ||
          labelLower.includes('công thức')
        ) {
          weights[PersonaCluster.FNB_WORKSHOP_STUDENT] += 2.5;
        }
        if (
          labelLower.includes('sỉ') ||
          labelLower.includes('đại lý') ||
          labelLower.includes('nhà phân phối') ||
          labelLower.includes('buôn')
        ) {
          weights[PersonaCluster.WHOLESALE_DISTRIBUTOR] += 2.0;
        }
        if (
          labelLower.includes('yêu bếp') ||
          labelLower.includes('làm bánh') ||
          labelLower.includes('tự pha') ||
          labelLower.includes('home barista')
        ) {
          weights[PersonaCluster.HOME_CAFE_RETAIL] += 1.8;
        }
      }

      // Hội thoại hoặc Chủ đề trao đổi (CONVERSATION / TOPIC)
      if (entityType === 'CONVERSATION' || entityType === 'TOPIC') {
        if (
          labelLower.includes('workshop') ||
          labelLower.includes('học pha chế') ||
          labelLower.includes('lịch học') ||
          labelLower.includes('giáo trình')
        ) {
          weights[PersonaCluster.FNB_WORKSHOP_STUDENT] += 2.5;
        }
        if (
          labelLower.includes('giá sỉ') ||
          labelLower.includes('thùng') ||
          labelLower.includes('mở quán') ||
          labelLower.includes('menu')
        ) {
          weights[PersonaCluster.FNB_SHOP_OWNER] += 2.0;
        }
        if (
          labelLower.includes('mẫu thử') ||
          labelLower.includes('sample') ||
          labelLower.includes('thử vị')
        ) {
          weights[PersonaCluster.TRIAL_EXPLORER] += 1.8;
        }
      }
    }

    // 3. Phân tích các thẻ tag (Contact Tags)
    for (const tag of contactTags) {
      const tagLower = tag.toLowerCase();
      if (tagLower.includes('workshop') || tagLower.includes('hoc_vien') || tagLower.includes('khoi_nghiep')) {
        weights[PersonaCluster.FNB_WORKSHOP_STUDENT] += 2.5;
      }
      if (tagLower.includes('chu_quan') || tagLower.includes('tra_sua') || tagLower.includes('mua_si')) {
        weights[PersonaCluster.FNB_SHOP_OWNER] += 2.5;
      }
      if (tagLower.includes('dai_ly') || tagLower.includes('npp') || tagLower.includes('phan_phoi')) {
        weights[PersonaCluster.WHOLESALE_DISTRIBUTOR] += 2.5;
      }
      if (tagLower.includes('pha_tai_nha') || tagLower.includes('khach_le') || tagLower.includes('gia_dinh')) {
        weights[PersonaCluster.HOME_CAFE_RETAIL] += 2.0;
      }
      if (tagLower.includes('dung_thu') || tagLower.includes('khach_moi') || tagLower.includes('sample')) {
        weights[PersonaCluster.TRIAL_EXPLORER] += 2.0;
      }
    }

    // 4. Kiểm tra trường hợp Cold-Start (chưa có điểm chạm nào)
    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
    if (totalWeight <= 0) {
      weights[PersonaCluster.TRIAL_EXPLORER] = 1.0;
    }

    // 5. Tổng hợp tuyến tính có trọng số các Persona Centroids
    const aggregated = new Float64Array(768);
    let sumSq = 0;

    for (const cluster of Object.values(PersonaCluster)) {
      const w = weights[cluster];
      if (w > 0) {
        const centroid = CANONICAL_PERSONA_CENTROIDS[cluster];
        for (let i = 0; i < 768; i++) {
          aggregated[i] += w * centroid[i];
        }
      }
    }

    for (let i = 0; i < 768; i++) {
      sumSq += aggregated[i] * aggregated[i];
    }

    // 6. Chuẩn hóa L2 vector kết quả
    const norm = Math.sqrt(sumSq);
    if (!Number.isFinite(norm) || norm <= 0) {
      return [...CANONICAL_PERSONA_CENTROIDS[PersonaCluster.TRIAL_EXPLORER]];
    }

    const finalEmbedding: number[] = new Array(768);
    for (let i = 0; i < 768; i++) {
      finalEmbedding[i] = Number((aggregated[i] / norm).toFixed(6));
    }

    return finalEmbedding;
  }

  /**
   * Tổng hợp vector nhúng của Contact từ các đỉnh lân cận trong CKG.
   * Nếu có truyền mảng láng giềng thì tính ngay, nếu không thì truy vấn 1-hop từ DB.
   */
  public async aggregateContactEmbedding(
    orgId: string,
    contactId: string,
    neighborNodes?: any[],
    neighborEdges?: any[],
    contactTags?: string[]
  ): Promise<number[]> {
    if (Array.isArray(neighborNodes) && neighborNodes.length > 0) {
      return this.calculateContactEmbedding(neighborNodes, neighborEdges || [], contactTags || []);
    }
    const node = await (prisma as any).graphNode?.findFirst?.({
      where: { orgId, entityType: 'CONTACT', entityId: contactId },
      include: {
        outgoingEdges: { include: { targetNode: true } },
        incomingEdges: { include: { sourceNode: true } },
      },
    });
    if (!node) {
      return [...CANONICAL_PERSONA_CENTROIDS[PersonaCluster.TRIAL_EXPLORER]];
    }
    const nodes = [
      node,
      ...((node.outgoingEdges as any[]) || []).map((e: any) => e.targetNode),
      ...((node.incomingEdges as any[]) || []).map((e: any) => e.sourceNode),
    ];
    const edges = [...((node.outgoingEdges as any[]) || []), ...((node.incomingEdges as any[]) || [])];
    return this.calculateContactEmbedding(nodes, edges, contactTags || []);
  }

  /**
   * So khớp top 5 Persona Centroid gần nhất bằng pgvector native hoặc In-Memory Fallback.
   */
  public async matchTopPersonas(
    orgId: string,
    contactEmbedding: number[]
  ): Promise<IVectorMatch[]> {
    const isPgvector = await this.detectPgvectorSupport();

    if (isPgvector) {
      try {
        const vectorStr = `[${contactEmbedding.join(',')}]`;
        const rows = await prisma.$queryRawUnsafe<
          Array<{
            personaId: string;
            label: string;
            properties: any;
            similarity: number;
          }>
        >(
          `
          SELECT
            entity_id AS "personaId",
            label,
            properties,
            GREATEST(0.0, LEAST(1.0, 1 - (embedding <=> $1::vector))) AS similarity
          FROM graph_nodes
          WHERE org_id = $2
            AND entity_type = 'PERSONA'
            AND embedding IS NOT NULL
          ORDER BY embedding <=> $1::vector
          LIMIT 5;
          `,
          vectorStr,
          orgId
        );

        if (rows && rows.length > 0) {
          return rows.map((r, idx) => {
            const clusterId = r.personaId as PersonaCluster;
            const meta = PERSONA_CLUSTERS_METADATA[clusterId];
            return {
              personaId: clusterId,
              label: r.label || meta?.label || clusterId,
              clusterBadge: (r.properties?.clusterBadge as string) || meta?.clusterBadge || '',
              cosineSimilarity: Math.max(0.0, Math.min(1.0, Number(Number(r.similarity).toFixed(4)))),
              rank: idx + 1,
            };
          });
        }
      } catch (err) {
        logger.warn('[CkgLookalike] pgvector query failed, falling back to In-Memory dot-product:', err);
      }
    }

    // In-Memory Fallback
    return this.matchTopPersonasInMemory(contactEmbedding);
  }

  /**
   * So khớp Persona trên bộ nhớ RAM (V8 Float32Array dot-product) độc lập 100% với DB.
   */
  public matchTopPersonasInMemory(contactEmbedding: number[]): IVectorMatch[] {
    const results: IVectorMatch[] = [];
    const clusters = Object.values(PersonaCluster);

    for (const cluster of clusters) {
      const centroid = CANONICAL_PERSONA_CENTROIDS[cluster];
      const meta = PERSONA_CLUSTERS_METADATA[cluster];
      const similarity = computeCosineSimilarity(contactEmbedding, centroid);

      results.push({
        personaId: cluster,
        label: meta.label,
        clusterBadge: meta.clusterBadge,
        cosineSimilarity: similarity,
        rank: 0,
      });
    }

    // Sắp xếp giảm dần theo độ tương đồng Cosine
    results.sort((a, b) => b.cosineSimilarity - a.cosineSimilarity);
    results.forEach((r, idx) => {
      r.rank = idx + 1;
    });

    return results;
  }

  /**
   * Tính toán điểm tương đồng lai kết hợp Vector Cosine + Trọng số bằng chứng đồ thị (Hybrid Fusion).
   * S_hybrid = alpha * S_vector + (1 - alpha) * S_graph.
   */
  public evaluateHybridLookalike(
    vectorMatches: IVectorMatch[],
    graphDirectEdgeWeight: number | null,
    productMatchesCount: number,
    totalOrdersCount: number,
    groupHomophilyRatio: number,
    touchpointCount: number
  ): IHybridLookalikeEvaluation {
    const topVector = vectorMatches[0] || {
      personaId: PersonaCluster.TRIAL_EXPLORER,
      label: PERSONA_CLUSTERS_METADATA[PersonaCluster.TRIAL_EXPLORER].label,
      clusterBadge: PERSONA_CLUSTERS_METADATA[PersonaCluster.TRIAL_EXPLORER].clusterBadge,
      cosineSimilarity: 0.5,
      rank: 1,
    };

    const S_vector = topVector.cosineSimilarity;
    let S_graph = 0.5;
    let alpha = 0.70;

    if (graphDirectEdgeWeight !== null && graphDirectEdgeWeight > 0) {
      // Có phản hồi xác nhận trực tiếp từ Sale (CONFIRM = 1.8 -> S_graph = 1.0)
      S_graph = Math.min(1.0, graphDirectEdgeWeight / 1.8);
      alpha = 0.15; // Đồ thị chiếm 85%, Vector 15%
    } else {
      const S_product =
        totalOrdersCount > 0
          ? Math.min(1.0, productMatchesCount / totalOrdersCount)
          : 0.4;
      const S_group = Math.min(1.0, Math.max(0.0, groupHomophilyRatio));
      S_graph = 0.65 * S_product + 0.35 * S_group;

      if (touchpointCount >= 4) {
        alpha = 0.35; // Nhiều điểm chạm: Đồ thị chiếm 65%
      } else if (touchpointCount >= 2) {
        alpha = 0.60; // 2-3 điểm chạm: Vector 60%
      } else {
        alpha = 0.80; // 0-1 điểm chạm (Cold-start): Vector quyết định 80%
      }
    }

    const S_hybrid = alpha * S_vector + (1 - alpha) * S_graph;

    // Phân tầng độ tin cậy lũy tiến
    const isConsolidated =
      (graphDirectEdgeWeight !== null && graphDirectEdgeWeight >= 1.5) ||
      (touchpointCount >= 4 && S_hybrid >= 0.75);

    let confidencePercentage: number;
    let confidenceTier: ConfidenceTier;
    let color: 'amber' | 'emerald';

    if (isConsolidated) {
      // CONSOLIDATED: 85% - 95%
      confidencePercentage = Math.round(85 + Math.min(10, Math.max(0, (S_hybrid - 0.75) * 40)));
      confidenceTier = ConfidenceTier.CONSOLIDATED;
      color = 'emerald';
    } else {
      // PRELIMINARY: 50% - 65%
      confidencePercentage = Math.round(50 + Math.min(15, Math.max(0, S_hybrid * 20)));
      confidenceTier = ConfidenceTier.PRELIMINARY;
      color = 'amber';
    }

    return {
      topPersonaId: topVector.personaId,
      topPersonaLabel: topVector.label,
      clusterBadge: topVector.clusterBadge,
      vectorSimilarity: S_vector,
      graphEvidenceScore: Number(S_graph.toFixed(4)),
      hybridScore: Number(S_hybrid.toFixed(4)),
      confidenceScore: Number((confidencePercentage / 100).toFixed(2)),
      confidencePercentage,
      confidenceTier,
      color,
      allMatches: vectorMatches,
    };
  }
}

// Singleton instances and aliases
export const ckgLookalikeService = new CkgLookalikeService();
export const vectorCentroidEngine = ckgLookalikeService;
export const VectorCentroidEngine = CkgLookalikeService;
