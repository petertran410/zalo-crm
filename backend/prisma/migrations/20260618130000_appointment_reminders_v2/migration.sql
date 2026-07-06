-- 2026-06-18: "Nhắc hoàn thành lịch hẹn" nâng cấp — nhắc 3 lần + digest trưởng phòng + short-link.
-- Tất cả additive (ADD COLUMN default / CREATE TABLE) → an toàn, không khoá bảng lâu.

-- organizations: cấu hình 3 mốc giờ nhắc (interval) + số ngày dừng digest.
ALTER TABLE "organizations" ADD COLUMN "appointment_reminder_offsets_hours" JSONB NOT NULL DEFAULT '[1, 3, 6]';
ALTER TABLE "organizations" ADD COLUMN "appointment_digest_stop_days" INTEGER NOT NULL DEFAULT 7;

-- appointments: đổi cờ 1-lần → bộ đếm + mốc digest.
ALTER TABLE "appointments" ADD COLUMN "action_prompt_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "appointments" ADD COLUMN "last_action_prompt_at" TIMESTAMP(3);
ALTER TABLE "appointments" ADD COLUMN "manager_digested_at" TIMESTAMP(3);
ALTER TABLE "appointments" ADD COLUMN "manager_digest_first_at" TIMESTAMP(3);

-- Data-migrate cờ cũ → đếm: lịch đã nhắc 1 lần (action_prompt_sent=true) → count=1; còn lại 0.
UPDATE "appointments" SET "action_prompt_count" = CASE WHEN "action_prompt_sent" THEN 1 ELSE 0 END;

-- Short-link: 1 mã ngắn / 1 lịch.
CREATE TABLE "appointment_action_links" (
    "code" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_action_links_pkey" PRIMARY KEY ("code")
);

CREATE INDEX "appointment_action_links_appointment_id_idx" ON "appointment_action_links"("appointment_id");

ALTER TABLE "appointment_action_links" ADD CONSTRAINT "appointment_action_links_appointment_id_fkey"
    FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
