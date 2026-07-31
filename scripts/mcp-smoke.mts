/**
 * mcp-smoke.mts — Read-only connectivity test for Hisweetie POS MCP gateway.
 * Uses @dieptra/mcp-client (OAuth client_credentials + Streamable HTTP /mcp).
 *
 * Env (from .env.local via --env-file):
 *   HISWEETIE_MCP_URL      base URL only, e.g. https://sandbox-mcp.hisweetievietnam.com
 *   HISWEETIE_CLIENT_ID
 *   HISWEETIE_CLIENT_SECRET
 *
 * Run: npm run mcp:smoke
 */
import { HisweetieClient } from '@dieptra/mcp-client';

const baseUrl = (process.env.HISWEETIE_MCP_URL || '').trim().replace(/\/+$/, '');
const clientId = (process.env.HISWEETIE_CLIENT_ID || '').trim();
const clientSecret = (process.env.HISWEETIE_CLIENT_SECRET || '').trim();

function redactUrl(u: string): string {
  try {
    const x = new URL(u);
    return `${x.protocol}//${x.host}`;
  } catch {
    return '(invalid URL)';
  }
}

async function main() {
  if (!baseUrl || !clientId || !clientSecret) {
    console.error('Missing env. Need HISWEETIE_MCP_URL, HISWEETIE_CLIENT_ID, HISWEETIE_CLIENT_SECRET in .env.local');
    process.exit(1);
  }
  if (clientSecret.length < 12) {
    console.error('HISWEETIE_CLIENT_SECRET must be at least 12 characters (MCP server Zod rule).');
    process.exit(1);
  }

  console.log('MCP smoke (read-only)');
  console.log('  baseUrl:', redactUrl(baseUrl));
  console.log('  clientId:', clientId.slice(0, 4) + '…' + (clientId.length > 8 ? clientId.slice(-2) : ''));

  // Optional health (no auth)
  try {
    const h = await fetch(new URL('/health', baseUrl), { signal: AbortSignal.timeout(15_000) });
    const text = await h.text();
    console.log('  GET /health:', h.status, text.slice(0, 120));
  } catch (e) {
    console.warn('  GET /health failed (continuing):', e instanceof Error ? e.message : e);
  }

  const client = new HisweetieClient({
    baseUrl,
    clientId,
    clientSecret,
    timeoutMs: 60_000,
  });

  console.log('\n1) client.branches.list() …');
  const branches = await client.branches.list();
  const branchData = Array.isArray(branches)
    ? branches
    : Array.isArray((branches as { data?: unknown }).data)
      ? (branches as { data: unknown[] }).data
      : null;
  if (branchData) {
    console.log('   OK — branches count:', branchData.length);
    console.log('   sample:', JSON.stringify(branchData[0] ?? null).slice(0, 200));
  } else {
    console.log('   OK — raw keys:', Object.keys(branches as object));
    console.log('   sample:', JSON.stringify(branches).slice(0, 300));
  }

  console.log('\n2) client.customers.list({ currentItem: 0, pageSize: 5 }) …');
  const customers = await client.customers.list({ currentItem: 0, pageSize: 5 });
  const custData = Array.isArray(customers)
    ? customers
    : Array.isArray((customers as { data?: unknown }).data)
      ? (customers as { data: unknown[] }).data
      : null;
  if (custData) {
    console.log('   OK — customers in page:', custData.length);
    console.log('   sample:', JSON.stringify(custData[0] ?? null).slice(0, 200));
  } else {
    console.log('   OK — raw keys:', Object.keys(customers as object));
    console.log('   sample:', JSON.stringify(customers).slice(0, 300));
  }

  console.log('\nSmoke passed (read-only).');
}

main().catch((err) => {
  console.error('\nSmoke failed:');
  console.error(err instanceof Error ? err.message : err);
  if (err && typeof err === 'object' && 'details' in err) {
    console.error('details:', (err as { details: unknown }).details);
  }
  process.exit(1);
});
