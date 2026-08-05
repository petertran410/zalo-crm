/**
 * hisweetie-mcp-client.ts — singleton wrapper around @dieptra/mcp-client.
 * Used by backend routes to call Hisweetie POS MCP tools (customers, products, orders…).
 */
import { HisweetieClient } from '@dieptra/mcp-client';
import { config } from '../../config/index.js';

let singleton: HisweetieClient | null = null;

export function isHisweetieMcpConfigured(): boolean {
  return !!(
    config.hisweetieMcpUrl
    && config.hisweetieClientId
    && config.hisweetieClientSecret
    && config.hisweetieClientSecret.length >= 12
  );
}

/** Public base URL (no secrets) for status endpoints. */
export function hisweetieMcpPublicStatus(): {
  configured: boolean;
  baseUrl: string | null;
  clientIdHint: string | null;
} {
  const configured = isHisweetieMcpConfigured();
  return {
    configured,
    baseUrl: configured ? config.hisweetieMcpUrl : null,
    clientIdHint: configured
      ? `${config.hisweetieClientId.slice(0, 4)}…`
      : null,
  };
}

export function getHisweetieClient(): HisweetieClient {
  if (!isHisweetieMcpConfigured()) {
    throw new Error(
      'Hisweetie MCP is not configured. Set HISWEETIE_MCP_URL, HISWEETIE_CLIENT_ID, HISWEETIE_CLIENT_SECRET in backend .env',
    );
  }
  if (!singleton) {
    singleton = new HisweetieClient({
      baseUrl: config.hisweetieMcpUrl,
      clientId: config.hisweetieClientId,
      clientSecret: config.hisweetieClientSecret,
      timeoutMs: 60_000,
    });
  }
  return singleton;
}

/** Reset singleton (e.g. after env hot-reload in tests). */
export function resetHisweetieClient(): void {
  singleton = null;
}
