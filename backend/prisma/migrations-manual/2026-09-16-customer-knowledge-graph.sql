-- ==============================================================================
-- TÍNH NĂNG: Customer Knowledge Graph (CKG) & Smart Customer Radar
-- MỤC ĐÍCH: Bổ sung cấu trúc lưu trữ đồ thị tri thức (GraphNode, GraphEdge)
--          và hồ sơ chân dung suy luận 360° (InferredCustomerProfile).
-- ĐẶC ĐIỂM: Hỗ trợ Dual-Mode Resilient pgvector (tự động phát hiện extension,
--          tạo chỉ mục HNSW nếu có; fallback an toàn nếu là Postgres chuẩn).
-- NGÀY TẠO: 2026-09-16
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. KÍCH HOẠT EXTENSION PGVECTOR (NẾU HỆ THỐNG HỖ TRỢ)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
    CREATE EXTENSION IF NOT EXISTS vector;
    RAISE NOTICE 'pgvector extension successfully activated or already present.';
  ELSE
    RAISE NOTICE 'pgvector extension is not available in pg_available_extensions. Continuing in relational fallback mode.';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not create extension vector: %. Continuing in fallback mode.', SQLERRM;
END $$;

-- ------------------------------------------------------------------------------
-- 2. TẠO BẢNG GRAPH_NODES (NÚT THỰC THỂ ĐỒ THỊ)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "graph_nodes" (
  "id" VARCHAR(36) PRIMARY KEY,
  "org_id" VARCHAR(36) NOT NULL,
  "entity_type" VARCHAR(64) NOT NULL,
  "entity_id" VARCHAR(255) NOT NULL,
  "label" VARCHAR(255) NOT NULL,
  "properties" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_graph_nodes_org" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE
);

-- Bổ sung cột embedding kiểu vector(768) nếu Postgres đã có kiểu vector
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vector') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'graph_nodes' AND column_name = 'embedding'
    ) THEN
      ALTER TABLE "graph_nodes" ADD COLUMN "embedding" vector(768);
      RAISE NOTICE 'Added native vector(768) column to graph_nodes.';
    END IF;
  ELSE
    RAISE NOTICE 'Type "vector" not found. GraphNode will utilize properties JSONB for vector fallback.';
  END IF;
END $$;

-- Chỉ mục truy vấn cho graph_nodes
CREATE UNIQUE INDEX IF NOT EXISTS "graph_nodes_org_id_entity_type_entity_id_key" 
  ON "graph_nodes"("org_id", "entity_type", "entity_id");

CREATE INDEX IF NOT EXISTS "graph_nodes_org_id_entity_type_idx" 
  ON "graph_nodes"("org_id", "entity_type");

CREATE INDEX IF NOT EXISTS "graph_nodes_org_id_entity_id_idx" 
  ON "graph_nodes"("org_id", "entity_id");

CREATE INDEX IF NOT EXISTS "graph_nodes_org_id_label_idx" 
  ON "graph_nodes"("org_id", "label");

-- Chỉ mục HNSW cho vector embedding (Cosine distance)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'graph_nodes' AND column_name = 'embedding'
  ) THEN
    CREATE INDEX IF NOT EXISTS "graph_nodes_embedding_hnsw_idx" 
      ON "graph_nodes" 
      USING hnsw ("embedding" vector_cosine_ops)
      WITH (m = 16, ef_construction = 64);
    RAISE NOTICE 'Created HNSW cosine index on graph_nodes(embedding).';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not create HNSW index: %. Continuing without HNSW index.', SQLERRM;
END $$;

