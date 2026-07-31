/**
 * mcp-client.ts — client POS dùng cho luồng đồng bộ (pos-sync-service).
 *
 * Fix 2026-07-25: trước đây file này tự dựng HisweetieClient riêng từ
 * HISWEETIE_POS_BASE_URL / HISWEETIE_POS_CLIENT_ID / HISWEETIE_POS_CLIENT_SECRET —
 * ba biến KHÔNG hề tồn tại trong .env (tên thật là HISWEETIE_MCP_URL /
 * HISWEETIE_CLIENT_ID / HISWEETIE_CLIENT_SECRET). Hệ quả: client được tạo với
 * clientId/clientSecret RỖNG nên mọi lần sync đều fail xác thực, và baseUrl của nó
 * lệch khỏi URL mà hisweetie-sandbox-guard kiểm tra.
 *
 * Nay uỷ quyền cho getHisweetieClient() — một client duy nhất, đọc đúng biến env,
 * và trỏ cùng một baseUrl với chốt sandbox.
 */
import type { HisweetieClient } from '@dieptra/mcp-client';
import { getHisweetieClient } from '../../modules/integrations/hisweetie-mcp-client.js';

export function getPosMcpClient(): HisweetieClient {
  return getHisweetieClient();
}
