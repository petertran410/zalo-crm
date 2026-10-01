import { Command, CommandHandler, CommandValidator, ValidationResult } from '../../../shared/commands/command.interface.js';
import { commandDispatcher } from '../../../shared/commands/command-dispatcher.js';
import { getHisweetiePublicApiClient } from '../../integrations/hisweetie-public-api-client.js';
import { prisma } from '../../../shared/database/prisma-client.js';
import { syncCustomerCohort } from '../../integrations/pos-customer-import-service.js';
import { withPosSyncLock } from '../pos-sync-lock.js';
import { logger } from '../../../shared/utils/logger.js';
import { handleMcpError, parsePosPublicApiError } from '../../../shared/commands/error-handler.js';
import { normalizePhone, phoneVariants } from '../../../shared/utils/phone.js';
import { v4 as uuidv4 } from 'uuid';
import { assertPosCustomerCanLink, assertPosLinkStoreReady, linkPosCustomer } from '../contact-pos-links.js';

/**
 * Địa chỉ mặc định khi sale không nhập — POS BẮT BUỘC ≥1 địa chỉ giao hàng
 * (verify thật 2026-08-25: thiếu addresses → 400 "Phải có ít nhất 1 địa chỉ").
 * Shape đúng đặc tả PUBLIC-API.md §6, không thêm field lạ (strict validation).
 */
function buildAddresses(address?: string, cityCode?: string, cityName?: string, wardName?: string) {
  return [{
    address: address?.trim() || 'Chưa xác định',
    ...(cityCode ? { newCityCode: cityCode } : {}),
    ...(cityName ? { newCityName: cityName } : {}),
    ...(wardName ? { newWardName: wardName } : {}),
    isDefault: true,
  }];
}

export async function findExistingByPhone(orgId: string, phone: string, excludePosId?: number) {
  const variants = new Set<string>([phone.trim()]);
  const norm = normalizePhone(phone);
  if (norm) variants.add(norm);
  for (const v of phoneVariants(phone)) {
    variants.add(v);
    const n = normalizePhone(v);
    if (n) variants.add(n);
  }

  const local = await prisma.posCustomer.findFirst({
    where: { orgId, phone: { in: [...variants] }, ...(excludePosId ? { posId: { not: excludePosId } } : {}) },
    orderBy: { updatedAt: 'desc' },
  });
  if (local) {
    return { id: local.posId, code: local.code, name: local.name, phone: local.phone };
  }

  return null;
}

export interface CreateCustomerPayload {
  contactId?: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  cityCode?: string;
  cityName?: string;
  wardName?: string;
  groups?: string[];
  branchId?: number;
}

export class CreateCustomerValidator implements CommandValidator<Command<CreateCustomerPayload>> {
  validate(command: Command<CreateCustomerPayload>): ValidationResult {
    const { name, phone, address } = command.payload;
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
    if (!address || !address.trim()) {
      errors.address = 'Địa chỉ chi tiết không được để trống';
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors: Object.keys(errors).length > 0 ? errors : undefined,
    };
  }
}

