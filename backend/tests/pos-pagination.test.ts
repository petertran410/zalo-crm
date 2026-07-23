import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PosPaginationService } from '../src/shared/mcp/pos-pagination-service.js';

// ── Mock prisma ──
const mockPrisma = vi.hoisted(() => ({
  posProduct: {
    findMany: vi.fn(),
  },
  posCustomer: {
    findMany: vi.fn(),
  },
}));

vi.mock('../src/shared/database/prisma-client.js', () => ({
  prisma: mockPrisma,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PosPaginationService - Product Pagination', () => {
  it('should fetch products and return items with hasNext=false if less than limit', async () => {
    const mockProducts = [
      { id: '1', posId: 101, code: 'P01', name: 'Product 1', basePrice: 10000, orgId: 'org-1' },
      { id: '2', posId: 102, code: 'P02', name: 'Product 2', basePrice: 20000, orgId: 'org-1' },
    ];
    mockPrisma.posProduct.findMany.mockResolvedValue(mockProducts);

    const result = await PosPaginationService.getProducts('org-1', { limit: 5 });

    expect(mockPrisma.posProduct.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: 'org-1' },
        take: 6,
      })
    );
    expect(result.items).toHaveLength(2);
    expect(result.hasNext).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it('should return hasNext=true and generate nextCursor if items exceed limit', async () => {
    const mockProducts = [
      { id: '1', posId: 101, code: 'P01', name: 'Product 1', basePrice: 10000, orgId: 'org-1' },
      { id: '2', posId: 102, code: 'P02', name: 'Product 2', basePrice: 20000, orgId: 'org-1' },
      { id: '3', posId: 103, code: 'P03', name: 'Product 3', basePrice: 30000, orgId: 'org-1' },
    ];
    mockPrisma.posProduct.findMany.mockResolvedValue(mockProducts);

    // Limit is 2, findMany returns 3, so hasNext is true
    const result = await PosPaginationService.getProducts('org-1', { limit: 2, sortBy: 'code', sortOrder: 'asc' });

    expect(result.items).toHaveLength(2);
    expect(result.hasNext).toBe(true);
    expect(result.nextCursor).toBeDefined();

    // Verify cursor content by decoding it
    const decoded = JSON.parse(Buffer.from(result.nextCursor!, 'base64').toString('utf-8'));
    expect(decoded.lastId).toBe('2');
    expect(decoded.lastValue).toBe('P02');
  });
});

describe('PosPaginationService - Customer Pagination & Search', () => {
  it('should filter by keyword when search term is provided', async () => {
    mockPrisma.posCustomer.findMany.mockResolvedValue([]);

    await PosPaginationService.getCustomers('org-1', { limit: 10, keyword: 'John' });

    const callArg = mockPrisma.posCustomer.findMany.mock.calls[0][0];
    expect(callArg.where.OR).toEqual([
      { name: { contains: 'John', mode: 'insensitive' } },
      { phone: { contains: 'John', mode: 'insensitive' } },
      { code: { contains: 'John', mode: 'insensitive' } },
    ]);
  });
});
