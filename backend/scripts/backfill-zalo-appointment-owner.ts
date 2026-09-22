/**
 * backfill-zalo-appointment-owner.ts — 2026-08-04
 *
 * Gán người phụ trách cho các Appointment sinh từ reminder card Zalo mà còn
 * `assignedUserId = null` (tạo trước khi `reminder-sync.ts` biết set field này).
 *
 * Đường suy ra chủ sở hữu:
 *   Appointment.zaloMessageId → Message.conversationId → Conversation.zaloAccountId
 *   → ZaloAccount.ownerUserId
 *
 * Vì sao cần: quyền sửa lịch (appointment-routes.ts) nay là "chủ lịch hoặc
 * owner/admin". Lịch Zalo cũ không có chủ nên chính sale tạo ra nó lại KHÔNG sửa
 * được — chỉ admin đụng được. Backfill trả quyền đó về đúng người.
 *
 * An toàn chạy lại nhiều lần (chỉ đụng row assignedUserId = null).
 *
 * Chạy thử:  npx tsx --env-file=.env scripts/backfill-zalo-appointment-owner.ts
 * Ghi thật:  npx tsx --env-file=.env scripts/backfill-zalo-appointment-owner.ts --apply
 */
import { prisma } from '../src/shared/database/prisma-client.js';
import { withTenant, runSystemQuery } from '../src/shared/tenant/tenant-context.js';

const APPLY = process.argv.includes('--apply');

async function main(): Promise<void> {
  // Script bảo trì chạy cross-org → runSystemQuery.
  const candidates = await runSystemQuery(() =>
    prisma.appointment.findMany({
      where: { source: 'zalo', assignedUserId: null, zaloMessageId: { not: null } },
      select: { id: true, orgId: true, zaloMessageId: true },
    }),
  );

  const orphanNoMessage = await runSystemQuery(() =>
    prisma.appointment.count({
      where: { source: 'zalo', assignedUserId: null, zaloMessageId: null },
    }),
  );

  console.log(
    `[backfill] ${APPLY ? 'APPLY' : 'DRY-RUN'} — ${candidates.length} lịch Zalo chưa có người phụ trách (có zaloMessageId)`,
  );
  if (orphanNoMessage > 0) {
    console.log(`[backfill] ${orphanNoMessage} lịch Zalo khác KHÔNG có zaloMessageId → không suy được chủ, bỏ qua`);
  }

  let resolved = 0;
  let unresolved = 0;
  const perUser = new Map<string, number>();

  for (const appt of candidates) {
    const message = await runSystemQuery(() =>
      prisma.message.findUnique({
        where: { id: appt.zaloMessageId! },
        select: { conversation: { select: { zaloAccount: { select: { ownerUserId: true } } } } },
      }),
    );
    const ownerUserId = message?.conversation?.zaloAccount?.ownerUserId ?? null;

    if (!ownerUserId) {
      unresolved++;
      continue;
    }

    resolved++;
    perUser.set(ownerUserId, (perUser.get(ownerUserId) ?? 0) + 1);

    if (APPLY) {
      await withTenant(appt.orgId, () =>
        prisma.appointment.update({
          where: { id: appt.id },
          data: { assignedUserId: ownerUserId },
        }),
      );
    }
  }

  console.log(`[backfill] suy được chủ: ${resolved} · không suy được: ${unresolved}`);
  for (const [userId, count] of perUser) {
    const u = await runSystemQuery(() =>
      prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } }),
    );
    console.log(`  - ${u?.fullName ?? userId}: ${count} lịch`);
  }
  if (!APPLY && resolved > 0) {
    console.log('[backfill] Chưa ghi gì. Thêm --apply để cập nhật thật.');
  }
}

main()
  .catch((err) => {
    console.error('[backfill] lỗi:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
