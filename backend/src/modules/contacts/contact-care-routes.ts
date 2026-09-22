/**
 * Contact care fields — append-only notes for products, workshops, and complaints.
 * The drawer uses one current value per category, while the API retains every change.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { assertContactEditable, assertContactVisible } from './contact-scope.js';
import { logger } from '../../shared/utils/logger.js';

const MAX_VALUE_LENGTH = 5000;
const MAX_DERIVED_PRODUCTS = 5;
// Đơn gần nhất có >= 5 SẢN PHẨM KHÁC NHAU thì xếp theo số lượng thay vì theo thời gian.
const QUANTITY_RANK_MIN_PRODUCTS = 5;
// Mặc định 2 tháng theo yêu cầu nghiệp vụ. Cho phép nới qua env để test trên
// database dev có dữ liệu đơn cũ; giá trị ngoài 1-120 bị coi là sai và rơi về 2.
const DEFAULT_INTEREST_WINDOW_MONTHS = 2;
// POS ghi status lẫn lộn hoa/thường và Việt/Anh (thật: 'cancelled' 3313 đơn, 'Đã hủy', 'Cancelled'…).
// So khớp KHÔNG phân biệt hoa thường, nếu bỏ sót 'cancelled' thường sẽ tính đơn huỷ như đã mua.
const CANCELLED_STATUSES_LOWER = ['đã hủy', 'đã huỷ', 'cancelled', 'void'];
const CANCELLED_SQL = CANCELLED_STATUSES_LOWER.map((s) => `'${s}'`).join(', ');

export function resolveWindowMonths(): number {
  const raw = Number.parseInt(process.env.CARE_PRODUCT_WINDOW_MONTHS ?? '', 10);
  if (!Number.isFinite(raw) || raw < 1 || raw > 120) return DEFAULT_INTEREST_WINDOW_MONTHS;
  return raw;
}

const INTEREST_WINDOW_MONTHS = resolveWindowMonths();

// Một bộ lọc duy nhất cho cả đường suy diễn lẫn đường debug: nếu debug hiện ra nguồn
// mà đường thật đã loại, endpoint dùng để soi lỗi trở thành chỗ gây hiểu lầm.
const QUALIFYING_SQL = `lower(o.status) NOT IN (${CANCELLED_SQL})
       AND lower(inv.status) NOT IN (${CANCELLED_SQL})
       AND o.order_date >= now() - interval '${INTEREST_WINDOW_MONTHS} months'`;

// Nối invoice qua pos_order_id dạng SỐ vì sync không ghi pos_order_uuid, nên quan hệ
// Prisma PosInvoice.order luôn null trên dữ liệu thật.
const POS_JOIN_SQL = `FROM pos_order_items i
      JOIN pos_orders o ON o.id = i.pos_order_id
      JOIN pos_invoices inv ON inv.org_id = o.org_id AND inv.pos_order_id = o.pos_order_id`;

type CareBody = {
  productInterest?: unknown;
  workshopsAttended?: unknown;
  complaints?: unknown;
};

type PurchasedLine = {
  posProductId: number | null;
  productCode: string | null;
  productName: string;
  quantity: number;
  orderId: string;
  orderDate: Date | string;
};

export type DerivedInterests = {
  products: string[];
  rankedBy: 'recency' | 'quantity';
  latestOrderProductCount: number;
};

// Cùng một khoá định danh cho cả gộp số lượng lẫn đếm sản phẩm của đơn gần nhất,
// để hai phép tính không thể lệch nhau. Cùng bậc với customer-360.
function productKey(line: PurchasedLine): string {
  const name = line.productName?.trim() ?? '';
  return line.posProductId != null
    ? `product:${line.posProductId}`
    : `code:${line.productCode?.trim() || name.toLowerCase()}`;
}

function lineTime(line: PurchasedLine): number {
  return new Date(line.orderDate as string | Date).getTime() || 0;
}

/**
 * Xếp hạng: mặc định theo lần mua gần nhất. Nếu đơn gần nhất có >= 5 sản phẩm
 * khác nhau thì xếp theo TỔNG số lượng trong cả cửa sổ (gần nhất làm tiebreak),
 * vì đơn nhiều mặt hàng cho biết khách buôn đang tập trung vào món nào.
 */
