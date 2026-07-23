// ═══════════════════════════════════════════════════════════
// Type definitions for Visual Order Builder
// ═══════════════════════════════════════════════════════════

/** Thông tin khách hàng POS/Zalo (hiển thị trên canvas) */
export interface CustomerInfo {
  posCustomerId: number;
  posCustomerCode?: string;
  contactId?: string;
  name: string;
  phone?: string;
  zaloId?: string;
  avatar?: string;
  address?: string;
}

/** Sản phẩm POS (từ DB cục bộ pos_products) */
export interface POSProduct {
  id: number;
  code: string;
  name: string;
  categoryName?: string;
  basePrice: number;
  unit?: string;
  onHand?: number;
  imageUrl?: string;
}

/** Chi nhánh POS */
export interface POSBranch {
  id: number;
  name: string;
  address?: string;
}

/** Sản phẩm đã chọn trong đơn hàng */
export interface CartItem {
  product: POSProduct;
  quantity: number;
  discount?: number;           // Chiết khấu sản phẩm (VNĐ)
}

/** Bảng giá cố định cho từng tệp khách hàng */
export interface PriceBookOption {
  id: string;
  name: string;
  type: 'standard' | 'fixed' | 'pos_sync';
  discountPercent?: number;
  note?: string;
}

/** Phiếu nháp (multi-ticket) */
export interface DraftOrder {
  id: string;
  ticketNumber: string;        // e.g. "Phiếu #1"
  customer: CustomerInfo;
  cartItems: CartItem[];
  branchId: number | null;
  paymentMethod: string;       // cash | bank_transfer | card
  orderStatus: number;         // 1 = Phiếu tạm, 2 = Đã xác nhận
  priceBookId?: string;        // Bảng giá áp dụng (mặc định: 'standard')
  orderDiscount?: number;      // Chiết khấu tổng đơn hàng (VNĐ)
  description: string;
  paidAmount: number;
  deliveryAddress?: string;    // Địa chỉ đến (mặc định: '123 Đường Lê Lợi, Quận 1, TP.HCM')
  createdAt: string;
}

/** Phương thức thanh toán */
export interface PaymentMethodOption {
  value: string;
  label: string;
  icon: string;
  description: string;
}

/** Trạng thái đơn hàng */
export interface OrderStatusOption {
  value: number;
  label: string;
}

/** Đơn hàng hoàn thành */
export interface CompletedOrder {
  id: string;
  orderCode: string;
  customerName: string;
  totalAmount: number;
  itemsCount: number;
  time: string;
  paymentMethod: string;
}

/** Format VND currency */
export function formatVND(value: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
}

/** Danh sách phương thức thanh toán */
export const PAYMENT_METHODS: PaymentMethodOption[] = [
  { value: 'cash', label: 'Tiền mặt (COD)', icon: '💵', description: 'Thanh toán tiền mặt khi nhận hàng' },
  { value: 'bank_transfer', label: 'Chuyển khoản (VietQR)', icon: '🏦', description: 'Quét mã VietQR tự động khớp' },
  { value: 'card', label: 'Quẹt thẻ', icon: '💳', description: 'Thanh toán bằng thẻ ngân hàng' },
];

/** Danh sách trạng thái đơn */
export const ORDER_STATUSES: OrderStatusOption[] = [
  { value: 1, label: '📝 Phiếu tạm' },
];

/** Danh sách bảng giá cố định & POS Sync */
export const PRICE_BOOKS: PriceBookOption[] = [
  { id: 'standard', name: 'Bảng giá chung (Mặc định)', type: 'standard', discountPercent: 0, note: 'Giá niêm yết chuẩn' },
  { id: 'wholesale', name: 'Bảng giá sỉ', type: 'fixed', discountPercent: 15, note: 'Tệp khách mua sỉ (Giảm 15%)' },
  { id: 'vip', name: 'Bảng giá VIP', type: 'fixed', discountPercent: 10, note: 'Tệp khách hàng VIP (Giảm 10%)' },
  { id: 'agency', name: 'Bảng giá Đại lý', type: 'fixed', discountPercent: 20, note: 'Tệp đại lý phân phối (Giảm 20%)' },
  { id: 'pos_sync', name: 'Bảng giá POS (Đồng bộ)', type: 'pos_sync', note: 'Chờ đồng bộ API từ POS Server (Cập nhật sau)' },
];

/** Hàm tính đơn giá thực tế theo bảng giá */
export function getEffectiveProductPrice(basePrice: number, priceBookId?: string): number {
  if (!priceBookId || priceBookId === 'standard' || priceBookId === 'pos_sync') {
    return basePrice;
  }
  const pb = PRICE_BOOKS.find(p => p.id === priceBookId);
  if (pb && pb.discountPercent) {
    return Math.round(basePrice * (1 - pb.discountPercent / 100));
  }
  return basePrice;
}
