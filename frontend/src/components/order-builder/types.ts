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
  secondaryAddresses?: string[];
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
  images?: { id: number; productId: number; image: string; createdAt: string }[];
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
  note?: string;               // Ghi chú riêng cho từng sản phẩm
  isGift?: boolean;            // true = hàng quà tặng từ khuyến mãi
  promoId?: string;            // ID chương trình KM đã áp dụng
  
  // Mở rộng chiết khấu và trạng thái
  conditionType?: 'normal' | 'damaged' | 'near_expiry';
  discountType?: 'amount' | 'percent';
  discountValue?: number;      // Giá trị user nhập vào (50000 hoặc 10)
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
  ticketNumber: string;
  customer: CustomerInfo;
  cartItems: CartItem[];
  branchId: number | null;
  paymentMethod: string;
  orderStatus: number;
  priceBookId?: string;
  orderDiscount?: number;      // (VNĐ) số tiền chiết khấu thực tính
  orderDiscountType?: 'amount' | 'percent';
  orderDiscountValue?: number; // giá trị user nhập vào
  appliedPromoIds?: string[];
  description: string;
  billNote?: string;
  shippingNote?: string;
  paidAmount: number;
  deliveryAddress?: string;
  
  // Kích thước, cân nặng giao hàng
  packageLength?: number;
  packageWidth?: number;
  packageHeight?: number;
  packageWeight?: number; // kg hoặc gram tùy anh quy định, UI đang để linh hoạt
  
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
  { value: 'cash',          label: 'Tiền mặt (COD)',         icon: '💵', description: 'Thanh toán tiền mặt khi nhận hàng' },
  { value: 'bank_transfer', label: 'Chuyển khoản (VietQR)', icon: '🏦', description: 'Quét mã VietQR tự động khớp' },
];

/** Danh sách trạng thái đơn */
export const ORDER_STATUSES: OrderStatusOption[] = [
  { value: 1, label: '📝 Phiếu tạm' },
];

/** Danh sách bảng giá cố định & POS Sync */
export const PRICE_BOOKS: PriceBookOption[] = [
  { id: 'standard',  name: 'Bảng giá chung (Mặc định)',  type: 'standard',  discountPercent: 0,  note: 'Giá niêm yết chuẩn' },
  { id: 'wholesale', name: 'Bảng giá sỉ',                type: 'fixed',     discountPercent: 15, note: 'Tệp khách mua sỉ (Giảm 15%)' },
  { id: 'vip',       name: 'Bảng giá VIP',               type: 'fixed',     discountPercent: 10, note: 'Tệp khách hàng VIP (Giảm 10%)' },
  { id: 'agency',    name: 'Bảng giá Đại lý',            type: 'fixed',     discountPercent: 20, note: 'Tệp đại lý phân phối (Giảm 20%)' },
  { id: 'pos_sync',  name: 'Bảng giá POS (Đồng bộ)',     type: 'pos_sync',                       note: 'Chờ đồng bộ API từ POS Server (Cập nhật sau)' },
];

/** Hàm tính đơn giá thực tế theo bảng giá */
export function getEffectiveProductPrice(basePrice: number, priceBookId?: string): number {
  if (!priceBookId || priceBookId === 'standard' || priceBookId === 'pos_sync') return basePrice;
  const pb = PRICE_BOOKS.find(p => p.id === priceBookId);
  if (pb && pb.discountPercent) return Math.round(basePrice * (1 - pb.discountPercent / 100));
  return basePrice;
}

// ═══════════════════════════════════════════════════════════
// Promotion / Khuyến mãi types, evaluation & mock data
// ═══════════════════════════════════════════════════════════

/**
 * Điều kiện kích hoạt chương trình khuyến mãi.
 *
 * | type                | mô tả                                               |
 * |---------------------|-----------------------------------------------------|
 * | min_cart_count      | Tổng SỐ LƯỢNG tất cả sp thật trong giỏ ≥ minCount  |
 * | keyword_quantity    | Tổng SL sp có tên/code chứa keyword ≥ minQuantity  |
 * | min_order_amount    | Tổng TIỀN đơn (trước giảm giá) ≥ minAmount         |
 */
