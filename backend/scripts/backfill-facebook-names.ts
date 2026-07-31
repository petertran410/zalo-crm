/**
 * backfill-facebook-names.ts — vá dữ liệu hội thoại Facebook cũ: tên KH + Contact liên kết.
 *
 * Với mỗi hội thoại FB:
 *   1. Gọi Graph User Profile API (getUserProfileName) theo PSID lấy tên.
 *   2. Set senderName cho MỌI tin inbound (senderType='contact') còn thiếu tên.
 *   3. Nếu hội thoại CHƯA gắn Contact → tạo Contact (source='FB') + link, để tên KH hiện
 *      ở MỌI nơi trong CRM (tab chat chung, danh sách KH…). Nếu đã có Contact mà tên còn
 *      placeholder → cập nhật tên thật.
 *
 * Tin/hội thoại MỚI đã tự làm việc này ở facebook-inbound-service; script chỉ vá dữ liệu cũ
 * (chạy 1 lần, an toàn chạy lại nhiều lần).
 *
 * Chạy:  npx tsx --env-file=.env scripts/backfill-facebook-names.ts
 *   (cần FB_TOKEN_ENC_KEY để decrypt Page token; Page phải đang connect.)
 */
import { prisma } from '../src/shared/database/prisma-client.js';
import { withTenant, runSystemQuery } from '../src/shared/tenant/tenant-context.js';
import { facebookDriver } from '../src/modules/channels/facebook/facebook-driver.js';
import { loadPageAccountRef } from '../src/modules/channels/facebook/facebook-pages.js';
import type { ChannelAccountRef } from '../src/modules/channels/channel-driver.js';

async function main(): Promise<void> {
  // Đọc mọi hội thoại FB (cross-org — script bảo trì) qua runSystemQuery.
  const convs = await runSystemQuery(() =>
    prisma.conversation.findMany({
      where: { channel: 'facebook', facebookPageAccountId: { not: null }, externalThreadId: { not: null } },
      select: { id: true, orgId: true, externalThreadId: true, facebookPageAccountId: true, contactId: true },
    }),
  );
  console.log(`[fb-backfill] ${convs.length} hội thoại FB cần xử lý.`);

  // Cache ref Page (cần cả accessToken LẪN externalId=pageId cho Conversations API).
  const refCache = new Map<string, ChannelAccountRef | null>();
  let updatedConvs = 0;
  let updatedMsgs = 0;

  for (const c of convs) {
    const pageAccountId = c.facebookPageAccountId!;
    const psid = c.externalThreadId!;
    try {
      // loadPageAccountRef org-scoped → bọc withTenant.
      if (!refCache.has(pageAccountId)) {
        refCache.set(pageAccountId, await withTenant(c.orgId, () => loadPageAccountRef(pageAccountId)));
      }
      const ref = refCache.get(pageAccountId) ?? null;
      if (!ref) { console.log(`[fb-backfill] conv ${c.id.slice(0, 8)}: bỏ qua (không có token Page).`); continue; }

      const name = await facebookDriver.resolveUserName(ref, psid);
      // Không lấy được tên (dev mode / KH không có app role) → vẫn tạo Contact với tên tạm
      // theo PSID để hội thoại có danh tính hiện ở tab chat chung.
      const displayName = name ?? `Facebook ${psid.slice(-6)}`;

      // 1) senderName cho tin inbound còn thiếu (chỉ khi có tên THẬT).
      let msgCount = 0;
      if (name) {
        const res = await withTenant(c.orgId, () =>
          prisma.message.updateMany({
            where: { conversationId: c.id, senderType: 'contact', OR: [{ senderName: null }, { senderName: '' }] },
            data: { senderName: name },
          }),
        );
        msgCount = res.count;
        if (msgCount > 0) updatedMsgs += msgCount;
      }

      // 2) Contact liên kết — tạo nếu thiếu, cập nhật tên nếu còn placeholder.
      await withTenant(c.orgId, async () => {
        if (!c.contactId) {
          const contact = await prisma.contact.create({
            data: {
              orgId: c.orgId,
              fullName: displayName,
              source: 'FB',
              metadata: { facebook: { psid, pageAccountId: pageAccountId } },
            },
            select: { id: true },
          });
          await prisma.conversation.update({ where: { id: c.id }, data: { contactId: contact.id } });
          console.log(`[fb-backfill] conv ${c.id.slice(0, 8)} → tạo Contact "${displayName}".`);
        } else if (name) {
          const existing = await prisma.contact.findUnique({ where: { id: c.contactId }, select: { fullName: true } });
          if (!existing?.fullName || existing.fullName.startsWith('Facebook ')) {
            await prisma.contact.update({ where: { id: c.contactId }, data: { fullName: name } });
            console.log(`[fb-backfill] conv ${c.id.slice(0, 8)} → cập nhật tên Contact "${name}".`);
          }
        }
      });

      updatedConvs++;
      console.log(`[fb-backfill] conv ${c.id.slice(0, 8)} → "${displayName}" (${msgCount} tin cập nhật).`);
    } catch (err) {
      console.error(`[fb-backfill] conv ${c.id.slice(0, 8)} lỗi:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`[fb-backfill] Xong. ${updatedConvs} hội thoại, ${updatedMsgs} tin được điền tên.`);
}

main()
  .catch((err) => { console.error('[fb-backfill] LỖI:', err instanceof Error ? err.message : err); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
