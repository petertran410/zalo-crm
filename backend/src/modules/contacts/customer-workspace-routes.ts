import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { config } from '../../config/index.js';
import { prisma, tenantTransaction } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireGrant } from '../rbac/rbac-middleware.js';
import { getContactScope } from './contact-scope.js';
import { assertConversationReadAccess } from '../chat/conversation-access.js';
import { getAccessibleZaloAccountIds } from '../zalo/zalo-route-helpers.js';
import { getHisweetiePublicApiClient } from '../integrations/hisweetie-public-api-client.js';
import { assertPosOrganization } from '../pos/pos-write-policy.js';
import {
  addPosLinks, removePosLink, requireCustomer, linkedPosIds, ensureLinkedPosCustomer,
  workspaceError, summarizeDebt, CANCELLED_INVOICES,
  authoritativeBalances,
  verifiedPurchases,
  VALID_INVOICES,
} from './customer-workspace-service.js';

const bounded = (value: unknown, fallback = 0, max = 100_000) => {
  const n = Number(value ?? fallback);
  if (!Number.isSafeInteger(n) || n < 0 || n > max) throw workspaceError('Tham số phân trang không hợp lệ.');
  return n;
};
const optionalPosId = (value: unknown) => value == null || value === '' ? null : bounded(value, 0, 2_147_483_647);

