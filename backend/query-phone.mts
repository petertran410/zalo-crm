// Run from backend dir: npx tsx --env-file=.env <this-script>
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const phone = '091447325';
  console.log(`Searching for contacts with phone: ${phone}\n`);

  const contacts = await prisma.contact.findMany({
    where: { phone },
    select: {
      id: true,
      aliasInNick: true,
      fullName: true,
      phone: true,
      createdAt: true,
      organizationId: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Found ${contacts.length} contact(s):\n`);
  contacts.forEach((c, i) => {
    console.log(`${i + 1}. ${c.aliasInNick || c.fullName || '(no name)'}`);
    console.log(`   ID: ${c.id}`);
    console.log(`   Phone: ${c.phone}`);
    console.log(`   Org: ${c.organizationId}`);
    console.log(`   Created: ${c.createdAt.toISOString()}`);
    console.log('');
  });
}

main()
  .catch(e => {
    console.error('Query failed:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
