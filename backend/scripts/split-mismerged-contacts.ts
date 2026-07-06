/**
 * split-mismerged-contacts.ts — Tách các Contact Cha bị GỘP NHẦM nhiều người (B1).
 *
 * Bối cảnh: privacy blur ▒ + duplicate-detector khối tên/username (đã bỏ ở C2) đã tự
 * gộp nhiều người KHÁC NHAU vào 1 Contact Cha (51 Contact, gồm 2 người trùng tên
 * "Nguyễn Trọng Ngoán" + 1 "Linh" gom 159 người). Script này TÁCH NGƯỢC theo định
 * danh Zalo thật (zalo_global_id của từng Friend row).
 *
 * NGUYÊN TẮC TÁCH (an toàn, dùng globalId — định danh toàn cục):
 *   1. Gom Friend của 1 Cha theo zaloGlobalId. Mỗi globalId = 1 người thật.
 *   2. Cụm "ở lại": globalId khớp Contact.zaloGlobalId của Cha (hoặc nếu Cha không có
 *      globalId → cụm có nhiều Friend nhất) → giữ ở Cha.
 *   3. Cụm "tách": mỗi globalId khác →
 *      - đã có Contact mang globalId đó (mergedInto null) → chuyển Friend+conv về đó.
 *      - chưa có → tạo Contact mới (tên/avatar/uid từ Friend trong cụm) → chuyển sang.
 *   4. Friend THIẾU globalId → KHÔNG tự tách. Liệt kê để xử tay (12 cái).
 *   5. Conversation đi theo Friend: match (zaloAccountId, externalThreadId=zaloUidInNick).
 *   6. Sửa Contact.avatarUrl + Contact.zaloUid của Cha về đúng đại diện cụm ở-lại.
 *
 * AN TOÀN:
 *   - MẶC ĐỊNH --dry-run: chỉ in báo cáo, KHÔNG ghi. Phải --commit mới ghi.
 *   - Idempotent: chạy lại không nhân đôi (skip Cha chỉ còn 1 cụm globalId).
 *   - Transaction per-Contact: 1 Cha lỗi không kéo sập cả mẻ.
 *   - Ghi activityLog 'contact_split' để truy vết.
 *   - --org <id> giới hạn 1 org; --contact <id> chỉ 1 Cha (test 1 case).
 *
 * Chạy: npx tsx backend/scripts/split-mismerged-contacts.ts [--dry-run|--commit] [--contact <id>]
 */
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/shared/database/prisma-client.js';
import { runSystemQuery } from '../src/shared/tenant/tenant-context.js';

// ─── Flags ───
const argv = process.argv.slice(2);
const COMMIT = argv.includes('--commit');
const DRY = !COMMIT; // mặc định dry-run
const ONLY_CONTACT = (() => {
  const i = argv.indexOf('--contact');
  return i >= 0 ? argv[i + 1] : null;
})();
const ONLY_ORG = (() => {
  const i = argv.indexOf('--org');
  return i >= 0 ? argv[i + 1] : null;
})();
// Chỉ định cụm globalId NÀO ở lại Cha (dùng cho case lệch chéo như Trọng Ngoán:
// Cha tên 1 người nhưng globalId của người kia). Khi keep-cluster KHÁC globalId gốc
// của Cha → ghi đè globalId/SĐT/avatar Cha sang cụm ở-lại.
const KEEP_GLOBAL_ID = (() => {
  const i = argv.indexOf('--keep-global-id');
  return i >= 0 ? argv[i + 1] : null;
})();

interface FriendLite {
  id: string;
  contactId: string;
  orgId: string;
  zaloAccountId: string;
  zaloUidInNick: string;
  zaloGlobalId: string | null;
  zaloDisplayName: string | null;
  zaloAvatarUrl: string | null;
}

function log(msg: string): void {
  // eslint-disable-next-line no-console
  console.log(msg);
}

/** Tìm các Contact Cha (mergedInto null) gộp >1 globalId khác nhau trong Friend con. */
async function findMismergedContacts(): Promise<string[]> {
  return runSystemQuery(async () => {
    const where: Record<string, unknown> = { mergedInto: null };
    if (ONLY_ORG) where.orgId = ONLY_ORG;
    if (ONLY_CONTACT) where.id = ONLY_CONTACT;
    const contacts = await prisma.contact.findMany({ where, select: { id: true } });
    const bad: string[] = [];
    for (const c of contacts) {
      const friends = await prisma.friend.findMany({
        where: { contactId: c.id },
        select: { zaloGlobalId: true },
      });
      const gids = new Set(
        friends.map((f) => f.zaloGlobalId).filter((g): g is string => !!g && g.trim() !== ''),
      );
      if (gids.size > 1) bad.push(c.id);
    }
    return bad;
  });
}

