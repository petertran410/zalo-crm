import { HisweetieClient } from '@dieptra/mcp-client';
import { config } from '../../config/index.js';

let clientInstance: HisweetieClient | null = null;

export function getPosMcpClient(): HisweetieClient {
  if (!clientInstance) {
    clientInstance = new HisweetieClient({
      baseUrl: config.posBaseUrl,
      clientId: config.posClientId,
      clientSecret: config.posClientSecret,
      timeoutMs: 15000,
    });
  }
  return clientInstance;
}