export class CreateCustomerHandler implements CommandHandler<Command<CreateCustomerPayload>, any> {
  async handle(command: Command<CreateCustomerPayload>, context: { orgId: string; userId: string }): Promise<any> {
    const { contactId, name, phone, address, cityCode, cityName, wardName } = command.payload;
    // Public API thuần (PUBLIC-API.md §6) — MCP đã loại bỏ hoàn toàn khỏi luồng KH.
    const api = getHisweetiePublicApiClient();
    if (contactId && !(await prisma.contact.findFirst({ where: { id: contactId, orgId: context.orgId }, select: { id: true } }))) {
      throw new Error('Không tìm thấy Contact');
    }
    if (contactId) await assertPosLinkStoreReady();

    // 1. Kiểm tra xem số điện thoại đã tồn tại trên POS chưa (Tránh trùng lặp)
    try {
      logger.info(`[CreateCustomerHandler] Checking duplicate phone: ${phone} on POS`);
      const existing = await findExistingByPhone(context.orgId, phone);
      if (existing) {
        throw new Error('Số điện thoại đã được liên kết với một tài khoản POS');
      }
    } catch (err: any) {
      if (err.message === 'Số điện thoại đã được liên kết với một tài khoản POS') throw err;
      logger.warn('[CreateCustomerHandler] Search POS customer check failed:', err.message || err);
    }

    // 2. Tạo mới trên POS — payload đúng đặc tả §6; addresses BẮT BUỘC.
    const payload = {
      name: name.trim(),
      contactNumber: phone.trim(),
      addresses: buildAddresses(address, cityCode, cityName, wardName),
    };

    const idempotencyKey = uuidv4();
    let res: any;
    try {
      logger.info(`[CreateCustomerHandler] Creating new customer on POS via Public API: ${name}`);
      res = await api.createCustomer(payload, idempotencyKey);
    } catch (err: any) {
      const { status } = parsePosPublicApiError(err);
      if (status === 409) throw new Error('Số điện thoại đã được liên kết với một tài khoản POS');
      throw new Error(handleMcpError(err));
    }

    const created = res.data || res;
    const posId = Number(created.id);
    const posCode = created.code;
    if (!Number.isSafeInteger(posId) || posId <= 0) {
      throw new Error('POS đã phản hồi nhưng không trả mã khách hàng hợp lệ. Vui lòng kiểm tra POS trước khi thử lại.');
    }

    try {
      await prisma.posCustomer.upsert({
        where: { posId_orgId: { posId, orgId: context.orgId } },
        create: {
          orgId: context.orgId,
          posId,
          code: posCode || null,
          name: created.name || name.trim(),
          phone: created.phone || created.contactNumber || phone.trim(),
          address: address?.trim() || null,
        },
        update: {
          code: posCode || null,
          name: created.name || name.trim(),
          phone: created.phone || created.contactNumber || phone.trim(),
          address: address?.trim() || null,
        },
      });
    } catch (err) {
      logger.error('[CreateCustomerHandler] Local POS customer projection failed:', err);
    }

    if (contactId) {
      try {
        await linkPosCustomer(context.orgId, contactId, posId, posCode);
      } catch (err) {
        logger.error(`[CreateCustomerHandler] POS customer ${posId} created without CRM link:`, err);
        throw new Error(`Đã tạo khách hàng POS ${posCode || `#${posId}`} nhưng chưa liên kết CRM. Hãy dùng "Tìm & liên kết POS"; không tạo lại.`);
      }
    }

    void withPosSyncLock(context.orgId, 'Customer', async () =>
      syncCustomerCohort(context.orgId),
    ).catch(err => {
      logger.error('[CreateCustomerHandler] Background sync customers failed:', err);
    });

    return {
      posCustomerId: posId,
      posCustomerCode: posCode,
      name: created.name,
      phone: created.phone || created.contactNumber,
      linkedExisting: false,
    };
  }
}

export interface UpdateCustomerPayload {
  posCustomerId: number;
  contactId?: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  cityCode?: string;
  cityName?: string;
  wardName?: string;
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
    const { posCustomerId, contactId, name, phone, address, cityCode, cityName, wardName } = command.payload;
    if (contactId) await assertPosCustomerCanLink(context.orgId, contactId, posCustomerId);
    // Public API thuần (PUBLIC-API.md §6) — payload chỉ gồm các trường trong đặc tả.
    const api = getHisweetiePublicApiClient();
    const payload = {
      name: name.trim(),
      contactNumber: phone.trim(),
      ...(address !== undefined || cityCode !== undefined || cityName !== undefined || wardName !== undefined
        ? { addresses: buildAddresses(address, cityCode, cityName, wardName) }
        : {}),
    };

    const idempotencyKey = uuidv4();
    let posUpdated = false;

    try {
      if (await findExistingByPhone(context.orgId, phone, posCustomerId)) {
        throw new Error('Số điện thoại đã được liên kết với một tài khoản POS');
      }
      logger.info(`[UpdateCustomerHandler] Updating customer ${posCustomerId} on POS via Public API`);
      const res = await api.updateCustomer(posCustomerId, payload, idempotencyKey);
      posUpdated = true;
      const updated = (res as any).data || res;

      await prisma.posCustomer.upsert({
        where: { posId_orgId: { posId: posCustomerId, orgId: context.orgId } },
        create: {
          orgId: context.orgId,
          posId: posCustomerId,
          code: updated.code || null,
          name: updated.name || name.trim(),
          phone: updated.phone || updated.contactNumber || phone.trim(),
          address: address?.trim() || null,
        },
        update: {
          name: updated.name || name.trim(),
          phone: updated.phone || updated.contactNumber || phone.trim(),
          ...(address !== undefined ? { address: address.trim() || null } : {}),
        },
      }).catch((err) => logger.error('[UpdateCustomerHandler] Local POS customer projection failed:', err));

      // Đồng bộ thông tin về CRM Contact nếu liên kết khớp
      if (contactId) {
        await linkPosCustomer(context.orgId, contactId, posCustomerId);
      }

      // Kích hoạt Background Sync
      void withPosSyncLock(context.orgId, 'Customer', async () =>
        syncCustomerCohort(context.orgId),
      ).catch(err => {
        logger.error('[UpdateCustomerHandler] Background sync customers failed:', err);
      });

      return {
        posCustomerId,
        name: updated.name || name,
        phone: updated.phone || updated.contactNumber || phone,
      };
    } catch (err: any) {
      if (posUpdated) {
        logger.error(`[UpdateCustomerHandler] POS customer ${posCustomerId} updated without CRM link:`, err);
        throw new Error(`Đã cập nhật tài khoản POS #${posCustomerId} nhưng chưa hoàn tất liên kết CRM. Vui lòng tải lại và thử liên kết POS.`);
      }
      if (err.message === 'Số điện thoại đã được liên kết với một tài khoản POS') throw err;
      const { status } = parsePosPublicApiError(err);
      if (status === 409) {
        throw new Error('Số điện thoại đã được liên kết với một tài khoản POS');
      }
      const mappedMsg = handleMcpError(err);
      throw new Error(mappedMsg);
    }
  }
}

// Tự động đăng ký các Command vào Dispatcher
commandDispatcher.register('CreateCustomer', new CreateCustomerHandler(), new CreateCustomerValidator());
commandDispatcher.register('UpdateCustomer', new UpdateCustomerHandler(), new UpdateCustomerValidator());