interface SplitPlan {
  contactId: string;
  orgId: string;
  contactName: string | null;
  contactGlobalId: string | null;
  keepGlobalId: string | null;       // globalId cụm ở lại
  clusters: Array<{
    globalId: string;
    friendIds: string[];
    sampleName: string | null;
    sampleAvatar: string | null;
    sampleUid: string;               // zaloUidInNick đại diện (để set Contact.zaloUid mới)
    targetContactId: string | null;  // contact đã có mang globalId này (nếu có)
    action: 'keep' | 'move-existing' | 'create-new' | 'revive-merged';
  }>;
  orphanNoGlobalId: number;          // Friend thiếu globalId (xử tay)
}

/** Lập kế hoạch tách cho 1 Contact (không ghi gì). */
async function planSplit(contactId: string): Promise<SplitPlan | null> {
  return runSystemQuery(async () => {
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true, orgId: true, fullName: true, zaloGlobalId: true, phoneNormalized: true },
    });
    if (!contact) return null;

    const friends = (await prisma.friend.findMany({
      where: { contactId },
      select: {
        id: true, contactId: true, orgId: true, zaloAccountId: true,
        zaloUidInNick: true, zaloGlobalId: true, zaloDisplayName: true, zaloAvatarUrl: true,
      },
    })) as FriendLite[];

    // Gom theo globalId
    const byGid = new Map<string, FriendLite[]>();
    let orphanNoGlobalId = 0;
    for (const f of friends) {
      const g = (f.zaloGlobalId || '').trim();
      if (!g) { orphanNoGlobalId++; continue; }
      if (!byGid.has(g)) byGid.set(g, []);
      byGid.get(g)!.push(f);
    }
    if (byGid.size <= 1) return null; // không cần tách (idempotent)

    // Tra TRƯỚC: mỗi globalId trong byGid đã thuộc Contact KHÁC nào chưa
    // (unique (org, globalId) → tối đa 1). Cần để (a) chọn cụm ở-lại an toàn,
    // (b) quyết action mỗi cụm, (c) gom cụm CÙNG PHONE = cùng người.
    const ownerByGid = new Map<string, { id: string; mergedInto: string | null; phoneNormalized: string | null } | null>();
    for (const g of byGid.keys()) {
      const owner = await prisma.contact.findFirst({
        where: { orgId: contact.orgId, zaloGlobalId: g, id: { not: contactId } },
        select: { id: true, mergedInto: true, phoneNormalized: true },
      });
      ownerByGid.set(g, owner ?? null);
    }

    // CÙNG PHONE = CÙNG NGƯỜI (anh chốt 2026-06-16): Zalo có thể cấp nhiều globalId
    // cho 1 người. Cụm nào có owner cùng phone_normalized với Cha (Cha có phone) →
    // coi là CÙNG người với Cha → GIỮ ở Cha, KHÔNG tách (tránh tách 1 người thành
    // nhiều + tránh lỗi unique (org, phone_normalized) khi revive 2 row cùng phone).
    const samePhoneAsCha = new Set<string>();
    if (contact.phoneNormalized) {
      for (const [g] of byGid) {
        const owner = ownerByGid.get(g);
        if (owner && owner.phoneNormalized && owner.phoneNormalized === contact.phoneNormalized) {
          samePhoneAsCha.add(g);
        }
      }
    }

    // Chọn cụm "ở lại", ưu tiên:
    //  1. --keep-global-id (Anh chỉ định cho case lệch chéo)
    //  2. khớp Contact.zaloGlobalId (Cha vốn là người này)
    //  3. cụm globalId CHƯA bị Contact khác chiếm (set vào Cha không đụng unique),
    //     ưu tiên đông nhất trong số đó
    //  4. (nếu MỌI cụm đều bị Contact khác chiếm) → keepGid = null: Cha KHÔNG giữ
    //     cụm globalId nào (tất cả revive về Contact gốc), Cha cũ chỉ còn Friend
    //     orphan (thiếu globalId) — tránh lỗi unique khi set gid trùng vào Cha.
    let keepGid: string | null = null;
    if (KEEP_GLOBAL_ID && byGid.has(KEEP_GLOBAL_ID) && !ownerByGid.get(KEEP_GLOBAL_ID)) {
      keepGid = KEEP_GLOBAL_ID;
    } else if (contact.zaloGlobalId && byGid.has(contact.zaloGlobalId)) {
      // Cha đã mang gid này → giữ (set lại chính nó, không đụng unique).
      keepGid = contact.zaloGlobalId;
    } else {
      let max = -1;
      for (const [g, fs] of byGid) {
        if (ownerByGid.get(g)) continue; // gid đã bị Contact khác chiếm → không thể giữ ở Cha
        if (fs.length > max) { max = fs.length; keepGid = g; }
      }
      // keepGid vẫn null = mọi cụm đều bị chiếm → Cha không giữ cụm nào.
    }

    const clusters: SplitPlan['clusters'] = [];
    for (const [g, fs] of byGid) {
      const sample = fs[0];
      // Cụm ở-lại CHÍNH (keepGid) HOẶC cụm cùng phone với Cha → keep (cùng người).
      if (g === keepGid || samePhoneAsCha.has(g)) {
        clusters.push({ globalId: g, friendIds: fs.map((f) => f.id), sampleName: sample.zaloDisplayName, sampleAvatar: sample.zaloAvatarUrl, sampleUid: sample.zaloUidInNick, targetContactId: contactId, action: 'keep' });
        continue;
      }
      // Cụm KHÔNG ở-lại: tách về Contact mang globalId đó.
      //  - alive (mergedInto null) → move-existing
      //  - đã merged (Contact GỐC của người bị gộp) → revive-merged (gỡ mergedInto)
      //  - chưa có Contact nào → create-new
      const owner = ownerByGid.get(g) ?? null;
      let action: SplitPlan['clusters'][number]['action'];
      let targetContactId: string | null;
      if (owner && owner.mergedInto === null) {
        action = 'move-existing';
        targetContactId = owner.id;
      } else if (owner) {
        action = 'revive-merged';
        targetContactId = owner.id;
      } else {
        action = 'create-new';
        targetContactId = null;
      }
      clusters.push({
        globalId: g,
        friendIds: fs.map((f) => f.id),
        sampleName: sample.zaloDisplayName,
        sampleAvatar: sample.zaloAvatarUrl,
        sampleUid: sample.zaloUidInNick,
        targetContactId,
        action,
      });
    }

    return {
      contactId,
      orgId: contact.orgId,
      contactName: contact.fullName,
      contactGlobalId: contact.zaloGlobalId,
      keepGlobalId: keepGid,
      clusters,
      orphanNoGlobalId,
    };
  });
}

