import { prisma, tenantTransaction } from '../../shared/database/prisma-client.js';
import { assertContactEditable, assertContactVisible } from './contact-scope.js';
import { getHisweetiePublicApiClient } from '../integrations/hisweetie-public-api-client.js';
import { assertPosOrganization } from '../pos/pos-write-policy.js';
import { userHasGrant } from '../rbac/permission-group-service.js';

export type WorkspaceActor = { id: string; orgId: string; role: string };
export const CANCELLED_INVOICES = ['Đã hủy', 'Đã huỷ', 'Cancelled', 'Canceled', 'Void', 'Replaced'];
export const VALID_INVOICES = ['Đang xử lý', 'Hoàn thành', 'Giao thành công', 'Đã giao hàng', 'Paid', 'Unpaid', 'Partial', 'Overdue', 'Processing', 'Completed'];

export function purchaseSummary(statuses: string[], complete: boolean, accountCount: number) {
  const validInvoiceCount = statuses.filter(status => VALID_INVOICES.includes(status)).length;
  const unknown = statuses.some(status => !VALID_INVOICES.includes(status) && !CANCELLED_INVOICES.includes(status));
  return {
    state: validInvoiceCount > 0 ? 'purchased' : complete && accountCount > 0 && !unknown ? 'not_purchased' : 'unknown',
    validInvoiceCount,
  };
}

export function workspaceError(message: string, statusCode = 400): Error {
  return Object.assign(new Error(message), { statusCode, code: statusCode === 400 ? 'CRM_VALIDATION' : undefined });
}

export async function requireCustomer(actor: WorkspaceActor, contactId: string, edit = false) {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, orgId: actor.orgId, mergedInto: null, archivedAt: null },
    include: { workspace: true, assignedUser: { select: { id: true, fullName: true } } },
  });
  if (!contact || !await assertContactVisible({
    userId: actor.id, orgId: actor.orgId, legacyRole: actor.role, contactId,
  })) throw workspaceError('Không tìm thấy khách hàng trong phạm vi của bạn.', 404);
  if (!await userHasGrant(actor.id, 'contact', edit ? 'edit' : 'access')) {
    throw workspaceError('Không có quyền thao tác hồ sơ khách hàng.', 403);
  }
  if (edit) await assertContactEditable({
    userId: actor.id, orgId: actor.orgId, legacyRole: actor.role, contactId,
  });
  return contact;
}

export async function linkedPosIds(orgId: string, contactId: string): Promise<number[]> {
  const links = await prisma.contactPosLink.findMany({
    where: { orgId, contactId }, select: { posCustomerId: true },
  });
  // Legacy is deliberately not a fallback: ambiguous migration rows must be reviewed.
  return links.map((link) => link.posCustomerId);
}

export async function ensureLinkedPosCustomer(orgId: string, contactId: string, posCustomerId: number) {
  if (!Number.isSafeInteger(posCustomerId) || posCustomerId <= 0
    || !await prisma.contactPosLink.findFirst({ where: { orgId, contactId, posCustomerId } })) {
    throw workspaceError('Hãy chọn một mã POS đã liên kết với khách hàng này.', 409);
  }
}

export async function validateWorkContext(
  orgId: string, contactId: string | null, posCustomerId?: number | null, conversationId?: string | null,
) {
  if (posCustomerId != null) {
    if (!contactId) throw workspaceError('Công việc theo quán cần hồ sơ khách hàng.');
    await ensureLinkedPosCustomer(orgId, contactId, posCustomerId);
  }
  if (conversationId) {
    const conversation = await prisma.conversation.findFirst({
      where: { orgId, id: conversationId, OR: [
        { customerLink: { contactId: contactId ?? '' } },
        { threadType: 'user', contactId: contactId ?? '', customerLink: null },
      ] }, select: { id: true },
    });
    if (!conversation) throw workspaceError('Hội thoại không thuộc khách hàng này.', 404);
  }
}

export async function cachePosCustomer(orgId: string, posCustomerId: number) {
  const existing = await prisma.posCustomer.findFirst({ where: { orgId, posId: posCustomerId } });
  if (existing) return existing;
  assertPosOrganization(orgId);
  const response = await getHisweetiePublicApiClient().getCustomer(posCustomerId);
  const row = (response.data ?? response) as Record<string, unknown>;
  if (Number(row.id) !== posCustomerId || typeof row.name !== 'string' || !row.name.trim()) {
    throw workspaceError('Không xác minh được hồ sơ khách hàng POS.', 502);
  }
  return prisma.posCustomer.upsert({
    where: { posId_orgId: { posId: posCustomerId, orgId } },
    update: {},
    create: {
      orgId, posId: posCustomerId, name: row.name,
      code: typeof row.code === 'string' ? row.code : null,
      phone: typeof row.contactNumber === 'string' ? row.contactNumber : null,
      address: typeof row.address === 'string' ? row.address : null,
    },
  });
}

