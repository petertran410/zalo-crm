/**
 * backfill-permission-groups.ts — vá dữ liệu cho các org tạo TRƯỚC 2026-08-06.
 *
 * Chạy (từ backend/):  npx tsx --env-file=.env prisma/backfill-permission-groups.ts
 *                      thêm --apply để ghi thật; không có cờ = chạy thử (dry-run).
 *
 * Vì sao cần: setup() cũ tạo org + owner mà KHÔNG seed nhóm quyền, và
 * POST /api/v1/users tạo nhân viên với permissionGroupId = null. Hệ quả:
 *   - org không có nhóm nào  → màn Phân quyền trống, không gán được ai
 *   - user role='member' không nhóm → userHasGrant fail mọi nhánh → mất sạch quyền,
 *     đăng nhập được nhưng vào đâu cũng bị router guard đá ra
 *
 * Script này, cho MỌI org:
 *   1. seed 7 nhóm hệ thống (idempotent)
 *   2. gán nhóm mặc định cho user đang null theo legacy role:
 *        owner → Admin, admin → CEO, member → Sale
 *      (khớp migrateLegacyUsersToPermissionGroups để không đẻ ra luật thứ hai)
 *
 * KHÔNG đụng user đã có permissionGroupId.
 */
import { prisma } from '../src/shared/database/prisma-client.js';
import { seedDefaultPermissionGroups } from '../src/modules/rbac/seed-default-groups.js';

const APPLY = process.argv.includes('--apply');

const ROLE_TO_GROUP: Record<string, string> = {
  owner: 'Admin',
  admin: 'CEO',
  member: 'Sale',
};

async function main() {
  const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });
  console.log(`${APPLY ? 'APPLY' : 'DRY-RUN'} — ${orgs.length} org\n`);

  let totalSeeded = 0;
  let totalAssigned = 0;

  for (const org of orgs) {
    console.log(`── ${org.name} (${org.id})`);

    if (APPLY) {
      const seeded = await seedDefaultPermissionGroups(org.id);
      totalSeeded += seeded.created;
      console.log(`   nhom quyen: +${seeded.created} moi, ${seeded.existing} da co`);
    } else {
      const have = await prisma.permissionGroup.count({ where: { orgId: org.id, isSystem: true } });
      console.log(`   nhom quyen he thong hien co: ${have}/7`);
    }

    const groups = await prisma.permissionGroup.findMany({
      where: { orgId: org.id, isSystem: true, archivedAt: null },
      select: { id: true, name: true },
    });
    const byName = new Map(groups.map((g) => [g.name, g.id]));

    const orphans = await prisma.user.findMany({
      where: { orgId: org.id, permissionGroupId: null },
      select: { id: true, email: true, phone: true, role: true },
    });

    for (const u of orphans) {
      const groupName = ROLE_TO_GROUP[u.role];
      const groupId = groupName ? byName.get(groupName) : undefined;
      const who = u.email ?? u.phone ?? u.id;
      if (!groupId) {
        console.log(`   ! ${who} (role=${u.role}) — khong map duoc, BO QUA`);
        continue;
      }
      if (APPLY) {
        await prisma.user.update({ where: { id: u.id }, data: { permissionGroupId: groupId } });
      }
      totalAssigned++;
      console.log(`   ${APPLY ? '+' : '~'} ${who}: role=${u.role} -> nhom "${groupName}"`);
    }
    if (orphans.length === 0) console.log('   moi user deu da co nhom quyen.');
  }

  console.log(
    `\n=== ${APPLY ? 'Da ghi' : 'Se ghi'}: ${totalSeeded} nhom moi, ${totalAssigned} user duoc gan nhom ===`,
  );
  if (!APPLY) console.log('Chay lai kem --apply de thuc hien.');
}

main()
  .catch((e) => {
    console.error('Backfill loi:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
