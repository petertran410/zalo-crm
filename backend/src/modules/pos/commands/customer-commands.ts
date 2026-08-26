import { Command, CommandHandler, CommandValidator, ValidationResult } from '../../../shared/commands/command.interface.js';
import { commandDispatcher } from '../../../shared/commands/command-dispatcher.js';
import { getHisweetiePublicApiClient } from '../../integrations/hisweetie-public-api-client.js';
import { prisma } from '../../../shared/database/prisma-client.js';
import { getCustomerSyncSince, syncPosCustomersFromMcp } from '../../../shared/mcp/pos-sync-service.js';
import { withPosSyncLock } from '../pos-sync-lock.js';
import { logger } from '../../../shared/utils/logger.js';
import { handleMcpError, parsePosPublicApiError } from '../../../shared/commands/error-handler.js';
import { normalizePhone, phoneVariants } from '../../../shared/utils/phone.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Địa chỉ mặc định khi sale không nhập — POS BẮT BUỘC ≥1 địa chỉ giao hàng
 * (verify thật 2026-08-25: thiếu addresses → 400 "Phải có ít nhất 1 địa chỉ").
 * Shape đúng đặc tả PUBLIC-API.md §6, không thêm field lạ (strict validation).
 */
function buildAddresses(address?: string) {
  return [{
    address: address?.trim() || 'Chưa xác định',
    newCityCode: '79',
    newCityName: 'Thành phố Hồ Chí Minh',
    newWardName: 'Phường Bến Thành',
    isDefault: true,
  }];
}

/**
 * Tìm khách trùng SĐT. Verify thật 2026-08-25: POS `search` KHÔNG khớp số điện
 * thoại (tìm "0899339387" → rỗng, tìm tên thì được) dù doc ghi có — nên tra
 * LOCAL pos_customers trước (đã sync kèm phone), chỉ fallback POS search sau.
 */
