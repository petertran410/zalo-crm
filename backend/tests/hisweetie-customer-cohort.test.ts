import { describe, expect, it, vi } from 'vitest';
import {
  collectInvoiceBackedCustomerCohort,
  customerPhone,
  isInvoiceBackedCustomer,
  type CustomerCohortClient,
} from '../src/modules/integrations/hisweetie-customer-cohort.js';
import { PublicApiRateLimitError } from '../src/modules/integrations/hisweetie-public-api-client.js';
import { SyncCancelledError } from '../src/modules/pos/pos-sync-lock.js';

const TS_INVOICES = '2026-08-27T01:02:03.000Z';
const TS_CUSTOMERS = '2026-08-27T01:03:04.000Z';

function clientWith(
  listInvoices: CustomerCohortClient['listInvoices'],
  listCustomers: CustomerCohortClient['listCustomers'],
): CustomerCohortClient {
  return { listInvoices, listCustomers };
}

describe('POS customer cohort predicate', () => {
  it.each([
    ['contactNumber', { contactNumber: ' 0901 234 567 ' }],
    ['phone', { contactNumber: ' ', phone: '0902' }],
    ['phoneNumber', { phone: '', phoneNumber: '0903' }],
  ])('accepts a trimmed phone from %s', (_field, row) => {
    expect(customerPhone(row)).toMatch(/^09/);
    expect(isInvoiceBackedCustomer({ id: 7, isActive: true, ...row }, new Set([7]))).toBe(true);
  });

  it('rejects blank phones, non-explicit active status, missing IDs, and customers without invoices', () => {
    const invoiceIds = new Set([7]);
    expect(customerPhone({ contactNumber: ' ', phone: '', phoneNumber: '\t' })).toBeNull();
    expect(isInvoiceBackedCustomer({ id: 7, isActive: true, phone: ' ' }, invoiceIds)).toBe(false);
    expect(isInvoiceBackedCustomer({ id: 7, phone: '0901' }, invoiceIds)).toBe(false);
    expect(isInvoiceBackedCustomer({ id: 7, isActive: false, phone: '0901' }, invoiceIds)).toBe(false);
    expect(isInvoiceBackedCustomer({ isActive: true, phone: '0901' }, invoiceIds)).toBe(false);
    expect(isInvoiceBackedCustomer({ id: 8, isActive: true, phone: '0901' }, invoiceIds)).toBe(false);
  });
});

