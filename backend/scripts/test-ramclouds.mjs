// Tạm: test gọi model thật qua luồng AI của backend. Xóa sau khi chạy.
import { resolveProviderApiKey, getProviderBaseUrl } from '../dist/modules/ai/provider-registry.js';
import { generateText } from '../dist/modules/ai/ai-service.js';
import { withTenant } from '../dist/shared/tenant/tenant-context.js';

const ORG_ID = process.env.RC_ORG_ID;
const PROVIDER = 'custom:ramclouds';
const MODEL = 'step-3.7-flash';

async function main() {
  await withTenant(ORG_ID, async () => {
    const [apiKey, baseUrl] = await Promise.all([
      resolveProviderApiKey(ORG_ID, PROVIDER),
      getProviderBaseUrl(ORG_ID, PROVIDER),
    ]);
    console.log('resolved baseUrl=', baseUrl, ' keyOk=', !!apiKey, ' keyMask=', apiKey ? '••••' + apiKey.slice(-4) : '(none)');
    const out = await generateText(PROVIDER, apiKey, MODEL, 'You are a terse assistant. Reply in Vietnamese.', 'Nói đúng một câu: bạn là model gì và đang hoạt động chứ?', 2000, baseUrl);
    console.log('--- MODEL REPLY ---');
    console.log(out);
  });
}

main().then(() => process.exit(0)).catch((e) => { console.error('FAIL:', e && e.message ? e.message : e); process.exit(1); });
