// Tạm: dump raw response Ramclouds để xem cấu trúc body. Xóa sau.
import { resolveProviderApiKey, getProviderBaseUrl } from '../dist/modules/ai/provider-registry.js';
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
    const root = baseUrl.replace(/\/+$/, '').replace(/\/v1$/i, '');
    const url = root + '/v1/chat/completions';
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: 'Xin chào, nói đúng 1 câu.' }],
        stream: false,
        max_tokens: 80,
      }),
    });
    console.log('status=', res.status, 'ct=', res.headers.get('content-type'));
    const body = await res.text();
    console.log('--- RAW BODY (first 1500 chars) ---');
    console.log(body.slice(0, 1500));
  });
}
main().then(() => process.exit(0)).catch((e) => { console.error('FAIL:', e && e.message ? e.message : e); process.exit(1); });
