import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { normalizePhone, phoneVariants } from '../../shared/utils/phone.js';
import { getPosMcpClient } from '../../shared/mcp/mcp-client.js';

export async function contactPosRoutes(app: FastifyInstance): Promise<void> {
  // Require auth middleware
  app.addHook('preHandler', authMiddleware);

  /**
   * GET /api/v1/contacts/:id/pos-suggestions
   * Trả về danh sách Khách hàng POS gợi ý cho 1 Contact CRM
   * Dựa trên SĐT chuẩn hóa (0xxx ↔ 84xxx)
   */
  app.get(
    '/api/v1/contacts/:id/pos-suggestions',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { orgId } = request.authCtx!;
        const { id } = request.params as { id: string };

        const contact = await prisma.contact.findUnique({
          where: { id },
          select: {
            id: true,
            phone: true,
            phone2: true,
            phone3: true,
            phoneNormalized: true,
            posCustomerId: true,
            posCustomerCode: true,
          },
        });

        if (!contact) {
          return reply.status(404).send({ error: 'Không tìm thấy Contact' });
        }

        // Collect all phones associated with the contact
        const rawPhones = [contact.phone, contact.phone2, contact.phone3].filter(Boolean) as string[];
        const normalizedPhones = new Set<string>();
        if (contact.phoneNormalized) {
          normalizedPhones.add(contact.phoneNormalized);
        }
        for (const p of rawPhones) {
          const norm = normalizePhone(p);
          if (norm) normalizedPhones.add(norm);
          const vars = phoneVariants(p);
          for (const v of vars) {
            const vNorm = normalizePhone(v);
            if (vNorm) normalizedPhones.add(vNorm);
          }
        }

        const phoneList = Array.from(normalizedPhones);
        if (phoneList.length === 0 && !contact.posCustomerId) {
          return { suggestions: [], linked: !!contact.posCustomerId };
        }

        // Search local pos_customers by phone variants
        const posCustomers = await prisma.posCustomer.findMany({
          where: {
            orgId,
            OR: [
              { phone: { in: phoneList } },
              ...phoneList.map((p) => ({ phone: { contains: p.replace(/^84/, '') } })),
              ...phoneList.map((p) => ({ phone: { contains: p } })),
            ],
          },
          take: 10,
        });

        // Map suggestions
        const suggestions = posCustomers.map((cust) => ({
          posCustomerId: cust.posId,
          posCustomerCode: cust.code,
          name: cust.name,
          phone: cust.phone,
          address: cust.address,
          customerType: cust.customerType,
          assignedSaleName: cust.assignedSaleName,
          alreadyLinked: contact.posCustomerId === cust.posId,
        }));

        // If no local pos_customers match and we have phone numbers, fallback to searching via POS MCP API
        if (suggestions.length === 0 && phoneList.length > 0) {
          try {
            const mcpClient = getPosMcpClient();
            for (const phoneSearch of phoneList) {
              const res = await mcpClient.customers.search(phoneSearch);
              const mcpCusts = (res as any).data || (res as any).customers || [];
              if (Array.isArray(mcpCusts) && mcpCusts.length > 0) {
                for (const c of mcpCusts) {
                  suggestions.push({
                    posCustomerId: Number(c.id),
                    posCustomerCode: c.code || null,
                    name: c.name || '',
                    phone: c.phone || c.contactNumber || null,
                    address: c.addresses?.[0]?.address || c.address || null,
                    customerType: typeof c.customerType === 'string' ? c.customerType : c.customerType?.name || null,
                    assignedSaleName: c.misaEmployeeName || c.createdBy || null,
                    alreadyLinked: contact.posCustomerId === Number(c.id),
                  });
                }
              }
            }
          } catch (mcpErr: any) {
            logger.warn(`[contact-pos] MCP customer search fallback warning: ${mcpErr.message || mcpErr}`);
          }
        }

        return {
          contactId: contact.id,
          posCustomerId: contact.posCustomerId,
          posCustomerCode: contact.posCustomerCode,
          suggestions,
        };
      } catch (err: any) {
        logger.error('[contact-pos] Fetch POS suggestions failed:', err);
        return reply.status(500).send({ error: 'Lỗi khi lấy gợi ý liên kết POS' });
      }
    }
  );

  /**
   * POST /api/v1/contacts/:id/link-pos
   * Xác nhận liên kết 1-1 giữa Contact CRM và POS Customer
   * Lưu posCustomerId + posCustomerCode vào Contact, và gắn nối toàn bộ đơn hàng/hóa đơn POS
   */
  app.post(
    '/api/v1/contacts/:id/link-pos',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { orgId } = request.authCtx!;
        const { id } = request.params as { id: string };
        const body = request.body as { posCustomerId: number; posCustomerCode?: string };

        if (!body.posCustomerId) {
          return reply.status(400).send({ error: 'posCustomerId là bắt buộc' });
        }

        const posCustomerId = Number(body.posCustomerId);

        // Fetch contact
        const contact = await prisma.contact.findUnique({
          where: { id },
        });

        if (!contact || contact.orgId !== orgId) {
          return reply.status(404).send({ error: 'Không tìm thấy Contact' });
        }

        // Update Contact with posCustomerId and posCustomerCode
        const updatedContact = await prisma.contact.update({
          where: { id },
          data: {
            posCustomerId,
            posCustomerCode: body.posCustomerCode || contact.posCustomerCode,
          },
        });

        // Link existing pos_orders for this customer to this contact
        const orderLinkResult = await prisma.$executeRawUnsafe(
          `UPDATE pos_orders SET contact_id = $1 WHERE org_id = $2 AND pos_customer_id = $3`,
          id,
          orgId,
          posCustomerId
        );

        logger.info(
          `[contact-pos] Linked Contact ${id} to POS Customer ${posCustomerId} (code: ${body.posCustomerCode}). Linked orders: ${orderLinkResult}`
        );

        return {
          success: true,
          contact: {
            id: updatedContact.id,
            posCustomerId: updatedContact.posCustomerId,
            posCustomerCode: updatedContact.posCustomerCode,
          },
          linkedOrdersCount: orderLinkResult,
        };
      } catch (err: any) {
        logger.error('[contact-pos] Link POS customer failed:', err);
        return reply.status(500).send({ error: 'Lỗi khi xác nhận liên kết POS' });
      }
    }
  );
}
