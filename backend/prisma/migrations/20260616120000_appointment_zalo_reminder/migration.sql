-- 2026-06-16: Lịch hẹn → Nhắc hẹn Zalo (nick hệ thống tạo nhắc hẹn cho sale).
--
-- organizations: bật tính năng + delay (phút) gửi tin "link đánh dấu hoàn thành/huỷ" SAU giờ hẹn.
-- appointments: cờ đã gửi tin link đánh dấu (cron set 1 lần). Additive, an toàn.
ALTER TABLE "organizations" ADD COLUMN "appointment_zalo_reminder_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "organizations" ADD COLUMN "appointment_action_delay_minutes" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "appointments" ADD COLUMN "action_prompt_sent" BOOLEAN NOT NULL DEFAULT false;
