-- Phase Onboarding v1 2026-05-24 — SĐT đăng nhập cho sale VN.
-- Cho phép admin tạo user CHỈ với SĐT (email NULL). Login accept cả email vừa phone.
-- Backfill: tất cả user cũ giữ email; phone backfill từ ZaloAccount.phone nếu có (nick OWN đầu tiên).

-- 1. Email từ NOT NULL → nullable (PG drop NOT NULL)
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;

-- 2. Thêm cột phone unique nullable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" TEXT;

-- Unique index — NULL không vi phạm constraint trong PG
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'users_phone_key'
  ) THEN
    CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");
  END IF;
END$$;
