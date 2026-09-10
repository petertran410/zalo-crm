/**
 * cs-routes.ts — REST API for CSKH Workspace and Sales Coordination Hub.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { zaloPool } from '../zalo/zalo-pool.js';
import { DISPLAYABLE_NICK_WHERE } from '../zalo/zalo-scope.js';

export async function csRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  /**
   * GET /api/v1/cs/delegated-sales
   * Trả về thông tin phục vụ CSKH Workspace Hub:
   * 1. cskh: Thống kê các nick do chính user CSKH sở hữu (CSKH Chung)
   * 2. sales: Danh sách các Sales mà user CSKH được cấp quyền 'chat' hoặc 'admin'
   */
  app.get('/api/v1/cs/delegated-sales', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;

    // 1. Lấy danh sách nick của chính CSKH (CSKH Chung)
    const myAccounts = await prisma.zaloAccount.findMany({
      where: {
        orgId: user.orgId,
        ownerUserId: user.id,
        ...DISPLAYABLE_NICK_WHERE,
      },
      select: {
        id: true,
        displayName: true,
        avatarUrl: true,
        status: true,
      },
    });

    const myAccountIds = myAccounts.map((a) => a.id);
    let myTotalGroups = 0;
    let myPendingMessages = 0;
    let myUnreadMessages = 0;

    if (myAccountIds.length > 0) {
      const [groups, pending, unread] = await Promise.all([
        prisma.conversation.count({
          where: {
            orgId: user.orgId,
            zaloAccountId: { in: myAccountIds },
            threadType: 'group',
            deletedAt: null,
          },
        }),
        prisma.conversation.count({
          where: {
            orgId: user.orgId,
            zaloAccountId: { in: myAccountIds },
            isReplied: false,
            deletedAt: null,
          },
        }),
        prisma.conversation.aggregate({
          where: {
            orgId: user.orgId,
            zaloAccountId: { in: myAccountIds },
            deletedAt: null,
          },
          _sum: { unreadCount: true },
        }),
      ]);
      myTotalGroups = groups;
      myPendingMessages = pending;
      myUnreadMessages = unread._sum.unreadCount || 0;
    }

    const cskhData = {
      totalAccounts: myAccounts.length,
      zaloAccounts: myAccounts.map((a) => ({
        ...a,
        isOnline: zaloPool.getInstance(a.id)?.status === 'connected' || a.status === 'connected',
      })),
      totalGroups: myTotalGroups,
      pendingMessages: myPendingMessages,
      unreadMessages: myUnreadMessages,
    };

    // 2. Lấy danh sách nick được cấp quyền qua ZaloAccountAccess
    const delegatedAccesses = await prisma.zaloAccountAccess.findMany({
      where: {
        userId: user.id,
        permission: { in: ['chat', 'admin'] },
        zaloAccount: {
          orgId: user.orgId,
          ...DISPLAYABLE_NICK_WHERE,
          ownerUserId: { not: user.id }, // Loại bỏ nick của chính mình
        },
      },
      include: {
        zaloAccount: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            status: true,
            ownerUserId: true,
            owner: {
              select: {
                id: true,
                fullName: true,
                avatarUrl: true,
                email: true,
              },
            },
          },
        },
      },
    });

    // Nhóm theo Sales (ownerUserId)
    const salesMap = new Map<
      string,
      {
        salesUser: { id: string; fullName: string; avatarUrl: string | null; email: string };
        zaloAccounts: Array<{ id: string; displayName: string | null; avatarUrl: string | null; isOnline: boolean }>;
      }
    >();

    for (const access of delegatedAccesses) {
      const acct = access.zaloAccount;
      if (!acct || !acct.ownerUserId || !acct.owner) continue;

      const salesUserId = acct.ownerUserId;
      if (!salesMap.has(salesUserId)) {
        salesMap.set(salesUserId, {
          salesUser: {
            id: acct.owner.id,
            fullName: acct.owner.fullName || acct.owner.email || '',
            avatarUrl: acct.owner.avatarUrl,
            email: acct.owner.email || '',
          },
          zaloAccounts: [],
        });
      }

      const isOnline = zaloPool.getInstance(acct.id)?.status === 'connected' || acct.status === 'connected';
      salesMap.get(salesUserId)!.zaloAccounts.push({
        id: acct.id,
        displayName: acct.displayName,
        avatarUrl: acct.avatarUrl,
        isOnline,
      });
    }

    // Đếm groups & pending messages cho từng Sales
    const salesList = await Promise.all(
      Array.from(salesMap.values()).map(async (salesEntry) => {
        const accountIds = salesEntry.zaloAccounts.map((a) => a.id);
        const [totalGroups, pendingMessages, unreadAgg] = await Promise.all([
          prisma.conversation.count({
            where: {
              orgId: user.orgId,
              zaloAccountId: { in: accountIds },
              threadType: 'group',
              deletedAt: null,
            },
          }),
          prisma.conversation.count({
            where: {
              orgId: user.orgId,
              zaloAccountId: { in: accountIds },
              isReplied: false,
              deletedAt: null,
            },
          }),
          prisma.conversation.aggregate({
            where: {
              orgId: user.orgId,
              zaloAccountId: { in: accountIds },
              deletedAt: null,
            },
            _sum: { unreadCount: true },
          }),
        ]);

        const anyOnline = salesEntry.zaloAccounts.some((a) => a.isOnline);

        return {
          salesUser: salesEntry.salesUser,
          zaloAccounts: salesEntry.zaloAccounts,
          totalGroups,
          pendingMessages,
          unreadMessages: unreadAgg._sum.unreadCount || 0,
          status: anyOnline ? 'online' : 'offline',
        };
      }),
    );

    return reply.send({
      cskh: cskhData,
      sales: salesList,
    });
  });
}
