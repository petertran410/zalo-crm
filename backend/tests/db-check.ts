import 'dotenv/config';
import { prisma } from '../src/shared/database/prisma-client.js';

async function main() {
  try {
    const res = await prisma.$queryRawUnsafe<any[]>(`
      SELECT 
        REGEXP_REPLACE('+84912345678', '\\D', '', 'g') as norm_intl,
        REGEXP_REPLACE('0912345678', '\\D', '', 'g') as norm_local,
        (REGEXP_REPLACE('+84912345678', '\\D', '', 'g') = REGEXP_REPLACE('0912345678', '\\D', '', 'g')) as matches;
    `);
    console.log('Postgres Query Result:', res);
  } catch (err: any) {
    console.log('Postgres Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
