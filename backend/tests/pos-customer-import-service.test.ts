import { describe, expect, it, vi } from 'vitest';

const prisma = vi.hoisted(() => ({
  appSetting: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
  },
  contact: {
    findMany: vi.fn(),
    count: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  activityLog: { create: vi.fn() },
}));
const tenantTransaction = vi.hoisted(() => vi.fn());
const batchUpsertCustomers = vi.hoisted(() => vi.fn());
const batchUpsertInvoices = vi.hoisted(() => vi.fn());
const collectInvoiceBackedCustomerCohort = vi.hoisted(() => vi.fn());

vi.mock('../src/shared/database/prisma-client.js', () => ({ prisma, tenantTransaction }));
vi.mock('../src/shared/mcp/pos-sync-service.js', () => ({
  batchUpsertCustomers,
  batchUpsertInvoices,
}));
vi.mock('../src/modules/integrations/hisweetie-customer-cohort.js', () => ({
  POS_CUSTOMER_COHORT_RULE: 'active_phone_invoice_v1',
  collectInvoiceBackedCustomerCohort,
}));

import {
  projectCustomerCohort,
  runInitialCustomerImport,
  syncCustomerCohort,
} from '../src/modules/integrations/pos-customer-import-service.js';

const orgId = 'org-1';
const ownerId = 'owner-1';

beforeEach(() => {
  vi.clearAllMocks();
});

const archivedContact = {
  id: 'contact-archived',
  posCustomerId: null,
  posCustomerCode: null,
  phoneNormalized: '84901234567',
  fullName: 'Manual name',
  phone: '0901234567',
  email: 'manual@example.test',
  addressLine: 'Manual address',
  archivedAt: new Date('2026-08-01T00:00:00.000Z'),
};

function cohort() {
  return {
    customers: [{
      id: 77,
      code: 'POS-77',
      name: 'POS name',
      contactNumber: '0901234567',
      isActive: true,
    }],
    invoices: [{ id: 99, customerId: 77, status: 2 }],
    stats: {
      invoiceRows: 1,
      invoiceCustomerIds: 1,
      invoiceRowsWithoutCustomerId: 0,
      customerRows: 1,
      activeCustomers: 1,
      activeWithPhone: 1,
      eligibleCustomers: 1,
      debtPositive: 0,
      debtNotPositive: 1,
    },
    invoiceTimestamp: new Date('2026-08-27T01:00:00.000Z'),
    customerTimestamp: new Date('2026-08-27T01:01:00.000Z'),
  };
}

describe('projectCustomerCohort', () => {
  it('restores a normalized-phone match, retains CRM-entered fields, and attaches the POS identity', async () => {
    prisma.contact.findMany.mockResolvedValue([archivedContact]);
    prisma.contact.update.mockResolvedValue({});

    const result = await projectCustomerCohort(orgId, cohort().customers);

    expect(result).toEqual({
      selected: 1,
      created: 0,
      updated: 1,
      restored: 1,
      unchanged: 0,
      skippedMalformed: 0,
    });
    expect(prisma.contact.update).toHaveBeenCalledWith({
      where: { id: archivedContact.id },
      data: expect.objectContaining({
        posCustomerId: 77,
        posCustomerCode: 'POS-77',
        archivedAt: null,
        archivedById: null,
        posSyncedAt: expect.any(Date),
      }),
    });
    const patch = prisma.contact.update.mock.calls[0][0].data;
    expect(patch.fullName).toBeUndefined();
    expect(patch.phone).toBeUndefined();
    expect(patch.email).toBeUndefined();
    expect(patch.addressLine).toBeUndefined();
  });

  it('prefers POS ID over a conflicting normalized-phone match', async () => {
    const posMatch = { ...archivedContact, id: 'pos-match', posCustomerId: 77, phoneNormalized: '84999999999', archivedAt: null };
    const phoneMatch = { ...archivedContact, id: 'phone-match', posCustomerId: null, archivedAt: null };
    prisma.contact.findMany.mockResolvedValue([posMatch, phoneMatch]);
    prisma.contact.update.mockResolvedValue({});

    await projectCustomerCohort(orgId, cohort().customers);

    expect(prisma.contact.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'pos-match' },
    }));
  });

  it('creates only when neither POS ID nor normalized phone matches', async () => {
    prisma.contact.findMany.mockResolvedValue([]);
    prisma.contact.create.mockResolvedValue({
      ...archivedContact,
      id: 'new-contact',
      posCustomerId: 77,
      phoneNormalized: '84901234567',
      archivedAt: null,
    });

    const result = await projectCustomerCohort(orgId, cohort().customers);

    expect(result.created).toBe(1);
    expect(prisma.contact.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId,
        source: 'POS',
        posCustomerId: 77,
        posCustomerCode: 'POS-77',
      }),
      select: expect.any(Object),
    });
  });
});

