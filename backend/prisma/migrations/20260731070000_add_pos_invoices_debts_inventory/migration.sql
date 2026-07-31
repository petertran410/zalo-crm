-- Migration: add_pos_invoices_debts_inventory
-- Tạo 3 bảng POS còn thiếu: pos_invoices, pos_customer_debts, pos_branch_inventory
-- Schema đã định nghĩa trong schema.prisma nhưng migration chưa từng được tạo.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. pos_invoices — Hoá đơn POS đồng bộ từ MCP
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "pos_invoices" (
    "id"                TEXT NOT NULL,
    "org_id"            TEXT NOT NULL,
    "pos_invoice_id"    INTEGER NOT NULL,
    "invoice_code"      TEXT NOT NULL,
    "pos_order_id"      INTEGER,
    "pos_order_uuid"    TEXT,
    "pos_customer_id"   INTEGER,
    "pos_customer_code" TEXT,
    "contact_id"        TEXT,
    "total_amount"      DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paid_amount"       DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remaining_debt"    DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status"            TEXT NOT NULL DEFAULT 'Unpaid',
    "invoice_date"      TIMESTAMP(3) NOT NULL,
    "due_date"          TIMESTAMP(3),
    "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_invoices_pkey" PRIMARY KEY ("id")
);

-- Unique constraint (pos_invoice_id, org_id)
CREATE UNIQUE INDEX IF NOT EXISTS "pos_invoices_pos_invoice_id_org_id_key"
  ON "pos_invoices" ("pos_invoice_id", "org_id");

-- Indexes
CREATE INDEX IF NOT EXISTS "pos_invoices_org_id_pos_customer_id_idx"
  ON "pos_invoices" ("org_id", "pos_customer_id");
CREATE INDEX IF NOT EXISTS "pos_invoices_org_id_contact_id_idx"
  ON "pos_invoices" ("org_id", "contact_id");
CREATE INDEX IF NOT EXISTS "pos_invoices_org_id_pos_order_id_idx"
  ON "pos_invoices" ("org_id", "pos_order_id");
CREATE INDEX IF NOT EXISTS "pos_invoices_status_idx"
  ON "pos_invoices" ("status");

-- Foreign keys
ALTER TABLE "pos_invoices"
  ADD CONSTRAINT "pos_invoices_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pos_invoices"
  ADD CONSTRAINT "pos_invoices_contact_id_fkey"
  FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pos_invoices"
  ADD CONSTRAINT "pos_invoices_pos_order_uuid_fkey"
  FOREIGN KEY ("pos_order_uuid") REFERENCES "pos_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. pos_customer_debts — Công nợ khách hàng POS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "pos_customer_debts" (
    "id"                TEXT NOT NULL,
    "org_id"            TEXT NOT NULL,
    "pos_customer_id"   INTEGER NOT NULL,
    "pos_customer_code" TEXT,
    "customer_name"     TEXT,
    "customer_phone"    TEXT,
    "contact_id"        TEXT,
    "total_debt"        DOUBLE PRECISION NOT NULL DEFAULT 0,
    "current_debt"      DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overdue_debt"      DOUBLE PRECISION NOT NULL DEFAULT 0,
    "due_date"          TIMESTAMP(3),
    "status"            TEXT DEFAULT 'Normal',
    "timeline_json"     JSONB,
    "last_synced_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_customer_debts_pkey" PRIMARY KEY ("id")
);

-- Unique constraint (pos_customer_id, org_id)
CREATE UNIQUE INDEX IF NOT EXISTS "pos_customer_debts_pos_customer_id_org_id_key"
  ON "pos_customer_debts" ("pos_customer_id", "org_id");

-- Indexes
CREATE INDEX IF NOT EXISTS "pos_customer_debts_org_id_contact_id_idx"
  ON "pos_customer_debts" ("org_id", "contact_id");
CREATE INDEX IF NOT EXISTS "pos_customer_debts_org_id_status_idx"
  ON "pos_customer_debts" ("org_id", "status");

-- Foreign keys
ALTER TABLE "pos_customer_debts"
  ADD CONSTRAINT "pos_customer_debts_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pos_customer_debts"
  ADD CONSTRAINT "pos_customer_debts_contact_id_fkey"
  FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. pos_branch_inventory — Tồn kho chi nhánh POS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "pos_branch_inventory" (
    "id"              TEXT NOT NULL,
    "org_id"          TEXT NOT NULL,
    "pos_product_id"  INTEGER NOT NULL,
    "product_code"    TEXT,
    "product_name"    TEXT,
    "branch_id"       INTEGER NOT NULL,
    "branch_name"     TEXT NOT NULL,
    "on_hand"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reserved"        DOUBLE PRECISION NOT NULL DEFAULT 0,
    "available"       DOUBLE PRECISION NOT NULL DEFAULT 0,
    "min_stock_level" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status"          TEXT DEFAULT 'InStock',
    "last_synced_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_branch_inventory_pkey" PRIMARY KEY ("id")
);

-- Unique constraint (pos_product_id, branch_id, org_id)
CREATE UNIQUE INDEX IF NOT EXISTS "pos_branch_inventory_pos_product_id_branch_id_org_id_key"
  ON "pos_branch_inventory" ("pos_product_id", "branch_id", "org_id");

-- Indexes
CREATE INDEX IF NOT EXISTS "pos_branch_inventory_org_id_pos_product_id_idx"
  ON "pos_branch_inventory" ("org_id", "pos_product_id");
CREATE INDEX IF NOT EXISTS "pos_branch_inventory_org_id_branch_id_idx"
  ON "pos_branch_inventory" ("org_id", "branch_id");

-- Foreign key
ALTER TABLE "pos_branch_inventory"
  ADD CONSTRAINT "pos_branch_inventory_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
