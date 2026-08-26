import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { PosPaginationService } from '../../shared/mcp/pos-pagination-service.js';
import { syncPosCustomersFromMcp, syncPosProductsFromMcp } from '../../shared/mcp/pos-sync-service.js';
import { getHisweetiePublicApiClient, isPublicApiSyncEnabled } from '../integrations/hisweetie-public-api-client.js';
import { withPosSyncLock } from './pos-sync-lock.js';
import { logger } from '../../shared/utils/logger.js';
import { commandDispatcher } from '../../shared/commands/command-dispatcher.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { logActivity } from '../activity/activity-logger.js';
import { assertContactVisible } from '../contacts/contact-scope.js';

// Import để đảm bảo các Commands được đăng ký vào Dispatcher
import './commands/customer-commands.js';
import './commands/order-commands.js';

/**
 * Dữ liệu thương mại của một khách (đơn, công nợ, hồ sơ POS) là dữ liệu nhạy cảm:
 * sale chỉ được xem khách mình phụ trách, trừ khi có grant `contact.view_all`
 * hoặc là admin/owner. Trả 404 thay vì 403 để không lộ sự tồn tại của contact.
 *
 * Dùng chung một cổng với Customer 360 (contact-scope) để hai đường vào cùng
 * một dữ liệu không lệch chính sách.
 */
async function ensureContactVisible(
  request: FastifyRequest,
  reply: FastifyReply,
  contactId: string,
): Promise<boolean> {
  const user = request.user!;
  const visible = await assertContactVisible({
    userId: user.id,
    orgId: user.orgId,
    legacyRole: user.role,
    contactId,
  });
  if (!visible) {
    reply.status(404).send({ error: 'Contact not found' });
    return false;
  }
  return true;
}