describe('collectInvoiceBackedCustomerCohort', () => {
  it('deduplicates rows, accepts every invoice status, and classifies debt without filtering on it', async () => {
    const listInvoices = vi.fn<CustomerCohortClient['listInvoices']>().mockResolvedValue({
      total: 7,
      timestamp: TS_INVOICES,
      data: [
        { id: 11, customerId: 1, status: 1 },
        { id: 12, customerId: 2, status: 2 },
        { id: 13, customerId: 3, status: 3 },
        { id: 14, customerId: 4, status: 7 },
        { id: 14, customerId: 4, status: 7 },
        { id: 15, customerId: null, status: 1 },
        { invoiceId: '16', posCustomerId: '2', status: 2 },
      ],
    });
    const listCustomers = vi.fn<CustomerCohortClient['listCustomers']>().mockResolvedValue({
      total: 8,
      timestamp: TS_CUSTOMERS,
      data: [
        { id: 1, isActive: true, contactNumber: '0901', totalDebt: '10' },
        { id: 2, isActive: true, phone: '0902', totalDebt: '0' },
        { id: 3, isActive: true, phoneNumber: '0903', totalDebt: '-20' },
        { id: 4, isActive: true, phone: '0904' },
        { id: 4, isActive: true, phone: 'duplicate' },
        { id: 5, isActive: true, phone: '0905' },
        { id: 1, isActive: false, phone: '0901' },
        { name: 'missing id', isActive: true, phone: '0906' },
      ],
    });

    const result = await collectInvoiceBackedCustomerCohort({
      client: clientWith(listInvoices, listCustomers),
    });

    expect(result.customers.map((row) => row.id)).toEqual([1, 2, 3, 4]);
    expect(result.invoices).toHaveLength(6);
    expect(result.stats).toEqual({
      invoiceRows: 6,
      invoiceCustomerIds: 4,
      invoiceRowsWithoutCustomerId: 1,
      customerRows: 5,
      activeCustomers: 5,
      activeWithPhone: 5,
      eligibleCustomers: 4,
      debtPositive: 1,
      debtNotPositive: 3,
    });
  });

  it('bounds every page after the first by the first POS server timestamp', async () => {
    const invoicePage = Array.from({ length: 100 }, (_, index) => ({
      id: index + 1,
      customerId: index + 1,
    }));
    const customerPage = Array.from({ length: 100 }, (_, index) => ({
      id: index + 1,
      isActive: true,
      contactNumber: `09${String(index).padStart(2, '0')}`,
    }));
    const listInvoices = vi.fn<CustomerCohortClient['listInvoices']>()
      .mockResolvedValueOnce({ total: 101, timestamp: TS_INVOICES, data: invoicePage })
      .mockResolvedValueOnce({ total: 101, timestamp: '2099-01-01T00:00:00.000Z', data: [{ id: 101, customerId: 101 }] });
    const listCustomers = vi.fn<CustomerCohortClient['listCustomers']>()
      .mockResolvedValueOnce({ total: 101, timestamp: TS_CUSTOMERS, data: customerPage })
      .mockResolvedValueOnce({ total: 101, timestamp: '2099-01-01T00:00:00.000Z', data: [{ id: 101, isActive: true, phone: '090101' }] });

    const result = await collectInvoiceBackedCustomerCohort({
      client: clientWith(listInvoices, listCustomers),
    });

    expect(listInvoices).toHaveBeenNthCalledWith(1, { currentItem: 0, pageSize: 100 });
    expect(listInvoices).toHaveBeenNthCalledWith(2, {
      currentItem: 100,
      pageSize: 100,
      toDate: TS_INVOICES,
    });
    expect(listCustomers).toHaveBeenNthCalledWith(1, { currentItem: 0, pageSize: 100 });
    expect(listCustomers).toHaveBeenNthCalledWith(2, {
      currentItem: 100,
      pageSize: 100,
      toDate: TS_CUSTOMERS,
    });
    expect(result.invoiceTimestamp?.toISOString()).toBe(TS_INVOICES);
    expect(result.customerTimestamp?.toISOString()).toBe(TS_CUSTOMERS);
    expect(result.stats.eligibleCustomers).toBe(101);
  });

  it('reports both phases and stops before the next request when cancellation is requested', async () => {
    const listInvoices = vi.fn<CustomerCohortClient['listInvoices']>().mockResolvedValue({
      total: 1,
      timestamp: TS_INVOICES,
      data: [{ id: 1, customerId: 1 }],
    });
    const listCustomers = vi.fn<CustomerCohortClient['listCustomers']>();
    const onProgress = vi.fn();
    const shouldCancel = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await expect(collectInvoiceBackedCustomerCohort({
      client: clientWith(listInvoices, listCustomers),
      shouldCancel,
      onProgress,
    })).rejects.toBeInstanceOf(SyncCancelledError);

    expect(onProgress).toHaveBeenCalledWith({ phase: 'invoices', processed: 1, total: 1 });
    expect(listInvoices).toHaveBeenCalledTimes(1);
    expect(listCustomers).not.toHaveBeenCalled();
  });

  it('waits for Retry-After and retries a rate-limited page without duplicating it', async () => {
    const listInvoices = vi.fn<CustomerCohortClient['listInvoices']>()
      .mockRejectedValueOnce(new PublicApiRateLimitError(2_500))
      .mockResolvedValueOnce({
        total: 1,
        timestamp: TS_INVOICES,
        data: [{ id: 1, customerId: 1 }],
      });
    const listCustomers = vi.fn<CustomerCohortClient['listCustomers']>().mockResolvedValue({
      total: 1,
      timestamp: TS_CUSTOMERS,
      data: [{ id: 1, isActive: true, phone: '0901' }],
    });
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await collectInvoiceBackedCustomerCohort({
      client: clientWith(listInvoices, listCustomers),
      sleep,
    });

    expect(sleep).toHaveBeenCalledOnce();
    expect(sleep).toHaveBeenCalledWith(2_500);
    expect(listInvoices).toHaveBeenCalledTimes(2);
    expect(result.stats.eligibleCustomers).toBe(1);
  });

  it('depends only on the two read methods exposed by the collector client', async () => {
    const client = {
      listInvoices: vi.fn().mockResolvedValue({ data: [], total: 0, timestamp: TS_INVOICES }),
      listCustomers: vi.fn().mockResolvedValue({ data: [], total: 0, timestamp: TS_CUSTOMERS }),
      createCustomer: vi.fn(),
      updateCustomer: vi.fn(),
      createInvoice: vi.fn(),
    };

    await collectInvoiceBackedCustomerCohort({ client });

    expect(client.createCustomer).not.toHaveBeenCalled();
    expect(client.updateCustomer).not.toHaveBeenCalled();
    expect(client.createInvoice).not.toHaveBeenCalled();
  });
});
