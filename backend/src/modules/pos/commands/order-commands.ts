import type { Command, CommandHandler, CommandValidator, ValidationResult } from '../../../shared/commands/command.interface.js';
import { commandDispatcher } from '../../../shared/commands/command-dispatcher.js';
import { getHisweetiePublicApiClient } from '../../integrations/hisweetie-public-api-client.js';
import { prisma } from '../../../shared/database/prisma-client.js';
import { requireCustomer, ensureLinkedPosCustomer, linkedPosIds, workspaceError } from '../../contacts/customer-workspace-service.js';
import { runPosWrite } from '../pos-write-operation.js';
import { assertDraftContractVerified, verifiedDraftResponse, assertPosOrganization } from '../pos-write-policy.js';
import { applyPosSnapshots } from '../pos-snapshot-service.js';

export interface CreateOrderItemInput {
  productId: number; productCode: string; productName: string; quantity: number; unitPrice: number;
  discount?: number; note?: string;
}
export interface CreateOrderPayload {
  contactId: string; operationKey: string; posCustomerId: number; branchId: number;
  items: CreateOrderItemInput[]; delivery: { address: string; receiver?: string; phone?: string };
  paidAmount?: number; orderStatus?: number; status?: number; discount?: number;
}
export class CreateOrderValidator implements CommandValidator<Command<CreateOrderPayload>> {
  validate({ payload: p }: Command<CreateOrderPayload>): ValidationResult {
    const errors: Record<string, string> = {};
    if (!p.contactId || !p.operationKey) errors.operationKey = 'Thiếu khách hoặc mã thao tác.';
    if (!Number.isSafeInteger(p.posCustomerId) || p.posCustomerId <= 0) errors.posCustomerId = 'Chọn quán POS.';
    if (!Number.isSafeInteger(p.branchId) || p.branchId <= 0) errors.branchId = 'Chọn chi nhánh.';
    if (!p.delivery?.address?.trim()) errors.delivery = 'Xác nhận địa chỉ giao hàng.';
    if ((p.paidAmount ?? 0) !== 0 || (p.orderStatus ?? 1) !== 1 || (p.status ?? 1) !== 1) errors.status = 'CRM chỉ tạo Phiếu tạm, không thu tiền.';
    if ((p.discount ?? 0) !== 0) errors.discount = 'Chiết khấu do POS xử lý.';
    if (!Array.isArray(p.items) || !p.items.length || p.items.some(i =>
      !Number.isSafeInteger(i.productId) || i.productId <= 0 || !Number.isFinite(i.quantity) || i.quantity <= 0
      || !Number.isFinite(i.unitPrice) || i.unitPrice < 0 || (i.discount ?? 0) !== 0)) errors.items = 'Dòng hàng không hợp lệ.';
    return { isValid: !Object.keys(errors).length, errors };
  }
}
export class CreateOrderHandler implements CommandHandler<Command<CreateOrderPayload>> {
  async handle({ payload }: Command<CreateOrderPayload>, context: { orgId: string; userId: string }) {
    assertDraftContractVerified();
    assertPosOrganization(context.orgId);
    const user = await prisma.user.findFirst({ where: { id: context.userId, orgId: context.orgId, isActive: true } });
    if (!user) throw workspaceError('Không có quyền.', 403);
    await requireCustomer({ id: user.id, orgId: user.orgId, role: user.role }, payload.contactId, true);
    await ensureLinkedPosCustomer(context.orgId, payload.contactId, payload.posCustomerId);
    // The documented write API cannot select a delivery address. Fail closed when
    // the chosen address differs from POS default instead of silently shipping elsewhere.
    const rawAddresses = await getHisweetiePublicApiClient().getCustomerAddresses(payload.posCustomerId);
    const addresses = Array.isArray(rawAddresses) ? rawAddresses : (rawAddresses as { data?: unknown[] })?.data;
    const defaultAddress = addresses?.find((row: any) => row.isDefault === true) as { address?: string } | undefined;
    if (!defaultAddress?.address || defaultAddress.address.trim() !== payload.delivery.address.trim()) {
      throw workspaceError('Địa chỉ phải khớp địa chỉ mặc định POS. Hãy cập nhật tại POS trước khi tạo phiếu.');
    }
    return runPosWrite(context, payload.operationKey, 'create-order', payload, async key => {
      const res = await getHisweetiePublicApiClient().createOrder({
        branchId: payload.branchId, customerId: payload.posCustomerId,
        items: payload.items.map(i => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice })),
      }, key);
      const row = verifiedDraftResponse(res);
      const amount = row.grandTotal ?? row.finalAmount ?? row.totalAmount ?? row.total;
      const total = typeof amount === 'number' && Number.isFinite(amount) ? amount : null;
      const posOrderId = Number(row.id);
      // Do not publish locally calculated totals as POS facts. A response without
      // a source version remains in the operation log until polling/webhook confirms it.
      if (typeof row.updatedAt === 'string' && total !== null) await applyPosSnapshots(context.orgId, 'orders', [row]);
      await prisma.posOrder.updateMany({
        where: { orgId: context.orgId, posOrderId, createdByUserId: null },
        data: { createdByUserId: context.userId, contactId: payload.contactId },
      });
      return { posOrderId, orderCode: row.code, grandTotal: total, status: 1, statusValue: 'Phiếu tạm', paidAmount: 0, pendingSync: typeof row.updatedAt !== 'string' || total === null };
    });
  }
}
export class GetContactOrdersHandler implements CommandHandler<Command<{ contactId: string }>> {
  async handle({ payload }: Command<{ contactId: string }>, context: { orgId: string; userId: string }) {
    const ids = await linkedPosIds(context.orgId, payload.contactId);
    const orders = await prisma.posOrder.findMany({
      where: { orgId: context.orgId, posCustomerId: { in: ids } },
      include: { items: true }, orderBy: { orderDate: 'desc' }, take: 50,
    });
    return { success: true, data: { orders, total: orders.length } };
  }
}
commandDispatcher.register('CreateOrder', new CreateOrderHandler(), new CreateOrderValidator());
commandDispatcher.register('GetContactOrders', new GetContactOrdersHandler());
