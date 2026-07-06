/**
 * Central AI provider registry.
 *
 * Catalog (id/name/default baseUrl/env token) đến từ .env, dựng 1 lần lúc boot.
 * Nhưng API key + base URL + danh sách model giờ quản lý PER-ORG trên UI:
 *   - key  : app_settings.value_encrypted (AES-GCM, key UI override .env)
 *   - url  : app_settings.value_plain (override .env)
 *   - model: lấy động từ provider (xem providers/list-models.ts), KHÔNG hardcode ở đây.
 */
import { config } from '../../config/index.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { encryptToken, decryptToken } from '../integrations/_shared/token-encryption.util.js';
import { logger } from '../../shared/utils/logger.js';

export type ProviderModel = { title: string; value: string };

/** Catalog entry tĩnh (env-based) */
export type ProviderDef = {
  id: string;
  name: string;
  baseUrl: string;
  authToken: string;
};

/** Thông tin provider trả về UI (KHÔNG kèm key thật) */
export type ProviderInfo = {
  id: string;
  name: string;
  baseUrl: string;
  hasKey: boolean;
  keyMask: string;
  isCustom: boolean;
};

const PROVIDER_IDS = ['anthropic', 'gemini', 'openai', 'qwen', 'kimi'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

/** Custom provider (OpenAI-compatible) — id động dạng `custom:<slug>`. */
const CUSTOM_ID_RE = /^custom:[a-z0-9-]{1,32}$/;
const CUSTOM_REGISTRY_KEY = 'ai_custom_registry';
const MAX_CUSTOM_PROVIDERS = 10;

export type CustomProvider = { id: string; name: string };

/** Provider tùy biến không có default env — id, name động từ DB. */
export function isCustomProvider(id: string): boolean {
  return CUSTOM_ID_RE.test(id);
}

/** Build catalog tĩnh từ config (env) */
function buildCatalog(): ProviderDef[] {
  return [
    { id: 'anthropic', name: 'Anthropic', baseUrl: config.anthropicBaseUrl, authToken: config.anthropicAuthToken },
    { id: 'gemini', name: 'Gemini', baseUrl: config.geminiBaseUrl, authToken: config.geminiAuthToken },
    { id: 'openai', name: 'OpenAI', baseUrl: config.openaiBaseUrl, authToken: config.openaiAuthToken },
    { id: 'qwen', name: 'Qwen', baseUrl: config.qwenBaseUrl, authToken: config.qwenAuthToken },
    { id: 'kimi', name: 'Kimi', baseUrl: config.kimiBaseUrl, authToken: config.kimiAuthToken },
  ];
}

const catalog = buildCatalog();

/** Catalog entry (env defaults) cho 1 provider builtin. Custom → undefined. */
export function getProviderConfig(providerId: string): ProviderDef | undefined {
  return catalog.find((p) => p.id === providerId);
}

/** Hợp lệ = builtin id HOẶC custom id (custom:<slug>) đúng định dạng. */
function isValidProvider(id: string): boolean {
  return (PROVIDER_IDS as readonly string[]).includes(id) || isCustomProvider(id);
}

const keySettingKey = (provider: string) => `ai_${provider}_api_key`;
const urlSettingKey = (provider: string) => `ai_${provider}_base_url`;

/* ── Custom provider registry (lưu JSON 1 dòng trong AppSetting) ────────────── */

/** Đọc danh mục custom provider của org. Lỗi parse → []. */
export async function listCustomProviders(orgId: string): Promise<CustomProvider[]> {
  const setting = await prisma.appSetting.findUnique({
    where: { orgId_settingKey: { orgId, settingKey: CUSTOM_REGISTRY_KEY } },
  });
  if (!setting?.valuePlain) return [];
  try {
    const arr = JSON.parse(setting.valuePlain) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((p): p is CustomProvider =>
        !!p && typeof (p as CustomProvider).id === 'string' && typeof (p as CustomProvider).name === 'string' && isCustomProvider((p as CustomProvider).id),
      )
      .map((p) => ({ id: p.id, name: p.name }));
  } catch (err) {
    logger.error('[ai-registry] parse custom registry fail org=%s: %s', orgId, (err as Error).message);
    return [];
  }
}

async function writeCustomProviders(orgId: string, list: CustomProvider[]): Promise<void> {
  const value = JSON.stringify(list);
  await prisma.appSetting.upsert({
    where: { orgId_settingKey: { orgId, settingKey: CUSTOM_REGISTRY_KEY } },
    create: { orgId, settingKey: CUSTOM_REGISTRY_KEY, valuePlain: value },
    update: { valuePlain: value },
  });
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28);
}

/** Thêm custom provider mới → trả {id,name}. Chống trùng slug bằng hậu tố -2,-3… */
export async function addCustomProvider(orgId: string, rawName: string): Promise<CustomProvider> {
  const name = (rawName || '').trim();
  if (!name) throw new Error('Tên provider không được để trống');
  if (name.length > 40) throw new Error('Tên provider tối đa 40 ký tự');
  const list = await listCustomProviders(orgId);
  if (list.length >= MAX_CUSTOM_PROVIDERS) throw new Error(`Tối đa ${MAX_CUSTOM_PROVIDERS} custom provider`);
  const base = slugify(name) || 'provider';
  const existing = new Set(list.map((p) => p.id));
  let slug = base;
  let n = 2;
  while (existing.has(`custom:${slug}`)) slug = `${base}-${n++}`;
  const id = `custom:${slug}`;
  const created = { id, name };
  await writeCustomProviders(orgId, [...list, created]);
  return created;
}

