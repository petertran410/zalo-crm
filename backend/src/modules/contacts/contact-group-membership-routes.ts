import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { authMiddleware } from "../auth/auth-middleware.js";
import { requireGrant } from "../rbac/rbac-middleware.js";
import { prisma } from "../../shared/database/prisma-client.js";
import { logger } from "../../shared/utils/logger.js";
import { assertContactVisible } from "./contact-scope.js";
import { getZaloScope } from "../zalo/zalo-scope.js";

export async function contactGroupMembershipRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authMiddleware);

  app.get(
    "/api/v1/contacts/:id/group-memberships",
    {
      preHandler: requireGrant("contact", "access"),
      config: {
        contentClass: "metadata" as const,
        rbacResource: "contact" as const,
        rbacAction: "access" as const,
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const { id } = request.params as { id: string };
        const visible = await assertContactVisible({
          userId: user.id,
          orgId: user.orgId,
          legacyRole: user.role,
          contactId: id,
        });
        if (!visible) return reply.status(404).send({ error: "Contact not found" });

        const zaloScope = await getZaloScope(user.id, user.orgId, user.role);
        const displayableIds = new Set(zaloScope.displayableIds);
        const friends = await prisma.friend.findMany({
          where: {
            orgId: user.orgId,
            contactId: id,
            relationshipKind: { not: "ghost" },
            zaloAccountId: { in: zaloScope.displayableIds },
          },
          select: {
            zaloAccountId: true,
            zaloUidInNick: true,
            zaloAccount: { select: { displayName: true, avatarUrl: true } },
          },
        });

        const identities = friends.filter(
          (friend) => displayableIds.has(friend.zaloAccountId) && friend.zaloUidInNick,
        );
        if (identities.length === 0) return { groups: [] };

        const members = await prisma.groupMember.findMany({
          where: {
            orgId: user.orgId,
            isActive: true,
            OR: identities.map((friend) => ({
              zaloAccountId: friend.zaloAccountId,
              memberUid: friend.zaloUidInNick,
            })),
          },
          select: {
            zaloAccountId: true,
            groupId: true,
            lastSeenAt: true,
          },
          orderBy: { lastSeenAt: "desc" },
        });

        const uniqueMembers = new Map<string, (typeof members)[number]>();
        for (const member of members) {
          const key = `${member.zaloAccountId}:${member.groupId}`;
          if (!uniqueMembers.has(key)) uniqueMembers.set(key, member);
        }
        const rows = [...uniqueMembers.values()];
        if (rows.length === 0) return { groups: [] };

        const conversations = await prisma.conversation.findMany({
          where: {
            orgId: user.orgId,
            threadType: "group",
            deletedAt: null,
            zaloAccountId: { in: [...new Set(rows.map((row) => row.zaloAccountId))] },
            externalThreadId: { in: [...new Set(rows.map((row) => row.groupId))] },
          },
          select: {
            id: true,
            zaloAccountId: true,
            externalThreadId: true,
            groupName: true,
            groupAvatarUrl: true,
            groupMembersCount: true,
          },
        });
        const conversationByGroup = new Map(
          conversations.map((conversation) => [
            `${conversation.zaloAccountId}:${conversation.externalThreadId}`,
            conversation,
          ]),
        );
        const accountById = new Map(
          identities.map((friend) => [friend.zaloAccountId, friend.zaloAccount]),
        );

        return {
          groups: rows.map((member) => {
            const conversation = conversationByGroup.get(
              `${member.zaloAccountId}:${member.groupId}`,
            );
            const account = accountById.get(member.zaloAccountId);
            return {
              zaloAccountId: member.zaloAccountId,
              zaloAccountName: account?.displayName ?? null,
              zaloAccountAvatarUrl: account?.avatarUrl ?? null,
              groupId: member.groupId,
              conversationId: conversation?.id ?? null,
              name: conversation?.groupName ?? null,
              avatarUrl: conversation?.groupAvatarUrl ?? null,
              memberCount: conversation?.groupMembersCount ?? null,
              lastVerifiedAt: member.lastSeenAt,
            };
          }),
        };
      } catch (err) {
        logger.error("[contacts] group memberships error:", err);
        return reply.status(500).send({ error: "Failed to fetch group memberships" });
      }
    },
  );
}
