import { prisma } from '../database/prisma-client.js';
import { 
  PaginationRequest, 
  PaginationResponse, 
  decodeCursor, 
  encodeCursor 
} from '../pagination/cursor-pagination.js';

export class PosPaginationService {
  static async getProducts(orgId: string, req: PaginationRequest): Promise<PaginationResponse<any>> {
    const limit = Math.min(req.limit || 20, 100);
    const decoded = decodeCursor(req.cursor);
    const lastId = decoded?.lastId;
    const lastValue = decoded?.lastValue;
    const sortBy = req.sortBy || 'createdAt';
    const sortOrder = req.sortOrder || 'desc';

    const where: any = { orgId };
    if (req.keyword) {
      where.OR = [
        { name: { contains: req.keyword, mode: 'insensitive' } },
        { code: { contains: req.keyword, mode: 'insensitive' } },
      ];
    }

    if (lastId && lastValue !== undefined) {
      const operator = sortOrder === 'desc' ? 'lt' : 'gt';
      where.AND = [
        {
          OR: [
            { [sortBy]: { [operator]: lastValue } },
            {
              AND: [
                { [sortBy]: lastValue },
                { id: { [operator]: lastId } },
              ],
            },
          ],
        },
      ];
    }

    const items = await prisma.posProduct.findMany({
      where,
      orderBy: [
        { [sortBy]: sortOrder },
        { id: sortOrder },
      ],
      take: limit + 1,
    });

    const hasNext = items.length > limit;
    const paginatedItems = hasNext ? items.slice(0, limit) : items;

    let nextCursor: string | null = null;
    if (hasNext && paginatedItems.length > 0) {
      const lastItem = paginatedItems[paginatedItems.length - 1];
      nextCursor = encodeCursor({
        lastId: lastItem.id,
        lastValue: (lastItem as any)[sortBy],
      });
    }

    return {
      items: paginatedItems,
      nextCursor,
      hasNext,
    };
  }

  static async getCustomers(orgId: string, req: PaginationRequest): Promise<PaginationResponse<any>> {
    const limit = Math.min(req.limit || 20, 100);
    const decoded = decodeCursor(req.cursor);
    const lastId = decoded?.lastId;
    const lastValue = decoded?.lastValue;
    const sortBy = req.sortBy || 'createdAt';
    const sortOrder = req.sortOrder || 'desc';

    const where: any = { orgId };
    if (req.keyword) {
      where.OR = [
        { name: { contains: req.keyword, mode: 'insensitive' } },
        { phone: { contains: req.keyword, mode: 'insensitive' } },
        { code: { contains: req.keyword, mode: 'insensitive' } },
      ];
    }

    if (lastId && lastValue !== undefined) {
      const operator = sortOrder === 'desc' ? 'lt' : 'gt';
      where.AND = [
        {
          OR: [
            { [sortBy]: { [operator]: lastValue } },
            {
              AND: [
                { [sortBy]: lastValue },
                { id: { [operator]: lastId } },
              ],
            },
          ],
        },
      ];
    }

    const items = await prisma.posCustomer.findMany({
      where,
      orderBy: [
        { [sortBy]: sortOrder },
        { id: sortOrder },
      ],
      take: limit + 1,
    });

    const hasNext = items.length > limit;
    const paginatedItems = hasNext ? items.slice(0, limit) : items;

    let nextCursor: string | null = null;
    if (hasNext && paginatedItems.length > 0) {
      const lastItem = paginatedItems[paginatedItems.length - 1];
      nextCursor = encodeCursor({
        lastId: lastItem.id,
        lastValue: (lastItem as any)[sortBy],
      });
    }

    return {
      items: paginatedItems,
      nextCursor,
      hasNext,
    };
  }
}