export async function posRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // GET /api/v1/pos/products — list products from local Read Model with cursor pagination
  app.get('/api/v1/pos/products', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const query = request.query as any;
    logger.info(`[pos-routes] GET /api/v1/pos/products called. orgId: ${user.orgId}, keyword: ${query.keyword}`);
    try {
      const limit = parseInt(query.limit) || 20;
      const cursor = query.cursor;
      const keyword = query.keyword;
      const sortBy = query.sortBy;
      const sortOrder = query.sortOrder;

      const res = await PosPaginationService.getProducts(user.orgId, {
        limit,
        cursor,
        keyword,
        sortBy,
        sortOrder,
      });
      logger.info(`[pos-routes] products response success. items count: ${res.items?.length || 0}`);
      return res;
    } catch (err: any) {
      logger.error('[pos-routes] Fetch products failed:', err);
      return reply.status(500).send({ error: 'Failed to fetch POS products' });
    }
  });

  // GET /api/v1/pos/customers — list customers from local Read Model with cursor pagination
  app.get('/api/v1/pos/customers', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const query = request.query as any;

      const limit = parseInt(query.limit) || 20;
      const cursor = query.cursor;
      const keyword = query.keyword;
      const sortBy = query.sortBy;
      const sortOrder = query.sortOrder;

      return await PosPaginationService.getCustomers(user.orgId, {
        limit,
        cursor,
        keyword,
        sortBy,
        sortOrder,
      });
    } catch (err: any) {
      logger.error('[pos-routes] Fetch customers failed:', err);
      return reply.status(500).send({ error: 'Failed to fetch POS customers' });
    }
  });

  // GET /api/v1/pos/customers/search — 2-layer search: local Read Model first, then MCP POS
  // Dùng riêng cho Link Customer Dialog, KHÔNG phải Read Model list.
  app.get('/api/v1/pos/customers/search', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const query = request.query as any;
      const keyword = (query.keyword || '').trim();

      if (!keyword) {
        return { source: 'local', items: [] };
      }

      // ── Phase 1: Tìm trong Read Model local (nhanh) ──
      const localResults = await prisma.posCustomer.findMany({
        where: {
          orgId: user.orgId,
          OR: [
            { name: { contains: keyword, mode: 'insensitive' } },
            { phone: { contains: keyword, mode: 'insensitive' } },
            { code: { contains: keyword, mode: 'insensitive' } },
          ],
        },
        select: {
          posId: true,
          code: true,
          name: true,
          phone: true,
          customerType: true,
          status: true,
        },
        take: 20,
      });

      if (localResults.length > 0) {
        return {
          source: 'local',
          items: localResults.map((c) => ({
            id: c.posId,
            code: c.code,
            name: c.name,
            phone: c.phone,
            customerType: c.customerType,
          })),
        };
      }

      // ── Phase 2: Không có local → hỏi thẳng POS (live) ──
      // Public API dùng `search` (tên/mã/điện thoại) thay cho customers.search của MCP.
      try {
        if (isPublicApiSyncEnabled()) {
          const res = await getHisweetiePublicApiClient().searchCustomers(keyword);
          return {
            source: 'public_api',
            items: (res.data || []).map((c: any) => ({
              id: c.id,
              code: c.code,
              name: c.name,
              phone: c.phone || c.contactNumber,
              customerType: typeof c.customerType === 'string' ? c.customerType : (c.customerType?.name || null),
            })),
          };
        }

        // Public API là đường duy nhất — MCP đã loại bỏ khỏi mã nguồn.
        return {
          source: 'public_api',
          items: [],
        };
      } catch (liveErr: any) {
        logger.warn('[pos-routes] Live customer search failed, returning empty:', liveErr.message || liveErr);
        return { source: 'public_api', items: [] };
      }
    } catch (err: any) {
      logger.error('[pos-routes] Search customers 2-layer failed:', err);
      return reply.status(500).send({ error: 'Failed to search POS customers' });
    }
  });

  // GET /api/v1/pos/customers/:id — lấy hồ sơ khách hàng chi tiết trực tiếp từ POS
  app.get('/api/v1/pos/customers/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    try {
      return await getHisweetiePublicApiClient().getCustomer(parseInt(id));
    } catch (err: any) {
      logger.error(`[pos-routes] Fetch POS customer detail failed for id ${id}:`, err);
      return reply.status(500).send({ error: err.message || 'Failed to fetch detailed POS customer profile' });
    }
  });

  // POST /api/v1/pos/sync — trigger manual synchronization of products & customers Read Model
  app.post('/api/v1/pos/sync', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      // Chạy tuần tự và có khoá: POS giới hạn 5000 request/giờ cho mỗi client,
      // hai lần bấm đồng bộ chồng nhau là chạm trần ngay.
      await withPosSyncLock(user.orgId, 'Product', () => syncPosProductsFromMcp(user.orgId));
      await withPosSyncLock(user.orgId, 'Customer', () => syncPosCustomersFromMcp(user.orgId));
      return { success: true };
    } catch (err: any) {
      logger.error('[pos-routes] Manual sync failed:', err);
      return reply.status(500).send({ error: err.message || 'Failed to sync data from POS' });
    }
  });

  // POST /api/v1/pos/customers — Create customer on POS via Shared Command Framework
  app.post(
    '/api/v1/pos/customers',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name', 'phone'],
          properties: {
            name: { type: 'string', minLength: 1 },
            phone: { type: 'string', minLength: 1 },
            contactId: { type: 'string' },
            address: { type: 'string' },
            email: { type: 'string' },
            branchId: { type: 'integer' },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const body = request.body as any;

      const result = await commandDispatcher.dispatch({
        name: 'CreateCustomer',
        payload: {
          contactId: body.contactId,
          name: body.name,
          phone: body.phone,
          address: body.address,
          email: body.email,
          branchId: body.branchId,
        },
      }, { orgId: user.orgId, userId: user.id });

      if (!result.success) {
        return reply.status(400).send(result);
      }
      return result;
    }
  );

  // PUT /api/v1/pos/customers/:id — Update customer on POS via Shared Command Framework
  app.put(
    '/api/v1/pos/customers/:id',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['name', 'phone'],
          properties: {
            name: { type: 'string', minLength: 1 },
            phone: { type: 'string', minLength: 1 },
            contactId: { type: 'string' },
            address: { type: 'string' },
            email: { type: 'string' },
            branchId: { type: 'integer' },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const body = request.body as any;

      const result = await commandDispatcher.dispatch({
        name: 'UpdateCustomer',
        payload: {
          posCustomerId: parseInt(id),
          contactId: body.contactId,
          name: body.name,
          phone: body.phone,
          address: body.address,
          email: body.email,
          branchId: body.branchId,
        },
      }, { orgId: user.orgId, userId: user.id });

      if (!result.success) {
        return reply.status(400).send(result);
      }
      return result;
    }
  );

  // GET /api/v1/pos/contacts/:contactId/status — Check POS link status & search auto-suggest
  app.get('/api/v1/pos/contacts/:contactId/status', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { contactId } = request.params as { contactId: string };
      if (!(await ensureContactVisible(request, reply, contactId))) return;
      const contact = await prisma.contact.findUnique({
        where: { id: contactId },
      });

      if (!contact) {
        return reply.status(404).send({ error: 'Contact not found' });
      }

      // Không dựng client POS ở đây: endpoint này vẫn trả được kết quả từ dữ liệu
      // local khi POS chưa cấu hình. Chỉ gọi live khi thực sự cần, và luôn có fallback.
      const fetchPosCustomer = (posCustomerId: number) =>
        getHisweetiePublicApiClient().getCustomer(posCustomerId);

      // 1. Trường hợp đã liên kết
      if (contact.posCustomerId) {
        try {
          const customerProfile = await fetchPosCustomer(contact.posCustomerId);
          return {
            linked: true,
            posCustomerId: contact.posCustomerId,
            posCustomerCode: contact.posCustomerCode,
            posCustomer: (customerProfile as any).data || customerProfile,
          };
        } catch (err: any) {
          logger.warn(`[pos-routes] Fetch POS profile failed for customer ${contact.posCustomerId}:`, err.message || err);
          // Fallback khi không kéo được live từ POS, trả thông tin local
          return {
            linked: true,
            posCustomerId: contact.posCustomerId,
            posCustomerCode: contact.posCustomerCode,
            localFallback: true,
            posCustomer: {
              id: contact.posCustomerId,
              code: contact.posCustomerCode,
              name: contact.fullName || contact.crmName,
              phone: contact.phone,
            },
          };
        }
      }

      // 2. Trường hợp chưa liên kết -> Thử tìm kiếm theo số điện thoại để gợi ý
      if (contact.phone) {
        try {
          const keyword = contact.phone.trim();
          const searchRes = getHisweetiePublicApiClient().searchCustomers(keyword);
          const found = (searchRes as any).data || [];
          if (found.length > 0) {
            return {
              linked: false,
              autoSuggest: true,
              posCustomer: found[0],
            };
          }
        } catch (err: any) {
          logger.warn('[pos-routes] Search POS customer for auto-suggest failed:', err.message || err);
        }
      }

      return {
        linked: false,
        autoSuggest: false,
      };
    } catch (err: any) {
      logger.error('[pos-routes] Fetch link status failed:', err);
      return reply.status(500).send({ error: 'Failed to fetch POS link status' });
    }
  });

  // POST /api/v1/pos/contacts/:contactId/link — Manual link CRM Contact with POS Customer ID
  app.post(
    '/api/v1/pos/contacts/:contactId/link',
    {
      schema: {
        params: {
          type: 'object',
          required: ['contactId'],
          properties: {
            contactId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['posCustomerId'],
          properties: {
            posCustomerId: { type: 'integer' },
            posCustomerCode: { type: 'string' },
            posCustomerName: { type: 'string' },
            posCustomerPhone: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const { contactId } = request.params as { contactId: string };
        if (!(await ensureContactVisible(request, reply, contactId))) return;
        const { posCustomerId, posCustomerCode, posCustomerName, posCustomerPhone } = request.body as any;

        // Lấy thông tin Contact hiện tại để audit & sync
        const existingContact = await prisma.contact.findUnique({
          where: { id: contactId },
          select: { posCustomerId: true, posCustomerCode: true, fullName: true, phone: true },
        });

        let finalPosPhone = posCustomerPhone;
        let finalPosName = posCustomerName;

        if (!finalPosPhone || !finalPosName) {
          const posCust = await prisma.posCustomer.findFirst({
            where: { posId: posCustomerId, orgId: user.orgId },
            select: { name: true, phone: true },
          });
          if (posCust) {
            if (!finalPosPhone) finalPosPhone = posCust.phone;
            if (!finalPosName) finalPosName = posCust.name;
          }
        }

        // Cập nhật Contact: link + auto-sync các trường cơ bản từ POS
        const updateData: any = {
          posCustomerId,
          posCustomerCode: posCustomerCode || null,
        };
        // Chỉ update tên/sđt nếu Contact chưa có dữ liệu
        if (finalPosName && !existingContact?.fullName) {
          updateData.fullName = finalPosName;
        }
        if (finalPosPhone && !existingContact?.phone) {
          updateData.phone = finalPosPhone;
        }

        const updatedContact = await prisma.contact.update({
          where: { id: contactId },
          data: updateData,
        });

        // Audit log (fire-and-forget)
        logActivity({
          orgId: user.orgId,
          userId: user.id,
          action: 'pos_link',
          entityType: 'contact',
          entityId: contactId,
          details: {
            posCustomerId,
            posCustomerCode: posCustomerCode || null,
            posCustomerName: posCustomerName || null,
            prevPosCustomerId: existingContact?.posCustomerId || null,
            prevPosCustomerCode: existingContact?.posCustomerCode || null,
          },
        });

        return {
          success: true,
          message: 'Liên kết khách hàng thành công',
          data: {
            contactId: updatedContact.id,
            posCustomerId: updatedContact.posCustomerId,
            posCustomerCode: updatedContact.posCustomerCode,
          },
        };
      } catch (err: any) {
        logger.error('[pos-routes] Link contact to POS failed:', err);
        return reply.status(500).send({ error: 'Failed to link contact to POS' });
      }
    }
  );

  // DELETE /api/v1/pos/contacts/:contactId/link — Unlink (Hủy liên kết) + audit log
  app.delete(
    '/api/v1/pos/contacts/:contactId/link',
    {
      schema: {
        params: {
          type: 'object',
          required: ['contactId'],
          properties: {
            contactId: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const { contactId } = request.params as { contactId: string };
        if (!(await ensureContactVisible(request, reply, contactId))) return;

        // Lấy thông tin POS hiện tại để lưu vào audit log
        const existingContact = await prisma.contact.findUnique({
          where: { id: contactId },
          select: { posCustomerId: true, posCustomerCode: true },
        });

        if (!existingContact) {
          return reply.status(404).send({ error: 'Contact not found' });
        }

        if (!existingContact.posCustomerId) {
          return reply.status(400).send({ error: 'Contact chưa được liên kết POS' });
        }

        // Set null — hủy liên kết
        await prisma.contact.update({
          where: { id: contactId },
          data: {
            posCustomerId: null,
            posCustomerCode: null,
          },
        });

        // Audit log (fire-and-forget)
        logActivity({
          orgId: user.orgId,
          userId: user.id,
          action: 'pos_unlink',
          entityType: 'contact',
          entityId: contactId,
          details: {
            prevPosCustomerId: existingContact.posCustomerId,
            prevPosCustomerCode: existingContact.posCustomerCode || null,
          },
        });

        return {
          success: true,
          message: 'Hủy liên kết POS thành công',
        };
      } catch (err: any) {
        logger.error('[pos-routes] Unlink contact from POS failed:', err);
        return reply.status(500).send({ error: 'Failed to unlink contact from POS' });
      }
    }
  );

  // ════════════════════════════════════════════════════════════════════════
  // ORDER ENDPOINTS
  // ════════════════════════════════════════════════════════════════════════

  // GET /api/v1/pos/branches — Lấy danh sách chi nhánh POS
  app.get('/api/v1/pos/branches', async (request: FastifyRequest, reply: FastifyReply) => {
    logger.info('[pos-routes] GET /api/v1/pos/branches called');
    try {
      const res = await getHisweetiePublicApiClient().listBranches({ pageSize: 100 });
      logger.info(`[pos-routes] branches.list res keys: ${Object.keys(res || {})}`);
      const branches = (res as any).data || res;
      const responseData = { success: true, data: Array.isArray(branches) ? branches : [] };
      logger.info(`[pos-routes] branches response success. count: ${responseData.data.length}`);
      return responseData;
    } catch (err: any) {
      logger.error('[pos-routes] Fetch branches failed:', err);
      return reply.status(500).send({ error: 'Failed to fetch POS branches' });
    }
  });

  // POST /api/v1/pos/orders — Tạo đơn hàng trên POS qua MCP Command
  app.post(
    '/api/v1/pos/orders',
    {
      schema: {
        body: {
          type: 'object',
          required: ['posCustomerId', 'branchId', 'items'],
          properties: {
            contactId: { type: 'string' },
            posCustomerId: { type: 'integer' },
            branchId: { type: 'integer' },
            priceBookId: { type: 'string' },
            discount: { type: 'number' },
            items: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                required: ['productId', 'productCode', 'productName', 'quantity', 'unitPrice'],
                properties: {
                  productId: { type: 'integer' },
                  productCode: { type: 'string' },
                  productName: { type: 'string' },
                  quantity: { type: 'number', minimum: 0.01 },
                  unitPrice: { type: 'number', minimum: 0 },
                  discount: { type: 'number' },
                  note: { type: 'string' },
                },
              },
            },
            paidAmount: { type: 'number' },
            paymentMethod: { type: 'string' },
            description: { type: 'string' },
            delivery: {
              type: 'object',
              properties: {
                receiver: { type: 'string' },
                phone: { type: 'string' },
                address: { type: 'string' },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const body = request.body as any;

      const result = await commandDispatcher.dispatch({
        name: 'CreateOrder',
        payload: body,
      }, { orgId: user.orgId, userId: user.id });

      if (!result.success) {
        return reply.status(400).send(result);
      }
      return result;
    }
  );

  // GET /api/v1/pos/orders/contact/:contactId — Lấy đơn hàng theo Contact
  app.get('/api/v1/pos/orders/contact/:contactId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { contactId } = request.params as { contactId: string };
      if (!(await ensureContactVisible(request, reply, contactId))) return;

      const result = await commandDispatcher.dispatch({
        name: 'GetContactOrders',
        payload: { contactId },
      }, { orgId: user.orgId, userId: user.id });

      if (!result.success) {
        return reply.status(400).send(result);
      }
      return result;
    } catch (err: any) {
      logger.error('[pos-routes] Fetch contact orders failed:', err);
      return reply.status(500).send({ error: 'Failed to fetch orders' });
    }
  });

  // GET /api/v1/pos/customers/:contactId/orders — Alias route for Customer 360 order history
  app.get('/api/v1/pos/customers/:contactId/orders', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { contactId } = request.params as { contactId: string };
      if (!(await ensureContactVisible(request, reply, contactId))) return;

      const result = await commandDispatcher.dispatch({
        name: 'GetContactOrders',
        payload: { contactId },
      }, { orgId: user.orgId, userId: user.id });

      if (!result.success) {
        return reply.status(400).send(result);
      }
      return result;
    } catch (err: any) {
      logger.error('[pos-routes] Fetch customer orders failed:', err);
      return reply.status(500).send({ error: 'Failed to fetch orders' });
    }
  });

  // GET /api/v1/pos/customers/:contactId/debts — Customer 360 debt statistics & unpaid invoices
  app.get('/api/v1/pos/customers/:contactId/debts', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { contactId } = request.params as { contactId: string };
      if (!(await ensureContactVisible(request, reply, contactId))) return;

      const contact = await prisma.contact.findFirst({
        where: { id: contactId, orgId: user.orgId },
        select: { id: true, posCustomerId: true, posCustomerCode: true, fullName: true, crmName: true, phone: true }
      });

      // 1. Query PosCustomerDebt record
      const debtRecord = await prisma.posCustomerDebt.findFirst({
        where: {
          orgId: user.orgId,
          OR: [
            { contactId },
            ...(contact?.posCustomerId ? [{ posCustomerId: contact.posCustomerId }] : [])
          ]
        }
      });

      // 2. Query unpaid invoices
      // Lọc theo số tiền còn nợ, KHÔNG theo chuỗi status: POS trả status tiếng Việt
      // theo luồng giao hàng nên ['Unpaid','Partial','Overdue'] không khớp bản ghi nào.
      // Hoá đơn đã huỷ vẫn giữ remaining_debt nên phải loại, tránh cộng nợ ảo.
      const invoices = await prisma.posInvoice.findMany({
        where: {
          orgId: user.orgId,
          OR: [
            { contactId },
            ...(contact?.posCustomerId ? [{ posCustomerId: contact.posCustomerId }] : [])
          ],
          remainingDebt: { gt: 0 },
          NOT: { status: { in: ['Đã hủy', 'Đã huỷ', 'Cancelled', 'Void'] } },
        },
        orderBy: { invoiceDate: 'desc' }
      });

      let totalDebt = debtRecord ? debtRecord.totalDebt : 0;
      let currentDebt = debtRecord ? debtRecord.currentDebt : 0;
      let overdueDebt = debtRecord ? debtRecord.overdueDebt : 0;
      let dueDate = debtRecord?.dueDate ? debtRecord.dueDate.toISOString() : null;

      // Fallback: If no debtRecord exists, calculate debt from unpaid invoices if available
      if (!debtRecord && invoices.length > 0) {
        totalDebt = invoices.reduce((sum, inv) => sum + inv.remainingDebt, 0);
        currentDebt = totalDebt;
        const now = new Date();
        const overdueInvoices = invoices.filter(inv => inv.dueDate && inv.dueDate < now);
        overdueDebt = overdueInvoices.reduce((sum, inv) => sum + inv.remainingDebt, 0);
      }

      // Calculate status
      const status: 'Normal' | 'Warning' | 'Danger' = overdueDebt > 0 || totalDebt >= 5000000
        ? 'Danger'
        : totalDebt > 0
          ? 'Warning'
          : 'Normal';

      const customerName = contact?.fullName || contact?.crmName || debtRecord?.customerName || 'Quý khách';
      const customerCodeStr = (contact?.posCustomerCode || debtRecord?.posCustomerCode) ? ` (Mã KH: ${contact?.posCustomerCode || debtRecord?.posCustomerCode})` : '';
      const totalStr = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(totalDebt);
      const overdueStr = overdueDebt > 0 ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(overdueDebt) : '0 đ';
      const dueDateStr = dueDate ? new Date(dueDate).toLocaleDateString('vi-VN') : '—';

      const quickReminderText = `Xin chào ${customerName}${customerCodeStr},\nCRM Hi Sweetie xin gửi thông tin công nợ tính đến hiện tại:\n- Tổng công nợ: ${totalStr}\n- Nợ quá hạn: ${overdueStr}\n- Hạn thanh toán: ${dueDateStr}\n\nQuý khách vui lòng kiểm tra và thanh toán sớm giúp Shop. Xin cảm ơn!`;

      return {
        success: true,
        data: {
          contactId,
          posCustomerId: contact?.posCustomerId || debtRecord?.posCustomerId || null,
          posCustomerCode: contact?.posCustomerCode || debtRecord?.posCustomerCode || null,
          customerName,
          customerPhone: contact?.phone || debtRecord?.customerPhone || '',
          totalDebt,
          currentDebt,
          overdueDebt,
          dueDate,
          status,
          isThresholdBreached: totalDebt >= 5000000 || overdueDebt > 0,
          debtThreshold: 5000000,
          quickReminderText,
          invoices: invoices.map(inv => ({
            id: inv.id,
            posInvoiceId: inv.posInvoiceId,
            invoiceCode: inv.invoiceCode,
            totalAmount: inv.totalAmount,
            paidAmount: inv.paidAmount,
            remainingDebt: inv.remainingDebt,
            status: inv.status,
            invoiceDate: inv.invoiceDate ? inv.invoiceDate.toISOString() : null,
            dueDate: inv.dueDate ? inv.dueDate.toISOString() : null,
          })),
          lastSyncedAt: debtRecord?.lastSyncedAt ? debtRecord.lastSyncedAt.toISOString() : new Date().toISOString(),
        }
      };
    } catch (err: any) {
      logger.error('[pos-routes] Fetch customer debts failed:', err);
      return reply.status(500).send({ error: 'Failed to fetch customer debts' });
    }
  });

  // GET /api/v1/pos/inventory — Branch Inventory lookup across store branches
  app.get('/api/v1/pos/inventory', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const query = request.query as any;

      const keyword = (query.keyword || '').trim();
      const branchId = query.branchId ? parseInt(query.branchId) : null;
      const status = query.status;
      const limit = parseInt(query.limit) || 50;

      const where: any = { orgId: user.orgId };

      if (keyword) {
        where.OR = [
          { productName: { contains: keyword, mode: 'insensitive' } },
          { productCode: { contains: keyword, mode: 'insensitive' } },
        ];
      }

      if (branchId && !isNaN(branchId)) {
        where.branchId = branchId;
      }

      if (status) {
        where.status = status;
      }

      const items = await prisma.posBranchInventory.findMany({
        where,
        take: limit,
        orderBy: [{ productName: 'asc' }, { branchName: 'asc' }],
      });

      const formattedItems = items.map(item => ({
        id: item.id,
        posProductId: item.posProductId,
        productCode: item.productCode,
        productName: item.productName,
        branchId: item.branchId,
        branchName: item.branchName,
        onHand: item.onHand,
        reserved: item.reserved,
        available: item.available ?? (item.onHand - item.reserved),
        minStockLevel: item.minStockLevel,
        status: item.status,
        lastSyncedAt: item.lastSyncedAt ? item.lastSyncedAt.toISOString() : null,
      }));

      return {
        success: true,
        data: {
          items: formattedItems,
          total: formattedItems.length,
          nextCursor: null,
        },
        items: formattedItems,
      };
    } catch (err: any) {
      logger.error('[pos-routes] Fetch branch inventory failed:', err);
      return reply.status(500).send({ error: 'Failed to fetch branch inventory' });
    }
  });

  // GET /api/v1/pos/inventory/product — Tồn kho 1 sản phẩm theo chi nhánh (từ CRM DB, không gọi MCP-POS)
  app.get('/api/v1/pos/inventory/product', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const query = request.query as any;

      const productId = query.productId ? parseInt(query.productId) : null;
      const branchId = query.branchId ? parseInt(query.branchId) : null;

      if (!productId || isNaN(productId)) {
        return reply.status(400).send({ error: 'productId là bắt buộc' });
      }

      const where: any = { orgId: user.orgId, posProductId: productId };
      if (branchId && !isNaN(branchId)) {
        where.branchId = branchId;
      }

      const records = await prisma.posBranchInventory.findMany({ where });

      if (records.length === 0) {
        // Không có record → trả Unknown thay vì coi là OutOfStock
        return {
          success: true,
          data: {
            posProductId: productId,
            branchId: branchId ?? null,
            branchName: null,
            onHand: null,
            available: null,
            reserved: null,
            status: 'Unknown',
            lastSyncedAt: null,
          },
        };
      }

      if (branchId && !isNaN(branchId)) {
        // Trả đúng chi nhánh
        const r = records[0];
        return {
          success: true,
          data: {
            posProductId: r.posProductId,
            branchId: r.branchId,
            branchName: r.branchName,
            onHand: r.onHand,
            available: r.available ?? (r.onHand - r.reserved),
            reserved: r.reserved,
            minStockLevel: r.minStockLevel,
            status: r.status ?? 'InStock',
            lastSyncedAt: r.lastSyncedAt ? r.lastSyncedAt.toISOString() : null,
          },
        };
      }

      // Không có branchId → tổng hợp tất cả chi nhánh
      const totalOnHand = records.reduce((s, r) => s + r.onHand, 0);
      const totalAvailable = records.reduce((s, r) => s + (r.available ?? (r.onHand - r.reserved)), 0);
      const aggregateStatus = totalAvailable <= 0 ? 'OutOfStock' : (records.some(r => r.status === 'LowStock') ? 'LowStock' : 'InStock');

      return {
        success: true,
        data: {
          posProductId: productId,
          branchId: null,
          branchName: `Tổng ${records.length} chi nhánh`,
          onHand: totalOnHand,
          available: totalAvailable,
          reserved: records.reduce((s, r) => s + r.reserved, 0),
          minStockLevel: null,
          status: aggregateStatus,
          lastSyncedAt: records[0].lastSyncedAt ? records[0].lastSyncedAt.toISOString() : null,
          branches: records.map(r => ({
            branchId: r.branchId,
            branchName: r.branchName,
            onHand: r.onHand,
            available: r.available,
            status: r.status,
          })),
        },
      };
    } catch (err: any) {
      logger.error('[pos-routes] Fetch product inventory failed:', err);
      return reply.status(500).send({ error: 'Failed to fetch product inventory' });
    }
  });

  // GET /api/v1/pos/orders/price-history — Lịch sử giá bán của khách hàng cho 1 sản phẩm (từ CRM DB)
  app.get('/api/v1/pos/orders/price-history', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const query = request.query as any;

      const posCustomerId = query.posCustomerId ? parseInt(query.posCustomerId) : null;
      const posProductId = query.posProductId ? parseInt(query.posProductId) : null;
      const limit = Math.min(parseInt(query.limit) || 5, 10);

      if (!posCustomerId || isNaN(posCustomerId) || !posProductId || isNaN(posProductId)) {
        return reply.status(400).send({ error: 'posCustomerId và posProductId là bắt buộc' });
      }

      // Query pos_order_items JOIN pos_orders lọc theo customerId + productId
      const items = await prisma.posOrderItem.findMany({
        where: {
          posProductId,
          order: {
            orgId: user.orgId,
            posCustomerId,
          },
        },
        include: {
          order: {
            select: {
              code: true,
              orderDate: true,
              branchName: true,
              status: true,
            },
          },
        },
        orderBy: {
          order: { orderDate: 'desc' },
        },
        take: limit,
      });

      const history = items.map(item => ({
        orderCode: item.order.code,
        orderDate: item.order.orderDate ? item.order.orderDate.toISOString() : null,
        branchName: item.order.branchName ?? null,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: item.discount,
        totalPrice: item.totalPrice,
        isGift: item.unitPrice === 0 && item.discount === 0,
      }));

      return {
        success: true,
        data: history,
        total: history.length,
      };
    } catch (err: any) {
      logger.error('[pos-routes] Fetch price history failed:', err);
      return reply.status(500).send({ error: 'Failed to fetch price history' });
    }
  });

  // GET /api/v1/pos/sync-status — Realtime POS sync status indicator for Admin and users
  app.get('/api/v1/pos/sync-status', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;

      const activeJob = await prisma.syncJob.findFirst({
        where: {
          orgId: user.orgId,
          status: { in: ['Pending', 'Running'] }
        },
        orderBy: { createdAt: 'desc' }
      });

      const recentJobs = await prisma.syncJob.findMany({
        where: { orgId: user.orgId },
        orderBy: { createdAt: 'desc' },
        take: 10
      });

      const lastCompletedJob = await prisma.syncJob.findFirst({
        where: {
          orgId: user.orgId,
          status: 'Completed'
        },
        orderBy: { endTime: 'desc' }
      });

      const entities = ['Customer', 'Product', 'Order', 'Invoice', 'BranchInventory'];
      const entityStatusMap: Record<string, { lastSyncedAt: string | null; status: string }> = {};

      for (const entity of entities) {
        const lastEntityJob = recentJobs.find(j => j.entity === entity);
        entityStatusMap[entity] = {
          lastSyncedAt: lastEntityJob?.endTime ? lastEntityJob.endTime.toISOString() : null,
          status: lastEntityJob?.status || 'Idle',
        };
      }

      return {
        success: true,
        data: {
          isSyncing: !!activeJob,
          lastSyncedAt: lastCompletedJob?.endTime ? lastCompletedJob.endTime.toISOString() : null,
          activeJob: activeJob ? {
            id: activeJob.id,
            entity: activeJob.entity,
            status: activeJob.status,
            total: activeJob.total,
            processed: activeJob.processed,
            percent: activeJob.total > 0 ? Math.min(Math.round((activeJob.processed / activeJob.total) * 100), 100) : 0,
            startTime: activeJob.startTime.toISOString(),
          } : null,
          entities: entityStatusMap,
          recentJobs: recentJobs.map(job => ({
            id: job.id,
            entity: job.entity,
            status: job.status,
            total: job.total,
            processed: job.processed,
            errorCount: job.errorCount,
            lastError: job.lastError,
            startTime: job.startTime.toISOString(),
            endTime: job.endTime ? job.endTime.toISOString() : null,
          })),
        }
      };
    } catch (err: any) {
      logger.error('[pos-routes] Fetch sync status failed:', err);
      return reply.status(500).send({ error: 'Failed to fetch sync status' });
    }
  });
}