export function deriveProductInterests(
  lines: PurchasedLine[],
  limit = MAX_DERIVED_PRODUCTS,
): DerivedInterests {
  const totals = new Map<string, { name: string; quantity: number; lastPurchasedAt: number }>();
  // Nhóm theo đơn để đếm đúng số mặt hàng của MỘT đơn gần nhất, không gộp các đơn
  // trùng order_date (ngày trùng nhau là chuyện thường ở POS).
  const orders = new Map<string, { at: number; keys: Set<string> }>();

  for (const line of lines) {
    const name = line.productName?.trim();
    if (!name) continue;
    const key = productKey(line);
    const at = lineTime(line);

    const cur = totals.get(key);
    if (cur) {
      cur.quantity += Number(line.quantity) || 0;
      // POS đổi tên sản phẩm theo thời gian — giữ tên của lần mua mới nhất,
      // nếu giữ tên gặp đầu tiên thì khách sẽ thấy tên cũ đã bỏ.
      if (at >= cur.lastPurchasedAt) {
        cur.lastPurchasedAt = at;
        cur.name = name;
      }
    } else {
      totals.set(key, { name, quantity: Number(line.quantity) || 0, lastPurchasedAt: at });
    }

    const orderId = line.orderId ?? '';
    const order = orders.get(orderId);
    if (order) {
      order.keys.add(key);
      if (at > order.at) order.at = at;
    } else {
      orders.set(orderId, { at, keys: new Set([key]) });
    }
  }

  // Đơn gần nhất = đơn có order_date mới nhất. Nhiều đơn trùng ngày thì chốt bằng
  // orderId để kết quả ổn định, không phụ thuộc thứ tự dòng DB trả về.
  let latestAt = -1;
  let latestOrderId = '';
  for (const [orderId, order] of orders) {
    if (order.at > latestAt || (order.at === latestAt && orderId > latestOrderId)) {
      latestAt = order.at;
      latestOrderId = orderId;
    }
  }
  const latestOrderProductCount = orders.get(latestOrderId)?.keys.size ?? 0;
  const byQuantity = latestOrderProductCount >= QUANTITY_RANK_MIN_PRODUCTS;

  const ordered = [...totals.values()].sort((a, b) =>
    byQuantity
      ? b.quantity - a.quantity || b.lastPurchasedAt - a.lastPurchasedAt
      : b.lastPurchasedAt - a.lastPurchasedAt || b.quantity - a.quantity,
  );

  // Khử trùng theo tên lần cuối: cùng một sản phẩm có thể rơi vào hai bậc định danh.
  const seen = new Set<string>();
  const products: string[] = [];
  for (const product of ordered) {
    const dedupeKey = product.name.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    products.push(product.name);
    if (products.length >= limit) break;
  }
  return { products, rankedBy: byQuantity ? 'quantity' : 'recency', latestOrderProductCount };
}

/**
 * Điều kiện nối Contact -> đơn POS: theo contactId HOẶC posCustomerId, cùng logic
 * customer-360. Khi chưa liên kết POS thì bỏ nhánh posCustomerId để không sinh
 * `pos_customer_id = NULL` làm hỏng cả mệnh đề OR.
 */
function buildOrderLink(posCustomerId: number | null, orgId: string, contactId: string) {
  return posCustomerId != null
    ? { clause: 'o.org_id = $1 AND (o.contact_id = $2 OR o.pos_customer_id = $3)', params: [orgId, contactId, posCustomerId] as (string | number)[] }
    : { clause: 'o.org_id = $1 AND o.contact_id = $2', params: [orgId, contactId] as (string | number)[] };
}

/**
 * Sản phẩm lấy từ đơn CÓ hoá đơn chưa huỷ trong cửa sổ INTEREST_WINDOW_MONTHS.
 * Trả TỪNG DÒNG (không group) vì xếp hạng cần số lượng và số mặt hàng của đơn gần nhất.
 */
