import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { assertContactVisible, getContactScope } from './contact-scope.js';

const CANCELLED_INVOICE_STATUSES = ['Đã hủy', 'Đã huỷ', 'Cancelled', 'Void'];
/** POS trả status tiếng Việt; giữ cả biến thể dấu và bản tiếng Anh cho chắc. */
const CANCELLED_ORDER_STATUSES = ['Đã hủy', 'Đã huỷ', 'Cancelled', 'Void'];

/**
 * Công nợ tính theo SỐ TIỀN còn lại, không theo chuỗi `status`: POS trả status
 * tiếng Việt theo luồng giao hàng ("Hoàn thành", "Đang xử lý", "Giao thành công"…)
 * nên lọc theo ['Unpaid','Partial','Overdue'] sẽ không khớp bản ghi nào.
 * Hoá đơn đã huỷ vẫn giữ nguyên remaining_debt trong POS nên phải loại trừ,
 * nếu không sẽ cộng ra khoản nợ không có thật.
 */
function unpaidInvoiceWhere(base: Record<string, unknown>) {
  return {
    ...base,
    remainingDebt: { gt: 0 },
    NOT: { status: { in: CANCELLED_INVOICE_STATUSES } },
  };
}

/* ── Tín hiệu hành trình khách hàng ──────────────────────────────────────────
 * Tính TOÀN BỘ từ dữ liệu đơn hàng đã đồng bộ — không ai phải nhập tay.
 * Ngưỡng "ngưng mua" chốt với chủ doanh nghiệp: 30 ngày không đặt lại là bất
 * thường (cấp sản phẩm: từng mua ≥3 đơn rồi vắng → gợi ý chào lại).
 */
const QUIET_DAYS_THRESHOLD = 30;
const NEW_PRODUCT_WINDOW_DAYS = 90;

