import type { Command, CommandHandler, CommandValidator, ValidationResult } from '../../../shared/commands/command.interface.js';
import { commandDispatcher } from '../../../shared/commands/command-dispatcher.js';
import { getHisweetiePublicApiClient } from '../../integrations/hisweetie-public-api-client.js';
import { prisma } from '../../../shared/database/prisma-client.js';
import { addPosLinks, requireCustomer, workspaceError } from '../../contacts/customer-workspace-service.js';
import { runPosWrite } from '../pos-write-operation.js';
import { assertPosWritesEnabled, assertPosOrganization } from '../pos-write-policy.js';

export interface CreateCustomerPayload {
  contactId: string;
  operationKey: string;
  name: string;
  phone: string;
  address: string;
  salePicId: number;
}
export class CreateCustomerValidator implements CommandValidator<Command<CreateCustomerPayload>> {
  validate({ payload }: Command<CreateCustomerPayload>): ValidationResult {
    const errors: Record<string, string> = {};
    for (const key of ['contactId', 'operationKey', 'name', 'phone', 'address'] as const) {
      if (typeof payload[key] !== 'string' || !payload[key].trim()) errors[key] = 'Thông tin bắt buộc';
    }
    if (!Number.isSafeInteger(payload.salePicId) || payload.salePicId <= 0) errors.salePicId = 'Chọn Sale PIC trên POS';
    return { isValid: !Object.keys(errors).length, errors };
  }
}
export class CreateCustomerHandler implements CommandHandler<Command<CreateCustomerPayload>> {
  async handle({ payload }: Command<CreateCustomerPayload>, context: { orgId: string; userId: string }) {
    assertPosWritesEnabled();
    assertPosOrganization(context.orgId);
    const user = await prisma.user.findFirst({ where: { id: context.userId, orgId: context.orgId, isActive: true } });
    if (!user) throw workspaceError('Không có quyền.', 403);
    const actor = { id: user.id, orgId: user.orgId, role: user.role };
    await requireCustomer(actor, payload.contactId, true);
    const result = await runPosWrite(context, payload.operationKey, 'create-customer', payload, async key => {
      const res = await getHisweetiePublicApiClient().createCustomer({
        name: payload.name.trim(), contactNumber: payload.phone.trim(), salePicId: payload.salePicId,
        addresses: [{ address: payload.address.trim(), isDefault: true }],
      }, key);
      const row = (res.data ?? res) as Record<string, unknown>;
      const posCustomerId = Number(row.id);
      if (!Number.isSafeInteger(posCustomerId) || posCustomerId <= 0) throw new Error('POS chưa trả ID hợp lệ.');
      return { posCustomerId, posCustomerCode: row.code ?? null, name: row.name ?? payload.name, linkedExisting: false };
    });
    // One owner can have multiple shops. Never match implicitly by phone/name.
    await addPosLinks(actor, payload.contactId, [result.posCustomerId]);
    return result;
  }
}
export class UpdateCustomerHandler implements CommandHandler {
  async handle() { throw workspaceError('Sửa hồ sơ khách hàng phải thực hiện tại POS.', 403); }
}
commandDispatcher.register('CreateCustomer', new CreateCustomerHandler(), new CreateCustomerValidator());
commandDispatcher.register('UpdateCustomer', new UpdateCustomerHandler());