async function findExistingByPhone(orgId: string, phone: string) {
  const variants = new Set<string>([phone.trim()]);
  const norm = normalizePhone(phone);
  if (norm) variants.add(norm);
  for (const v of phoneVariants(phone)) {
    const n = normalizePhone(v);
    if (n) variants.add(n);
  }

  const local = await prisma.posCustomer.findFirst({
    where: { orgId, phone: { in: [...variants] } },
    orderBy: { updatedAt: 'desc' },
  });
  if (local) {
    return { id: local.posId, code: local.code, name: local.name, phone: local.phone };
  }

  // Fallback: hỏi POS trực tiếp (search khớp được tên/mã, SĐT thì không đáng tin).
  try {
    const res = await getHisweetiePublicApiClient().searchCustomers(phone.trim());
    const found = (res as any).data || [];
    if (found.length > 0) {
      const c = found[0];
      return { id: Number(c.id), code: c.code || null, name: c.name || '', phone: c.phone || c.contactNumber || null };
    }
  } catch (err: any) {
    logger.warn('[CreateCustomerHandler] POS search fallback failed:', err.message || err);
  }
  return null;
}

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
    const { contactId, name, phone, email, address } = command.payload;
    // Public API thuần (PUBLIC-API.md §6) — MCP đã loại bỏ hoàn toàn khỏi luồng KH.
    const api = getHisweetiePublicApiClient();

    // 1. Kiểm tra xem số điện thoại đã tồn tại trên POS chưa (Tránh trùng lặp)
    try {
      logger.info(`[CreateCustomerHandler] Checking duplicate phone: ${phone} on POS`);
      const existing = await findExistingByPhone(context.orgId, phone);
      if (existing) {
        // Tìm thấy khách hàng trùng SĐT -> Thực hiện liên kết thay vì tạo mới
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

        // Sync ngầm, chạy tăng dần thay vì kéo lại toàn bộ khách hàng.
        void withPosSyncLock(context.orgId, 'Customer', async () =>
          syncPosCustomersFromMcp(context.orgId, { since: await getCustomerSyncSince(context.orgId) }),
        ).catch(err => {
          logger.error('[CreateCustomerHandler] Background sync customers failed:', err);
        });

        return {
          posCustomerId: existing.id,
          posCustomerCode: existing.code,
          name: existing.name,
          phone: existing.phone,
          linkedExisting: true,
        };
      }
    } catch (err: any) {
      logger.warn('[CreateCustomerHandler] Search POS customer check failed:', err.message || err);
    }

    // 2. Tạo mới trên POS — payload đúng đặc tả §6; addresses BẮT BUỘC.
    const payload = {
      name: name.trim(),
      contactNumber: phone.trim(),
      addresses: buildAddresses(address),
    };

    const idempotencyKey = uuidv4();
    try {
      logger.info(`[CreateCustomerHandler] Creating new customer on POS via Public API: ${name}`);
      const res = await api.createCustomer(payload, idempotencyKey);

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
      void withPosSyncLock(context.orgId, 'Customer', async () =>
        syncPosCustomersFromMcp(context.orgId, { since: await getCustomerSyncSince(context.orgId) }),
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
    } catch (err: any) {
      // POS tự chặn trùng SĐT bằng 409 Conflict (verify thật 2026-08-25):
      // 'Số điện thoại "xxx" đã được sử dụng bởi khách hàng "Tên"'.
      // Local check bỏ lỡ vì sync chỉ lưu KH có phát sinh tài chính → KH mới
      // chưa bao giờ mua không nằm trong pos_customers. Xử lý: tìm theo tên
      // trong message (search POS khớp TÊN được) rồi LINK thay vì fail.
      const { status, detail } = parsePosPublicApiError(err);
      const dupMatch = status === 409
        ? detail.match(/đã được sử dụng bởi khách hàng "([^"]+)"/)
        : null;
      if (dupMatch) {
        const dupName = dupMatch[1];
        try {
          const res = await getHisweetiePublicApiClient().searchCustomers(dupName, 50);
          const candidates = ((res as any).data || []) as any[];
          const phoneDigits = phone.replace(/\D/g, '').slice(-9);
          const match = candidates.find((c) => String(c.contactNumber || c.phone || '').replace(/\D/g, '').endsWith(phoneDigits))
            || candidates.find((c) => c.name === dupName);
          if (match) {
            logger.info(`[CreateCustomerHandler] POS 409 duplicate → link existing customer ${match.id} (${match.name})`);
            if (contactId) {
              await prisma.contact.update({
                where: { id: contactId },
                data: { posCustomerId: Number(match.id), posCustomerCode: match.code || null },
              });
            }
            return {
              posCustomerId: Number(match.id),
              posCustomerCode: match.code,
              name: match.name,
              phone: match.phone || match.contactNumber,
              linkedExisting: true,
            };
          }
        } catch (linkErr: any) {
          logger.warn('[CreateCustomerHandler] 409 link-back failed:', linkErr.message || linkErr);
        }
        throw new Error(`Số điện thoại ${phone} đã tồn tại trên POS (khách "${dupName}"). Vui lòng liên kết thủ công trong panel khách hàng.`);
      }
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
    const { posCustomerId, contactId, name, phone, email, address } = command.payload;
    // Public API thuần (PUBLIC-API.md §6) — payload chỉ gồm các trường trong đặc tả.
    const api = getHisweetiePublicApiClient();
    const payload = {
      name: name.trim(),
      contactNumber: phone.trim(),
      addresses: buildAddresses(address),
    };

    const idempotencyKey = uuidv4();

    try {
      logger.info(`[UpdateCustomerHandler] Updating customer ${posCustomerId} on POS via Public API`);
      const res = await api.updateCustomer(posCustomerId, payload, idempotencyKey);
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
      void withPosSyncLock(context.orgId, 'Customer', async () =>
        syncPosCustomersFromMcp(context.orgId, { since: await getCustomerSyncSince(context.orgId) }),
      ).catch(err => {
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
