import { tenantTransaction } from '../../shared/database/prisma-client.js';

/**
 * zca-js currently exposes unknown raw group actions, but no documented disperse enum.
 * Only enable an exact raw action AFTER capturing/verifying it with a test group.
 */
export function verifiedDissolutionGroup(event: unknown, verifiedAct = process.env.CRM_ZALO_DISSOLVE_EVENT_ACT): string | null {
  if (!verifiedAct || !event || typeof event !== 'object') return null;
  const row = event as { act?: unknown; threadId?: unknown };
  if (['leave', 'remove_member', 'update', 'unknown'].includes(verifiedAct)) return null;
  return row.act === verifiedAct && typeof row.threadId === 'string' && row.threadId.length > 0
    ? row.threadId : null;
}

export async function recordGroupDissolution(orgId: string, accountId: string, groupId: string, source: 'crm' | 'zalo_event') {
  return tenantTransaction(async tx => {
    const rows = await tx.conversation.findMany({
      where: { orgId, zaloAccountId: accountId, externalThreadId: groupId, threadType: 'group', dissolvedAt: null },
      include: { customerLink: true },
    });
    for (const row of rows) {
      const result = await tx.conversation.updateMany({
        where: { id: row.id, orgId, dissolvedAt: null },
        data: { dissolvedAt: new Date(), dissolvedSource: source },
      });
      if (!result.count) continue;
      await tx.activityLog.create({ data: {
        orgId, actorType: 'system', systemSource: source, action: 'group_dissolved',
        entityType: row.customerLink ? 'contact' : 'conversation', entityId: row.customerLink?.contactId ?? row.id,
        details: { conversationId: row.id, groupName: row.groupName, source },
      } });
    }
  });
}