/** Thực thi 1 plan (chỉ khi --commit). Transaction per-Contact. */
async function executeSplit(plan: SplitPlan): Promise<void> {
  await runSystemQuery(async () => {
    await prisma.$transaction(async (tx) => {
      for (const cl of plan.clusters) {
        if (cl.action === 'keep') continue;

        let targetId = cl.targetContactId;
        if (cl.action === 'create-new') {
          targetId = randomUUID();
          await tx.contact.create({
            data: {
              id: targetId,
              orgId: (await tx.contact.findUniqueOrThrow({ where: { id: plan.contactId }, select: { orgId: true } })).orgId,
              fullName: cl.sampleName || 'KH tách từ gộp nhầm',
              zaloGlobalId: cl.globalId,
              zaloUid: cl.sampleUid,
              avatarUrl: cl.sampleAvatar || null,
            },
          });
        } else if (cl.action === 'revive-merged' && targetId) {
          // Hồi sinh Contact GỐC đã bị merged (globalId @@unique nên không create trùng).
          // NULL-OUT gid trên row merged KHÁC cùng gid (chuỗi merge nhiều tầng) trước khi
          // revive — nếu không, revive targetId thành alive mà còn row merged khác giữ
          // cùng gid → 2 row alive trùng gid → đụng unique (index không partial).
          await tx.contact.updateMany({
            where: { orgId: plan.orgId, zaloGlobalId: cl.globalId, mergedInto: { not: null }, id: { not: targetId } },
            data: { zaloGlobalId: null },
          });
          // Gỡ mergedInto + refresh avatar/uid về cụm; giữ fullName cũ của contact gốc.
          await tx.contact.update({
            where: { id: targetId },
            data: {
              mergedInto: null,
              zaloUid: cl.sampleUid,
              ...(cl.sampleAvatar ? { avatarUrl: cl.sampleAvatar } : {}),
            },
          });
        }
        if (!targetId) continue;

        // Chuyển Friend của cụm sang target
        await tx.friend.updateMany({
          where: { id: { in: cl.friendIds } },
          data: { contactId: targetId },
        });

        // Chuyển Conversation của cụm: match (zaloAccountId, externalThreadId=uidInNick)
        const friendsInCluster = await tx.friend.findMany({
          where: { id: { in: cl.friendIds } },
          select: { zaloAccountId: true, zaloUidInNick: true },
        });
        for (const fr of friendsInCluster) {
          await tx.conversation.updateMany({
            where: {
              contactId: plan.contactId,
              zaloAccountId: fr.zaloAccountId,
              externalThreadId: fr.zaloUidInNick,
            },
            data: { contactId: targetId },
          });
        }
      }

      // Sửa lại Cha về đại diện cụm ở-lại (Anh chốt: tuân thủ globalId).
      //  - zaloUid + avatar: luôn cập nhật về cụm ở-lại.
      //  - globalId: ghi đè nếu Cha chưa có / khác cụm ở-lại.
      //  - full_name: ĐỒNG BỘ về tên Zalo của cụm ở-lại khi đang LỆCH (vd Cha tên
      //    "Trọng Ngoán" nhưng cụm ở-lại theo globalId là "Thành Tiến" → đổi về
      //    "Thành Tiến Hs" để vỏ Cha khớp hoàn toàn tên+globalId+SĐT+avatar).
      // Đại diện cụm ở-lại để cập nhật Cha = cụm khớp keepGlobalId (cụm ở-lại CHÍNH),
      // KHÔNG lấy cụm cùng-phone (chúng cũng keep nhưng không nên ép đổi gid/tên Cha).
      const keepCluster = plan.keepGlobalId
        ? plan.clusters.find((c) => c.action === 'keep' && c.globalId === plan.keepGlobalId)
        : undefined;
      if (keepCluster) {
        const needOverrideGid = !plan.contactGlobalId || plan.contactGlobalId !== keepCluster.globalId;
        const keepName = (keepCluster.sampleName || '').trim();
        // Chỉ đổi tên khi cụm ở-lại có tên Zalo rõ VÀ khác tên Cha hiện tại
        // (tránh ghi đè khi cùng người / tên Zalo rỗng).
        const needRename = keepName !== '' && keepName !== (plan.contactName || '').trim();
        // NULL-OUT gid trên row đã-MERGED khác đang giữ keepGid (anh chốt 2026-06-16,
        // workflow phát hiện): index (org, zalo_global_id) KHÔNG partial → row merged
        // vẫn chiếm slot gid. Nếu set keepGid vào Cha mà 1 row merged khác còn giữ gid
        // đó → đụng unique. Gỡ gid khỏi các row merged đó trước (chúng đã merged nên
        // không cần gid để hiển thị). KHÔNG đụng row ALIVE (người thật khác).
        if (needOverrideGid) {
          await tx.contact.updateMany({
            where: { orgId: plan.orgId, zaloGlobalId: keepCluster.globalId, mergedInto: { not: null }, id: { not: plan.contactId } },
            data: { zaloGlobalId: null },
          });
        }
        await tx.contact.update({
          where: { id: plan.contactId },
          data: {
            zaloUid: keepCluster.sampleUid,
            ...(keepCluster.sampleAvatar ? { avatarUrl: keepCluster.sampleAvatar } : {}),
            ...(needOverrideGid ? { zaloGlobalId: keepCluster.globalId } : {}),
            ...(needRename ? { fullName: keepName } : {}),
          },
        });
      } else {
        // keepGid null = MỌI cụm globalId đều revive về Contact gốc khác. Cha cũ
        // không còn đại diện người nào theo globalId → gỡ zalo_global_id + zalo_uid
        // (của người đã tách đi) để Cha không "treo" danh tính sai. Cha chỉ còn các
        // Friend orphan (thiếu globalId) nếu có; nếu rỗng hẳn → để sale dọn tay.
        await tx.contact.update({
          where: { id: plan.contactId },
          data: { zaloGlobalId: null, zaloUid: null },
        });
      }

      // Audit
      const owner = await tx.user.findFirst({
        where: { orgId: (await tx.contact.findUniqueOrThrow({ where: { id: plan.contactId }, select: { orgId: true } })).orgId, isActive: true },
        select: { id: true, orgId: true },
      });
      if (owner) {
        await tx.activityLog.create({
          data: {
            orgId: owner.orgId,
            userId: owner.id,
            action: 'contact_split',
            entityType: 'contact',
            entityId: plan.contactId,
            details: {
              keepGlobalId: plan.keepGlobalId,
              splitClusters: plan.clusters.filter((c) => c.action !== 'keep').map((c) => ({ globalId: c.globalId, action: c.action, target: c.targetContactId, friends: c.friendIds.length })),
            },
          },
        });
      }
    }, { timeout: 30_000 });
  });
}

