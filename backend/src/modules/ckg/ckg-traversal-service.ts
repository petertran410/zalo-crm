/**
 * ckg-traversal-service.ts — PostgreSQL 16 Hybrid 2-Hop Recursive CTE Traversal Engine
 *
 * Nhiệm vụ cốt lõi:
 * 1. Thuật toán 2-hop bidirectional traversal (source -> target & target -> source).
 * 2. Ngăn chặn chu trình bằng mảng đường dẫn: NOT (next_id = ANY(t.path)).
 * 3. Giới hạn độ sâu tối đa 2 (depth <= 2) và lọc trọng số (weight >= minWeight, mặc định 0.5).
 * 4. Kỹ thuật Late Materialization: chỉ nạp thuộc tính (properties) sau khi đã deduplicate đỉnh/cạnh.
 * 5. Tổng hợp các chỉ số tương đồng (Homophily Metrics): sharedGroupsCount, totalOrdersCount, homophilyNeighborsCount.
 * 6. Đóng gói JSON cấu trúc ICkgEvidenceSubgraph trực tiếp trong câu lệnh SQL (json_build_object).
 * 7. Xử lý phòng vệ (Defensive handling) cho trường hợp contact chưa có điểm chạm (0 touchpoints).
 */

import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import type {
  ICkgEvidenceSubgraph,
  ICkgSubgraphNode,
  ICkgSubgraphEdge,
  ICkgSubgraphMetrics,
  ITraversalOptions,
} from './ckg-types.js';