async function buildJourneySignals(
  orgId: string,
  contactId: string,
  posCustomerId: number | null,
): Promise<JourneySignals> {
  // Liên kết qua contactId HOẶC posCustomerId — cùng logic với phần commerce.
  const orderLink = posCustomerId != null
    ? 'o.org_id = $1 AND (o.contact_id = $2 OR o.pos_customer_id = $3)'
    : 'o.org_id = $1 AND o.contact_id = $2';
  const invoiceLink = posCustomerId != null
    ? 'org_id = $1 AND (contact_id = $2 OR pos_customer_id = $3)'
    : 'org_id = $1 AND contact_id = $2';
  const params: (string | number)[] = posCustomerId != null
    ? [orgId, contactId, posCustomerId]
    : [orgId, contactId];

  const [statsRows, trendRows, churnedRows, newRows, agingRows] = await Promise.all([
    prisma.$queryRawUnsafe<any[]>(`
      SELECT min(o.order_date) AS first_order,
             max(o.order_date) AS last_order,
             count(*)::int AS orders,
             avg(o.final_amount)::float AS avg_amount
        FROM pos_orders o
       WHERE ${orderLink} AND o.status NOT IN ('Đã hủy', 'Đã huỷ', 'Cancelled', 'Void')`, ...params),
    prisma.$queryRawUnsafe<any[]>(`
      SELECT to_char(o.order_date, 'YYYY-MM') AS month,
             count(*)::int AS orders,
             sum(o.final_amount)::float AS revenue
        FROM pos_orders o
       WHERE ${orderLink} AND o.status NOT IN ('Đã hủy', 'Đã huỷ', 'Cancelled', 'Void')
         AND o.order_date >= now() - interval '7 months'
       GROUP BY 1 ORDER BY 1 DESC LIMIT 6`, ...params),
    prisma.$queryRawUnsafe<any[]>(`
      SELECT i.product_name AS "productName",
             sum(i.quantity)::int AS quantity,
             count(DISTINCT o.id)::int AS "orderCount",
             max(o.order_date) AS "lastPurchasedAt",
             (CURRENT_DATE - max(o.order_date)::date)::int AS "quietDays"
        FROM pos_order_items i
        JOIN pos_orders o ON o.id = i.pos_order_id
       WHERE ${orderLink} AND o.status NOT IN ('Đã hủy', 'Đã huỷ', 'Cancelled', 'Void')
       GROUP BY i.product_name
      HAVING count(DISTINCT o.id) >= 3
         AND max(o.order_date) < now() - interval '${QUIET_DAYS_THRESHOLD} days'
       ORDER BY max(o.order_date) ASC
       LIMIT 8`, ...params),
    prisma.$queryRawUnsafe<any[]>(`
      SELECT i.product_name AS "productName",
             min(o.order_date) AS "firstPurchasedAt",
             count(DISTINCT o.id)::int AS "orderCount"
        FROM pos_order_items i
        JOIN pos_orders o ON o.id = i.pos_order_id
       WHERE ${orderLink} AND o.status NOT IN ('Đã hủy', 'Đã huỷ', 'Cancelled', 'Void')
       GROUP BY i.product_name
      HAVING min(o.order_date) >= now() - interval '${NEW_PRODUCT_WINDOW_DAYS} days'
       ORDER BY min(o.order_date) DESC
       LIMIT 8`, ...params),
    prisma.$queryRawUnsafe<any[]>(`
      SELECT CASE
               WHEN CURRENT_DATE - invoice_date::date <= 30 THEN '0-30'
               WHEN CURRENT_DATE - invoice_date::date <= 60 THEN '31-60'
               WHEN CURRENT_DATE - invoice_date::date <= 90 THEN '61-90'
               ELSE '90+'
             END AS bucket,
             count(*)::int AS invoices,
             sum(remaining_debt)::float AS debt
        FROM pos_invoices
       WHERE ${invoiceLink} AND remaining_debt > 0
         AND status NOT IN ('Đã hủy', 'Đã huỷ', 'Cancelled', 'Void')
       GROUP BY 1 ORDER BY 1`, ...params),
  ]);

  const stats = statsRows[0] ?? {};
  const trend = trendRows.map((r) => ({ month: r.month, orders: Number(r.orders), revenue: r.revenue ?? 0 }));
  const churnedProducts = churnedRows.map((r) => ({
    productName: r.productName,
    quantity: Number(r.quantity),
    orderCount: Number(r.orderCount),
    lastPurchasedAt: r.lastPurchasedAt,
    quietDays: Number(r.quietDays),
  }));

  return {
    firstOrderAt: stats.first_order ?? null,
    lastOrderAt: stats.last_order ?? null,
    tenureDays: stats.first_order
      ? Math.floor((Date.now() - new Date(stats.first_order).getTime()) / 86_400_000)
      : null,
    totalOrders: Number(stats.orders ?? 0),
    avgOrderValue: stats.avg_amount ?? 0,
    monthlyTrend: trend,
    churnedProducts,
    newProducts: newRows.map((r) => ({
      productName: r.productName,
      firstPurchasedAt: r.firstPurchasedAt,
      orderCount: Number(r.orderCount),
    })),
    debtAging: agingRows.map((r) => ({ bucket: r.bucket, invoices: Number(r.invoices), debt: r.debt ?? 0 })),
    thresholds: { quietDays: QUIET_DAYS_THRESHOLD, newProductDays: NEW_PRODUCT_WINDOW_DAYS },
  };
}

interface JourneySignals {
  firstOrderAt: Date | null;
  lastOrderAt: Date | null;
  tenureDays: number | null;
  totalOrders: number;
  avgOrderValue: number;
  monthlyTrend: Array<{ month: string; orders: number; revenue: number }>;
  churnedProducts: Array<{ productName: string; quantity: number; orderCount: number; lastPurchasedAt: Date; quietDays: number }>;
  newProducts: Array<{ productName: string; firstPurchasedAt: Date; orderCount: number }>;
  debtAging: Array<{ bucket: string; invoices: number; debt: number }>;
  thresholds: { quietDays: number; newProductDays: number };
}

const userSummary = { select: { id: true, fullName: true, email: true } } as const;

function boundedLimit(value: unknown, fallback = 10): number {
  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), 1), 50);
}

