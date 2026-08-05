/**
 * facebook-config.ts — CRUD cấu hình Meta App per-org (multi-channel Phase 2, 2026-07-10).
 *
 * Mỗi org tự mang Meta App riêng (FacebookAppConfig.orgId @unique): appId + appSecret (mã hoá
 * AES-256-GCM) + webhookVerifyToken. appSecret dùng để verify chữ ký webhook
 * (X-Hub-Signature-256). Webhook 1 endpoint chung, phân biệt org qua verifyToken (GET
 * handshake) và page id (POST event) → không cần app riêng mỗi endpoint.
 */
import { prisma } from '../../../shared/database/prisma-client.js';
import { encrypt, decrypt } from '../../../shared/crypto/aes-gcm.js';

export interface FacebookConfigSafe {
  appId: string | null;
  hasAppSecret: boolean; // KHÔNG lộ secret ra UI — chỉ báo đã cấu hình chưa
  webhookVerifyToken: string | null;
}

/** Config AN TOÀN cho UI (không lộ secret). */
export async function getFacebookConfigSafe(orgId: string): Promise<FacebookConfigSafe> {
  const cfg = await prisma.facebookAppConfig.findUnique({ where: { orgId } });
  return {
    appId: cfg?.appId ?? null,
    hasAppSecret: !!cfg?.appSecretEnc,
    webhookVerifyToken: cfg?.webhookVerifyToken ?? null,
  };
}

/** Tạo/cập nhật config. appSecret (nếu truyền) mã hoá trước khi lưu (env FB_TOKEN_ENC_KEY). */
export async function upsertFacebookConfig(
  orgId: string,
  input: { appId?: string | null; appSecret?: string | null; webhookVerifyToken?: string | null },
): Promise<FacebookConfigSafe> {
  const data: { appId?: string | null; appSecretEnc?: string; webhookVerifyToken?: string | null } = {};
  if (input.appId !== undefined) data.appId = input.appId;
  if (input.webhookVerifyToken !== undefined) data.webhookVerifyToken = input.webhookVerifyToken;
  if (input.appSecret) data.appSecretEnc = encrypt(input.appSecret);

  await prisma.facebookAppConfig.upsert({
    where: { orgId },
    create: { orgId, ...data },
    update: data,
  });
  return getFacebookConfigSafe(orgId);
}

/** Giải mã appSecret để verify webhook signature (NỘI BỘ — không expose ra route). */
export async function getDecryptedAppSecret(orgId: string): Promise<string | null> {
  const cfg = await prisma.facebookAppConfig.findUnique({ where: { orgId }, select: { appSecretEnc: true } });
  if (!cfg?.appSecretEnc) return null;
  try {
    return decrypt(cfg.appSecretEnc);
  } catch {
    return null; // khoá sai / dữ liệu hỏng — coi như chưa cấu hình
  }
}

/** Tìm org theo webhook verify token (GET handshake — Meta gửi hub.verify_token). */
export async function findOrgByVerifyToken(token: string): Promise<string | null> {
  if (!token) return null;
  const cfg = await prisma.facebookAppConfig.findFirst({
    where: { webhookVerifyToken: token },
    select: { orgId: true },
  });
  return cfg?.orgId ?? null;
}
