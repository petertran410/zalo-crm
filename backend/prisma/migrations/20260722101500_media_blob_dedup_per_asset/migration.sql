-- Phase Kho Lưu Trữ 2026-07-22 — nới khoá dedup blob từ [org,hash] sang [org,hash,asset].
-- An toàn: khoá mới là SIÊU TẬP của khoá cũ, dữ liệu đang thoả khoá cũ thì luôn thoả khoá mới
-- (không thể sinh trùng). Dedup BYTE không đổi — uploadBuffer vẫn skip ghi object đã có.
DROP INDEX "media_blobs_org_id_content_hash_key";

CREATE UNIQUE INDEX "media_blobs_org_id_content_hash_asset_id_key" ON "media_blobs"("org_id", "content_hash", "asset_id");

-- Tra dedup theo bytes giờ trả nhiều hàng → cần index thường cho findFirst/findMany.
CREATE INDEX "media_blobs_org_id_content_hash_idx" ON "media_blobs"("org_id", "content_hash");
