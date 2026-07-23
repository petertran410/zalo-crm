import { Command, CommandHandler, CommandValidator, ValidationResult } from '../../../shared/commands/command.interface.js';
import { commandDispatcher } from '../../../shared/commands/command-dispatcher.js';
import { getPosMcpClient } from '../../../shared/mcp/mcp-client.js';
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

    const mcpClient = getPosMcpClient();
    const idempotencyKey = uuidv4() as `${string}-${string}-${string}-${string}-${string}`;

    // 1. Build MCP OrderInput
    const orderItems = items.map(item => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: item.discount || 0,
      note: item.note || '',
    }));

    let posOrderId: number | undefined;
    let orderCode: string | undefined;
    let orderData: any;

    try {
      logger.info(`[CreateOrderHandler] Creating order on POS for customer ${posCustomerId}, branch ${branchId}, ${items.length} items`);

      // 2. Gọi MCP tạo đơn trên POS
      // Lưu ý: MCP tool crm_create_order không nhận field 'status' — mặc định luôn tạo Phiếu tạm (status=1)
      // Để chuyển sang "Đã xác nhận" cần call update riêng sau khi tạo xong
      const res = await mcpClient.orders.create({
        customerId: posCustomerId,
        branchId,
        items: orderItems,
        paidAmount: paidAmount || 0,
        description: description || '',
      }, idempotencyKey);

      // Log raw response để debug field name từ POS
      logger.info(`[CreateOrderHandler] POS raw response keys: ${Object.keys(res || {}).join(', ')}`);

      // POS MCP trả về { order: {...}, warnings: [...] } — data nằm trong field 'order'
      const rawRes = res as any;
      orderData = rawRes.order ?? rawRes.data?.order ?? rawRes.data ?? rawRes;
      logger.info(`[CreateOrderHandler] orderData.id=${orderData.id}, orderData.code=${orderData.code}`);

      // Thử nhiều field name phổ biến từ KiotViet API
      posOrderId = orderData.id ?? orderData.orderId ?? orderData.Id ?? orderData.order_id;
      orderCode = orderData.code ?? orderData.orderCode ?? orderData.Code ?? `ORD-${posOrderId}`;

      if (!posOrderId) {
        logger.error(`[CreateOrderHandler] orderId not found. orderData keys: ${Object.keys(orderData || {}).join(', ')}`);
        throw new Error(`POS API trả về orderId không hợp lệ. Response keys: ${Object.keys(orderData).join(', ')}`);
      }

      logger.info(`[CreateOrderHandler] POS order created: ${orderCode} (ID: ${posOrderId}) — Trạng thái duy nhất: Phiếu tạm (status=1)`);

      // 3. Tính toán tổng tiền từ items (Read Model)
      // POS trả về số tiền dưới dạng string → cần parseFloat
      const totalAmount = items.reduce((sum, item) => {
        const lineTotal = item.quantity * item.unitPrice - (item.discount || 0);
        return sum + lineTotal;
      }, 0);
      const grandTotal = parseFloat(orderData.grandTotal ?? orderData.total ?? 0) || totalAmount;
      const posDiscount = parseFloat(orderData.discount ?? 0) || 0;
      const paid = paidAmount || 0;
      const debt = grandTotal - paid;

      // orderStatus từ POS là số nguyên (1=Phiếu tạm, 2=Đã xác nhận, v.v.)
      // Ưu tiên dùng statusValue (string) hoặc orderStatus (string), fallback mapping từ số
      const STATUS_MAP: Record<number, string> = { 1: 'Pending', 2: 'Confirmed', 3: 'Processing', 4: 'Done', 5: 'Cancelled' };
      const rawStatus = orderData.statusValue ?? orderData.orderStatus;
      const posOrderStatus = typeof rawStatus === 'string' && rawStatus
        ? rawStatus
        : (STATUS_MAP[orderData.status as number] ?? 'Pending');

      // 4. Lưu Read Model PosOrder + PosOrderDetail
      const posOrder = await prisma.posOrder.create({
        data: {
          posOrderId,
          code: orderCode ?? `ORD-${posOrderId}`,
          customerId: posCustomerId,
          branchId,
          orderDate: new Date(),
          totalAmount,
          discount: posDiscount,
          grandTotal,
          paidAmount: paid,
          debtAmount: debt > 0 ? debt : 0,
          paymentStatus: paid >= grandTotal ? 'Paid' : (paid > 0 ? 'PartiallyPaid' : 'Draft'),
          orderStatus: posOrderStatus,
          description: description || null,
          orgId: context.orgId,
          contactId: contactId || null,
          createdByUserId: context.userId,
          items: {
            create: items.map(item => ({
              productId: item.productId,
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

      // 5. Nếu có thanh toán ngay (đặt cọc) → tạo invoice + record payment qua MCP
      if (paid > 0) {
        try {
          logger.info(`[CreateOrderHandler] Recording payment ${paid} for order ${posOrderId}`);

          // Tạo invoice từ order
          const invoiceRes = await mcpClient.invoices.createFromOrder(posOrderId, {}, uuidv4() as any);
          const invoiceData = (invoiceRes as any).data || invoiceRes;
          const invoiceId = invoiceData.id;

          if (invoiceId) {
            // Ghi nhận thanh toán
            await mcpClient.invoices.recordPayment({
              invoiceId,
              amount: paid,
              paymentMethod: paymentMethod || 'cash',
              paymentDate: new Date().toISOString(),
              notes: `Đặt cọc khi tạo đơn từ CRM`,
            }, uuidv4() as any);

            // Lưu payment vào Read Model
            await prisma.posOrderPayment.create({
              data: {
                orderId: posOrder.id,
                posPaymentId: null,
                amount: paid,
                paymentDate: new Date(),
                paymentMethod: paymentMethod || 'cash',
                description: `Đặt cọc khi tạo đơn từ CRM`,
              },
            });
          }
        } catch (payErr: any) {
          // Payment thất bại nhưng order đã tạo thành công → log warning, KHÔNG throw
          logger.warn(`[CreateOrderHandler] Payment recording failed (order still created): ${payErr.message}`);
        }
      }

      return {
        posOrderId,
        orderCode,
        localOrderId: posOrder.id,
        grandTotal,
        paidAmount: paid,
        debtAmount: debt > 0 ? debt : 0,
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
        payments: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return { orders, total: orders.length };
  }
}

// Tự động đăng ký các Command vào Dispatcher
commandDispatcher.register('CreateOrder', new CreateOrderHandler(), new CreateOrderValidator());
commandDispatcher.register('GetContactOrders', new GetContactOrdersHandler());
