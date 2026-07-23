import { getPosMcpClient } from './mcp-client.js';
import { prisma } from '../database/prisma-client.js';
import { logger } from '../utils/logger.js';
import { getIo } from '../event-buffer.js';

// Helper sleep và retry tránh rate limit (429)
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithRetry(fetchFn: () => Promise<any>, maxRetries = 10, initialDelay = 5000): Promise<any> {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await fetchFn();
    } catch (err: any) {
      const errMsg = err.message || String(err);
      if (errMsg.includes('rate_limit_exceeded') || errMsg.includes('429')) {
        attempt++;
        const waitTime = initialDelay * Math.pow(2, attempt - 1);
        logger.warn(`[pos-sync] Bị giới hạn tần suất. Đang thử lại lần thứ ${attempt}/${maxRetries} sau ${waitTime / 1000}s...`);
        await sleep(waitTime);
      } else {
        throw err;
      }
    }
  }
  throw new Error(`Đã vượt quá số lần thử lại tối đa (${maxRetries}) do bị Rate Limit.`);
}

// ── Types ────────────────────────────────────────────────────────────────────
interface SyncProgress {
  table: 'products' | 'customers';
  phase: 'fetching' | 'saving' | 'done' | 'error';
  current: number;
  total: number;       // -1 = unknown yet
  message?: string;
}

function emitProgress(orgId: string, progress: SyncProgress): void {
  const io = getIo();
  if (io) io.to(`org:${orgId}`).emit('pos:sync:progress', progress);
}

// ── Batch helpers (raw SQL ON CONFLICT — 10-50× faster than serial upsert) ──

export function batchUpsertProducts(orgId: string, products: any[]): Promise<number> {
  if (products.length === 0) return Promise.resolve(0);

  // Build VALUES tuples: (gen_random_uuid(), $1, $2, $3, $4, $5, now(), now())
  const values: any[] = [];
  const tuples: string[] = [];
  let idx = 1;
  for (const prod of products) {
    if (!prod.id || !prod.code) continue;
    tuples.push(`(gen_random_uuid(), $${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}::float8, $${idx + 4}, now(), now())`);
    values.push(prod.id, prod.code, prod.name || '', prod.basePrice != null ? Number(prod.basePrice) : null, orgId);
    idx += 5;
  }
  if (tuples.length === 0) return Promise.resolve(0);

  const sql = `
    INSERT INTO pos_products (id, pos_id, code, name, base_price, org_id, created_at, updated_at)
    VALUES ${tuples.join(', ')}
    ON CONFLICT (pos_id, org_id) DO UPDATE SET
      code       = EXCLUDED.code,
      name       = EXCLUDED.name,
      base_price = EXCLUDED.base_price,
      updated_at = now()
  `;
  return prisma.$executeRawUnsafe(sql, ...values);
}