function summarizePurchasedProducts(orders: Array<{
  id: string;
  code: string;
  orderDate: Date;
  branchName: string | null;
  items: Array<{ posProductId: number | null; productCode: string | null; productName: string; quantity: number; totalPrice: number }>;
}>) {
  const products = new Map<string, {
    key: string; posProductId: number | null; productCode: string | null; productName: string;
    quantity: number; orderIds: Set<string>; grossRevenue: number; firstPurchasedAt: Date; lastPurchasedAt: Date;
    lastOrder: { id: string; code: string; orderDate: Date; branchName: string | null };
  }>();

  for (const order of orders) {
    for (const item of order.items) {
      const key = item.posProductId !== null
        ? `product:${item.posProductId}`
        : `code:${item.productCode || item.productName.trim().toLowerCase()}`;
      const current = products.get(key);
      if (current) {
        current.quantity += item.quantity;
        current.grossRevenue += item.totalPrice;
        current.orderIds.add(order.id);
        if (order.orderDate < current.firstPurchasedAt) current.firstPurchasedAt = order.orderDate;
        if (order.orderDate > current.lastPurchasedAt) {
          current.lastPurchasedAt = order.orderDate;
          current.lastOrder = { id: order.id, code: order.code, orderDate: order.orderDate, branchName: order.branchName };
        }
      } else {
        products.set(key, {
          key, posProductId: item.posProductId, productCode: item.productCode, productName: item.productName,
          quantity: item.quantity, orderIds: new Set([order.id]), grossRevenue: item.totalPrice,
          firstPurchasedAt: order.orderDate, lastPurchasedAt: order.orderDate,
          lastOrder: { id: order.id, code: order.code, orderDate: order.orderDate, branchName: order.branchName },
        });
      }
    }
  }

  return [...products.values()]
    .map(({ orderIds, ...product }) => ({ ...product, orderCount: orderIds.size }))
    .sort((a, b) => b.lastPurchasedAt.getTime() - a.lastPurchasedAt.getTime() || b.grossRevenue - a.grossRevenue)
    .slice(0, 8);
}

function buildRecentTimeline(args: {
  appointments: Array<{ id: string; title: string | null; appointmentDate: Date; status: string; type: string | null }>;
  notes: Array<{ id: string; body: string; createdAt: Date }>;
  tasks: Array<{ id: string; title: string; status: string; dueAt: Date | null; doneAt: Date | null }>;
  tickets: Array<{ id: string; title: string; status: string; priority: string; updatedAt: Date }>;
  orders: Array<{ id: string; code: string; orderDate: Date; finalAmount: number; status: string }>;
}) {
  const items = [
    ...args.appointments.map((item) => ({ type: 'appointment', id: item.id, occurredAt: item.appointmentDate, title: item.title || 'Lịch hẹn', status: item.status, detail: item.type })),
    ...args.notes.map((item) => ({ type: 'note', id: item.id, occurredAt: item.createdAt, title: 'Ghi chú', status: null, detail: item.body })),
    ...args.tasks.map((item) => ({ type: 'task', id: item.id, occurredAt: item.doneAt || item.dueAt || new Date(0), title: item.title, status: item.status, detail: null })),
    ...args.tickets.map((item) => ({ type: 'ticket', id: item.id, occurredAt: item.updatedAt, title: item.title, status: item.status, detail: item.priority })),
    ...args.orders.map((item) => ({ type: 'order', id: item.id, occurredAt: item.orderDate, title: item.code, status: item.status, detail: item.finalAmount })),
  ];
  return items.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime()).slice(0, 10);
}

/**
 * Customer 360 is a contact-scoped read model for the chat sidebar.
 * POS remains authoritative for commerce; CRM owns assignments and service history.
 */