export async function addPosLinks(actor: WorkspaceActor, contactId: string, ids: number[]) {
  await requireCustomer(actor, contactId, true);
  if (!Array.isArray(ids)) throw workspaceError('Danh sách mã POS không hợp lệ.');
  const unique = [...new Set(ids)].sort((a, b) => a - b);
  if (!unique.length || unique.length > 50 || unique.some(id => !Number.isSafeInteger(id) || id <= 0)) {
    throw workspaceError('Danh sách mã POS không hợp lệ (tối đa 50).');
  }
  for (const id of unique) await cachePosCustomer(actor.orgId, id);
  return tenantTransaction(async tx => {
    // Serialize link changes per organization, including compatibility endpoints.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`crm-links:${actor.orgId}`}))`;
    const [links, legacy] = await Promise.all([
      tx.contactPosLink.findMany({ where: { orgId: actor.orgId, posCustomerId: { in: unique }, contactId: { not: contactId } } }),
      tx.contact.findMany({
        where: { orgId: actor.orgId, posCustomerId: { in: unique }, id: { not: contactId }, mergedInto: null },
        select: { id: true },
      }),
    ]);
    if (links.length || legacy.length) throw workspaceError('Một mã POS đã thuộc hồ sơ CRM khác. Không có liên kết nào được thay đổi.', 409);
    for (const posCustomerId of unique) {
      await tx.contactPosLink.upsert({
        where: { orgId_posCustomerId: { orgId: actor.orgId, posCustomerId } },
        update: {},
        create: { orgId: actor.orgId, contactId, posCustomerId, createdById: actor.id },
      });
    }
    await tx.activityLog.create({ data: {
      orgId: actor.orgId, userId: actor.id, action: 'pos_link', entityType: 'contact', entityId: contactId,
      details: { posCustomerIds: unique, method: 'manual' },
    } });
    return tx.contactPosLink.findMany({ where: { orgId: actor.orgId, contactId } });
  });
}

export async function removePosLink(actor: WorkspaceActor, contactId: string, posCustomerId: number) {
  await requireCustomer(actor, contactId, true);
  return tenantTransaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`crm-links:${actor.orgId}`}))`;
    await tx.contactPosLink.deleteMany({ where: { orgId: actor.orgId, contactId, posCustomerId } });
    // Legacy associations must not leak commerce after a link is removed.
    await tx.contact.updateMany({
      where: { orgId: actor.orgId, id: contactId, posCustomerId },
      data: { posCustomerId: null, posCustomerCode: null },
    });
    await tx.posOrder.updateMany({ where: { orgId: actor.orgId, contactId, posCustomerId }, data: { contactId: null } });
    await tx.posInvoice.updateMany({ where: { orgId: actor.orgId, contactId, posCustomerId }, data: { contactId: null } });
    await tx.posCustomerDebt.updateMany({ where: { orgId: actor.orgId, contactId, posCustomerId }, data: { contactId: null } });
    await tx.activityLog.create({ data: {
      orgId: actor.orgId, userId: actor.id, action: 'pos_unlink', entityType: 'contact', entityId: contactId,
      details: { posCustomerId },
    } });
  });
}

export function summarizeDebt(rows: Array<{ totalDebt: number; lastSyncedAt: Date }>, expected: number) {
  if (!expected || rows.length !== expected || rows.some(row => !Number.isFinite(row.totalDebt))) {
    return { amount: null, state: 'unknown', updatedAt: null };
  }
  const oldest = new Date(Math.min(...rows.map(row => row.lastSyncedAt.getTime())));
  return {
    amount: rows.reduce((sum, row) => sum + row.totalDebt, 0),
    state: Date.now() - oldest.getTime() > 15 * 60_000 ? 'stale' : 'available',
    updatedAt: oldest.toISOString(),
  };
}

export async function authoritativeBalances(orgId: string, ids: number[]) {
  const completed = await prisma.appSetting.findUnique({
    where: { orgId_settingKey: { orgId, settingKey: 'crm-commerce-last-success:customers' } },
  });
  const lastCompleted = completed?.valuePlain ? Date.parse(completed.valuePlain) : 0;
  const snapshots = await prisma.posSnapshot.findMany({
    where: { orgId, resource: 'customers', posId: { in: ids } },
  });
  return snapshots.flatMap(snapshot => {
    const payload = snapshot.payload as Record<string, unknown>;
    return typeof payload.totalDebt === 'number' && Number.isFinite(payload.totalDebt)
      ? [{ posCustomerId: snapshot.posId, totalDebt: payload.totalDebt,
        lastSyncedAt: new Date(Math.max(snapshot.receivedAt.getTime(), Number.isFinite(lastCompleted) ? lastCompleted : 0)) }]
      : [];
  });
}

export async function verifiedPurchases(orgId: string, ids: number[], complete: boolean) {
  const rows = await prisma.posInvoice.findMany({
    where: { orgId, posCustomerId: { in: ids } }, select: { posInvoiceId: true, status: true },
  });
  const snapshots = await prisma.posSnapshot.findMany({
    where: { orgId, resource: 'invoices', posId: { in: rows.map(row => row.posInvoiceId) } }, select: { posId: true },
  });
  const verified = new Set(snapshots.map(row => row.posId));
  return purchaseSummary(rows.map(row => verified.has(row.posInvoiceId) ? row.status : 'Unknown'), complete, ids.length);
}