export interface PromoCondition {
  type: 'min_cart_count' | 'keyword_quantity' | 'min_order_amount';
  minCount?: number;     // dành cho min_cart_count
  keyword?: string;      // dành cho keyword_quantity (case-insensitive)
  minQuantity?: number;  // dành cho keyword_quantity
  minAmount?: number;    // dành cho min_order_amount
}

/** Phần thưởng khuyến mãi */
export interface PromoReward {
  type: 'free_product' | 'order_discount';
  giftProduct?: POSProduct;  // sản phẩm tặng kèm (hiển thị trong cột KM)
  giftQuantity?: number;     // số lượng tặng
  discountAmount?: number;   // số tiền giảm thêm vào tổng đơn
}

/** Chương trình khuyến mãi */
export interface PromotionProgram {
  id: string;
  badge: string;              // emoji đại diện
  name: string;               // tên đầy đủ
  tag: string;                // nhãn ngắn
  conditionText: string;      // mô tả điều kiện (cho người dùng)
  rewardText: string;         // mô tả phần thưởng
  color: string;              // màu accent
  colorBg: string;            // màu nền nhạt
  condition: PromoCondition;  // điều kiện evaluate được (tự động)
  reward: PromoReward;
  validUntil?: string;
  isActive: boolean;
}

/**
 * Evaluate điều kiện KM dựa trên giỏ hàng hiện tại.
 *
 * @param condition  - điều kiện của chương trình KM
 * @param cartItems  - toàn bộ cartItems (bao gồm cả quà tặng)
 * @param orderTotal - tổng tiền đơn TRƯỚC khi giảm giá (tính từ sp thật)
 */
export function evaluatePromoCondition(
  condition: PromoCondition,
  cartItems: CartItem[],
  orderTotal: number,
): boolean {
  // Chỉ tính sản phẩm thật (bỏ quà tặng)
  const real = cartItems.filter(c => !c.isGift);

  switch (condition.type) {
    case 'min_cart_count': {
      const total = real.reduce((s, c) => s + c.quantity, 0);
      return total >= (condition.minCount ?? 0);
    }
    case 'keyword_quantity': {
      const kw = (condition.keyword ?? '').toLowerCase();
      const qty = real
        .filter(c =>
          c.product.name.toLowerCase().includes(kw) ||
          (c.product.code ?? '').toLowerCase().includes(kw),
        )
        .reduce((s, c) => s + c.quantity, 0);
      return qty >= (condition.minQuantity ?? 0);
    }
    case 'min_order_amount':
      return orderTotal >= (condition.minAmount ?? 0);
    default:
      return false;
  }
}

/**
 * Tính số lượng hiện tại đạt được so với điều kiện (dùng cho progress bar).
 * Trả về { current, required }.
 */
export function promoConditionProgress(
  condition: PromoCondition,
  cartItems: CartItem[],
  orderTotal: number,
): { current: number; required: number } {
  const real = cartItems.filter(c => !c.isGift);

  switch (condition.type) {
    case 'min_cart_count':
      return {
        current: real.reduce((s, c) => s + c.quantity, 0),
        required: condition.minCount ?? 0,
      };
    case 'keyword_quantity': {
      const kw = (condition.keyword ?? '').toLowerCase();
      return {
        current: real
          .filter(c => c.product.name.toLowerCase().includes(kw) ||
                       (c.product.code ?? '').toLowerCase().includes(kw))
          .reduce((s, c) => s + c.quantity, 0),
        required: condition.minQuantity ?? 0,
      };
    }
    case 'min_order_amount':
      return { current: orderTotal, required: condition.minAmount ?? 0 };
    default:
      return { current: 0, required: 0 };
  }
}

