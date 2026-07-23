import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { PosPaginationService } from '../../shared/mcp/pos-pagination-service.js';
import { syncPosCustomersFromMcp, syncPosProductsFromMcp } from '../../shared/mcp/pos-sync-service.js';
import { getPosMcpClient } from '../../shared/mcp/mcp-client.js';
import { logger } from '../../shared/utils/logger.js';
import { commandDispatcher } from '../../shared/commands/command-dispatcher.js';
import { prisma } from '../../shared/database/prisma-client.js';

// Import để đảm bảo các Commands được đăng ký vào Dispatcher
import './commands/customer-commands.js';
import './commands/order-commands.js';

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

  // GET /api/v1/pos/customers/:id — realtime fetch detailed POS customer profile via MCP
  app.get('/api/v1/pos/customers/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    try {
      const mcpClient = getPosMcpClient();
      const customer = await mcpClient.customers.get(parseInt(id));
      return customer;
    } catch (err: any) {
      logger.error(`[pos-routes] Fetch POS customer detail failed for id ${id}:`, err);
      return reply.status(500).send({ error: err.message || 'Failed to fetch detailed POS customer profile' });
    }
  });

  // POST /api/v1/pos/sync — trigger manual synchronization of products & customers Read Model
  app.post('/api/v1/pos/sync', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      await syncPosProductsFromMcp(user.orgId);
      await syncPosCustomersFromMcp(user.orgId);
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
      const contact = await prisma.contact.findUnique({
        where: { id: contactId },
      });

      if (!contact) {
        return reply.status(404).send({ error: 'Contact not found' });
      }

      const mcpClient = getPosMcpClient();

      // 1. Trường hợp đã liên kết
      if (contact.posCustomerId) {
        try {
          const customerProfile = await mcpClient.customers.get(contact.posCustomerId);
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
          const searchRes = await mcpClient.customers.search(contact.phone.trim());
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
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { contactId } = request.params as { contactId: string };
        const { posCustomerId, posCustomerCode } = request.body as any;

        const updatedContact = await prisma.contact.update({
          where: { id: contactId },
          data: {
            posCustomerId,
            posCustomerCode: posCustomerCode || null,
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

  // ════════════════════════════════════════════════════════════════════════
  // ORDER ENDPOINTS
  // ════════════════════════════════════════════════════════════════════════

  // GET /api/v1/pos/branches — Lấy danh sách chi nhánh POS
  app.get('/api/v1/pos/branches', async (request: FastifyRequest, reply: FastifyReply) => {
    logger.info('[pos-routes] GET /api/v1/pos/branches called');
    try {
      const mcpClient = getPosMcpClient();
      const res = await mcpClient.branches.list();
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
}