/** Đổi tên custom provider. */
export async function renameCustomProvider(orgId: string, id: string, rawName: string): Promise<void> {
  if (!isCustomProvider(id)) throw new Error(`Not a custom provider: ${id}`);
  const name = (rawName || '').trim();
  if (!name) throw new Error('Tên provider không được để trống');
  if (name.length > 40) throw new Error('Tên provider tối đa 40 ký tự');
  const list = await listCustomProviders(orgId);
  const idx = list.findIndex((p) => p.id === id);
  if (idx < 0) throw new Error('Custom provider không tồn tại');
  list[idx] = { id, name };
  await writeCustomProviders(orgId, list);
}

/** Xoá custom provider + key/baseUrl liên quan. */
export async function removeCustomProvider(orgId: string, id: string): Promise<void> {
  if (!isCustomProvider(id)) throw new Error(`Not a custom provider: ${id}`);
  const list = await listCustomProviders(orgId);
  const next = list.filter((p) => p.id !== id);
  await writeCustomProviders(orgId, next);
  await prisma.appSetting.deleteMany({
    where: { orgId, settingKey: { in: [keySettingKey(id), urlSettingKey(id)] } },
  });
}

/** Kiểm tra id có hợp lệ để chọn làm provider chính (builtin hoặc custom đã đăng ký). */
export async function isSelectableProvider(orgId: string, id: string): Promise<boolean> {
  if ((PROVIDER_IDS as readonly string[]).includes(id)) return true;
  if (!isCustomProvider(id)) return false;
  const list = await listCustomProviders(orgId);
  return list.some((p) => p.id === id);
}

/** Mask key để hiển thị UI: "••••1234" */
function maskKey(key: string): string {
  if (!key) return '';
  return `••••${key.slice(-4)}`;
}

/**
 * Resolve API key per-org theo thứ tự ưu tiên:
 *   1. DB value_encrypted (giải mã)  ← key nhập trên UI
 *   2. DB value_plain (legacy)
 *   3. env authToken (.env fallback)
 */
export async function resolveProviderApiKey(orgId: string, provider: string): Promise<string> {
  const setting = await prisma.appSetting.findUnique({
    where: { orgId_settingKey: { orgId, settingKey: keySettingKey(provider) } },
  });
  if (setting?.valueEncrypted) {
    try {
      return decryptToken(Buffer.from(setting.valueEncrypted).toString('utf8'));
    } catch (err) {
      logger.error('[ai-registry] decrypt key fail provider=%s: %s', provider, (err as Error).message);
    }
  }
  if (setting?.valuePlain) return setting.valuePlain;
  return getProviderConfig(provider)?.authToken || '';
}

/** Resolve base URL per-org: DB value_plain → env default */
export async function getProviderBaseUrl(orgId: string, provider: string): Promise<string> {
  const setting = await prisma.appSetting.findUnique({
    where: { orgId_settingKey: { orgId, settingKey: urlSettingKey(provider) } },
  });
  return setting?.valuePlain || getProviderConfig(provider)?.baseUrl || '';
}

/** Set/xoá API key per-org (apiKey rỗng/null = xoá → quay về env fallback) */
export async function setProviderApiKey(orgId: string, provider: string, apiKey: string | null): Promise<void> {
  if (!isValidProvider(provider)) throw new Error(`Unknown provider: ${provider}`);
  const settingKey = keySettingKey(provider);
  if (!apiKey) {
    await prisma.appSetting.deleteMany({ where: { orgId, settingKey } });
    return;
  }
  const blob = Buffer.from(encryptToken(apiKey), 'utf8');
  await prisma.appSetting.upsert({
    where: { orgId_settingKey: { orgId, settingKey } },
    create: { orgId, settingKey, valueEncrypted: blob },
    update: { valueEncrypted: blob, valuePlain: null },
  });
}

/** Set/xoá base URL per-org (rỗng/null = xoá → quay về env) */
export async function setProviderBaseUrl(orgId: string, provider: string, baseUrl: string | null): Promise<void> {
  if (!isValidProvider(provider)) throw new Error(`Unknown provider: ${provider}`);
  const settingKey = urlSettingKey(provider);
  const trimmed = baseUrl?.trim();
  if (!trimmed) {
    await prisma.appSetting.deleteMany({ where: { orgId, settingKey } });
    return;
  }
  await prisma.appSetting.upsert({
    where: { orgId_settingKey: { orgId, settingKey } },
    create: { orgId, settingKey, valuePlain: trimmed },
    update: { valuePlain: trimmed },
  });
}

/**
 * Danh sách provider cho UI: 5 builtin + các custom provider của org.
 * Một provider "khả dụng" khi có key (DB hoặc .env).
 */
export async function getAvailableProviders(orgId: string): Promise<ProviderInfo[]> {
  const customs = await listCustomProviders(orgId);
  const builtinDefs = catalog.map((p) => ({ id: p.id, name: p.name, isCustom: false }));
  const customDefs = customs.map((p) => ({ id: p.id, name: p.name, isCustom: true }));
  const all = [...builtinDefs, ...customDefs];
  return Promise.all(
    all.map(async (p) => {
      const [key, baseUrl] = await Promise.all([
        resolveProviderApiKey(orgId, p.id),
        getProviderBaseUrl(orgId, p.id),
      ]);
      return { id: p.id, name: p.name, baseUrl, hasKey: !!key, keyMask: maskKey(key), isCustom: p.isCustom };
    }),
  );
}
