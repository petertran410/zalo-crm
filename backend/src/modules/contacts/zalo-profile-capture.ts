/**
 * zalo-profile-capture.ts — NGUỒN CHÂN LÝ lưu hồ sơ Zalo (SDK → Friend + Contact). Đợt 1 của
 * plans/zalo-sdk-data-capture-audit-20260622.md (anh chốt + eng-review 2026-06-22).
 *
 * Gốc bug: ~13 điểm gọi SDK, mỗi điểm tự lấy vài trường → data Zalo cho-sẵn (tên/giới tính/
 * ngày sinh/avatar/globalId/username/SĐT công khai) rớt lúc-có-lúc-không. Mọi đường nay chuẩn-hoá
 * profile rồi gọi captureZaloProfile → 1 chỗ lưu đủ, nhất quán.
 *
 * AN TOÀN (theo review):
 *  - Hàm chung nhận profile ĐÃ chuẩn-hoá (3 adapter unwrap shape SDK riêng — getUserInfo lồng /
 *    getAllFriends phẳng / findUser phẳng-không-dob).
 *  - fill-KHÔNG-đè: chỉ điền field trống; KHÔNG đè giá trị sale sửa tay (full_name đã có,
 *    gender khi gender_locked). diff: chỉ ghi khi thực đổi.
 *  - globalId vào Contact qua guard NOT-EXISTS (chống P2002 trên @@unique(org, zalo_global_id)
 *    → chống tái-sinh bug DROP tin). Tái dùng đúng guard của friend-sync-service.
 *  - Không throw (best-effort) — lỗi capture không được làm hỏng luồng chính.
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { normalizePhone } from '../../shared/utils/phone.js';
import { mapGender, parseBirthDate } from './contact-profile-sync-cron.js';

export interface NormalizedZaloProfile {
  uid: string;
  zaloName?: string | null;
  avatar?: string | null;
  globalId?: string | null;
  username?: string | null;
  gender?: unknown;          // raw 0/1 từ SDK
  sdob?: unknown;            // 'DD/MM/YYYY' | 'YYYY-MM-DD'
  dob?: unknown;             // timestamp giây/ms
  phoneNumber?: string | null; // SĐT công khai (chỉ có khi KH bật công khai)
  // Đợt 2b (verify raw 2026-06-22) — chỉ getUserInfo trả; getAllFriends/findUser thường không.
  status?: string | null;        // trạng thái/bio Zalo (profile.status)
  cover?: string | null;         // ảnh bìa (profile.cover)
  isExtensionAccount?: unknown;  // cờ KH doanh nghiệp (raw — coerce ở capture; bizPkg là object, KHÔNG dùng)
  lastActionTime?: unknown;       // timestamp hoạt động cuối (number)
}

const pick = (v: unknown): string | null => {
  const s = String(v ?? '').trim();
  return s || null;
};

// Đợt 2b — 4 field mở rộng (chỉ getUserInfo trả; getAllFriends/findUser thường absent → null/undefined).
const extra2b = (p: Record<string, unknown>) => ({
  status: pick(p.status),
  cover: pick(p.cover),
  isExtensionAccount: p.isExtensionAccount,
  lastActionTime: p.lastActionTime,
});

/** Timestamp Zalo (giây hoặc ms) → Date. Loại giá trị rác (ngoài 2010-2100). */
function parseZaloTs(v: unknown): Date | null {
  const n = Number(v ?? 0);
  if (!n || !Number.isFinite(n)) return null;
  const ms = n > 1e11 ? n : n * 1000; // >1e11 ⇒ đã là ms; nhỏ hơn ⇒ giây
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  return y >= 2010 && y <= 2100 ? d : null;
}

// ── 3 ADAPTER: unwrap shape SDK → NormalizedZaloProfile ─────────────────────

/** getUserInfo → result.changed_profiles[uid] | [uid+'_0'] (shape lồng). */
export function fromGetUserInfo(result: unknown, uid: string): NormalizedZaloProfile | null {
  const profiles = (result as { changed_profiles?: Record<string, unknown> })?.changed_profiles || {};
  const p = (profiles[uid] || profiles[`${uid}_0`]) as Record<string, unknown> | undefined;
  if (!p) return null;
  return {
    uid,
    zaloName: pick(p.zaloName ?? p.zalo_name ?? p.displayName ?? p.display_name),
    avatar: pick(p.avatar),
    globalId: pick(p.globalId),
    username: pick(p.username),
    gender: p.gender ?? null,
    sdob: p.sdob ?? null, dob: p.dob ?? null,
    phoneNumber: pick(p.phoneNumber),
    ...extra2b(p),
  };
}

