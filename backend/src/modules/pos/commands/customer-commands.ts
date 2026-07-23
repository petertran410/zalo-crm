import { Command, CommandHandler, CommandValidator, ValidationResult } from '../../../shared/commands/command.interface.js';
import { commandDispatcher } from '../../../shared/commands/command-dispatcher.js';
import { getPosMcpClient } from '../../../shared/mcp/mcp-client.js';
import { prisma } from '../../../shared/database/prisma-client.js';
import { syncPosCustomersFromMcp } from '../../../shared/mcp/pos-sync-service.js';
import { logger } from '../../../shared/utils/logger.js';
import { handleMcpError } from '../../../shared/commands/error-handler.js';
import { v4 as uuidv4 } from 'uuid';

export interface CreateCustomerPayload {
  contactId?: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  groups?: string[];
  branchId?: number;
}

export class CreateCustomerValidator implements CommandValidator<Command<CreateCustomerPayload>> {
  validate(command: Command<CreateCustomerPayload>): ValidationResult {
    const { name, phone } = command.payload;
    const errors: Record<string, string> = {};

    if (!name || !name.trim()) {
      errors.name = 'Tên khách hàng không được để trống';
    }
    if (!phone || !phone.trim()) {
      errors.phone = 'Số điện thoại không được để trống';
    } else {
      const cleanPhone = phone.replace(/[\s.-]/g, '');
      const phoneRegex = /^(0|\+84|84)(3|5|7|8|9)[0-9]{8}$/;
      if (!phoneRegex.test(cleanPhone)) {
        errors.phone = 'Số điện thoại không đúng định dạng (ví dụ: 0987654321)';
      }
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors: Object.keys(errors).length > 0 ? errors : undefined,
    };
  }
}

export class CreateCustomerHandler implements CommandHandler<Command<CreateCustomerPayload>, any> {
  async handle(command: Command<CreateCustomerPayload>, context: { orgId: string; userId: string }): Promise<any> {
    const { contactId, name, phone, email, address, branchId } = command.payload;
    const mcpClient = getPosMcpClient();

    // 1. Kiểm tra xem số điện thoại đã tồn tại trên POS chưa (Tránh trùng lặp)
    try {
      logger.info(`[CreateCustomerHandler] Checking duplicate phone: ${phone} on POS`);
      const searchRes = await mcpClient.customers.search(phone.trim());
      const existingCustomers = (searchRes as any).data || [];
      if (existingCustomers.length > 0) {
        // Tìm thấy khách hàng trùng SĐT -> Thực hiện liên kết thay vì tạo mới
        const existing = existingCustomers[0];
        logger.info(`[CreateCustomerHandler] Found existing customer on POS with ID: ${existing.id}. Linking instead of creating.`);
        
        if (contactId) {
          await prisma.contact.update({
            where: { id: contactId },
            data: {
              posCustomerId: existing.id,
              posCustomerCode: existing.code || null,
            },
          });
        }
        
        // Chạy sync ngầm
        syncPosCustomersFromMcp(context.orgId).catch(err => {
          logger.error('[CreateCustomerHandler] Background sync customers failed:', err);
        });

        return {
          posCustomerId: existing.id,
          posCustomerCode: existing.code,
          name: existing.name,
          phone: existing.phone || existing.contactNumber,
          linkedExisting: true,
        };
      }
    } catch (err: any) {
      logger.warn('[CreateCustomerHandler] Search POS customer check failed:', err.message || err);
    }

    // 2. Tạo mới trên POS
    const addresses = [
      {
        address: address ? address.trim() : 'Chưa xác định',
        newCityCode: '79',
        newCityName: 'Thành phố Hồ Chí Minh',
        newWardCode: '26740',
        newWardName: 'Phường Bến Thành',
        isDefault: true,
      }
    ];

    let finalBranchId = branchId;
    if (!finalBranchId) {
      try {
        const branchesRes = await mcpClient.branches.list();
        const branches = (branchesRes as any).data || [];
        if (branches.length > 0) {
          finalBranchId = branches[0].id;
        }
      } catch (err: any) {
        logger.warn('[CreateCustomerHandler] Failed to auto-detect branchId fallback:', err.message || err);
      }
    }

    const idempotencyKey = uuidv4() as any;
    try {
      logger.info(`[CreateCustomerHandler] Creating new customer on POS: ${name}`);
      const res = await mcpClient.customers.create({
        name: name.trim(),
        phone: phone.trim(),
        contactNumber: phone.trim(),
        email: email ? email.trim() : undefined,
        branchId: finalBranchId || undefined,
        addresses,
      }, idempotencyKey);

      const created = (res as any).data || res;
      const posId = created.id;
      const posCode = created.code;

      if (!posId) {
        throw new Error('POS API return invalid customer ID');
      }

      // 3. Liên kết với CRM Contact nếu có contactId
      if (contactId) {
        await prisma.contact.update({
          where: { id: contactId },
          data: {
            posCustomerId: posId,
            posCustomerCode: posCode || null,
          },
        });
      }

      // 4. Kích hoạt Background Sync
      syncPosCustomersFromMcp(context.orgId).catch(err => {
        logger.error('[CreateCustomerHandler] Background sync customers failed:', err);
      });

      return {
        posCustomerId: posId,
        posCustomerCode: posCode,
        name: created.name,
        phone: created.phone || created.contactNumber,
        linkedExisting: false,
      };
    } catch (err: any) {
      const mappedMsg = handleMcpError(err);
      throw new Error(mappedMsg);
    }
  }
}