export async function customer360Routes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/contacts/:id/customer-360', {
    config: { contentClass: 'mixed' as const, rbacResource: 'contact' as const, rbacAction: 'access' as const },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id: contactId } = request.params as { id: string };
    const limit = boundedLimit((request.query as { limit?: string }).limit);

    try {
      const visible = await assertContactVisible({
        userId: user.id,
        orgId: user.orgId,
        legacyRole: user.role,
        contactId,
      });
      if (!visible) return reply.status(404).send({ error: 'Contact not found' });

      const contact = await prisma.contact.findFirst({
        where: { id: contactId, orgId: user.orgId },
        select: {
          id: true,
          fullName: true,
          crmName: true,
          phone: true,
          phone2: true,
          phone3: true,
          email: true,
          avatarUrl: true,
          source: true,
          status: true,
          posCustomerId: true,
          posCustomerCode: true,
          posSyncedAt: true,
          assignedUser: userSummary,
          createdAt: true,
          updatedAt: true,
        },
      });
      if (!contact) return reply.status(404).send({ error: 'Contact not found' });

      const posCustomerFilter = contact.posCustomerId
        ? [{ posCustomerId: contact.posCustomerId }]
        : [];
      const linkedCustomerWhere = {
        orgId: user.orgId,
        OR: [{ contactId }, ...posCustomerFilter],
      };

      const [scope, collaborators, appointments, notes, tasks, tickets, orders, recentOrdersForProducts, orderAggregate, debtRecord, unpaidInvoices, debtAggregate, overdueAggregate] = await Promise.all([
        getContactScope(user.id, user.orgId, user.role),
        prisma.contactAccess.findMany({
          where: { orgId: user.orgId, contactId },
          select: { role: true, source: true, createdAt: true, user: userSummary },
          orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
        }),
        prisma.appointment.findMany({
          where: { orgId: user.orgId, contactId },
          select: {
            id: true, title: true, appointmentDate: true, appointmentTime: true,
            durationMin: true, location: true, type: true, status: true, notes: true,
            source: true, assignedUser: userSummary,
          },
          orderBy: { appointmentDate: 'desc' },
          take: limit,
        }),
        prisma.note.findMany({
          where: { orgId: user.orgId, contactId, parentNoteId: null },
          select: { id: true, body: true, createdAt: true, updatedAt: true, author: userSummary },
          orderBy: { createdAt: 'desc' },
          take: limit,
        }),
        prisma.task.findMany({
          where: { orgId: user.orgId, contactId },
          select: {
            id: true, title: true, description: true, status: true, dueAt: true,
            dueHasTime: true, doneAt: true, ticketId: true, sourceMessageId: true,
            assignee: userSummary, createdBy: userSummary, doneBy: userSummary,
          },
          orderBy: [{ status: 'asc' }, { dueAt: 'asc' }],
          take: limit,
        }),
        prisma.ticket.findMany({
          where: { orgId: user.orgId, contactId },
          select: {
            id: true, title: true, summary: true, status: true, priority: true,
            category: true, createdAt: true, updatedAt: true, resolvedAt: true,
            conversationId: true, sourceMessageId: true,
            assignee: userSummary, createdBy: userSummary, resolvedBy: userSummary,
          },
          orderBy: { updatedAt: 'desc' },
          take: limit,
        }),
        prisma.posOrder.findMany({
          where: linkedCustomerWhere,
          select: {
            id: true, posOrderId: true, code: true, branchName: true, finalAmount: true,
            paidAmount: true, debtAmount: true, status: true, paymentStatus: true,
            orderDate: true,
            items: { select: { productName: true, productCode: true, quantity: true, totalPrice: true } },
          },
          orderBy: { orderDate: 'desc' },
          take: limit,
        }),
        prisma.posOrder.findMany({
          where: { ...linkedCustomerWhere, NOT: { status: { in: CANCELLED_ORDER_STATUSES } } },
          select: {
            id: true, code: true, orderDate: true, branchName: true,
            items: { select: { posProductId: true, productName: true, productCode: true, quantity: true, totalPrice: true } },
          },
          orderBy: { orderDate: 'desc' },
          take: 200,
        }),
        prisma.posOrder.aggregate({
          // LTV phải loại đơn đã huỷ, nếu không doanh số bị thổi lên.
          where: { ...linkedCustomerWhere, NOT: { status: { in: CANCELLED_ORDER_STATUSES } } },
          _count: { id: true },
          _sum: { finalAmount: true },
        }),
        prisma.posCustomerDebt.findFirst({
          where: linkedCustomerWhere,
          select: {
            totalDebt: true, currentDebt: true, overdueDebt: true, dueDate: true,
            status: true, lastSyncedAt: true,
          },
          orderBy: { lastSyncedAt: 'desc' },
        }),
        prisma.posInvoice.findMany({
          where: unpaidInvoiceWhere(linkedCustomerWhere),
          select: {
            id: true, posInvoiceId: true, invoiceCode: true, totalAmount: true,
            paidAmount: true, remainingDebt: true, status: true, invoiceDate: true, dueDate: true,
          },
          orderBy: { invoiceDate: 'desc' },
          take: limit,
        }),
        // Tổng nợ phải gộp TOÀN BỘ hoá đơn còn nợ, không chỉ `limit` dòng hiển thị:
        // khách buôn có thể có hàng chục hoá đơn treo, lấy theo trang sẽ báo thiếu nợ.
        prisma.posInvoice.aggregate({
          where: unpaidInvoiceWhere(linkedCustomerWhere),
          _count: { id: true },
          _sum: { remainingDebt: true },
        }),
        prisma.posInvoice.aggregate({
          where: { ...unpaidInvoiceWhere(linkedCustomerWhere), dueDate: { lt: new Date() } },
          _sum: { remainingDebt: true },
        }),
      ]);

      const purchasedProducts = summarizePurchasedProducts(recentOrdersForProducts);
      const recentTimeline = buildRecentTimeline({ appointments, notes, tasks, tickets, orders });
      const invoiceDebt = debtAggregate._sum.remainingDebt ?? 0;
      const totalDebt = debtRecord?.totalDebt ?? invoiceDebt;
      const overdueDebt = debtRecord?.overdueDebt ?? (overdueAggregate._sum.remainingDebt ?? 0);
      const viewerRole = scope.isOrgAdmin
        ? 'admin'
        : scope.primaryContactIds.has(contactId) ? 'primary' : 'collaborator';

      // Hồ sơ phân loại theo Phương án C (2026-08-25):
      //  - Đã liên kết POS → nhóm khách/công ty/MST lấy từ POS (tính lúc đọc, luôn tươi).
      //  - Chưa liên kết → segment = null, hiển thị bằng trạng thái chăm sóc CRM sẵn có.
      const posCustomerRecord = contact.posCustomerId
        ? await prisma.posCustomer.findFirst({
            where: { orgId: user.orgId, posId: contact.posCustomerId },
            select: {
              customerType: true, organization: true, taxCode: true,
              isOrganization: true, assignedSaleName: true,
            },
          })
        : null;
      const mappedSaleUser = posCustomerRecord?.assignedSaleName
        ? await prisma.posSaleMapping.findFirst({
            where: { orgId: user.orgId, posSaleCode: posCustomerRecord.assignedSaleName },
            select: { user: userSummary },
          })
        : null;

      const journey = await buildJourneySignals(user.orgId, contactId, contact.posCustomerId);

      return {
        contact: { ...contact, viewerRole },
        access: { assignedUser: contact.assignedUser, viewerRole, collaborators },
        commerce: {
          posLink: {
            posCustomerId: contact.posCustomerId,
            posCustomerCode: contact.posCustomerCode,
            posSyncedAt: contact.posSyncedAt,
          },
          orders: {
            items: orders,
            total: orderAggregate._count.id,
            lifetimeValue: orderAggregate._sum.finalAmount ?? 0,
            latestOrder: orders[0] ?? null,
          },
          purchasedProducts: {
            items: purchasedProducts,
            scannedOrders: recentOrdersForProducts.length,
            truncated: recentOrdersForProducts.length === 200,
          },
          debt: {
            totalDebt,
            currentDebt: debtRecord?.currentDebt ?? totalDebt,
            overdueDebt,
            dueDate: debtRecord?.dueDate ?? null,
            status: debtRecord?.status ?? (overdueDebt > 0 ? 'Danger' : totalDebt > 0 ? 'Warning' : 'Normal'),
            invoices: unpaidInvoices,
            invoiceCount: debtAggregate._count.id,
            lastSyncedAt: debtRecord?.lastSyncedAt ?? contact.posSyncedAt ?? null,
          },
        },
        profile: {
          linkedToPos: contact.posCustomerId != null,
          segment: posCustomerRecord?.customerType ?? null,
          organization: posCustomerRecord?.organization ?? null,
          taxCode: posCustomerRecord?.taxCode ?? null,
          isOrganization: posCustomerRecord?.isOrganization ?? null,
          posSaleCode: posCustomerRecord?.assignedSaleName ?? null,
          posSaleUser: mappedSaleUser?.user ?? null,
          // Khách chưa liên kết POS → phân loại bằng trạng thái chăm sóc CRM.
          crmStatus: contact.status ?? null,
        },
        journey,
        service: { appointments, notes, tasks, tickets, recentTimeline },
        meta: { limit, generatedAt: new Date().toISOString() },
      };
    } catch (error) {
      logger.error('[customer-360] Read model error:', error);
      return reply.status(500).send({ error: 'Failed to fetch customer 360' });
    }
  });
}
