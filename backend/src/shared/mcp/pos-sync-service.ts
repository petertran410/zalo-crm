import path from 'node:path';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { getPosMcpClient } from './mcp-client.js';
import { prisma } from '../database/prisma-client.js';
import { logger } from '../utils/logger.js';
import { getIo } from '../event-buffer.js';
import { config } from '../../config/index.js';

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
  table: 'products' | 'customers' | 'orders' | 'invoices' | 'branch_inventory' | 'debts';
  phase: 'fetching' | 'saving' | 'done' | 'error';
  current: number;
  total: number;       // -1 = unknown yet
  message?: string;
}

function emitProgress(orgId: string, progress: SyncProgress): void {
  const io = getIo();
  if (io) io.to(`org:${orgId}`).emit('pos:sync:progress', progress);
}

export interface PosDataUpdatedPayload {
  type: 'order' | 'debt' | 'inventory' | 'customer' | 'product';
  action: 'synced' | 'created' | 'updated' | 'deleted' | string;
  orgId: string;
  timestamp: string;
  summary?: string;
  data?: Record<string, unknown>;
}

export function emitPosDataUpdated(
  orgId: string,
  event: {
    type: 'order' | 'debt' | 'inventory' | 'customer' | 'product';
    action?: string;
    summary?: string;
    data?: Record<string, unknown>;
  }
): void {
  const io = getIo();
  if (io) {
    const payload: PosDataUpdatedPayload = {
      type: event.type,
      action: event.action || 'synced',
      orgId,
      timestamp: new Date().toISOString(),
      summary: event.summary,
      data: event.data,
    };
    io.to(`org:${orgId}`).emit('pos:data:updated', payload);
  }
}

/**
 * Generic Chunked Execution Wrapper for Batch Operations
 */
export async function batchUpsertInChunks<T>(
  items: T[],
  chunkSize: number,
  upsertFn: (chunk: T[]) => Promise<number>
): Promise<number> {
  if (!items || items.length === 0) return 0;
  let totalProcessed = 0;
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const count = await upsertFn(chunk);
    totalProcessed += count;
  }
  return totalProcessed;
}

// ── Product Images Sync ──────────────────────────────────────────────────────

export async function batchSyncProductImages(orgId: string, products: any[]): Promise<number> {
  if (!products || products.length === 0) return 0;

  const allImages: { id: number; productId: number; image: string }[] = [];
  for (const prod of products) {
    if (prod.images && Array.isArray(prod.images)) {
      for (const img of prod.images) {
        if (img.id && img.image) {
          allImages.push({
            id: Number(img.id),
            productId: Number(img.productId || prod.id),
            image: String(img.image),
          });
        }
      }
    } else if (prod.imageUrl) {
      allImages.push({
        id: Number(prod.id),
        productId: Number(prod.id),
        image: String(prod.imageUrl),
      });
    }
  }

  if (allImages.length === 0) return 0;

  const imageIds = allImages.map(img => img.id);
  const existingRecords = await prisma.posProductImage.findMany({
    where: {
      orgId,
      posImageId: { in: imageIds },
    },
    select: { posImageId: true, originalUrl: true, localUrl: true },
  });

  const existingMap = new Map<number, { originalUrl: string; localUrl: string }>();
  for (const rec of existingRecords) {
    existingMap.set(rec.posImageId, rec);
  }

  const targetDir = path.join(config.uploadDir, 'pos-products');
  mkdirSync(targetDir, { recursive: true });

  let downloadedCount = 0;

  for (const img of allImages) {
    const existing = existingMap.get(img.id);
    const extMatch = img.image.match(/\.(jpg|jpeg|png|webp|gif)($|\?)/i);
    const ext = extMatch ? `.${extMatch[1].toLowerCase()}` : '.jpg';
    const fileName = `${img.productId}-${img.id}${ext}`;
    const localFilePath = path.join(targetDir, fileName);
    const localUrl = `/files/pos-products/${fileName}`;

    if (existing && existing.originalUrl === img.image && existsSync(localFilePath)) {
      continue;
    }

    try {
      logger.info(`[pos-sync] Downloading image ${img.id} for product ${img.productId} from POS...`);
      const res = await fetch(img.image, { signal: AbortSignal.timeout(15000) });
      if (res.ok) {
        const buffer = Buffer.from(await res.arrayBuffer());
        writeFileSync(localFilePath, buffer);

        await prisma.posProductImage.upsert({
          where: { posImageId_orgId: { posImageId: img.id, orgId } },
          create: {
            posImageId: img.id,
            posProductId: img.productId,
            originalUrl: img.image,
            localUrl: localUrl,
            orgId,
          },
          update: {
            originalUrl: img.image,
            localUrl: localUrl,
            updatedAt: new Date(),
          },
        });
        downloadedCount++;
      } else {
        logger.warn(`[pos-sync] Failed to download image ${img.image}: HTTP ${res.status}`);
      }
    } catch (err: any) {
      logger.warn(`[pos-sync] Download image error for product ${img.productId}: ${err.message || err}`);
    }
  }

  return downloadedCount;
}

