-- Wave 1+2: read receipts cho outgoing messages.
-- delivered_at = Zalo server confirm KH device received (1 tick xám)
-- seen_at      = KH mở conversation đọc tin (2 tick xanh)
-- Cả 2 nullable; chỉ set cho senderType='self'. Tin cũ trước migration → null forever.

ALTER TABLE "messages" ADD COLUMN "delivered_at" TIMESTAMP(3);
ALTER TABLE "messages" ADD COLUMN "seen_at" TIMESTAMP(3);
