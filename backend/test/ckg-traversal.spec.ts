/**
 * ckg-traversal.spec.ts — Comprehensive Test Suite for CKG 2-Hop Recursive CTE Traversal Engine
 *
 * Kiểm chứng:
 * 1. Khởi tạo và xử lý phòng vệ khi không tìm thấy Contact (Empty Subgraph).
 * 2. Khả năng duyệt đồ thị 1-hop (Forward connections tới Group, Product, Persona).
 * 3. Khả năng duyệt đồ thị 2-hop hai chiều (Bidirectional: Contact A -> Group -> Contact B) tìm Homophily Neighbors.
 * 4. Thuật toán phát hiện và triệt tiêu chu trình (Cycle Prevention: A -> B -> A).
 * 5. Lọc ngưỡng trọng số quan hệ (Weight filtering: weight >= minWeight).
 * 6. Giới hạn độ sâu nghiêm ngặt (Max depth <= 2).
 * 7. Kiểm thử câu lệnh SQL Recursive CTE và tham số hóa an toàn qua Prisma.
 * 8. Khả năng cô lập lỗi (Fault isolation), không làm sập luồng khi DB văng ngoại lệ.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CkgTraversalService,
  ckgTraversalService,
  hybridTraversalEngine,
} from '../src/modules/ckg/ckg-traversal-service.js';
import {
  hybridTraversalEngine as engineFromBarrel,
  CkgTraversalService as CkgTraversalServiceFromBarrel,
} from '../src/modules/ckg/hybrid-traversal-engine.js';
import type { ICkgEvidenceSubgraph } from '../src/modules/ckg/ckg-types.js';
import { prisma } from '../src/shared/database/prisma-client.js';

describe('CKG 2-Hop Recursive CTE Traversal Engine Tests', () => {
  let service: CkgTraversalService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CkgTraversalService();
  });

  describe('1. Empty Subgraph & Edge Cases', () => {
    it('should return empty subgraph with zeroed metrics when contactId is empty or missing', async () => {
      const result = await service.traverseCustomerSubgraph('org-test', '');
      expect(result.nodes).toEqual([]);
      expect(result.edges).toEqual([]);
      expect(result.metrics).toEqual({
        sharedGroupsCount: 0,
        totalOrdersCount: 0,
        homophilyNeighborsCount: 0,
      });
    });

    it('should return empty subgraph when contact does not exist in graph_nodes', async () => {
      vi.spyOn(prisma, '$queryRawUnsafe').mockResolvedValue([]);

      const result = await service.traverseCustomerSubgraph('org-test', 'non-existent-contact');
      expect(result.nodes).toEqual([]);
      expect(result.edges).toEqual([]);
      expect(result.metrics.homophilyNeighborsCount).toBe(0);
      expect(result.metrics.sharedGroupsCount).toBe(0);
    });

    it('should handle raw query throwing an error and return safe fallback subgraph', async () => {
      vi.spyOn(prisma, '$queryRawUnsafe').mockRejectedValue(new Error('PostgreSQL deadlock / timeout'));

      const result = await service.traverseCustomerSubgraph('org-test', 'contact-deadlock');
      expect(result).toBeDefined();
      expect(result.nodes).toEqual([]);
      expect(result.metrics).toEqual({
        sharedGroupsCount: 0,
        totalOrdersCount: 0,
        homophilyNeighborsCount: 0,
      });
    });
  });

  describe('2. In-Memory Traversal: 1-Hop Direct Reachability', () => {
    it('should discover 1-hop outgoing neighbors (Group, Product, Persona) from root contact', () => {
      const nodes = [
        { id: 'node-c1', entityType: 'CONTACT', entityId: 'c1', label: 'Nguyễn Văn A' },
        { id: 'node-g1', entityType: 'GROUP', entityId: 'g1', label: 'Hội Sỉ Mỹ Phẩm HCM' },
        { id: 'node-p1', entityType: 'PRODUCT', entityId: 'p1', label: 'Serum B5 100ml' },
      ];
      const edges = [
        { id: 'e1', sourceNodeId: 'node-c1', targetNodeId: 'node-g1', relationType: 'IN_GROUP', weight: 1.0 },
        { id: 'e2', sourceNodeId: 'node-c1', targetNodeId: 'node-p1', relationType: 'PURCHASED', weight: 1.5 },
      ];

      const subgraph = service.traverseInMemory('c1', nodes, edges);

      expect(subgraph.nodes.length).toBe(3); // c1 (root), g1, p1
      expect(subgraph.edges.length).toBe(2);
      expect(subgraph.metrics.sharedGroupsCount).toBe(1);
      expect(subgraph.metrics.totalOrdersCount).toBe(1);
      expect(subgraph.metrics.homophilyNeighborsCount).toBe(0);
    });
  });

  describe('3. In-Memory Traversal: 2-Hop Bidirectional Homophily', () => {
    it('should traverse backward from shared group to peer contact at depth 2', () => {
      const nodes = [
        { id: 'node-c1', entityType: 'CONTACT', entityId: 'c1', label: 'Khách A (Target)' },
        { id: 'node-g1', entityType: 'GROUP', entityId: 'g1', label: 'Hội Spa & Thẩm Mỹ Viện' },
        { id: 'node-c2', entityType: 'CONTACT', entityId: 'c2', label: 'Khách B (Peer Homophily)' },
        { id: 'node-c3', entityType: 'CONTACT', entityId: 'c3', label: 'Khách C (Peer Homophily)' },
      ];
      const edges = [
        // c1 -> g1 (forward)
        { id: 'e1', sourceNodeId: 'node-c1', targetNodeId: 'node-g1', relationType: 'IN_GROUP', weight: 1.0 },
        // c2 -> g1 (backward relative to g1)
        { id: 'e2', sourceNodeId: 'node-c2', targetNodeId: 'node-g1', relationType: 'IN_GROUP', weight: 1.0 },
        // c3 -> g1 (backward relative to g1)
        { id: 'e3', sourceNodeId: 'node-c3', targetNodeId: 'node-g1', relationType: 'IN_GROUP', weight: 1.2 },
      ];

      const subgraph = service.traverseInMemory('c1', nodes, edges);

      // Should find c1 (depth 0), g1 (depth 1), and c2, c3 (depth 2)
      expect(subgraph.nodes.length).toBe(4);
      const peerIds = subgraph.nodes.map((n) => n.id);
      expect(peerIds).toContain('c2');
      expect(peerIds).toContain('c3');

      // Metrics check
      expect(subgraph.metrics.sharedGroupsCount).toBe(1);
      expect(subgraph.metrics.homophilyNeighborsCount).toBe(2);
    });
  });

  describe('4. Cycle Prevention & Duplicate Elimination', () => {
    it('should not loop indefinitely or duplicate root node when cyclic lookalike edges exist', () => {
      const nodes = [
        { id: 'node-c1', entityType: 'CONTACT', entityId: 'c1', label: 'Khách A' },
        { id: 'node-c2', entityType: 'CONTACT', entityId: 'c2', label: 'Khách B' },
      ];
      const edges = [
        // A -> B
        { id: 'e1', sourceNodeId: 'node-c1', targetNodeId: 'node-c2', relationType: 'LOOKALIKE_TO', weight: 1.0 },
        // B -> A (Reverse / cyclic edge)
        { id: 'e2', sourceNodeId: 'node-c2', targetNodeId: 'node-c1', relationType: 'LOOKALIKE_TO', weight: 1.0 },
      ];

      const subgraph = service.traverseInMemory('c1', nodes, edges);

      // c1 should appear exactly once in nodes
      const c1Count = subgraph.nodes.filter((n) => n.id === 'c1').length;
      expect(c1Count).toBe(1);
      expect(subgraph.nodes.length).toBe(2);
    });
  });

  describe('5. Weight Threshold Filtering', () => {
    it('should ignore edges with weight strictly below minWeight (default 0.5)', () => {
      const nodes = [
        { id: 'node-c1', entityType: 'CONTACT', entityId: 'c1', label: 'Khách A' },
        { id: 'node-g1', entityType: 'GROUP', entityId: 'g1', label: 'Nhóm Active (1.0)' },
        { id: 'node-g2', entityType: 'GROUP', entityId: 'g2', label: 'Nhóm Stale / Downvoted (0.3)' },
      ];
      const edges = [
        { id: 'e1', sourceNodeId: 'node-c1', targetNodeId: 'node-g1', relationType: 'IN_GROUP', weight: 1.0 },
        { id: 'e2', sourceNodeId: 'node-c1', targetNodeId: 'node-g2', relationType: 'IN_GROUP', weight: 0.3 },
      ];

      const subgraph = service.traverseInMemory('c1', nodes, edges, { minWeight: 0.5 });

      expect(subgraph.nodes.map((n) => n.id)).toContain('g1');
      expect(subgraph.nodes.map((n) => n.id)).not.toContain('g2');
      expect(subgraph.metrics.sharedGroupsCount).toBe(1);
    });
  });

  describe('6. Max Depth Enforcement (depth <= 2)', () => {
    it('should strictly limit traversal to 2 hops and not visit 3-hop nodes', () => {
      const nodes = [
        { id: 'n0', entityType: 'CONTACT', entityId: 'c0', label: 'Root Contact' }, // Depth 0
        { id: 'n1', entityType: 'GROUP', entityId: 'g1', label: 'Group 1' },         // Depth 1
        { id: 'n2', entityType: 'CONTACT', entityId: 'c2', label: 'Peer 1' },        // Depth 2
        { id: 'n3', entityType: 'GROUP', entityId: 'g2', label: 'Group 2' },         // Depth 3 (Out of bounds)
        { id: 'n4', entityType: 'CONTACT', entityId: 'c4', label: 'Peer 2' },        // Depth 4 (Out of bounds)
      ];
      const edges = [
        { id: 'e1', sourceNodeId: 'n0', targetNodeId: 'n1', relationType: 'IN_GROUP', weight: 1.0 },
        { id: 'e2', sourceNodeId: 'n2', targetNodeId: 'n1', relationType: 'IN_GROUP', weight: 1.0 },
        { id: 'e3', sourceNodeId: 'n2', targetNodeId: 'n3', relationType: 'IN_GROUP', weight: 1.0 },
        { id: 'e4', sourceNodeId: 'n4', targetNodeId: 'n3', relationType: 'IN_GROUP', weight: 1.0 },
      ];

      const subgraph = service.traverseInMemory('c0', nodes, edges);

      const visitedIds = subgraph.nodes.map((n) => n.id);
      expect(visitedIds).toContain('c0');
      expect(visitedIds).toContain('g1');
      expect(visitedIds).toContain('c2');
      expect(visitedIds).not.toContain('g2');
      expect(visitedIds).not.toContain('c4');
    });
  });

  describe('7. PostgreSQL 16 Recursive CTE Query Execution', () => {
    it('should execute raw SQL CTE query and deserialize single-row json_build_object', async () => {
      const mockSubgraph: ICkgEvidenceSubgraph = {
        nodes: [
          { id: 'c1', type: 'CONTACT', label: 'Trần Thị Bích' },
          { id: 'g1', type: 'GROUP', label: 'Hội Sỉ Mỹ Phẩm VIP' },
        ],
        edges: [
          { source: 'c1', target: 'g1', relation: 'IN_GROUP', weight: 1.2 },
        ],
        metrics: {
          sharedGroupsCount: 1,
          totalOrdersCount: 3,
          homophilyNeighborsCount: 5,
        },
      };

      const querySpy = vi.spyOn(prisma, '$queryRawUnsafe').mockResolvedValue([
        { subgraph: mockSubgraph },
      ]);

      const result = await service.traverseCustomerSubgraph('org-tenant-1', 'c1', {
        minWeight: 0.6,
        maxNodes: 20,
        maxEdges: 40,
      });

      expect(querySpy).toHaveBeenCalled();
      const calledSql = querySpy.mock.calls[0][0] as string;
      expect(calledSql).toContain('WITH RECURSIVE');
      expect(calledSql).toContain('= ANY(t.path)');
      expect(calledSql).toContain('json_build_object');

      // Verify parameters
      expect(querySpy.mock.calls[0][1]).toBe('org-tenant-1');
      expect(querySpy.mock.calls[0][2]).toBe('c1');
      expect(querySpy.mock.calls[0][3]).toBe(0.6);
      expect(querySpy.mock.calls[0][4]).toBe(20);
      expect(querySpy.mock.calls[0][5]).toBe(40);

      expect(result.nodes.length).toBe(2);
      expect(result.metrics.homophilyNeighborsCount).toBe(5);
    });

    it('should parse JSON string if database driver returns JSON stringified result', async () => {
      const mockSubgraph: ICkgEvidenceSubgraph = {
        nodes: [{ id: 'c2', type: 'CONTACT', label: 'Lê Văn C' }],
        edges: [],
        metrics: { sharedGroupsCount: 0, totalOrdersCount: 0, homophilyNeighborsCount: 0 },
      };

      vi.spyOn(prisma, '$queryRawUnsafe').mockResolvedValue([
        { subgraph: JSON.stringify(mockSubgraph) },
      ]);

      const result = await service.traverseCustomerSubgraph('org-tenant-1', 'c2');
      expect(result.nodes.length).toBe(1);
      expect(result.nodes[0].label).toBe('Lê Văn C');
    });
  });

  describe('8. Exported Singletons and Aliases', () => {
    it('should provide singleton ckgTraversalService and hybridTraversalEngine alias', () => {
      expect(ckgTraversalService).toBeInstanceOf(CkgTraversalService);
      expect(hybridTraversalEngine).toBe(ckgTraversalService);
    });

    it('should correctly re-export CkgTraversalService and hybridTraversalEngine from barrel file', () => {
      expect(engineFromBarrel).toBe(ckgTraversalService);
      expect(CkgTraversalServiceFromBarrel).toBe(CkgTraversalService);
    });
  });
});
