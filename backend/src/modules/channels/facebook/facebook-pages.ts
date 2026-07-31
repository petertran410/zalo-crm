/**
 * facebook-pages.ts — kết nối/liệt kê Page Messenger (multi-channel Phase 2, 2026-07-21).
 *
 * connectPageManual(): đường TẠM cho môi trường test — nhập trực tiếp Page Access Token
 * (lấy tay từ Meta App dashboard) thay cho OAuth flow (POST /pages/connect vẫn STUB chờ
 * Meta App review). Token mã hoá AES-256-GCM trước khi lưu (env FB_TOKEN_ENC_KEY).
 * verifyToken lấy từ FacebookAppConfig của org (fallback '' nếu chưa cấu hình).
 */
import { prisma } from '../../../shared/database/prisma-client.js';
import { encrypt, decrypt } from '../../../shared/crypto/aes-gcm.js';
import { runSystemQuery } from '../../../shared/tenant/tenant-context.js';
import type { ChannelAccountRef } from '../channel-driver.js';

export interface ManualPageConnectInput {
  pageId: string;
  pageName?: string | null;
  pageAccessToken: string;
  connectedByUserId?: string | null;
}

export interface FacebookPageSafe {
  id: string;
  pageId: string;
  pageName: string | null;
  isActive: boolean;
}

/**
 * Kết nối Page thủ công (test): mã hoá token + upsert FacebookPageAccount theo pageId (@unique).
 * KHÔNG trả token ra ngoài. Phải chạy trong withTenant(orgId, …) — model org-scoped.
 */
export async function connectPageManual(orgId: string, input: ManualPageConnectInput): Promise<FacebookPageSafe> {
  if (!input.pageId?.trim()) throw new Error('pageId là bắt buộc');
  if (!input.pageAccessToken?.trim()) throw new Error('pageAccessToken là bắt buộc');

  // verifyToken lấy từ config app của org (field trên Page non-null → fallback '').
  const cfg = await prisma.facebookAppConfig.findUnique({
    where: { orgId },
    select: { webhookVerifyToken: true },
  });
  const encryptedAccessToken = encrypt(input.pageAccessToken.trim());

  const page = await prisma.facebookPageAccount.upsert({
    where: { pageId: input.pageId.trim() },
    create: {
      orgId,
      pageId: input.pageId.trim(),
      pageName: input.pageName ?? null,
      encryptedAccessToken,
      webhookVerifyToken: cfg?.webhookVerifyToken ?? '',
      connectedByUserId: input.connectedByUserId ?? null,
      isActive: true,
    },
    update: {
      pageName: input.pageName ?? null,
      encryptedAccessToken,
      webhookVerifyToken: cfg?.webhookVerifyToken ?? '',
      isActive: true,
    },
    select: { id: true, pageId: true, pageName: true, isActive: true },
  });
  return page;
}

/**
 * Nạp ChannelAccountRef (token ĐÃ decrypt) cho driver gọi Graph API. Chạy trong tenant context
 * (FacebookPageAccount org-scoped). null nếu không thấy / token hỏng. KHÔNG log token.
 */
export async function loadPageAccountRef(facebookPageAccountId: string): Promise<ChannelAccountRef | null> {
  const page = await prisma.facebookPageAccount.findUnique({
    where: { id: facebookPageAccountId },
    select: { id: true, pageId: true, encryptedAccessToken: true },
  });
  if (!page) return null;
  try {
    return { id: page.id, externalId: page.pageId, accessToken: decrypt(page.encryptedAccessToken) };
  } catch {
    return null; // token hỏng / sai khoá — coi như chưa cấu hình.
  }
}

/**
 * Resolve Page theo FB page id (từ webhook, CHƯA biết org) → { id, orgId }.
 * Cross-org lookup pre-tenant → bọc runSystemQuery. null nếu chưa connect / inactive.
 */
export async function resolvePageForWebhook(pageId: string): Promise<{ id: string; orgId: string } | null> {
  if (!pageId) return null;
  return runSystemQuery(async () => {
    const page = await prisma.facebookPageAccount.findUnique({
      where: { pageId },
      select: { id: true, orgId: true, isActive: true },
    });
    return page && page.isActive ? { id: page.id, orgId: page.orgId } : null;
  });
}
