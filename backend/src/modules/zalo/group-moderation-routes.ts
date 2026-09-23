/**
 * group-moderation-routes.ts — Group moderation, links, lifecycle, and polls.
 * Routes: /api/v1/zalo-accounts/:accountId/groups/:groupId/...
 */
import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { zaloOps } from '../../shared/zalo-operations.js';
import { resolveAccount, checkAccess, handleError } from './zalo-route-helpers.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { linkedPosIds, requireCustomer, summarizeDebt, authoritativeBalances } from '../contacts/customer-workspace-service.js';

export async function groupModerationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  const BASE = '/api/v1/zalo-accounts/:accountId/groups';

  // ── Moderation ──────────────────────────────────────────────────────────────

  app.post<{ Params: { accountId: string; groupId: string }; Body: { userId: string } }>(`${BASE}/:groupId/block`, async (request, reply) => {
    const { accountId, groupId } = request.params;
    const { userId } = request.body ?? {};
    if (!userId) return reply.status(400).send({ error: 'userId is required' });
    try {
      await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'admin'))) return;
      return { result: await zaloOps.blockGroupMember(accountId, userId, groupId) };
    } catch (err) { return handleError(reply, err, 'blockGroupMember'); }
  });

  app.delete<{ Params: { accountId: string; groupId: string; userId: string } }>(`${BASE}/:groupId/block/:userId`, async (request, reply) => {
    const { accountId, groupId, userId } = request.params;
    try {
      await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'admin'))) return;
      return { result: await zaloOps.unblockGroupMember(accountId, userId, groupId) };
    } catch (err) { return handleError(reply, err, 'unblockGroupMember'); }
  });

  app.get<{ Params: { accountId: string; groupId: string } }>(`${BASE}/:groupId/blocked`, async (request, reply) => {
    const { accountId, groupId } = request.params;
    try {
      await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'read'))) return;
      return { blocked: await zaloOps.getGroupBlockedMembers(accountId, groupId) };
    } catch (err) { return handleError(reply, err, 'getGroupBlockedMembers'); }
  });

  app.get<{ Params: { accountId: string; groupId: string } }>(`${BASE}/:groupId/pending`, async (request, reply) => {
    const { accountId, groupId } = request.params;
    try {
      await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'read'))) return;
      return { pending: await zaloOps.getPendingGroupMembers(accountId, groupId) };
    } catch (err) { return handleError(reply, err, 'getPendingGroupMembers'); }
  });

  // ── Links ───────────────────────────────────────────────────────────────────

  app.get<{ Params: { accountId: string; groupId: string } }>(`${BASE}/:groupId/link`, async (request, reply) => {
    const { accountId, groupId } = request.params;
    try {
      await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'read'))) return;
      return { link: await zaloOps.getGroupLinkDetail(accountId, groupId) };
    } catch (err) { return handleError(reply, err, 'getGroupLinkDetail'); }
  });

  app.post<{ Params: { accountId: string; groupId: string } }>(`${BASE}/:groupId/link/enable`, async (request, reply) => {
    const { accountId, groupId } = request.params;
    try {
      await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'admin'))) return;
      return { result: await zaloOps.enableGroupLink(accountId, groupId) };
    } catch (err) { return handleError(reply, err, 'enableGroupLink'); }
  });

  app.post<{ Params: { accountId: string; groupId: string } }>(`${BASE}/:groupId/link/disable`, async (request, reply) => {
    const { accountId, groupId } = request.params;
    try {
      await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'admin'))) return;
      return { result: await zaloOps.disableGroupLink(accountId, groupId) };
    } catch (err) { return handleError(reply, err, 'disableGroupLink'); }
  });

  app.post<{ Params: { accountId: string }; Body: { linkId: string } }>(`/api/v1/zalo-accounts/:accountId/groups/join-link`, async (request, reply) => {
    const { accountId } = request.params;
    const { linkId } = request.body ?? {};
    if (!linkId) return reply.status(400).send({ error: 'linkId is required' });
    try {
      await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'chat'))) return;
      return { result: await zaloOps.joinGroupByLink(accountId, linkId) };
    } catch (err) { return handleError(reply, err, 'joinGroupByLink'); }
  });

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  app.get<{ Params: { accountId: string; groupId: string } }>(`${BASE}/:groupId/disperse-preview`, async (request, reply) => {
    const { accountId, groupId } = request.params;
    const actor = request.user!;
    await resolveAccount(accountId, actor.orgId);
    if (!await checkAccess(request, reply, accountId, 'admin')) return;
    const conversation = await prisma.conversation.findFirst({
      where: { orgId: actor.orgId, zaloAccountId: accountId, externalThreadId: groupId, threadType: 'group' },
      include: { customerLink: true },
    });
    const contactId = conversation?.customerLink?.contactId;
    if (!contactId) return { linked: false, debt: { amount: null }, openTasks: null, dissolvedAt: conversation?.dissolvedAt };
    await requireCustomer(actor, contactId);
    const ids = await linkedPosIds(actor.orgId, contactId);
    const debts = await authoritativeBalances(actor.orgId, ids);
    const openTasks = await prisma.task.count({ where: { orgId: actor.orgId, contactId, status: { notIn: ['done', 'cancelled'] } } });
    return { linked: true, debt: summarizeDebt(debts, ids.length), openTasks, dissolvedAt: conversation?.dissolvedAt };
  });

  app.post<{ Params: { accountId: string; groupId: string } }>(`${BASE}/:groupId/leave`, async (request, reply) => {
    const { accountId, groupId } = request.params;
    try {
      await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'admin'))) return;
      return { result: await zaloOps.leaveGroup(accountId, groupId) };
    } catch (err) { return handleError(reply, err, 'leaveGroup'); }
  });

  app.post<{ Params: { accountId: string; groupId: string }; Body: { confirmed?: boolean } }>(`${BASE}/:groupId/disperse`, async (request, reply) => {
    const { accountId, groupId } = request.params;
    try {
      await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'admin'))) return;
      if (request.body?.confirmed !== true) return reply.code(400).send({ error: 'Cần xác nhận giải tán nhóm. Dữ liệu CRM vẫn được giữ.' });
      const where = { orgId: request.user!.orgId, zaloAccountId: accountId, externalThreadId: groupId, threadType: 'group' };
      const existing = await prisma.conversation.findFirst({ where });
      if (existing?.dissolvedAt) return { result: { alreadyDissolved: true } };
      const result = await zaloOps.disperseGroup(accountId, groupId);
      await prisma.conversation.updateMany({ where, data: { dissolvedAt: new Date(), dissolvedSource: 'crm' } });
      return { result };
    } catch (err) { return handleError(reply, err, 'disperseGroup'); }
  });

  // ── Polls ───────────────────────────────────────────────────────────────────

  app.post<{
    Params: { accountId: string; groupId: string };
    Body: { question: string; options: string[]; multi?: boolean; anonymous?: boolean; expireMs?: number };
  }>(`${BASE}/:groupId/polls`, async (request, reply) => {
    const { accountId, groupId } = request.params;
    const { question, options, multi, anonymous, expireMs } = request.body ?? {};
    if (!question || !Array.isArray(options) || options.length < 2) {
      return reply.status(400).send({ error: 'question and at least 2 options are required' });
    }
    try {
      await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'admin'))) return;
      const pollOptions = { question, options, multi: multi ?? false, anonymous: anonymous ?? false, expireMs };
      return reply.status(201).send({ poll: await zaloOps.createPoll(accountId, pollOptions, groupId) });
    } catch (err) { return handleError(reply, err, 'createPoll'); }
  });

  app.get<{ Params: { accountId: string; groupId: string; pollId: string } }>(`${BASE}/:groupId/polls/:pollId`, async (request, reply) => {
    const { accountId, pollId } = request.params;
    try {
      await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'read'))) return;
      return { poll: await zaloOps.getPollDetail(accountId, pollId) };
    } catch (err) { return handleError(reply, err, 'getPollDetail'); }
  });

  app.post<{
    Params: { accountId: string; groupId: string; pollId: string };
    Body: { optionIds: number[] };
  }>(`${BASE}/:groupId/polls/:pollId/vote`, async (request, reply) => {
    const { accountId, groupId, pollId } = request.params;
    const { optionIds } = request.body ?? {};
    if (!Array.isArray(optionIds) || optionIds.length === 0) {
      return reply.status(400).send({ error: 'optionIds array is required' });
    }
    try {
      await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'chat'))) return;
      return { result: await zaloOps.votePoll(accountId, pollId, optionIds, groupId) };
    } catch (err) { return handleError(reply, err, 'votePoll'); }
  });

  app.post<{ Params: { accountId: string; groupId: string; pollId: string } }>(`${BASE}/:groupId/polls/:pollId/lock`, async (request, reply) => {
    const { accountId, pollId } = request.params;
    try {
      await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'admin'))) return;
      return { result: await zaloOps.lockPoll(accountId, pollId) };
    } catch (err) { return handleError(reply, err, 'lockPoll'); }
  });

  app.post<{ Params: { accountId: string; groupId: string; pollId: string } }>(`${BASE}/:groupId/polls/:pollId/share`, async (request, reply) => {
    const { accountId, pollId } = request.params;
    try {
      await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'chat'))) return;
      return { result: await zaloOps.sharePoll(accountId, pollId) };
    } catch (err) { return handleError(reply, err, 'sharePoll'); }
  });
}
