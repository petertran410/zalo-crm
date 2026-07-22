/**
 * backfill-facebook-names.ts — điền tên hiển thị KH cho các hội thoại Facebook đã có.
 *
 * Với mỗi hội thoại FB, gọi Graph User Profile API (getUserProfileName) theo PSID rồi set
 * senderName cho MỌI tin inbound (senderType='contact') còn thiếu tên. Tin mới đã tự enrich
 * ở facebook-inbound-service; script này chỉ vá dữ liệu cũ (chạy 1 lần, an toàn chạy lại).
 *
 * Chạy:  npx tsx --env-file=.env scripts/backfill-facebook-names.ts
 *   (cần FB_TOKEN_ENC_KEY để decrypt Page token; Page phải đang connect.)
 */
import { prisma } from '../src/shared/database/prisma-client.js';
import { withTenant, runSystemQuery } from '../src/shared/tenant/tenant-context.js';
import { facebookDriver } from '../src/modules/channels/facebook/facebook-driver.js';
import { loadPageAccountRef } from '../src/modules/channels/facebook/facebook-pages.js';

async function main(): Promise<void> {
  // Đọc mọi hội thoại FB (cross-org — script bảo trì) qua runSystemQuery.
  const convs = await runSystemQuery(() =>
    prisma.conversation.findMany({
      where: { channel: 'facebook', facebookPageAccountId: { not: null }, externalThreadId: { not: null } },
      select: { id: true, orgId: true, externalThreadId: true, facebookPageAccountId: true },
    }),
  );
  console.log(`[fb-backfill] ${convs.length} hội thoại FB cần xử lý.`);

  const tokenCache = new Map<string, string | null>();
  let updatedConvs = 0;
  let updatedMsgs = 0;

  for (const c of convs) {
    const pageAccountId = c.facebookPageAccountId!;
    const psid = c.externalThreadId!;
    try {
      // Token Page (cache theo pageAccountId). loadPageAccountRef org-scoped → bọc withTenant.
      if (!tokenCache.has(pageAccountId)) {
        const ref = await withTenant(c.orgId, () => loadPageAccountRef(pageAccountId));
        tokenCache.set(pageAccountId, ref?.accessToken ?? null);
      }
      const token = tokenCache.get(pageAccountId) ?? null;
      if (!token) { console.log(`[fb-backfill] conv ${c.id.slice(0, 8)}: bỏ qua (không có token Page).`); continue; }

      const name = await facebookDriver.getUserProfileName({ id: '', externalId: '', accessToken: token }, psid);
      if (!name) { console.log(`[fb-backfill] conv ${c.id.slice(0, 8)} PSID …${psid.slice(-6)}: Graph không trả tên (bỏ qua).`); continue; }

      const res = await withTenant(c.orgId, () =>
        prisma.message.updateMany({
          where: { conversationId: c.id, senderType: 'contact', OR: [{ senderName: null }, { senderName: '' }] },
          data: { senderName: name },
        }),
      );
      if (res.count > 0) { updatedConvs++; updatedMsgs += res.count; }
      console.log(`[fb-backfill] conv ${c.id.slice(0, 8)} → "${name}" (${res.count} tin cập nhật).`);
    } catch (err) {
      console.error(`[fb-backfill] conv ${c.id.slice(0, 8)} lỗi:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`[fb-backfill] Xong. ${updatedConvs} hội thoại, ${updatedMsgs} tin được điền tên.`);
}

main()
  .catch((err) => { console.error('[fb-backfill] LỖI:', err instanceof Error ? err.message : err); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