export async function customerWorkspaceRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);
  app.addHook('preHandler', requireGrant('contact', 'access'));
  app.addHook('preHandler', async (request, reply) => {
    if (request.method !== 'GET') return requireGrant('contact', 'edit')(request, reply);
  });
  app.setErrorHandler((error, _request, reply) => {
    const err = error as Error & { statusCode?: number; code?: string };
    const status = err.code === 'P2002' ? 409 : err.statusCode ?? 500;
    return reply.status(status).send({ error: err.code === 'P2002' ? 'Liên kết đã thay đổi ở phiên khác. Hãy tải lại hồ sơ.' : status < 500 ? err.message : 'Không tải được dữ liệu CRM. Vui lòng thử lại.' });
  });

  app.get('/api/v1/crm/customers', async request => {
    const user = request.user!;
    const q = request.query as Record<string, string>;
    const scope = await getContactScope(user.id, user.orgId, user.role);
    const matchingShops = q.search?.trim() ? await prisma.posCustomer.findMany({
      where: { orgId: user.orgId, OR: [
        { name: { contains: q.search.trim(), mode: 'insensitive' } },
        { code: { contains: q.search.trim(), mode: 'insensitive' } },
      ] }, select: { posId: true }, take: 100,
    }) : [];
    const posLinks = q.debt === 'positive'
      ? await prisma.posSnapshot.findMany({ where: { orgId: user.orgId, resource: 'customers', payload: { path: ['totalDebt'], gt: 0 } }, select: { posId: true } })
      : null;
    const purchasing = q.purchase === 'purchased' ? await tenantTransaction(tx => tx.$queryRaw<Array<{posCustomerId:number}>>`
      SELECT DISTINCT i.pos_customer_id AS "posCustomerId" FROM pos_invoices i
      JOIN pos_snapshots s ON s.org_id=i.org_id AND s.resource='invoices' AND s.pos_id=i.pos_invoice_id
      WHERE i.org_id=${user.orgId} AND i.pos_customer_id IS NOT NULL AND i.status=ANY(${VALID_INVOICES}::text[])`) : null;
    const profileFilters: Prisma.ContactWhereInput[] = [];
    if (q.segment) profileFilters.push(q.segment === 'retail'
      ? { OR: [{ workspace: null }, { workspace: { segment: 'retail' } }] } : { workspace: { segment: q.segment } });
    if (q.potential) profileFilters.push(q.potential === 'unrated'
      ? { OR: [{ workspace: null }, { workspace: { potential: 'unrated' } }] } : { workspace: { potential: q.potential } });
    const where = {
      orgId: user.orgId, mergedInto: null, archivedAt: null,
      ...(scope.accessibleContactIds !== null ? { id: { in: scope.accessibleContactIds } } : {}),
      ...(q.search?.trim() ? { OR: [
        { fullName: { contains: q.search.trim(), mode: 'insensitive' as const } },
        { crmName: { contains: q.search.trim(), mode: 'insensitive' as const } },
        { phone: { contains: q.search.trim() } },
        { posLinks: { some: { posCustomerId: { in: matchingShops.map(p => p.posId) } } } },
      ] } : {}),
      ...(profileFilters.length ? { AND: profileFilters } : {}),
      ...(q.owner ? { assignedUserId: q.owner } : {}),
      ...((posLinks || purchasing) ? { posLinks: { some: {
        AND: [
          ...(posLinks ? [{ posCustomerId: { in: posLinks.map(row => row.posId) } }] : []),
          ...(purchasing ? [{ posCustomerId: { in: purchasing.map(row => row.posCustomerId!).filter(Boolean) } }] : []),
        ],
      } } } : {}),
      ...(q.overdue === 'true' ? { tasks: { some: { status: { notIn: ['done', 'cancelled'] }, dueAt: { lt: new Date() } } } } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.contact.findMany({
        where, skip: bounded(q.offset), take: 30, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        select: {
          id: true, fullName: true, crmName: true, avatarUrl: true, phone: true, workspace: true,
          assignedUser: { select: { id: true, fullName: true } }, _count: { select: { posLinks: true } },
        },
      }),
      prisma.contact.count({ where }),
    ]);
    return { items, total };
  });

  app.get('/api/v1/crm/staff', async request => ({
    items: await prisma.user.findMany({
      where: { orgId: request.user!.orgId, isActive: true }, select: { id: true, fullName: true }, orderBy: { fullName: 'asc' },
    }),
  }));

  app.get('/api/v1/crm/summary', async request => {
    const actor = request.user!;
    const scope = await getContactScope(actor.id, actor.orgId, actor.role);
    const where = { orgId: actor.orgId, mergedInto: null, archivedAt: null,
      ...(scope.accessibleContactIds !== null ? { id: { in: scope.accessibleContactIds } } : {}) };
    const [total, chain, wholesale, hot, overdue] = await Promise.all([
      prisma.contact.count({ where }),
      prisma.contact.count({ where: { ...where, workspace: { segment: 'chain' } } }),
      prisma.contact.count({ where: { ...where, workspace: { segment: 'wholesale' } } }),
      prisma.contact.count({ where: { ...where, workspace: { potential: 'hot' } } }),
      prisma.contact.count({ where: { ...where, tasks: { some: { status: 'open', dueAt: { lt: new Date() } } } } }),
    ]);
    return { total, retail: total - chain - wholesale, chain, wholesale, hot, overdue };
  });

  app.get('/api/v1/crm/customers/:id', async request => {
    const actor = request.user!;
    const { id } = request.params as { id: string };
    const contact = await requireCustomer(actor, id);
    const allIds = await linkedPosIds(actor.orgId, id);
    const selected = optionalPosId((request.query as { posCustomerId?: string }).posCustomerId);
    if (selected !== null) await ensureLinkedPosCustomer(actor.orgId, id, selected);
    const ids = selected === null ? allIds : [selected];
    const commerceWhere = { orgId: actor.orgId, posCustomerId: { in: ids } };
    const accountIds = await getAccessibleZaloAccountIds(actor);
    const workWhere = { orgId: actor.orgId, contactId: id,
      ...(selected !== null ? { OR: [{ posCustomerId: selected }, { posCustomerId: null }] } : {}) };
    const [accounts, invoices, debts, orders, tasks, appointments, interests, conversations, accountant, invoiceCursor, notes] = await Promise.all([
      prisma.posCustomer.findMany({ where: { orgId: actor.orgId, posId: { in: allIds } }, orderBy: { name: 'asc' } }),
      prisma.posInvoice.findMany({ where: commerceWhere, orderBy: { invoiceDate: 'desc' }, take: 50 }),
      authoritativeBalances(actor.orgId, ids),
      prisma.posOrder.findMany({ where: commerceWhere, orderBy: { orderDate: 'desc' }, take: 30 }),
      prisma.task.findMany({ where: workWhere, orderBy: { dueAt: 'asc' }, take: 30 }),
      prisma.appointment.findMany({ where: { orgId: actor.orgId, contactId: id, appointmentDate: { gte: new Date() } }, orderBy: { appointmentDate: 'asc' }, take: 20 }),
      prisma.customerProductInterest.findMany({
        where: { orgId: actor.orgId, contactId: id, isDeleted: false,
          ...(selected !== null ? { OR: [{ posCustomerId: selected }, { posCustomerId: null }] } : {}) },
        orderBy: { createdAt: 'desc' }, take: 100,
      }),
      prisma.conversation.findMany({
        where: { orgId: actor.orgId, zaloAccountId: { in: accountIds },
          OR: [{ customerLink: { contactId: id } }, { threadType: 'user', contactId: id, customerLink: null }] },
        select: { id: true, threadType: true, groupName: true, lastMessageAt: true, deletedAt: true, dissolvedAt: true, zaloAccountId: true },
        orderBy: { lastMessageAt: 'desc' },
      }),
      contact.workspace?.accountantUserId ? prisma.user.findFirst({
        where: { orgId: actor.orgId, id: contact.workspace.accountantUserId },
        select: { id: true, fullName: true },
      }) : null,
      prisma.appSetting.findUnique({ where: { orgId_settingKey: { orgId: actor.orgId, settingKey: 'crm-commerce-cursor:invoices' } } }),
      prisma.note.findMany({ where: { ...workWhere, parentNoteId: null }, orderBy: { createdAt: 'desc' }, take: 30,
        select: { id: true, body: true, createdAt: true, posCustomerId: true, author: { select: { fullName: true } } } }),
    ]);
    const purchase = await verifiedPurchases(actor.orgId, ids, !!invoiceCursor?.valuePlain);
    return {
      contact: { id, name: contact.crmName || contact.fullName, phone: contact.phone, avatarUrl: contact.avatarUrl },
      workspace: contact.workspace,
      assignedUser: contact.assignedUser, accountant,
      accounts: accounts.map(account => ({ ...account, debt: summarizeDebt(debts.filter(d => d.posCustomerId === account.posId), 1) })),
      selectedPosCustomerId: selected,
      purchase,
      debt: { ...summarizeDebt(debts, ids.length), source: 'POS', accountCount: ids.length },
      orders, invoices, tasks, appointments, interests, conversations, notes,
      meta: { commerceLimit: 50, invoicesMayBeTruncated: invoices.length === 50,
        customerWritesEnabled: process.env.CRM_POS_WRITE_ENABLED === 'true' && config.posWebhookOrgId === actor.orgId,
        draftWritesEnabled: process.env.CRM_POS_DRAFT_CONTRACT_VERIFIED === 'true' && process.env.CRM_POS_WRITE_ENABLED === 'true' && config.posWebhookOrgId === actor.orgId },
    };
  });

  app.patch('/api/v1/crm/customers/:id', { schema: { body: {
    type: 'object', additionalProperties: false, minProperties: 1, properties: {
      segment: { type: 'string', enum: ['retail', 'chain', 'wholesale'] },
      potential: { type: 'string', enum: ['unrated', 'cold', 'warm', 'hot'] },
      potentialNotes: { type: 'string', maxLength: 5000 },
      accountantUserId: { type: ['string', 'null'], maxLength: 200 },
      careStatus: { type: 'string', enum: ['active', 'paused'] },
    },
  } } }, async request => {
    const actor = request.user!;
    const { id } = request.params as { id: string };
    await requireCustomer(actor, id, true);
    const body = request.body as { segment?: string; potential?: string; potentialNotes?: string; accountantUserId?: string | null; careStatus?: string };
    for (const [key, values] of Object.entries({
      segment: ['retail', 'chain', 'wholesale'], potential: ['unrated', 'cold', 'warm', 'hot'], careStatus: ['active', 'paused'],
    })) {
      const value = body[key as keyof typeof body];
      if (value !== undefined && !values.includes(String(value))) throw workspaceError(`Giá trị ${key} không hợp lệ.`);
    }
    if (body.potentialNotes != null && (typeof body.potentialNotes !== 'string' || body.potentialNotes.length > 5000)) {
      throw workspaceError('Ghi chú tối đa 5000 ký tự.');
    }
    if (body.accountantUserId && !await prisma.user.findFirst({ where: { id: body.accountantUserId, orgId: actor.orgId, isActive: true } })) {
      throw workspaceError('Kế toán không thuộc tổ chức hoặc đã ngừng hoạt động.');
    }
    const data = {
      segment: body.segment, potential: body.potential, potentialNotes: body.potentialNotes,
      accountantUserId: body.accountantUserId, careStatus: body.careStatus,
    };
    return tenantTransaction(async tx => {
      const previous = await tx.customerWorkspace.findUnique({ where: { contactId: id } });
      const row = await tx.customerWorkspace.upsert({
        where: { contactId: id }, create: { ...data, orgId: actor.orgId, contactId: id }, update: data,
      });
      if (body.accountantUserId !== undefined && previous?.accountantUserId && previous.accountantUserId !== body.accountantUserId) {
        await tx.contactAccess.deleteMany({
          where: { orgId: actor.orgId, contactId: id, userId: previous.accountantUserId, role: 'collaborator', source: 'crm_accountant' },
        });
      }
      if (body.accountantUserId) {
        // Explicit assignment, never derived from membership in a Zalo group.
        await tx.contactAccess.upsert({
          where: { contactId_userId: { contactId: id, userId: body.accountantUserId } },
          update: {},
          create: { orgId: actor.orgId, contactId: id, userId: body.accountantUserId, role: 'collaborator', source: 'crm_accountant' },
        });
      }
      await tx.activityLog.create({ data: {
        orgId: actor.orgId, userId: actor.id, action: 'customer_workspace_updated', entityType: 'contact', entityId: id, details: data,
      } });
      return row;
    });
  });

  app.post('/api/v1/crm/customers/:id/pos-links', { schema: { body: {
    type: 'object', additionalProperties: false, required: ['posCustomerIds'], properties: {
      posCustomerIds: { type: 'array', minItems: 1, maxItems: 50, items: { type: 'integer', minimum: 1, maximum: 2147483647 } },
    },
  } } }, async request => {
    const { id } = request.params as { id: string };
    const body = request.body as { posCustomerIds?: number[] };
    if (!Array.isArray(body.posCustomerIds)) throw workspaceError('Thiếu danh sách mã POS.');
    return { items: await addPosLinks(request.user!, id, body.posCustomerIds) };
  });
  app.delete('/api/v1/crm/customers/:id/pos-links/:posId', async request => {
    const { id, posId } = request.params as { id: string; posId: string };
    await removePosLink(request.user!, id, bounded(posId, 0, 2_147_483_647));
    return { success: true };
  });

  app.get('/api/v1/crm/conversations/:id/customer', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!await assertConversationReadAccess(request, reply, id)) return;
    const conversation = await prisma.conversation.findFirst({
      where: { id, orgId: request.user!.orgId }, include: { customerLink: true },
    });
    const contactId = conversation?.customerLink?.contactId
      ?? (conversation?.threadType === 'user' ? conversation.contactId : null);
    if (contactId) await requireCustomer(request.user!, contactId);
    return { contactId, dissolvedAt: conversation?.dissolvedAt, archivedAt: conversation?.deletedAt };
  });
  app.put('/api/v1/crm/conversations/:id/customer', { schema: { body: {
    type: 'object', additionalProperties: false, required: ['contactId'], properties: { contactId: { type: 'string', minLength: 1, maxLength: 200 } },
  } } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const actor = request.user!;
    if (!await assertConversationReadAccess(request, reply, id)) return;
    const { contactId } = request.body as { contactId: string };
    await requireCustomer(actor, contactId, true);
    return tenantTransaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`crm-conversation:${actor.orgId}:${id}`}))`;
      const previous = await tx.customerConversationLink.findFirst({ where: { orgId: actor.orgId, conversationId: id } });
      if (previous && previous.contactId !== contactId) throw workspaceError('Hội thoại đã thuộc khách khác. Không tự chuyển liên kết.', 409);
      const result = await tx.customerConversationLink.upsert({
        where: { conversationId: id }, update: {},
        create: { orgId: actor.orgId, conversationId: id, contactId, createdById: actor.id },
      });
      if (!previous) await tx.activityLog.create({ data: {
        orgId: actor.orgId, userId: actor.id, action: 'customer_conversation_linked', entityType: 'contact', entityId: contactId,
        details: { conversationId: id },
      } });
      return result;
    });
  });

  app.post('/api/v1/crm/customers/:id/interests', { schema: { body: {
    type: 'object', additionalProperties: false, required: ['productName'], properties: {
      productName: { type: 'string', minLength: 1, maxLength: 300 }, notes: { type: 'string', maxLength: 5000 },
      posCustomerId: { type: 'integer', minimum: 1 }, sourceMessageId: { type: 'string', minLength: 1, maxLength: 200 },
    },
  } } }, async (request, reply) => {
    const actor = request.user!;
    const { id } = request.params as { id: string };
    const contact = await requireCustomer(actor, id, true);
    const body = request.body as { productName: string; notes?: string; posCustomerId?: number; sourceMessageId?: string };
    if (typeof body.productName !== 'string' || !body.productName.trim() || body.productName.length > 300) throw workspaceError('Tên sản phẩm tối đa 300 ký tự.');
    if (body.notes && (typeof body.notes !== 'string' || body.notes.length > 5000)) throw workspaceError('Ghi chú quá dài.');
    if (body.posCustomerId != null) await ensureLinkedPosCustomer(actor.orgId, id, body.posCustomerId);
    if (body.sourceMessageId) {
      const message = await prisma.message.findFirst({
        where: { id: body.sourceMessageId, conversation: { orgId: actor.orgId,
          OR: [{ customerLink: { contactId: id } }, { contactId: id, threadType: 'user' }] } },
      });
      if (!message || !await assertConversationReadAccess(request, reply, message.conversationId)) {
        if (!reply.sent) throw workspaceError('Tin nhắn không thuộc khách hàng.', 404);
        return;
      }
    }
    return prisma.customerProductInterest.create({ data: {
      orgId: actor.orgId, contactId: id, customerName: contact.crmName || contact.fullName,
      productName: body.productName.trim(), notes: body.notes?.trim(), posCustomerId: body.posCustomerId,
      sourceMessageId: body.sourceMessageId, origin: 'manual', scannedByUserId: actor.id,
    } });
  });

  app.get('/api/v1/crm/customers/:id/ledger/:posId', async request => {
    const actor = request.user!;
    const { id, posId } = request.params as { id: string; posId: string };
    await requireCustomer(actor, id);
    const customerId = bounded(posId, 0, 2_147_483_647);
    await ensureLinkedPosCustomer(actor.orgId, id, customerId);
    const q = request.query as { offset?: string };
    assertPosOrganization(actor.orgId);
    const result = await getHisweetiePublicApiClient().getCustomerLedger(customerId, bounded(q.offset), 30);
    return { ...result, source: 'POS', fetchedAt: new Date().toISOString() };
  });

  app.get('/api/v1/crm/customers/:id/addresses/:posId', async request => {
    const actor = request.user!;
    const { id, posId } = request.params as { id: string; posId: string };
    await requireCustomer(actor, id);
    const customerId = bounded(posId, 0, 2_147_483_647);
    await ensureLinkedPosCustomer(actor.orgId, id, customerId);
    assertPosOrganization(actor.orgId);
    const response = await getHisweetiePublicApiClient().getCustomerAddresses(customerId);
    const rows = Array.isArray(response) ? response : (response as { data?: any[] })?.data;
    return { defaultAddress: rows?.find((row: any) => row.isDefault === true)?.address ?? null };
  });

  app.get('/api/v1/crm/customers/:id/documents/:kind/:documentId', async request => {
    const actor = request.user!;
    const { id, kind, documentId } = request.params as { id: string; kind: string; documentId: string };
    await requireCustomer(actor, id);
    const ids = await linkedPosIds(actor.orgId, id);
    const where = { id: documentId, orgId: actor.orgId, posCustomerId: { in: ids } };
    let remoteId: number | undefined;
    if (kind === 'orders') remoteId = (await prisma.posOrder.findFirst({ where }))?.posOrderId;
    else if (kind === 'invoices') remoteId = (await prisma.posInvoice.findFirst({ where }))?.posInvoiceId;
    else throw workspaceError('Loại chứng từ không hợp lệ.');
    if (!remoteId) throw workspaceError('Không tìm thấy chứng từ của khách hàng.', 404);
    const snapshot = await prisma.posSnapshot.findUnique({
      where: { orgId_resource_posId: { orgId: actor.orgId, resource: kind, posId: remoteId } },
    });
    return { state: snapshot ? 'available' : 'unknown', document: snapshot?.payload ?? null, source: 'POS', updatedAt: snapshot?.receivedAt ?? null };
  });

  app.get('/api/v1/crm/customers/:id/journey', async request => {
    const actor = request.user!;
    const { id } = request.params as { id: string };
    await requireCustomer(actor, id);
    const q = request.query as { offset?: string; posCustomerId?: string; until?: string };
    const offset = bounded(q.offset);
    const until = q.until ? new Date(q.until) : new Date();
    if (!Number.isFinite(until.getTime())) throw workspaceError('Mốc thời gian không hợp lệ.');
    let ids = await linkedPosIds(actor.orgId, id);
    const selected = optionalPosId(q.posCustomerId);
    if (selected !== null) { await ensureLinkedPosCustomer(actor.orgId, id, selected); ids = [selected]; }
    // Bounded snapshot, global pagination across all event sources, deterministic tie breaking.
    const rows = await tenantTransaction(tx => tx.$queryRaw<Array<{ key: string; type: string; title: string; occurredAt: Date; posCustomerId: number | null; source: string }>>`
      SELECT * FROM (
        SELECT 'activity:' || id AS key, 'activity' AS type, action AS title, created_at AS "occurredAt",
          NULL::integer AS "posCustomerId", 'CRM' AS source
          FROM activity_logs WHERE org_id=${actor.orgId} AND entity_id=${id} AND entity_type='contact'
        UNION ALL
        SELECT 'order:' || id, 'order', code, order_date, pos_customer_id, 'POS'
          FROM pos_orders WHERE org_id=${actor.orgId} AND pos_customer_id=ANY(${ids}::integer[])
        UNION ALL
        SELECT 'invoice:' || id, 'invoice', invoice_code || ' · ' || status, invoice_date, pos_customer_id, 'POS'
          FROM pos_invoices WHERE org_id=${actor.orgId} AND pos_customer_id=ANY(${ids}::integer[])
        UNION ALL
        SELECT 'interest:' || id, 'interest', product_name, created_at, pos_customer_id, 'CRM'
          FROM customer_product_interests WHERE org_id=${actor.orgId} AND contact_id=${id}
            AND (${selected}::integer IS NULL OR pos_customer_id IS NULL OR pos_customer_id=${selected})
        UNION ALL
        SELECT 'note:' || id, 'note', body, created_at, pos_customer_id, 'CRM'
          FROM notes WHERE org_id=${actor.orgId} AND contact_id=${id}
            AND (${selected}::integer IS NULL OR pos_customer_id IS NULL OR pos_customer_id=${selected})
        UNION ALL
        SELECT 'snapshot:' || resource || ':' || pos_id, 'pos_update',
          CASE WHEN resource='return-orders' THEN 'Cập nhật trả hàng' ELSE 'Cập nhật dòng tiền' END
          || ' · ' || COALESCE(payload->>'code', pos_id::text),
          source_updated_at, NULL::integer, 'POS'
          FROM pos_snapshots WHERE org_id=${actor.orgId} AND resource IN ('return-orders','cashflows')
            AND payload->>'customerId'=ANY(${ids.map(String)}::text[])
      ) events WHERE "occurredAt"<=${until}
      ORDER BY "occurredAt" DESC, key ASC LIMIT 31 OFFSET ${offset}`);
    return { items: rows.slice(0, 30), nextOffset: rows.length > 30 ? offset + 30 : null, until: until.toISOString() };
  });
}
