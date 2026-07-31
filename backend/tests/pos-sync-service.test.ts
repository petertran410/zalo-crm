import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  batchUpsertOrders,
  batchUpsertInvoices,
  batchUpsertCustomerDebts,
  batchUpsertBranchInventory,
} from '../src/shared/mcp/pos-sync-service.js';
import { linkPosCustomersToContacts } from '../src/workers/pos-customer-linker.js';

const mockPrisma = vi.hoisted(() => ({
  $executeRawUnsafe: vi.fn().mockResolvedValue(5000),
  posOrder: {
    findMany: vi.fn().mockResolvedValue([]),
  },
  posOrderItem: {
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
}));

vi.mock('../src/shared/database/prisma-client.js', () => ({
  prisma: mockPrisma,
}));

vi.mock('../src/shared/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../src/shared/event-buffer.js', () => ({
  getIo: vi.fn().mockReturnValue(null),
}));

vi.mock('../src/shared/mcp/mcp-client.js', () => ({
  getPosMcpClient: vi.fn().mockReturnValue({}),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$executeRawUnsafe.mockResolvedValue(5000);
});

describe('POS Sync Service - High-Performance Batch Upsert Benchmark', () => {
  it('should execute batch upsert of 5,000 mock POS orders in < 3 seconds', async () => {
    const orgId = '00000000-0000-0000-0000-000000000001';

    const mock5kOrders = Array.from({ length: 5000 }, (_, i) => ({
      id: i + 1,
      code: `ORD-${10000 + i}`,
      customerId: 2000 + (i % 500),
      customerCode: `CUST-${2000 + (i % 500)}`,
      customerName: `Customer ${i}`,
      customerPhone: `090${String(1000000 + i).padStart(7, '0')}`,
      branchId: 1 + (i % 5),
      branchName: `Branch ${1 + (i % 5)}`,
      total: 150000 + i * 10,
      discount: 10000,
      grandTotal: 140000 + i * 10,
      paidAmount: 140000 + i * 10,
      debtAmount: 0,
      statusValue: 'Completed',
      orderDate: new Date('2026-07-31T10:00:00Z'),
      items: [
        {
          productId: 500 + (i % 100),
          productCode: `PROD-${500 + (i % 100)}`,
          productName: `Product ${500 + (i % 100)}`,
          quantity: 2,
          price: 75000,
          discount: 5000,
          totalPrice: 145000,
        },
      ],
    }));

    const startTime = performance.now();

    const count = await batchUpsertOrders(orgId, mock5kOrders);

    const endTime = performance.now();
    const durationMs = endTime - startTime;

    expect(count).toBe(5000);
    expect(durationMs).toBeLessThan(3000);

    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalled();
    const rawSqlCall = mockPrisma.$executeRawUnsafe.mock.calls.find((call) =>
      String(call[0]).toLowerCase().includes('unnest')
    );
    expect(rawSqlCall).toBeDefined();
    expect(rawSqlCall![0]).toContain('pos_orders');
    expect(rawSqlCall![0]).toContain('$2::int4[]');
  });

  it('should execute batch upsert of 5,000 mock POS invoices in < 3 seconds', async () => {
    const orgId = '00000000-0000-0000-0000-000000000001';

    const mock5kInvoices = Array.from({ length: 5000 }, (_, i) => ({
      id: i + 1,
      code: `INV-${10000 + i}`,
      orderId: i + 1,
      customerId: 2000 + (i % 500),
      customerCode: `CUST-${2000 + (i % 500)}`,
      totalAmount: 200000,
      paidAmount: 200000,
      remainingDebt: 0,
      statusValue: 'Paid',
      invoiceDate: new Date('2026-07-31T10:00:00Z'),
    }));

    const startTime = performance.now();

    const count = await batchUpsertInvoices(orgId, mock5kInvoices);

    const endTime = performance.now();
    const durationMs = endTime - startTime;

    expect(count).toBe(5000);
    expect(durationMs).toBeLessThan(3000);

    const rawSqlCall = mockPrisma.$executeRawUnsafe.mock.calls.find((call) =>
      String(call[0]).includes('pos_invoices')
    );
    expect(rawSqlCall).toBeDefined();
    expect(String(rawSqlCall![0]).toLowerCase()).toContain('unnest');
  });

  it('should execute batch upsert of 5,000 mock POS customer debts in < 3 seconds', async () => {
    const orgId = '00000000-0000-0000-0000-000000000001';

    const mock5kDebts = Array.from({ length: 5000 }, (_, i) => ({
      id: 2000 + i,
      code: `CUST-${2000 + i}`,
      name: `Customer ${i}`,
      phone: `090${String(1000000 + i).padStart(7, '0')}`,
      totalDebt: 500000,
      currentDebt: 300000,
      overdueDebt: 100000,
      dueDate: new Date('2026-07-25T00:00:00Z'),
      status: 'Danger',
    }));

    const startTime = performance.now();

    const count = await batchUpsertCustomerDebts(orgId, mock5kDebts);

    const endTime = performance.now();
    const durationMs = endTime - startTime;

    expect(count).toBe(5000);
    expect(durationMs).toBeLessThan(3000);

    const rawSqlCall = mockPrisma.$executeRawUnsafe.mock.calls.find((call) =>
      String(call[0]).includes('pos_customer_debts')
    );
    expect(rawSqlCall).toBeDefined();
    expect(String(rawSqlCall![0]).toLowerCase()).toContain('unnest');
  });

  it('should execute batch upsert of 5,000 mock POS branch inventory in < 3 seconds', async () => {
    const orgId = '00000000-0000-0000-0000-000000000001';

    const mock5kInventory = Array.from({ length: 5000 }, (_, i) => ({
      productId: i + 1,
      productCode: `PROD-${i + 1}`,
      productName: `Product ${i + 1}`,
      branchId: 1 + (i % 3),
      branchName: `Branch ${1 + (i % 3)}`,
      onHand: 100,
      reserved: 10,
      available: 90,
      minStockLevel: 20,
      status: 'InStock',
    }));

    const startTime = performance.now();

    const count = await batchUpsertBranchInventory(orgId, mock5kInventory);

    const endTime = performance.now();
    const durationMs = endTime - startTime;

    expect(count).toBe(5000);
    expect(durationMs).toBeLessThan(3000);

    const rawSqlCall = mockPrisma.$executeRawUnsafe.mock.calls.find((call) =>
      String(call[0]).includes('pos_branch_inventory')
    );
    expect(rawSqlCall).toBeDefined();
    expect(String(rawSqlCall![0]).toLowerCase()).toContain('unnest');
  });
});

describe('POS Customer Linker - 2-Stage Auto-Linking', () => {
  it('should perform Stage 1 (exact pos_customer_id) and Stage 2 (normalized phone) linking', async () => {
    const orgId = '00000000-0000-0000-0000-000000000001';

    mockPrisma.$executeRawUnsafe.mockImplementation(async (sql: string) => {
      if (sql.includes('pos_invoices') && sql.includes('c.pos_customer_id = i.pos_customer_id')) {
        return 10;
      }
      if (sql.includes('pos_invoices') && (sql.includes('EXISTS') || sql.includes('customer_phone') || sql.includes('phone_key'))) {
        return 3;
      }
      if (sql.includes('pos_orders') && sql.includes('c.pos_customer_id = o.pos_customer_id')) {
        return 15;
      }
      if (sql.includes('pos_orders') && (sql.includes('REGEXP_REPLACE') || sql.includes('phone_key'))) {
        return 5;
      }
      if (sql.includes('pos_customer_debts') && sql.includes('c.pos_customer_id = d.pos_customer_id')) {
        return 8;
      }
      if (sql.includes('pos_customer_debts') && (sql.includes('REGEXP_REPLACE') || sql.includes('phone_key'))) {
        return 2;
      }
      return 0;
    });

    const result = await linkPosCustomersToContacts(orgId);

    expect(result.linkedOrders).toBe(20);
    expect(result.linkedInvoices).toBe(13);
    expect(result.linkedDebts).toBe(10);

    const calls = mockPrisma.$executeRawUnsafe.mock.calls.map((c) => String(c[0]));

    const hasStage1ExactId = calls.some((sql) => sql.includes('pos_customer_id') && sql.includes('pos_orders'));
    const hasStage2PhoneNorm = calls.some((sql) => sql.includes('REGEXP_REPLACE') || sql.includes('phone_key'));

    expect(hasStage1ExactId).toBe(true);
    expect(hasStage2PhoneNorm).toBe(true);
  });
});
