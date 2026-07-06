-- ════════════════════════════════════════════════════════════════════════
-- Message.mentions JSONB — Anh chốt 2026-06-03
-- ════════════════════════════════════════════════════════════════════════
-- Persist Zalo SDK msg.mentions (TMention[]) vào DB để FE render chính xác
-- 100% theo pos+len thay vì đoán regex.
--
-- Schema SDK (zca-js/dist/models/Message.d.ts:65-70):
--   type TMention = { uid: string; pos: number; len: number; type: 0 | 1 };
--   type TGroupMessage = TMessage & { mentions: TMention[] | undefined };
--
-- Ví dụ: "Nay lên đó bắn vạch à @Trung Trường - Hs Holding"
--   mentions: [{ uid: "2250...", pos: 22, len: 26, type: 0 }]
--   → FE bôi từ pos=22 dài 26 ký tự = "@Trung Trường - Hs Holding" ĐỦ.
--
-- Chỉ group message có mentions (TGroupMessage). User 1-1 không có.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS mentions JSONB NULL;

-- Index partial cho query mention-aware (vd "tìm tin mention tôi"):
-- Hiện FE chỉ đọc per-message → index không cần thiết. Khi nào có search
-- "@me" thì tạo GIN index sau.