describe('runInitialCustomerImport', () => {
  it('archives every active contact with one timestamp before local read-model projection', async () => {
    const selectedCohort = cohort();
    prisma.appSetting.findUnique.mockResolvedValue({
      valuePlain: JSON.stringify({
        rule: 'active_phone_invoice_v1',
        preview: {
          completedAt: new Date().toISOString(),
          stats: selectedCohort.stats,
          invoiceTimestamp: selectedCohort.invoiceTimestamp.toISOString(),
          customerTimestamp: selectedCohort.customerTimestamp.toISOString(),
        },
        import: { status: 'not_started' },
      }),
    });
    collectInvoiceBackedCustomerCohort.mockResolvedValue(selectedCohort);
    tenantTransaction.mockImplementation(async (operation) => operation({
      contact: {
        count: vi.fn().mockResolvedValue(2),
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      appSetting: { upsert: vi.fn(), update: vi.fn() },
      activityLog: { create: vi.fn() },
    }));
    prisma.contact.findMany.mockResolvedValue([]);
    prisma.contact.create.mockResolvedValue({
      ...archivedContact,
      id: 'new-contact',
      posCustomerId: 77,
      phoneNormalized: '84901234567',
      archivedAt: null,
    });
    batchUpsertInvoices.mockResolvedValue(1);
    batchUpsertCustomers.mockResolvedValue(1);
    prisma.appSetting.upsert.mockResolvedValue({});
    prisma.activityLog.create.mockResolvedValue({});

    await runInitialCustomerImport(orgId, ownerId);

    const tx = tenantTransaction.mock.calls[0][0];
    expect(tx).toBeTypeOf('function');
    const transactionResult = await tenantTransaction.mock.results[0].value;
    expect(transactionResult.archivedCount).toBe(2);
    const transactionClient = undefined;
    expect(batchUpsertInvoices).toHaveBeenCalledWith(orgId, selectedCohort.invoices);
    expect(batchUpsertCustomers).toHaveBeenCalledWith(orgId, selectedCohort.customers);
    expect(tenantTransaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 60_000 });
  });

  it('persists the full scanned invoice snapshot before projecting a completed cohort', async () => {
    const selectedCohort = cohort();
    prisma.appSetting.findUnique.mockResolvedValue({
      valuePlain: JSON.stringify({
        rule: 'active_phone_invoice_v1',
        import: { status: 'completed' },
      }),
    });
    collectInvoiceBackedCustomerCohort.mockResolvedValue(selectedCohort);
    prisma.contact.findMany.mockResolvedValue([]);
    prisma.contact.create.mockResolvedValue({
      ...archivedContact,
      id: 'new-contact',
      posCustomerId: 77,
      phoneNormalized: '84901234567',
      archivedAt: null,
    });
    prisma.appSetting.upsert.mockResolvedValue({});
    batchUpsertInvoices.mockResolvedValue(1);
    batchUpsertCustomers.mockResolvedValue(1);

    await syncCustomerCohort(orgId);

    expect(batchUpsertInvoices).toHaveBeenCalledWith(orgId, selectedCohort.invoices);
    expect(batchUpsertCustomers).toHaveBeenCalledWith(orgId, selectedCohort.customers);
    expect(batchUpsertInvoices.mock.invocationCallOrder[0]).toBeLessThan(
      batchUpsertCustomers.mock.invocationCallOrder[0],
    );
  });

  it('fails before any local writes if the refreshed cohort no longer matches the preview count', async () => {
    const selectedCohort = cohort();
    prisma.appSetting.findUnique.mockResolvedValue({
      valuePlain: JSON.stringify({
        rule: 'active_phone_invoice_v1',
        preview: {
          completedAt: new Date().toISOString(),
          stats: { ...selectedCohort.stats, eligibleCustomers: 2 },
          invoiceTimestamp: null,
          customerTimestamp: null,
        },
        import: { status: 'not_started' },
      }),
    });
    collectInvoiceBackedCustomerCohort.mockResolvedValue(selectedCohort);
    prisma.appSetting.upsert.mockResolvedValue({});

    await expect(runInitialCustomerImport(orgId, ownerId)).rejects.toThrow('Tập khách hàng đã đổi');
    expect(tenantTransaction).not.toHaveBeenCalled();
    expect(batchUpsertInvoices).not.toHaveBeenCalled();
    expect(batchUpsertCustomers).not.toHaveBeenCalled();
  });
});
