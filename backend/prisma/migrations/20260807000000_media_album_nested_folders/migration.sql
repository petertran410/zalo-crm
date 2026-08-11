-- Thư mục lồng nhau cho Kho lưu trữ (2026-08-07).
-- media_albums.parent_id: null = thư mục gốc. Xoá cha → xoá cả cây con (ON DELETE CASCADE).
-- Hàng cũ đều là thư mục gốc (parent_id NULL) nên không cần backfill.
-- disk_slug KHÔNG đổi kiểu: từ nay chứa đường dẫn tương đối nhiều cấp ("viet_nam/bao_gia"),
-- giá trị cũ 1 cấp ("viet_nam") vẫn hợp lệ.

-- AlterTable
ALTER TABLE "media_albums" ADD COLUMN     "parent_id" TEXT;

-- CreateIndex
CREATE INDEX "media_albums_org_id_parent_id_idx" ON "media_albums"("org_id", "parent_id");

-- AddForeignKey
ALTER TABLE "media_albums" ADD CONSTRAINT "media_albums_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "media_albums"("id") ON DELETE CASCADE ON UPDATE CASCADE;
