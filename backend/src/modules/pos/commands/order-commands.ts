import { Command, CommandHandler, CommandValidator, ValidationResult } from '../../../shared/commands/command.interface.js';
import { commandDispatcher } from '../../../shared/commands/command-dispatcher.js';
import { getHisweetiePublicApiClient } from '../../integrations/hisweetie-public-api-client.js';
import { prisma } from '../../../shared/database/prisma-client.js';
import { logger } from '../../../shared/utils/logger.js';
import { handleMcpError } from '../../../shared/commands/error-handler.js';
import { v4 as uuidv4 } from 'uuid';

// ════════════════════════════════════════════════════════════════════════════
// CreateOrder — Tạo đơn hàng trên POS qua MCP, lưu Read Model cục bộ
// Flow: CRM → MCP → POS (tạo đơn) → POS response → CRM lưu Read Model
// ════════════════════════════════════════════════════════════════════════════

export interface CreateOrderItemInput {
  productId: number;
  productCode: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  note?: string;
}

export interface CreateOrderPayload {
  contactId?: string;         // CRM Contact ID để liên kết
  posCustomerId: number;      // KH POS (bắt buộc)
  branchId: number;           // Chi nhánh POS
  priceBookId?: string;       // Bảng giá áp dụng (standard | wholesale | vip | agency | pos_sync)
  discount?: number;          // Chiết khấu tổng đơn hàng (VNĐ)
  items: CreateOrderItemInput[];
  paidAmount?: number;        // Số tiền đặt cọc/thanh toán ngay
  paymentMethod?: string;     // cash | bank_transfer | card
  description?: string;
  orderStatus?: number;       // 1=Phiếu tạm (mặc định), 2=Đã xác nhận
  // Thông tin giao hàng (MVP placeholder — chưa gửi delivery lên POS)
  delivery?: {
    receiver?: string;
    phone?: string;
    address?: string;
  };
}

export class CreateOrderValidator implements CommandValidator<Command<CreateOrderPayload>> {
  validate(command: Command<CreateOrderPayload>): ValidationResult {
    const { posCustomerId, branchId, items } = command.payload;
    const errors: Record<string, string> = {};

    if (!posCustomerId) {
      errors.posCustomerId = 'Chưa chọn khách hàng POS';
    }
    if (!branchId) {
      errors.branchId = 'Chưa chọn chi nhánh';
    }
    if (!items || items.length === 0) {
      errors.items = 'Đơn hàng phải có ít nhất 1 sản phẩm';
    } else {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item.productId) {
          errors[`items[${i}].productId`] = `Sản phẩm dòng ${i + 1} không hợp lệ`;
        }
        if (!item.quantity || item.quantity <= 0) {
          errors[`items[${i}].quantity`] = `Số lượng dòng ${i + 1} phải > 0`;
        }
        if (item.unitPrice == null || item.unitPrice < 0) {
          errors[`items[${i}].unitPrice`] = `Đơn giá dòng ${i + 1} không hợp lệ`;
        }
      }
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors: Object.keys(errors).length > 0 ? errors : undefined,
    };
  }
}