async function fetchPurchasedItems(orgId: string, contactId: string, posCustomerId: number | null): Promise<PurchasedLine[]> {
  const { clause, params } = buildOrderLink(posCustomerId, orgId, contactId);

  return prisma.$queryRawUnsafe<PurchasedLine[]>(`
    SELECT DISTINCT ON (i.id)
           i.pos_product_id AS "posProductId",
           i.product_code   AS "productCode",
           i.product_name   AS "productName",
           i.quantity       AS "quantity",
           o.id             AS "orderId",
           o.order_date     AS "orderDate"
      ${POS_JOIN_SQL}
     WHERE ${clause}
       AND ${QUALIFYING_SQL}
     ORDER BY i.id, inv.invoice_date DESC`, ...params);
}

type DebugRow = {
  posProductId: number | null;
  productCode: string | null;
  productName: string;
  orderCode: string;
  orderId: number;
  orderDate: Date;
  orderStatus: string;
  invoiceCode: string;
  invoiceStatus: string;
  quantity: number;
};

/**
 * Trả từng dòng sản phẩm kèm đơn + hoá đơn nguồn, để soi được giá trị suy diễn
 * lấy từ đâu mà không cần mở Prisma Studio. Chỉ đọc, không đổi dữ liệu.
 */
async function fetchDerivedSources(orgId: string, contactId: string, posCustomerId: number | null): Promise<DebugRow[]> {
  const { clause, params } = buildOrderLink(posCustomerId, orgId, contactId);

  return prisma.$queryRawUnsafe<DebugRow[]>(`
    SELECT DISTINCT ON (i.product_name, o.code)
           i.pos_product_id AS "posProductId",
           i.product_code   AS "productCode",
           i.product_name   AS "productName",
           o.code           AS "orderCode",
           o.pos_order_id   AS "orderId",
           o.order_date     AS "orderDate",
           o.status         AS "orderStatus",
           inv.invoice_code AS "invoiceCode",
           inv.status       AS "invoiceStatus",
           i.quantity       AS "quantity"
      ${POS_JOIN_SQL}
     WHERE ${clause}
       AND ${QUALIFYING_SQL}
     ORDER BY i.product_name, o.code, o.order_date DESC`, ...params);
}

function cleanValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length <= MAX_VALUE_LENGTH ? trimmed : undefined;
}

function invalidValue(value: unknown): boolean {
  return value !== undefined && (typeof value !== 'string' || value.trim().length > MAX_VALUE_LENGTH);
}

async function getContactForCare(request: FastifyRequest, reply: FastifyReply, editable: boolean) {
  const user = request.user!;
  const { contactId } = request.params as { contactId: string };
  const visible = await assertContactVisible({
    userId: user.id,
    orgId: user.orgId,
    legacyRole: user.role,
    contactId,
  });
  if (!visible) {
    reply.status(404).send({ error: 'Contact not found' });
    return null;
  }

  const contact = await prisma.contact.findFirst({
    where: { id: contactId, orgId: user.orgId },
    select: { id: true, posCustomerId: true },
  });
  if (!contact) {
    reply.status(404).send({ error: 'Contact not found' });
    return null;
  }

  if (editable) {
    try {
      await assertContactEditable({
        userId: user.id,
        orgId: user.orgId,
        legacyRole: user.role,
        contactId,
      });
    } catch (err: any) {
      reply.status(err?.statusCode ?? 403).send({
        error: err?.code || 'CONTACT_EDIT_FORBIDDEN',
        message: err?.message || 'Không có quyền sửa KH này',
      });
      return null;
    }
  }

  return { user, contactId, posCustomerId: contact.posCustomerId };
}

function careResponse(
  productInterests: Array<{ id: string; value: string; createdByUserId: string | null; createdAt: Date }>,
  workshopsAttended: Array<{ id: string; value: string; attendedAt: Date | null; createdByUserId: string | null; createdAt: Date }>,
  complaints: Array<{ id: string; value: string; createdByUserId: string | null; createdAt: Date }>,
) {
  const currentValue = <T extends { value: string }>(rows: T[]) => rows[0]?.value ?? '';
  return {
    productInterests,
    workshopsAttended,
    complaints,
    current: {
      productInterest: currentValue(productInterests),
      workshopsAttended: currentValue(workshopsAttended),
      complaints: currentValue(complaints),
    },
  };
}

