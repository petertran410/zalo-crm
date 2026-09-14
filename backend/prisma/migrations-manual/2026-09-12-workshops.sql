-- ==============================================================================
-- TÍNH NĂNG: Phân hệ Workshop Read-Model
-- MỤC ĐÍCH: Lưu trữ thông tin Workshop và Khách mời đồng bộ từ Public API ngoài
-- NGÀY TẠO: 2026-09-12
-- ==============================================================================

CREATE TABLE IF NOT EXISTS "workshops" (
  "id" VARCHAR(36) PRIMARY KEY,
  "org_id" VARCHAR(36) NOT NULL,
  "external_id" VARCHAR(255),
  "slug" VARCHAR(255) NOT NULL,
  "title" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "location" VARCHAR(255),
  "starts_at" TIMESTAMP WITH TIME ZONE NOT NULL,
  "ends_at" TIMESTAMP WITH TIME ZONE NOT NULL,
  "capacity" INTEGER NOT NULL DEFAULT 0,
  "status" VARCHAR(50) NOT NULL DEFAULT 'OPEN',
  "banner_url" TEXT,
  "metadata" JSONB DEFAULT '{}',
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_workshops_org" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "workshops_org_id_slug_key" ON "workshops"("org_id", "slug");
CREATE INDEX IF NOT EXISTS "workshops_org_id_starts_at_idx" ON "workshops"("org_id", "starts_at" DESC);

CREATE TABLE IF NOT EXISTS "workshop_guests" (
  "id" VARCHAR(36) PRIMARY KEY,
  "org_id" VARCHAR(36) NOT NULL,
  "workshop_id" VARCHAR(36) NOT NULL,
  "contact_id" VARCHAR(36),
  "external_guest_id" VARCHAR(255),
  "full_name" VARCHAR(255) NOT NULL,
  "phone" VARCHAR(50) NOT NULL,
  "phone_normalized" VARCHAR(50) NOT NULL,
  "email" VARCHAR(255),
  "party_size" INTEGER NOT NULL DEFAULT 1,
  "status" VARCHAR(50) NOT NULL DEFAULT 'REGISTERED',
  "checkin_qr_code" VARCHAR(255),
  "registered_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  "checked_in_at" TIMESTAMP WITH TIME ZONE,
  "source" VARCHAR(100),
  "notes" TEXT,
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_workshop_guests_org" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_workshop_guests_workshop" FOREIGN KEY ("workshop_id") REFERENCES "workshops"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_workshop_guests_contact" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "workshop_guests_workshop_id_phone_normalized_key" ON "workshop_guests"("workshop_id", "phone_normalized");
CREATE INDEX IF NOT EXISTS "workshop_guests_org_id_phone_normalized_idx" ON "workshop_guests"("org_id", "phone_normalized");
CREATE INDEX IF NOT EXISTS "workshop_guests_org_id_contact_id_idx" ON "workshop_guests"("org_id", "contact_id");