export class CkgTraversalService {
  /**
   * Truy vấn 2-hop bidirectional subgraph từ Contact root node sử dụng PostgreSQL 16 Recursive CTE.
   * Đảm bảo SLA độ trễ < 8ms với covering indexes.
   */
  public async traverseCustomerSubgraph(
    orgId: string,
    contactId: string,
    options: ITraversalOptions = {}
  ): Promise<ICkgEvidenceSubgraph> {
    const minWeight = options.minWeight ?? 0.5;
    const maxNodes = options.maxNodes ?? 50;
    const maxEdges = options.maxEdges ?? 100;
    const start = Date.now();

    const emptySubgraph: ICkgEvidenceSubgraph = {
      nodes: [],
      edges: [],
      metrics: {
        sharedGroupsCount: 0,
        totalOrdersCount: 0,
        homophilyNeighborsCount: 0,
      },
    };

    if (!orgId || !contactId) {
      return emptySubgraph;
    }

    try {
      const querySql = `
        WITH RECURSIVE
        -- Bước 1: Tìm đỉnh neo gốc Contact (<0.1ms qua Unique B-tree Index)
        root_node AS (
          SELECT
            n.id::varchar(36) AS node_id,
            0 AS depth,
            ARRAY[n.id]::text[] AS path,
            NULL::varchar(36) AS edge_id,
            'ROOT'::varchar(8) AS direction,
            1.0::float8 AS edge_weight
          FROM graph_nodes n
          WHERE n.org_id = $1
            AND n.entity_type = 'CONTACT'
            AND n.entity_id = $2
          LIMIT 1
        ),

        -- Bước 2: Duyệt đệ quy 2-hop hai chiều (Forward + Backward) kèm cycle prevention
        traversal AS (
          SELECT * FROM root_node

          UNION ALL

          SELECT
            (CASE
              WHEN e.source_node_id = t.node_id THEN e.target_node_id
              ELSE e.source_node_id
            END)::varchar(36) AS node_id,
            t.depth + 1 AS depth,
            t.path || (CASE
              WHEN e.source_node_id = t.node_id THEN e.target_node_id
              ELSE e.source_node_id
            END)::text AS path,
            e.id::varchar(36) AS edge_id,
            (CASE
              WHEN e.source_node_id = t.node_id THEN 'OUT'
              ELSE 'IN'
            END)::varchar(8) AS direction,
            e.weight::float8 AS edge_weight
          FROM traversal t
          JOIN graph_edges e
            ON e.org_id = $1
           AND (e.source_node_id = t.node_id OR e.target_node_id = t.node_id)
           AND e.weight >= $3
          WHERE t.depth < 2
            AND NOT (
              (CASE
                WHEN e.source_node_id = t.node_id THEN e.target_node_id
                ELSE e.source_node_id
              END)::text = ANY(t.path)
            )
        ),

        -- Bước 3: Khử trùng lặp đỉnh theo độ sâu nhỏ nhất và trọng số lớn nhất
        traversed_nodes AS (
          SELECT
            t.node_id,
            MIN(t.depth) AS min_depth,
            MAX(t.edge_weight) AS max_weight
          FROM traversal t
          GROUP BY t.node_id
        ),

        -- Bước 4: Late Materialization nạp metadata thuộc tính của đỉnh
        materialized_nodes AS (
          SELECT
            n.id AS node_uuid,
            n.entity_type,
            n.entity_id,
            n.label,
            n.properties,
            tn.min_depth,
            tn.max_weight
          FROM traversed_nodes tn
          JOIN graph_nodes n
            ON n.org_id = $1
           AND n.id = tn.node_id
        ),

        -- Bước 5: Khử trùng lặp cạnh và ánh xạ entity_id kinh doanh
        materialized_edges AS (
          SELECT DISTINCT ON (e.id)
            e.id AS edge_id,
            sn.entity_id AS source,
            tn.entity_id AS target,
            e.relation_type AS relation,
            e.weight,
            e.properties
          FROM traversal tr
          JOIN graph_edges e
            ON e.org_id = $1
           AND e.id = tr.edge_id
          JOIN graph_nodes sn
            ON sn.org_id = $1
           AND sn.id = e.source_node_id
          JOIN graph_nodes tn
            ON tn.org_id = $1
           AND tn.id = e.target_node_id
          WHERE tr.edge_id IS NOT NULL
        ),

        -- Bước 6: Tổng hợp Homophily Metrics (Đảm bảo luôn trả về 1 dòng duy nhất)
        metrics_agg AS (
          SELECT
            COALESCE(
              (SELECT COUNT(DISTINCT entity_id)::int FROM materialized_nodes WHERE entity_type = 'GROUP' AND min_depth = 1),
              0
            ) AS shared_groups_count,
            COALESCE(
              (SELECT NULLIF(properties->>'orderCount', '')::int FROM materialized_nodes WHERE min_depth = 0 LIMIT 1),
              (SELECT COUNT(DISTINCT edge_id)::int FROM materialized_edges WHERE relation = 'PURCHASED'),
              0
            ) AS total_orders_count,
            COALESCE(
              (SELECT COUNT(DISTINCT entity_id)::int FROM materialized_nodes WHERE entity_type = 'CONTACT' AND min_depth = 2),
              0
            ) AS homophily_neighbors_count
        )

        -- Bước 7: Đóng gói JSON nguyên khối theo cấu trúc ICkgEvidenceSubgraph
        SELECT
          json_build_object(
            'nodes', COALESCE(
              (
                SELECT json_agg(
                  json_build_object(
                    'id', mn.entity_id,
                    'type', mn.entity_type,
                    'label', mn.label,
                    'properties', mn.properties
                  )
                  ORDER BY mn.min_depth ASC, mn.max_weight DESC
                )
                FROM (
                  SELECT * FROM materialized_nodes
                  ORDER BY min_depth ASC, max_weight DESC
                  LIMIT $4
                ) mn
              ),
              '[]'::json
            ),
            'edges', COALESCE(
              (
                SELECT json_agg(
                  json_build_object(
                    'id', me.edge_id,
                    'source', me.source,
                    'target', me.target,
                    'relation', me.relation,
                    'weight', me.weight,
                    'properties', me.properties
                  )
                  ORDER BY me.weight DESC
                )
                FROM (
                  SELECT * FROM materialized_edges
                  ORDER BY weight DESC
                  LIMIT $5
                ) me
              ),
              '[]'::json
            ),
            'metrics', json_build_object(
              'sharedGroupsCount', COALESCE(ma.shared_groups_count, 0),
              'totalOrdersCount', COALESCE(ma.total_orders_count, 0),
              'homophilyNeighborsCount', COALESCE(ma.homophily_neighbors_count, 0)
            )
          ) AS subgraph
        FROM metrics_agg ma;
      `;

      const result = await prisma.$queryRawUnsafe<Array<{ subgraph: ICkgEvidenceSubgraph | string }>>(
        querySql,
        orgId,
        contactId,
        minWeight,
        maxNodes,
        maxEdges
      );

      const durationMs = Date.now() - start;
      logger.debug(
        `[CkgTraversal] Traversed subgraph for contact ${contactId} in ${durationMs}ms (nodes: ${maxNodes}, edges: ${maxEdges})`
      );

      if (!result || result.length === 0 || !result[0]?.subgraph) {
        return emptySubgraph;
      }

      const rawSubgraph = result[0].subgraph;
      const parsed: ICkgEvidenceSubgraph =
        typeof rawSubgraph === 'string' ? JSON.parse(rawSubgraph) : rawSubgraph;

      return {
        nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
        edges: Array.isArray(parsed.edges) ? parsed.edges : [],
        metrics: {
          sharedGroupsCount: Number(parsed.metrics?.sharedGroupsCount || 0),
          totalOrdersCount: Number(parsed.metrics?.totalOrdersCount || 0),
          homophilyNeighborsCount: Number(parsed.metrics?.homophilyNeighborsCount || 0),
        },
      };
    } catch (err) {
      logger.error(`[CkgTraversal] Error traversing customer subgraph for ${contactId}:`, err);
      // Phòng vệ không quăng ngoại lệ ra ngoài luồng nghiệp vụ
      return emptySubgraph;
    }
  }

