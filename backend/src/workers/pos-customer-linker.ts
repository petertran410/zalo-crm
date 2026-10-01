import { tenantTransaction } from '../shared/database/prisma-client.js';

export interface LinkerResult { linkedOrders: number; linkedInvoices: number; linkedDebts: number }

/** Project manual ownership only. Phone/name matching must never assign commerce. */
export async function linkPosCustomersToContacts(orgId: string): Promise<LinkerResult> {
  return tenantTransaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`crm-links:${orgId}`}))`;
    const linkedOrders = await tx.$executeRaw`
      UPDATE pos_orders o SET contact_id=l.contact_id FROM contact_pos_links l
      WHERE o.org_id=${orgId} AND l.org_id=${orgId} AND o.pos_customer_id=l.pos_customer_id
        AND o.contact_id IS DISTINCT FROM l.contact_id`;
    const linkedInvoices = await tx.$executeRaw`
      UPDATE pos_invoices i SET contact_id=l.contact_id FROM contact_pos_links l
      WHERE i.org_id=${orgId} AND l.org_id=${orgId} AND i.pos_customer_id=l.pos_customer_id
        AND i.contact_id IS DISTINCT FROM l.contact_id`;
    const linkedDebts = await tx.$executeRaw`
      UPDATE pos_customer_debts d SET contact_id=l.contact_id FROM contact_pos_links l
      WHERE d.org_id=${orgId} AND l.org_id=${orgId} AND d.pos_customer_id=l.pos_customer_id
        AND d.contact_id IS DISTINCT FROM l.contact_id`;
    return { linkedOrders, linkedInvoices, linkedDebts };
  });
}
export const runPosCustomerLinker = linkPosCustomersToContacts;
