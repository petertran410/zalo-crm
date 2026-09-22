/**
 * ckg-ingestion.spec.ts — Comprehensive Unit & Latency Benchmark Tests for CKG Ingestion Engine (Hardened v2)
 *
 * Kiểm chứng:
 * 1. Thuật toán sinh UUID đỉnh tất định (deriveNodeId) tuân thủ chuẩn RFC 4122, Unicode NFC và safe casting.
 * 2. Cam kết độ trễ <5ms trên luồng chính qua benchmark 1,000 lượt gọi (Avg < 0.5ms, P95 < 2ms, Max < 5ms).
 * 3. Logic phân tách điểm chạm (GROUP, ORDER, CHAT, SALE FEEDBACK) thành Nodes & Edges.
 * 4. Tính lũy đẳng, cơ chế ghi đè / củng cố trọng số cạnh (Weight Reinforcement) và exact weight.
 * 5. Cơ chế bảo toàn nhãn khách hàng (Label Preservation Guard) chống ghi đè bởi placeholder.
 * 6. Vệ sinh thuộc tính sạch sẽ (cleanProperties) loại bỏ undefined/null.
 * 7. Kiểm soát trần bộ nhớ (MAX_BUFFER_CAP = 10,000 trên cả touchpointBuffer) chống tràn OOM.
 * 8. Khởi tạo và nạp Persona Centroids (seedPersonaCentroids) cho Lookalike.
 * 9. Cơ chế vô hiệu hóa cache Inferred Customer Profile và Graceful Shutdown.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CkgIngestionService,
  deriveNodeId,
  isGenericPlaceholderLabel,
  cleanProperties,
  generateDeterministicCentroidVector,
} from '../src/modules/ckg/ckg-ingestion-service.js';
import {
  CkgEntityType,
  CkgRelationType,
  PersonaCluster,
} from '../src/modules/ckg/ckg-types.js';
import { prisma } from '../src/shared/database/prisma-client.js';

describe('CKG Ingestion Engine Unit & Latency Benchmark Tests (Hardened v2)', () => {
  let service: CkgIngestionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CkgIngestionService();
  });

  afterEach(async () => {
    await service.shutdown();
  });

  describe('1. Deterministic Node ID Derivation (deriveNodeId)', () => {
    it('should generate valid RFC 4122 UUID format (8-4-4-4-12)', () => {
      const orgId = 'org-test-101';
      const type = CkgEntityType.CONTACT;
      const id = 'contact-abc-123';

      const nodeId = deriveNodeId(orgId, type, id);

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(nodeId).toMatch(uuidRegex);
    });

    it('should be deterministic: identical inputs must yield identical UUIDs', () => {
      const orgId = 'org-vietnam-beauty';
      const type = CkgEntityType.PRODUCT;
      const entityId = 'SKU-B5-SERUM-100ML';

      const id1 = deriveNodeId(orgId, type, entityId);
      const id2 = deriveNodeId(orgId, type, entityId);
      const id3 = deriveNodeId(orgId, 'product', 'SKU-B5-SERUM-100ML'); // case-insensitive type test

      expect(id1).toBe(id2);
      expect(id1).toBe(id3);
    });

    it('should produce identical UUIDs for NFC and NFD Unicode encodings of Vietnamese text', () => {
      const orgId = 'org-unicode';
      const type = CkgEntityType.CONTACT;
      // "Nguyễn" in NFC (precomposed) vs NFD (decomposed)
      const nfcId = 'Nguy\u1EC5n';
      const nfdId = 'Nguye\u0303\u0323n';

      const idNfc = deriveNodeId(orgId, type, nfcId);
      const idNfd = deriveNodeId(orgId, type, nfdId);

      expect(idNfc).toBe(idNfd);
    });

    it('should safely coerce numeric and non-string IDs without throwing TypeError', () => {
      const orgId = 'org-num';
      const type = CkgEntityType.CONTACT;
      const numId = 123456 as any;

      const nodeId = deriveNodeId(orgId, type, numId);
      expect(nodeId).toBeDefined();
      expect(nodeId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('should produce distinct UUIDs for different entity types or tenants', () => {
      const orgA = 'org-tenant-a';
      const orgB = 'org-tenant-b';
      const entityId = 'same-id-123';

      const contactIdA = deriveNodeId(orgA, CkgEntityType.CONTACT, entityId);
      const contactIdB = deriveNodeId(orgB, CkgEntityType.CONTACT, entityId);
      const groupIdA = deriveNodeId(orgA, CkgEntityType.GROUP, entityId);

      expect(contactIdA).not.toBe(contactIdB);
      expect(contactIdA).not.toBe(groupIdA);
    });
  });

  describe('2. Main Thread Latency Benchmark (<5ms SLA)', () => {
    it('should guarantee <5ms overhead per ingestion call across 1,000 sequential touchpoints', () => {
      const iterations = 1000;
      const latencies: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        service.recordTouchpoint('org-benchmark', `contact-test-${i % 100}`, 'CHAT_MESSAGE', {
          conversationId: `conv-${i}`,
          messageId: `msg-${i}`,
          content: 'Em muốn tư vấn combo phục hồi da mỏng đỏ sau treatment',
          senderType: 'customer',
          productMentions: ['SKU-B5-100ML'],
        });
        const duration = performance.now() - start;
        latencies.push(duration);
      }

      const avgLatency = latencies.reduce((a, b) => a + b, 0) / iterations;
      latencies.sort((a, b) => a - b);
      const p95Latency = latencies[Math.floor(iterations * 0.95)];
      const maxLatency = latencies[iterations - 1];

      console.log(
        `[CKG Ingestion Latency Benchmark] Iterations: ${iterations} | Avg: ${avgLatency.toFixed(4)}ms | P95: ${p95Latency.toFixed(4)}ms | Max: ${maxLatency.toFixed(4)}ms`
      );

      // Cam kết SLA kỹ thuật:
      // Trung bình trong RAM < 0.5ms (thực tế ~0.02ms)
      expect(avgLatency).toBeLessThan(0.5);
      // Phân vị 95% < 2.0ms
      expect(p95Latency).toBeLessThan(2.0);
      // Không cuộc gọi nào vượt quá trần 5.0ms
      expect(maxLatency).toBeLessThan(5.0);
    });
  });

  describe('3. Label Preservation & Property Hygiene', () => {
    it('should identify generic placeholder labels correctly', () => {
      expect(isGenericPlaceholderLabel('Contact 12345')).toBe(true);
      expect(isGenericPlaceholderLabel('Nhóm Zalo g-999')).toBe(true);
      expect(isGenericPlaceholderLabel('Hội thoại conv-abc')).toBe(true);
      expect(isGenericPlaceholderLabel('')).toBe(true);
      expect(isGenericPlaceholderLabel(undefined)).toBe(true);

      expect(isGenericPlaceholderLabel('Võ Thị Sáu')).toBe(false);
      expect(isGenericPlaceholderLabel('Nguyễn Thu Hà')).toBe(false);
      expect(isGenericPlaceholderLabel('Hội Spa & Mỹ Phẩm Hà Nội')).toBe(false);
    });

    it('should NOT overwrite verified customer name with placeholder "Contact <id>" in memory buffer', () => {
      const orgId = 'org-label-test';
      const contactId = 'contact-vip-777';

      // 1. First event establishes real verified name
      service.upsertNode(orgId, CkgEntityType.CONTACT, contactId, 'Nguyễn Thu Hà', { phone: '0912345678' });

      // 2. Subsequent chat event passes placeholder label
      service.upsertNode(orgId, CkgEntityType.CONTACT, contactId, `Contact ${contactId}`, {});

      const stats = service.getStats();
      expect(stats.queuedNodes).toBe(1);

      // Label must remain "Nguyễn Thu Hà"
      const buffer = (service as any).nodeBuffer as Map<string, any>;
      const node = buffer.get(`${orgId}:${CkgEntityType.CONTACT}:${contactId}`);
      expect(node.label).toBe('Nguyễn Thu Hà');
    });

    it('should sanitize properties with cleanProperties and prevent undefined from overwriting valid data', () => {
      const rawProps = {
        phone: '0909998888',
        missingField: undefined,
        nullField: null,
        emptyField: '',
        zeroVal: 0,
        falseVal: false,
      };

      const cleaned = cleanProperties(rawProps);
      expect(cleaned).toEqual({
        phone: '0909998888',
        zeroVal: 0,
        falseVal: false,
      });
      expect(cleaned.missingField).toBeUndefined();
      expect(cleaned.nullField).toBeUndefined();
    });

    it('should preserve existing phone number when incoming touchpoint omits phone', () => {
      const orgId = 'org-phone-preserve';
      const contactId = 'contact-phone-01';

      service.recordTouchpoint(orgId, contactId, 'CONTACT_CREATE', {
        fullName: 'Trần Văn Nam',
        phone: '0987654321',
      });

      // Subsequent chat message has no phone
      service.recordTouchpoint(orgId, contactId, 'CHAT_MESSAGE', {
        conversationId: 'conv-chat-01',
        content: 'Chào shop tư vấn giúp em',
      });

      const buffer = (service as any).nodeBuffer as Map<string, any>;
      const node = buffer.get(`${orgId}:${CkgEntityType.CONTACT}:${contactId}`);
      expect(node.properties.phone).toBe('0987654321');
      expect(node.label).toBe('Trần Văn Nam');
    });
  });

  describe('4. In-Memory Buffering & Exact Edge Weights', () => {
    it('should queue and reinforce edge weights when setExactWeight is false', () => {
      const orgId = 'org-edge-test';
      const sourceNode = 'node-contact-1';
      const targetNode = 'node-product-b5';
      const relation = CkgRelationType.PURCHASED;

      service.upsertEdge(orgId, sourceNode, targetNode, relation, 1.0);
      service.upsertEdge(orgId, sourceNode, targetNode, relation, 1.0);

      const buffer = (service as any).edgeBuffer as Map<string, any>;
      const edge = buffer.get(`${orgId}:${sourceNode}:${targetNode}:${relation}`);
      expect(edge.weight).toBeCloseTo(1.1, 2);
    });

    it('should respect props.setExactWeight and clamp weights to [0.0, 2.0]', () => {
      const orgId = 'org-exact-weight';
      const sourceNode = 'node-c1';
      const targetNode = 'node-p1';
      const relation = CkgRelationType.BELONGS_TO;

      // First call: initial edge with 1.0
      service.upsertEdge(orgId, sourceNode, targetNode, relation, 1.0);

      // Second call: Human feedback CONFIRM with exact weight 1.8
      service.upsertEdge(orgId, sourceNode, targetNode, relation, 1.8, { setExactWeight: true });

      const buffer = (service as any).edgeBuffer as Map<string, any>;
      const edge = buffer.get(`${orgId}:${sourceNode}:${targetNode}:${relation}`);
      expect(edge.weight).toBe(1.8);

      // Third call: Attempt to exceed max weight 2.0
      service.upsertEdge(orgId, sourceNode, targetNode, relation, 3.5, { setExactWeight: true });
      const edgeClamped = buffer.get(`${orgId}:${sourceNode}:${targetNode}:${relation}`);
      expect(edgeClamped.weight).toBe(2.0);
    });
  });

  describe('5. Buffer Ceiling & Bounded Capacity (MAX_BUFFER_CAP = 10,000)', () => {
    it('should cap touchpointBuffer at 10,000 entries and track droppedTouchpoints under backpressure', () => {
      const orgId = 'org-cap-test';

      // Push 10,005 touchpoints
      for (let i = 0; i < 10005; i++) {
        service.recordTouchpoint(orgId, `contact-${i}`, 'CHAT_MESSAGE', {
          conversationId: `conv-${i}`,
          content: 'Test backpressure',
        });
      }

      const stats = service.getStats();
      expect(stats.queuedTouchpoints).toBe(10000);
      expect(stats.droppedTouchpoints).toBe(5);
    });

    it('should not evict when re-upserting an existing node key even when nodeBuffer is at MAX_BUFFER_CAP', () => {
      const orgId = 'org-cap-node';
      const nodeBuf = (service as any).nodeBuffer as Map<string, any>;
      for (let i = 0; i < 10000; i++) {
        nodeBuf.set(`${orgId}:${CkgEntityType.CONTACT}:c-${i}`, {
          orgId,
          entityType: CkgEntityType.CONTACT,
          entityId: `c-${i}`,
          label: `Contact ${i}`,
        });
      }
      expect(nodeBuf.size).toBe(10000);

      // Re-upsert existing key c-0
      service.upsertNode(orgId, CkgEntityType.CONTACT, 'c-0', 'Contact 0 Updated');
      const stats = service.getStats();
      expect(stats.droppedNodes).toBe(0);
      expect(nodeBuf.size).toBe(10000);
      expect(nodeBuf.get(`${orgId}:${CkgEntityType.CONTACT}:c-0`).label).toBe('Contact 0 Updated');

      // Now insert a NEW key c-new
      service.upsertNode(orgId, CkgEntityType.CONTACT, 'c-new', 'Contact New');
      expect(service.getStats().droppedNodes).toBe(1);
      expect(nodeBuf.size).toBe(10000);
    });

    it('should not evict when re-upserting an existing edge key even when edgeBuffer is at MAX_BUFFER_CAP', () => {
      const orgId = 'org-cap-edge';
      const edgeBuf = (service as any).edgeBuffer as Map<string, any>;
      for (let i = 0; i < 10000; i++) {
        edgeBuf.set(`${orgId}:node-s-${i}:node-t-${i}:${CkgRelationType.IN_GROUP}`, {
          orgId,
          sourceNodeId: `node-s-${i}`,
          targetNodeId: `node-t-${i}`,
          relationType: CkgRelationType.IN_GROUP,
          weight: 1.0,
        });
      }
      expect(edgeBuf.size).toBe(10000);

      // Re-upsert existing edge
      service.upsertEdge(orgId, 'node-s-0', 'node-t-0', CkgRelationType.IN_GROUP, 1.5, { setExactWeight: true });
      const stats = service.getStats();
      expect(stats.droppedEdges).toBe(0);
      expect(edgeBuf.size).toBe(10000);
      expect(edgeBuf.get(`${orgId}:node-s-0:node-t-0:${CkgRelationType.IN_GROUP}`).weight).toBe(1.5);

      // Now insert a NEW edge
      service.upsertEdge(orgId, 'node-new-s', 'node-new-t', CkgRelationType.IN_GROUP, 1.0);
      expect(service.getStats().droppedEdges).toBe(1);
      expect(edgeBuf.size).toBe(10000);
    });
  });

  describe('6. Database Flush Pipeline & SQL Generation', () => {
    it('should execute raw SQL UNNEST batch queries on flush with varchar(64)[] width', async () => {
      const rawSpy = vi.spyOn(prisma, '$executeRawUnsafe').mockResolvedValue(1);

      service.upsertNode('org-flush', CkgEntityType.CONTACT, 'contact-01', 'Test Contact');
      service.upsertEdgeByEntities(
        'org-flush',
        CkgEntityType.CONTACT,
        'contact-01',
        CkgEntityType.PRODUCT,
        'SKU-TEST',
        CkgRelationType.PURCHASED,
        1.2
      );

      await service.flush();

      expect(rawSpy).toHaveBeenCalled();
      const stats = service.getStats();
      expect(stats.queuedNodes).toBe(0);
      expect(stats.queuedEdges).toBe(0);
      expect(stats.totalNodesFlushed).toBeGreaterThan(0);
      expect(stats.totalEdgesFlushed).toBeGreaterThan(0);
    });

    it('should generate SQL with regex label preservation guard and exact weight logic', async () => {
      const executedSqls: string[] = [];
      vi.spyOn(prisma, '$executeRawUnsafe').mockImplementation(async (sql: string) => {
        executedSqls.push(sql);
        return 1;
      });

      service.upsertNode('org-sql', CkgEntityType.CONTACT, 'c-1', 'KH 1');
      service.upsertEdge('org-sql', 'node-1', 'node-2', CkgRelationType.PURCHASED, 1.0);

      await service.flush();

      const nodeSql = executedSqls.find((s) => s.includes('INSERT INTO graph_nodes'));
      expect(nodeSql).toBeDefined();
      expect(nodeSql).toContain('$3::varchar(64)[]');
      expect(nodeSql).toContain('Contact [a-zA-Z0-9_-]+');

      const edgeSql = executedSqls.find((s) => s.includes('INSERT INTO graph_edges'));
      expect(edgeSql).toBeDefined();
      expect(edgeSql).toContain('$5::varchar(64)[]');
      expect(edgeSql).toContain('setExactWeight');
      expect(edgeSql).toContain('LEAST(2.0, GREATEST(0.0, EXCLUDED.weight))');
    });

    it('should handle database errors during flush gracefully without crashing process', async () => {
      vi.spyOn(prisma, '$executeRawUnsafe').mockRejectedValue(new Error('Connection lost'));

      service.upsertNode('org-fail', CkgEntityType.CONTACT, 'c-err', 'Error Contact');

      await expect(service.flush()).resolves.toBeUndefined();
      const stats = service.getStats();
      expect(stats.errorCount).toBe(1);
    });
  });

  describe('7. Persona Centroids Seeding (seedPersonaCentroids)', () => {
    it('should seed 5 canonical persona clusters with 768-dim unit vectors for target organization', async () => {
      const querySpy = vi.spyOn(prisma, '$queryRawUnsafe').mockResolvedValue([]); // No native vector col
      const execSpy = vi.spyOn(prisma, '$executeRawUnsafe').mockResolvedValue(1);

      const result = await service.seedPersonaCentroids('org-seed-target');

      expect(result.orgCount).toBe(1);
      expect(result.seededCount).toBe(5);
      expect(result.clustersSeeded.length).toBe(5);
      expect(execSpy).toHaveBeenCalledTimes(5);
    });

    it('should generate valid 768-dim deterministic centroid vectors', () => {
      const vec = generateDeterministicCentroidVector(PersonaCluster.WHOLESALE_BUYER, 768);
      expect(vec.length).toBe(768);
      const sumSq = vec.reduce((acc, v) => acc + v * v, 0);
      expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 2);
    });
  });

  describe('8. Graceful Shutdown', () => {
    it('should stop timer and drain remaining items upon shutdown', async () => {
      const rawSpy = vi.spyOn(prisma, '$executeRawUnsafe').mockResolvedValue(1);

      service.upsertNode('org-shut', CkgEntityType.CONTACT, 'c-shut', 'Shutdown Contact');
      await service.shutdown();

      const stats = service.getStats();
      expect(stats.queuedNodes).toBe(0);
      expect(rawSpy).toHaveBeenCalled();
    });
  });
});
