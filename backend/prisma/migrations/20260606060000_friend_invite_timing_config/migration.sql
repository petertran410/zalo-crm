-- #3 2026-06-06 (Anh chốt): đưa nhịp gửi + sàn welcome + cửa sổ warm RA UI;
-- nối lại send_hour; thêm nhóm "Cài đặt kỹ thuật" cấp tổ chức cho admin.
-- Default = đúng giá trị hardcode cũ để KHÔNG đổi hành vi Mục tiêu/tổ chức hiện có.

-- automation_triggers: nhịp gửi lời mời + sàn welcome + cửa sổ warm
ALTER TABLE "automation_triggers"
  ADD COLUMN "friend_req_interval_min_minutes" INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN "friend_req_interval_max_minutes" INTEGER NOT NULL DEFAULT 40,
  ADD COLUMN "welcome_min_floor_seconds" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN "warm_window_days" INTEGER NOT NULL DEFAULT 30;

-- organizations: nhóm cài đặt kỹ thuật (vận hành nội bộ) cho admin
ALTER TABLE "organizations"
  ADD COLUMN "auto_stuck_sweep_seconds" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN "auto_drainer_sweep_seconds" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "auto_welcome_probe_seconds" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN "auto_remind_sweep_minutes" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "auto_stuck_threshold_minutes" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "auto_stuck_max_recovery" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN "auto_campaign_timeout_hours" INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN "auto_nick_offline_reset_hours" INTEGER NOT NULL DEFAULT 24;
