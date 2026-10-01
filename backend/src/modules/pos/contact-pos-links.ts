import { prisma } from '../../shared/database/prisma-client.js';

export const POS_LINK_CONFLICT = 'Tài khoản POS này đã được liên kết với khách hàng khác';
export const POS_LINK_STORAGE_UNAVAILABLE = 'Chưa cập nhật cấu trúc liên kết POS. Vui lòng liên hệ quản trị.';

async function posLinkStoreAvailable() {
  const rows = await prisma.$queryRaw<Array<{ available: boolean }>>`
    SELECT to_regclass('contact_pos_links') IS NOT NULL AS available
  `;
  return !!rows[0]?.available;
}

export async function assertPosLinkStoreReady() {
  if (!(await posLinkStoreAvailable())) throw new Error(POS_LINK_STORAGE_UNAVAILABLE);
}

export async function assertPosCustomerCanLink(orgId: string, contactId: string, posCustomerId: number) {
  await assertPosLinkStoreReady();
  const [contact, linked, legacyOwner] = await Promise.all([
    prisma.contact.findFirst({ where: { id: contactId, orgId }, select: { id: true } }),
    prisma.contactPosLink.findUnique({ where: { orgId_posCustomerId: { orgId, posCustomerId } } }),
    prisma.contact.findFirst({ where: { orgId, posCustomerId, id: { not: contactId } }, select: { id: true } }),
  ]);
  if (!contact) throw new Error('Không tìm thấy Contact');
  if ((linked && linked.contactId !== contactId) || legacyOwner) throw new Error(POS_LINK_CONFLICT);
}

export async function linkPosCustomer(orgId: string, contactId: string, posCustomerId: number, posCustomerCode?: string | null) {
  await assertPosLinkStoreReady();
  return prisma.$transaction(async (tx) => {
    const contact = await tx.contact.findFirst({
      where: { id: contactId, orgId },
      select: { id: true, posCustomerId: true, posCustomerCode: true },
    });
    if (!contact) throw new Error('Không tìm thấy Contact');

    const [linked, legacyOwner] = await Promise.all([
      tx.contactPosLink.findUnique({ where: { orgId_posCustomerId: { orgId, posCustomerId } } }),
      tx.contact.findFirst({ where: { orgId, posCustomerId, id: { not: contactId } }, select: { id: true } }),
    ]);
    if ((linked && linked.contactId !== contactId) || legacyOwner) throw new Error(POS_LINK_CONFLICT);

    if (linked) {
      await tx.contactPosLink.update({
        where: { id: linked.id },
        data: { posCustomerCode: posCustomerCode || linked.posCustomerCode || null },
      });
    } else {
      try {
        await tx.contactPosLink.create({ data: { orgId, contactId, posCustomerId, posCustomerCode: posCustomerCode || null } });
      } catch (err: any) {
        if (err.code === 'P2002') throw new Error(POS_LINK_CONFLICT);
        throw err;
      }
    }

    if (!contact.posCustomerId) {
      await tx.contact.updateMany({
        where: { id: contactId, posCustomerId: null },
        data: { posCustomerId, posCustomerCode: posCustomerCode || null },
      });
    }
    return tx.contact.findUniqueOrThrow({ where: { id: contactId } });
  });
}

export async function getContactPosLinks(orgId: string, contactId: string) {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, orgId }, select: { posCustomerId: true, posCustomerCode: true } });
  const available = await posLinkStoreAvailable();
  const links = available
    ? await prisma.contactPosLink.findMany({ where: { orgId, contactId }, orderBy: { createdAt: 'asc' } })
    : [];
  const accounts = links.map((link) => ({ id: link.posCustomerId, code: link.posCustomerCode }));
  if (contact?.posCustomerId && !accounts.some((item) => item.id === contact.posCustomerId)) {
    accounts.unshift({ id: contact.posCustomerId, code: contact.posCustomerCode });
  }
  if (accounts.length === 0) return [];
  const customers = await prisma.posCustomer.findMany({
    where: { orgId, posId: { in: accounts.map((account) => account.id) } },
    select: { posId: true, code: true, name: true, phone: true },
  });
  const customersById = new Map(customers.map((customer) => [customer.posId, customer]));
  return accounts.map((account) => ({
    id: account.id,
    code: account.code || customersById.get(account.id)?.code || null,
    name: customersById.get(account.id)?.name || null,
    phone: customersById.get(account.id)?.phone || null,
  }));
}

export async function unlinkPosCustomer(orgId: string, contactId: string, posCustomerId: number) {
  return prisma.$transaction(async (tx) => {
    const contact = await tx.contact.findFirst({
      where: { id: contactId, orgId },
      select: { posCustomerId: true },
    });
    if (!contact) throw new Error('Không tìm thấy Contact');
    const linked = await tx.contactPosLink.findUnique({ where: { orgId_posCustomerId: { orgId, posCustomerId } } });
    if (contact.posCustomerId !== posCustomerId && linked?.contactId !== contactId) {
      throw new Error('Contact chưa được liên kết POS');
    }
    await tx.contactPosLink.deleteMany({ where: { orgId, contactId, posCustomerId } });
    if (contact.posCustomerId === posCustomerId) {
      const next = await tx.contactPosLink.findFirst({ where: { orgId, contactId }, orderBy: { createdAt: 'asc' } });
      await tx.contact.update({
        where: { id: contactId },
        data: { posCustomerId: next?.posCustomerId || null, posCustomerCode: next?.posCustomerCode || null },
      });
    }
  });
}
