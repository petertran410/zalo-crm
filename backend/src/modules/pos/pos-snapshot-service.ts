import { Prisma } from '@prisma/client';
import { tenantTransaction } from '../../shared/database/prisma-client.js';
import { extractCustomer, parseCustomerGroups } from '../integrations/hisweetie-customer-mapper.js';

type Row = Record<string, any>;
export function sourceVersion(row: Row): Date {
  if (typeof row.updatedAt !== 'string') throw new Error('POS record missing documented updatedAt; reconciliation required.');
  const date = new Date(row.updatedAt);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid POS updatedAt.');
  return date;
}
export function shouldApplySnapshot(previous: Date | null, next: Date): boolean {
  return previous === null || next.getTime() > previous.getTime();
}
export function documentAmount(row: Row): number {
  const value = row.grandTotal ?? row.finalAmount ?? row.total ?? row.totalAmount;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('POS document has no verified numeric total; reconciliation required.');
  }
  return value;
}
const number = (v: unknown, fallback = 0) => v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : fallback;
const text = (v: unknown): string | null => typeof v === 'string' ? v : null;
const date = (v: unknown, fallback: Date): Date => {
  const parsed = typeof v === 'string' ? new Date(v) : fallback;
  return Number.isFinite(parsed.getTime()) ? parsed : fallback;
};

/** Polls and webhooks share a transactional, monotonic projection boundary. */
export async function applyPosSnapshots(orgId: string, resource: string, records: Row[]) {
  let count = 0;
  for (const row of records) {
    const posId = Number(row.id);
    if (!Number.isSafeInteger(posId) || posId <= 0) throw new Error(`Invalid POS ${resource} id.`);
    const version = sourceVersion(row);
    const applied = await tenantTransaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${orgId}:${resource}:${posId}`}))`;
      const key = { orgId_resource_posId: { orgId, resource, posId } };
      const old = await tx.posSnapshot.findUnique({ where: key });
      const oldPayload = old?.payload as Row | undefined;
      const detailsOf = (value?: Row) => value?.details ?? value?.items ?? value?.orderDetails ?? value?.invoiceDetails;
      const enrichDetails = ['orders', 'invoices'].includes(resource) && old?.sourceUpdatedAt.getTime() === version.getTime()
        && Array.isArray(detailsOf(row)) && !Array.isArray(detailsOf(oldPayload));
      if (!shouldApplySnapshot(old?.sourceUpdatedAt ?? null, version) && !enrichDetails) {
        if (old?.sourceUpdatedAt.getTime() === version.getTime()) {
          await tx.posSnapshot.update({ where: key, data: { receivedAt: new Date() } });
        }
        return false;
      }
      const posCustomerId = number(row.customerId ?? row.customer?.id) || null;
      if (resource === 'customers') {
        if (!text(row.name)) throw new Error('POS customer missing name.');
        const mapped = extractCustomer(row);
        const profile = {
          name: String(row.name), code: mapped.posCustomerCode, phone: mapped.phone,
          address: mapped.address, status: row.isActive === false ? 'Inactive' : 'Active',
          organization: mapped.organization, taxCode: mapped.taxCode, isOrganization: mapped.isOrganization,
          customerType: mapped.segment, assignedSaleName: mapped.posSaleCode, tags: parseCustomerGroups(row.groups).tags,
        };
        await tx.posCustomer.upsert({
          where: { posId_orgId: { orgId, posId } }, update: profile, create: { orgId, posId, ...profile },
        });
        // Only a balance supplied by POS is authoritative. Never derive it from orders/invoices.
        if (typeof row.totalDebt === 'number' && Number.isFinite(row.totalDebt)) {
          const debt = {
            totalDebt: row.totalDebt, currentDebt: row.totalDebt, customerName: profile.name, customerPhone: profile.phone,
            posCustomerCode: profile.code, lastSyncedAt: version,
          };
          await tx.posCustomerDebt.upsert({
            where: { posCustomerId_orgId: { orgId, posCustomerId: posId } },
            update: debt, create: { orgId, posCustomerId: posId, ...debt },
          });
        }
      } else if (resource === 'orders') {
        const final = documentAmount(row);
        const total = number(row.total ?? row.totalAmount, final);
        const status = text(row.statusValue) ?? (row.status === 1 ? 'Phiếu tạm' : 'Unknown');
        const data = {
          code: String(row.code ?? posId), posCustomerId, customerName: text(row.customerName ?? row.customer?.name),
          customerPhone: text(row.customerPhone ?? row.customer?.contactNumber), branchId: number(row.branchId) || null,
          totalAmount: total, finalAmount: final, grandTotal: final, paidAmount: number(row.paidAmount ?? row.totalPayment),
          debtAmount: 0, status, orderStatus: status, paymentStatus: String(row.paymentStatus ?? 'Unknown'),
          orderDate: date(row.orderDate ?? row.purchaseDate ?? row.createdAt, version),
        };
        const order = await tx.posOrder.upsert({
          where: { posOrderId_orgId: { orgId, posOrderId: posId } }, update: data,
          create: { orgId, posOrderId: posId, ...data },
        });
        const details = row.details ?? row.items ?? row.orderDetails;
        if (Array.isArray(details)) {
          await tx.posOrderItem.deleteMany({ where: { posOrderId: order.id } });
          if (details.length) await tx.posOrderItem.createMany({
            data: details.map(item => ({
              posOrderId: order.id, posProductId: number(item.productId) || null,
              productCode: text(item.productCode ?? item.product?.code),
              productName: text(item.productName ?? item.product?.name) ?? 'Chưa xác định',
              quantity: number(item.quantity), unitPrice: number(item.unitPrice ?? item.price),
              totalPrice: number(item.totalPrice, number(item.quantity) * number(item.unitPrice ?? item.price)),
            })),
          });
        }
      } else if (resource === 'invoices') {
        const data = {
          invoiceCode: String(row.code ?? posId), posCustomerId, posOrderId: number(row.orderId) || null,
          totalAmount: documentAmount(row), paidAmount: number(row.paidAmount ?? row.totalPayment),
          // Legacy display only, never used as a customer balance.
          remainingDebt: number(row.remainingDebt ?? row.debt),
          status: text(row.statusValue) ?? text(row.status) ?? 'Unknown',
          invoiceDate: date(row.invoiceDate ?? row.purchaseDate ?? row.createdAt, version),
          dueDate: row.dueDate ? date(row.dueDate, version) : null,
        };
        await tx.posInvoice.upsert({
          where: { posInvoiceId_orgId: { orgId, posInvoiceId: posId } },
          update: data, create: { orgId, posInvoiceId: posId, ...data },
        });
      }
      await tx.posSnapshot.upsert({
        where: key, create: { orgId, resource, posId, sourceUpdatedAt: version, payload: row as Prisma.InputJsonValue },
        update: { sourceUpdatedAt: version, receivedAt: new Date(), payload: row as Prisma.InputJsonValue },
      });
      return true;
    });
    if (applied) count++;
  }
  return count;
}
