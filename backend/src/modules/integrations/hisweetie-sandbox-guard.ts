/**
 * hisweetie-sandbox-guard.ts — Chốt an toàn cho MỌI thao tác GHI sang POS (2026-07-18).
 *
 * Ranh giới (anh chốt, xem memory pos-no-direct-query):
 *   - SANDBOX (sandbox-mcp.hisweetievietnam.com): ĐƯỢC ghi (orders.create, update KH…).
 *   - PRODUCTION POS: CHƯA có quyền ghi — chặn cứng bất kể env flag nào.
 *
 * Guard này là tầng ĐỘC LẬP với cờ HISWEETIE_BILLING_DISPATCH: cờ bật nhầm mà URL
 * trỏ production thì vẫn chặn. Thuần (không import config/DB) để unit-test không cần env.
 */

/** Host được phép GHI. Muốn mở production: thêm host SAU KHI có quyền + anh xác nhận. */
export const HISWEETIE_WRITE_ALLOWED_HOSTS: ReadonlySet<string> = new Set([
  'sandbox-mcp.hisweetievietnam.com',
]);

/** URL có phải môi trường được phép ghi (sandbox) không. */
export function isSandboxMcpUrl(baseUrl: string | null | undefined): boolean {
  if (!baseUrl) return false;
  try {
    const u = new URL(baseUrl);
    return u.protocol === 'https:' && HISWEETIE_WRITE_ALLOWED_HOSTS.has(u.hostname);
  } catch {
    return false; // URL hỏng → coi như không an toàn
  }
}

/**
 * Throw nếu URL không phải sandbox — gọi TRƯỚC mọi POS write.
 * @param baseUrl  config.hisweetieMcpUrl hiện tại
 * @param operation  tên thao tác (đưa vào message để trace)
 */
export function assertSandboxForPosWrite(baseUrl: string | null | undefined, operation: string): void {
  if (!isSandboxMcpUrl(baseUrl)) {
    throw new Error(
      `[hisweetie-sandbox-guard] CHẶN ${operation}: HISWEETIE_MCP_URL không phải sandbox `
      + '(chỉ sandbox-mcp.hisweetievietnam.com được ghi — chưa có quyền ghi POS production).',
    );
  }
}
