/**
 * setup-facebook-test.ts — nạp cấu hình Facebook Messenger (test) từ env vào DB.
 *
 * Đọc token từ env (root .env.local), ghi FacebookAppConfig (appId/appSecret/verifyToken,
 * appSecret mã hoá) + FacebookPageAccount (Page Access Token mã hoá) cho org owner đầu tiên
 * (hoặc org theo FB_SETUP_ORG_ID). Đường TẠM thay OAuth — chỉ dùng ở môi trường test.
 *
 * Chạy:  npx tsx --env-file=../.env.local scripts/setup-facebook-test.ts
 *   (yêu cầu FB_TOKEN_ENC_KEY 64-hex trong env để mã hoá).
 *
 * Env đọc (fallback tên cũ FB_* nếu MESSENGER_* trống):
 *   FB_APP_ID                          → appId (tuỳ chọn)
 *   MESSENGER_APP_SECRET | FB_APP_SECRET
 *   MESSENGER_VERIFY_TOKEN | FB_WEBHOOK_VERIFY_TOKEN
 *   MESSENGER_PAGE_ACCESS_TOKEN
 *   MESSENGER_PAGE_ID                  → pageId (bắt buộc để nối Page)
 *   MESSENGER_PAGE_NAME                → pageName (tuỳ chọn)
 */
import { prisma } from '../src/shared/database/prisma-client.js';
import { withTenant } from '../src/shared/tenant/tenant-context.js';
import { upsertFacebookConfig } from '../src/modules/channels/facebook/facebook-config.js';
import { connectPageManual } from '../src/modules/channels/facebook/facebook-pages.js';

const env = process.env;
const pick = (...names: string[]): string | undefined => {
  for (const n of names) {
    const v = env[n];
    if (v && v.trim()) return v.trim();
  }
  return undefined;
};

async function main(): Promise<void> {
  const appId = pick('FB_APP_ID');
  const appSecret = pick('MESSENGER_APP_SECRET', 'FB_APP_SECRET');
  const webhookVerifyToken = pick('MESSENGER_VERIFY_TOKEN', 'FB_WEBHOOK_VERIFY_TOKEN');
  const pageAccessToken = pick('MESSENGER_PAGE_ACCESS_TOKEN');
  const pageId = pick('MESSENGER_PAGE_ID');
  const pageName = pick('MESSENGER_PAGE_NAME');

  if (!env.FB_TOKEN_ENC_KEY || env.FB_TOKEN_ENC_KEY.length !== 64) {
    throw new Error('FB_TOKEN_ENC_KEY (64-hex) chưa set trong env — cần để mã hoá secret/token.');
  }
  if (!appSecret && !webhookVerifyToken && !pageAccessToken) {
    throw new Error('Không thấy token FB nào trong env (MESSENGER_* / FB_*). Kiểm tra --env-file.');
  }

  const orgId = env.FB_SETUP_ORG_ID
    ?? (await prisma.user.findFirst({ where: { role: 'owner' }, select: { orgId: true } }))?.orgId;
  if (!orgId) throw new Error('Không tìm được org (không có user role=owner, cũng không set FB_SETUP_ORG_ID).');

  // 1) App config (appId/appSecret/verifyToken). FacebookAppConfig KHÔNG org-scoped → gọi thẳng.
  const cfg = await upsertFacebookConfig(orgId, { appId, appSecret, webhookVerifyToken });
  console.log(`[setup-fb] config org=${orgId}: appId=${cfg.appId ?? '(none)'} hasSecret=${cfg.hasAppSecret} verifyToken=${cfg.webhookVerifyToken ?? '(none)'}`);

  // 2) Page (nếu đủ pageId + pageAccessToken). FacebookPageAccount org-scoped → bọc withTenant.
  if (pageId && pageAccessToken) {
    const page = await withTenant(orgId, () =>
      connectPageManual(orgId, { pageId, pageName, pageAccessToken }),
    );
    console.log(`[setup-fb] page nối: id=${page.id} pageId=${page.pageId} name=${page.pageName ?? '(none)'} active=${page.isActive}`);
  } else {
    console.log('[setup-fb] BỎ QUA nối Page — thiếu MESSENGER_PAGE_ID và/hoặc MESSENGER_PAGE_ACCESS_TOKEN.');
  }
  console.log('[setup-fb] Xong.');
}

main()
  .catch((err) => { console.error('[setup-fb] LỖI:', err instanceof Error ? err.message : err); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