  /**
   * Thuật toán duyệt 2-hop trên bộ nhớ RAM (In-Memory Traversal Engine).
   * Phục vụ tính toán độc lập không phụ thuộc DB, unit testing và fast benchmarking.
   */
  public traverseInMemory(
    rootContactId: string,
    nodes: Array<{ id: string; entityType: string; entityId: string; label: string; properties?: Record<string, unknown> }>,
    edges: Array<{ id: string; sourceNodeId: string; targetNodeId: string; relationType: string; weight: number; properties?: Record<string, unknown> }>,
    options: ITraversalOptions = {}
  ): ICkgEvidenceSubgraph {
    const minWeight = options.minWeight ?? 0.5;
    const maxNodes = options.maxNodes ?? 50;
    const maxEdges = options.maxEdges ?? 100;

    const nodeMap = new Map<string, (typeof nodes)[0]>();
    for (const n of nodes) {
      nodeMap.set(n.id, n);
    }

    // Tìm root node
    const root = nodes.find((n) => n.entityType === 'CONTACT' && n.entityId === rootContactId);
    if (!root) {
      return {
        nodes: [],
        edges: [],
        metrics: { sharedGroupsCount: 0, totalOrdersCount: 0, homophilyNeighborsCount: 0 },
      };
    }

    interface ITraversedItem {
      nodeId: string;
      depth: number;
      path: string[];
      edgeId: string | null;
      edgeWeight: number;
    }

    const visitedDepth = new Map<string, number>();
    const visitedWeight = new Map<string, number>();
    visitedDepth.set(root.id, 0);
    visitedWeight.set(root.id, 1.0);

    const queue: ITraversedItem[] = [
      { nodeId: root.id, depth: 0, path: [root.id], edgeId: null, edgeWeight: 1.0 },
    ];
    const traversedEdges: Array<{
      id: string;
      source: string;
      target: string;
      relation: string;
      weight: number;
      properties?: Record<string, unknown>;
    }> = [];
    const traversedEdgeIds = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.depth >= 2) continue;

