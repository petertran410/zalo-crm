/**
 * tenant-context.test.ts — Phase 0 Gateway (Bảo mật xác thực 2026-06-07)
 * Verify AsyncLocalStorage tenant context: enter/get/require/withTenant.
 */
import { describe, it, expect } from 'vitest';
import {
  enterTenantContext,
  getTenantContext,
  requireTenantContext,
  withTenant,
} from '../../src/shared/tenant/tenant-context.js';

describe('tenant-context', () => {
  it('getTenantContext trả undefined khi chạy ngoài mọi scope', () => {
    expect(getTenantContext()).toBeUndefined();
  });

  it('requireTenantContext throw khi thiếu scope (fail-loud)', () => {
    expect(() => requireTenantContext()).toThrowError(/tenant context/i);
  });

  it('withTenant chạy fn trong scope đúng orgId', async () => {
    const seen = await withTenant('org-A', async () => getTenantContext());
    expect(seen?.orgId).toBe('org-A');
    expect(seen?.userId).toBe('system'); // default cho worker
    expect(seen?.role).toBe('system');
  });

  it('withTenant nhận userId/role tường minh', async () => {
    const seen = await withTenant(
      'org-B',
      async () => getTenantContext(),
      { userId: 'u1', role: 'owner' },
    );
    expect(seen).toMatchObject({ orgId: 'org-B', userId: 'u1', role: 'owner' });
  });

  it('scope không rò rỉ ra ngoài withTenant', async () => {
    await withTenant('org-C', async () => {
      expect(getTenantContext()?.orgId).toBe('org-C');
    });
    // Sau khi ra khỏi run(), store về undefined.
    expect(getTenantContext()).toBeUndefined();
  });

  it('enterTenantContext set context cho async hiện tại', async () => {
    await new Promise<void>((resolve) => {
      enterTenantContext({ orgId: 'org-D', userId: 'u2', role: 'sale' });
      expect(requireTenantContext().orgId).toBe('org-D');
      resolve();
    });
  });
});
