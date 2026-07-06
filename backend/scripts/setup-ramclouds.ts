// Tạm: cấu hình custom provider Ramclouds cho 1 org. Xóa sau khi chạy.
import { addCustomProvider, listCustomProviders, setProviderApiKey, setProviderBaseUrl } from '../src/modules/ai/provider-registry.js';
import { updateAiConfig } from '../src/modules/ai/ai-service.js';
import { withTenant } from '../src/shared/tenant/tenant-context.js';

const ORG_ID = process.env.RC_ORG_ID!;
const NAME = 'Ramclouds';
const BASE_URL = 'https://ramclouds.me/v1';
const API_KEY = process.env.RC_API_KEY!;
const MODEL = 'step-3.7-flash';

async function main() {
  await withTenant(ORG_ID, async () => {
    // Tái dùng provider nếu đã có tên Ramclouds, tránh tạo trùng khi chạy lại.
    const existing = await listCustomProviders(ORG_ID);
    let prov = existing.find((p) => p.name === NAME);
    if (!prov) prov = await addCustomProvider(ORG_ID, NAME);
    await setProviderBaseUrl(ORG_ID, prov.id, BASE_URL);
    await setProviderApiKey(ORG_ID, prov.id, API_KEY);
    await updateAiConfig(ORG_ID, { provider: prov.id, model: MODEL, enabled: true });
    console.log(JSON.stringify({ ok: true, id: prov.id, name: prov.name, baseUrl: BASE_URL, model: MODEL }));
  });
}

main().then(() => process.exit(0)).catch((e) => { console.error('FAIL:', e?.message || e); process.exit(1); });