async function main(): Promise<void> {
  log(`\n=== split-mismerged-contacts — ${DRY ? 'DRY-RUN (chỉ đọc)' : '⚠️  COMMIT (ghi DB)'} ===`);
  if (ONLY_CONTACT) log(`  scope: 1 contact ${ONLY_CONTACT}`);
  if (ONLY_ORG) log(`  scope: org ${ONLY_ORG}`);

  const badIds = await findMismergedContacts();
  log(`\nTìm thấy ${badIds.length} Contact Cha gộp >1 người (theo globalId).`);

  let totalNewContacts = 0, totalMovedExisting = 0, totalRevived = 0, totalFriendsMoved = 0, totalOrphans = 0, totalErrors = 0;

  for (const cid of badIds) {
    const plan = await planSplit(cid);
    if (!plan) { log(`  [skip] ${cid} — không cần tách (idempotent).`); continue; }

    const toSplit = plan.clusters.filter((c) => c.action !== 'keep');
    const movedFriends = toSplit.reduce((s, c) => s + c.friendIds.length, 0);
    totalFriendsMoved += movedFriends;
    totalNewContacts += toSplit.filter((c) => c.action === 'create-new').length;
    totalMovedExisting += toSplit.filter((c) => c.action === 'move-existing').length;
    totalRevived += toSplit.filter((c) => c.action === 'revive-merged').length;
    totalOrphans += plan.orphanNoGlobalId;

    const keepC = plan.clusters.find((c) => c.action === 'keep');
    const keepName = (keepC?.sampleName || '').trim();
    log(`\n▶ Cha ${plan.contactId} "${plan.contactName}" — gộp ${plan.clusters.length} người:`);
    log(`    giữ "${keepName}" globalId=${plan.keepGlobalId?.slice(0, 12)} (${keepC?.friendIds.length} nick)`);
    if (keepName && keepName !== (plan.contactName || '').trim()) {
      log(`    ✎ ĐỔI TÊN Cha: "${plan.contactName}" → "${keepName}" (đồng bộ tên cụm ở-lại)`);
    }
    for (const c of toSplit) {
      log(`    → tách "${c.sampleName}" gid=${c.globalId.slice(0, 12)} (${c.friendIds.length} nick) [${c.action}${c.targetContactId ? ' → ' + c.targetContactId.slice(0, 8) : ''}]`);
    }
    if (plan.orphanNoGlobalId > 0) log(`    ⚠️  ${plan.orphanNoGlobalId} Friend THIẾU globalId → giữ ở Cha, cần xử tay/enrich.`);

    if (COMMIT) {
      try {
        await executeSplit(plan);
        log(`    ✓ đã tách (commit).`);
      } catch (err) {
        totalErrors++;
        log(`    ❌ LỖI tách ${plan.contactId}: ${(err as Error).message}`);
      }
    }
  }

  log(`\n=== TỔNG KẾT (${DRY ? 'dry-run' : 'commit'}) ===`);
  log(`  Contact gộp nhầm:        ${badIds.length}`);
  log(`  Cụm tạo Contact mới:     ${totalNewContacts}`);
  log(`  Cụm gắn Contact có sẵn:  ${totalMovedExisting}`);
  log(`  Cụm hồi sinh Contact gốc:${totalRevived}`);
  log(`  Friend được chuyển:      ${totalFriendsMoved}`);
  log(`  Friend thiếu globalId:   ${totalOrphans} (xử tay/enrich, KHÔNG tự tách)`);
  if (COMMIT) log(`  Lỗi:                     ${totalErrors}`);
  if (DRY) log(`\n  Đây là DRY-RUN — chưa ghi gì. Chạy --commit (sau khi backup) để thực thi.`);

  await prisma.$disconnect();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('FATAL:', err);
  process.exit(1);
});
