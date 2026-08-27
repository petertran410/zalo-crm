/**
 * contact-routes.ts — REST API for CRM contact management.
 * Supports list, detail, create, update, delete, pipeline view, and tag updates.
 * All routes require JWT auth and are scoped to user's org.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { randomUUID } from "node:crypto";
import type { Server } from "socket.io";
import { emitChatMessage } from "../../shared/realtime/emit-chat.js";
import {
  prisma,
  tenantTransaction,
} from "../../shared/database/prisma-client.js";
import { authMiddleware } from "../auth/auth-middleware.js";
import { isBlurContaminated } from "../privacy/redact.js";
import { requireAnyGrant, requireGrant } from "../rbac/rbac-middleware.js";
import { logger } from "../../shared/utils/logger.js";
import { mergeContacts } from "./merge-service.js";
import { findExistingUserConversation } from "../chat/conversation-resolver.js";
import { runContactIntelligence } from "./contact-intelligence.js";
import {
  backfillGlobalId,
  backfillOrphanFriends,
} from "./backfill-global-id.js";
import { backfillMissingFriends } from "./backfill-missing-friends.js";
import { backfillFriendDisplayName } from "./backfill-friend-display-name.js";
import { migrateStatusTable } from "./status-migration.js";
import {
  computeAggregateDisplay,
  computeViewerPreview,
  AGGREGATE_INCLUDE,
} from "./contact-aggregate-display.js";
import {
  getContactScope,
  assertContactVisible,
  attachContactCollaboratorByUser,
  assertContactEditable,
} from "./contact-scope.js";
import { getZaloScope } from "../zalo/zalo-scope.js";
import { runAutomationRules } from "../../shared/ee-registry/automation.js";
import { normalizePhone } from "../../shared/utils/phone.js";
import { logActivity, computeDiff } from "../activity/activity-logger.js";
import { emitWebhook } from "../api/webhook-service.js";
import { scheduleHisweetiePush } from "../integrations/hisweetie-push-queue.js";

type QueryParams = Record<string, string>;

export async function contactRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authMiddleware);

  // GET /api/v1/contacts : list with filters and pagination
  app.get(
    "/api/v1/contacts",
    { preHandler: requireGrant("contact", "access") },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const {
          page = "1",
          limit = "50",
          search = "",
          source = "",
          status = "", // legacy enum
          statusId = "", // dynamic Status table
          assignedUserId = "",
          threadType = "", // 'user' | 'group' — filter qua conversations relation
          hasZalo = "", // 'true' | 'false' | 'unknown'
          multiNick = "", // 'true' = childrenCount > 1 (đa Zalo identity)
          scoreMin = "",
          scoreMax = "",
          relationshipKindAny = "", // CSV: 'friend,pending_friend,...' — match KH có ≥1 Friend kind đó
          zaloAccountId = "", // lọc KH mà nick CRM này (ZaloAccount) đang chăm (≥1 Friend row)
          dateFrom = "",
          dateTo = "",
          sort = "", // 'score' = lead score cao lên đầu; mặc định = lastActivity desc
          sequenceAttachMin = "", // #4: lọc KH đã gắn ≥ N sequence (đếm CareSession, auto+manual)
          friendInviteMin = "", // #3: lọc KH đã được gửi kết bạn ≥ N lần
          archived = "", // 'true' = chỉ trả Thùng rác; mặc định = bỏ archived
        } = request.query as QueryParams;

        const where: any = { orgId: user.orgId, mergedInto: null };
        // Soft-delete filter (Thùng rác) — mặc định list chính ẩn KH đã archive.
        // Chỉ khi ?archived=true mới trả về các KH đã archive.
        if (archived === "true") {
          where.archivedAt = { not: null };
        } else {
          where.archivedAt = null;
        }
        // Phase Contact Scope Hybrid 2026-05-27: filter theo ContactAccess (primary + collaborator).
        // Sale chỉ thấy KH mình primary/collab; manager thấy KH của subordinate; admin/owner thấy all.
        const cScope = await getContactScope(user.id, user.orgId, user.role);
        if (!cScope.isOrgAdmin && cScope.accessibleContactIds !== null) {
          where.id = { in: cScope.accessibleContactIds };
        }
        // Model B: mỗi Contact tự nó là "KH Cha"; con = Friend rows. KHÔNG filter parentContactId.
        if (source) where.source = source;
        if (status) where.status = status;
        if (statusId) where.statusId = statusId;
        if (assignedUserId) where.assignedUserId = assignedUserId;
        // "Có Zalo" phải khớp đúng zaloDisplay() ở frontend: có Friend row, có zalo identity, hoặc
        // hasZalo=true. Dùng hasZalo thô như trước bỏ sót 1.360 KH có Friend nhưng hasZalo=null.
        // Push vào where.AND để không đụng where.OR của search.
        if (
          hasZalo === "true" ||
          hasZalo === "false" ||
          hasZalo === "unknown"
        ) {
          // hasIdentity = các nguồn suy ra "có Zalo" NGOÀI hasZalo (friend/uid/globalId/username)
          const hasIdentityShape = [
            // FIX 4 nick-ghost (2026-06-13): "có Friend" = có Friend THẬT (không tính thẻ ma) →
            // KH chỉ có Friend ma không bị xếp nhầm vào "Có Zalo".
            {
              friends: {
                some: {
                  zaloAccount: { archivedAt: null },
                  relationshipKind: { not: "ghost" },
                },
              },
            },
            { zaloUid: { not: null } },
            { zaloGlobalId: { not: null } },
            { zaloUsername: { not: null } },
          ];
          where.AND = where.AND ?? [];
          if (hasZalo === "true") {
            // Có Zalo: hasZalo=true HOẶC có identity (Friend/uid/...)
            where.AND.push({ OR: [{ hasZalo: true }, ...hasIdentityShape] });
          } else {
            // Không có identity nào + KHÔNG verified true → đúng nhóm "chưa quét / không có"
            where.AND.push({ NOT: { OR: hasIdentityShape } });
            where.AND.push({ hasZalo: hasZalo === "false" ? false : null });
          }
        }
        // Score range — fallback Contact.leadScore (aggregate displayLeadScore tính sau)
        if (scoreMin || scoreMax) {
          where.leadScore = {};
          if (scoreMin) where.leadScore.gte = Number(scoreMin) || 0;
          if (scoreMax) where.leadScore.lte = Number(scoreMax) || 100;
        }
        // Date range — theo lastActivity (sort cũng dùng field này → khớp UX intent)
        if (dateFrom || dateTo) {
          where.lastActivity = {};
          if (dateFrom) where.lastActivity.gte = new Date(dateFrom);
          if (dateTo)
            where.lastActivity.lte = new Date(dateTo + "T23:59:59.999Z");
        }
        // Loại là phân loại người với nhóm, không phải "có hội thoại mới lọc". KH chưa chat vẫn là cá
        // nhân; trước đây bắt phải có conv nên ẩn hết KH không dùng Zalo.
        if (threadType === "group") {
          where.AND = where.AND ?? [];
          where.AND.push({
            conversations: { some: { threadType: "group", orgId: user.orgId } },
          });
          where.AND.push({
            conversations: { none: { threadType: "user", orgId: user.orgId } },
          });
          where.AND.push({ OR: [{ phone: null }, { phone: "" }] });
        } else if (threadType === "user") {
          // Cá nhân = KHÔNG phải nhóm thuần. NOT(group-shape).
          where.AND = where.AND ?? [];
          where.AND.push({
            NOT: {
              AND: [
                {
                  conversations: {
                    some: { threadType: "group", orgId: user.orgId },
                  },
                },
                {
                  conversations: {
                    none: { threadType: "user", orgId: user.orgId },
                  },
                },
                { OR: [{ phone: null }, { phone: "" }] },
              ],
            },
          });
        }
        // RelationshipKind aggregate: KH có ≥1 Friend với kind trong list.
        // 2026-06-30: dùng where.AND thay vì gán where.friends trực tiếp — vì filter
        // zaloAccountId bên dưới cũng dùng friends.some; gán trực tiếp 2 lần sẽ GHI ĐÈ nhau.
        if (relationshipKindAny) {
          const kinds = relationshipKindAny
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          if (kinds.length > 0) {
            where.AND = where.AND ?? [];
            where.AND.push({
              friends: { some: { relationshipKind: { in: kinds } } },
            });
          }
        }
        // Lọc theo Nick CRM (ZaloAccount) đang chăm: KH có ≥1 Friend row thuộc nick này.
        // 2026-06-30: tách AND riêng để cộng dồn với relationshipKindAny (nếu cả hai cùng set).
        if (zaloAccountId) {
          where.AND = where.AND ?? [];
          where.AND.push({ friends: { some: { zaloAccountId } } });
        }
        if (search) {
          // Fast path: phone chính match phoneNormalized indexed exact (normalize input
          // canonical về 84xxx). phone2/phone3 vẫn dùng contains variants (ít dùng).
          const canonicalPhone = normalizePhone(search);
          const digits = search.replace(/[^\d]/g, "");
          const phone2_3Variants: string[] = [];
          if (digits.length >= 9) {
            phone2_3Variants.push(digits);
            if (digits.startsWith("0"))
              phone2_3Variants.push("84" + digits.slice(1));
            else if (digits.startsWith("84"))
              phone2_3Variants.push("0" + digits.slice(2));
          }
          const phone23Clauses = phone2_3Variants.flatMap((p) => [
            { phone2: { contains: p } },
            { phone3: { contains: p } },
          ]);
          where.OR = [
            { fullName: { contains: search, mode: "insensitive" } },
            { crmName: { contains: search, mode: "insensitive" } },
            ...(canonicalPhone
              ? [{ phoneNormalized: { equals: canonicalPhone } }]
              : []),
            ...phone23Clauses,
            { email: { contains: search, mode: "insensitive" } },
            { zaloUid: { equals: search } },
            { zaloGlobalId: { equals: search } },
            { zaloUsername: { equals: search } },
          ];
        }

        // #4 (2026-06-20): lọc "KH đã gắn ≥ N sequence". Mỗi lần gắn (auto qua trigger HOẶC
        // manual qua sale) tạo 1 CareSession → đếm rows = số lần gắn. Pre-resolve contactId đạt
        // ngưỡng rồi GIAO với where.id (scope sale) hiện có để không vượt rào quyền.
        const seqMinN = parseInt(sequenceAttachMin) || 0;
        if (seqMinN > 0) {
          const grouped = await prisma.careSession.groupBy({
            by: ["contactId"],
            where: { orgId: user.orgId },
            _count: { contactId: true },
            having: { contactId: { _count: { gte: seqMinN } } },
          });
          const seqIds = grouped.map((g) => g.contactId);
          if (where.id?.in) {
            const allow = new Set(where.id.in as string[]);
            where.id = { in: seqIds.filter((id) => allow.has(id)) };
          } else {
            where.id = { in: seqIds };
          }
        }

        // #3 (2026-06-20): lọc "KH đã được gửi kết bạn ≥ N lần" — cột Contact.friendInviteSentCount.
        const fiMinN = parseInt(friendInviteMin) || 0;
        if (fiMinN > 0) {
          where.friendInviteSentCount = { gte: fiMinN };
        }

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);

        // Sort: tương tác mới nhất lên đầu (theo design D2 trong office-hours doc).
        // lastActivity null → cuối cùng. Indexed @@index([orgId, lastActivity]).
        const [contacts, total] = await Promise.all([
          prisma.contact.findMany({
            where,
            include: {
              assignedUser: {
                select: { id: true, fullName: true, email: true },
              },
              _count: { select: { conversations: true, appointments: true } },
              ...AGGREGATE_INCLUDE,
            },
            // sort=score → lead score cao lên đầu; mặc định = tương tác mới nhất.
            orderBy: (sort === "score"
              ? [
                  // leadScore Int @default(0) — KHÔNG nullable → Prisma chỉ nhận
                  // SortOrder thuần ('desc'), không nhận {sort,nulls} (gây 500).
                  { leadScore: "desc" },
                  { lastActivity: { sort: "desc", nulls: "last" } },
                ]
              : [
                  { lastActivity: { sort: "desc", nulls: "last" } },
                  { updatedAt: "desc" },
                ]) as any,
            skip: (pageNum - 1) * limitNum,
            take: limitNum,
          }),
          prisma.contact.count({ where }),
        ]);

        // #4: đếm số lần gắn sequence (CareSession) cho các KH trong TRANG này — tổng + đang chạy.
        // 1 query groupBy theo (contactId, state), indexed @@index([orgId, contactId, nickId, state]).
        const pageContactIds = contacts.map((c) => c.id);
        const seqAgg = pageContactIds.length
          ? await prisma.careSession.groupBy({
              by: ["contactId", "state"],
              where: { orgId: user.orgId, contactId: { in: pageContactIds } },
              _count: { _all: true },
            })
          : [];
        const seqCountMap = new Map<
          string,
          { total: number; active: number }
        >();
        for (const g of seqAgg) {
          const cur = seqCountMap.get(g.contactId) ?? { total: 0, active: 0 };
          cur.total += g._count._all;
          if (g.state === "active") cur.active += g._count._all;
          seqCountMap.set(g.contactId, cur);
        }

        // Phase Contact Scope Hybrid 2026-05-27: per-viewer preview + aggregate.
        // Sale chỉ thấy preview/score/status từ Friend rows của nick mình; admin/owner giữ aggregate global.
        const zScope = cScope.isOrgAdmin
          ? null
          : await getZaloScope(user.id, user.orgId, user.role);
        const visibleZaloIds: Set<string> | null = zScope
          ? new Set(zScope.accessibleIds)
          : null;

        // Aggregate + multiNick post-filter (childrenCount requires friends count after load)
        const multiNickOnly = multiNick === "true";
        const enriched = contacts
          .map((c) => {
            const nicksByKind: Record<string, number> = {};
            for (const f of c.friends ?? []) {
              nicksByKind[f.relationshipKind] =
                (nicksByKind[f.relationshipKind] || 0) + 1;
            }
            // Per-viewer: filter friends visible cho viewer cho aggregate display.
            const visibleFriends = visibleZaloIds
              ? (c.friends ?? []).filter((f: any) =>
                  visibleZaloIds.has(f.zaloAccountId)
                )
              : undefined;
            const display = computeAggregateDisplay(c, visibleFriends as any);
            const preview = computeViewerPreview(c as any, visibleZaloIds);
            const isPrimary = cScope.primaryContactIds.has(c.id);
            return {
              ...c,
              ...(preview ?? {}),
              nicksByKind,
              ...display,
              // Phase Contact Scope Hybrid: badge UI render — "Phụ trách chính" vs "Đồng đội cùng chăm"
              viewerRole: cScope.isOrgAdmin
                ? "admin"
                : isPrimary
                  ? "primary"
                  : "collaborator",
              // #4: số lần gắn sequence (auto+manual) ở mức Cha (SĐT) — tổng + đang chạy.
              sequenceAttachCount: seqCountMap.get(c.id)?.total ?? 0,
              sequenceActiveCount: seqCountMap.get(c.id)?.active ?? 0,
            };
          })
          .filter((c) => !multiNickOnly || (c.childrenCount ?? 0) > 1);

        // PRIVACY 2026-06-11 (audit H3): blur PII của KH thuộc nick main non-owner.
        // Detail KH đã redact, list cũng phải nhất quán (nếu không đọc list = vượt rào).
        const { buildPrivacyContext, buildOffendingContactIds, redactContact } =
          await import("../privacy/redact.js");
        const privacyCtx = await buildPrivacyContext(request);
        const offending = await buildOffendingContactIds(
          enriched.map((c) => c.id),
          privacyCtx
        );
        const out = enriched.map((c) =>
          offending.has(c.id) ? redactContact(c, privacyCtx) : c
        );

        return { contacts: out, total, page: pageNum, limit: limitNum };
      } catch (err) {
        logger.error("[contacts] List error:", err);
        return reply.status(500).send({ error: "Failed to fetch contacts" });
      }
    }
  );

  // GET /api/v1/contacts/stats : metrics cho stats row đầu ContactsView
  // Tổng hợp số liệu nhanh (count theo dimension) cho dashboard mini phía top.
  // Tất cả filter scoped theo orgId + mergedInto IS NULL (skip merged secondaries).
  app.get(
    "/api/v1/contacts/stats",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        // Phase Contact Scope Hybrid 2026-05-27: stats theo scope của viewer
        const cScope = await getContactScope(user.id, user.orgId, user.role);
        const base: any = {
          orgId: user.orgId,
          mergedInto: null,
          archivedAt: null,
        };
        if (!cScope.isOrgAdmin && cScope.accessibleContactIds !== null) {
          base.id = { in: cScope.accessibleContactIds };
        }
        const now = new Date();
        const startOfToday = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate()
        );
        const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
        const sevenDaysAhead = new Date(now.getTime() + 7 * 86_400_000);

        // Giữ archivedAt:null vì nick đã xoá không tính là "đang chăm". Tầng đếm này khác tầng hiển thị
        // hội thoại của chat, đổi sang DISPLAYABLE_NICK_WHERE sẽ làm số liệu phình lên.
        const REAL_FRIEND_SOME = {
          some: {
            zaloAccount: { archivedAt: null },
            relationshipKind: { not: "ghost" },
          },
        };
        const [
          total,
          withNick,
          multiClaim3,
          revoked,
          noZalo,
          newToday,
          activeRecently,
          upcomingApt,
          highScore,
        ] = await Promise.all([
          prisma.contact.count({ where: base }),
          // Có nick chăm = có ≥1 Friend row THẬT (không tính thẻ ma)
          prisma.contact.count({
            where: { ...base, friends: REAL_FRIEND_SOME },
          }),
          // Multi-claim ≥3 nick THẬT (Friend per-account distinct → count distinct zaloAccountId).
          // Proxy: ≥3 Friend rows thật (đủ chính xác vì Friend unique theo (account, uid)).
          prisma.contact
            .findMany({
              where: { ...base, friends: REAL_FRIEND_SOME },
              select: {
                id: true,
                _count: {
                  select: {
                    friends: {
                      where: {
                        zaloAccount: { archivedAt: null },
                        relationshipKind: { not: "ghost" },
                      },
                    },
                  },
                },
              },
            })
            .then((rows) => rows.filter((r) => r._count.friends >= 3).length),
          prisma.contact.count({
            where: { ...base, consentStatus: "revoked" },
          }),
          prisma.contact.count({ where: { ...base, hasZalo: false } }),
          prisma.contact.count({
            where: { ...base, createdAt: { gte: startOfToday } },
          }),
          prisma.contact.count({
            where: { ...base, lastActivity: { gte: sevenDaysAgo } },
          }),
          prisma.contact.count({
            where: {
              ...base,
              appointments: {
                some: { appointmentDate: { gte: now, lte: sevenDaysAhead } },
              },
            },
          }),
          prisma.contact.count({ where: { ...base, leadScore: { gte: 50 } } }),
        ]);

        return {
          total,
          withNick,
          multiClaim: multiClaim3,
          revoked,
          noZalo,
          newToday,
          activeRecently,
          upcomingApt,
          highScore,
        };
      } catch (err) {
        logger.error("[contacts] Stats error:", err);
        return reply.status(500).send({ error: "Failed to compute stats" });
      }
    }
  );

  // GET /api/v1/contacts/sources : danh sách nguồn khách (distinct + count)
  // Dùng cho dropdown bộ lọc "Nguồn khách" trên mobile. Bỏ null, sắp theo count desc.
  app.get(
    "/api/v1/contacts/sources",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const grouped = await prisma.contact.groupBy({
          by: ["source"],
          where: {
            orgId: user.orgId,
            mergedInto: null,
            archivedAt: null,
            source: { not: null },
          },
          _count: { source: true },
          orderBy: { _count: { source: "desc" } },
        });
        const sources = grouped
          .filter((g) => g.source)
          .map((g) => ({ source: g.source as string, count: g._count.source }));
        return { sources };
      } catch (err) {
        logger.error("[contacts] Sources error:", err);
        return reply.status(500).send({ error: "Failed to list sources" });
      }
    }
  );

  // GET /api/v1/contacts/pipeline : kanban grouped by generic status
  app.get(
    "/api/v1/contacts/pipeline",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const orgId = user.orgId;
        // Phase Contact Scope Hybrid 2026-05-27
        const cScope = await getContactScope(user.id, user.orgId, user.role);
        const scopeWhere: any = {
          orgId,
          status: { not: null },
          mergedInto: null,
          archivedAt: null,
        };
        if (!cScope.isOrgAdmin && cScope.accessibleContactIds !== null) {
          scopeWhere.id = { in: cScope.accessibleContactIds };
        }

        const pipeline = await prisma.contact.groupBy({
          by: ["status"],
          where: scopeWhere,
          _count: true,
        });

        // Fetch contacts per status for kanban cards (limit 20 per column)
        const statuses = pipeline.map((g) => g.status ?? "unknown");
        const contactsByStatus: Record<string, any[]> = {};

        await Promise.all(
          statuses.map(async (st) => {
            const where: any = {
              orgId,
              status: st ?? null,
              mergedInto: null,
              archivedAt: null,
            };
            if (!cScope.isOrgAdmin && cScope.accessibleContactIds !== null) {
              where.id = { in: cScope.accessibleContactIds };
            }
            const contacts = await prisma.contact.findMany({
              where,
              select: {
                id: true,
                fullName: true,
                phone: true,
                email: true,
                avatarUrl: true,
                status: true,
                nextAppointment: true,
                assignedUser: { select: { id: true, fullName: true } },
              },
              orderBy: { updatedAt: "desc" },
              take: 20,
            });
            contactsByStatus[st ?? "unknown"] = contacts;
          })
        );

        // PRIVACY 2026-06-11 (audit H5): blur card KH thuộc nick main non-owner.
        const { buildPrivacyContext, buildOffendingContactIds, redactContact } =
          await import("../privacy/redact.js");
        const privacyCtx = await buildPrivacyContext(request);
        const allCardIds = Object.values(contactsByStatus)
          .flat()
          .map((c: any) => c.id);
        const offending = await buildOffendingContactIds(
          allCardIds,
          privacyCtx
        );

        const result = pipeline.map((g) => ({
          status: g.status ?? "unknown",
          count: g._count,
          contacts: (contactsByStatus[g.status ?? "unknown"] ?? []).map(
            (c: any) => (offending.has(c.id) ? redactContact(c, privacyCtx) : c)
          ),
        }));

        return { pipeline: result };
      } catch (err) {
        logger.error("[contacts] Pipeline error:", err);
        return reply.status(500).send({ error: "Failed to fetch pipeline" });
      }
    }
  );

  // GET /api/v1/contacts/:id : detail + friends (per nick) + appointments
  // Model B: KH Con = Friend row. Cha aggregate displayStatus/displayLeadScore/
  // displayHasZalo từ friends (xem contact-aggregate-display.ts).
  app.get(
    "/api/v1/contacts/:id",
    {
      // Privacy phase integration: Contact PII (name, phone, avatar) sẽ redact nếu requester
      // không own bất kỳ main-nick conv nào với contact này. Score/engagement metadata vẫn lộ.
      config: {
        contentClass: "mixed" as const,
        rbacResource: "contact" as const,
        rbacAction: "access" as const,
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const { id } = request.params as { id: string };

        // Phase Contact Scope Hybrid 2026-05-27: assert access trước khi load detail
        const visible = await assertContactVisible({
          userId: user.id,
          orgId: user.orgId,
          legacyRole: user.role,
          contactId: id,
        });
        if (!visible)
          return reply.status(404).send({ error: "Contact not found" });

        const contact = await prisma.contact.findFirst({
          where: { id, orgId: user.orgId },
          include: {
            assignedUser: { select: { id: true, fullName: true, email: true } },
            appointments: { orderBy: { appointmentDate: "desc" }, take: 10 },
            _count: { select: { conversations: true } },
            ...AGGREGATE_INCLUDE,
          },
        });

        if (!contact)
          return reply.status(404).send({ error: "Contact not found" });

        // Per-viewer aggregate + preview: sale chỉ thấy data từ Friend rows visible cho mình.
        const isAdmin = user.role === "owner" || user.role === "admin";
        const zScope = isAdmin
          ? null
          : await getZaloScope(user.id, user.orgId, user.role);
        const visibleZaloIds: Set<string> | null = zScope
          ? new Set(zScope.accessibleIds)
          : null;
        const visibleFriends = visibleZaloIds
          ? (contact.friends ?? []).filter((f: any) =>
              visibleZaloIds.has(f.zaloAccountId)
            )
          : undefined;
        const display = computeAggregateDisplay(contact, visibleFriends as any);
        const preview = computeViewerPreview(contact as any, visibleZaloIds);
        const cScope = await getContactScope(user.id, user.orgId, user.role);
        const viewerRole = cScope.isOrgAdmin
          ? "admin"
          : cScope.primaryContactIds.has(contact.id)
            ? "primary"
            : "collaborator";

        // Phase Riêng Tư 2026-05-22: blur PII nếu contact có friend row thuộc main-nick non-owned (Q4 lock)
        const { buildPrivacyContext, shouldRedactContactPii, redactContact } =
          await import("../privacy/redact.js");
        const privacyCtx = await buildPrivacyContext(request);
        const shouldRedact = await shouldRedactContactPii(
          contact.id,
          privacyCtx
        );
        const merged = {
          ...contact,
          ...(preview ?? {}),
          ...display,
          viewerRole,
        };
        return shouldRedact ? redactContact(merged as any, privacyCtx) : merged;
      } catch (err) {
        logger.error("[contacts] Detail error:", err);
        return reply.status(500).send({ error: "Failed to fetch contact" });
      }
    }
  );

  // POST /api/v1/contacts : create new contact
  app.post(
    "/api/v1/contacts",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const body = request.body as Record<string, any>;

        // Hồ sơ KH tổng (form Thêm KH style Smax 2026-06-03): demographic + multi-phone.
        const createBirthYear = (() => {
          if (
            body.birthYear === undefined ||
            body.birthYear === null ||
            body.birthYear === ""
          )
            return undefined;
          const by =
            typeof body.birthYear === "string"
              ? parseInt(body.birthYear, 10)
              : body.birthYear;
          return Number.isFinite(by) && by > 1900 && by < 2100 ? by : undefined;
        })();
        // GUARD chống blur ăn vào data (anh báo 2026-06-15) — từ chối tạo với tên chứa ▒.
        if (
          isBlurContaminated(body.fullName) ||
          isBlurContaminated(body.crmName)
        ) {
          return reply.status(400).send({
            error: "blur_contaminated_name",
            hint: "Tên chứa ký tự che (▒) — không thể lưu giá trị đã làm mờ",
          });
        }
        const contact = await prisma.contact.create({
          data: {
            orgId: user.orgId,
            fullName: body.fullName,
            crmName: body.crmName,
            phone: body.phone,
            email: body.email,
            zaloUid: body.zaloUid,
            avatarUrl: body.avatarUrl,
            source: body.source,
            sourceDate: body.sourceDate ? new Date(body.sourceDate) : undefined,
            status: body.status ?? "new",
            nextAppointment: body.nextAppointment
              ? new Date(body.nextAppointment)
              : undefined,
            assignedUserId: body.assignedUserId,
            notes: body.notes,
            tags: body.tags ?? [],
            metadata: body.metadata ?? {},
            gender: body.gender || undefined,
            occupation: body.occupation || undefined,
            addressLine: body.addressLine || undefined,
            birthYear: createBirthYear,
            phonesExtra: Array.isArray(body.phonesExtra)
              ? body.phonesExtra.filter(
                  (p: any) => p && typeof p.phone === "string" && p.phone.trim()
                )
              : undefined,
          },
        });

        // Phase Contact Scope Hybrid 2026-05-27: nếu set assignedUserId → primary;
        // creator user → collaborator (nếu chưa primary).
        if (contact.assignedUserId) {
          await prisma.contactAccess.upsert({
            where: {
              contactId_userId: {
                contactId: contact.id,
                userId: contact.assignedUserId,
              },
            },
            update: { role: "primary" },
            create: {
              orgId: user.orgId,
              contactId: contact.id,
              userId: contact.assignedUserId,
              role: "primary",
              source: "auto_from_assignment",
            },
          });
        }
        if (user.id !== contact.assignedUserId) {
          await prisma.contactAccess.upsert({
            where: {
              contactId_userId: { contactId: contact.id, userId: user.id },
            },
            update: {},
            create: {
              orgId: user.orgId,
              contactId: contact.id,
              userId: user.id,
              role: contact.assignedUserId ? "collaborator" : "primary",
              source: "manual",
            },
          });
        }

        const org = await prisma.organization.findUnique({
          where: { id: user.orgId },
          select: { id: true, name: true },
        });
        void runAutomationRules({
          trigger: "contact_created",
          orgId: user.orgId,
          org,
          contact: {
            id: contact.id,
            fullName: contact.fullName,
            phone: contact.phone,
            status: contact.status,
            source: contact.source,
            assignedUserId: contact.assignedUserId,
          },
        });

        // Phase 7 — emit AutomationEvent for engine triggers bound to contact_created
        void (async () => {
          try {
            const { automationEventBus } =
              await import("../../shared/ee-registry/event-bus.js");
            automationEventBus.emit({
              type: "contact_created",
              orgId: user.orgId,
              occurredAt: new Date(),
              contactId: contact.id,
              payload: {
                source: contact.source,
                status: contact.status,
                hasPhone: Boolean(contact.phone),
                hasZalo: Boolean(contact.zaloUid || contact.zaloGlobalId),
              },
            });
          } catch {
            // engine not loaded — silent
          }
        })();

        return reply.status(201).send(contact);
      } catch (err) {
        logger.error("[contacts] Create error:", err);
        return reply.status(500).send({ error: "Failed to create contact" });
      }
    }
  );

  // Thêm nhanh KH không có Zalo, chỉ cần tên và SĐT. Trùng SĐT thì trả 200 kèm exists:true để FE
  // cảnh báo tại chỗ chứ không tạo bản ghi mới.
  app.post(
    "/api/v1/contacts/quick-create",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const body = request.body as {
          fullName?: string;
          phone?: string;
          leadSource?: string;
        };

        const fullName = (body.fullName ?? "").trim();
        const rawPhone = (body.phone ?? "").trim();
        if (!fullName)
          return reply.status(400).send({ error: "fullName required" });
        if (!rawPhone)
          return reply.status(400).send({ error: "phone required" });

        const phoneNormalized = normalizePhone(rawPhone);
        if (!phoneNormalized) {
          return reply
            .status(400)
            .send({ error: "invalid_phone", message: "SĐT không hợp lệ" });
        }

        // Dedup: search theo phoneNormalized exact + phone variants (legacy rows)
        const phoneVariants = [
          phoneNormalized,
          "+" + phoneNormalized,
          "0" + phoneNormalized.slice(2),
        ];
        const existing = await prisma.contact.findFirst({
          where: {
            orgId: user.orgId,
            OR: [
              { phoneNormalized },
              { phone: { in: phoneVariants } },
              { phone2: { in: phoneVariants } },
              { phone3: { in: phoneVariants } },
            ],
          },
          select: {
            id: true,
            fullName: true,
            crmName: true,
            phone: true,
            hasZalo: true,
            assignedUserId: true,
            assignedUser: { select: { id: true, fullName: true } },
          },
        });

        if (existing) {
          // M55 2026-05-30: Sale B add trùng SĐT KH của sale A → auto-attach
          // ContactAccess.collaborator để counter "Cùng chăm" tăng + sale B
          // thấy KH trong list của mình (không bị ẩn). Idempotent + best-effort.
          await attachContactCollaboratorByUser({
            orgId: user.orgId,
            contactId: existing.id,
            userId: user.id,
            source: "quick_add_duplicate",
          });

          // M55.2 2026-05-30: lastNoteAt cho dialog warning — sale biết KH đã
          // được chăm gần nhất bao giờ (chỉ ngày, không nội dung — privacy + compact).
          const lastNote = await prisma.note.findFirst({
            where: { orgId: user.orgId, contactId: existing.id },
            orderBy: { createdAt: "desc" },
            select: { createdAt: true },
          });

          return reply.status(200).send({
            exists: true,
            contact: {
              id: existing.id,
              fullName: existing.crmName || existing.fullName,
              phone: existing.phone,
              hasZalo: existing.hasZalo,
              ownerUserId: existing.assignedUserId,
              ownerName: existing.assignedUser?.fullName ?? null,
              lastNoteAt: lastNote?.createdAt?.toISOString() ?? null,
            },
          });
        }

        const leadSource =
          (body.leadSource ?? "quick_add").trim() || "quick_add";
        const contact = await prisma.contact.create({
          data: {
            orgId: user.orgId,
            fullName,
            phone: rawPhone,
            phoneNormalized,
            source: leadSource,
            status: "new",
            hasZalo: null, // chưa search Zalo
            assignedUserId: user.id,
            tags: [],
            metadata: {},
          },
          select: {
            id: true,
            fullName: true,
            crmName: true,
            phone: true,
            hasZalo: true,
            source: true,
            assignedUserId: true,
            createdAt: true,
          },
        });

        // ContactAccess primary cho sale tạo
        await prisma.contactAccess.upsert({
          where: {
            contactId_userId: { contactId: contact.id, userId: user.id },
          },
          update: { role: "primary" },
          create: {
            orgId: user.orgId,
            contactId: contact.id,
            userId: user.id,
            role: "primary",
            source: "quick_add",
          },
        });

        // Fire automation trigger (best-effort, không throw)
        void (async () => {
          try {
            const org = await prisma.organization.findUnique({
              where: { id: user.orgId },
              select: { id: true, name: true },
            });
            await runAutomationRules({
              trigger: "contact_created",
              orgId: user.orgId,
              org,
              contact: {
                id: contact.id,
                fullName: contact.fullName,
                phone: contact.phone,
                status: "new",
                source: contact.source,
                assignedUserId: contact.assignedUserId,
              },
            });
          } catch {
            // silent
          }
        })();

        return reply.status(201).send({ exists: false, contact });
      } catch (err) {
        logger.error("[contacts] quick-create error:", err);
        return reply.status(500).send({ error: "Failed to create contact" });
      }
    }
  );

  // Tìm trong PosCustomer chứ không trong Contact. KH POS nào đã có Contact mang posCustomerId thì
  // trả linked=true để FE làm mờ, không cho bấm.
  // Cố ý không lọc theo contact-scope khi dò linked: KH POS đã nằm trong CRM là sự thật cấp org,
  // lọc theo scope sẽ khiến sale liên kết lại và tạo Contact trùng posCustomerId.
  app.get(
    "/api/v1/contacts/pos-link-candidates",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const { phone = "" } = request.query as { phone?: string };
        const digits = phone.replace(/\D/g, "");
        if (digits.length < 3) return { candidates: [] };

        // PosCustomer.phone giữ raw từ POS (chủ yếu 0xxx) → dò cả các biến thể.
        const variants = new Set<string>([digits]);
        if (digits.startsWith("0")) variants.add("84" + digits.slice(1));
        else if (digits.startsWith("84")) variants.add("0" + digits.slice(2));
        const canonical = normalizePhone(phone);
        if (canonical) {
          variants.add(canonical);
          variants.add("0" + canonical.slice(2));
        }

        const variantList = [...variants];
        const posCustomers = await prisma.posCustomer.findMany({
          where: {
            orgId: user.orgId,
            OR: variantList.map((v) => ({ phone: { contains: v } })),
          },
          select: { posId: true, code: true, name: true, phone: true },
          orderBy: { name: "asc" },
          take: 10,
        });

        // Phải dò riêng trên Contact chứ không chỉ bảng POS: record POS thường thiếu SĐT và
        // sale điền vào Contact sau, chỉ dò POS thì sale sẽ liên kết lại thành bản ghi trùng.
        //
        // Cố tình KHÔNG lọc theo posCustomerId: lọc ở đây làm nhóm chỉ-có-Zalo biến mất khỏi
        // kết quả, sale search đúng SĐT vẫn ra rỗng. Phân biệt bằng cờ `linked` bên dưới.
        const existingContacts = await prisma.contact.findMany({
          where: {
            orgId: user.orgId,
            mergedInto: null,
            OR: [
              ...(canonical ? [{ phoneNormalized: canonical }] : []),
              ...variantList.flatMap((v) => [
                { phone: { contains: v } },
                { phone2: { contains: v } },
                { phone3: { contains: v } },
              ]),
            ],
          },
          select: {
            id: true,
            fullName: true,
            crmName: true,
            phone: true,
            posCustomerId: true,
          },
          take: 10,
        });

        if (posCustomers.length === 0 && existingContacts.length === 0) {
          return { candidates: [] };
        }

        const linkedRows = posCustomers.length
          ? await prisma.contact.findMany({
              where: {
                orgId: user.orgId,
                posCustomerId: { in: posCustomers.map((c) => c.posId) },
              },
              select: { id: true, posCustomerId: true },
            })
          : [];
        const linkedByPosId = new Map(
          linkedRows.map((r) => [r.posCustomerId as number, r.id])
        );

        // 2026-07-31 fix: danh sách trên cố ý dò org-wide (để không tạo trùng), NHƯNG
        // GET /contacts/:id vẫn chặn theo contact-scope. Nếu không đánh dấu, sale bấm
        // vào KH ngoài phạm vi của mình sẽ ăn 403 mà không hiểu vì sao. Tính sẵn
        // `accessible` để FE nói rõ "KH của sale khác" thay vì để bấm rồi lỗi.
        const cScope = await getContactScope(user.id, user.orgId, user.role);
        const accessibleIds =
          cScope.accessibleContactIds === null
            ? null
            : new Set(cScope.accessibleContactIds);
        const canOpen = (contactId: string | null) => {
          if (!contactId) return true; // dòng POS thuần — chưa có Contact
          if (cScope.isOrgAdmin || accessibleIds === null) return true;
          return accessibleIds.has(contactId);
        };

        const candidates: Array<{
          posCustomerId: number | null;
          contactId: string | null;
          code: string | null;
          name: string;
          phone: string | null;
          linked: boolean;
          accessible: boolean;
        }> = [];
        const seenPosId = new Set<number>();

        for (const p of posCustomers) {
          const contactId = linkedByPosId.get(p.posId) ?? null;
          seenPosId.add(p.posId);
          candidates.push({
            posCustomerId: p.posId,
            contactId,
            code: p.code,
            name: p.name,
            phone: p.phone,
            linked: contactId !== null,
            accessible: canOpen(contactId),
          });
        }
        // Contact khớp SĐT chưa xuất hiện qua dòng POS ở trên → thêm vào.
        // linked (xám, "đã có") CHỈ khi đã gắn posCustomerId = đã là KH bên POS.
        // Contact Zalo/Facebook chưa có POS → linked=false, sale vẫn chọn được để
        // mở hồ sơ KH đó (không tạo bản ghi mới).
        for (const c of existingContacts) {
          if (c.posCustomerId != null && seenPosId.has(c.posCustomerId))
            continue;
          candidates.push({
            posCustomerId: c.posCustomerId,
            contactId: c.id,
            code: null,
            name: c.crmName || c.fullName || c.phone || "—",
            phone: c.phone,
            linked: c.posCustomerId != null,
            accessible: canOpen(c.id),
          });
        }

        // truncated: cả 2 nhánh đều take:10 — báo FE để sale biết còn kết quả khác,
        // tránh kết luận nhầm "KH không tồn tại" rồi tạo trùng.
        const truncated =
          posCustomers.length >= 10 || existingContacts.length >= 10;
        return { candidates, truncated };
      } catch (err) {
        logger.error("[contacts] pos-link-candidates error:", err);
        return reply
          .status(500)
          .send({ error: "Failed to search POS customers" });
      }
    }
  );

  // Tạo Contact từ record POS bằng đúng bộ field mapping của hisweetie-sync-cron, để cron đêm sau
  // match theo posCustomerId thay vì đẻ bản ghi thứ hai.
  // Cố ý KHÔNG bắn trigger contact_created: KH bên POS có trước cả CRM, gửi chuỗi chào mừng cho
  // khách đã mua lâu năm là sai.
  app.post(
    "/api/v1/contacts/link-pos",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const { posCustomerId } = request.body as { posCustomerId?: number };
        if (
          typeof posCustomerId !== "number" ||
          !Number.isFinite(posCustomerId)
        ) {
          return reply.status(400).send({ error: "posCustomerId required" });
        }

        const posCustomer = await prisma.posCustomer.findFirst({
          where: { orgId: user.orgId, posId: posCustomerId },
          select: {
            posId: true,
            code: true,
            name: true,
            phone: true,
            address: true,
          },
        });
        if (!posCustomer) {
          return reply.status(404).send({ error: "POS customer not found" });
        }

        // Race guard: 2 sale bấm liên kết cùng lúc → người sau nhận lại KH đã có.
        const existing = await prisma.contact.findFirst({
          where: { orgId: user.orgId, posCustomerId },
          select: { id: true, fullName: true, crmName: true, phone: true },
        });
        if (existing) {
          // 2026-07-31 fix: gắn luôn ContactAccess.collaborator cho sale bấm sau —
          // giống nhánh trùng SĐT của quick-create (M55). Thiếu bước này thì FE mở
          // ngay hồ sơ KH đó và ăn 403 từ assertContactVisible.
          await attachContactCollaboratorByUser({
            orgId: user.orgId,
            contactId: existing.id,
            userId: user.id,
            source: "pos_link_duplicate",
          });
          return reply.status(200).send({ exists: true, contact: existing });
        }

        const phoneNormalized = posCustomer.phone
          ? normalizePhone(posCustomer.phone)
          : null;
        const contact = await prisma.contact.create({
          data: {
            orgId: user.orgId,
            source: "POS",
            posCustomerId: posCustomer.posId,
            posCustomerCode: posCustomer.code,
            posSyncedAt: new Date(),
            fullName: posCustomer.name,
            phone: posCustomer.phone,
            phoneNormalized,
            addressLine: posCustomer.address,
            status: "new",
            hasZalo: null,
            assignedUserId: user.id,
            tags: [],
            metadata: {},
          },
          select: {
            id: true,
            fullName: true,
            crmName: true,
            phone: true,
            posCustomerId: true,
            source: true,
            assignedUserId: true,
          },
        });

        // ContactAccess primary cho sale liên kết (giống quick-create).
        await prisma.contactAccess.upsert({
          where: {
            contactId_userId: { contactId: contact.id, userId: user.id },
          },
          update: { role: "primary" },
          create: {
            orgId: user.orgId,
            contactId: contact.id,
            userId: user.id,
            role: "primary",
            source: "pos_link",
          },
        });

        logActivity({
          orgId: user.orgId,
          userId: user.id,
          action: "customer_create",
          entityType: "contact",
          entityId: contact.id,
          details: { via: "pos_link", posCustomerId: posCustomer.posId },
        });

        return reply.status(201).send({ exists: false, contact });
      } catch (err) {
        logger.error("[contacts] link-pos error:", err);
        return reply.status(500).send({ error: "Failed to link POS customer" });
      }
    }
  );

  // POST /api/v1/contacts/:id/virtual-conversation : M53 2026-05-30
  // Anh chốt Approach A: KH no-Zalo có conversation ảo trong /chat để sale ghi nhật ký + AI trợ lý.
  // Idempotent: nếu virtual conv đã tồn tại cho cặp (contact, nick mặc định của sale) thì return luôn.
  // externalThreadId synthetic: `virtual:{contactId}:{nickId}` để né unique constraint.
  app.post(
    "/api/v1/contacts/:id/virtual-conversation",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const { id: contactId } = request.params as { id: string };

        // 1. Verify contact thuộc org + visible
        const contact = await prisma.contact.findFirst({
          where: { id: contactId, orgId: user.orgId },
          select: {
            id: true,
            fullName: true,
            crmName: true,
            phone: true,
            hasZalo: true,
            assignedUserId: true,
          },
        });
        if (!contact)
          return reply.status(404).send({ error: "Contact không tồn tại" });
        await assertContactVisible({
          userId: user.id,
          orgId: user.orgId,
          legacyRole: user.role,
          contactId,
        });

        // 2. Pick nick — M55 2026-05-30: ưu tiên nick mình sở hữu, fallback nick org
        // (sale mới chưa có nick Zalo vẫn mở được virtual chat — vì virtual ko gửi SDK,
        // chỉ cần 1 zaloAccountId hợp lệ trong org để satisfy schema FK).
        const scope = await getZaloScope(user.id, user.orgId, user.role);
        let myNickId: string | null =
          scope.accessibleIds.find((id) => scope.ownedIds.has(id)) ??
          scope.accessibleIds[0] ??
          null;

        if (!myNickId) {
          // Fallback: pick bất kỳ ZaloAccount nào trong org (virtual chat ko cần nick thật)
          const anyNick = await prisma.zaloAccount.findFirst({
            where: { orgId: user.orgId },
            select: { id: true },
          });
          myNickId = anyNick?.id ?? null;
        }

        if (!myNickId) {
          return reply.status(400).send({
            error: "no_nick",
            message:
              "Tổ chức chưa có nick Zalo nào. Vui lòng kết nối ít nhất 1 nick để dùng chat nội bộ.",
          });
        }

        // 2b. ƯU TIÊN hội thoại Zalo THẬT đang có (fix 2026-06-24): nếu KH đã có chat
        // thật (isVirtual=false) trong phạm vi sale thấy → "Nhắn tin" mở ĐÚNG chat đó,
        // KHÔNG tạo virtual mới (trước đây bỏ qua → đẻ đoạn chat ảo trùng + welcome
        // "vừa tạo khách hàng" gây hiểu nhầm là tạo KH mới).
        const realConv = await prisma.conversation.findFirst({
          where: {
            orgId: user.orgId,
            contactId,
            isVirtual: false,
            zaloAccountId: { in: scope.accessibleIds },
          },
          orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } },
          select: { id: true },
        });
        if (realConv) {
          await attachContactCollaboratorByUser({
            orgId: user.orgId,
            contactId,
            userId: user.id,
            source: "virtual_chat_open",
          });
          return reply
            .status(200)
            .send({ conversationId: realConv.id, created: false });
        }

        // 3. Idempotent: tìm virtual conv đã có cho cặp (contact, nick) chưa
        const externalThreadId = `virtual:${contactId}:${myNickId}`;
        const existing = await prisma.conversation.findFirst({
          where: {
            orgId: user.orgId,
            contactId,
            zaloAccountId: myNickId,
            isVirtual: true,
          },
          select: { id: true },
        });

        if (existing) {
          // M55: idempotent — sale touch virtual conv → attach collaborator
          await attachContactCollaboratorByUser({
            orgId: user.orgId,
            contactId,
            userId: user.id,
            source: "virtual_chat_open",
          });
          // M55.3 2026-05-30: trigger AI dup-alert message nếu chưa từng gửi (idempotent)
          void sendDuplicateAlertMessage(
            existing.id,
            contactId,
            user.orgId,
            contact,
            myNickId,
            (app as any).io
          );
          return reply
            .status(200)
            .send({ conversationId: existing.id, created: false });
        }

        // 4. Create virtual conv mới
        const created = await prisma.conversation.create({
          data: {
            orgId: user.orgId,
            zaloAccountId: myNickId,
            contactId,
            threadType: "user",
            externalThreadId,
            isVirtual: true,
            lastMessageAt: new Date(),
            tab: "main",
          },
          select: { id: true },
        });

        // M55 2026-05-30: Sale vừa mở virtual chat → auto-attach collaborator.
        // Đảm bảo counter "Cùng chăm" tự tăng, KH hiện trong list của sale.
        await attachContactCollaboratorByUser({
          orgId: user.orgId,
          contactId,
          userId: user.id,
          source: "virtual_chat_open",
        });

        // 5. M53.1 2026-05-30: Welcome AI message lần đầu — hardcode (KHÔNG gọi Gemini)
        // Anh chốt: khi sale tạo KH mới chưa có Zalo, AI Trợ Lý chào ngay + hướng dẫn
        // sale chat vào để lưu thông tin bổ sung. Không tốn token Gemini.
        const khName = contact.crmName || contact.fullName || "KH";
        const khPhone = contact.phone || "chưa có SĐT";
        const welcomeContent =
          `Chào anh/chị! Đây là kênh nhật ký chăm sóc cho KH **${khName}** (SĐT ${khPhone}) — KH này chưa có Zalo công khai.\n\n` +
          `Anh/chị có thể chat vào đây để ghi nhật ký chăm sóc + bổ sung thông tin KH. ` +
          `Mỗi tin anh/chị gõ, em sẽ tự động gợi ý câu hỏi khai thác và đề xuất cập nhật thông tin lên hệ thống.\n\n` +
          `Để bắt đầu, anh/chị thử gõ vài thông tin đã biết về KH ${khName} (vd: tuổi, nghề nghiệp, khu vực muốn mua, ngân sách...) để em hỗ trợ nhé!`;

        const welcomeLocalId = `local:${randomUUID()}`;
        const welcomeMessage = await prisma.message.create({
          data: {
            id: randomUUID(),
            conversationId: created.id,
            zaloMsgId: welcomeLocalId,
            zaloMsgIdNum: null,
            senderType: "ai_assistant",
            senderUid: "ai:virtual-chat",
            senderName: "Trợ lý",
            content: welcomeContent,
            contentType: "text",
            sentAt: new Date(),
            isLocal: true,
            sentVia: "system",
          },
        });

        // Update conversation lastMessageAt + preview
        await prisma.conversation.update({
          where: { id: created.id },
          data: { lastMessageAt: new Date() },
        });

        // Emit socket cho realtime (nếu sale đang mở /chat)
        // PRIVACY 2026-06-11: qua emit-chat (redact + scope org). myNickId là nick nội
        // bộ của chính sale (owner=sale) nên chính chủ vẫn nhận thật; nếu nick để main,
        // người khác nhận bản mờ.
        const io = (app as any).io as Server | undefined;
        const myNickPriv = await prisma.zaloAccount.findUnique({
          where: { id: myNickId },
          select: { privacyMode: true, ownerUserId: true },
        });
        await emitChatMessage({
          io,
          orgId: user.orgId,
          accountId: myNickId,
          conversationId: created.id,
          message: { ...welcomeMessage, zaloMsgIdNum: null as string | null },
          privacyMode: myNickPriv?.privacyMode ?? "sub",
          ownerUserId: myNickPriv?.ownerUserId ?? null,
          extra: { _virtual: true, _aiAssistant: true, _welcome: true },
        });

        // M55.3 2026-05-30: AI message #2 — Cảnh báo KH duplicate sau welcome 2.5s.
        // Detect duplicate: collaborator count > 1 HOẶC có note cũ. Fire-and-forget.
        void sendDuplicateAlertMessage(
          created.id,
          contactId,
          user.orgId,
          contact,
          myNickId,
          io
        );

        // 6. Audit log (fire-and-forget)
        logActivity({
          orgId: user.orgId,
          userId: user.id,
          category: "system",
          action: "virtual_conversation_created",
          entityType: "contact",
          entityId: contactId,
          details: {
            conversationId: created.id,
            nickId: myNickId,
            contactHasZalo: contact.hasZalo,
            welcomeMessageId: welcomeMessage.id,
          },
        });

        return reply
          .status(201)
          .send({ conversationId: created.id, created: true });
      } catch (err) {
        logger.error("[contacts] virtual-conversation error:", err);
        return reply
          .status(500)
          .send({ error: "Failed to create virtual conversation" });
      }
    }
  );

  // PUT /api/v1/contacts/:id : update CRM fields
  app.put(
    "/api/v1/contacts/:id",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const { id } = request.params as { id: string };
        const body = request.body as Record<string, any>;

        const existing = await prisma.contact.findFirst({
          where: { id, orgId: user.orgId },
          select: {
            id: true,
            status: true,
            statusId: true,
            fullName: true,
            phone: true,
            source: true,
            assignedUserId: true,
            crmName: true,
            email: true,
            gender: true,
            birthDate: true,
            leadScore: true,
            addressLine: true,
            occupation: true,
            posCustomerId: true,
          },
        });
        if (!existing)
          return reply.status(404).send({ error: "Contact not found" });

        // M55 2026-05-30: Gate edit theo ContactAccess (RBAC hole trước đây — ai
        // trong org cũng PUT được). Bây giờ chỉ owner/admin + primary/collaborator
        // mới sửa được. Sale khác → 403 "KH không thuộc danh sách chăm của bạn".
        try {
          await assertContactEditable({
            userId: user.id,
            orgId: user.orgId,
            legacyRole: user.role,
            contactId: id,
          });
        } catch (permErr: any) {
          const code = permErr?.statusCode ?? 403;
          return reply.status(code).send({
            error: permErr?.code || "CONTACT_EDIT_FORBIDDEN",
            message: permErr?.message || "Không có quyền sửa KH này",
          });
        }

        // statusId: undefined thì giữ nguyên, null là tháo trạng thái, string thì phải verify Status
        // thuộc cùng org trước khi ghi.
        let statusIdPatch: string | null | undefined;
        if (body.statusId !== undefined) {
          if (body.statusId === null) {
            statusIdPatch = null;
          } else if (
            typeof body.statusId === "string" &&
            body.statusId.trim()
          ) {
            const trimmed = body.statusId.trim();
            const statusRow = await prisma.status.findFirst({
              where: { id: trimmed, orgId: user.orgId },
              select: { id: true },
            });
            if (!statusRow) {
              return reply.status(400).send({
                error: "status_not_found",
                hint: "statusId không thuộc org hoặc không tồn tại",
              });
            }
            statusIdPatch = trimmed;
          } else {
            return reply.status(400).send({ error: "statusId_invalid" });
          }
        }

        // GUARD chống "blur ăn vào data" (anh báo 2026-06-15): từ chối ghi tên chứa ▒
        // (giá trị đã-blur bị lưu ngược). Bảo vệ tên thật KH khỏi bị BLUR_TOKEN đè.
        if (
          isBlurContaminated(body.fullName) ||
          isBlurContaminated(body.crmName)
        ) {
          return reply.status(400).send({
            error: "blur_contaminated_name",
            hint: "Tên chứa ký tự che (▒) — không thể lưu giá trị đã làm mờ vào dữ liệu gốc",
          });
        }

        const updateData: any = {
          fullName: body.fullName,
          crmName: body.crmName,
          phone: body.phone,
          email: body.email,
          avatarUrl: body.avatarUrl,
          source: body.source,
          sourceDate: body.sourceDate ? new Date(body.sourceDate) : undefined,
          status: body.status,
          nextAppointment: body.nextAppointment
            ? new Date(body.nextAppointment)
            : undefined,
          assignedUserId: body.assignedUserId,
          notes: body.notes,
          tags: body.tags,
          metadata: body.metadata,
        };
        // Hồ sơ KH tổng (CustomerProfileDialog 2026-06-03): cho sửa demographic +
        // multi-phone từ UI hồ sơ. Chỉ patch khi field xuất hiện trong body (undefined → giữ nguyên).
        // Sale chỉnh giới tính TAY → khoá để sync SDK (zinstant/cron) không đè ngược (#2 2026-06-18).
        // Bỏ trống = mở khoá lại (cho SDK tự điền).
        if (body.gender !== undefined) {
          updateData.gender = body.gender || null;
          updateData.genderLocked = !!body.gender;
        }
        if (body.occupation !== undefined)
          updateData.occupation = body.occupation || null;
        if (body.addressLine !== undefined)
          updateData.addressLine = body.addressLine || null;
        if (body.province !== undefined)
          updateData.province = body.province || null;
        if (body.district !== undefined)
          updateData.district = body.district || null;
        if (body.birthYear !== undefined) {
          const by =
            typeof body.birthYear === "string"
              ? parseInt(body.birthYear, 10)
              : body.birthYear;
          updateData.birthYear =
            Number.isFinite(by) && by > 1900 && by < 2100 ? by : null;
        }
        if (body.phonesExtra !== undefined) {
          updateData.phonesExtra = Array.isArray(body.phonesExtra)
            ? body.phonesExtra.filter(
                (p: any) => p && typeof p.phone === "string" && p.phone.trim()
              )
            : null;
        }
        if (statusIdPatch !== undefined) {
          updateData.statusId = statusIdPatch;
        }
        if (body.firstContactDate !== undefined) {
          updateData.firstContactDate = body.firstContactDate
            ? new Date(body.firstContactDate)
            : null;
        }

        const updated = await prisma.contact.update({
          where: { id },
          data: updateData,
          include: {
            assignedUser: { select: { id: true, fullName: true, email: true } },
            appointments: { orderBy: { appointmentDate: "desc" }, take: 10 },
            _count: { select: { conversations: true } },
          },
        });

        // Sửa field mà POS nhận được thì đẩy ngược sang POS sau 2s debounce.
        // KHÔNG lắng nghe addressLine vì API POS từ chối addresses, xếp job push địa chỉ chỉ tốn công.
        if (
          existing.posCustomerId != null &&
          (body.fullName !== undefined ||
            body.crmName !== undefined ||
            body.phone !== undefined ||
            body.email !== undefined)
        ) {
          void scheduleHisweetiePush(existing.id).catch((err) =>
            logger.warn(
              `[hisweetie-push] schedule failed for contact ${existing.id}:`,
              err
            )
          );
        }

        if (existing.status !== updated.status) {
          const org = await prisma.organization.findUnique({
            where: { id: user.orgId },
            select: { id: true, name: true },
          });
          void runAutomationRules({
            trigger: "status_changed",
            orgId: user.orgId,
            org,
            contact: {
              id: updated.id,
              fullName: updated.fullName,
              phone: updated.phone,
              status: updated.status,
              source: updated.source,
              assignedUserId: updated.assignedUserId,
            },
          });
        }

        // Ngày 1 fix: trigger automation rule cho contact_status_changed khi statusId (dynamic) đổi.
        // Legacy `status` enum đã fire 'status_changed' ở trên — đây là trigger MỚI cho Status table.
        if (existing.statusId !== updated.statusId) {
          const org = await prisma.organization.findUnique({
            where: { id: user.orgId },
            select: { id: true, name: true },
          });
          void runAutomationRules({
            trigger: "contact_status_changed",
            orgId: user.orgId,
            org,
            contact: {
              id: updated.id,
              fullName: updated.fullName,
              phone: updated.phone,
              status: updated.status,
              source: updated.source,
              assignedUserId: updated.assignedUserId,
              // Truyền statusId mới + cũ để rule filter
              statusId: updated.statusId,
              previousStatusId: existing.statusId,
            } as any,
          });

          // 2026-06-06 (Anh chốt) — emit 'friend:updated' (kênh có sẵn) để sync realtime
          // giai đoạn KH cross-device: cột 3 header / cột 4 / friend row / trang /friends.
          // FE use-friend-socket mutate cache theo patch.statusId. Emit cho MỌI friend của contact.
          try {
            const io = (app as any).io as Server | undefined;
            if (io) {
              const friends = await prisma.friend.findMany({
                where: { contactId: updated.id },
                select: { id: true, zaloAccountId: true, zaloUidInNick: true },
              });
              for (const f of friends) {
                io.to(`org:${user.orgId}`).emit("friend:updated", {
                  friendId: f.id,
                  contactId: updated.id,
                  zaloAccountId: f.zaloAccountId,
                  zaloUidInNick: f.zaloUidInNick,
                  patch: { statusId: updated.statusId },
                });
              }
            }
          } catch (err) {
            logger.warn(
              "[contacts] emit friend:updated (statusId) failed: %s",
              (err as Error).message
            );
          }
        }

        // ACTIVITY LOG : diff với existing để log đúng action types
        // Tách action-specific logs (status, score) vs bulk customer_update.
        // Status change ưu tiên (workflow critical), score change track delta.
        if (existing.status !== updated.status) {
          logActivity({
            orgId: user.orgId,
            userId: user.id,
            action: "status_change",
            entityType: "contact",
            entityId: updated.id,
            details: { old: existing.status, new: updated.status },
          });
        }
        // Ngày 1 fix: log status_id diff song song với legacy status enum.
        // Khi sale đổi trạng thái dynamic (Status table) → activity feed phải show.
        // 2026-06-06 (Anh): lookup TÊN status để timeline hiện "Tiếp Cận → Hẹn gặp"
        // (giống tag Zalo old→new). ActivityItem đọc details.old/.new → lưu tên vào đó.
        if (existing.statusId !== updated.statusId) {
          const statusIds = [existing.statusId, updated.statusId].filter(
            (id): id is string => !!id
          );
          const statusRows = statusIds.length
            ? await prisma.status.findMany({
                where: { id: { in: statusIds }, orgId: user.orgId },
                select: { id: true, name: true },
              })
            : [];
          const nameById = new Map(statusRows.map((s) => [s.id, s.name]));
          logActivity({
            orgId: user.orgId,
            userId: user.id,
            action: "status_change",
            entityType: "contact",
            entityId: updated.id,
            details: {
              old: existing.statusId
                ? (nameById.get(existing.statusId) ?? null)
                : null,
              new: updated.statusId
                ? (nameById.get(updated.statusId) ?? null)
                : null,
              oldStatusId: existing.statusId,
              newStatusId: updated.statusId,
            },
          });
        }
        if (existing.leadScore !== updated.leadScore) {
          logActivity({
            orgId: user.orgId,
            userId: user.id,
            action: "score_change",
            entityType: "contact",
            entityId: updated.id,
            details: {
              old: existing.leadScore,
              new: updated.leadScore,
              delta: updated.leadScore - existing.leadScore,
            },
          });
        }
        // Bulk customer_info changes (fullName/phone/email/gender/birthDate/...) → 1 log
        const infoDiff = computeDiff(
          existing as Record<string, unknown>,
          updated as Record<string, unknown>,
          [
            "fullName",
            "crmName",
            "phone",
            "email",
            "gender",
            "birthDate",
            "addressLine",
            "occupation",
            "assignedUserId",
          ]
        );
        if (Object.keys(infoDiff).length > 0) {
          logActivity({
            orgId: user.orgId,
            userId: user.id,
            action: "customer_update",
            entityType: "contact",
            entityId: updated.id,
            details: { changes: infoDiff },
          });
          // Outbound webhook cho external systems (vd GetFly sync) — fire-and-forget
          void emitWebhook(user.orgId, "contact.updated", {
            contactId: updated.id,
            changes: infoDiff,
            contact: {
              id: updated.id,
              fullName: updated.fullName,
              crmName: updated.crmName,
              phone: updated.phone,
              email: updated.email,
              source: updated.source,
              status: updated.status,
              gender: updated.gender,
              leadScore: updated.leadScore,
            },
          });

          // M55 2026-05-30: Emit socket cho collaborator để FE toast "Sale X
          // vừa sửa SDT KH Y lúc HH:mm" — đồng bộ realtime giữa các sale cùng chăm.
          const io = (app as any).io as Server | undefined;
          if (io) {
            // Lấy tên sale + list collaborator userIds
            const [actor, accesses] = await Promise.all([
              prisma.user.findUnique({
                where: { id: user.id },
                select: { fullName: true, email: true },
              }),
              prisma.contactAccess.findMany({
                where: { contactId: updated.id, orgId: user.orgId },
                select: { userId: true },
              }),
            ]);
            io.to(`org:${user.orgId}`).emit("contact:updated", {
              contactId: updated.id,
              contactName: updated.crmName || updated.fullName,
              changedBy: {
                userId: user.id,
                fullName: actor?.fullName || actor?.email || "Sale",
              },
              changedFields: Object.keys(infoDiff),
              changes: infoDiff,
              notifyUserIds: accesses
                .map((a) => a.userId)
                .filter((uid) => uid !== user.id),
              at: new Date().toISOString(),
            });
          }
        }

        return updated;
      } catch (err) {
        logger.error("[contacts] Update error:", err);
        return reply.status(500).send({ error: "Failed to update contact" });
      }
    }
  );

  // PUT /api/v1/contacts/:id/tags : update tags only
  app.put(
    "/api/v1/contacts/:id/tags",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const { id } = request.params as { id: string };
        const { tags } = request.body as { tags: string[] };

        if (!Array.isArray(tags))
          return reply.status(400).send({ error: "tags must be an array" });

        // Defensive: strip Zalo-mirror tags (🔵 X) trước khi ghi Contact.tags.
        // Zalo-mirror là per-nick, sống ở Friend.crmTagsPerNick — KHÔNG bao giờ
        // được phép viết vào Contact.tags (cross-nick) qua endpoint này.
        const filteredTags = tags.filter(
          (t) => typeof t === "string" && !t.startsWith("🔵 ")
        );

        const existing = await prisma.contact.findFirst({
          where: { id, orgId: user.orgId },
          select: { id: true, tags: true },
        });
        if (!existing)
          return reply.status(404).send({ error: "Contact not found" });

        // M55 2026-05-30: Gate edit theo ContactAccess (cùng pattern PUT /contacts/:id)
        try {
          await assertContactEditable({
            userId: user.id,
            orgId: user.orgId,
            legacyRole: user.role,
            contactId: id,
          });
        } catch (permErr: any) {
          const code = permErr?.statusCode ?? 403;
          return reply.status(code).send({
            error: permErr?.code || "CONTACT_EDIT_FORBIDDEN",
            message: permErr?.message || "Không có quyền sửa tags KH này",
          });
        }

        const oldTags = Array.isArray(existing.tags)
          ? (existing.tags as string[])
          : [];

        // Wave 3 M57 /plan-eng-review: route qua tag-service để dual-write junction + legacy.
        // Diff old vs new → call addCrmTag/removeCrmTag để mỗi op atomic transaction.
        const { addCrmTag, removeCrmTag } =
          await import("../tags/tag-service.js");
        const added = filteredTags.filter((t) => !oldTags.includes(t));
        const removed = oldTags.filter((t) => !filteredTags.includes(t));

        for (const tagName of added) {
          try {
            const res = await addCrmTag({
              contactId: id,
              tagName,
              source: "manual_crm",
              addedBy: user.id,
              autoCreate: true,
            });
            // CareSession 2026-06-07: gắn CRM tag → đóng phiên nếu ∈ closeConditions.
            if (res?.tag?.id) {
              const { onTagAdded } =
                await import("../../shared/ee-registry/automation.js");
              await onTagAdded({
                orgId: user.orgId,
                contactId: id,
                tagKind: "crmTag",
                tagId: res.tag.id,
              });
            }
          } catch (err) {
            logger.warn(
              "[PUT /contacts/:id/tags] addCrmTag fail %s: %s",
              tagName,
              (err as Error).message
            );
          }
        }
        for (const tagName of removed) {
          try {
            // Lookup Tag.id qua slug
            const { slugifyTag } = await import("../../shared/tag-slug.js");
            const slug = slugifyTag(tagName);
            const tag = await prisma.tag.findFirst({
              where: {
                orgId: user.orgId,
                scope: "crm",
                slug,
                zaloAccountId: null,
              },
            });
            if (tag) {
              await removeCrmTag({
                contactId: id,
                tagId: tag.id,
                removedBy: user.id,
              });
            }
          } catch (err) {
            logger.warn(
              "[PUT /contacts/:id/tags] removeCrmTag fail %s: %s",
              tagName,
              (err as Error).message
            );
          }
        }

        // dual-write đã ghi Contact.tags qua service, đọc lại để return latest
        const updated = await prisma.contact.findUnique({ where: { id } });
        if (!updated)
          return reply
            .status(404)
            .send({ error: "Contact not found after update" });

        // ACTIVITY LOG : diff tags added/removed (so với filteredTags vì đó là DB state mới)
        // (added/removed đã compute ở trên cho dual-write)
        for (const t of added) {
          logActivity({
            orgId: user.orgId,
            userId: user.id,
            action: "tag_add_crm",
            entityType: "contact",
            entityId: updated.id,
            details: { tag: t, level: "contact" },
          });
        }
        for (const t of removed) {
          logActivity({
            orgId: user.orgId,
            userId: user.id,
            action: "tag_remove_crm",
            entityType: "contact",
            entityId: updated.id,
            details: { tag: t, level: "contact" },
          });
        }

        return updated;
      } catch (err) {
        logger.error("[contacts] Update tags error:", err);
        return reply.status(500).send({ error: "Failed to update tags" });
      }
    }
  );

  // Mọi thao tác xoá KH (archive, restore, purge) đều siết về owner-only. Cố ý không dùng grant
  // để không ai cấp lại quyền này qua nhóm quyền được.
  app.delete(
    "/api/v1/contacts/:id",
    {
      config: { contentClass: "mixed" },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        if (user.role !== "owner") {
          return reply.status(403).send({
            error: "Chỉ owner mới có quyền xoá khách hàng",
            code: "OWNER_ONLY",
          });
        }
        const { id } = request.params as { id: string };

        const existing = await prisma.contact.findFirst({
          where: { id, orgId: user.orgId },
          select: { id: true, archivedAt: true },
        });
        if (!existing)
          return reply.status(404).send({ error: "Contact not found" });
        if (existing.archivedAt)
          return { success: true, alreadyArchived: true };

        await prisma.contact.update({
          where: { id },
          data: { archivedAt: new Date(), archivedById: user.id },
        });
        return { success: true };
      } catch (err) {
        logger.error("[contacts] Archive error:", err);
        return reply.status(500).send({ error: "Failed to archive contact" });
      }
    }
  );

  // POST /api/v1/contacts/bulk-archive : soft-delete hàng loạt
  // Owner-only 2026-07-31 — xem docblock ở DELETE /contacts/:id.
  app.post(
    "/api/v1/contacts/bulk-archive",
    {
      config: { contentClass: "mixed" },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        if (user.role !== "owner") {
          return reply.status(403).send({
            error: "Chỉ owner mới có quyền xoá khách hàng",
            code: "OWNER_ONLY",
          });
        }
        const { ids } = request.body as { ids: string[] };
        if (!Array.isArray(ids) || ids.length === 0) {
          return reply
            .status(400)
            .send({ error: "ids phải là mảng không rỗng" });
        }
        // Giới hạn 200/lần để tránh request quá nặng + DB spike.
        if (ids.length > 200) {
          return reply.status(400).send({ error: "Tối đa 200 KH mỗi lần" });
        }
        const now = new Date();
        const result = await prisma.contact.updateMany({
          where: { id: { in: ids }, orgId: user.orgId, archivedAt: null },
          data: { archivedAt: now, archivedById: user.id },
        });
        return { success: true, archived: result.count };
      } catch (err) {
        logger.error("[contacts] Bulk archive error:", err);
        return reply
          .status(500)
          .send({ error: "Failed to bulk archive contacts" });
      }
    }
  );

  // POST /api/v1/contacts/:id/restore : khôi phục từ Thùng rác
  // Owner-only 2026-07-31 — khôi phục cũng là một tầng với xoá.
  app.post(
    "/api/v1/contacts/:id/restore",
    {
      config: { contentClass: "mixed" },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        if (user.role !== "owner") {
          return reply.status(403).send({
            error: "Chỉ owner mới có quyền khôi phục khách hàng",
            code: "OWNER_ONLY",
          });
        }
        const { id } = request.params as { id: string };

        const existing = await prisma.contact.findFirst({
          where: { id, orgId: user.orgId },
          select: { id: true, archivedAt: true },
        });
        if (!existing)
          return reply.status(404).send({ error: "Contact not found" });
        if (!existing.archivedAt) return { success: true, alreadyActive: true };

        await prisma.contact.update({
          where: { id },
          data: { archivedAt: null, archivedById: null },
        });
        return { success: true };
      } catch (err) {
        logger.error("[contacts] Restore error:", err);
        return reply.status(500).send({ error: "Failed to restore contact" });
      }
    }
  );

  // POST /api/v1/contacts/bulk-restore : khôi phục hàng loạt
  // Owner-only 2026-07-31 — khôi phục cũng là một tầng với xoá.
  app.post(
    "/api/v1/contacts/bulk-restore",
    {
      config: { contentClass: "mixed" },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        if (user.role !== "owner") {
          return reply.status(403).send({
            error: "Chỉ owner mới có quyền khôi phục khách hàng",
            code: "OWNER_ONLY",
          });
        }
        const { ids } = request.body as { ids: string[] };
        if (!Array.isArray(ids) || ids.length === 0) {
          return reply
            .status(400)
            .send({ error: "ids phải là mảng không rỗng" });
        }
        if (ids.length > 200) {
          return reply.status(400).send({ error: "Tối đa 200 KH mỗi lần" });
        }
        const result = await prisma.contact.updateMany({
          where: {
            id: { in: ids },
            orgId: user.orgId,
            archivedAt: { not: null },
          },
          data: { archivedAt: null, archivedById: null },
        });
        return { success: true, restored: result.count };
      } catch (err) {
        logger.error("[contacts] Bulk restore error:", err);
        return reply
          .status(500)
          .send({ error: "Failed to bulk restore contacts" });
      }
    }
  );

  // DELETE /api/v1/contacts/:id/permanent : xóa vĩnh viễn (OWNER ONLY)
  // Chỉ áp dụng cho contact đã archive. Owner/admin duy nhất — không qua grant để
  // đảm bảo không ai khác kể cả khi có grant contact.delete cũng không purge được.
  app.delete(
    "/api/v1/contacts/:id/permanent",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        if (user.role !== "owner") {
          return reply.status(403).send({
            error: "Chỉ owner mới có quyền xóa vĩnh viễn",
            code: "OWNER_ONLY",
          });
        }
        const { id } = request.params as { id: string };

        const existing = await prisma.contact.findFirst({
          where: { id, orgId: user.orgId },
          select: { id: true, archivedAt: true },
        });
        if (!existing)
          return reply.status(404).send({ error: "Contact not found" });
        if (!existing.archivedAt) {
          return reply.status(409).send({
            error: "Phải archive trước khi xóa vĩnh viễn",
            code: "NOT_ARCHIVED",
          });
        }

        await prisma.contact.delete({ where: { id } });
        return { success: true };
      } catch (err) {
        logger.error("[contacts] Permanent delete error:", err);
        return reply
          .status(500)
          .send({ error: "Failed to permanently delete contact" });
      }
    }
  );

  // POST /api/v1/contacts/bulk-purge : xóa vĩnh viễn hàng loạt (OWNER ONLY)
  app.post(
    "/api/v1/contacts/bulk-purge",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        if (user.role !== "owner") {
          return reply.status(403).send({
            error: "Chỉ owner mới có quyền xóa vĩnh viễn",
            code: "OWNER_ONLY",
          });
        }
        const { ids } = request.body as { ids: string[] };
        if (!Array.isArray(ids) || ids.length === 0) {
          return reply
            .status(400)
            .send({ error: "ids phải là mảng không rỗng" });
        }
        if (ids.length > 200) {
          return reply.status(400).send({ error: "Tối đa 200 KH mỗi lần" });
        }
        // Chỉ purge các KH đang archive (an toàn — bắt buộc 2 bước).
        const result = await prisma.contact.deleteMany({
          where: {
            id: { in: ids },
            orgId: user.orgId,
            archivedAt: { not: null },
          },
        });
        return { success: true, purged: result.count };
      } catch (err) {
        logger.error("[contacts] Bulk purge error:", err);
        return reply
          .status(500)
          .send({ error: "Failed to bulk purge contacts" });
      }
    }
  );

  // GET /api/v1/contacts/duplicates : list unresolved duplicate groups
  app.get(
    "/api/v1/contacts/duplicates",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const {
          page = "1",
          limit = "20",
          resolved = "false",
        } = request.query as QueryParams;

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const where = { orgId: user.orgId, resolved: resolved === "true" };

        const [groups, total] = await Promise.all([
          prisma.duplicateGroup.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (pageNum - 1) * limitNum,
            take: limitNum,
          }),
          prisma.duplicateGroup.count({ where }),
        ]);

        // Expand contact data for each group. Sort theo "richness" — KH có nhiều
        // data hơn (friends, convs, fullName, phone, globalId) đứng TRƯỚC làm
        // primary đề xuất. Tie-break: createdAt cũ hơn lên trước.
        const expanded = await Promise.all(
          groups.map(async (group) => {
            const contacts = await prisma.contact.findMany({
              where: { id: { in: group.contactIds } },
              select: {
                id: true,
                fullName: true,
                crmName: true,
                phone: true,
                email: true,
                zaloUid: true,
                zaloGlobalId: true,
                zaloUsername: true,
                avatarUrl: true,
                source: true,
                status: true,
                tags: true,
                createdAt: true,
                leadScore: true,
                lastActivity: true,
                hasZalo: true,
                lastInboundAt: true,
                lastOutboundAt: true,
                totalInbound: true,
                totalOutbound: true,
                assignedUser: { select: { id: true, fullName: true } },
                statusRef: { select: { id: true, name: true, color: true } },
                _count: {
                  select: {
                    conversations: true,
                    appointments: true,
                    friends: true,
                  },
                },
              },
            });
            // Compute richness score — số field có data + bonus cho friends/convs/apts.
            const scored = contacts.map((c) => {
              const richness =
                (c.fullName ? 1 : 0) +
                (c.crmName ? 1 : 0) +
                (c.phone ? 1 : 0) +
                (c.email ? 1 : 0) +
                (c.zaloUid ? 1 : 0) +
                (c.zaloGlobalId ? 1 : 0) +
                (c.zaloUsername ? 1 : 0) +
                (c.avatarUrl ? 1 : 0) +
                (c._count.friends || 0) * 3 +
                (c._count.conversations || 0) * 2 +
                (c._count.appointments || 0) * 2 +
                (Array.isArray(c.tags) && c.tags.length > 0 ? 1 : 0);
              return { ...c, _richness: richness };
            });
            // Sort: richness DESC, then createdAt ASC (older first)
            scored.sort((a, b) => {
              if (a._richness !== b._richness) return b._richness - a._richness;
              return (
                new Date(a.createdAt).getTime() -
                new Date(b.createdAt).getTime()
              );
            });
            return { ...group, contacts: scored };
          })
        );

        // PRIVACY 2026-06-11 (audit H6): blur PII KH thuộc nick main non-owner trong
        // các nhóm trùng (detector gom toàn org). Batch 1 lần qua tất cả contactId.
        const { buildPrivacyContext, buildOffendingContactIds, redactContact } =
          await import("../privacy/redact.js");
        const privacyCtx = await buildPrivacyContext(request);
        const allIds = expanded.flatMap((g) =>
          g.contacts.map((c: any) => c.id)
        );
        const offending = await buildOffendingContactIds(allIds, privacyCtx);
        const safeGroups = expanded.map((g) => ({
          ...g,
          contacts: g.contacts.map((c: any) =>
            offending.has(c.id) ? redactContact(c, privacyCtx) : c
          ),
        }));

        return { groups: safeGroups, total, page: pageNum, limit: limitNum };
      } catch (err) {
        logger.error("[contacts] Duplicates list error:", err);
        return reply
          .status(500)
          .send({ error: "Failed to fetch duplicate groups" });
      }
    }
  );

  // POST /api/v1/contacts/duplicates/:groupId/dismiss : bỏ qua group (false positive)
  // Mark group resolved without merging. Dùng khi sale review thấy 2 contact thực sự
  // là 2 người khác nhau (vd cùng tên SDT nhưng khác Zalo identity / khác giới tính).
  app.post(
    "/api/v1/contacts/duplicates/:groupId/dismiss",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const { groupId } = request.params as { groupId: string };
        const group = await prisma.duplicateGroup.findFirst({
          where: { id: groupId, orgId: user.orgId, resolved: false },
        });
        if (!group)
          return reply.status(404).send({ error: "Duplicate group not found" });
        await prisma.duplicateGroup.update({
          where: { id: groupId },
          data: { resolved: true },
        });
        await prisma.activityLog
          .create({
            data: {
              orgId: user.orgId,
              userId: user.id,
              action: "duplicate_group_dismissed",
              entityType: "duplicate_group",
              entityId: groupId,
              details: {
                contactIds: group.contactIds,
                matchType: group.matchType,
              },
            },
          })
          .catch(() => {});
        return reply.send({ dismissed: true });
      } catch (err) {
        logger.error("[contacts] Dismiss duplicate error:", err);
        return reply
          .status(500)
          .send({ error: "Failed to dismiss duplicate group" });
      }
    }
  );

  // POST /api/v1/contacts/duplicates/:groupId/merge : merge a group
  app.post(
    "/api/v1/contacts/duplicates/:groupId/merge",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const { groupId } = request.params as { groupId: string };
        const { primaryContactId } = request.body as {
          primaryContactId: string;
        };

        if (!primaryContactId)
          return reply
            .status(400)
            .send({ error: "primaryContactId is required" });

        const group = await prisma.duplicateGroup.findFirst({
          where: { id: groupId, orgId: user.orgId, resolved: false },
        });
        if (!group)
          return reply.status(404).send({ error: "Duplicate group not found" });

        const secondaryIds = group.contactIds.filter(
          (id) => id !== primaryContactId
        );
        if (secondaryIds.length === 0)
          return reply
            .status(400)
            .send({ error: "Primary must be in the group" });

        const merged = await mergeContacts(
          user.orgId,
          user.id,
          primaryContactId,
          secondaryIds
        );

        // Resolve the group
        await prisma.duplicateGroup.update({
          where: { id: groupId },
          data: { resolved: true },
        });

        return merged;
      } catch (err: any) {
        logger.error("[contacts] Merge error:", err);
        return reply
          .status(400)
          .send({ error: err.message || "Failed to merge contacts" });
      }
    }
  );

  // POST /api/v1/contacts/intelligence/recompute : manual trigger
  app.post(
    "/api/v1/contacts/intelligence/recompute",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Fire and forget — return 202 immediately
        runContactIntelligence().catch((err) => {
          logger.error("[contacts] Recompute error:", err);
        });
        return reply
          .status(202)
          .send({ message: "Intelligence recompute started" });
      } catch (err) {
        logger.error("[contacts] Recompute trigger error:", err);
        return reply.status(500).send({ error: "Failed to start recompute" });
      }
    }
  );

  // GET /api/v1/contacts/:id/friendships : list Friend rows (per CRM nick chăm KH)
  // Sprint v3 Tuần 3 Row 6.9 (2026-06-03): wrap RBAC. Dùng requireAnyGrant để sale
  // (chỉ có contact.access) lẫn admin (có friend.access) đều dùng được dropdown nick.
  app.get(
    "/api/v1/contacts/:id/friendships",
    {
      preHandler: [
        requireAnyGrant(["contact", "access"], ["friend", "access"]),
      ],
      config: {
        contentClass: "metadata",
        rbacResource: "contact",
        rbacAction: "access",
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const { id } = request.params as { id: string };
        const contact = await prisma.contact.findFirst({
          where: { id, orgId: user.orgId },
          select: { id: true },
        });
        if (!contact)
          return reply.status(404).send({ error: "Contact not found" });

        const friendships = await prisma.friend.findMany({
          // FIX 4 nick-ghost (2026-06-13): lọc Friend thẻ ma/đã ẩn + dòng quan hệ ghost
          // (đồng bộ với AGGREGATE_INCLUDE) → panel "Cùng chăm" của 1 KH không hiện 3 thẻ ma.
          where: {
            contactId: id,
            orgId: user.orgId,
            relationshipKind: { not: "ghost" },
            zaloAccount: { archivedAt: null },
          },
          include: {
            zaloAccount: {
              select: {
                id: true,
                displayName: true,
                phone: true,
                zaloUid: true,
                avatarUrl: true,
                // PRIVACY 2026-06-11 (audit H4): cần để redactFriend quyết định blur.
                privacyMode: true,
                ownerUserId: true,
                owner: { select: { id: true, fullName: true } },
              },
            },
          },
          orderBy: { lastInboundAt: { sort: "desc", nulls: "last" } },
        });
        // Blur alias/zaloUidInNick/danh tính + che phone/zaloUid của nick main non-owner.
        const { buildPrivacyContext, redactFriend } =
          await import("../privacy/redact.js");
        const privacyCtx = await buildPrivacyContext(request);
        const redactedFriendships = friendships.map((f) => {
          const rf: any = redactFriend(f as any, privacyCtx);
          // Che thêm field trên zaloAccount (nick main non-owner): phone + zaloUid của nick.
          if (
            rf.redacted &&
            rf.zaloAccount &&
            rf.zaloAccount.privacyMode === "main"
          ) {
            rf.zaloAccount = { ...rf.zaloAccount, phone: null, zaloUid: null };
          }
          return rf;
        });
        return { friendships: redactedFriendships };
      } catch (err) {
        logger.error("[contacts] List friendships error:", err);
        return reply.status(500).send({ error: "Failed to list friendships" });
      }
    }
  );

  // POST /api/v1/contacts/backfill-global-id : one-off Zalo globalId backfill
  // Resolve zaloGlobalId + zaloUsername cho contact đã có zaloUid, sau đó auto-merge
  // những contact có cùng globalId (cross-account dedup). Sync (block) để admin
  // thấy result ngay, có thể chạy lại idempotent.
  app.post(
    "/api/v1/contacts/backfill-global-id",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = await backfillGlobalId();
        return reply.send(result);
      } catch (err) {
        logger.error("[contacts] Backfill globalId error:", err);
        return reply
          .status(500)
          .send({ error: "Backfill failed", detail: String(err) });
      }
    }
  );

  // PATCH /api/v1/friends/:id : update per-pair status / leadScore / tags
  app.patch(
    "/api/v1/friends/:id",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const { id } = request.params as { id: string };
        const body = (request.body || {}) as {
          statusId?: string | null;
          leadScore?: number;
          crmTagsPerNick?: string[];
          aliasInNick?: string | null;
        };
        const friend = await prisma.friend.findFirst({
          where: { id, orgId: user.orgId },
          select: {
            id: true,
            contactId: true,
            statusId: true,
            leadScore: true,
            crmTagsPerNick: true,
            aliasInNick: true,
            zaloAccountId: true,
            zaloUidInNick: true, // cần để push alias qua SDK
          },
        });
        if (!friend)
          return reply.status(404).send({ error: "Friend not found" });

        if (body.statusId !== undefined && body.statusId !== null) {
          const s = await prisma.status.findFirst({
            where: { id: body.statusId, orgId: user.orgId },
          });
          if (!s) return reply.status(400).send({ error: "Invalid statusId" });
        }
        // Tags: chỉ accept array string, dedup, trim, max 20 tags để tránh abuse.
        let cleanTags: string[] | undefined;
        if (body.crmTagsPerNick !== undefined) {
          if (!Array.isArray(body.crmTagsPerNick)) {
            return reply
              .status(400)
              .send({ error: "crmTagsPerNick must be array of strings" });
          }
          cleanTags = [
            ...new Set(
              body.crmTagsPerNick.map((t) => String(t).trim()).filter(Boolean)
            ),
          ].slice(0, 20);
        }
        const updated = await prisma.friend.update({
          where: { id },
          data: {
            ...(body.statusId !== undefined ? { statusId: body.statusId } : {}),
            ...(body.leadScore !== undefined
              ? { leadScore: Math.max(0, Math.min(100, body.leadScore)) }
              : {}),
            ...(cleanTags !== undefined ? { crmTagsPerNick: cleanTags } : {}),
            ...(body.aliasInNick !== undefined
              ? { aliasInNick: body.aliasInNick }
              : {}),
          },
        });

        // ACTIVITY LOG : per-pair mutations log với entityType='contact' để timeline KH thấy
        const entityId = friend.contactId;
        if (entityId) {
          if (
            body.statusId !== undefined &&
            body.statusId !== friend.statusId
          ) {
            logActivity({
              orgId: user.orgId,
              userId: user.id,
              action: "status_change",
              entityType: "contact",
              entityId,
              details: {
                old: friend.statusId,
                new: body.statusId,
                scope: "friend",
                friendId: friend.id,
              },
            });
          }
          if (
            body.leadScore !== undefined &&
            body.leadScore !== friend.leadScore
          ) {
            logActivity({
              orgId: user.orgId,
              userId: user.id,
              action: "score_change",
              entityType: "contact",
              entityId,
              details: {
                old: friend.leadScore,
                new: body.leadScore,
                delta: body.leadScore - friend.leadScore,
                scope: "friend",
                friendId: friend.id,
              },
            });
          }
          if (
            body.aliasInNick !== undefined &&
            body.aliasInNick !== friend.aliasInNick
          ) {
            logActivity({
              orgId: user.orgId,
              userId: user.id,
              action: "friend_alias_change",
              entityType: "contact",
              entityId,
              details: {
                old: friend.aliasInNick,
                new: body.aliasInNick,
                friendId: friend.id,
                trigger: "crm_edit",
              },
            });

            // Fire-and-forget để không chặn response PUT. SDK lỗi thì lần sync alias định kỳ sẽ thấy lệch
            // và tự reconcile.
            const newAlias = body.aliasInNick;
            const uidToTarget = friend.zaloUidInNick;
            const accountIdToCall = friend.zaloAccountId;
            if (uidToTarget && accountIdToCall) {
              void (async () => {
                try {
                  const { zaloOps } =
                    await import("../../shared/zalo-operations.js");
                  if (newAlias && newAlias.trim()) {
                    await zaloOps.changeFriendAlias(
                      accountIdToCall,
                      newAlias.trim(),
                      uidToTarget
                    );
                    logger.info(
                      `[friends] Pushed alias "${newAlias}" → Zalo for uid=${uidToTarget}`
                    );
                  } else {
                    await zaloOps.removeFriendAlias(
                      accountIdToCall,
                      uidToTarget
                    );
                    logger.info(
                      `[friends] Removed alias on Zalo for uid=${uidToTarget}`
                    );
                  }
                } catch (err) {
                  logger.warn(
                    `[friends] Push alias to Zalo failed (uid=${uidToTarget}):`,
                    err
                  );
                }
              })();
            }
          }
          if (cleanTags !== undefined) {
            const oldT = Array.isArray(friend.crmTagsPerNick)
              ? (friend.crmTagsPerNick as string[])
              : [];
            const added = cleanTags.filter((t) => !oldT.includes(t));
            const removed = oldT.filter((t) => !cleanTags!.includes(t));
            for (const t of added) {
              logActivity({
                orgId: user.orgId,
                userId: user.id,
                action: "tag_add_crm",
                entityType: "contact",
                entityId,
                details: { tag: t, level: "friend", friendId: friend.id },
              });
            }
            for (const t of removed) {
              logActivity({
                orgId: user.orgId,
                userId: user.id,
                action: "tag_remove_crm",
                entityType: "contact",
                entityId,
                details: { tag: t, level: "friend", friendId: friend.id },
              });
            }
          }
        }

        // Outbound webhook cho external systems (vd GetFly sync per-pair) — fire-and-forget.
        // Mỗi loại change emit event riêng để external system filter dễ hơn.
        if (entityId) {
          if (
            body.aliasInNick !== undefined &&
            body.aliasInNick !== friend.aliasInNick
          ) {
            void emitWebhook(user.orgId, "friend.alias_changed", {
              friendId: friend.id,
              contactId: entityId,
              zaloAccountId: friend.zaloAccountId,
              zaloUidInNick: friend.zaloUidInNick,
              old: friend.aliasInNick,
              new: body.aliasInNick,
              origin: "crm",
            });
          }
          if (
            body.statusId !== undefined &&
            body.statusId !== friend.statusId
          ) {
            void emitWebhook(user.orgId, "friend.status_changed", {
              friendId: friend.id,
              contactId: entityId,
              old: friend.statusId,
              new: body.statusId,
            });
          }
          if (
            body.leadScore !== undefined &&
            body.leadScore !== friend.leadScore
          ) {
            void emitWebhook(user.orgId, "friend.score_changed", {
              friendId: friend.id,
              contactId: entityId,
              old: friend.leadScore,
              new: body.leadScore,
            });
          }
        }

        return reply.send(updated);
      } catch (err) {
        logger.error("[friends] update error:", err);
        return reply.status(500).send({ error: "Failed to update friend" });
      }
    }
  );

  // POST /api/v1/friends/:id/ensure-conversation : tạo (hoặc lấy) Conversation cho Friend
  // Use case: sale muốn nhắn KH lần đầu (Friend từ sync, chưa có hội thoại). Trả convId
  // để FE router.push thẳng vào Chat. Idempotent — gọi nhiều lần vẫn trả cùng convId.
  // Sprint v3 Tuần 3 Row 6.9 (2026-06-03): wrap RBAC sale switch nick trong header.
  app.post(
    "/api/v1/friends/:id/ensure-conversation",
    {
      preHandler: [
        requireAnyGrant(["contact", "access"], ["friend", "access"]),
      ],
      config: {
        contentClass: "metadata",
        rbacResource: "friend",
        rbacAction: "access",
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const { id: friendId } = request.params as { id: string };

        const friend = await prisma.friend.findFirst({
          where: { id: friendId, orgId: user.orgId },
          select: {
            id: true,
            contactId: true,
            zaloAccountId: true,
            zaloUidInNick: true,
          },
        });
        if (!friend)
          return reply.status(404).send({ error: "Friend not found" });

        // Find-or-create conversation for (zaloAccount, externalThreadId=zaloUidInNick).
        // threadType='user' vì Friend = 1-1 Zalo identity (group conv không qua đây).
        // CHỐNG XÉ globalId-aware (anh chốt 2026-06-22): mở chat theo Friend → nếu KH này đã có
        // hội thoại trên nick (UID khác do drift / cùng globalId) → mở cái đó, KHÔNG đẻ hội thoại 2.
        const reuseId = await findExistingUserConversation({
          orgId: user.orgId,
          nickId: friend.zaloAccountId,
          externalThreadId: friend.zaloUidInNick,
          contactId: friend.contactId,
        });
        if (reuseId)
          return reply.send({ conversationId: reuseId, created: false });

        const created = await prisma.conversation.create({
          data: {
            orgId: user.orgId,
            zaloAccountId: friend.zaloAccountId,
            contactId: friend.contactId,
            threadType: "user",
            externalThreadId: friend.zaloUidInNick,
            // 2026-05-28: NULL cho conv vừa tạo từ ensure-conversation (Lead Pool /
            // Friend click "Bắt đầu chat") — KHÔNG set new Date() vì conv chưa có
            // message thật → bug pin-top vĩnh viễn nếu set timestamp.
            lastMessageAt: null,
            unreadCount: 0,
            isReplied: false,
          },
          select: { id: true },
        });
        return reply.send({ conversationId: created.id, created: true });
      } catch (err) {
        logger.error("[friends] ensure-conversation error:", err);
        return reply
          .status(500)
          .send({ error: "Ensure conversation failed", detail: String(err) });
      }
    }
  );

  // POST /api/v1/zalo-accounts/:accountId/groups/:groupId/ensure-conversation
  //    Tạo (hoặc lấy) Conversation cho 1 nhóm Zalo. Use case: sale click nút "Mở
  //    chat" từ danh sách group trong tab Nhóm → cần convId để nav /chat/:convId.
  //    Idempotent — gọi nhiều lần vẫn trả cùng convId.
  app.post(
    "/api/v1/zalo-accounts/:accountId/groups/:groupId/ensure-conversation",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const { accountId, groupId } = request.params as {
          accountId: string;
          groupId: string;
        };

        // Verify account thuộc org user (security)
        const account = await prisma.zaloAccount.findFirst({
          where: { id: accountId, orgId: user.orgId },
          select: { id: true },
        });
        if (!account)
          return reply.status(404).send({ error: "Zalo account not found" });
        if (!groupId)
          return reply.status(400).send({ error: "groupId required" });

        // Find existing — group conv uniqueness: (zaloAccountId, externalThreadId, threadType='group')
        const existing = await prisma.conversation.findFirst({
          where: {
            zaloAccountId: accountId,
            externalThreadId: groupId,
            threadType: "group",
          },
          select: { id: true },
        });
        if (existing)
          return reply.send({ conversationId: existing.id, created: false });

        // Group conv chưa có → tạo. Note: contactId nullable (group conv không bind 1
        // contact cụ thể, listener sẽ tạo group-contact khi có msg đầu).
        const created = await prisma.conversation.create({
          data: {
            orgId: user.orgId,
            zaloAccountId: accountId,
            contactId: null,
            threadType: "group",
            externalThreadId: groupId,
            // 2026-05-28: NULL cho conv vừa tạo từ ensure-conversation (Lead Pool /
            // Friend click "Bắt đầu chat") — KHÔNG set new Date() vì conv chưa có
            // message thật → bug pin-top vĩnh viễn nếu set timestamp.
            lastMessageAt: null,
            unreadCount: 0,
            isReplied: false,
          },
          select: { id: true },
        });
        return reply.send({ conversationId: created.id, created: true });
      } catch (err) {
        logger.error("[groups] ensure-conversation error:", err);
        return reply
          .status(500)
          .send({ error: "Ensure conversation failed", detail: String(err) });
      }
    }
  );

  // POST /api/v1/contacts/resolve-by-keys : server exhaustive lookup
  // Tìm Contact theo thứ tự độ tin cậy: globalId > username > zaloUid > phone.
  // Dùng cho NewMessageDialog sau Zalo lookup: tra đúng Contact đã có trong CRM
  // (không bị giới hạn bởi search results frontend).
  app.post(
    "/api/v1/contacts/resolve-by-keys",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const body = (request.body || {}) as {
          zaloGlobalId?: string;
          zaloUsername?: string;
          zaloUid?: string;
          phone?: string;
        };
        const baseWhere = { orgId: user.orgId, mergedInto: null };
        const include = {
          assignedUser: { select: { id: true, fullName: true, email: true } },
          statusRef: {
            select: {
              id: true,
              name: true,
              color: true,
              order: true,
              isTerminal: true,
            },
          },
          _count: { select: { conversations: true, appointments: true } },
        };

        // PRIVACY 2026-06-11 (audit C5) — endpoint này trước đây KHÔNG scope + KHÔNG
        // redact: POST 1 SĐT/zaloUid là harvest full PII KH của nick main sale khác.
        // Helper: chỉ trả KH viewer có quyền scope, và redact PII nếu thuộc nick main
        // non-owner. Ngoài scope → coi như không khớp (matched:false, không lộ tồn tại).
        const { buildPrivacyContext, shouldRedactContactPii, redactContact } =
          await import("../privacy/redact.js");
        const privacyCtx = await buildPrivacyContext(request);
        async function gateContact(c: any, by: string) {
          const visible = await assertContactVisible({
            userId: user.id,
            orgId: user.orgId,
            legacyRole: user.role,
            contactId: c.id,
          });
          if (!visible) return reply.send({ matched: false });
          const out = (await shouldRedactContactPii(c.id, privacyCtx))
            ? redactContact(c, privacyCtx)
            : c;
          return reply.send({ matched: true, by, contact: out });
        }

        // Order: globally-unique trước, phone sau cùng (vì có thể trùng/đổi chủ).
        if (body.zaloGlobalId) {
          const c = await prisma.contact.findFirst({
            where: { ...baseWhere, zaloGlobalId: body.zaloGlobalId },
            include,
          });
          if (c) return gateContact(c, "zaloGlobalId");
        }
        if (body.zaloUsername) {
          const c = await prisma.contact.findFirst({
            where: { ...baseWhere, zaloUsername: body.zaloUsername },
            include,
          });
          if (c) return gateContact(c, "zaloUsername");
        }
        if (body.zaloUid) {
          const c = await prisma.contact.findFirst({
            where: { ...baseWhere, zaloUid: body.zaloUid },
            include,
          });
          if (c) return gateContact(c, "zaloUid");
        }
        const canonicalPhone = normalizePhone(body.phone);
        if (canonicalPhone) {
          const c = await prisma.contact.findFirst({
            where: { ...baseWhere, phoneNormalized: canonicalPhone },
            include,
          });
          if (c) return gateContact(c, "phone");
        }
        return reply.send({ matched: false });
      } catch (err) {
        logger.error("[contacts] resolve-by-keys error:", err);
        return reply
          .status(500)
          .send({ error: "Resolve failed", detail: String(err) });
      }
    }
  );

  // 2026-06-12 — Tìm Contact đang trùng unique key (zaloGlobalId/zaloUsername/zaloUid/phone)
  // KỂ CẢ KH đã bị gộp (merged_into != null), rồi đi theo chuỗi mergedInto tới KH ĐÍCH còn
  // sống. Dùng để tránh contact.create đụng unique index (index zaloGlobalId không lọc
  // merged → P2002 → 500). Trả về contactId đích còn sống, hoặc null nếu không có trùng.
  async function resolveExistingContactId(
    orgId: string,
    uid?: string,
    zaloGlobalId?: string,
    zaloUsername?: string,
    phone?: string
  ): Promise<string | null> {
    // Tìm theo độ tin cậy globally-unique: globalId > username > uid > phone. KHÔNG lọc
    // mergedInto (mục đích là phát hiện cả row đã gộp đang chiếm unique).
    let found: { id: string; mergedInto: string | null } | null = null;
    if (zaloGlobalId) {
      found = await prisma.contact.findFirst({
        where: { orgId, zaloGlobalId },
        select: { id: true, mergedInto: true },
      });
    }
    if (!found && zaloUsername) {
      found = await prisma.contact.findFirst({
        where: { orgId, zaloUsername },
        select: { id: true, mergedInto: true },
      });
    }
    if (!found && uid) {
      found = await prisma.contact.findFirst({
        where: { orgId, zaloUid: uid },
        select: { id: true, mergedInto: true },
      });
    }
    if (!found && phone) {
      const canonical = normalizePhone(phone);
      if (canonical) {
        found = await prisma.contact.findFirst({
          where: { orgId, phoneNormalized: canonical },
          select: { id: true, mergedInto: true },
        });
      }
    }
    if (!found) return null;
    // Đi theo chuỗi mergedInto tới KH đích còn sống (giới hạn 10 bước chống vòng lặp dữ liệu hỏng).
    let cur = found;
    for (let hop = 0; hop < 10 && cur.mergedInto; hop++) {
      const next = await prisma.contact.findFirst({
        where: { id: cur.mergedInto, orgId },
        select: { id: true, mergedInto: true },
      });
      if (!next) break; // target không còn (dữ liệu lệch) → dùng row hiện tại
      cur = next;
    }
    return cur.id;
  }

  // UID truyền vào phải là uid theo góc nhìn của CHÍNH nick này, uid lấy từ nick khác sẽ
  // không gửi tin được.
  //
  // commit=false mặc định để chỉ mở hội thoại mà không đẻ Friend row "ma", nếu không màn
  // Khách hàng sẽ đầy những người chưa từng thực sự chat.
  app.post(
    "/api/v1/conversations/ensure-by-uid",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const body = (request.body || {}) as {
          zaloAccountId?: string;
          uid?: string;
          // commit=true → tạo Friend + link Contact ngay (explicit "Bắt đầu chat")
          commit?: boolean;
          // Snapshot từ lookup result (chỉ dùng khi commit=true)
          zaloName?: string;
          zaloAvatarUrl?: string;
          zaloGlobalId?: string;
          zaloUsername?: string;
          phone?: string;
          // Contact link mode khi commit=true:
          //   'auto' (default) = match theo zaloUid/zaloGlobalId/phone, không tạo mới
          //   'attach:<contactId>' = attach Friend vào Contact cụ thể (user picked)
          //   'create' = tạo Contact mới
          contactMode?: string;
        };
        if (!body.zaloAccountId || !body.uid) {
          return reply
            .status(400)
            .send({ error: "zaloAccountId và uid required" });
        }
        const account = await prisma.zaloAccount.findFirst({
          where: { id: body.zaloAccountId, orgId: user.orgId },
          select: { id: true },
        });
        if (!account)
          return reply.status(404).send({ error: "Zalo account not found" });

        // Resolve contactId (chỉ tìm, KHÔNG tạo Friend ở chế độ default).
        // Order: zaloGlobalId > zaloUsername > zaloUid > phone (theo độ tin cậy globally-unique).
        let linkedContactId: string | null = null;
        if (body.zaloGlobalId) {
          const c = await prisma.contact.findFirst({
            where: {
              orgId: user.orgId,
              zaloGlobalId: body.zaloGlobalId,
              mergedInto: null,
            },
            select: { id: true },
          });
          if (c) linkedContactId = c.id;
        }
        if (!linkedContactId && body.zaloUsername) {
          const c = await prisma.contact.findFirst({
            where: {
              orgId: user.orgId,
              zaloUsername: body.zaloUsername,
              mergedInto: null,
            },
            select: { id: true },
          });
          if (c) linkedContactId = c.id;
        }
        if (!linkedContactId) {
          const c = await prisma.contact.findFirst({
            where: { orgId: user.orgId, zaloUid: body.uid, mergedInto: null },
            select: { id: true },
          });
          if (c) linkedContactId = c.id;
        }
        if (!linkedContactId && body.phone) {
          const canonical = normalizePhone(body.phone);
          if (canonical) {
            const c = await prisma.contact.findFirst({
              where: {
                orgId: user.orgId,
                phoneNormalized: canonical,
                mergedInto: null,
              },
              select: { id: true },
            });
            if (c) linkedContactId = c.id;
          }
        }

        // commit=true → explicit commitment (NewMessageDialog "Bắt đầu chat")
        if (body.commit) {
          // contactMode handling
          if (body.contactMode?.startsWith("attach:")) {
            const cid = body.contactMode.slice(7);
            const c = await prisma.contact.findFirst({
              where: { id: cid, orgId: user.orgId, mergedInto: null },
              select: { id: true },
            });
            if (!c)
              return reply
                .status(400)
                .send({ error: "attach contact not found" });
            linkedContactId = cid;
          } else if (
            body.contactMode === "create" ||
            (!linkedContactId && body.phone)
          ) {
            // Phải tìm trùng KỂ CẢ Contact đã gộp: unique index theo zaloGlobalId không kèm điều kiện
            // merged_into IS NULL, nên KH đã gộp vẫn chiếm unique và contact.create sẽ ném P2002.
            // Tìm thấy thì đi theo mergedInto tới KH đích còn sống mà dùng lại.
            const dupId = await resolveExistingContactId(
              user.orgId,
              body.uid,
              body.zaloGlobalId,
              body.zaloUsername,
              body.phone
            );
            if (dupId) {
              linkedContactId = dupId;
              // Backfill zaloUid/global/username vào KH đích nếu thiếu (giống nhánh else-if dưới).
              await prisma.contact
                .update({
                  where: { id: dupId },
                  data: {
                    ...(body.uid ? { zaloUid: body.uid } : {}),
                    ...(body.zaloGlobalId
                      ? { zaloGlobalId: body.zaloGlobalId }
                      : {}),
                    ...(body.zaloUsername
                      ? { zaloUsername: body.zaloUsername }
                      : {}),
                    hasZalo: true,
                  },
                })
                .catch(() => {});
            } else {
              try {
                const newC = await prisma.contact.create({
                  data: {
                    orgId: user.orgId,
                    zaloUid: body.uid,
                    zaloGlobalId: body.zaloGlobalId || null,
                    zaloUsername: body.zaloUsername || null,
                    phone: body.phone || null,
                    fullName:
                      body.zaloName ||
                      (body.phone
                        ? `KH ${body.phone}`
                        : `KH-${body.uid.slice(-4)}`),
                    avatarUrl: body.zaloAvatarUrl || null,
                    hasZalo: true,
                    source: "compose_new",
                  },
                  select: { id: true },
                });
                linkedContactId = newC.id;
              } catch (createErr: unknown) {
                // Fail-safe race: nếu vẫn đụng unique (P2002) do row đã merge / KH song song
                // tạo cùng lúc → resolve lại + dùng KH đích thay vì crash 500.
                if ((createErr as { code?: string })?.code === "P2002") {
                  const fallbackId = await resolveExistingContactId(
                    user.orgId,
                    body.uid,
                    body.zaloGlobalId,
                    body.zaloUsername,
                    body.phone
                  );
                  if (!fallbackId) throw createErr;
                  linkedContactId = fallbackId;
                } else {
                  throw createErr;
                }
              }
            }
          } else if (linkedContactId) {
            // Backfill zaloUid/global/username vào Contact đã có (nếu thiếu)
            await prisma.contact
              .update({
                where: { id: linkedContactId },
                data: {
                  ...(body.uid ? { zaloUid: body.uid } : {}),
                  ...(body.zaloGlobalId
                    ? { zaloGlobalId: body.zaloGlobalId }
                    : {}),
                  ...(body.zaloUsername
                    ? { zaloUsername: body.zaloUsername }
                    : {}),
                  hasZalo: true,
                },
              })
              .catch(() => {});
          }

          // Upsert Friend cho cặp (nick, uid) — commitment thực sự
          if (linkedContactId) {
            await prisma.friend
              .upsert({
                where: {
                  zaloAccountId_zaloUidInNick: {
                    zaloAccountId: body.zaloAccountId,
                    zaloUidInNick: body.uid,
                  },
                },
                create: {
                  orgId: user.orgId,
                  contactId: linkedContactId,
                  zaloAccountId: body.zaloAccountId,
                  zaloUidInNick: body.uid,
                  relationshipKind: "chatting_stranger",
                  hasConversation: true,
                  zaloDisplayName: body.zaloName || null,
                  zaloAvatarUrl: body.zaloAvatarUrl || null,
                  zaloGlobalId: body.zaloGlobalId || null,
                  zaloUsername: body.zaloUsername || null,
                },
                update: {
                  hasConversation: true,
                  ...(body.zaloName ? { zaloDisplayName: body.zaloName } : {}),
                  ...(body.zaloAvatarUrl
                    ? { zaloAvatarUrl: body.zaloAvatarUrl }
                    : {}),
                  ...(body.zaloGlobalId
                    ? { zaloGlobalId: body.zaloGlobalId }
                    : {}),
                  ...(body.zaloUsername
                    ? { zaloUsername: body.zaloUsername }
                    : {}),
                },
              })
              .catch((err: unknown) => {
                logger.warn("[ensure-by-uid] Friend upsert failed:", err);
              });
          }
        }

        const existing = await prisma.conversation.findFirst({
          where: {
            zaloAccountId: body.zaloAccountId,
            externalThreadId: body.uid,
          },
          select: { id: true, contactId: true },
        });
        if (existing) {
          // 2026-06-12 — relink conv CŨ về KH đích còn sống khi commit. Conv tạo từ lần lỗi
          // trước có thể đang trỏ contactId NULL hoặc 1 KH đã merged (merged_into != null) →
          // mở chat sẽ hiện KH đã gộp. Khi user "Bắt đầu chat" (commit) + đã resolve được KH
          // đích, cập nhật lại contactId nếu khác. Không đụng khi không commit (giữ nguyên).
          if (
            body.commit &&
            linkedContactId &&
            existing.contactId !== linkedContactId
          ) {
            await prisma.conversation
              .update({
                where: { id: existing.id },
                data: { contactId: linkedContactId },
              })
              .catch((err: unknown) => {
                logger.warn(
                  "[ensure-by-uid] relink existing conv failed:",
                  err
                );
              });
          }
          return reply.send({ conversationId: existing.id, created: false });
        }

        // CHỐNG XÉ globalId-aware (anh chốt 2026-06-22): UID này chưa có conv → nếu KH (cùng globalId)
        // đã có hội thoại trên nick dưới UID khác → mở cái đó, KHÔNG đẻ hội thoại thứ 2.
        const reuseId = await findExistingUserConversation({
          orgId: user.orgId,
          nickId: body.zaloAccountId,
          externalThreadId: body.uid,
          contactId: linkedContactId,
        });
        if (reuseId)
          return reply.send({ conversationId: reuseId, created: false });

        const created = await prisma.conversation.create({
          data: {
            orgId: user.orgId,
            zaloAccountId: body.zaloAccountId,
            contactId: linkedContactId,
            threadType: "user",
            externalThreadId: body.uid,
            // 2026-05-28: NULL cho conv vừa tạo từ ensure-conversation (Lead Pool /
            // Friend click "Bắt đầu chat") — KHÔNG set new Date() vì conv chưa có
            // message thật → bug pin-top vĩnh viễn nếu set timestamp.
            lastMessageAt: null,
            unreadCount: 0,
            isReplied: false,
          },
          select: { id: true },
        });
        return reply.send({ conversationId: created.id, created: true });
      } catch (err) {
        logger.error("[conversations] ensure-by-uid error:", err);
        return reply
          .status(500)
          .send({ error: "Ensure conversation failed", detail: String(err) });
      }
    }
  );

  // POST /api/v1/friends/:id/promote-to-parent : gỡ Friend Con thành KH Cha mới
  // Tạo Contact mới từ Friend (1 Zalo identity per nick CRM), move Friend +
  // Conversation tương ứng sang Contact mới. Cha cũ giữ lại các Friend khác.
  // Copy statusId + leadScore từ Friend sang Contact mới (giữ data per-pair).
  app.post(
    "/api/v1/friends/:id/promote-to-parent",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const { id: friendId } = request.params as { id: string };
        const body = (request.body || {}) as { fullName?: string };

        const friend = await prisma.friend.findFirst({
          where: { id: friendId, orgId: user.orgId },
          select: {
            id: true,
            contactId: true,
            zaloAccountId: true,
            zaloUidInNick: true,
            statusId: true,
            leadScore: true,
            aliasInNick: true,
            zaloDisplayName: true,
            zaloAvatarUrl: true,
          },
        });
        if (!friend)
          return reply.status(404).send({ error: "Friend not found" });

        // Get default status for org (fallback)
        const defaultStatus = await prisma.status.findFirst({
          where: { orgId: user.orgId, isDefault: true },
          select: { id: true },
        });

        // Build display name: body override > zaloDisplayName (per-identity snapshot)
        // > aliasInNick > "KH-{last4 UID}". KHÔNG dùng parent name vì sẽ leak tên Cha.
        const last4 = friend.zaloUidInNick.slice(-4);
        const fullName =
          body.fullName?.trim() ||
          friend.zaloDisplayName ||
          friend.aliasInNick ||
          `KH-${last4}`;

        const result = await tenantTransaction(async (tx) => {
          // 1. Create new Contact with friend's per-pair status/score/avatar
          const newContact = await tx.contact.create({
            data: {
              orgId: user.orgId,
              zaloUid: friend.zaloUidInNick,
              fullName,
              avatarUrl: friend.zaloAvatarUrl,
              statusId: friend.statusId ?? defaultStatus?.id ?? null,
              leadScore: friend.leadScore,
              hasZalo: true,
            },
          });

          // 2. Move Friend to new Contact
          await tx.friend.update({
            where: { id: friend.id },
            data: { contactId: newContact.id },
          });

          // 3. Move Conversations matching (zaloAccountId, externalThreadId=zaloUidInNick)
          const movedConvs = await tx.conversation.updateMany({
            where: {
              zaloAccountId: friend.zaloAccountId,
              externalThreadId: friend.zaloUidInNick,
              orgId: user.orgId,
            },
            data: { contactId: newContact.id },
          });

          // 4. Audit log
          await tx.activityLog.create({
            data: {
              orgId: user.orgId,
              userId: user.id,
              action: "friend_promoted_to_parent",
              entityType: "contact",
              entityId: newContact.id,
              details: {
                fromContactId: friend.contactId,
                friendId: friend.id,
                zaloUidInNick: friend.zaloUidInNick,
                movedConversations: movedConvs.count,
              },
            },
          });

          return { newContact, movedConversations: movedConvs.count };
        });

        return reply.send(result);
      } catch (err) {
        logger.error("[friends] promote-to-parent error:", err);
        return reply
          .status(500)
          .send({ error: "Promote failed", detail: String(err) });
      }
    }
  );

  // POST /api/v1/contacts/:id/merge-into : gắn Contact này làm Friends của Contact Cha
  // Move all Friends + Conversations + Appointments từ source → target, mark source mergedInto.
  // Use case: sale realize 2 Contact thực ra là cùng person (vd 2 Zalo account khác globalId).
  app.post(
    "/api/v1/contacts/:id/merge-into",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const { id: sourceId } = request.params as { id: string };
        const { parentContactId: targetId } = (request.body || {}) as {
          parentContactId?: string;
        };
        if (!targetId)
          return reply
            .status(400)
            .send({ error: "parentContactId (target) required" });
        if (targetId === sourceId)
          return reply.status(400).send({ error: "Cannot merge into itself" });

        // Validate both contacts cùng org + chưa merged
        const [source, target] = await Promise.all([
          prisma.contact.findFirst({
            where: { id: sourceId, orgId: user.orgId, mergedInto: null },
          }),
          prisma.contact.findFirst({
            where: { id: targetId, orgId: user.orgId, mergedInto: null },
          }),
        ]);
        if (!source)
          return reply.status(404).send({ error: "Source contact not found" });
        if (!target)
          return reply.status(404).send({ error: "Target contact not found" });

        // Reuse mergeContacts helper (handles Friend conflict via unique constraint).
        await mergeContacts(user.orgId, user.id, targetId, [sourceId]);
        return reply.send({ merged: true, sourceId, targetId });
      } catch (err) {
        logger.error("[contacts] merge-into error:", err);
        return reply
          .status(500)
          .send({ error: "Merge failed", detail: String(err) });
      }
    }
  );

  // POST /api/v1/contacts/:id/link-parent : gắn 1 Contact (son) vào 1 Contact khác (father)
  app.post(
    "/api/v1/contacts/:id/link-parent",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const { id } = request.params as { id: string };
        const { parentContactId } = (request.body || {}) as {
          parentContactId?: string;
        };
        if (!parentContactId)
          return reply.status(400).send({ error: "parentContactId required" });
        if (parentContactId === id)
          return reply
            .status(400)
            .send({ error: "Cannot link contact to itself" });

        // Cha + con phải cùng org
        const [child, parent] = await Promise.all([
          prisma.contact.findFirst({
            where: { id, orgId: user.orgId },
            select: {
              id: true,
              mergedInto: true,
              children: { select: { id: true } },
            },
          }),
          prisma.contact.findFirst({
            where: { id: parentContactId, orgId: user.orgId },
            select: { id: true, parentContactId: true, mergedInto: true },
          }),
        ]);
        if (!child)
          return reply.status(404).send({ error: "Child contact not found" });
        if (!parent)
          return reply.status(404).send({ error: "Parent contact not found" });
        if (child.mergedInto)
          return reply
            .status(400)
            .send({ error: "Child already hard-merged via globalId" });
        if (parent.mergedInto)
          return reply
            .status(400)
            .send({ error: "Parent already hard-merged via globalId" });
        // Block 3-level hierarchy: parent phải là root (parentContactId=NULL)
        if (parent.parentContactId)
          return reply.status(400).send({
            error: "Parent must itself be a root contact (no parent)",
          });
        // Block cycle: nếu child đang có children, không cho biến nó thành con
        if (child.children.length > 0)
          return reply.status(400).send({
            error:
              "This contact has children — split them out first before linking as child",
          });

        const updated = await prisma.contact.update({
          where: { id },
          data: { parentContactId },
        });
        // Audit
        await prisma.activityLog.create({
          data: {
            orgId: user.orgId,
            userId: user.id,
            action: "contact_link_parent",
            entityType: "contact",
            entityId: id,
            details: { parentContactId },
          },
        });
        return reply.send(updated);
      } catch (err) {
        logger.error("[contacts] link-parent error:", err);
        return reply.status(500).send({ error: "Failed to link parent" });
      }
    }
  );

  // POST /api/v1/contacts/:id/unlink-parent : tách Contact thành KH Cha riêng
  app.post(
    "/api/v1/contacts/:id/unlink-parent",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const { id } = request.params as { id: string };
        const contact = await prisma.contact.findFirst({
          where: { id, orgId: user.orgId },
          select: { id: true, parentContactId: true },
        });
        if (!contact)
          return reply.status(404).send({ error: "Contact not found" });
        if (!contact.parentContactId)
          return reply
            .status(400)
            .send({ error: "Contact already a root (no parent)" });

        const updated = await prisma.contact.update({
          where: { id },
          data: { parentContactId: null },
        });
        await prisma.activityLog.create({
          data: {
            orgId: user.orgId,
            userId: user.id,
            action: "contact_unlink_parent",
            entityType: "contact",
            entityId: id,
            details: { previousParentId: contact.parentContactId },
          },
        });
        return reply.send(updated);
      } catch (err) {
        logger.error("[contacts] unlink-parent error:", err);
        return reply.status(500).send({ error: "Failed to unlink parent" });
      }
    }
  );

  // GET /api/v1/contacts/parent-candidates : list undismissed suggestion
  app.get(
    "/api/v1/contacts/parent-candidates",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const candidates = await prisma.parentCandidate.findMany({
          where: { orgId: user.orgId, dismissed: false, resolvedAt: null },
          orderBy: { createdAt: "desc" },
          take: 100,
        });
        // Hydrate contact info cho mỗi candidate
        const allIds = Array.from(
          new Set(candidates.flatMap((c) => c.contactIds))
        );
        const contacts =
          allIds.length === 0
            ? []
            : await prisma.contact.findMany({
                where: { id: { in: allIds }, orgId: user.orgId },
                select: {
                  id: true,
                  fullName: true,
                  phone: true,
                  zaloUid: true,
                  zaloGlobalId: true,
                  avatarUrl: true,
                  parentContactId: true,
                },
              });
        // PRIVACY 2026-06-11 (audit H7): blur PII KH thuộc nick main non-owner.
        const { buildPrivacyContext, buildOffendingContactIds, redactContact } =
          await import("../privacy/redact.js");
        const privacyCtx = await buildPrivacyContext(request);
        const offending = await buildOffendingContactIds(allIds, privacyCtx);
        const byId = new Map(
          contacts.map((c) => [
            c.id,
            offending.has(c.id) ? redactContact(c, privacyCtx) : c,
          ])
        );
        const enriched = candidates.map((c) => ({
          ...c,
          contacts: c.contactIds.map((id) => byId.get(id)).filter(Boolean),
        }));
        return reply.send({ candidates: enriched });
      } catch (err) {
        logger.error("[contacts] list parent-candidates error:", err);
        return reply.status(500).send({ error: "Failed to list candidates" });
      }
    }
  );

  // POST /api/v1/contacts/parent-candidates/:id/accept
  // body: { parentContactId } — chỉ định contact nào làm Cha (canonical), các còn lại làm Con
  app.post(
    "/api/v1/contacts/parent-candidates/:id/accept",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const { id } = request.params as { id: string };
        const { parentContactId } = (request.body || {}) as {
          parentContactId?: string;
        };
        if (!parentContactId)
          return reply.status(400).send({ error: "parentContactId required" });

        const candidate = await prisma.parentCandidate.findFirst({
          where: { id, orgId: user.orgId, dismissed: false, resolvedAt: null },
        });
        if (!candidate)
          return reply
            .status(404)
            .send({ error: "Candidate not found or already resolved" });
        if (!candidate.contactIds.includes(parentContactId)) {
          return reply
            .status(400)
            .send({ error: "parentContactId must be in candidate group" });
        }

        // Set parentContactId cho các contact khác trong cụm
        const childrenIds = candidate.contactIds.filter(
          (cid) => cid !== parentContactId
        );
        await tenantTransaction(async (tx) => {
          for (const cid of childrenIds) {
            await tx.contact.updateMany({
              where: {
                id: cid,
                orgId: user.orgId,
                mergedInto: null,
                parentContactId: null,
              },
              data: { parentContactId },
            });
          }
          await tx.parentCandidate.update({
            where: { id },
            data: {
              resolvedAt: new Date(),
              resolvedBy: user.id,
              dismissed: false,
            },
          });
          await tx.activityLog.create({
            data: {
              orgId: user.orgId,
              userId: user.id,
              action: "parent_candidate_accept",
              entityType: "contact",
              entityId: parentContactId,
              details: {
                candidateId: id,
                childrenIds,
                matchType: candidate.matchType,
              },
            },
          });
        });
        return reply.send({
          accepted: true,
          parentContactId,
          childrenCount: childrenIds.length,
        });
      } catch (err) {
        logger.error("[contacts] accept parent-candidate error:", err);
        return reply.status(500).send({ error: "Failed to accept candidate" });
      }
    }
  );

  // POST /api/v1/contacts/parent-candidates/:id/dismiss
  app.post(
    "/api/v1/contacts/parent-candidates/:id/dismiss",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const { id } = request.params as { id: string };
        const candidate = await prisma.parentCandidate.findFirst({
          where: { id, orgId: user.orgId },
        });
        if (!candidate)
          return reply.status(404).send({ error: "Candidate not found" });
        await prisma.parentCandidate.update({
          where: { id },
          data: {
            dismissed: true,
            resolvedAt: new Date(),
            resolvedBy: user.id,
          },
        });
        return reply.send({ dismissed: true });
      } catch (err) {
        logger.error("[contacts] dismiss parent-candidate error:", err);
        return reply.status(500).send({ error: "Failed to dismiss candidate" });
      }
    }
  );

  // POST /api/v1/admin/run-detector : chạy duplicate-detector ngay, không đợi 02:30 UTC cron
  //    Endpoint admin-only (owner/admin role). Trả về stats sau khi chạy xong.
  //    Use case: sau khi sync backfill globalId cho Contact stub legacy, anh muốn detector
  //    auto-merge ngay không đợi cron daily next.
  app.post(
    "/api/v1/admin/run-detector",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        if (!["owner", "admin"].includes(user.role)) {
          return reply
            .status(403)
            .send({ error: "Chỉ admin/owner được phép trigger detector" });
        }
        const startedAt = Date.now();
        logger.info(`[admin] run-detector triggered by user ${user.id}`);
        // Lazy import — tránh circular dep + chỉ load khi cần
        const { runContactIntelligence } =
          await import("./contact-intelligence.js");
        await runContactIntelligence();
        const durationMs = Date.now() - startedAt;
        // Stats sau khi chạy: count parent candidates undismissed, duplicate groups unresolved
        const [candidates, duplicates] = await Promise.all([
          prisma.parentCandidate.count({
            where: { orgId: user.orgId, dismissed: false },
          }),
          prisma.duplicateGroup.count({
            where: { orgId: user.orgId, resolved: false },
          }),
        ]);
        return reply.send({
          ok: true,
          durationMs,
          parentCandidates: candidates,
          duplicateGroups: duplicates,
        });
      } catch (err) {
        logger.error("[admin] run-detector error:", err);
        return reply
          .status(500)
          .send({ error: "Detector run failed", detail: String(err) });
      }
    }
  );

  // POST /api/v1/admin/migrate-status-table : one-off seed + convert enum
  app.post(
    "/api/v1/admin/migrate-status-table",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = await migrateStatusTable();
        return reply.send(result);
      } catch (err) {
        logger.error("[contacts] migrate-status-table error:", err);
        return reply
          .status(500)
          .send({ error: "Migration failed", detail: String(err) });
      }
    }
  );

  // POST /api/v1/contacts/backfill-missing-friends : tạo Friend row thiếu cho conversations
  app.post(
    "/api/v1/contacts/backfill-missing-friends",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = await backfillMissingFriends();
        return reply.send(result);
      } catch (err) {
        logger.error("[contacts] Backfill missing friends error:", err);
        return reply
          .status(500)
          .send({ error: "Backfill failed", detail: String(err) });
      }
    }
  );

  // POST /api/v1/contacts/backfill-orphan-friends : fix Friend rows trỏ vào contact đã merged
  app.post(
    "/api/v1/contacts/backfill-orphan-friends",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = await backfillOrphanFriends();
        return reply.send(result);
      } catch (err) {
        logger.error("[contacts] Backfill orphan friends error:", err);
        return reply
          .status(500)
          .send({ error: "Backfill failed", detail: String(err) });
      }
    }
  );

  // POST /api/v1/contacts/backfill-friend-display-name : resolve per-identity Zalo name+avatar
  app.post(
    "/api/v1/contacts/backfill-friend-display-name",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = await backfillFriendDisplayName();
        return reply.send(result);
      } catch (err) {
        logger.error("[contacts] Backfill friend display name error:", err);
        return reply
          .status(500)
          .send({ error: "Backfill failed", detail: String(err) });
      }
    }
  );
}

// M55.3 2026-05-30 — AI dup-alert message #2 cho virtual chat.
// Trigger sau welcome ~2.5s khi KH đã có sale chăm (collaborator >= 2) hoặc có note cũ.
// Idempotent: chỉ gửi 1 lần / conv (guard bằng count AI message senderUid='ai:virtual-chat').
// Hardcode content tiếng Việt, KHÔNG gọi Gemini (tiết kiệm token).
async function sendDuplicateAlertMessage(
  conversationId: string,
  contactId: string,
  orgId: string,
  contact: {
    fullName: string | null;
    crmName: string | null;
    phone: string | null;
    assignedUserId: string | null;
  },
  myNickId: string,
  io: Server | undefined
): Promise<void> {
  try {
    // Detect duplicate
    const [collabCount, lastNote, primarySale] = await Promise.all([
      prisma.contactAccess.count({
        where: { contactId, role: { in: ["primary", "collaborator"] } },
      }),
      prisma.note.findFirst({
        where: { orgId, contactId },
        orderBy: { createdAt: "desc" },
        select: {
          body: true,
          createdAt: true,
          author: { select: { fullName: true, email: true } },
        },
      }),
      contact.assignedUserId
        ? prisma.user.findUnique({
            where: { id: contact.assignedUserId },
            select: { fullName: true, email: true },
          })
        : Promise.resolve(null),
    ]);

    const isDuplicate = collabCount > 1 || !!lastNote;
    if (!isDuplicate) return;

    // Guard idempotent: chỉ gửi 1 dup-alert / conv
    const alertCount = await prisma.message.count({
      where: {
        conversationId,
        senderUid: "ai:virtual-chat",
        // Hash key: dup-alert có prefix "📌 **Lưu ý:**" trong content
        content: { startsWith: "📌 **Lưu ý:**" },
      },
    });
    if (alertCount > 0) return;

    const khName = contact.crmName || contact.fullName || "KH";
    const saleName = primarySale?.fullName || primarySale?.email || "sale khác";
    const noteSnippet = lastNote
      ? `📝 Note gần nhất từ **${lastNote.author?.fullName || lastNote.author?.email || "—"}** (${new Date(lastNote.createdAt).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" })}):\n> "${(lastNote.body || "").slice(0, 120)}${(lastNote.body || "").length > 120 ? "…" : ""}"`
      : "Chưa có note nào.";

    const dupContent =
      `📌 **Lưu ý:** KH **${khName}** đã có trong hệ thống — sale **${saleName}** đang phụ trách chính.\n\n` +
      `Tổng ${collabCount} sale đang/đã chăm KH này.\n\n` +
      `${noteSnippet}\n\n` +
      `Anh/chị check kỹ trước khi tư vấn để tránh trùng/đụng nhau nhé!`;

    // Delay 2.5s rồi insert + emit
    setTimeout(async () => {
      try {
        const dupMsg = await prisma.message.create({
          data: {
            id: randomUUID(),
            conversationId,
            zaloMsgId: `local:${randomUUID()}`,
            zaloMsgIdNum: null,
            senderType: "ai_assistant",
            senderUid: "ai:virtual-chat",
            senderName: "Trợ lý",
            content: dupContent,
            contentType: "text",
            sentAt: new Date(),
            isLocal: true,
            sentVia: "system",
          },
        });
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { lastMessageAt: new Date() },
        });
        // PRIVACY 2026-06-11: qua emit-chat (redact + scope org).
        const nickPriv = await prisma.zaloAccount.findUnique({
          where: { id: myNickId },
          select: { privacyMode: true, ownerUserId: true },
        });
        await emitChatMessage({
          io,
          orgId,
          accountId: myNickId,
          conversationId,
          message: { ...dupMsg, zaloMsgIdNum: null as string | null },
          privacyMode: nickPriv?.privacyMode ?? "sub",
          ownerUserId: nickPriv?.ownerUserId ?? null,
          extra: { _virtual: true, _aiAssistant: true, _dupAlert: true },
        });
      } catch (err) {
        logger.warn(`[virtual-conv] dup-alert send failed: ${String(err)}`);
      }
    }, 2500);
  } catch (err) {
    logger.warn(`[virtual-conv] dup-alert detect failed: ${String(err)}`);
  }
}