export function batchUpsertCustomers(orgId: string, customers: any[]): Promise<number> {
  if (customers.length === 0) return Promise.resolve(0);

  const values: any[] = [];
  const tuples: string[] = [];
  let idx = 1;

  // Tính mốc 2 năm trước từ thời điểm hiện tại
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

  for (const cust of customers) {
    if (!cust.id) continue;

    // Lọc: Chỉ lấy khách hàng có biến động tài chính và có hoạt động trong 2 năm trở lại đây
    const hasFinancial = Number(cust.totalPurchased || 0) > 0 ||
                         Number(cust.totalRevenue || 0) > 0 ||
                         Number(cust.totalDebt || 0) !== 0;

    const isRecent = cust.updatedAt ? new Date(cust.updatedAt) >= twoYearsAgo : false;

    // Bỏ qua nếu không thỏa mãn cả hai điều kiện (có tài chính và gần đây)
    if (!hasFinancial || !isRecent) {
      continue;
    }

    const phone = cust.phone || cust.contactNumber || null;
    const address = cust.addresses?.[0]?.address || cust.address || null;
    const custType = typeof cust.customerType === 'string'
      ? cust.customerType
      : (cust.customerType?.name || null);
    const tagsArray: string[] = [];
    if (cust.groups && Array.isArray(cust.groups)) {
      cust.groups.forEach((g: any) => { if (g.name) tagsArray.push(g.name); });
    }

    tuples.push(`(gen_random_uuid(), $${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, $${idx + 6}, $${idx + 7}::jsonb, $${idx + 8}, $${idx + 9}, now(), now())`);
    values.push(
      cust.id,
      cust.name || '',
      cust.code || null,
      phone,
      address,
      custType,
      cust.misaEmployeeName || cust.createdBy || null,
      JSON.stringify(tagsArray),
      cust.isActive ? 'Active' : 'Inactive',
      orgId,
    );
    idx += 10;
  }
  if (tuples.length === 0) return Promise.resolve(0);

  const sql = `
    INSERT INTO pos_customers (id, pos_id, name, code, phone, address, customer_type, assigned_sale_name, tags, status, org_id, created_at, updated_at)
    VALUES ${tuples.join(', ')}
    ON CONFLICT (pos_id, org_id) DO UPDATE SET
      name               = EXCLUDED.name,
      code               = EXCLUDED.code,
      phone              = EXCLUDED.phone,
      address            = EXCLUDED.address,
      customer_type      = EXCLUDED.customer_type,
      assigned_sale_name = EXCLUDED.assigned_sale_name,
      tags               = EXCLUDED.tags,
      status             = EXCLUDED.status,
      updated_at         = now()
  `;
  return prisma.$executeRawUnsafe(sql, ...values);
}

// ── Public sync functions ────────────────────────────────────────────────────

export async function syncPosProductsFromMcp(orgId: string): Promise<void> {
  const client = getPosMcpClient();
  logger.info(`[pos-sync] Syncing products for org ${orgId}`);
  emitProgress(orgId, { table: 'products', phase: 'fetching', current: 0, total: -1 });

  // Kiểm tra có job trước đó bị gián đoạn không
  const lastJob = await prisma.syncJob.findFirst({
    where: { orgId, entity: 'Product' },
    orderBy: { createdAt: 'desc' }
  });

  let page = 1;
  let totalSynced = 0;

  if (lastJob && lastJob.status !== 'Completed' && lastJob.currentPage > 0) {
    page = lastJob.currentPage;
    totalSynced = lastJob.processed;
    logger.info(`[pos-sync] Resuming manual product sync from page ${page}, processed: ${totalSynced}`);
  }

  // Tạo một SyncJob mới để theo dõi tiến trình
  const job = await prisma.syncJob.create({
    data: {
      orgId,
      entity: 'Product',
      status: 'Running',
      processed: totalSynced,
      currentPage: page,
      startTime: new Date()
    }
  });

  try {
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
      const res = await fetchWithRetry(() => client.products.list({ page, limit }));
      const products = (res as any).data || [];

      if (products.length === 0) {
        hasMore = false;
        break;
      }

      emitProgress(orgId, { table: 'products', phase: 'saving', current: totalSynced, total: -1, message: `Đang lưu trang ${page}...` });
      await batchUpsertProducts(orgId, products);

      totalSynced += products.length;

      // Cập nhật tiến trình vào database
      await prisma.syncJob.update({
        where: { id: job.id },
        data: {
          processed: totalSynced,
          currentPage: page
        }
      });

      emitProgress(orgId, { table: 'products', phase: 'fetching', current: totalSynced, total: -1, message: `Đã đồng bộ ${totalSynced} sản phẩm` });
      logger.info(`[pos-sync] Synced ${products.length} products on page ${page}. Total: ${totalSynced}`);

      if (products.length < limit) {
        hasMore = false;
      } else {
        page++;
        await sleep(800); // Khoảng nghỉ tránh rate limit
      }
    }

    // Đánh dấu job hoàn thành
    await prisma.syncJob.update({
      where: { id: job.id },
      data: {
        status: 'Completed',
        endTime: new Date()
      }
    });

    emitProgress(orgId, { table: 'products', phase: 'done', current: totalSynced, total: totalSynced, message: `Hoàn tất ${totalSynced} sản phẩm` });
    logger.info(`[pos-sync] Sync completed. Total synced products: ${totalSynced}`);
  } catch (err: any) {
    // Đánh dấu job thất bại
    await prisma.syncJob.update({
      where: { id: job.id },
      data: {
        status: 'Failed',
        endTime: new Date(),
        lastError: err.message || String(err)
      }
    });

    emitProgress(orgId, { table: 'products', phase: 'error', current: totalSynced, total: 0, message: err.message || 'Lỗi đồng bộ sản phẩm' });
    logger.error('[pos-sync] Sync products failed:', err.message || err);
    throw err;
  }
}

