/**
 * group-routes.ts — Group info, CRUD, and membership management.
 * Routes: /api/v1/zalo-accounts/:accountId/groups
 */
import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { zaloOps } from '../../shared/zalo-operations.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { getContactScope } from '../contacts/contact-scope.js';
import { resolveAccount, checkAccess, handleError } from './zalo-route-helpers.js';

export async function groupRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  const BASE = '/api/v1/zalo-accounts/:accountId/groups';

  // ── Group Info ──────────────────────────────────────────────────────────────

  app.get<{ Params: { accountId: string } }>(BASE, async (request, reply) => {
    const { accountId } = request.params;
    try {
      await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'read'))) return;
      // zca-js getAllGroups() trả OBJECT { gridVerMap:{id:ver}, gridInfoMap:{id:{...}} },
      // KHÔNG phải mảng. Trước đây trả thẳng object này → FE (group-list.vue,
      // chatbot listGroups) làm Array.isArray → false → danh sách nhóm luôn rỗng.
      // Chuẩn hoá thành mảng [{id,name,totalMember}]: gridVerMap là nguồn ID đầy đủ.
      type GInfo = { name?: string; groupName?: string; totalMember?: number; memberCount?: number; memVerList?: unknown[] };
      const raw = (await zaloOps.getAllGroups(accountId)) as {
        gridVerMap?: Record<string, unknown>;
        gridInfoMap?: Record<string, GInfo>;
      } | null;
      const verMap = raw?.gridVerMap ?? {};
      const infoMap: Record<string, GInfo> = { ...(raw?.gridInfoMap ?? {}) };
      const ids = Object.keys(verMap).length ? Object.keys(verMap) : Object.keys(infoMap);

      // getAllGroups thường KHÔNG kèm tên nhóm (gridInfoMap rỗng/thiếu name) → phải
      // bù bằng getGroupInfo (nhận mảng id, trả gridInfoMap có name + totalMember).
      // Chunk 50 id/call để tránh request quá lớn bị Zalo từ chối.
      const missing = ids.filter((id) => !(infoMap[id]?.name || infoMap[id]?.groupName));
      for (let i = 0; i < missing.length; i += 50) {
        const chunk = missing.slice(i, i + 50);
        try {
          const more = (await zaloOps.getGroupInfo(accountId, chunk)) as { gridInfoMap?: Record<string, GInfo> };
          Object.assign(infoMap, more?.gridInfoMap ?? {});
        } catch { /* giữ id, tên để trống — vẫn gán bot được */ }
      }

      const groups = ids.map((id) => {
        const g = infoMap[id] ?? {};
        return {
          id,
          name: g.name || g.groupName || '',
          totalMember:
            g.totalMember ?? g.memberCount ?? (Array.isArray(g.memVerList) ? g.memVerList.length : 0),
        };
      });
      return { groups };
    } catch (err) { return handleError(reply, err, 'getAllGroups'); }
  });

  app.get<{ Params: { accountId: string; groupId: string } }>(`${BASE}/:groupId`, async (request, reply) => {
    const { accountId, groupId } = request.params;
    try {
      await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'read'))) return;
      return { group: await zaloOps.getGroupInfo(accountId, groupId) };
    } catch (err) { return handleError(reply, err, 'getGroupInfo'); }
  });

  app.get<{ Params: { accountId: string; groupId: string } }>(`${BASE}/:groupId/members`, async (request, reply) => {
    const { accountId, groupId } = request.params;
    try {
      await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'read'))) return;
      // 1) getGroupInfo → memVerList ("uid_ver"); 2) getGroupMembersInfo(uids) → profile.
      const info = await zaloOps.getGroupInfo(accountId, groupId) as any;
      const grid = info?.gridInfoMap?.[groupId] ?? Object.values(info?.gridInfoMap ?? {})[0];
      const rawIds: string[] = Array.isArray(grid?.memVerList) ? grid.memVerList : [];
      const uids = [...new Set(rawIds.map((k) => String(k).split('_')[0]).filter(Boolean))];
      if (uids.length === 0) return { members: [] };
      const profiles: Record<string, any> = {};
      for (let i = 0; i < uids.length; i += 50) {
        const prof = await zaloOps.getGroupMembersInfo(accountId, uids.slice(i, i + 50)) as any;
        Object.assign(profiles, prof?.profiles ?? {});
      }
      const [stored, friends, employeeAccounts, scope] = await Promise.all([
        prisma.groupMember.findMany({
          where: { orgId: request.user!.orgId, zaloAccountId: accountId, groupId, memberUid: { in: uids } },
          select: { memberUid: true, displayName: true, zaloName: true, avatarUrl: true },
        }),
        prisma.friend.findMany({
          where: { orgId: request.user!.orgId, zaloAccountId: accountId, zaloUidInNick: { in: uids } },
          select: { zaloUidInNick: true, contactId: true },
        }),
        prisma.zaloAccount.findMany({
          where: { orgId: request.user!.orgId, zaloUid: { in: uids } },
          select: { zaloUid: true },
        }),
        getContactScope(request.user!.id, request.user!.orgId, request.user!.role),
      ]);
      const storedByUid = new Map(stored.map((member) => [member.memberUid, member]));
      const contactByUid = new Map(friends.map((friend) => [friend.zaloUidInNick, friend.contactId]));
      const employeeUids = new Set(employeeAccounts.map((account) => account.zaloUid));
      const accessibleIds = scope.accessibleContactIds === null ? null : new Set(scope.accessibleContactIds);
      const contactIds = [...new Set(friends.map((friend) => friend.contactId))]
        .filter((id) => accessibleIds === null || accessibleIds.has(id));
      const contacts = contactIds.length ? await prisma.contact.findMany({
        where: { orgId: request.user!.orgId, id: { in: contactIds }, archivedAt: null },
        select: { id: true, phoneNormalized: true, posCustomerId: true, posCustomerCode: true },
      }) : [];
      const phones = [...new Set(contacts.map((contact) => contact.phoneNormalized).filter((phone): phone is string => !!phone))];
      const related = phones.length ? await prisma.contact.findMany({
        where: {
          orgId: request.user!.orgId,
          phoneNormalized: { in: phones },
          archivedAt: null,
          ...(accessibleIds === null ? {} : { id: { in: [...accessibleIds] } }),
        },
        select: { id: true, phoneNormalized: true, posCustomerId: true, posCustomerCode: true },
      }) : [];
      const allContacts = [...new Map([...contacts, ...related].map((contact) => [contact.id, contact])).values()];
      const posIds = [...new Set(allContacts.map((contact) => contact.posCustomerId).filter((id): id is number => id != null))];
      const posRows = posIds.length ? await prisma.posCustomer.findMany({
        where: { orgId: request.user!.orgId, posId: { in: posIds } },
        select: { posId: true, name: true, code: true, assignedSaleName: true },
      }) : [];
      const posById = new Map(posRows.map((row) => [row.posId, row]));
      const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));
      const members = uids.map((uid) => {
        const profile = profiles[uid] ?? Object.values(profiles).find((item: any) => String(item?.id) === uid) as any;
        const fallback = storedByUid.get(uid);
        const contact = contactsById.get(contactByUid.get(uid) ?? '');
        const linkedContacts = contact?.phoneNormalized
          ? allContacts.filter((item) => item.phoneNormalized === contact.phoneNormalized)
          : contact ? [contact] : [];
        const posAccounts = [...new Map(linkedContacts.filter((item) => item.posCustomerId != null || item.posCustomerCode).map((item) => {
          const pos = item.posCustomerId != null ? posById.get(item.posCustomerId) : null;
          return [String(item.posCustomerId ?? item.posCustomerCode), {
            id: String(item.posCustomerId ?? item.posCustomerCode),
            contactId: item.id,
            posName: pos?.name ?? null,
            posCode: pos?.code ?? item.posCustomerCode ?? null,
            posSaleName: pos?.assignedSaleName ?? null,
          }] as const;
        })).values()];
        return {
          uid,
          displayName: profile?.displayName || profile?.zaloName || fallback?.zaloName || fallback?.displayName || uid,
          avatar: profile?.avatar ?? fallback?.avatarUrl ?? null,
          kind: employeeUids.has(uid) ? 'employee' : 'customer',
          posAccounts,
        };
      });
      return { members };
    } catch (err) { return handleError(reply, err, 'getGroupMembersInfo'); }
  });

  // ── Group CRUD ──────────────────────────────────────────────────────────────

  app.post<{ Params: { accountId: string }; Body: { name: string; memberIds: string[] } }>(BASE, async (request, reply) => {
    const { accountId } = request.params;
    const { name, memberIds } = request.body ?? {};
    if (!name || !Array.isArray(memberIds) || memberIds.length === 0) {
      return reply.status(400).send({ error: 'name and memberIds are required' });
    }
    try {
      await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'admin'))) return;
      return reply.status(201).send({ group: await zaloOps.createGroup(accountId, { name, memberIds }) });
    } catch (err) { return handleError(reply, err, 'createGroup'); }
  });

  app.patch<{ Params: { accountId: string; groupId: string }; Body: { name: string } }>(`${BASE}/:groupId/name`, async (request, reply) => {
    const { accountId, groupId } = request.params;
    const { name } = request.body ?? {};
    if (!name) return reply.status(400).send({ error: 'name is required' });
    try {
      await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'admin'))) return;
      return { result: await zaloOps.renameGroup(accountId, name, groupId) };
    } catch (err) { return handleError(reply, err, 'renameGroup'); }
  });

  app.patch<{ Params: { accountId: string; groupId: string }; Body: Record<string, unknown> }>(`${BASE}/:groupId/settings`, async (request, reply) => {
    const { accountId, groupId } = request.params;
    try {
      await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'admin'))) return;
      return { result: await zaloOps.updateGroupSettings(accountId, request.body ?? {}, groupId) };
    } catch (err) { return handleError(reply, err, 'updateGroupSettings'); }
  });

  // ── Membership ──────────────────────────────────────────────────────────────

  app.post<{ Params: { accountId: string; groupId: string }; Body: { userIds: string[] } }>(`${BASE}/:groupId/members`, async (request, reply) => {
    const { accountId, groupId } = request.params;
    const { userIds } = request.body ?? {};
    if (!Array.isArray(userIds) || userIds.length === 0) return reply.status(400).send({ error: 'userIds array is required' });
    try {
      await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'admin'))) return;
      return { result: await zaloOps.addUserToGroup(accountId, userIds, groupId) };
    } catch (err) { return handleError(reply, err, 'addUserToGroup'); }
  });

  app.delete<{ Params: { accountId: string; groupId: string }; Body: { userIds: string[] } }>(`${BASE}/:groupId/members`, async (request, reply) => {
    const { accountId, groupId } = request.params;
    const { userIds } = request.body ?? {};
    if (!Array.isArray(userIds) || userIds.length === 0) return reply.status(400).send({ error: 'userIds array is required' });
    try {
      await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'admin'))) return;
      return { result: await zaloOps.removeUserFromGroup(accountId, userIds, groupId) };
    } catch (err) { return handleError(reply, err, 'removeUserFromGroup'); }
  });

  app.post<{ Params: { accountId: string; groupId: string }; Body: { userId: string } }>(`${BASE}/:groupId/deputies`, async (request, reply) => {
    const { accountId, groupId } = request.params;
    const { userId } = request.body ?? {};
    if (!userId) return reply.status(400).send({ error: 'userId is required' });
    try {
      await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'admin'))) return;
      return { result: await zaloOps.addGroupDeputy(accountId, userId, groupId) };
    } catch (err) { return handleError(reply, err, 'addGroupDeputy'); }
  });

  app.delete<{ Params: { accountId: string; groupId: string; userId: string } }>(`${BASE}/:groupId/deputies/:userId`, async (request, reply) => {
    const { accountId, groupId, userId } = request.params;
    try {
      await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'admin'))) return;
      return { result: await zaloOps.removeGroupDeputy(accountId, userId, groupId) };
    } catch (err) { return handleError(reply, err, 'removeGroupDeputy'); }
  });

  app.post<{ Params: { accountId: string; groupId: string }; Body: { newOwnerId: string } }>(`${BASE}/:groupId/transfer`, async (request, reply) => {
    const { accountId, groupId } = request.params;
    const { newOwnerId } = request.body ?? {};
    if (!newOwnerId) return reply.status(400).send({ error: 'newOwnerId is required' });
    try {
      await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'admin'))) return;
      return { result: await zaloOps.changeGroupOwner(accountId, newOwnerId, groupId) };
    } catch (err) { return handleError(reply, err, 'changeGroupOwner'); }
  });
}