-- ------------------------------------------------------------------------------
-- 3. TẠO BẢNG GRAPH_EDGES (CẠNH QUAN HỆ CÓ HƯỚNG & TRỌNG SỐ)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "graph_edges" (
  "id" VARCHAR(36) PRIMARY KEY,
  "org_id" VARCHAR(36) NOT NULL,
  "source_node_id" VARCHAR(36) NOT NULL,
  "target_node_id" VARCHAR(36) NOT NULL,
  "relation_type" VARCHAR(64) NOT NULL,
  "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  "properties" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_graph_edges_org" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_graph_edges_source_node" FOREIGN KEY ("source_node_id") REFERENCES "graph_nodes"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_graph_edges_target_node" FOREIGN KEY ("target_node_id") REFERENCES "graph_nodes"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "graph_edges_org_id_source_node_id_target_node_id_relation_type_key" 
  ON "graph_edges"("org_id", "source_node_id", "target_node_id", "relation_type");

CREATE INDEX IF NOT EXISTS "graph_edges_source_node_id_relation_type_idx" 
  ON "graph_edges"("source_node_id", "relation_type");

CREATE INDEX IF NOT EXISTS "graph_edges_target_node_id_relation_type_idx" 
  ON "graph_edges"("target_node_id", "relation_type");

CREATE INDEX IF NOT EXISTS "graph_edges_org_id_relation_type_weight_idx" 
  ON "graph_edges"("org_id", "relation_type", "weight");

-- ------------------------------------------------------------------------------
-- 4. TẠO BẢNG INFERRED_CUSTOMER_PROFILES (HỒ SƠ CHÂN DUNG SUY LUẬN & NBA CACHE)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "inferred_customer_profiles" (
  "id" VARCHAR(36) PRIMARY KEY,
  "org_id" VARCHAR(36) NOT NULL,
  "contact_id" VARCHAR(36) NOT NULL,
  "persona_id" VARCHAR(64),
  "persona_label" VARCHAR(255) NOT NULL,
  "confidence_score" DOUBLE PRECISION NOT NULL,
  "evidence_subgraph" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "next_best_action" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "synthesized_summary" TEXT,
  "valid_until" TIMESTAMP WITH TIME ZONE NOT NULL,
  "last_event_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_inferred_customer_profiles_org" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_inferred_customer_profiles_contact" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "inferred_customer_profiles_contact_id_key" 
  ON "inferred_customer_profiles"("contact_id");

CREATE INDEX IF NOT EXISTS "inferred_customer_profiles_org_id_persona_id_idx" 
  ON "inferred_customer_profiles"("org_id", "persona_id");

CREATE INDEX IF NOT EXISTS "inferred_customer_profiles_org_id_confidence_score_idx" 
  ON "inferred_customer_profiles"("org_id", "confidence_score");

CREATE INDEX IF NOT EXISTS "inferred_customer_profiles_org_id_valid_until_idx" 
  ON "inferred_customer_profiles"("org_id", "valid_until");

-- ------------------------------------------------------------------------------
-- 5. CHÚ THÍCH TÀI LIỆU DỮ LIỆU (DATABASE COMMENTS)
-- ------------------------------------------------------------------------------
COMMENT ON TABLE "graph_nodes" IS 'Lưu trữ các nút thực thể trong đồ thị tri thức đa kênh (Contact, Group, Product, Centroid...)';
COMMENT ON TABLE "graph_edges" IS 'Lưu trữ các cạnh liên kết có hướng và trọng số giữa các thực thể trong đồ thị tri thức';
COMMENT ON TABLE "inferred_customer_profiles" IS 'Lưu trữ hồ sơ chân dung khách hàng suy luận 360 độ, điểm tin cậy lũy tiến và kịch bản NBA';
COMMENT ON COLUMN "graph_nodes"."embedding" IS 'Vector nhúng 768 chiều (Gemini text-embedding-004) phục vụ Cosine lookalike';
COMMENT ON COLUMN "graph_edges"."weight" IS 'Trọng số liên kết (mặc định 1.0, tăng giảm qua Human Feedback loop của Sale)';
COMMENT ON COLUMN "inferred_customer_profiles"."confidence_score" IS 'Điểm tin cậy lũy tiến từ 0.50 đến 0.95';
COMMENT ON COLUMN "inferred_customer_profiles"."valid_until" IS 'Mốc thời gian hết hạn cache 24h';
