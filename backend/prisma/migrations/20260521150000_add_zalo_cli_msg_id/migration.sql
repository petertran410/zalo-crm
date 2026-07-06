-- 2026-05-21: Zalo undo API yêu cầu cả msgId (server snowflake) + cliMsgId (client counter).
-- DB cũ chỉ lưu zaloMsgId, KHÔNG có cliMsgId → undo fail [zalo:112]. Thêm column zalo_cli_msg_id.
-- Listener phải capture msg.data.cliMsgId vào field này cho tin mới. Tin cũ giữ null + UI báo
-- "Không thu hồi được tin này (thiếu thông tin client ID)".
ALTER TABLE "messages"
  ADD COLUMN IF NOT EXISTS "zalo_cli_msg_id" TEXT;

-- Index để tra cứu (vd lookup khi nhận undo event đến qua cliMsgId)
CREATE INDEX IF NOT EXISTS "messages_zalo_cli_msg_id_idx" ON "messages"("zalo_cli_msg_id");
