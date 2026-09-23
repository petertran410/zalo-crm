import { prisma, tenantTransaction } from '../../shared/database/prisma-client.js';
import { getHisweetiePublicApiClient, PublicApiRateLimitError, type PublicApiListParams } from '../integrations/hisweetie-public-api-client.js';
import { applyPosSnapshots } from './pos-snapshot-service.js';
import { withPosSyncLock } from './pos-sync-lock.js';

export async function syncCrmCommerce(orgId: string) {
  return withPosSyncLock(orgId, 'CrmCommerce', async () => {
    const client = getHisweetiePublicApiClient();
    const resources = [
      ['customers', (q: PublicApiListParams) => client.listCustomers(q)],
      ['orders', (q: PublicApiListParams) => client.listOrders({ ...q, include: 'details' })],
      ['invoices', (q: PublicApiListParams) => client.listInvoices({ ...q, include: 'details' })],
      ['return-orders', (q: PublicApiListParams) => client.listReturnOrders(q)],
      ['cashflows', (q: PublicApiListParams) => client.listCashflows(q)],
    ] as const;
    for (const [resource, list] of resources) {
      const settingKey = `crm-commerce-cursor:${resource}`;
      const stored = await prisma.appSetting.findUnique({ where: { orgId_settingKey: { orgId, settingKey } } });
      const previous = stored?.valuePlain || undefined;
      const fetchPage = async (query: PublicApiListParams) => {
        for (let attempt = 0; ; attempt++) {
          try { return await list(query); }
          catch (error) {
            if (!(error instanceof PublicApiRateLimitError) || attempt >= 4) throw error;
            await new Promise(resolve => setTimeout(resolve, error.retryAfterMs));
          }
        }
      };
      const first = await fetchPage({ pageSize: 1, lastModifiedFrom: previous, includeInactive: true });
      const until = first.timestamp;
      if (!until || !Number.isFinite(Date.parse(until))) throw new Error('POS did not supply snapshot timestamp.');
      for (let offset = 0; ; offset += 100) {
        if (offset >= 1_000_000) throw new Error('POS pagination safety limit exceeded; cursor unchanged.');
        const page = await fetchPage({
          pageSize: 100, currentItem: offset, lastModifiedFrom: previous, toDate: until, includeInactive: true,
        });
        if (!Array.isArray(page.data)) throw new Error('Invalid POS list response; cursor unchanged.');
        await applyPosSnapshots(orgId, resource, page.data);
        if (page.data.length < 100) break;
      }
      await tenantTransaction(async tx => {
        await tx.appSetting.upsert({
          where: { orgId_settingKey: { orgId, settingKey } },
          create: { orgId, settingKey, valuePlain: until }, update: { valuePlain: until },
        });
        const completedKey = `crm-commerce-last-success:${resource}`;
        const completedAt = new Date().toISOString();
        await tx.appSetting.upsert({
          where: { orgId_settingKey: { orgId, settingKey: completedKey } },
          create: { orgId, settingKey: completedKey, valuePlain: completedAt }, update: { valuePlain: completedAt },
        });
      });
    }
  });
}
