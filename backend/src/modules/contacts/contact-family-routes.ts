/**
 * contact-family-routes.ts — "nick khác": các Contact dùng chung một SĐT thật.
 *
 * Bối cảnh: team bán hàng tách một khách thành nhiều Contact bằng cách gắn hậu tố
 * thập phân vào SĐT — `0335862112` = "(Sale 1 - A1)", `0335862112.1` = "(Sale 2 - A2)".
 * Convention này chỉ tồn tại trong DATA, không có cột nào lưu, và `phoneNormalized`
 * KHÔNG group được vì normalizePhone() nuốt dấu chấm thành digit
 * (84335862112 vs 843358621121). Xem phoneFamilyKey() trong shared/utils/phone.ts.
 *
 * Scope: cố tình trả org-wide (không lọc contact-scope) — cả điểm của tính năng là cho
 * sale thấy nick KHÁCH HÀNG mà sale KHÁC đang chăm. Mirror precedent
 * `pos-link-candidates`: tính sẵn cờ `accessible` từng dòng để FE giải thích "KH của
 * sale khác" thay vì để bấm rồi ăn 403.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authMiddleware } from "../auth/auth-middleware.js";
import { prisma } from "../../shared/database/prisma-client.js";
import { logger } from "../../shared/utils/logger.js";
import {
  phoneFamilyKey,
  stripPhoneSuffix,
  phoneVariants,
} from "../../shared/utils/phone.js";
import { getContactScope } from "./contact-scope.js";
import { requireGrant } from "../rbac/rbac-middleware.js";
import { FRIEND_INCLUDE } from "../../shared/friend-serializer.js";

/** Giới hạn cứng cho 1 family — thực tế max 2-3 dòng, cap để chặn data bẩn. */
const FAMILY_LIMIT = 50;

export interface PhoneFamilyMember {
  id: string;
  phone: string | null;
  /** Hậu tố ".1" tách ra từ phone, null khi là bản ghi SĐT gốc. */
  phoneSuffix: string | null;
  isCurrent: boolean;
  crmName: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  /** Tên Zalo + alias nhìn từ nick CRM — FE tự chạy display chain. */
  zaloDisplayName: string | null;
  aliasInNick: string | null;
  zaloUid: string | null;
  posName: string | null;
  posCode: string | null;
  posSaleName: string | null;
  /** False khi Contact thuộc scope sale khác — FE disable navigation. */
  accessible: boolean;
}

export async function contactFamilyRoutes(
  app: FastifyInstance
): Promise<void> {
  app.addHook("preHandler", authMiddleware);

  app.get(
    "/api/v1/contacts/:id/phone-family",
    {
      preHandler: requireGrant("contact", "access"),
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

        const anchor = await prisma.contact.findFirst({
          where: { id, orgId: user.orgId },
          select: { id: true, phone: true },
        });
        if (!anchor) {
          return reply.status(404).send({ error: "Contact not found" });
        }

        const familyKey = phoneFamilyKey(anchor.phone);
        if (!familyKey) {
          return { familyKey: null, contacts: [], truncated: false };
        }

        // Không có index cho "SĐT sau khi bỏ hậu tố" nên phải fetch candidate rồi lọc
        // trong memory. `contains` trên digits của SĐT gốc thu hẹp đủ (đo thực tế: 2 dòng
        // cho một SĐT 10 số). phoneNormalized của bản ghi CÓ hậu tố không match nên
        // không dùng nó làm điều kiện lọc.
        const baseDigits = (stripPhoneSuffix(anchor.phone) ?? "").replace(
          /\D/g,
          ""
        );
        if (baseDigits.length < 6) {
          return { familyKey, contacts: [], truncated: false };
        }
        const searchVariants = new Set<string>([baseDigits]);
        for (const v of phoneVariants(baseDigits)) {
          const d = v.replace(/\D/g, "");
          if (d) searchVariants.add(d);
        }
        const variantList = [...searchVariants];

        const candidates = await prisma.contact.findMany({
          where: {
            orgId: user.orgId,
            mergedInto: null,
            archivedAt: null,
            OR: variantList.flatMap((v) => [
              { phone: { contains: v } },
              { phone2: { contains: v } },
              { phone3: { contains: v } },
            ]),
          },
          select: {
            id: true,
            phone: true,
            phone2: true,
            phone3: true,
            crmName: true,
            fullName: true,
            avatarUrl: true,
            zaloUid: true,
            posCustomerId: true,
            posCustomerCode: true,
            friends: {
              where: {
                zaloAccount: { archivedAt: null },
                relationshipKind: { not: "ghost" },
              },
              include: FRIEND_INCLUDE,
              orderBy: { lastInboundAt: { sort: "desc", nulls: "last" } },
              take: 5,
            },
          },
          take: FAMILY_LIMIT * 4,
        });

        // Lọc lại chính xác theo familyKey: `contains` chỉ là bước thu hẹp, nên phải
        // xác nhận từng candidate (kể cả phone2/phone3 mang SĐT của family).
        const matched = candidates.filter((c) => {
          const keys = [c.phone, c.phone2, c.phone3].map(phoneFamilyKey);
          return keys.includes(familyKey);
        });

        if (matched.length <= 1) {
          return { familyKey, contacts: [], truncated: false };
        }

        matched.sort((a, b) => (a.phone ?? "").localeCompare(b.phone ?? ""));
        const truncated = matched.length > FAMILY_LIMIT;
        const rows = matched.slice(0, FAMILY_LIMIT);

        // POS name nằm ở bảng riêng, không có Prisma relation → 1 query theo (posId, orgId).
        const posIds = rows
          .map((r) => r.posCustomerId)
          .filter((v): v is number => v != null);
        const posRows = posIds.length
          ? await prisma.posCustomer.findMany({
              where: { orgId: user.orgId, posId: { in: posIds } },
              select: {
                posId: true,
                code: true,
                name: true,
                assignedSaleName: true,
              },
            })
          : [];
        const posByPosId = new Map(posRows.map((p) => [p.posId, p]));

        const cScope = await getContactScope(user.id, user.orgId, user.role);
        const accessibleIds =
          cScope.accessibleContactIds === null
            ? null
            : new Set(cScope.accessibleContactIds);
        const canOpen = (contactId: string) => {
          if (cScope.isOrgAdmin || accessibleIds === null) return true;
          return accessibleIds.has(contactId);
        };

        const contacts: PhoneFamilyMember[] = rows.map((c) => {
          const suffixMatch = (c.phone ?? "").match(/(\.\d+)$/);
          const pos = c.posCustomerId
            ? posByPosId.get(c.posCustomerId)
            : undefined;
          const fr = c.friends?.[0];
          return {
            id: c.id,
            phone: c.phone,
            phoneSuffix: suffixMatch ? suffixMatch[1] : null,
            isCurrent: c.id === anchor.id,
            crmName: c.crmName,
            fullName: c.fullName,
            avatarUrl: c.avatarUrl,
            zaloDisplayName: fr?.zaloDisplayName ?? null,
            aliasInNick: fr?.aliasInNick ?? null,
            zaloUid: fr?.zaloUidInNick ?? c.zaloUid ?? null,
            posName: pos?.name ?? null,
            posCode: pos?.code ?? c.posCustomerCode ?? null,
            posSaleName: pos?.assignedSaleName ?? null,
            accessible: canOpen(c.id),
          };
        });

        return { familyKey, contacts, truncated };
      } catch (err) {
        logger.error("[contacts] phone-family error:", err);
        return reply
          .status(500)
          .send({ error: "Failed to fetch phone family" });
      }
    }
  );
}
