import { syncCustomerCohort } from './src/modules/integrations/pos-customer-import-service.ts';
import { withPosSyncLock } from './src/modules/pos/pos-sync-lock.ts';
import { prisma } from './src/shared/database/prisma-client.ts';

const org = await prisma.organization.findFirst({ select: { id: true } });
if (!org) throw new Error('No organization');

const t0 = Date.now();
await withPosSyncLock(org.id, 'Customer', () => syncCustomerCohort(org.id));
console.log('elapsed ms =', Date.now() - t0);

const job = await prisma.syncJob.findFirst({ where: { orgId: org.id, entity: 'Customer' }, orderBy: { createdAt: 'desc' } });
const count = await prisma.posCustomer.count({ where: { orgId: org.id } });
console.log(JSON.stringify({ job: job && { status: job.status, processed: job.processed, lastError: job.lastError }, posCustomerCount: count }, null, 2));
await prisma.$disconnect();