/** getAllFriends → object phẳng (mảng). */
export function fromGetAllFriends(raw: Record<string, unknown>): NormalizedZaloProfile | null {
  const uid = String((raw.userId ?? raw.uid ?? '') as string).trim();
  if (!uid) return null;
  return {
    uid,
    zaloName: pick(raw.zaloName ?? raw.displayName ?? raw.display_name),
    avatar: pick(raw.avatar),
    globalId: pick(raw.globalId),
    username: pick(raw.username),
    gender: raw.gender ?? null,
    sdob: raw.sdob ?? null, dob: raw.dob ?? null,
    phoneNumber: pick(raw.phoneNumber),
    ...extra2b(raw),
  };
}

/** findUser → phẳng. Tên ở snake_case lúc runtime (display_name/zalo_name). Thường KHÔNG có dob. */
export function fromFindUser(raw: unknown): NormalizedZaloProfile | null {
  const p = (raw as Record<string, unknown>) || {};
  const uid = String((p.uid ?? p.userId ?? '') as string).trim();
  if (!uid) return null;
  return {
    uid,
    zaloName: pick(p.display_name ?? p.zalo_name ?? p.displayName ?? p.zaloName),
    avatar: pick(p.avatar),
    globalId: pick(p.globalId),
    username: pick(p.username),
    gender: p.gender ?? null,
    sdob: p.sdob ?? null, dob: p.dob ?? null,    // findUser thường ko có dob → null
    phoneNumber: pick(p.phoneNumber),
    ...extra2b(p),
  };
}

/**
 * Tính patch capture SĐT công khai Zalo vào Contact (phone → phone2 → phone3 → phonesExtra) +
 * provenance metadata.zaloPublicPhones. Chống trùng (normalize), KHÔNG đè phone chính. Trả {}
 * nếu trùng số đã có / không có số. Pure — dùng chung captureZaloProfile + friend-sync (DRY).
 */
export function buildPhoneCapturePatch(
  c: { phone?: string | null; phone2?: string | null; phone3?: string | null; phonesExtra?: unknown; metadata?: unknown },
  phoneNumber: string | null | undefined,
): Record<string, unknown> {
  const zNorm = normalizePhone(phoneNumber ?? '');
  if (!zNorm) return {};
  const extra = Array.isArray(c.phonesExtra) ? (c.phonesExtra as Array<{ phone?: string }>) : [];
  const have = new Set(
    [c.phone, c.phone2, c.phone3, ...extra.map((x) => x?.phone)]
      .map((x) => normalizePhone(x ?? '')).filter(Boolean) as string[],
  );
  if (have.has(zNorm)) return {};
  const rawPhone = (phoneNumber ?? '').trim() || zNorm;
  const patch: Record<string, unknown> = {};
  if (!c.phone) { patch.phone = rawPhone; patch.phoneNormalized = zNorm; }
  else if (!c.phone2) patch.phone2 = rawPhone;
  else if (!c.phone3) patch.phone3 = rawPhone;
  else patch.phonesExtra = [...extra, { phone: rawPhone, label: 'zalo_public' }];
  // Provenance: số Zalo công khai CHƯA verify (sale tự xác minh), bất kể vào ô nào.
  const meta = (c.metadata && typeof c.metadata === 'object' ? c.metadata : {}) as Record<string, unknown>;
  const zpub = Array.isArray(meta.zaloPublicPhones) ? (meta.zaloPublicPhones as string[]) : [];
  if (!zpub.includes(zNorm)) patch.metadata = { ...meta, zaloPublicPhones: [...zpub, zNorm] };
  return patch;
}

// ── CAPTURE ─────────────────────────────────────────────────────────────────

/**
 * Lưu profile vào Friend (per-nick) + Contact (cấp người). Best-effort, không throw.
 * contactId null → tự suy từ Friend row (nick, uid); vẫn null → bỏ phần Contact.
 */
