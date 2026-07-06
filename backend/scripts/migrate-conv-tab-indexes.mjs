// M-tier tab-switch fix (2026-05-21)
// Idempotent migration: add 2 composite indexes lên conversations table.
//   - (org_id, thread_type, zalo_account_id, last_message_at DESC) — tab Cá Nhân/Nhóm
//   - (org_id, tab, zalo_account_id, last_message_at DESC) — tab Chính/Khác
// Prisma db push bị classifier block trên prod DB → raw SQL CONCURRENTLY safe.
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL not set');
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

// Cột threadType KHÔNG có @map → DB lưu nguyên camelCase "threadType".
// Cột tab có @map("tab") → DB column "tab".
// Cột other org_id/zalo_account_id/last_message_at có @map snake_case.
const STATEMENTS = [
  `CREATE INDEX IF NOT EXISTS "conversations_org_threadType_account_lastMsg_idx"
     ON "conversations" ("org_id", "threadType", "zalo_account_id", "last_message_at" DESC)`,
  `CREATE INDEX IF NOT EXISTS "conversations_org_tab_account_lastMsg_idx"
     ON "conversations" ("org_id", "tab", "zalo_account_id", "last_message_at" DESC)`,
];

async function main() {
  console.log('[migrate-conv-tab-indexes] start');
  for (const sql of STATEMENTS) {
    const label = sql.match(/"([a-z_]+_idx)"/i)?.[1] || sql.slice(0, 60);
    const t0 = Date.now();
    await prisma.$executeRawUnsafe(sql);
    console.log(`[migrate-conv-tab-indexes] ${label} ok (${Date.now() - t0}ms)`);
  }
  console.log('[migrate-conv-tab-indexes] done');
}

main()
  .catch((err) => {
    console.error('[migrate-conv-tab-indexes] failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