      // 1. Forward edges (source -> target)
      for (const edge of edges) {
        if (edge.sourceNodeId === current.nodeId && edge.weight >= minWeight) {
          const nextId = edge.targetNodeId;
          if (!current.path.includes(nextId)) {
            const nextDepth = current.depth + 1;
            if (!visitedDepth.has(nextId) || nextDepth < visitedDepth.get(nextId)!) {
              visitedDepth.set(nextId, nextDepth);
            }
            visitedWeight.set(nextId, Math.max(visitedWeight.get(nextId) || 0, edge.weight));

            if (!traversedEdgeIds.has(edge.id)) {
              traversedEdgeIds.add(edge.id);
              const srcNode = nodeMap.get(edge.sourceNodeId);
              const tgtNode = nodeMap.get(edge.targetNodeId);
              if (srcNode && tgtNode) {
                traversedEdges.push({
                  id: edge.id,
                  source: srcNode.entityId,
                  target: tgtNode.entityId,
                  relation: edge.relationType,
                  weight: edge.weight,
                  properties: edge.properties,
                });
              }
            }

            queue.push({
              nodeId: nextId,
              depth: nextDepth,
              path: [...current.path, nextId],
              edgeId: edge.id,
              edgeWeight: edge.weight,
            });
          }
        }
      }

      // 2. Backward edges (target -> source)
      for (const edge of edges) {
        if (edge.targetNodeId === current.nodeId && edge.weight >= minWeight) {
          const nextId = edge.sourceNodeId;
          if (!current.path.includes(nextId)) {
            const nextDepth = current.depth + 1;
            if (!visitedDepth.has(nextId) || nextDepth < visitedDepth.get(nextId)!) {
              visitedDepth.set(nextId, nextDepth);
            }
            visitedWeight.set(nextId, Math.max(visitedWeight.get(nextId) || 0, edge.weight));

            if (!traversedEdgeIds.has(edge.id)) {
              traversedEdgeIds.add(edge.id);
              const srcNode = nodeMap.get(edge.sourceNodeId);
              const tgtNode = nodeMap.get(edge.targetNodeId);
              if (srcNode && tgtNode) {
                traversedEdges.push({
                  id: edge.id,
                  source: srcNode.entityId,
                  target: tgtNode.entityId,
                  relation: edge.relationType,
                  weight: edge.weight,
                  properties: edge.properties,
                });
              }
            }

            queue.push({
              nodeId: nextId,
              depth: nextDepth,
              path: [...current.path, nextId],
              edgeId: edge.id,
              edgeWeight: edge.weight,
            });
          }
        }
      }
    }

    // Materialize traversed nodes
    const resultNodes: ICkgSubgraphNode[] = [];
    for (const [nodeId, depth] of visitedDepth.entries()) {
      const n = nodeMap.get(nodeId);
      if (n) {
        resultNodes.push({
          id: n.entityId,
          type: n.entityType,
          label: n.label,
          properties: n.properties,
        });
      }
    }

    // Metrics calculation
    let sharedGroupsCount = 0;
    let homophilyNeighborsCount = 0;
    for (const [nodeId, depth] of visitedDepth.entries()) {
      const n = nodeMap.get(nodeId);
      if (!n) continue;
      if (n.entityType === 'GROUP' && depth === 1) {
        sharedGroupsCount++;
      } else if (n.entityType === 'CONTACT' && depth === 2) {
        homophilyNeighborsCount++;
      }
    }

    const orderProp = root.properties?.orderCount;
    const purchasedEdgesCount = traversedEdges.filter((e) => e.relation === 'PURCHASED').length;
    const totalOrdersCount = typeof orderProp === 'number' ? orderProp : purchasedEdgesCount;

    return {
      nodes: resultNodes.slice(0, maxNodes),
      edges: traversedEdges.slice(0, maxEdges),
      metrics: {
        sharedGroupsCount,
        totalOrdersCount,
        homophilyNeighborsCount,
      },
    };
  }
}

// Singleton instances and aliases
export const ckgTraversalService = new CkgTraversalService();
export const hybridTraversalEngine = ckgTraversalService;
export const HybridTraversalEngine = CkgTraversalService;