export async function contactCareRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/contacts/:contactId/care-fields', async (request, reply) => {
    try {
      const context = await getContactForCare(request, reply, false);
      if (!context) return;
      const { user, contactId, posCustomerId } = context;
      const [productInterests, workshopsAttended, complaints] = await Promise.all([
        prisma.contactProductInterest.findMany({
          where: { orgId: user.orgId, contactId, value: { not: '' } },
          select: { id: true, value: true, createdByUserId: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.contactWorkshopAttendance.findMany({
          where: { orgId: user.orgId, contactId, value: { not: '' } },
          select: { id: true, value: true, attendedAt: true, createdByUserId: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.contactComplaint.findMany({
          where: { orgId: user.orgId, contactId, value: { not: '' } },
          select: { id: true, value: true, createdByUserId: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

      // Empty latest records are tombstones used to clear the simple V1 input.
      const [latestProduct, latestWorkshop, latestComplaint] = await Promise.all([
        prisma.contactProductInterest.findFirst({ where: { orgId: user.orgId, contactId }, orderBy: { createdAt: 'desc' }, select: { value: true } }),
        prisma.contactWorkshopAttendance.findFirst({ where: { orgId: user.orgId, contactId }, orderBy: { createdAt: 'desc' }, select: { value: true } }),
        prisma.contactComplaint.findFirst({ where: { orgId: user.orgId, contactId }, orderBy: { createdAt: 'desc' }, select: { value: true } }),
      ]);

      // POS là nguồn suy diễn phụ — lỗi truy vấn không được làm sập cả drawer.
      let derived: DerivedInterests = { products: [], rankedBy: 'recency', latestOrderProductCount: 0 };
      try {
        const items = await fetchPurchasedItems(user.orgId, contactId, posCustomerId);
        derived = deriveProductInterests(items);
      } catch (posErr) {
        logger.warn(`[contacts] Derived product interests unavailable for ${contactId}: ${(posErr as Error).message}`);
      }

      return {
        ...careResponse(productInterests, workshopsAttended, complaints),
        current: {
          productInterest: latestProduct?.value ?? '',
          workshopsAttended: latestWorkshop?.value ?? '',
          complaints: latestComplaint?.value ?? '',
        },
        derived: {
          productInterests: derived.products,
          rankedBy: derived.rankedBy,
          latestOrderProductCount: derived.latestOrderProductCount,
          source: 'pos-invoices',
          windowMonths: INTEREST_WINDOW_MONTHS,
          asOf: new Date().toISOString(),
        },
      };
    } catch (err) {
      logger.error('[contacts] Care fields list error:', err);
      return reply.status(500).send({ error: 'Failed to fetch care fields' });
    }
  });

  /**
   * GET /api/v1/contacts/:contactId/care-fields/debug
   * Soi nguồn dữ liệu suy diễn: mỗi sản phẩm kèm đơn + hoá đơn đã sinh ra nó.
   * Chỉ đọc. Trả rỗng khi contact chưa liên kết POS hoặc không có đơn trong cửa sổ.
   */
  app.get('/api/v1/contacts/:contactId/care-fields/debug', async (request, reply) => {
    try {
      const context = await getContactForCare(request, reply, false);
      if (!context) return;
      const { user, contactId, posCustomerId } = context;

      // POS lỗi không được làm sập endpoint soi lỗi — trả rỗng kèm lý do còn hơn 500.
      let sources: DebugRow[] = [];
      let derived: DerivedInterests = { products: [], rankedBy: 'recency', latestOrderProductCount: 0 };
      let posError: string | undefined;
      try {
        // Suy diễn lại bằng chính fetchPurchasedItems của drawer: nếu debug tính từ
        // `sources` (đã DISTINCT theo tên+đơn) thì số lượng cộng dồn sẽ sai và
        // endpoint này sẽ không giải thích được giá trị người dùng đang nhìn thấy.
        const [sourceRows, lines] = await Promise.all([
          fetchDerivedSources(user.orgId, contactId, posCustomerId),
          fetchPurchasedItems(user.orgId, contactId, posCustomerId),
        ]);
        sources = sourceRows;
        derived = deriveProductInterests(lines);
      } catch (err) {
        posError = (err as Error).message;
        logger.warn(`[contacts] Care debug sources unavailable for ${contactId}: ${posError}`);
      }

      return {
        contactId,
        posCustomerId,
        linkedToPos: posCustomerId != null,
        windowMonths: INTEREST_WINDOW_MONTHS,
        derivedProducts: derived.products,
        rankedBy: derived.rankedBy,
        latestOrderProductCount: derived.latestOrderProductCount,
        quantityRankThreshold: QUANTITY_RANK_MIN_PRODUCTS,
        posError,
        sources: sources.map((s) => ({
          productName: s.productName,
          productCode: s.productCode,
          posProductId: s.posProductId,
          orderCode: s.orderCode,
          orderId: s.orderId,
          orderDate: s.orderDate,
          orderStatus: s.orderStatus,
          invoiceCode: s.invoiceCode,
          invoiceStatus: s.invoiceStatus,
          quantity: s.quantity,
        })),
        sourceCount: sources.length,
      };
    } catch (err) {
      logger.error('[contacts] Care fields debug error:', err);
      return reply.status(500).send({ error: 'Failed to fetch care field sources' });
    }
  });

  app.put('/api/v1/contacts/:contactId/care-fields', async (request, reply) => {
    try {
      const context = await getContactForCare(request, reply, true);
      if (!context) return;
      const { user, contactId } = context;
      const body = (request.body ?? {}) as CareBody;
      if (invalidValue(body.productInterest) || invalidValue(body.workshopsAttended) || invalidValue(body.complaints)) {
        return reply.status(400).send({ error: 'Care field must be a string of at most 5000 characters' });
      }
      const productInterest = cleanValue(body.productInterest);
      const workshopsAttended = cleanValue(body.workshopsAttended);
      const complaints = cleanValue(body.complaints);

      await prisma.$transaction(async (tx) => {
        if (productInterest !== undefined) {
          const latest = await tx.contactProductInterest.findFirst({ where: { orgId: user.orgId, contactId }, orderBy: { createdAt: 'desc' }, select: { value: true } });
          if (latest?.value !== productInterest) {
            await tx.contactProductInterest.create({ data: { orgId: user.orgId, contactId, value: productInterest, createdByUserId: user.id } });
          }
        }
        if (workshopsAttended !== undefined) {
          const latest = await tx.contactWorkshopAttendance.findFirst({ where: { orgId: user.orgId, contactId }, orderBy: { createdAt: 'desc' }, select: { value: true } });
          if (latest?.value !== workshopsAttended) {
            await tx.contactWorkshopAttendance.create({ data: { orgId: user.orgId, contactId, value: workshopsAttended, createdByUserId: user.id } });
          }
        }
        if (complaints !== undefined) {
          const latest = await tx.contactComplaint.findFirst({ where: { orgId: user.orgId, contactId }, orderBy: { createdAt: 'desc' }, select: { value: true } });
          if (latest?.value !== complaints) {
            await tx.contactComplaint.create({ data: { orgId: user.orgId, contactId, value: complaints, createdByUserId: user.id } });
          }
        }
      });

      // Reuse the read path's response shape after the transaction, preserving append history.
      const [savedProductInterests, savedWorkshopsAttended, savedComplaints] = await Promise.all([
        prisma.contactProductInterest.findMany({ where: { orgId: user.orgId, contactId, value: { not: '' } }, select: { id: true, value: true, createdByUserId: true, createdAt: true }, orderBy: { createdAt: 'desc' } }),
        prisma.contactWorkshopAttendance.findMany({ where: { orgId: user.orgId, contactId, value: { not: '' } }, select: { id: true, value: true, attendedAt: true, createdByUserId: true, createdAt: true }, orderBy: { createdAt: 'desc' } }),
        prisma.contactComplaint.findMany({ where: { orgId: user.orgId, contactId, value: { not: '' } }, select: { id: true, value: true, createdByUserId: true, createdAt: true }, orderBy: { createdAt: 'desc' } }),
      ]);
      return careResponse(savedProductInterests, savedWorkshopsAttended, savedComplaints);
    } catch (err) {
      logger.error('[contacts] Care fields update error:', err);
      return reply.status(500).send({ error: 'Failed to update care fields' });
    }
  });
}
