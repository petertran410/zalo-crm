// Unit test (thuần) — chốt an toàn ghi POS: CHỈ sandbox được phép (2026-07-18).
// Rủi ro nếu guard sai: CRM ghi đơn hàng vào POS PRODUCTION khi chưa có quyền.
import { describe, it, expect } from 'vitest';
import { isSandboxMcpUrl, assertSandboxForPosWrite } from '../src/modules/integrations/hisweetie-sandbox-guard.js';

describe('hisweetie-sandbox-guard — chỉ sandbox được ghi', () => {
  it('sandbox URL chuẩn → cho phép', () => {
    expect(isSandboxMcpUrl('https://sandbox-mcp.hisweetievietnam.com')).toBe(true);
    expect(isSandboxMcpUrl('https://sandbox-mcp.hisweetievietnam.com/')).toBe(true);
  });

  it('production / host lạ → chặn', () => {
    expect(isSandboxMcpUrl('https://mcp.hisweetievietnam.com')).toBe(false);
    expect(isSandboxMcpUrl('https://pos.hisweetievietnam.com')).toBe(false);
    expect(isSandboxMcpUrl('https://hisweetievietnam.com')).toBe(false);
    expect(isSandboxMcpUrl('https://evil.com')).toBe(false);
  });

  it('subdomain giả mạo chứa chuỗi sandbox → vẫn chặn (so hostname EXACT, không substring)', () => {
    expect(isSandboxMcpUrl('https://sandbox-mcp.hisweetievietnam.com.evil.com')).toBe(false);
    expect(isSandboxMcpUrl('https://xsandbox-mcp.hisweetievietnam.com')).toBe(false);
  });

  it('http (không TLS) → chặn kể cả đúng host', () => {
    expect(isSandboxMcpUrl('http://sandbox-mcp.hisweetievietnam.com')).toBe(false);
  });

  it('rỗng / null / URL hỏng → chặn, không throw', () => {
    expect(isSandboxMcpUrl('')).toBe(false);
    expect(isSandboxMcpUrl(null)).toBe(false);
    expect(isSandboxMcpUrl(undefined)).toBe(false);
    expect(isSandboxMcpUrl('not-a-url')).toBe(false);
  });

  it('assertSandboxForPosWrite: sandbox → pass, khác → throw kèm tên operation', () => {
    expect(() => assertSandboxForPosWrite('https://sandbox-mcp.hisweetievietnam.com', 'orders.create')).not.toThrow();
    expect(() => assertSandboxForPosWrite('https://mcp.hisweetievietnam.com', 'orders.create'))
      .toThrow(/CHẶN orders\.create/);
  });
});