// ─── Mock sản phẩm quà tặng (id < 0 để phân biệt với sản phẩm thật) ───
const GIFT_TTL_MINI: POSProduct = {
  id: -1, code: 'GIFT-TTL-MINI',
  name: 'Thạch TTL Mini (Quà tặng 🎁)',
  categoryName: 'Quà tặng', basePrice: 15000, unit: 'gói',
};
const GIFT_LABOONG_SMALL: POSProduct = {
  id: -2, code: 'GIFT-LABOONG-SM',
  name: 'LABOONG Sốt Nhỏ 500g (Quà tặng 🎁)',
  categoryName: 'Quà tặng', basePrice: 52000, unit: 'hộp',
};
const GIFT_NUOC_EP: POSProduct = {
  id: -3, code: 'GIFT-NUOC-EP',
  name: 'Nước ép trái cây 330ml (Quà tặng 🎁)',
  categoryName: 'Quà tặng', basePrice: 25000, unit: 'chai',
};

/** Danh sách chương trình khuyến mãi mock */
export const MOCK_PROMOTIONS: PromotionProgram[] = [
  {
    id: 'promo-buy2-get1-ttl',
    badge: '🎁', tag: 'Mua 2 Tặng 1',
    name: 'Mua 2 hộp TTL — Tặng 1 gói Mini',
    conditionText: 'Thêm ≥ 2 sản phẩm TTL vào đơn',
    rewardText: 'Tặng 1 gói Thạch TTL Mini (15.000đ miễn phí)',
    color: '#0068FF', colorBg: '#eff6ff',
    condition: { type: 'keyword_quantity', keyword: 'TTL', minQuantity: 2 },
    reward: { type: 'free_product', giftProduct: GIFT_TTL_MINI, giftQuantity: 1 },
    validUntil: '31/08/2026', isActive: true,
  },
  {
    id: 'promo-buy3-get1-laboong',
    badge: '🛍️', tag: 'Mua 3 Tặng 1',
    name: 'Mua 3 hộp LABOONG — Tặng 1 hộp nhỏ',
    conditionText: 'Thêm ≥ 3 hộp LABOONG vào đơn',
    rewardText: 'Tặng 1 hộp LABOONG Sốt Nhỏ 500g (52.000đ miễn phí)',
    color: '#10b981', colorBg: '#ecfdf5',
    condition: { type: 'keyword_quantity', keyword: 'LABOONG', minQuantity: 3 },
    reward: { type: 'free_product', giftProduct: GIFT_LABOONG_SMALL, giftQuantity: 1 },
    validUntil: '15/09/2026', isActive: true,
  },
  {
    id: 'promo-buy5-get2-nuoc',
    badge: '🥤', tag: 'Mua 5 Tặng 2',
    name: 'Mua 5 SP bất kỳ — Tặng 2 chai nước ép',
    conditionText: 'Thêm ≥ 5 sản phẩm bất kỳ vào đơn',
    rewardText: 'Tặng 2 chai Nước ép 330ml (50.000đ miễn phí)',
    color: '#f59e0b', colorBg: '#fffbeb',
    condition: { type: 'min_cart_count', minCount: 5 },
    reward: { type: 'free_product', giftProduct: GIFT_NUOC_EP, giftQuantity: 2 },
    validUntil: '30/09/2026', isActive: true,
  },
  {
    id: 'promo-order-500k',
    badge: '💰', tag: 'Giảm 50.000đ',
    name: 'Đơn từ 500k — Giảm thêm 50k',
    conditionText: 'Tổng đơn hàng ≥ 500.000đ',
    rewardText: 'Giảm thêm 50.000đ vào tổng đơn',
    color: '#8b5cf6', colorBg: '#f5f3ff',
    condition: { type: 'min_order_amount', minAmount: 500000 },
    reward: { type: 'order_discount', discountAmount: 50000 },
    validUntil: '31/12/2026', isActive: true,
  },
];
