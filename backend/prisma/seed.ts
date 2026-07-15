import { prisma } from '../src/shared/database/prisma-client.js';
import bcrypt from 'bcryptjs';

async function main() {
  console.log('=== Bat dau khoi tao du lieu mau (Seeding) ===');

  // 1. Tao Organization mac dinh
  let org = await prisma.organization.findFirst({
    where: { name: 'Cong Ty Test CRM' },
  });
  if (!org) {
    org = await prisma.organization.create({
      data: {
        name: 'Cong Ty Test CRM',
        timezone: '+07:00',
        slogan: 'Giai phap CRM toi uu cho doanh nghiep',
        copyright: '© 2026 Hi-CRM Team',
      },
    });
    console.log(`- Da tao Organization: ${org.name} (${org.id})`);
  } else {
    console.log(`- Organization da ton tai: ${org.name} (${org.id})`);
  }

  // 2. Tao Team mac dinh
  let team = await prisma.team.findFirst({
    where: { orgId: org.id, name: 'Phong Ban Hang' },
  });
  if (!team) {
    team = await prisma.team.create({
      data: {
        name: 'Phong Ban Hang',
        orgId: org.id,
      },
    });
    console.log(`- Da tao Team: ${team.name}`);
  }

  // 3. Tao User Owner mac dinh
  const email = 'admin@testcrm.com';
  let user = await prisma.user.findUnique({
    where: { email },
  });
  if (!user) {
    const passwordHash = await bcrypt.hash('AdminTest123', 10);
    user = await prisma.user.create({
      data: {
        email,
        phone: '84988888888',
        passwordHash,
        fullName: 'Nguyen Van Admin',
        role: 'owner',
        orgId: org.id,
        teamId: team.id,
        isActive: true,
      },
    });
    console.log(`- Da tao User Owner: ${user.fullName} (${user.email})`);
  } else {
    console.log(`- User Owner da ton tai: ${user.fullName} (${user.email})`);
  }

  // 4. Tao cac Statuses mau cho pheu khach hang
  const statusesData = [
    { name: 'Moi nhan (Lead)', order: 1, color: '#2196F3', isDefault: true, isTerminal: false },
    { name: 'Da lien he', order: 2, color: '#FF9800', isDefault: false, isTerminal: false },
    { name: 'Quan tam sau', order: 3, color: '#9C27B0', isDefault: false, isTerminal: false },
    { name: 'Thanh cong (Won)', order: 4, color: '#4CAF50', isDefault: false, isTerminal: true },
    { name: 'That bai (Lost)', order: 5, color: '#F44336', isDefault: false, isTerminal: true },
  ];

  const dbStatuses: Record<string, string> = {};
  for (const s of statusesData) {
    let st = await prisma.status.findFirst({
      where: { orgId: org.id, name: s.name },
    });
    if (!st) {
      st = await prisma.status.create({
        data: {
          orgId: org.id,
          name: s.name,
          order: s.order,
          color: s.color,
          isDefault: s.isDefault,
          isTerminal: s.isTerminal,
        },
      });
      console.log(`- Da tao trang thai pheu: ${st.name}`);
    }
    dbStatuses[s.name] = st.id;
  }

  // 5. Tao tai khoan Zalo mau (Zalo Account)
  const zaloUid = 'zalo_demo_uid';
  let zaloAcc = await prisma.zaloAccount.findUnique({
    where: { zaloUid },
  });
  if (!zaloAcc) {
    zaloAcc = await prisma.zaloAccount.create({
      data: {
        orgId: org.id,
        ownerUserId: user.id,
        zaloUid,
        displayName: 'Zalo Demo Ho Tro',
        phone: '0988888888',
        status: 'connected',
        sessionData: {
          cookie: { dummy: true },
          imei: 'dummy_imei',
          userAgent: 'Mozilla/5.0',
        },
      },
    });
    console.log(`- Da tao Zalo Account mau: ${zaloAcc.displayName}`);
  }

  // 6. Tao 5 Contacts (Khach hang) mau va cac lien ket Friend tuong ung
  const contactsData = [
    { name: 'Le Van A', phone: '0912345678', status: 'Moi nhan (Lead)', score: 30, zaloUid: 'zalo_user_a' },
    { name: 'Tran Thi B', phone: '0987654321', status: 'Da lien he', score: 50, zaloUid: 'zalo_user_b' },
    { name: 'Pham Hong C', phone: '0901234567', status: 'Quan tam sau', score: 80, zaloUid: 'zalo_user_c' },
    { name: 'Hoang Van D', phone: '0934567890', status: 'Thanh cong (Won)', score: 100, zaloUid: 'zalo_user_d' },
    { name: 'Nguyen Thi E', phone: '0978901234', status: 'That bai (Lost)', score: 10, zaloUid: 'zalo_user_e' },
  ];

  for (const c of contactsData) {
    const phoneNormalized = c.phone.replace(/^0/, '84');
    let contact = await prisma.contact.findFirst({
      where: { orgId: org.id, phoneNormalized },
    });

    if (!contact) {
      contact = await prisma.contact.create({
        data: {
          orgId: org.id,
          fullName: c.name,
          crmName: c.name,
          phone: c.phone,
          phoneNormalized,
          source: 'seed_data',
          statusId: dbStatuses[c.status],
          leadScore: c.score,
          assignedUserId: user.id,
          hasZalo: true,
          zaloUid: c.zaloUid,
        },
      });
      console.log(`- Da tao Contact mau: ${contact.fullName}`);

      // Tao Friend (lien ket per-nick) cho khach hang
      await prisma.friend.create({
        data: {
          orgId: org.id,
          contactId: contact.id,
          zaloAccountId: zaloAcc.id,
          zaloUidInNick: c.zaloUid,
          friendshipStatus: 'accepted',
          relationshipKind: 'friend',
          zaloDisplayName: c.name,
          hasConversation: true,
        },
      });

      // Tao Cuoc tro chuyen (Conversation) tuong ung
      const conv = await prisma.conversation.create({
        data: {
          orgId: org.id,
          zaloAccountId: zaloAcc.id,
          contactId: contact.id,
          threadType: 'user',
          externalThreadId: `thread_${c.zaloUid}`,
          lastMessageAt: new Date(),
          unreadCount: 0,
        },
      });

      // Tao 5 tin nhan mau cho moi cuoc tro chuyen (2 cua khach hang, 3 cua sale)
      const messagesData = [
        { senderType: 'contact', content: 'Xin chao, toi can tu van ve san pham.' },
        { senderType: 'self', content: 'Da xin chao anh/chi, toi la Admin ho tro khach hang cua Hi-CRM.' },
        { senderType: 'self', content: 'Khong biet anh/chi dang quan tam den dong san pham nao ben em a?' },
        { senderType: 'contact', content: 'Toi muon tim hieu ve phan mem quan ly chat Zalo.' },
        { senderType: 'self', content: 'Da, phan mem ben em ho tro ket noi nhieu tai khoan, dong bo realtime va co AI goi y tra loi nua a.' },
      ];

      for (let i = 0; i < messagesData.length; i++) {
        const msg = messagesData[i];
        await prisma.message.create({
          data: {
            conversationId: conv.id,
            zaloMsgId: `msg_${c.zaloUid}_${i}`,
            senderType: msg.senderType,
            senderUid: msg.senderType === 'self' ? zaloUid : c.zaloUid,
            senderName: msg.senderType === 'self' ? zaloAcc.displayName : c.name,
            content: msg.content,
            contentType: 'text',
            sentAt: new Date(),
          },
        });
      }

      // Tao Ghi chu (Note) mau
      await prisma.note.create({
        data: {
          orgId: org.id,
          contactId: contact.id,
          authorUserId: user.id,
          body: `Khach hang ${c.name} quan tam sau den dich vu va da nhan tin yeu cau ho tro.`,
        },
      });

      // Tao Lich hen (Appointment) mau
      const aptDate = new Date();
      aptDate.setDate(aptDate.getDate() + 2); // Hen sau 2 ngay
      await prisma.appointment.create({
        data: {
          orgId: org.id,
          contactId: contact.id,
          assignedUserId: user.id,
          appointmentDate: aptDate,
          appointmentTime: '14:00',
          title: `Goi tu van giai phap cho ${c.name}`,
          type: 'call',
          status: 'scheduled',
          notes: 'Goi dien trao doi chi tiet ve bang gia va tinh nang.',
        },
      });
    }
  }

  // 7. Chay seed cac nhom quyen va quy tac cham diem mac dinh
  try {
    const { seedDefaultPermissionGroups } = await import('../src/modules/rbac/seed-default-groups.js');
    await seedDefaultPermissionGroups(org.id);
    console.log('- Da seed Default Permission Groups.');
  } catch (err) {
    console.warn('- Loi khi seed default permission groups (bo qua):', (err as Error).message);
  }

  try {
    const { seedScoringDefaults } = await import('../src/modules/scoring/seed-defaults.js');
    await seedScoringDefaults(org.id);
    console.log('- Da seed Default Lead Scoring Config.');
  } catch (err) {
    console.warn('- Loi khi seed default scoring config (bo qua):', (err as Error).message);
  }

  console.log('=== Hoan tat khoi tao du lieu mau thanh cong! ===');
  console.log('\nBan co the dang nhap bang thong tin sau de kiem tra:');
  console.log(`• Email: ${email}`);
  console.log('• Mat khau: AdminTest123');
}

main()
  .catch((e) => {
    console.error('Loi khi chay Seeding script:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
