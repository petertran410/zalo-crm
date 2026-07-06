// One-shot backfill: pull full Zalo profile for 2 contacts created today by nick-worker
// without enrichment. Pulls globalId/username/avatar/gender via getUserInfo + updates Contact.

import { prisma } from '../src/shared/database/prisma-client.js';
import { zaloOps } from '../src/shared/zalo-operations.js';

const TARGETS = [
  { contactId: '55844d38-f528-4c0c-bc38-008f0c29c7c7', nickId: '01aca680-f657-4925-b48e-589d066447b9', zaloUid: '6757645661992651903' }, // Trâm
  { contactId: '3123f96a-7022-4f70-8f3d-b6eb9729504d', nickId: '01aca680-f657-4925-b48e-589d066447b9', zaloUid: '2615075088115267826' }, // Thiện
];

async function main() {
  for (const t of TARGETS) {
    console.log(`\n=== Backfilling contact ${t.contactId} via getUserInfo(uid=${t.zaloUid}) ===`);
    try {
      const raw: any = await zaloOps.getUserInfo(t.nickId, t.zaloUid);
      const profiles = raw?.changed_profiles || {};
      const profile = profiles[t.zaloUid] || profiles[`${t.zaloUid}_0`];
      if (!profile) {
        console.log('No profile returned, skip');
        continue;
      }
      const globalId = String(profile.globalId || '').trim() || null;
      const username = String(profile.username || '').trim() || null;
      const avatar = (profile.avatar as string | undefined)?.trim() || null;
      const fullName = ((profile.zaloName || profile.displayName || '') as string).trim() || null;
      const phone = String(profile.phoneNumber || '').trim() || null;
      const g = profile.gender;
      const gender = (g === 0 || g === '0' || g === 'female') ? 'female'
                   : (g === 1 || g === '1' || g === 'male') ? 'male' : null;

      console.log(`Profile: name=${fullName} gender=${gender} globalId=${globalId} username=${username} avatar=${avatar ? avatar.slice(0, 50) + '...' : null}`);

      const updated = await prisma.contact.update({
        where: { id: t.contactId },
        data: {
          fullName: fullName ?? undefined,
          gender: gender ?? undefined,
          avatarUrl: avatar ?? undefined,
          zaloGlobalId: globalId ?? undefined,
          zaloUsername: username ?? undefined,
          zaloUid: t.zaloUid, // keep for legacy compat
          hasZalo: true,
        },
      });
      console.log(`✓ Updated contact ${updated.id}: name=${updated.fullName} gender=${updated.gender}`);
    } catch (err) {
      console.error(`✗ Failed contact ${t.contactId}:`, err);
    }
  }
  await prisma.$disconnect();
}

main();
