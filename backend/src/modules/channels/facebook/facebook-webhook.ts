/**
 * facebook-webhook.ts — helper xác thực webhook Messenger (multi-channel Phase 2, 2026-07-10).
 *
 * GET handshake: Meta gọi ?hub.mode=subscribe&hub.verify_token=X&hub.challenge=Y → echo Y
 *   nếu token X khớp 1 org (xem findOrgByVerifyToken).
 * POST event: verify chữ ký X-Hub-Signature-256 = "sha256="+HMAC_SHA256(appSecret, rawBody).
 *   LƯU Ý: cần RAW body (Fastify parse JSON làm mất raw) → Phase 2 thêm fastify-raw-body
 *   hoặc content-type parser giữ raw. Helper này sẵn sàng, route sẽ gọi khi có raw body.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

/** So khớp chữ ký X-Hub-Signature-256 (header dạng "sha256=<hex>"). Timing-safe. */
export function verifyWebhookSignature(
  rawBody: Buffer | string,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader) return false;
  const expected = 'sha256=' + createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