export async function syncPosCustomersFromMcp(orgId: string): Promise<void> {
  const client = getPosMcpClient();
  logger.info(`[pos-sync] Syncing customers for org ${orgId}`);
  emitProgress(orgId, { table: 'customers', phase: 'fetching', current: 0, total: -1 });

  // Kiểm tra có job trước đó bị gián đoạn không
  const lastJob = await prisma.syncJob.findFirst({
    where: { orgId, entity: 'Customer' },
    orderBy: { createdAt: 'desc' }
  });

  let currentItem = 0;
  let totalSynced = 0;

  if (lastJob && lastJob.status !== 'Completed' && lastJob.processed > 0) {
    currentItem = lastJob.processed;
    totalSynced = lastJob.processed;
    logger.info(`[pos-sync] Resuming manual customer sync from offset ${currentItem}`);
  }

  // Tạo một SyncJob mới để theo dõi tiến trình
  const job = await prisma.syncJob.create({
    data: {
      orgId,
      entity: 'Customer',
      status: 'Running',
      processed: totalSynced,
      currentPage: Math.floor(currentItem / 100),
      startTime: new Date()
    }
  });

  try {
    const pageSize = 100;
    let hasMore = true;

    while (hasMore) {
      const res = await fetchWithRetry(() => client.customers.list({ currentItem, pageSize, isActive: true }));
      const customers = (res as any).data || [];

      if (customers.length === 0) {
        hasMore = false;
        break;
      }

      emitProgress(orgId, { table: 'customers', phase: 'saving', current: totalSynced, total: -1, message: `Đang lưu trang ${Math.floor(currentItem / pageSize) + 1}...` });
      await batchUpsertCustomers(orgId, customers);

      totalSynced += customers.length;

      // Cập nhật tiến trình vào database
      await prisma.syncJob.update({
        where: { id: job.id },
        data: {
          processed: totalSynced,
          currentPage: Math.floor(currentItem / pageSize) + 1
        }
      });

      emitProgress(orgId, { table: 'customers', phase: 'fetching', current: totalSynced, total: -1, message: `Đã đồng bộ ${totalSynced} khách hàng` });
      logger.info(`[pos-sync] Synced ${customers.length} customers. Total: ${totalSynced}`);

      if (customers.length < pageSize) {
        hasMore = false;
      } else {
        currentItem += pageSize;
        if (currentItem > 50000) {
          logger.warn(`[pos-sync] Đã chạm giới hạn tối đa 50,000 khách hàng từ POS MCP Server. Dừng đồng bộ để tránh lỗi offset.`);
          hasMore = false;
        } else {
          await sleep(800); // Khoảng nghỉ tránh rate limit
        }
      }
    }

    // Đánh dấu job hoàn thành
    await prisma.syncJob.update({
      where: { id: job.id },
      data: {
        status: 'Completed',
        endTime: new Date()
      }
    });

    emitProgress(orgId, { table: 'customers', phase: 'done', current: totalSynced, total: totalSynced, message: `Hoàn tất ${totalSynced} khách hàng` });
    logger.info(`[pos-sync] Sync completed. Total synced customers: ${totalSynced}`);
  } catch (err: any) {
    // Đánh dấu job thất bại
    await prisma.syncJob.update({
      where: { id: job.id },
      data: {
        status: 'Failed',
        endTime: new Date(),
        lastError: err.message || String(err)
      }
    });

    emitProgress(orgId, { table: 'customers', phase: 'error', current: totalSynced, total: 0, message: err.message || 'Lỗi đồng bộ khách hàng' });
    logger.error('[pos-sync] Sync customers failed:', err.message || err);
    throw err;
  }
}
