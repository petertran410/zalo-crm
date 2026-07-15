import { getPosMcpClient } from './mcp-client.js';
import { prisma } from '../database/prisma-client.js';
import { logger } from '../utils/logger.js';
import { getIo } from '../event-buffer.js';

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

function batchUpsertProducts(orgId: string, products: any[]): Promise<number> {
  if (products.length === 0) return Promise.resolve(0);

  // Build VALUES tuples: ($1, $2, $3, $4, $5, now(), now())
  const values: any[] = [];
  const tuples: string[] = [];
  let idx = 1;
  for (const prod of products) {
    if (!prod.id || !prod.code) continue;
    tuples.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}::float8, $${idx + 4}, now(), now())`);
    values.push(prod.id, prod.code, prod.name || '', prod.basePrice != null ? Number(prod.basePrice) : null, orgId);
    idx += 5;
  }
  if (tuples.length === 0) return Promise.resolve(0);

  const sql = `
    INSERT INTO pos_products (pos_id, code, name, base_price, org_id, created_at, updated_at)
    VALUES ${tuples.join(', ')}
    ON CONFLICT (pos_id) DO UPDATE SET
      code       = EXCLUDED.code,
      name       = EXCLUDED.name,
      base_price = EXCLUDED.base_price,
      updated_at = now()
  `;
  return prisma.$executeRawUnsafe(sql, ...values);
}

function batchUpsertCustomers(orgId: string, customers: any[]): Promise<number> {
  if (customers.length === 0) return Promise.resolve(0);

  const values: any[] = [];
  const tuples: string[] = [];
  let idx = 1;
  for (const cust of customers) {
    if (!cust.id) continue;
    const phone = cust.phone || cust.contactNumber || null;
    const address = cust.addresses?.[0]?.address || cust.address || null;
    const custType = typeof cust.customerType === 'string'
      ? cust.customerType
      : (cust.customerType?.name || null);
    const tagsArray: string[] = [];
    if (cust.groups && Array.isArray(cust.groups)) {
      cust.groups.forEach((g: any) => { if (g.name) tagsArray.push(g.name); });
    }

    tuples.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, $${idx + 6}, $${idx + 7}::jsonb, $${idx + 8}, $${idx + 9}, now(), now())`);
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
    INSERT INTO pos_customers (pos_id, name, code, phone, address, customer_type, assigned_sale_name, tags, status, org_id, created_at, updated_at)
    VALUES ${tuples.join(', ')}
    ON CONFLICT (pos_id) DO UPDATE SET
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

  try {
    let page = 1;
    const limit = 100;
    let totalSynced = 0;
    let hasMore = true;

    while (hasMore) {
      const res = await client.products.list({ page, limit });
      const products = (res as any).data || [];

      if (products.length === 0) {
        hasMore = false;
        break;
      }

      emitProgress(orgId, { table: 'products', phase: 'saving', current: totalSynced, total: -1, message: `Đang lưu trang ${page}...` });
      await batchUpsertProducts(orgId, products);

      totalSynced += products.length;
      emitProgress(orgId, { table: 'products', phase: 'fetching', current: totalSynced, total: -1, message: `Đã đồng bộ ${totalSynced} sản phẩm` });
      logger.info(`[pos-sync] Synced ${products.length} products on page ${page}. Total: ${totalSynced}`);

      if (products.length < limit) {
        hasMore = false;
      } else {
        page++;
        await new Promise((resolve) => setTimeout(resolve, 200)); // Khoảng nghỉ tránh rate limit
      }
    }

    emitProgress(orgId, { table: 'products', phase: 'done', current: totalSynced, total: totalSynced, message: `Hoàn tất ${totalSynced} sản phẩm` });
    logger.info(`[pos-sync] Sync completed. Total synced products: ${totalSynced}`);
  } catch (err: any) {
    emitProgress(orgId, { table: 'products', phase: 'error', current: 0, total: 0, message: err.message || 'Lỗi đồng bộ sản phẩm' });
    logger.error('[pos-sync] Sync products failed:', err.message || err);
    throw err;
  }
}

export async function syncPosCustomersFromMcp(orgId: string): Promise<void> {
  const client = getPosMcpClient();
  logger.info(`[pos-sync] Syncing customers for org ${orgId}`);
  emitProgress(orgId, { table: 'customers', phase: 'fetching', current: 0, total: -1 });

  try {
    let currentItem = 0;
    const pageSize = 100;
    let totalSynced = 0;
    let hasMore = true;

    while (hasMore) {
      const res = await client.customers.list({ currentItem, pageSize });
      const customers = (res as any).data || [];

      if (customers.length === 0) {
        hasMore = false;
        break;
      }

      emitProgress(orgId, { table: 'customers', phase: 'saving', current: totalSynced, total: -1, message: `Đang lưu trang ${Math.floor(currentItem / pageSize) + 1}...` });
      await batchUpsertCustomers(orgId, customers);

      totalSynced += customers.length;
      emitProgress(orgId, { table: 'customers', phase: 'fetching', current: totalSynced, total: -1, message: `Đã đồng bộ ${totalSynced} khách hàng` });
      logger.info(`[pos-sync] Synced ${customers.length} customers. Total: ${totalSynced}`);

      if (customers.length < pageSize) {
        hasMore = false;
      } else {
        currentItem += pageSize;
        await new Promise((resolve) => setTimeout(resolve, 200)); // Khoảng nghỉ tránh rate limit
      }
    }

    emitProgress(orgId, { table: 'customers', phase: 'done', current: totalSynced, total: totalSynced, message: `Hoàn tất ${totalSynced} khách hàng` });
    logger.info(`[pos-sync] Sync completed. Total synced customers: ${totalSynced}`);
  } catch (err: any) {
    emitProgress(orgId, { table: 'customers', phase: 'error', current: 0, total: 0, message: err.message || 'Lỗi đồng bộ khách hàng' });
    logger.error('[pos-sync] Sync customers failed:', err.message || err);
    throw err;
  }
}
