import { prisma } from './shared/database/prisma-client.js';
async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      phone: true,
      fullName: true,
      role: true,
      orgId: true,
      permissionGroupId: true,
      permissionGroup: { select: { id: true, name: true, grants: true } }
    }
  });
  console.log('Users in DB:', JSON.stringify(users, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