export interface UpdateCustomerPayload {
  posCustomerId: number;
  contactId?: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  branchId?: number;
}

export class UpdateCustomerValidator implements CommandValidator<Command<UpdateCustomerPayload>> {
  validate(command: Command<UpdateCustomerPayload>): ValidationResult {
    const { posCustomerId, name, phone } = command.payload;
    const errors: Record<string, string> = {};

    if (!posCustomerId) {
      errors.posCustomerId = 'ID khách hàng POS không được để trống';
    }
    if (!name || !name.trim()) {
      errors.name = 'Tên khách hàng không được để trống';
    }
    if (!phone || !phone.trim()) {
      errors.phone = 'Số điện thoại không được để trống';
    } else {
      const cleanPhone = phone.replace(/[\s.-]/g, '');
      const phoneRegex = /^(0|\+84|84)(3|5|7|8|9)[0-9]{8}$/;
      if (!phoneRegex.test(cleanPhone)) {
        errors.phone = 'Số điện thoại không đúng định dạng';
      }
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors: Object.keys(errors).length > 0 ? errors : undefined,
    };
  }
}

export class UpdateCustomerHandler implements CommandHandler<Command<UpdateCustomerPayload>, any> {
  async handle(command: Command<UpdateCustomerPayload>, context: { orgId: string; userId: string }): Promise<any> {
    const { posCustomerId, contactId, name, phone, email, address, branchId } = command.payload;
    const mcpClient = getPosMcpClient();
    const addresses = [
      {
        address: address ? address.trim() : 'Chưa xác định',
        newCityCode: '79',
        newCityName: 'Thành phố Hồ Chí Minh',
        newWardCode: '26740',
        newWardName: 'Phường Bến Thành',
        isDefault: true,
      }
    ];

    let finalBranchId = branchId;
    if (!finalBranchId) {
      try {
        const branchesRes = await mcpClient.branches.list();
        const branches = (branchesRes as any).data || [];
        if (branches.length > 0) {
          finalBranchId = branches[0].id;
        }
      } catch (err: any) {
        logger.warn('[UpdateCustomerHandler] Failed to auto-detect branchId fallback:', err.message || err);
      }
    }

    const idempotencyKey = uuidv4() as any;

    try {
      logger.info(`[UpdateCustomerHandler] Updating customer ${posCustomerId} on POS`);
      const res = await mcpClient.customers.update(posCustomerId, {
        name: name.trim(),
        phone: phone.trim(),
        contactNumber: phone.trim(),
        email: email ? email.trim() : undefined,
        branchId: finalBranchId || undefined,
        addresses,
      }, idempotencyKey);

      const updated = (res as any).data || res;

      // Đồng bộ thông tin về CRM Contact nếu liên kết khớp
      if (contactId) {
        await prisma.contact.update({
          where: { id: contactId },
          data: {
            posCustomerId: posCustomerId,
          },
        });
      }

      // Kích hoạt Background Sync
      syncPosCustomersFromMcp(context.orgId).catch(err => {
        logger.error('[UpdateCustomerHandler] Background sync customers failed:', err);
      });

      return {
        posCustomerId,
        name: updated.name || name,
        phone: updated.phone || updated.contactNumber || phone,
      };
    } catch (err: any) {
      const mappedMsg = handleMcpError(err);
      throw new Error(mappedMsg);
    }
  }
}

// Tự động đăng ký các Command vào Dispatcher
commandDispatcher.register('CreateCustomer', new CreateCustomerHandler(), new CreateCustomerValidator());
commandDispatcher.register('UpdateCustomer', new UpdateCustomerHandler(), new UpdateCustomerValidator());
