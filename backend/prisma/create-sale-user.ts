/**
 * create-sale-user.ts — tạo 1 tài khoản Sale để test.
 *
 * Chạy (từ thư mục backend/): npx tsx --env-file=.env prisma/create-sale-user.ts
 * Cần --env-file vì không có chỗ nào trong src/ load dotenv — Prisma CLI mới tự load .env.
 *
 * "Sale" KHÔNG phải giá trị của cột legacy `role` (chỉ có owner/admin/member).
 * Sale = role 'member' + permissionGroup hệ thống tên 'Sale' (permission-types.ts).
 * Idempotent: chạy nhiều lần chỉ update, không tạo trùng.
 */
import { prisma } from '../src/shared/database/prisma-client.js';
import { seedDefaultPermissionGroups } from '../src/modules/rbac/seed-default-groups.js';
import bcrypt from 'bcryptjs';

const EMAIL = 'sale@testcrm.com';
const PASSWORD = 'SaleTest123';
const PHONE = '84900000001';
const FULL_NAME = 'Nguyen Van Sale';

async function main() {
  // 1. Org — dùng org đầu tiên (seed.ts tạo 'Cong Ty Test CRM')
  const org = await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!org) {
    throw new Error('Chua co Organization nao — chay `npm run db:seed` truoc.');
  }
  console.log(`- Org: ${org.name} (${org.id})`);

  // 2. Đảm bảo 7 nhóm quyền hệ thống đã seed, rồi lấy nhóm 'Sale'
  await seedDefaultPermissionGroups(org.id);
  const saleGroup = await prisma.permissionGroup.findFirst({
    where: { orgId: org.id, name: 'Sale', isSystem: true },
    select: { id: true },
  });
  if (!saleGroup) {
    throw new Error("Khong tim thay permission group 'Sale' sau khi seed.");
  }
  console.log(`- Permission group Sale: ${saleGroup.id}`);

  // 3. Team — gắn vào team mặc định nếu có (không bắt buộc)
  const team = await prisma.team.findFirst({ where: { orgId: org.id } });

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: {
      passwordHash,
      permissionGroupId: saleGroup.id,
      role: 'member',
      isActive: true,
      // set passwordChangedAt → bỏ qua modal ép đổi mật khẩu lần đầu (tài khoản test)
      passwordChangedAt: new Date(),
    },
    create: {
      orgId: org.id,
      teamId: team?.id ?? null,
      email: EMAIL,
      phone: PHONE,
      passwordHash,
      fullName: FULL_NAME,
      role: 'member',
      permissionGroupId: saleGroup.id,
      isActive: true,
      passwordChangedAt: new Date(),
    },
    select: { id: true, email: true, phone: true, fullName: true, role: true },
  });

  console.log('\n=== Tai khoan Sale da san sang ===');
  console.log(`- ID       : ${user.id}`);
  console.log(`- Ho ten   : ${user.fullName}`);
  console.log(`- Email    : ${user.email}`);
  console.log(`- SDT      : ${user.phone}`);
  console.log(`- Mat khau : ${PASSWORD}`);
  console.log(`- Role     : ${user.role} + nhom quyen 'Sale'`);
}

main()
  .catch((e) => {
    console.error('Loi khi tao tai khoan Sale:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