export class CreateOrderHandler implements CommandHandler<Command<CreateOrderPayload>, any> {
  async handle(command: Command<CreateOrderPayload>, context: { orgId: string; userId: string }): Promise<any> {
    const {
      contactId,
      posCustomerId,
      branchId,
      priceBookId,
      items,
      paidAmount,
      paymentMethod,
      description,
      orderStatus,
    } = command.payload;

    // -------------------------------------------------------------------------
    // [LOGIC BẢNG GIÁ / PRICE BOOK LOGIC & NOTE CẬP NHẬT SAU DÀNH CHO POS API]
    // 1. Mặc định ('standard' - Bảng giá chung):
    //    Đơn giá sản phẩm (unitPrice) sử dụng giá niêm yết nguyên bản (basePrice).
    // 2. Bảng giá cố định cho từng tệp khách ('wholesale', 'vip', 'agency'):
    //    Giao diện CRM đã áp dụng tỉ lệ chiết khấu cố định (15%, 10%, 20%) và truyền unitPrice.
    // 3. Chờ đồng bộ từ POS API ('pos_sync'):
    //    [CẬP NHẬT SAU TRÊN BACKEND KHITHÀNH LẬP POS PRICE BOOK API]:
    //    Khi tích hợp API Bảng giá KiotViet qua MCP (vd: client.priceBooks.get(priceBookId)),
    //    thêm đoạn code tại đây để truy vấn bảng giá thực tế theo kho/chi nhánh từ POS API:
    //    ```ts
    //    if (priceBookId === 'pos_sync' || priceBookId?.startsWith('pos_')) {
    //      // Call MCP Tool lấy giá thực tế từ POS KiotViet:
    //      // const posPriceBook = await mcpClient.priceBooks.getPrice(productId, priceBookId);
    //      // Update unitPrice cho items...
    //    }
    //    ```
    // -------------------------------------------------------------------------

    const api = getHisweetiePublicApiClient();
    const idempotencyKey = uuidv4();

    // 1. Build payload đúng đặc tả Public API (PUBLIC-API.md §6 "Tạo đơn hàng"):
    // {branchId, customerId, items[{productId, quantity, unitPrice}]}.
    // Khuyến mãi do máy chủ POS tính lại — KHÔNG gửi discount/note/priceBookId
    // vì strict validation sẽ 400 các trường lạ.
    const orderItems = items.map(item => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    }));

    let posOrderId: number | undefined;
    let orderCode: string | undefined;
    let orderData: any;

    try {
      logger.info(`[CreateOrderHandler] Creating order on POS for customer ${posCustomerId}, branch ${branchId}, ${items.length} items`);

      const res = await api.createOrder({
        customerId: posCustomerId,
        branchId,
        items: orderItems,
      }, idempotencyKey);

      // Log raw response để debug field name từ POS
      logger.info(`[CreateOrderHandler] POS raw response keys: ${Object.keys(res || {}).join(', ')}`);

      // Public API trả order object kèm `warnings` — data nằm ngay gốc response.
      const rawRes = res as any;
      orderData = rawRes.data?.order ?? rawRes.order ?? rawRes.data ?? rawRes;
      logger.info(`[CreateOrderHandler] orderData.id=${orderData.id}, orderData.code=${orderData.code}`);

      // Thử nhiều field name phổ biến từ KiotViet API
      posOrderId = orderData.id ?? orderData.orderId ?? orderData.Id ?? orderData.order_id;
      orderCode = orderData.code ?? orderData.orderCode ?? orderData.Code ?? `ORD-${posOrderId}`;

      if (!posOrderId) {
        logger.error(`[CreateOrderHandler] orderId not found. orderData keys: ${Object.keys(orderData || {}).join(', ')}`);
        throw new Error(`POS API trả về orderId không hợp lệ. Response keys: ${Object.keys(orderData).join(', ')}`);
      }

      logger.info(`[CreateOrderHandler] POS order created: ${orderCode} (ID: ${posOrderId}) — Trạng thái Phiếu tạm (status=1)`);

      // 3. Tính toán tổng tiền từ items (Read Model)
      const totalAmount = items.reduce((sum, item) => {
        const lineTotal = item.quantity * item.unitPrice - (item.discount || 0);
        return sum + lineTotal;
      }, 0);
      const grandTotal = parseFloat(orderData.grandTotal ?? orderData.total ?? 0) || totalAmount;
      const posDiscount = parseFloat(orderData.discount ?? 0) || 0;

      // STATUS MAP
      const STATUS_MAP: Record<number, string> = { 1: 'Pending', 2: 'Confirmed', 3: 'Processing', 4: 'Done', 5: 'Cancelled' };
      const rawStatus = orderData.statusValue ?? orderData.orderStatus;
      const posOrderStatus = typeof rawStatus === 'string' && rawStatus
        ? rawStatus
        : (STATUS_MAP[orderData.status as number] ?? 'Pending');

      // 4. Lưu Read Model PosOrder + PosOrderDetail
      // Mọi đơn tạo từ CRM Sales Workspace luôn là Phiếu tạm (Draft / Pending), không cọc, nợ = grandTotal
      const posOrder = await prisma.posOrder.create({
        data: {
          posOrderId,
          code: orderCode ?? `ORD-${posOrderId}`,
          posCustomerId: posCustomerId,
          branchId,
          orderDate: new Date(),
          totalAmount,
          discount: posDiscount,
          grandTotal,
          paidAmount: 0,
          debtAmount: grandTotal,
          paymentStatus: 'Draft',
          orderStatus: posOrderStatus,
          description: description || null,
          orgId: context.orgId,
          contactId: contactId || null,
          createdByUserId: context.userId,
          items: {
            create: items.map(item => ({
              posProductId: item.productId,
              productCode: item.productCode,
              productName: item.productName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discount: item.discount || 0,
              totalPrice: item.quantity * item.unitPrice - (item.discount || 0),
              note: item.note || null,
            })),
          },
        },
        include: {
          items: true,
        },
      });

      return {
        posOrderId,
        orderCode,
        localOrderId: posOrder.id,
        grandTotal,
        paidAmount: 0,
        debtAmount: grandTotal,
        itemCount: items.length,
      };
    } catch (err: any) {
      // Nếu là lỗi nghiệp vụ nội bộ (ví dụ: orderId không hợp lệ) thì re-throw thẳng
      if (err.message?.includes('orderId không hợp lệ') || err.message?.includes('Response keys:')) {
        throw err;
      }
      const mappedMsg = handleMcpError(err);
      throw new Error(mappedMsg);
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// GetContactOrders — Lấy danh sách đơn hàng của 1 Contact từ Read Model
// ════════════════════════════════════════════════════════════════════════════

export interface GetContactOrdersPayload {
  contactId: string;
}

export class GetContactOrdersHandler implements CommandHandler<Command<GetContactOrdersPayload>, any> {
  async handle(command: Command<GetContactOrdersPayload>, context: { orgId: string; userId: string }): Promise<any> {
    const { contactId } = command.payload;

    const orders = await prisma.posOrder.findMany({
      where: {
        orgId: context.orgId,
        contactId,
      },
      include: {
        items: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // ── Tính thống kê ngay tại backend — không cần gọi thêm API ──────────────
    // Phân nhóm trạng thái:
    //   Phiếu tạm  (Pending/Draft)          → chưa chốt, nợ DỰ TÍNH
    //   Đang xử lý (Confirmed/Processing)   → đã chốt,   nợ THỰC TẾ
    //   Hoàn thành (Done)                   → đã xong,   nợ thực tế đã thu
    //   Đã hủy     (Cancelled)              → loại khỏi thống kê nợ
    // Lưu ý: KiotViet có thể trả về tên tiếng Việt hoặc tiếng Anh tùy API version
    const DRAFT_STATUSES     = ['Pending', 'Draft', 'Phiếu tạm'];
    const CONFIRMED_STATUSES = ['Confirmed', 'Processing', 'Đã xác nhận', 'Đang xử lý'];
    const DONE_STATUSES      = ['Done', 'Completed', 'Hoàn thành', 'Đã hoàn thành'];
    const CANCELLED_STATUSES = ['Cancelled', 'Đã hủy', 'Huỷ'];

    const activeOrders    = orders.filter(o => !CANCELLED_STATUSES.includes(o.orderStatus));
    const draftOrders     = orders.filter(o => DRAFT_STATUSES.includes(o.orderStatus));
    const confirmedOrders = orders.filter(o => CONFIRMED_STATUSES.includes(o.orderStatus));
    const doneOrders      = orders.filter(o => DONE_STATUSES.includes(o.orderStatus));
    const cancelledOrders = orders.filter(o => CANCELLED_STATUSES.includes(o.orderStatus));

    const sumDebt  = (list: typeof orders) => list.reduce((s, o) => s + (o.debtAmount  ?? 0), 0);
    const sumTotal = (list: typeof orders) => list.reduce((s, o) => s + (o.grandTotal   ?? 0), 0);

    const summary = {
      // Số lượng theo nhóm
      totalCount:     activeOrders.length,
      draftCount:     draftOrders.length,
      confirmedCount: confirmedOrders.length,
      doneCount:      doneOrders.length,
      cancelledCount: cancelledOrders.length,

      // Tổng giá trị đơn hàng (không tính đơn hủy)
      totalGrandTotal: sumTotal(activeOrders),

      // Công nợ dự tính = tổng debtAmount của đơn PHIẾU TẠM chưa xác nhận
      // → Sales dùng để biết "KH còn bao nhiêu tiền chưa chốt"
      estimatedDebt: sumDebt(draftOrders),

      // Công nợ thực tế = tổng debtAmount của đơn ĐÃ XÁC NHẬN (đang chờ thu)
      // → Số này sẽ được KiotViet ghi nhận là nợ chính thức
      actualDebt: sumDebt(confirmedOrders),

      // Đơn gần nhất (code + ngày — dùng cho hiển thị nhanh)
      lastOrderAt:   orders[0]?.createdAt ?? null,
      lastOrderCode: orders[0]?.code ?? null,
    };

    return { success: true, data: { orders, total: orders.length, summary } };
  }
}

// Tự động đăng ký các Command vào Dispatcher
commandDispatcher.register('CreateOrder', new CreateOrderHandler(), new CreateOrderValidator());
commandDispatcher.register('GetContactOrders', new GetContactOrdersHandler());
