/**
 * safe-contact-write.ts — Ghi Contact "phòng thủ" trước va chạm unique (P2002).
 *
 * Bối cảnh: cùng 1 người có thể tồn tại 2 hồ sơ (1 từ SĐT import — có phone, không
 * globalId; 1 từ Zalo — có globalId, không phone). Khi 1 luồng (tin-nhắn-đến,
 * friend-sync, lead pool) cố ghi SĐT/globalId lên hồ sơ này mà hồ sơ KIA đang giữ
 * giá trị đó → unique (org_id, phone_normalized) / (org_id, zalo_global_id) →
 * Prisma throw P2002 → văng cả thao tác (rớt tin nhắn / kẹt sync / lỗi lead pool).
 *
 * Helper này KHÔNG quyết định gộp (đó là việc của tầng dedup theo globalId). Nó chỉ
 * đảm bảo: đụng trùng thì ghi được phần an toàn / dùng lại hồ sơ sẵn có, KHÔNG văng.
 */
import { Prisma } from '@prisma/client';
import { prisma } from './prisma-client.js';
import { logger } from '../utils/logger.js';

// Các field Contact có ràng buộc unique → có thể gây P2002 khi trùng hồ sơ khác.
const UNIQUE_RISK_FIELDS = ['phone', 'phoneNormalized', 'zaloGlobalId'] as const;

export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/**
 * Update Contact an toàn. Đụng P2002 → thử lại sau khi BỎ các field unique-risk
 * (giữ tên/giới tính/avatar/lastActivity...). Không bao giờ throw P2002.
 * @returns true nếu ghi được (kể cả đã strip), false nếu phải bỏ hẳn.
 */
export async function safeContactUpdate(
  contactId: string,
  data: Record<string, unknown>,
  ctx = 'contact',
): Promise<boolean> {
  try {
    await prisma.contact.update({ where: { id: contactId }, data: data as Prisma.ContactUpdateInput });
    return true;
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const stripped: Record<string, unknown> = { ...data };
    const dropped: string[] = [];
    for (const f of UNIQUE_RISK_FIELDS) {
      if (f in stripped) { delete stripped[f]; dropped.push(f); }
    }
    logger.warn(`[safe-contact-write:${ctx}] P2002 contact=${contactId} → bỏ field trùng [${dropped.join(',')}], giữ phần còn lại`);
    if (Object.keys(stripped).length === 0) return false;
    try {
      await prisma.contact.update({ where: { id: contactId }, data: stripped as Prisma.ContactUpdateInput });
      return true;
    } catch (err2) {
      if (isUniqueViolation(err2)) {
        logger.warn(`[safe-contact-write:${ctx}] P2002 lần 2 contact=${contactId} → bỏ qua`);
        return false;
      }
      throw err2;
    }
  }
}

/**
 * Create Contact an toàn. Đụng P2002 (thường do race: worker khác vừa chèn hồ sơ
 * cùng globalId/phone) → tra lại & DÙNG LẠI hồ sơ sẵn có thay vì văng.
 * @returns row theo `select` (hồ sơ mới hoặc hồ sơ trùng đã tồn tại).
 */
export async function safeContactCreate(
  args: { data: Record<string, unknown>; select: Record<string, boolean> },
  ctx = 'contact',
): Promise<Record<string, unknown>> {
  // Gọi qua `as any`: select động làm bung generic ContactSelect (TS2321 đệ quy sâu).
  const contactModel = prisma.contact as unknown as {
    create: (a: unknown) => Promise<Record<string, unknown>>;
    findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
  };
  try {
    return await contactModel.create({ data: args.data, select: args.select });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const d = args.data;
    const orgId = d.orgId as string | undefined;
    let where: Record<string, unknown> | null = null;
    if (orgId && d.zaloGlobalId) where = { orgId, zaloGlobalId: d.zaloGlobalId };
    else if (orgId && d.phoneNormalized) where = { orgId, phoneNormalized: d.phoneNormalized, mergedInto: null };
    else if (d.phone) where = { phone: d.phone };
    if (where) {
      const existing = await contactModel.findFirst({ where, select: args.select });
      if (existing) {
        logger.warn(`[safe-contact-write:${ctx}] create P2002 → dùng lại hồ sơ sẵn có (race/trùng)`);
        return existing;
      }
    }
    throw err; // không cứu được → ném tiếp
  }
}