export async function captureZaloProfile(
  p: NormalizedZaloProfile | null,
  ctx: { orgId: string; contactId: string | null; nickId: string },
): Promise<void> {
  if (!p || !p.uid) return;
  const { orgId, nickId } = ctx;
  try {
    // 1. FRIEND (per-nick) — fill-không-đè + diff. Khoá (nick, uid).
    const friend = await prisma.friend.findFirst({
      where: { zaloAccountId: nickId, zaloUidInNick: p.uid },
      select: { id: true, contactId: true, zaloDisplayName: true, zaloAvatarUrl: true, zaloGlobalId: true, zaloUsername: true },
    });
    const cid = ctx.contactId ?? friend?.contactId ?? null;
    if (friend) {
      const patch: Record<string, string> = {};
      if (p.zaloName && !friend.zaloDisplayName) patch.zaloDisplayName = p.zaloName;
      if (p.avatar && !friend.zaloAvatarUrl) patch.zaloAvatarUrl = p.avatar;
      if (p.globalId && !friend.zaloGlobalId) patch.zaloGlobalId = p.globalId;
      if (p.username && !friend.zaloUsername) patch.zaloUsername = p.username;
      if (Object.keys(patch).length) await prisma.friend.update({ where: { id: friend.id }, data: patch });
    }
    if (!cid) return;

    // 2. CONTACT name/globalId(guard P2002)/username/avatar — backfill từ Friend rows của contact.
    //    Tái dùng guard NOT-EXISTS của friend-sync-service, scoped 1 contact.
    await prisma.$executeRaw`
      UPDATE contacts SET
        full_name = COALESCE(NULLIF(NULLIF(contacts.full_name, ''), 'Unknown'), sub.f_name, contacts.full_name),
        zalo_global_id = CASE
          WHEN (contacts.zalo_global_id IS NULL OR contacts.zalo_global_id = '') AND sub.f_global_id IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM contacts c2
              WHERE c2.org_id = contacts.org_id AND c2.id <> contacts.id AND c2.zalo_global_id = sub.f_global_id
            )
          THEN sub.f_global_id ELSE contacts.zalo_global_id END,
        zalo_username = COALESCE(contacts.zalo_username, sub.f_username),
        avatar_url = COALESCE(contacts.avatar_url, sub.f_avatar),
        has_zalo = TRUE
      FROM (
        SELECT DISTINCT ON (f.contact_id)
          f.contact_id, f.zalo_display_name AS f_name, f.zalo_global_id AS f_global_id,
          f.zalo_username AS f_username, f.zalo_avatar_url AS f_avatar
        FROM friends f
        WHERE f.contact_id = ${cid}
          AND (f.zalo_display_name IS NOT NULL AND f.zalo_display_name <> '' AND f.zalo_display_name <> 'Unknown'
            OR f.zalo_global_id IS NOT NULL AND f.zalo_global_id <> ''
            OR f.zalo_username IS NOT NULL AND f.zalo_username <> ''
            OR f.zalo_avatar_url IS NOT NULL AND f.zalo_avatar_url <> '')
        ORDER BY f.contact_id, f.updated_at DESC
      ) sub
      WHERE contacts.id = sub.contact_id AND contacts.org_id = ${orgId}`;

    // 3. CONTACT demographic (gender !locked null-only, birthDate null-only) + SĐT công khai.
    const c = await prisma.contact.findUnique({
      where: { id: cid },
      select: {
        gender: true, genderLocked: true, birthDate: true,
        phone: true, phone2: true, phone3: true, phonesExtra: true, metadata: true,
        zaloStatus: true, zaloCoverUrl: true, isBusinessAccount: true, zaloLastActiveAt: true,
      },
    });
    if (!c) return;
    const data: Record<string, unknown> = {};
    if (c.gender == null && !c.genderLocked) { const g = mapGender(p.gender); if (g) data.gender = g; }
    if (c.birthDate == null) {
      const bd = parseBirthDate(p.sdob, p.dob);
      if (bd) { data.birthDate = bd; data.birthYear = bd.getUTCFullYear(); }
    }

    // Đợt 2b — 4 field mở rộng (getUserInfo). status=mới-nhất (bio đổi theo thời gian); cover/business
    // =fill-khi-trống; lastActive=GREATEST (luôn giữ mốc mới nhất). Coerce business an toàn (bizPkg là object).
    if (p.status && p.status !== c.zaloStatus) data.zaloStatus = p.status;
    if (p.cover && !c.zaloCoverUrl) data.zaloCoverUrl = p.cover;
    if (c.isBusinessAccount == null) {
      const b = p.isExtensionAccount;
      const bv = (b === true || b === 1) ? true : (b === false || b === 0) ? false : null;
      if (bv !== null) data.isBusinessAccount = bv;
    }
    const la = parseZaloTs(p.lastActionTime);
    if (la && (!c.zaloLastActiveAt || la > c.zaloLastActiveAt)) data.zaloLastActiveAt = la;

    // 3b. SĐT công khai → phone/phone2/phone3/phonesExtra (helper chung, dùng lại ở friend-sync).
    Object.assign(data, buildPhoneCapturePatch(c, p.phoneNumber));

    if (Object.keys(data).length) await prisma.contact.update({ where: { id: cid }, data });
  } catch (err) {
    logger.warn(`[zalo-capture] best-effort failed nick=${nickId} contact=${ctx.contactId} uid=${p.uid}: ${(err as Error)?.message}`);
  }
}
