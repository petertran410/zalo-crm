/**
 * cs-routes.ts — REST API for CSKH Workspace and Sales Coordination Hub.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { zaloPool } from '../zalo/zalo-pool.js';
import { DISPLAYABLE_NICK_WHERE, getZaloScope } from '../zalo/zalo-scope.js';

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
    const currentUser = await prisma.user.findFirst({
      where: { id: user.id, orgId: user.orgId },
      select: {
        fullName: true,
        avatarUrl: true,
        email: true,
        permissionGroup: { select: { workspaceId: true } },
      },
    });

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
      user: {
        id: user.id,
        fullName: currentUser?.fullName || currentUser?.email || 'Tôi',
        avatarUrl: currentUser?.avatarUrl || null,
      },
      totalAccounts: myAccounts.length,
      zaloAccounts: myAccounts.map((a) => ({
        ...a,
        isOnline: zaloPool.getInstance(a.id)?.status === 'connected' || a.status === 'connected',
      })),
      totalGroups: myTotalGroups,
      pendingMessages: myPendingMessages,
      unreadMessages: myUnreadMessages,
    };

    const isOrgAdmin = user.role === 'owner' || user.role === 'admin';
    const currentWorkspaceId = currentUser?.permissionGroup?.workspaceId
      ?? (user.role === 'cskh' ? 'customer-care' : 'sales');

    const peerUsers = await prisma.user.findMany({
      where: {
        orgId: user.orgId,
        id: { not: user.id },
        isActive: true,
        ...(!isOrgAdmin ? {
          OR: [
            { permissionGroup: { workspaceId: currentWorkspaceId } },
            ...(currentWorkspaceId === 'sales'
              ? [{ permissionGroupId: null, role: 'member' }]
              : []),
            ...(currentWorkspaceId === 'customer-care'
              ? [{ permissionGroupId: null, role: 'cskh' }]
              : []),
          ],
        } : {}),
      },
      select: {
        id: true,
        fullName: true,
        avatarUrl: true,
        email: true,
      },
      orderBy: { fullName: 'asc' },
    });

    const peerUserIds = peerUsers.map((peer) => peer.id);
    const scope = await getZaloScope(user.id, user.orgId, user.role);

    let targetAccounts: Array<{
      id: string;
      displayName: string | null;
      avatarUrl: string | null;
      status: string;
      ownerUserId: string | null;
    }> = [];

    if (peerUserIds.length > 0) {
      targetAccounts = await prisma.zaloAccount.findMany({
        where: {
          orgId: user.orgId,
          ...DISPLAYABLE_NICK_WHERE,
          ownerUserId: { in: peerUserIds },
          ...(!isOrgAdmin ? { id: { in: scope.displayableIds } } : {}),
        },
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
          status: true,
          ownerUserId: true,
        },
      });
    }

    // Nhóm theo Sales (ownerUserId)
    const salesMap = new Map<
      string,
      {
        salesUser: { id: string; fullName: string; avatarUrl: string | null; email: string };
        zaloAccounts: Array<{
          id: string;
          displayName: string | null;
          avatarUrl: string | null;
          status: string;
          isOnline: boolean;
        }>;
      }
    >();

    for (const peer of peerUsers) {
      salesMap.set(peer.id, {
        salesUser: {
          id: peer.id,
          fullName: peer.fullName || peer.email || 'Nhân viên',
          avatarUrl: peer.avatarUrl || null,
          email: peer.email || '',
        },
        zaloAccounts: [],
      });
    }

    for (const acct of targetAccounts) {
      if (!acct.ownerUserId || !salesMap.has(acct.ownerUserId)) continue;

      const isOnline = zaloPool.getInstance(acct.id)?.status === 'connected' || acct.status === 'connected';
      salesMap.get(acct.ownerUserId)!.zaloAccounts.push({
        id: acct.id,
        displayName: acct.displayName,
        avatarUrl: acct.avatarUrl,
        status: acct.status,
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