// ── Products Batch Upsert ────────────────────────────────────────────────────

export async function batchUpsertProducts(orgId: string, products: any[]): Promise<number> {
  if (!products || products.length === 0) return 0;

  void batchSyncProductImages(orgId, products).catch(err => {
    logger.error('[pos-sync] batchSyncProductImages failed:', err);
  });

  const posIds: number[] = [];
  const codes: string[] = [];
  const names: string[] = [];
  const basePrices: (number | null)[] = [];

  for (const prod of products) {
    if (!prod.id || !prod.code) continue;
    posIds.push(Number(prod.id));
    codes.push(String(prod.code));
    names.push(String(prod.name || ''));
    basePrices.push(prod.basePrice != null ? Number(prod.basePrice) : null);
  }

  if (posIds.length === 0) return 0;

  const sql = `
    INSERT INTO pos_products (id, pos_id, code, name, base_price, org_id, created_at, updated_at)
    SELECT
      gen_random_uuid(),
      u.pos_id,
      u.code,
      u.name,
      u.base_price,
      $1::uuid,
      now(),
      now()
    FROM unnest(
      $2::int4[],
      $3::text[],
      $4::text[],
      $5::float8[]
    ) AS u(pos_id, code, name, base_price)
    ON CONFLICT (pos_id, org_id) DO UPDATE SET
      code       = EXCLUDED.code,
      name       = EXCLUDED.name,
      base_price = EXCLUDED.base_price,
      updated_at = now()
  `;

  const result = await prisma.$executeRawUnsafe(sql, orgId, posIds, codes, names, basePrices);
  if (result > 0) {
    emitPosDataUpdated(orgId, { type: 'product', action: 'synced' });
  }
  return result;
}

// ── Customers Batch Upsert ───────────────────────────────────────────────────

