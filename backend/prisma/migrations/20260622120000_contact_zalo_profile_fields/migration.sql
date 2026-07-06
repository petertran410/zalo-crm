-- Đợt 2b: hồ sơ Zalo mở rộng từ getUserInfo (status/cover/business/last-active).
-- Additive, nullable → an toàn, không đụng data cũ. Verify raw runtime trước (không đoán SDK).
ALTER TABLE "contacts" ADD COLUMN "zalo_status" TEXT;
ALTER TABLE "contacts" ADD COLUMN "zalo_cover_url" TEXT;
ALTER TABLE "contacts" ADD COLUMN "is_business_account" BOOLEAN;
ALTER TABLE "contacts" ADD COLUMN "zalo_last_active_at" TIMESTAMP(3);
