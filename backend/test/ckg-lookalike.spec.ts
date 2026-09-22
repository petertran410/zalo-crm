/**
 * ckg-lookalike.spec.ts — Comprehensive Test Suite for Vector Lookalike Centroid Engine
 *
 * Kiểm chứng:
 * 1. Bộ sinh vector đơn vị 768 chiều tất định (generateUnitVector768, L2 norm = 1.0, không NaN).
 * 2. 5 Persona Centroid chuẩn hóa và ma trận độ tương đồng ngữ nghĩa.
 * 3. Thuật toán tổng hợp vector tiếp xúc Contact từ đồ thị lân cận 1-hop (Graph-Weighted Centroid Aggregation).
 * 4. So khớp Cosine Similarity trên bộ nhớ RAM (V8 Float32Array dot-product) độc lập DB.
 * 5. Cơ chế Dual-Mode: truy vấn pgvector native khi có extension và tự động fallback về RAM khi không có.
 * 6. Công thức suy luận lai thích ứng (Adaptive Hybrid Blending) và phân tầng tin cậy (PRELIMINARY vs CONSOLIDATED).
 * 7. Benchmark tốc độ tính toán vector trên RAM (< 0.05ms).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CkgLookalikeService,
  ckgLookalikeService,
  vectorCentroidEngine,
  CANONICAL_PERSONA_CENTROIDS,
  generateUnitVector768,
  computeCosineSimilarity,
  hashStringToSeed32,
  createMulberry32,
} from '../src/modules/ckg/ckg-lookalike-service.js';
import {
  PersonaCluster,
  ConfidenceTier,
} from '../src/modules/ckg/ckg-types.js';
import { prisma } from '../src/shared/database/prisma-client.js';
import {
  ckgIngestionService,
  generateDeterministicCentroidVector,
} from '../src/modules/ckg/ckg-ingestion-service.js';

describe('CKG Vector Lookalike Centroid Engine Tests', () => {
  let service: CkgLookalikeService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CkgLookalikeService();
  });

  describe('1. Deterministic 768d Unit Vector Generation', () => {
    it('should generate exactly 768 dimensions without any NaN or null entries', () => {
      const vec = generateUnitVector768('TEST_PERSONA_CENTROID_V1');
      expect(vec.length).toBe(768);
      for (const val of vec) {
        expect(typeof val).toBe('number');
        expect(isNaN(val)).toBe(false);
      }
    });

    it('should have L2 norm equal to 1.0 (+- 0.001)', () => {
      const vec = generateUnitVector768('ANOTHER_SEED_FOR_L2_NORM');
      const sumSq = vec.reduce((acc, v) => acc + v * v, 0);
      const norm = Math.sqrt(sumSq);
      expect(norm).toBeGreaterThan(0.999);
      expect(norm).toBeLessThan(1.001);
    });

    it('should be strictly deterministic across repeated calls with identical seed', () => {
      const vec1 = generateUnitVector768('DETERMINISTIC_SEED_XYZ');
      const vec2 = generateUnitVector768('DETERMINISTIC_SEED_XYZ');
      expect(vec1).toEqual(vec2);
    });

    it('should generate distinct vectors for distinct seeds', () => {
      const vecA = generateUnitVector768('SEED_ALPHA');
      const vecB = generateUnitVector768('SEED_BETA');
      expect(vecA).not.toEqual(vecB);
      const sim = computeCosineSimilarity(vecA, vecB);
      expect(sim).toBeLessThan(0.95);
    });
  });

  describe('2. Canonical Persona Centroids & Semantic Separation', () => {
    it('should provide all 5 canonical persona centroids in CANONICAL_PERSONA_CENTROIDS', () => {
      const clusters = Object.values(PersonaCluster);
      expect(clusters.length).toBe(5);

      for (const cluster of clusters) {
        const centroid = CANONICAL_PERSONA_CENTROIDS[cluster];
        expect(centroid).toBeDefined();
        expect(centroid.length).toBe(768);
      }
    });

    it('should exhibit perfect self-similarity (1.0) and realistic cross-persona separation', () => {
      const wholesale = CANONICAL_PERSONA_CENTROIDS[PersonaCluster.WHOLESALE_BUYER];
      const office = CANONICAL_PERSONA_CENTROIDS[PersonaCluster.OFFICE_SKINCARE];
      const genz = CANONICAL_PERSONA_CENTROIDS[PersonaCluster.GENZ_ACNE_GLOW];

      // Self-similarity
      expect(computeCosineSimilarity(wholesale, wholesale)).toBeCloseTo(1.0, 3);
      expect(computeCosineSimilarity(office, office)).toBeCloseTo(1.0, 3);

      // Cross-persona separation (domain bias keeps them in 0.15 - 0.40 range)
      const simWholesaleOffice = computeCosineSimilarity(wholesale, office);
      expect(simWholesaleOffice).toBeGreaterThan(0.10);
      expect(simWholesaleOffice).toBeLessThan(0.45);

      const simGenzOffice = computeCosineSimilarity(genz, office);
      expect(simGenzOffice).toBeGreaterThan(0.10);
      expect(simGenzOffice).toBeLessThan(0.45);
    });

    it('should verify generateDeterministicCentroidVector produces identical vectors to CANONICAL_PERSONA_CENTROIDS with cosine similarity strictly 1.0000', () => {
      for (const cluster of Object.values(PersonaCluster)) {
        const canonical = CANONICAL_PERSONA_CENTROIDS[cluster];
        const generated = generateDeterministicCentroidVector(cluster, 768);
        expect(generated).toEqual(canonical);
        const sim = computeCosineSimilarity(generated, canonical);
        expect(sim).toBe(1.0);
      }
    });

    it('should verify seedPersonaCentroids seeds vectors identical to CANONICAL_PERSONA_CENTROIDS with cosine similarity strictly 1.0000', async () => {
      const seededVectors: Record<string, number[]> = {};
      const executeSpy = vi.spyOn(prisma, '$executeRawUnsafe').mockImplementation(async (_sql: unknown, ...args: unknown[]) => {
        // args[3] is cluster (entity_id), args[6] is vectorStr: "[...]"
        const cluster = args[3] as string;
        const vectorStr = args[6] as string;
        if (cluster && vectorStr && typeof vectorStr === 'string' && vectorStr.startsWith('[')) {
          seededVectors[cluster] = JSON.parse(vectorStr);
        }
        return 1;
      });

      // Mock information_schema check for vector column
      vi.spyOn(prisma, '$queryRawUnsafe').mockResolvedValue([{ 1: 1 }]);

      await ckgIngestionService.seedPersonaCentroids('org-test-alignment');

      expect(Object.keys(seededVectors).length).toBe(5);
      for (const cluster of Object.values(PersonaCluster)) {
        const canonical = CANONICAL_PERSONA_CENTROIDS[cluster];
        const seeded = seededVectors[cluster];
        expect(seeded).toBeDefined();
        expect(seeded.length).toBe(768);
        expect(seeded).toEqual(canonical);
        const sim = computeCosineSimilarity(seeded, canonical);
        expect(sim).toBe(1.0);
      }
      executeSpy.mockRestore();
    });
  });

  describe('3. Topological Contact Embedding Calculation', () => {
    it('should return TRIAL_EXPLORER centroid for cold-start contact with zero touchpoints', () => {
      const embedding = service.calculateContactEmbedding([], [], []);
      expect(embedding.length).toBe(768);

      const topMatches = service.matchTopPersonasInMemory(embedding);
      expect(topMatches[0].personaId).toBe(PersonaCluster.TRIAL_EXPLORER);
      expect(topMatches[0].cosineSimilarity).toBeCloseTo(1.0, 2);
    });

    it('should shift contact embedding toward WHOLESALE_BUYER when wholesale signals are present', () => {
      const neighborNodes = [
        { entityType: 'PRODUCT', entityId: 'p1', label: 'Serum B5 100ml Sỉ Salon' },
        { entityType: 'GROUP', entityId: 'g1', label: 'Hội Sỉ Mỹ Phẩm & Spa Toàn Quốc' },
      ];
      const neighborEdges = [
        { relationType: 'PURCHASED', weight: 1.8 },
        { relationType: 'IN_GROUP', weight: 1.0 },
      ];
      const contactTags = ['auto:khach_si'];

      const embedding = service.calculateContactEmbedding(neighborNodes, neighborEdges, contactTags);
      const topMatches = service.matchTopPersonasInMemory(embedding);

      expect(topMatches[0].personaId).toBe(PersonaCluster.WHOLESALE_BUYER);
      expect(topMatches[0].cosineSimilarity).toBeGreaterThan(0.85);
    });

    it('should shift contact embedding toward GENZ_ACNE_GLOW when acne/student signals are present', () => {
      const neighborNodes = [
        { entityType: 'PRODUCT', entityId: 'p2', label: 'Serum Niacinamide 10% + BHA Trị Mụn' },
        { entityType: 'GROUP', entityId: 'g2', label: 'Hội Trị Mụn & Skincare Gen Z Học Sinh' },
      ];
      const neighborEdges = [
        { relationType: 'PURCHASED', weight: 1.0 },
        { relationType: 'IN_GROUP', weight: 1.0 },
      ];
      const contactTags = ['auto:gen_z', 'auto:tri_mun'];

      const embedding = service.calculateContactEmbedding(neighborNodes, neighborEdges, contactTags);
      const topMatches = service.matchTopPersonasInMemory(embedding);

      expect(topMatches[0].personaId).toBe(PersonaCluster.GENZ_ACNE_GLOW);
      expect(topMatches[0].cosineSimilarity).toBeGreaterThan(0.85);
    });

    it('should correctly resolve BELONGS_TO edges with UUID targetNodeId matching subgraph node.id and properties.cluster', () => {
      const personaNodeUuid = 'c0a80101-0000-4000-a000-000000000001';
      const neighborNodes = [
        {
          id: personaNodeUuid,
          entityType: 'PERSONA',
          entityId: 'persona-node-1',
          label: 'Dân văn phòng',
          properties: { cluster: PersonaCluster.OFFICE_SKINCARE },
        },
      ];
      const neighborEdges = [
        {
          relationType: 'BELONGS_TO',
          weight: 1.5,
          targetNodeId: personaNodeUuid,
        },
      ];

      const embedding = service.calculateContactEmbedding(neighborNodes, neighborEdges, []);
      const topMatches = service.matchTopPersonasInMemory(embedding);

      expect(topMatches[0].personaId).toBe(PersonaCluster.OFFICE_SKINCARE);
      expect(topMatches[0].cosineSimilarity).toBeCloseTo(1.0, 2);
    });

    it('should correctly resolve BELONGS_TO edges when using edge.target and node.label matching cluster', () => {
      const targetId = 'target-persona-genz';
      const neighborNodes = [
        {
          id: targetId,
          type: 'PERSONA',
          label: PersonaCluster.GENZ_ACNE_GLOW,
        },
      ];
      const neighborEdges = [
        {
          relation: 'BELONGS_TO',
          weight: 2.0,
          target: targetId,
        },
      ];

      const embedding = service.calculateContactEmbedding(neighborNodes, neighborEdges, []);
      const topMatches = service.matchTopPersonasInMemory(embedding);

      expect(topMatches[0].personaId).toBe(PersonaCluster.GENZ_ACNE_GLOW);
      expect(topMatches[0].cosineSimilarity).toBeCloseTo(1.0, 2);
    });

    it('should safely handle NaN edge weights without corrupting embedding coordinates with NaN', () => {
      const neighborNodes = [
        { entityType: 'PRODUCT', entityId: 'p-nan', label: 'Serum Sỉ Salon' },
      ];
      const neighborEdges = [
        { relationType: 'PURCHASED', weight: NaN, targetNodeId: 'p-nan' },
      ];

      const embedding = service.calculateContactEmbedding(neighborNodes, neighborEdges, []);
      expect(embedding.length).toBe(768);
      for (const val of embedding) {
        expect(Number.isFinite(val)).toBe(true);
        expect(isNaN(val)).toBe(false);
      }
      const sim = computeCosineSimilarity(embedding, CANONICAL_PERSONA_CENTROIDS[PersonaCluster.WHOLESALE_BUYER]);
      expect(Number.isFinite(sim)).toBe(true);
      expect(sim).toBeGreaterThan(0.85);
    });
  });

  describe('4. In-Memory Cosine Similarity Matching', () => {
    it('should return 5 matches sorted descending by cosine similarity with correct ranks', () => {
      const targetVec = CANONICAL_PERSONA_CENTROIDS[PersonaCluster.MOM_BABY];
      const matches = service.matchTopPersonasInMemory(targetVec);

      expect(matches.length).toBe(5);
      expect(matches[0].personaId).toBe(PersonaCluster.MOM_BABY);
      expect(matches[0].rank).toBe(1);
      expect(matches[0].cosineSimilarity).toBeCloseTo(1.0, 3);

      for (let i = 1; i < matches.length; i++) {
        expect(matches[i].rank).toBe(i + 1);
        expect(matches[i - 1].cosineSimilarity).toBeGreaterThanOrEqual(matches[i].cosineSimilarity);
      }
    });

    it('should return 0.0 in computeCosineSimilarity when given invalid vectors, zero norms, or NaN entries', () => {
      const normalVec = CANONICAL_PERSONA_CENTROIDS[PersonaCluster.WHOLESALE_BUYER];
      const nanVec = new Array(768).fill(NaN);
      const zeroVec = new Array(768).fill(0);

      expect(computeCosineSimilarity(nanVec, normalVec)).toBe(0.0);
      expect(computeCosineSimilarity(normalVec, nanVec)).toBe(0.0);
      expect(computeCosineSimilarity(zeroVec, normalVec)).toBe(0.0);
      expect(computeCosineSimilarity([], normalVec)).toBe(0.0);
    });
  });

  describe('5. Dual-Mode pgvector Query & Automatic Fallback', () => {
    it('should query pgvector native when extension is detected', async () => {
      service.setPgvectorSupport(true);

      const mockDbRows = [
        { personaId: PersonaCluster.OFFICE_SKINCARE, label: 'Dân văn phòng', properties: { clusterBadge: 'Văn phòng' }, similarity: 0.93 },
        { personaId: PersonaCluster.TRIAL_EXPLORER, label: 'Dùng thử', properties: { clusterBadge: 'Dùng thử' }, similarity: 0.35 },
      ];

      const querySpy = vi.spyOn(prisma, '$queryRawUnsafe').mockResolvedValue(mockDbRows);

      const embedding = CANONICAL_PERSONA_CENTROIDS[PersonaCluster.OFFICE_SKINCARE];
      const matches = await service.matchTopPersonas('org-123', embedding);

      expect(querySpy).toHaveBeenCalled();
      const executedSql = querySpy.mock.calls[0][0] as string;
      expect(executedSql).toContain('embedding <=> $1::vector');
      expect(matches[0].personaId).toBe(PersonaCluster.OFFICE_SKINCARE);
      expect(matches[0].cosineSimilarity).toBe(0.93);
    });

    it('should clamp pgvector cosine similarity to [0.0, 1.0] when database returns out-of-bound values', async () => {
      service.setPgvectorSupport(true);

      const mockDbRows = [
        { personaId: PersonaCluster.OFFICE_SKINCARE, label: 'Dân văn phòng', properties: {}, similarity: -0.34 },
        { personaId: PersonaCluster.TRIAL_EXPLORER, label: 'Dùng thử', properties: {}, similarity: 1.25 },
      ];

      vi.spyOn(prisma, '$queryRawUnsafe').mockResolvedValue(mockDbRows);

      const embedding = CANONICAL_PERSONA_CENTROIDS[PersonaCluster.OFFICE_SKINCARE];
      const matches = await service.matchTopPersonas('org-clamp', embedding);

      expect(matches[0].cosineSimilarity).toBe(0.0);
      expect(matches[1].cosineSimilarity).toBe(1.0);
    });

    it('should automatically fallback to In-Memory calculation when pgvector is not available', async () => {
      service.setPgvectorSupport(false);
      const querySpy = vi.spyOn(prisma, '$queryRawUnsafe');

      const embedding = CANONICAL_PERSONA_CENTROIDS[PersonaCluster.GENZ_ACNE_GLOW];
      const matches = await service.matchTopPersonas('org-no-vector', embedding);

      // Should NOT execute pgvector SQL
      expect(querySpy).not.toHaveBeenCalled();
      expect(matches.length).toBe(5);
      expect(matches[0].personaId).toBe(PersonaCluster.GENZ_ACNE_GLOW);
      expect(matches[0].cosineSimilarity).toBeCloseTo(1.0, 3);
    });

    it('should fallback to In-Memory if pgvector query encounters database error', async () => {
      service.setPgvectorSupport(true);
      vi.spyOn(prisma, '$queryRawUnsafe').mockRejectedValue(new Error('type "vector" does not exist'));

      const embedding = CANONICAL_PERSONA_CENTROIDS[PersonaCluster.WHOLESALE_BUYER];
      const matches = await service.matchTopPersonas('org-err', embedding);

      expect(matches.length).toBe(5);
      expect(matches[0].personaId).toBe(PersonaCluster.WHOLESALE_BUYER);
    });
  });

  describe('6. Adaptive Hybrid Lookalike Evaluation', () => {
    it('should classify cold-start contact into PRELIMINARY tier (50-65%) with amber color', () => {
      const vectorMatches = service.matchTopPersonasInMemory(
        CANONICAL_PERSONA_CENTROIDS[PersonaCluster.TRIAL_EXPLORER]
      );

      const evalResult = service.evaluateHybridLookalike(
        vectorMatches,
        null, // No direct feedback
        0,    // No product matches
        0,    // 0 orders
        0,    // 0 group homophily
        1     // 1 touchpoint (Cold start)
      );

      expect(evalResult.confidenceTier).toBe(ConfidenceTier.PRELIMINARY);
      expect(evalResult.color).toBe('amber');
      expect(evalResult.confidencePercentage).toBeGreaterThanOrEqual(50);
      expect(evalResult.confidencePercentage).toBeLessThanOrEqual(65);
    });

    it('should classify customer into CONSOLIDATED tier (85-95%) with emerald color when Sale CONFIRM feedback exists', () => {
      const vectorMatches = service.matchTopPersonasInMemory(
        CANONICAL_PERSONA_CENTROIDS[PersonaCluster.WHOLESALE_BUYER]
      );

      const evalResult = service.evaluateHybridLookalike(
        vectorMatches,
        1.8,  // Sale CONFIRM feedback weight
        2,    // 2 product matches
        2,    // 2 total orders
        0.5,  // group homophily
        3     // 3 touchpoints
      );

      expect(evalResult.confidenceTier).toBe(ConfidenceTier.CONSOLIDATED);
      expect(evalResult.color).toBe('emerald');
      expect(evalResult.confidencePercentage).toBeGreaterThanOrEqual(85);
      expect(evalResult.confidencePercentage).toBeLessThanOrEqual(95);
    });

    it('should elevate customer into CONSOLIDATED tier when touchpoints >= 4 and hybrid score >= 0.75', () => {
      const vectorMatches = service.matchTopPersonasInMemory(
        CANONICAL_PERSONA_CENTROIDS[PersonaCluster.OFFICE_SKINCARE]
      );

      const evalResult = service.evaluateHybridLookalike(
        vectorMatches,
        null, // No Sale feedback yet
        5,    // 5 products matched
        5,    // 5 total orders
        0.8,  // High group homophily
        6     // 6 touchpoints (mature customer)
      );

      expect(evalResult.confidenceTier).toBe(ConfidenceTier.CONSOLIDATED);
      expect(evalResult.color).toBe('emerald');
      expect(evalResult.confidencePercentage).toBeGreaterThanOrEqual(85);
      expect(evalResult.confidencePercentage).toBeLessThanOrEqual(95);
    });
  });

  describe('7. In-Memory Latency Benchmark (< 0.05ms)', () => {
    it('should perform 1,000 in-memory cosine ranking operations in < 50ms total (avg < 0.05ms)', () => {
      const testVec = CANONICAL_PERSONA_CENTROIDS[PersonaCluster.WHOLESALE_BUYER];
      const start = performance.now();
      const iterations = 1000;

      for (let i = 0; i < iterations; i++) {
        service.matchTopPersonasInMemory(testVec);
      }

      const totalMs = performance.now() - start;
      const avgMs = totalMs / iterations;

      console.log(`[Lookalike Centroid Latency] Total: ${totalMs.toFixed(2)}ms for ${iterations} runs | Avg: ${avgMs.toFixed(4)}ms`);
      expect(avgMs).toBeLessThan(0.05);
    });
  });

  describe('8. Exported Singletons and Aliases', () => {
    it('should provide singleton ckgLookalikeService and vectorCentroidEngine alias', () => {
      expect(ckgLookalikeService).toBeInstanceOf(CkgLookalikeService);
      expect(vectorCentroidEngine).toBe(ckgLookalikeService);
    });
  });
});