export async function batchUpsertCustomers(orgId: string, customers: any[]): Promise<number> {
  if (!customers || customers.length === 0) return 0;

  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

  const posIds: number[] = [];
  const names: string[] = [];
  const codes: (string | null)[] = [];
  const phones: (string | null)[] = [];
  const addresses: (string | null)[] = [];
  const customerTypes: (string | null)[] = [];
  const assignedSaleNames: (string | null)[] = [];
  const tagsJsons: string[] = [];
  const statuses: string[] = [];

  for (const cust of customers) {
    if (!cust.id) continue;

    const hasFinancial = Number(cust.totalPurchased || 0) > 0 ||
                         Number(cust.totalRevenue || 0) > 0 ||
                         Number(cust.totalDebt || 0) !== 0;

    const isRecent = cust.updatedAt ? new Date(cust.updatedAt) >= twoYearsAgo : false;

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

    posIds.push(Number(cust.id));
    names.push(String(cust.name || ''));
    codes.push(cust.code || null);
    phones.push(phone);
    addresses.push(address);
    customerTypes.push(custType);
    assignedSaleNames.push(cust.misaEmployeeName || cust.createdBy || null);
    tagsJsons.push(JSON.stringify(tagsArray));
    statuses.push(cust.isActive ? 'Active' : 'Inactive');
  }

  if (posIds.length === 0) return 0;

  const sql = `
    INSERT INTO pos_customers (id, pos_id, name, code, phone, address, customer_type, assigned_sale_name, tags, status, org_id, created_at, updated_at)
    SELECT
      gen_random_uuid(),
      u.pos_id,
      u.name,
      u.code,
      u.phone,
      u.address,
      u.customer_type,
      u.assigned_sale_name,
      u.tags::jsonb,
      u.status,
      $1::uuid,
      now(),
      now()
    FROM unnest(
      $2::int4[],
      $3::text[],
      $4::text[],
      $5::text[],
      $6::text[],
      $7::text[],
      $8::text[],
      $9::text[],
      $10::text[]
    ) AS u(pos_id, name, code, phone, address, customer_type, assigned_sale_name, tags, status)
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

  const result = await prisma.$executeRawUnsafe(
    sql,
    orgId,
    posIds,
    names,
    codes,
    phones,
    addresses,
    customerTypes,
    assignedSaleNames,
    tagsJsons,
    statuses
  );
  if (result > 0) {
    emitPosDataUpdated(orgId, { type: 'customer', action: 'synced' });
  }
  return result;
}

// ── Batch Upsert Orders (PostgreSQL UNNEST Vectorized) ──────────────────────

export async function batchUpsertOrders(orgId: string, orders: any[]): Promise<number> {
  if (!orders || orders.length === 0) return 0;
  if (orders.length > 2500) {
    return batchUpsertInChunks(orders, 2500, (chunk) => batchUpsertOrdersChunk(orgId, chunk));
  }
  return batchUpsertOrdersChunk(orgId, orders);
}

async function batchUpsertOrdersChunk(orgId: string, orders: any[]): Promise<number> {
  if (!orders || orders.length === 0) return 0;

  const validOrders: any[] = [];
  const posOrderIds: number[] = [];
  const codes: string[] = [];
  const posCustomerIds: (number | null)[] = [];
  const posCustomerCodes: (string | null)[] = [];
  const customerNames: (string | null)[] = [];
  const customerPhones: (string | null)[] = [];
  const branchIds: (number | null)[] = [];
  const branchNames: (string | null)[] = [];
  const totalAmounts: number[] = [];
  const discountAmounts: number[] = [];
  const discounts: number[] = [];
  const finalAmounts: number[] = [];
  const grandTotals: number[] = [];
  const paidAmounts: number[] = [];
  const debtAmounts: number[] = [];
  const statuses: string[] = [];
  const paymentStatuses: string[] = [];
  const orderStatuses: string[] = [];
  const descriptions: (string | null)[] = [];
  const orderDates: Date[] = [];

  for (const ord of orders) {
    const posOrderId = Number(ord.id || ord.posOrderId || ord.orderId);
    if (!posOrderId) continue;

    validOrders.push(ord);
    const code = String(ord.code || ord.orderCode || `ORD-${posOrderId}`);
    const posCustomerId = ord.customerId ? Number(ord.customerId) : (ord.posCustomerId ? Number(ord.posCustomerId) : (ord.customer?.id ? Number(ord.customer.id) : null));
    const posCustomerCode = ord.customerCode || ord.customer?.code || null;
    const customerName = ord.customerName || ord.customer?.name || null;
    const customerPhone = ord.customerPhone || ord.customer?.phone || ord.customer?.contactNumber || null;
    const branchId = ord.branchId ? Number(ord.branchId) : (ord.branch?.id ? Number(ord.branch.id) : null);
    const branchName = ord.branchName || ord.branch?.name || null;
    const totalAmount = Number(ord.total || ord.totalAmount || 0);
    const discountAmount = Number(ord.discount || ord.discountAmount || 0);
    const discount = Number(ord.discountPercentage || ord.discount || 0);
    const finalAmount = Number(ord.grandTotal || ord.finalAmount || ord.totalPayment || (totalAmount - discountAmount));
    const grandTotal = Number(ord.grandTotal || ord.finalAmount || ord.totalPayment || totalAmount);
    const paidAmount = Number(ord.paidAmount || ord.totalPayment || 0);
    const debtAmount = Number(ord.debtAmount != null ? ord.debtAmount : Math.max(0, finalAmount - paidAmount));
    const statusStr = typeof ord.statusValue === 'string' ? ord.statusValue : (ord.statusName || (ord.status === 1 ? 'Pending' : ord.status === 3 ? 'Cancelled' : 'Completed'));
    const paymentStatus = String(ord.paymentStatus || 'Draft');
    const orderStatus = String(ord.orderStatus || 'Draft');
    const description = ord.description || ord.note || null;
    const orderDate = ord.createdDate || ord.purchaseDate || ord.orderDate ? new Date(ord.createdDate || ord.purchaseDate || ord.orderDate) : new Date();

    posOrderIds.push(posOrderId);
    codes.push(code);
    posCustomerIds.push(posCustomerId);
    posCustomerCodes.push(posCustomerCode);
    customerNames.push(customerName);
    customerPhones.push(customerPhone);
    branchIds.push(branchId);
    branchNames.push(branchName);
    totalAmounts.push(totalAmount);
    discountAmounts.push(discountAmount);
    discounts.push(discount);
    finalAmounts.push(finalAmount);
    grandTotals.push(grandTotal);
    paidAmounts.push(paidAmount);
    debtAmounts.push(debtAmount);
    statuses.push(statusStr);
    paymentStatuses.push(paymentStatus);
    orderStatuses.push(orderStatus);
    descriptions.push(description);
    orderDates.push(orderDate);
  }

  if (posOrderIds.length === 0) return 0;

  const sql = `
    INSERT INTO pos_orders (
      id, org_id, pos_order_id, code, pos_customer_id, pos_customer_code, customer_name, customer_phone,
      branch_id, branch_name, total_amount, discount_amount, discount, final_amount, grand_total, paid_amount, debt_amount,
      status, payment_status, order_status, description, order_date, created_at, updated_at
    )
    SELECT
      gen_random_uuid(),
      $1::uuid,
      u.pos_order_id,
      u.code,
      u.pos_customer_id,
      u.pos_customer_code,
      u.customer_name,
      u.customer_phone,
      u.branch_id,
      u.branch_name,
      u.total_amount,
      u.discount_amount,
      u.discount,
      u.final_amount,
      u.grand_total,
      u.paid_amount,
      u.debt_amount,
      u.status,
      u.payment_status,
      u.order_status,
      u.description,
      u.order_date,
      now(),
      now()
    FROM unnest(
      $2::int4[],
      $3::text[],
      $4::int4[],
      $5::text[],
      $6::text[],
      $7::text[],
      $8::int4[],
      $9::text[],
      $10::float8[],
      $11::float8[],
      $12::float8[],
      $13::float8[],
      $14::float8[],
      $15::float8[],
      $16::float8[],
      $17::text[],
      $18::text[],
      $19::text[],
      $20::text[],
      $21::timestamptz[]
    ) AS u(
      pos_order_id, code, pos_customer_id, pos_customer_code, customer_name, customer_phone,
      branch_id, branch_name, total_amount, discount_amount, discount, final_amount, grand_total, paid_amount, debt_amount,
      status, payment_status, order_status, description, order_date
    )
    ON CONFLICT (pos_order_id, org_id) DO UPDATE SET
      code               = EXCLUDED.code,
      pos_customer_id   = EXCLUDED.pos_customer_id,
      pos_customer_code = EXCLUDED.pos_customer_code,
      customer_name      = EXCLUDED.customer_name,
      customer_phone     = EXCLUDED.customer_phone,
      branch_id          = EXCLUDED.branch_id,
      branch_name        = EXCLUDED.branch_name,
      total_amount       = EXCLUDED.total_amount,
      discount_amount    = EXCLUDED.discount_amount,
      discount           = EXCLUDED.discount,
      final_amount       = EXCLUDED.final_amount,
      grand_total        = EXCLUDED.grand_total,
      paid_amount        = EXCLUDED.paid_amount,
      debt_amount        = EXCLUDED.debt_amount,
      status             = EXCLUDED.status,
      payment_status     = EXCLUDED.payment_status,
      order_status       = EXCLUDED.order_status,
      description        = EXCLUDED.description,
      order_date         = EXCLUDED.order_date,
      updated_at         = now();
  `;

  await prisma.$executeRawUnsafe(
    sql,
    orgId,
    posOrderIds,
    codes,
    posCustomerIds,
    posCustomerCodes,
    customerNames,
    customerPhones,
    branchIds,
    branchNames,
    totalAmounts,
    discountAmounts,
    discounts,
    finalAmounts,
    grandTotals,
    paidAmounts,
    debtAmounts,
    statuses,
    paymentStatuses,
    orderStatuses,
    descriptions,
    orderDates
  );

  // Link items if present
  const dbOrders = await prisma.posOrder.findMany({
    where: { orgId, posOrderId: { in: posOrderIds } },
    select: { id: true, posOrderId: true }
  });
  const posOrderUuidMap = new Map<number, string>();
  for (const o of dbOrders) {
    posOrderUuidMap.set(o.posOrderId, o.id);
  }

  const orderUuids: string[] = [];
  const itemPosProductIds: (number | null)[] = [];
  const itemProductCodes: (string | null)[] = [];
  const itemProductNames: string[] = [];
  const itemQuantities: number[] = [];
  const itemUnitPrices: number[] = [];
  const itemDiscounts: number[] = [];
  const itemTotalPrices: number[] = [];
  const itemNotes: (string | null)[] = [];

  for (const ord of validOrders) {
    const posOrderId = Number(ord.id || ord.posOrderId || ord.orderId);
    const orderUuid = posOrderUuidMap.get(posOrderId);
    if (!orderUuid) continue;

    const items = ord.items || ord.orderDetails || ord.order_details || [];
    if (Array.isArray(items) && items.length > 0) {
      for (const item of items) {
        const posProductId = item.productId ? Number(item.productId) : (item.product?.id ? Number(item.product.id) : null);
        const productCode = item.productCode || item.product?.code || null;
        const productName = String(item.productName || item.product?.name || 'Sản phẩm');
        const quantity = Number(item.quantity || 1);
        const unitPrice = Number(item.price || item.unitPrice || 0);
        const discount = Number(item.discount || 0);
        const totalPrice = Number(item.totalPrice || item.subTotal || (quantity * unitPrice - discount));
        const note = item.note || null;

        orderUuids.push(orderUuid);
        itemPosProductIds.push(posProductId);
        itemProductCodes.push(productCode);
        itemProductNames.push(productName);
        itemQuantities.push(quantity);
        itemUnitPrices.push(unitPrice);
        itemDiscounts.push(discount);
        itemTotalPrices.push(totalPrice);
        itemNotes.push(note);
      }
    }
  }

  if (orderUuids.length > 0) {
    const parentUuids = Array.from(new Set(orderUuids));
    await prisma.posOrderItem.deleteMany({
      where: { posOrderId: { in: parentUuids } }
    });

    const itemsSql = `
      INSERT INTO pos_order_items (
        id, pos_order_id, pos_product_id, product_code, product_name, quantity, unit_price, discount, total_price, note, created_at, updated_at
      )
      SELECT
        gen_random_uuid(),
        u.pos_order_uuid,
        u.pos_product_id,
        u.product_code,
        u.product_name,
        u.quantity,
        u.unit_price,
        u.discount,
        u.total_price,
        u.note,
        now(),
        now()
      FROM unnest(
        $1::uuid[],
        $2::int4[],
        $3::text[],
        $4::text[],
        $5::float8[],
        $6::float8[],
        $7::float8[],
        $8::float8[],
        $9::text[]
      ) AS u(
        pos_order_uuid, pos_product_id, product_code, product_name, quantity, unit_price, discount, total_price, note
      );
    `;
    await prisma.$executeRawUnsafe(
      itemsSql,
      orderUuids,
      itemPosProductIds,
      itemProductCodes,
      itemProductNames,
      itemQuantities,
      itemUnitPrices,
      itemDiscounts,
      itemTotalPrices,
      itemNotes
    );
  }

  emitPosDataUpdated(orgId, { type: 'order', action: 'synced' });

  return validOrders.length;
}

// ── Batch Upsert Invoices (PostgreSQL UNNEST Vectorized) ────────────────────

export async function batchUpsertInvoices(orgId: string, invoices: any[]): Promise<number> {
  if (!invoices || invoices.length === 0) return 0;
  if (invoices.length > 2500) {
    return batchUpsertInChunks(invoices, 2500, (chunk) => batchUpsertInvoicesChunk(orgId, chunk));
  }
  return batchUpsertInvoicesChunk(orgId, invoices);
}

async function batchUpsertInvoicesChunk(orgId: string, invoices: any[]): Promise<number> {
  if (!invoices || invoices.length === 0) return 0;

  const posInvoiceIds: number[] = [];
  const invoiceCodes: string[] = [];
  const posOrderIds: (number | null)[] = [];
  const posCustomerIds: (number | null)[] = [];
  const posCustomerCodes: (string | null)[] = [];
  const totalAmounts: number[] = [];
  const paidAmounts: number[] = [];
  const remainingDebts: number[] = [];
  const statuses: string[] = [];
  const invoiceDates: Date[] = [];
  const dueDates: (Date | null)[] = [];

  for (const inv of invoices) {
    const posInvoiceId = Number(inv.id || inv.posInvoiceId || inv.invoiceId);
    if (!posInvoiceId) continue;

    const invoiceCode = String(inv.code || inv.invoiceCode || `INV-${posInvoiceId}`);
    const posOrderId = inv.orderId ? Number(inv.orderId) : (inv.posOrderId ? Number(inv.posOrderId) : null);
    const posCustomerId = inv.customerId ? Number(inv.customerId) : (inv.posCustomerId ? Number(inv.posCustomerId) : (inv.customer?.id ? Number(inv.customer.id) : null));
    const posCustomerCode = inv.customerCode || inv.customer?.code || null;
    const totalAmount = Number(inv.total || inv.totalAmount || 0);
    const paidAmount = Number(inv.totalPayment || inv.paidAmount || 0);
    const remainingDebt = Number(inv.remainingDebt != null ? inv.remainingDebt : (inv.debt != null ? inv.debt : (totalAmount - paidAmount)));
    const statusStr = typeof inv.statusValue === 'string' ? inv.statusValue : (inv.status === 1 ? 'Paid' : (inv.status === 2 ? 'Unpaid' : 'Partial'));
    const invoiceDate = inv.createdDate || inv.invoiceDate ? new Date(inv.createdDate || inv.invoiceDate) : new Date();
    const dueDate = inv.dueDate ? new Date(inv.dueDate) : null;

    posInvoiceIds.push(posInvoiceId);
    invoiceCodes.push(invoiceCode);
    posOrderIds.push(posOrderId);
    posCustomerIds.push(posCustomerId);
    posCustomerCodes.push(posCustomerCode);
    totalAmounts.push(totalAmount);
    paidAmounts.push(paidAmount);
    remainingDebts.push(remainingDebt);
    statuses.push(statusStr);
    invoiceDates.push(invoiceDate);
    dueDates.push(dueDate);
  }

  if (posInvoiceIds.length === 0) return 0;

  const sql = `
    INSERT INTO pos_invoices (
      id, org_id, pos_invoice_id, invoice_code, pos_order_id, pos_customer_id, pos_customer_code,
      total_amount, paid_amount, remaining_debt, status, invoice_date, due_date, created_at, updated_at
    )
    SELECT
      gen_random_uuid(),
      $1::uuid,
      u.pos_invoice_id,
      u.invoice_code,
      u.pos_order_id,
      u.pos_customer_id,
      u.pos_customer_code,
      u.total_amount,
      u.paid_amount,
      u.remaining_debt,
      u.status,
      u.invoice_date,
      u.due_date,
      now(),
      now()
    FROM unnest(
      $2::int4[],
      $3::text[],
      $4::int4[],
      $5::int4[],
      $6::text[],
      $7::float8[],
      $8::float8[],
      $9::float8[],
      $10::text[],
      $11::timestamptz[],
      $12::timestamptz[]
    ) AS u(
      pos_invoice_id, invoice_code, pos_order_id, pos_customer_id, pos_customer_code,
      total_amount, paid_amount, remaining_debt, status, invoice_date, due_date
    )
    ON CONFLICT (pos_invoice_id, org_id) DO UPDATE SET
      invoice_code      = EXCLUDED.invoice_code,
      pos_order_id      = EXCLUDED.pos_order_id,
      pos_customer_id   = EXCLUDED.pos_customer_id,
      pos_customer_code = EXCLUDED.pos_customer_code,
      total_amount      = EXCLUDED.total_amount,
      paid_amount       = EXCLUDED.paid_amount,
      remaining_debt    = EXCLUDED.remaining_debt,
      status            = EXCLUDED.status,
      invoice_date      = EXCLUDED.invoice_date,
      due_date          = EXCLUDED.due_date,
      updated_at        = now();
  `;

  await prisma.$executeRawUnsafe(
    sql,
    orgId,
    posInvoiceIds,
    invoiceCodes,
    posOrderIds,
    posCustomerIds,
    posCustomerCodes,
    totalAmounts,
    paidAmounts,
    remainingDebts,
    statuses,
    invoiceDates,
    dueDates
  );

  emitPosDataUpdated(orgId, { type: 'order', action: 'synced' });

  return posInvoiceIds.length;
}

// ── Batch Upsert Customer Debts (PostgreSQL UNNEST Vectorized) ──────────────

export async function batchUpsertCustomerDebts(orgId: string, debts: any[]): Promise<number> {
  if (!debts || debts.length === 0) return 0;
  if (debts.length > 2500) {
    return batchUpsertInChunks(debts, 2500, (chunk) => batchUpsertCustomerDebtsChunk(orgId, chunk));
  }
  return batchUpsertCustomerDebtsChunk(orgId, debts);
}

async function batchUpsertCustomerDebtsChunk(orgId: string, debts: any[]): Promise<number> {
  if (!debts || debts.length === 0) return 0;

  const posCustomerIds: number[] = [];
  const posCustomerCodes: (string | null)[] = [];
  const customerNames: (string | null)[] = [];
  const customerPhones: (string | null)[] = [];
  const totalDebts: number[] = [];
  const currentDebts: number[] = [];
  const overdueDebts: number[] = [];
  const dueDates: (Date | null)[] = [];
  const statuses: string[] = [];
  const timelineJsons: (string | null)[] = [];

  for (const d of debts) {
    const posCustomerId = Number(d.id || d.posCustomerId || d.customerId);
    if (!posCustomerId) continue;

    const posCustomerCode = d.code || d.customerCode || d.posCustomerCode || null;
    const customerName = d.name || d.customerName || null;
    const customerPhone = d.phone || d.customerPhone || null;
    const totalDebt = Number(d.totalDebt || 0);
    const currentDebt = Number(d.currentDebt != null ? d.currentDebt : totalDebt);
    const overdueDebt = Number(d.overdueDebt || 0);
    const dueDate = d.dueDate ? new Date(d.dueDate) : null;
    const status = String(d.status || (overdueDebt > 0 ? 'Danger' : (currentDebt > 0 ? 'Warning' : 'Normal')));
    const timelineJson = d.timelineJson ? (typeof d.timelineJson === 'string' ? d.timelineJson : JSON.stringify(d.timelineJson)) : null;

    posCustomerIds.push(posCustomerId);
    posCustomerCodes.push(posCustomerCode);
    customerNames.push(customerName);
    customerPhones.push(customerPhone);
    totalDebts.push(totalDebt);
    currentDebts.push(currentDebt);
    overdueDebts.push(overdueDebt);
    dueDates.push(dueDate);
    statuses.push(status);
    timelineJsons.push(timelineJson);
  }

  if (posCustomerIds.length === 0) return 0;

  const sql = `
    INSERT INTO pos_customer_debts (
      id, org_id, pos_customer_id, pos_customer_code, customer_name, customer_phone,
      total_debt, current_debt, overdue_debt, due_date, status, timeline_json, last_synced_at
    )
    SELECT
      gen_random_uuid(),
      $1::uuid,
      u.pos_customer_id,
      u.pos_customer_code,
      u.customer_name,
      u.customer_phone,
      u.total_debt,
      u.current_debt,
      u.overdue_debt,
      u.due_date,
      u.status,
      u.timeline_json::jsonb,
      now()
    FROM unnest(
      $2::int4[],
      $3::text[],
      $4::text[],
      $5::text[],
      $6::float8[],
      $7::float8[],
      $8::float8[],
      $9::timestamptz[],
      $10::text[],
      $11::text[]
    ) AS u(
      pos_customer_id, pos_customer_code, customer_name, customer_phone,
      total_debt, current_debt, overdue_debt, due_date, status, timeline_json
    )
    ON CONFLICT (pos_customer_id, org_id) DO UPDATE SET
      pos_customer_code = EXCLUDED.pos_customer_code,
      customer_name     = EXCLUDED.customer_name,
      customer_phone    = EXCLUDED.customer_phone,
      total_debt        = EXCLUDED.total_debt,
      current_debt      = EXCLUDED.current_debt,
      overdue_debt      = EXCLUDED.overdue_debt,
      due_date          = EXCLUDED.due_date,
      status            = EXCLUDED.status,
      timeline_json     = EXCLUDED.timeline_json,
      last_synced_at    = now();
  `;

  await prisma.$executeRawUnsafe(
    sql,
    orgId,
    posCustomerIds,
    posCustomerCodes,
    customerNames,
    customerPhones,
    totalDebts,
    currentDebts,
    overdueDebts,
    dueDates,
    statuses,
    timelineJsons
  );

  emitPosDataUpdated(orgId, { type: 'debt', action: 'synced' });

  return posCustomerIds.length;
}

// ── Batch Upsert Branch Inventory (PostgreSQL UNNEST Vectorized) ────────────

export async function batchUpsertBranchInventory(orgId: string, inventoryLogs: any[]): Promise<number> {
  if (!inventoryLogs || inventoryLogs.length === 0) return 0;
  if (inventoryLogs.length > 2500) {
    return batchUpsertInChunks(inventoryLogs, 2500, (chunk) => batchUpsertBranchInventoryChunk(orgId, chunk));
  }
  return batchUpsertBranchInventoryChunk(orgId, inventoryLogs);
}

async function batchUpsertBranchInventoryChunk(orgId: string, inventoryLogs: any[]): Promise<number> {
  if (!inventoryLogs || inventoryLogs.length === 0) return 0;

  const posProductIds: number[] = [];
  const productCodes: (string | null)[] = [];
  const productNames: (string | null)[] = [];
  const branchIds: number[] = [];
  const branchNames: string[] = [];
  const onHands: number[] = [];
  const reserveds: number[] = [];
  const availables: number[] = [];
  const minStockLevels: number[] = [];
  const statuses: string[] = [];

  for (const item of inventoryLogs) {
    const posProductId = Number(item.productId || item.posProductId);
    const branchId = Number(item.branchId || 1);
    if (!posProductId || !branchId) continue;

    const productCode = item.productCode || item.code || null;
    const productName = item.productName || item.name || null;
    const branchName = String(item.branchName || `Chi nhánh ${branchId}`);
    const onHand = Number(item.onHand || item.on_hand || item.inventory || 0);
    const reserved = Number(item.reserved || 0);
    const available = Number(item.available != null ? item.available : (onHand - reserved));
    const minStockLevel = Number(item.minStockLevel || 0);
    const status = String(item.status || (available <= 0 ? 'OutOfStock' : (available <= minStockLevel ? 'LowStock' : 'InStock')));

    posProductIds.push(posProductId);
    productCodes.push(productCode);
    productNames.push(productName);
    branchIds.push(branchId);
    branchNames.push(branchName);
    onHands.push(onHand);
    reserveds.push(reserved);
    availables.push(available);
    minStockLevels.push(minStockLevel);
    statuses.push(status);
  }

  if (posProductIds.length === 0) return 0;

  const sql = `
    INSERT INTO pos_branch_inventory (
      id, org_id, pos_product_id, product_code, product_name, branch_id, branch_name,
      on_hand, reserved, available, min_stock_level, status, last_synced_at
    )
    SELECT
      gen_random_uuid(),
      $1::uuid,
      u.pos_product_id,
      u.product_code,
      u.product_name,
      u.branch_id,
      u.branch_name,
      u.on_hand,
      u.reserved,
      u.available,
      u.min_stock_level,
      u.status,
      now()
    FROM unnest(
      $2::int4[],
      $3::text[],
      $4::text[],
      $5::int4[],
      $6::text[],
      $7::float8[],
      $8::float8[],
      $9::float8[],
      $10::float8[],
      $11::text[]
    ) AS u(
      pos_product_id, product_code, product_name, branch_id, branch_name,
      on_hand, reserved, available, min_stock_level, status
    )
    ON CONFLICT (pos_product_id, branch_id, org_id) DO UPDATE SET
      product_code    = EXCLUDED.product_code,
      product_name    = EXCLUDED.product_name,
      branch_name     = EXCLUDED.branch_name,
      on_hand         = EXCLUDED.on_hand,
      reserved        = EXCLUDED.reserved,
      available       = EXCLUDED.available,
      min_stock_level = EXCLUDED.min_stock_level,
      status          = EXCLUDED.status,
      last_synced_at  = now();
  `;

  const result = await prisma.$executeRawUnsafe(
    sql,
    orgId,
    posProductIds,
    productCodes,
    productNames,
    branchIds,
    branchNames,
    onHands,
    reserveds,
    availables,
    minStockLevels,
    statuses
  );

  emitPosDataUpdated(orgId, { type: 'inventory', action: 'synced' });

  return posProductIds.length;
}

// ── Public Sync Functions ────────────────────────────────────────────────────

export async function syncPosProductsFromMcp(orgId: string): Promise<void> {
  const client = getPosMcpClient();
  logger.info(`[pos-sync] Syncing products for org ${orgId}`);
  emitProgress(orgId, { table: 'products', phase: 'fetching', current: 0, total: -1 });

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
        await sleep(800);
      }
    }

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
          await sleep(800);
        }
      }
    }

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

export async function syncPosOrdersFromMcp(orgId: string): Promise<void> {
  const client = getPosMcpClient();
  logger.info(`[pos-sync] Syncing orders for org ${orgId} (1 năm gần nhất)`);
  emitProgress(orgId, { table: 'orders', phase: 'fetching', current: 0, total: -1 });

  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  let page = 1;
  const limit = 100;
  let totalSynced = 0;
  let hasMore = true;

  while (hasMore) {
    const res = await fetchWithRetry(() => client.orders.list({
      page,
      limit,
      fromDate: oneYearAgo.toISOString(),
    }));

    const orders = (res as any).data || (res as any).orders || [];
    if (orders.length === 0) {
      hasMore = false;
      break;
    }

    emitProgress(orgId, { table: 'orders', phase: 'saving', current: totalSynced, total: -1, message: `Đang lưu đơn hàng trang ${page}...` });
    await batchUpsertOrders(orgId, orders);

    totalSynced += orders.length;
    emitProgress(orgId, { table: 'orders', phase: 'fetching', current: totalSynced, total: -1, message: `Đã đồng bộ ${totalSynced} đơn hàng` });

    if (orders.length < limit) {
      hasMore = false;
    } else {
      page++;
      await sleep(800);
    }
  }

  emitProgress(orgId, { table: 'orders', phase: 'done', current: totalSynced, total: totalSynced, message: `Hoàn tất ${totalSynced} đơn hàng` });
  logger.info(`[pos-sync] Sync orders completed. Total: ${totalSynced}`);
}

export async function syncPosInvoicesFromMcp(orgId: string): Promise<void> {
  const client = getPosMcpClient();
  logger.info(`[pos-sync] Syncing invoices for org ${orgId}`);
  emitProgress(orgId, { table: 'invoices', phase: 'fetching', current: 0, total: -1 });

  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  let page = 1;
  const limit = 100;
  let totalSynced = 0;
  let hasMore = true;

  while (hasMore) {
    const res = await fetchWithRetry(() => client.invoices.list({
      page,
      limit,
      fromDate: oneYearAgo.toISOString(),
    }));

    const invoices = (res as any).data || (res as any).invoices || [];
    if (invoices.length === 0) {
      hasMore = false;
      break;
    }

    emitProgress(orgId, { table: 'invoices', phase: 'saving', current: totalSynced, total: -1, message: `Đang lưu hóa đơn trang ${page}...` });
    await batchUpsertInvoices(orgId, invoices);

    totalSynced += invoices.length;
    emitProgress(orgId, { table: 'invoices', phase: 'fetching', current: totalSynced, total: -1, message: `Đã đồng bộ ${totalSynced} hóa đơn` });

    if (invoices.length < limit) {
      hasMore = false;
    } else {
      page++;
      await sleep(800);
    }
  }

  emitProgress(orgId, { table: 'invoices', phase: 'done', current: totalSynced, total: totalSynced, message: `Hoàn tất ${totalSynced} hóa đơn` });
  logger.info(`[pos-sync] Sync invoices completed. Total: ${totalSynced}`);
}

export async function syncPosBranchInventoryFromMcp(orgId: string): Promise<void> {
  const client = getPosMcpClient();
  logger.info(`[pos-sync] Syncing branch inventory for org ${orgId}`);
  emitProgress(orgId, { table: 'branch_inventory', phase: 'fetching', current: 0, total: -1 });

  let totalSynced = 0;

  try {
    const branchesRes = await fetchWithRetry(() => client.branches.list());
    const branches = (branchesRes as any).data || (branchesRes as any).branches || [];

    if (branches.length === 0) {
      branches.push({ id: 1, name: 'Chi nhánh trung tâm' });
    }

    for (const branch of branches) {
      const branchId = Number(branch.id);
      const branchName = branch.name || `Chi nhánh ${branchId}`;

      const res = await fetchWithRetry(() => client.products.branchInventory(branchId));
      const inventoryItems = (res as any).data || (res as any).inventory || (res as any).items || [];

      if (Array.isArray(inventoryItems) && inventoryItems.length > 0) {
        const logsWithBranch = inventoryItems.map(inv => ({
          ...inv,
          branchId,
          branchName
        }));

        await batchUpsertBranchInventory(orgId, logsWithBranch);
        totalSynced += inventoryItems.length;
      }
      await sleep(500);
    }

    emitProgress(orgId, { table: 'branch_inventory', phase: 'done', current: totalSynced, total: totalSynced, message: `Hoàn tất đồng bộ tồn kho (${totalSynced} bản ghi)` });
    logger.info(`[pos-sync] Sync branch inventory completed. Total records: ${totalSynced}`);
  } catch (err: any) {
    logger.warn(`[pos-sync] Direct branchInventory API failed, attempting product list fallback: ${err.message || err}`);
    let page = 1;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
      const res = await fetchWithRetry(() => client.products.list({ page, limit }));
      const products = (res as any).data || [];
      if (products.length === 0) { hasMore = false; break; }

      const inventoryItems: any[] = [];
      for (const p of products) {
        if (p.inventories && Array.isArray(p.inventories)) {
          for (const inv of p.inventories) {
            inventoryItems.push({
              productId: p.id,
              productCode: p.code,
              branchId: inv.branchId || 1,
              branchName: inv.branchName || 'Chi nhánh mặc định',
              onHand: inv.onHand || inv.inventory || 0,
              available: inv.available != null ? inv.available : (inv.onHand || 0),
            });
          }
        }
      }

      if (inventoryItems.length > 0) {
        await batchUpsertBranchInventory(orgId, inventoryItems);
        totalSynced += inventoryItems.length;
      }

      if (products.length < limit) {
        hasMore = false;
      } else {
        page++;
        await sleep(800);
      }
    }
    emitProgress(orgId, { table: 'branch_inventory', phase: 'done', current: totalSynced, total: totalSynced, message: `Hoàn tất đồng bộ tồn kho (${totalSynced} bản ghi)` });
  }
}
