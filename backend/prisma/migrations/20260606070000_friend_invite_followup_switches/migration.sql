-- #1 2026-06-06 (Anh chốt): 2 công tắc bám đuổi theo trạng thái kết bạn.
-- followUpStrangerEnabled: bám đuổi cả khi KH CHƯA đồng ý kết bạn (hộp người lạ).
-- followUpFriendEnabled: bám đuổi khi KH ĐÃ là bạn (kích hoạt khi accept thật).
-- Default cả 2 = true → Mục tiêu cũ giữ nguyên hành vi (spam hết luồng như trước).
ALTER TABLE "automation_triggers"
  ADD COLUMN "follow_up_stranger_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "follow_up_friend_enabled" BOOLEAN NOT NULL DEFAULT true;
