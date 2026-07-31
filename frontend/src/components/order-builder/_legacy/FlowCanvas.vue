<template>
  <section class="ob-canvas">
    <!-- ═══ Multi-ticket Tabs Bar + Price Book Selector ═══ -->
    <div class="ob-canvas__tabs-bar">
      <div class="ob-canvas__tabs-list">
        <div
          v-for="draft in drafts"
          :key="draft.id"
          class="ob-canvas__tab"
          :class="{ 'ob-canvas__tab--active': draft.id === activeDraftId }"
          @click="$emit('select-draft', draft.id)"
        >
          <Receipt :size="14" :class="draft.id === activeDraftId ? 'ob-text-blue' : 'ob-text-muted'" />
          <div class="ob-canvas__tab-info">
            <div class="ob-canvas__tab-title">
              <span class="ob-canvas__tab-number">{{ draft.ticketNumber }}</span>
              <span class="ob-canvas__tab-sep">•</span>
              <span class="ob-canvas__tab-customer">{{ draft.customer.name }}</span>
            </div>
            <div class="ob-canvas__tab-meta">
              <span>{{ draft.cartItems.length > 0 ? `${totalItems(draft)} sp` : 'Trống' }}</span>
              <template v-if="subtotal(draft) > 0">
                <span class="ob-canvas__tab-sep">|</span>
                <span class="ob-canvas__tab-amount" :class="{ 'ob-text-green': draft.id === activeDraftId }">
                  {{ new Intl.NumberFormat('vi-VN').format(subtotal(draft)) }}đ
                </span>
              </template>
            </div>
          </div>
          <button
            v-if="drafts.length > 1"
            class="ob-canvas__tab-close"
            title="Hủy phiếu nháp này"
            @click.stop="$emit('delete-draft', draft.id)"
          >
            <X :size="12" :stroke-width="2.5" />
          </button>
        </div>

        <button class="ob-canvas__tab-add" title="Mở thêm phiếu nháp" @click="$emit('create-draft')">
          <Plus :size="14" :stroke-width="2.5" />
          <span>Thêm phiếu</span>
        </button>
      </div>

      <!-- ═══ Price Book Selector (Cố định cho tệp khách & POS Sync) ═══ -->
      <div class="ob-canvas__price-book">
        <div class="ob-canvas__price-book-box">
          <Tag :size="13" class="ob-text-blue" />
          <span class="ob-canvas__price-book-label">Bảng giá:</span>
          <select
            :value="selectedPriceBookId || 'standard'"
            class="ob-canvas__price-book-select"
            @change="$emit('select-price-book', ($event.target as HTMLSelectElement).value)"
          >
            <option v-for="pb in PRICE_BOOKS" :key="pb.id" :value="pb.id">
              {{ pb.name }} {{ pb.discountPercent ? `(-${pb.discountPercent}%)` : '' }}
            </option>
          </select>
        </div>

        <div
          class="ob-canvas__price-book-badge"
          :class="priceBookStatusClass"
          :title="activePriceBook.note || ''"
        >
          <template v-if="activePriceBook.type === 'pos_sync'">
            <span class="ob-sync-dot"></span>
            <span>Cập nhật sau</span>
          </template>
          <template v-else-if="activePriceBook.type === 'fixed'">
            <span>-{{ activePriceBook.discountPercent }}%</span>
          </template>
          <template v-else>
            <span>Mặc định</span>
          </template>
        </div>
      </div>
    </div>

    <!-- ═══ Flow Pipeline Canvas ═══ -->
    <div
      ref="canvasPipelineRef"
      class="ob-canvas__pipeline"
      :style="{ backgroundImage: 'radial-gradient(#e2e8f0 1.2px, transparent 1.2px)', backgroundSize: '20px 20px' }"
    >
      <!-- SVG Overlay Connection Lines -->
      <svg
        class="ob-pipeline-svg"
        :style="{ width: svgWidth + 'px', height: svgHeight + 'px' }"
      >
        <defs>
          <linearGradient id="grad-blue-green" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#0068FF" />
            <stop offset="100%" stop-color="#10b981" />
          </linearGradient>
          <linearGradient id="grad-green-indigo" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#10b981" />
            <stop offset="100%" stop-color="#6366f1" />
          </linearGradient>
          <linearGradient id="grad-indigo-blue" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#6366f1" />
            <stop offset="100%" stop-color="#0068FF" />
          </linearGradient>
        </defs>

        <g v-for="line in connectionPaths" :key="line.id">
          <!-- Background Mask Line -->
          <path
            :d="line.d"
            stroke="#f8fafc"
            stroke-width="7"
            fill="none"
            stroke-linecap="round"
          />
          <!-- Main Colored Line -->
          <path
            :d="line.d"
            :stroke="line.stroke"
            stroke-width="2.5"
            fill="none"
            stroke-linecap="round"
            stroke-dasharray="6,4"
            class="ob-pipeline-path"
          />
        </g>
      </svg>

      <div ref="pipelineRef" class="ob-pipeline">

        <!-- COLUMN 1: CUSTOMER -->
        <div class="ob-pipeline__col">
          <div class="ob-pipeline__col-header">
            <User :size="14" class="ob-text-blue" />
            <span>Khách hàng</span>
          </div>
          <div class="ob-node ob-node--customer">
            <div class="ob-node__anchor ob-node__anchor--right" style="background: #0068FF" />
            <div class="ob-node__customer-row">
              <div class="ob-node__avatar">{{ (customer.name || '?')[0] }}</div>
              <div class="ob-node__customer-info">
                <h4>{{ customer.name }}</h4>
                <p v-if="customer.phone" class="ob-mono">{{ customer.phone }}</p>
                <span v-if="customer.posCustomerCode" class="ob-node__badge">{{ customer.posCustomerCode }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- COLUMN 2: PRODUCTS -->
        <div class="ob-pipeline__col">
          <div class="ob-pipeline__col-header">
            <ShoppingBag :size="14" class="ob-text-green" />
            <span>Sản phẩm ({{ realCartItems.length }})</span>
            <span v-if="isCompactMode" class="ob-compact-badge">⚡ Rút gọn</span>
          </div>

          <div v-if="realCartItems.length === 0" class="ob-node ob-node--empty">
            <ShoppingBag :size="24" :stroke-width="1" />
            <span>Chưa có sản phẩm. Click chọn sản phẩm ở thanh bên</span>
          </div>

          <!-- PRODUCT CARDS (Unified for both <=3 and >3 items) -->
          <div :class="{ 'ob-compact-group': isCompactMode }" @scroll="isCompactMode ? updateConnections() : null">
            <div
              v-for="(item, index) in realCartItems"
              :key="item.product.id"
              class="ob-node ob-node--product"
              :class="{ 'ob-node--product-collapsed': isCompactMode && expandedProductId !== item.product.id }"
              @click="isCompactMode ? toggleExpand(item.product.id) : null"
            >
              <!-- Anchors for SVG lines -->
              <div v-if="!isCompactMode || index === 0 || index === realCartItems.length - 1" class="ob-node__anchor ob-node__anchor--left" style="background: #3b82f6" />
              <div v-if="!isCompactMode || index === 0 || index === realCartItems.length - 1" class="ob-node__anchor ob-node__anchor--right" style="background: #10b981" />

              <!-- Top Row: Always visible (Matching user image) -->
              <div class="ob-node__product-row">
                <div class="ob-node__product-color" :style="{ background: getProductColor(item.product.categoryName) }">
                  {{ (item.product.code || '').substring(0, 3) }}
                </div>
                <div class="ob-node__product-info">
                  <h4>{{ item.product.name }}</h4>
                  <div class="ob-node__product-meta">
                    <span class="ob-mono ob-text-muted">
                      <template v-if="selectedPriceBookId && selectedPriceBookId !== 'standard' && selectedPriceBookId !== 'pos_sync'">
                        <s class="ob-text-strikethrough">{{ formatVND(item.product.basePrice) }}</s>
                        {{ formatVND(getEffectiveProductPrice(item.product.basePrice, selectedPriceBookId)) }}
                      </template>
                      <template v-else>
                        {{ formatVND(item.product.basePrice) }}
                      </template>
                    </span>
                    <span class="ob-mono ob-text-bold">x{{ item.quantity }}</span>
                  </div>
                </div>
                <button class="ob-node__product-remove" @click.stop="$emit('remove-product', item.product.id)">
                  <Trash2 :size="12" />
                </button>
              </div>

              <!-- Bottom Sections: Expanded if >3 SP or Always Visible if <=3 SP -->
              <template v-if="!isCompactMode || expandedProductId === item.product.id">
                <div class="ob-node__qty-row" @click.stop>
                  <div class="ob-node__qty-controls">
                    <button @click="$emit('update-quantity', item.product.id, Math.max(1, item.quantity - 1))">
                      <Minus :size="10" :stroke-width="2.5" />
                    </button>
                    <span class="ob-mono">{{ item.quantity }}</span>
                    <button @click="$emit('update-quantity', item.product.id, item.quantity + 1)">
                      <Plus :size="10" :stroke-width="2.5" />
                    </button>
                  </div>
                  <span class="ob-mono ob-text-bold">
                    {{ formatVND(getEffectiveProductPrice(item.product.basePrice, selectedPriceBookId) * item.quantity) }}
                  </span>
                </div>

                <!-- Chiết khấu sản phẩm (sales nhập) -->
                <div class="ob-node__discount-row" @click.stop>
                  <span class="ob-node__discount-label">Chiết khấu (-):</span>
                  <div class="ob-node__discount-input-wrap">
                    <span class="ob-node__discount-minus">-</span>
                    <input
                      type="number"
                      :value="item.discount || ''"
                      placeholder="0"
                      min="0"
                      :max="getEffectiveProductPrice(item.product.basePrice, selectedPriceBookId) * item.quantity"
                      class="ob-node__discount-input"
                      @input="onProductDiscountInput(item.product.id, Number(($event.target as HTMLInputElement).value) || 0, getEffectiveProductPrice(item.product.basePrice, selectedPriceBookId) * item.quantity)"
                    />
                    <span class="ob-node__discount-unit">đ</span>
                  </div>
                </div>

                <!-- Thành tiền sản phẩm -->
                <div class="ob-node__final-row">
                  <span class="ob-node__final-label">Thành tiền:</span>
                  <span class="ob-node__final-amount">
                    {{ formatVND(Math.max(0, getEffectiveProductPrice(item.product.basePrice, selectedPriceBookId) * item.quantity - (item.discount || 0))) }}
                  </span>
                </div>
              </template>
            </div>
          </div>
        </div>

        <!-- COLUMN 3: KHUYẾN MÃI -->
        <div class="ob-pipeline__col ob-pipeline__col--promo">
          <div class="ob-pipeline__col-header">
            <Tag :size="14" class="ob-text-amber" />
            <span>Khuyến mãi</span>
            <span v-if="appliedPromos.length > 0" class="ob-promo-node__count-badge">
              {{ appliedPromos.length }}
            </span>
          </div>
          <div class="ob-node ob-node--promo" :class="{ 'ob-node--promo-active': appliedPromos.length > 0 }">
            <div class="ob-node__anchor ob-node__anchor--left" style="background: #10b981" />
            <div class="ob-node__anchor ob-node__anchor--right" style="background: #f59e0b" />

            <!-- No promo applied: placeholder -->
            <div v-if="appliedPromos.length === 0 && giftCartItems.length === 0" class="ob-node__promo-inner">
              <div class="ob-node__promo-icon">
                <Tag :size="20" />
              </div>
              <h5 class="ob-node__promo-title">Chính sách KM</h5>
              <p class="ob-node__promo-desc">Chọn tab Khuyến mãi ⇐ để áp dụng</p>
            </div>

            <!-- Promos applied: show program list + gift items -->
            <div v-else class="ob-node__promo-applied">
              <!-- Program tags -->
              <div v-for="promo in appliedPromos" :key="promo.id" class="ob-node__promo-applied-item">
                <span class="ob-node__promo-applied-badge">{{ promo.badge }}</span>
                <span class="ob-node__promo-applied-tag">{{ promo.tag }}</span>
              </div>

              <!-- Quà tặng trong đơn -->
              <div v-if="giftCartItems.length > 0" class="ob-node__gift-section">
                <div class="ob-node__gift-title">
                  <Sparkles :size="10" />
                  Quà tặng kèm theo
                </div>
                <div
                  v-for="gift in giftCartItems"
                  :key="gift.product.id"
                  class="ob-node__gift-item"
                >
                  <span class="ob-node__gift-emoji">🎁</span>
                  <div class="ob-node__gift-info">
                    <span class="ob-node__gift-name">{{ gift.product.name }}</span>
                    <span class="ob-node__gift-qty">x{{ gift.quantity }}</span>
                  </div>
                  <span class="ob-node__gift-price">Miễn phí</span>
                </div>
              </div>

              <div class="ob-node__promo-applied-footer">
                <Sparkles :size="10" />
                Đã áp dụng {{ appliedPromos.length }} khuyến mãi
              </div>
            </div>
          </div>

        </div>

        <div class="ob-pipeline__col">
          <div class="ob-pipeline__col-header">
            <Truck :size="14" class="ob-text-indigo" />
            <span>Giao vận & Thanh toán</span>
          </div>
          <!-- Node luôn hiển thị với selectors -->
          <div class="ob-node ob-node--logistics">
            <div class="ob-node__anchor ob-node__anchor--left" style="background: #6366f1" />
            <div class="ob-node__anchor ob-node__anchor--right" style="background: #0068FF" />

            <!-- CHI NHÁNH -->
            <div class="ob-node__logistics-section">
              <div class="ob-node__logistics-icon ob-bg-blue">
                <MapPin :size="14" />
              </div>
              <div class="ob-node__logistics-field">
                <h5 class="ob-node__logistics-label">Chi nhánh</h5>
                <select
                  class="ob-node__logistics-select"
                  :value="selectedBranchId || ''"
                  @change="$emit('select-branch', Number(($event.target as HTMLSelectElement).value))"
                >
                  <option value="" disabled>-- Chọn chi nhánh --</option>
                  <option v-for="b in branches" :key="b.id" :value="b.id">{{ b.name }}</option>
                </select>
              </div>
            </div>

            <div class="ob-node__logistics-divider" />

            <!-- ĐỊA CHỈ ĐẾN -->
            <div class="ob-node__logistics-section ob-node__delivery-wrapper">
              <div class="ob-node__logistics-icon ob-bg-blue-light">
                <MapPin :size="14" class="ob-text-blue" />
              </div>
              <div class="ob-node__delivery-body">
                <div class="ob-node__delivery-header">
                  <h5 class="ob-node__logistics-label">Địa chỉ đến</h5>
                  <div class="ob-api-tooltip-trigger">
                    <span class="ob-api-badge">Chưa setup API</span>
                    <div class="ob-api-tooltip-popover">
                      📌 Địa chỉ mặc định chưa set up api
                    </div>
                  </div>
                </div>
                <input
                  type="text"
                  class="ob-node__delivery-input"
                  :value="deliveryAddress || '123 Đường Lê Lợi, Quận 1, TP.HCM'"
                  placeholder="Nhập địa chỉ đến..."
                  @input="$emit('update-delivery-address', ($event.target as HTMLInputElement).value)"
                />
              </div>
            </div>

            <div class="ob-node__logistics-divider" />

            <!-- THANH TOÁN -->
            <div class="ob-node__logistics-section">
              <div class="ob-node__logistics-icon ob-bg-green">
                <CreditCard :size="14" />
              </div>
              <div class="ob-node__logistics-field">
                <h5 class="ob-node__logistics-label">Thanh toán</h5>
                <select
                  class="ob-node__logistics-select"
                  :value="selectedPaymentMethod || 'cash'"
                  @change="$emit('select-payment', ($event.target as HTMLSelectElement).value)"
                >
                  <option v-for="m in PAYMENT_METHODS" :key="m.value" :value="m.value">{{ m.icon }} {{ m.label }}</option>
                </select>
              </div>
            </div>

            <div class="ob-node__logistics-divider" />

            <!-- TRẠNG THÁI ĐƠN -->
            <div class="ob-node__logistics-section">
              <div class="ob-node__logistics-icon" style="background: #f1f5f9; color: #6366f1;">
                <Sparkles :size="14" />
              </div>
              <div class="ob-node__logistics-field">
                <h5 class="ob-node__logistics-label">Trạng thái đơn</h5>
                <select
                  class="ob-node__logistics-select"
                  :value="selectedOrderStatus ?? 1"
                  @change="$emit('select-order-status', Number(($event.target as HTMLSelectElement).value))"
                >
                  <option v-for="s in ORDER_STATUSES" :key="s.value" :value="s.value">{{ s.label }}</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <!-- COLUMN 4: CHECKOUT PREVIEW -->
        <div class="ob-pipeline__col">
          <div class="ob-pipeline__col-header">
            <Sparkles :size="14" class="ob-text-blue" />
            <span>Xem trước hóa đơn</span>
          </div>
          <div class="ob-node ob-node--checkout">
            <div class="ob-node__anchor ob-node__anchor--left" style="background: #0068FF" />

            <h4 class="ob-node__checkout-title">
              <Sparkles :size="12" />
              Tổng quan hóa đơn
            </h4>

            <div class="ob-node__checkout-rows">
              <div class="ob-node__checkout-row">
                <span>Tạm tính:</span>
                <span class="ob-mono ob-text-bold">{{ formatVND(totalBeforeDiscount) }}</span>
              </div>
              <div class="ob-node__checkout-row ob-node__checkout-row--discount">
                <span>Giảm giá đơn:</span>
                <div class="ob-node__checkout-discount-wrap">
                  <span>-</span>
                  <input
                    type="number"
                    :value="orderDiscount || ''"
                    placeholder="0"
                    min="0"
                    :max="totalBeforeDiscount"
                    class="ob-node__checkout-discount-input"
                    @input="onOrderDiscountInput(Number(($event.target as HTMLInputElement).value) || 0)"
                  />
                  <span>đ</span>
                </div>
              </div>
            </div>

            <div class="ob-node__checkout-total">
              <span>Tổng thanh toán:</span>
              <span class="ob-node__checkout-total-amount">{{ formatVND(grandTotal) }}</span>
            </div>

            <button class="ob-node__checkout-btn" @click="$emit('open-details')">
              <Eye :size="14" :stroke-width="2.5" />
              <span>Xem & Chốt đơn</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUpdated, watch, nextTick, onBeforeUnmount } from 'vue';
import {
  User, ShoppingBag, Truck, Sparkles, Receipt,
  Plus, Minus, Trash2, X, Eye, MapPin, CreditCard, Tag, ChevronDown,
} from 'lucide-vue-next';
import type { DraftOrder, CartItem, POSBranch, CustomerInfo } from './types';
import { formatVND, PAYMENT_METHODS, PRICE_BOOKS, ORDER_STATUSES, getEffectiveProductPrice, MOCK_PROMOTIONS } from './types';

const props = defineProps<{
  customer: CustomerInfo;
  cartItems: CartItem[];
  branch: POSBranch | null;
  branches: POSBranch[];
  selectedBranchId?: number | null;
  selectedPaymentMethod: string;
  selectedOrderStatus?: number;
  selectedPriceBookId?: string;
  deliveryAddress?: string;
  totalBeforeDiscount: number;
  orderDiscount: number;
  grandTotal: number;
  drafts: DraftOrder[];
  activeDraftId: string;
  appliedPromoIds?: string[];  // KM đã áp dụng trong phiếu hiện tại
}>();

const appliedPromos = computed(() =>
  (props.appliedPromoIds ?? []).map(id => MOCK_PROMOTIONS.find(p => p.id === id)).filter(Boolean) as typeof MOCK_PROMOTIONS
);

/** Sản phẩm thật (không phải quà tặng) */
const realCartItems = computed(() => props.cartItems.filter(c => !c.isGift));

/** Quà tặng đã được thêm vào đơn (hiển thị trong cột KM) */
const giftCartItems = computed(() => props.cartItems.filter(c => c.isGift));

/** Compact mode: Tự động kích hoạt khi > 3 sản phẩm */
const isCompactMode = computed(() => realCartItems.value.length > 3);

/** Accordion expand state: chỉ 1 SP được mở tại một thời điểm */
const expandedProductId = ref<number | null>(null);

function toggleExpand(productId: number) {
  if (expandedProductId.value === productId) {
    expandedProductId.value = null;
  } else {
    expandedProductId.value = productId;
  }
  nextTick(() => {
    updateConnections();
  });
}

watch(isCompactMode, () => {
  nextTick(() => {
    updateConnections();
  });
});

const emit = defineEmits<{
  'select-draft': [id: string];
  'create-draft': [];
  'delete-draft': [id: string];
  'update-quantity': [productId: number, quantity: number];
  'remove-product': [productId: number];
  'select-price-book': [priceBookId: string];
  'update-product-discount': [productId: number, discount: number];
  'update-order-discount': [discount: number];
  'update-delivery-address': [address: string];
  'select-branch': [branchId: number];
  'select-payment': [method: string];
  'select-order-status': [status: number];
  'open-details': [];
}>();

function onProductDiscountInput(productId: number, val: number, maxDiscount: number) {
  let discount = Math.max(0, val);
  if (discount > maxDiscount) {
    discount = maxDiscount;
  }
  emit('update-product-discount', productId, discount);
}

function onOrderDiscountInput(val: number) {
  let discount = Math.max(0, val);
  if (discount > props.totalBeforeDiscount) {
    discount = props.totalBeforeDiscount;
  }
  emit('update-order-discount', discount);
}

const activePriceBook = computed(() => {
  return PRICE_BOOKS.find(pb => pb.id === (props.selectedPriceBookId || 'standard')) || PRICE_BOOKS[0];
});

const priceBookStatusClass = computed(() => {
  if (activePriceBook.value.type === 'pos_sync') return 'ob-price-book-badge--sync';
  if (activePriceBook.value.type === 'fixed') return 'ob-price-book-badge--fixed';
  return 'ob-price-book-badge--standard';
});

const paymentLabel = computed(() => {
  const m = PAYMENT_METHODS.find(p => p.value === props.selectedPaymentMethod);
  return m ? `${m.icon} ${m.label}` : '';
});

function totalItems(draft: DraftOrder): number {
  return draft.cartItems.reduce((sum, item) => sum + item.quantity, 0);
}

function subtotal(draft: DraftOrder): number {
  return draft.cartItems.reduce((sum, item) => {
    const price = getEffectiveProductPrice(item.product.basePrice, draft.priceBookId);
    return sum + price * item.quantity;
  }, 0);
}

const CATEGORY_COLORS: Record<string, string> = {};
const COLOR_PALETTE = [
  '#f59e0b', '#6366f1', '#ef4444', '#ec4899', '#0ea5e9',
  '#10b981', '#8b5cf6', '#f97316', '#14b8a6', '#64748b',
];
let colorIdx = 0;
function getProductColor(category?: string): string {
  const cat = category || 'default';
  if (!CATEGORY_COLORS[cat]) {
    CATEGORY_COLORS[cat] = COLOR_PALETTE[colorIdx % COLOR_PALETTE.length];
    colorIdx++;
  }
  return CATEGORY_COLORS[cat];
}

// ─── Connection Lines SVG Logic ───────────────────────────────────────
interface ConnectionLine {
  id: string;
  d: string;
  stroke: string;
  color: string;
}

const connectionPaths = ref<ConnectionLine[]>([]);
const canvasPipelineRef = ref<HTMLElement | null>(null);
const pipelineRef = ref<HTMLElement | null>(null);
const svgWidth = ref(0);
const svgHeight = ref(0);

const LINE_COLORS = [
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#8b5cf6', // Violet
  '#0ea5e9', // Sky blue
  '#f97316', // Orange
  '#0068FF', // Zalo Blue
];

function createCurvedPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.max(30, Math.abs(x2 - x1) * 0.45);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

// CSS zoom factor applied on .ob-canvas__pipeline
// getBoundingClientRect() returns coords scaled by zoom,
// so we divide by ZOOM_FACTOR to map back to SVG coordinate space.
const ZOOM_FACTOR = 0.85;

function updateConnections() {
  if (!canvasPipelineRef.value || !pipelineRef.value) return;

  const containerRect = canvasPipelineRef.value.getBoundingClientRect();
  // scrollWidth/scrollHeight are unscaled layout pixels — use these for SVG dimensions
  svgWidth.value  = Math.max(canvasPipelineRef.value.scrollWidth,  containerRect.width  / ZOOM_FACTOR);
  svgHeight.value = Math.max(canvasPipelineRef.value.scrollHeight, containerRect.height / ZOOM_FACTOR);

  const cols = Array.from(pipelineRef.value.querySelectorAll('.ob-pipeline__col'));
  if (cols.length < 5) return;

  const customerCol = cols[0];
  const productCol  = cols[1];
  const promoCol    = cols[2];
  const logisticsCol = cols[3];
  const checkoutCol = cols[4];

  const paths: ConnectionLine[] = [];

  // Convert a getBoundingClientRect anchor into SVG-space (unzoomed) coordinates.
  const getAnchorPos = (el: Element | null, position: 'left' | 'right') => {
    if (!el) return null;
    const anchorEl = el.querySelector(`.ob-node__anchor--${position}`) || el;
    const rect = anchorEl.getBoundingClientRect();
    // Subtract container origin (both in zoomed viewport coords), then divide by zoom
    const relX = (position === 'left' ? rect.left : rect.right) - containerRect.left;
    const relY = rect.top + rect.height / 2 - containerRect.top;
    const x = relX / ZOOM_FACTOR + canvasPipelineRef.value!.scrollLeft;
    const y = relY / ZOOM_FACTOR + canvasPipelineRef.value!.scrollTop;
    return { x, y };
  };

  const customerNode   = customerCol.querySelector('.ob-node');
  const rawProductNodes = Array.from(productCol.querySelectorAll('.ob-node'));
  let targetProductNodes = rawProductNodes;
  if (isCompactMode.value && rawProductNodes.length > 2) {
    targetProductNodes = [rawProductNodes[0], rawProductNodes[rawProductNodes.length - 1]];
  }
  const promoNode      = promoCol.querySelector('.ob-node');
  const logisticsNode  = logisticsCol.querySelector('.ob-node');
  const checkoutNode   = checkoutCol.querySelector('.ob-node');

  const customerAnchor      = getAnchorPos(customerNode, 'right');
  const promoAnchorLeft     = getAnchorPos(promoNode, 'left');
  const promoAnchorRight    = getAnchorPos(promoNode, 'right');
  const logisticsAnchorLeft = getAnchorPos(logisticsNode, 'left');
  const logisticsAnchorRight = getAnchorPos(logisticsNode, 'right');
  const checkoutAnchorLeft  = getAnchorPos(checkoutNode, 'left');

  const numProducts = targetProductNodes.length;
  // Tighter spread for 5-column layout
  const spreadStep = numProducts > 1 ? Math.min(12, 36 / (numProducts - 1)) : 0;

  // 1. Customer -> Products
  if (customerAnchor) {
    targetProductNodes.forEach((prodNode, idx) => {
      const prodAnchor = getAnchorPos(prodNode, 'left');
      if (prodAnchor) {
        const startYOffset = (idx - (numProducts - 1) / 2) * spreadStep;
        const color = LINE_COLORS[idx % LINE_COLORS.length];
        paths.push({
          id: `cust-prod-${idx}`,
          d: createCurvedPath(customerAnchor.x, customerAnchor.y + startYOffset, prodAnchor.x, prodAnchor.y),
          stroke: color,
          color,
        });
      }
    });
  }

  // 2. Products -> Promo
  if (promoAnchorLeft) {
    targetProductNodes.forEach((prodNode, idx) => {
      const prodAnchor = getAnchorPos(prodNode, 'right');
      if (prodAnchor) {
        const endYOffset = (idx - (numProducts - 1) / 2) * spreadStep;
        const color = LINE_COLORS[idx % LINE_COLORS.length];
        paths.push({
          id: `prod-promo-${idx}`,
          d: createCurvedPath(prodAnchor.x, prodAnchor.y, promoAnchorLeft.x, promoAnchorLeft.y + endYOffset),
          stroke: color,
          color,
        });
      }
    });
  }

  // 3. Promo -> Logistics
  if (promoAnchorRight && logisticsAnchorLeft) {
    paths.push({
      id: 'promo-log',
      d: createCurvedPath(promoAnchorRight.x, promoAnchorRight.y, logisticsAnchorLeft.x, logisticsAnchorLeft.y),
      stroke: '#f59e0b',
      color: '#f59e0b',
    });
  }

  // 4. Logistics -> Checkout
  if (logisticsAnchorRight && checkoutAnchorLeft) {
    paths.push({
      id: 'log-chk',
      d: createCurvedPath(logisticsAnchorRight.x, logisticsAnchorRight.y, checkoutAnchorLeft.x, checkoutAnchorLeft.y),
      stroke: '#0068FF',
      color: '#0068FF',
    });
  }

  connectionPaths.value = paths;
}

function scheduleUpdate() {
  nextTick(() => {
    setTimeout(updateConnections, 50);
  });
}

onMounted(() => {
  scheduleUpdate();
  window.addEventListener('resize', updateConnections);
});

onUpdated(() => {
  scheduleUpdate();
});

watch(() => [props.cartItems, props.branch, props.selectedPaymentMethod, props.drafts, props.activeDraftId], () => {
  scheduleUpdate();
}, { deep: true });

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateConnections);
});
</script>

<style scoped>
.ob-canvas {
  flex: 1;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 500px;
}

/* ─── Tabs Bar ─── */
.ob-canvas__tabs-bar {
  background: #f1f5f9;
  border-bottom: 1px solid #e2e8f0;
  padding: 8px 16px;
  flex-shrink: 0;
  user-select: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.ob-canvas__tabs-list {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  flex: 1;
}

/* ─── Price Book Selector ─── */
.ob-canvas__price-book {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.ob-canvas__price-book-box {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #fff;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 4px 10px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.03);
}
.ob-canvas__price-book-label {
  font-size: 11px;
  font-weight: 700;
  color: #475569;
  white-space: nowrap;
}
.ob-canvas__price-book-select {
  border: none;
  background: transparent;
  font-size: 12px;
  font-weight: 700;
  color: #0068FF;
  outline: none;
  cursor: pointer;
  padding-right: 4px;
}
.ob-canvas__price-book-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 700;
  padding: 4px 8px;
  border-radius: 6px;
  white-space: nowrap;
}
.ob-price-book-badge--standard {
  background: #fff;
  color: #64748b;
  border: 1px solid #cbd5e1;
}
.ob-price-book-badge--fixed {
  background: #fef3c7;
  color: #b45309;
  border: 1px solid #fde68a;
}
.ob-price-book-badge--sync {
  background: #eff6ff;
  color: #0068FF;
  border: 1px solid #bfdbfe;
}
.ob-sync-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #0068FF;
  animation: ob-pulse 1.5s infinite;
}
@keyframes ob-pulse {
  0% { opacity: 0.3; }
  50% { opacity: 1; }
  100% { opacity: 0.3; }
}
.ob-text-strikethrough {
  text-decoration: line-through;
  opacity: 0.6;
  margin-right: 4px;
}

.ob-canvas__tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 10px;
  cursor: pointer;
  border: 1px solid rgba(203,213,225,0.4);
  background: rgba(226,232,240,0.5);
  color: #64748b;
  transition: all 0.15s ease;
  flex-shrink: 0;
}
.ob-canvas__tab:hover {
  background: #e2e8f0;
}
.ob-canvas__tab--active {
  background: #fff;
  border-color: #0068FF;
  color: #1e293b;
  box-shadow: 0 1px 3px rgba(0,104,255,0.08);
  ring: 1px solid rgba(0,104,255,0.1);
}
.ob-canvas__tab-info {
  text-align: left;
}
.ob-canvas__tab-title {
  display: flex;
  align-items: center;
  gap: 4px;
}
.ob-canvas__tab-number {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.ob-canvas__tab-sep {
  opacity: 0.4;
  font-size: 9px;
}
.ob-canvas__tab-customer {
  font-size: 10px;
  font-weight: 600;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ob-canvas__tab-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
  font-size: 9px;
  font-family: monospace;
  color: #94a3b8;
}
.ob-canvas__tab-amount {
  font-weight: 700;
  color: #64748b;
}
.ob-canvas__tab-close {
  padding: 2px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.15s ease;
  margin-left: 4px;
}
.ob-canvas__tab-close:hover {
  background: #fef2f2;
  color: #ef4444;
}
.ob-canvas__tab-add {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-radius: 10px;
  border: 1px dashed #cbd5e1;
  background: transparent;
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}
.ob-canvas__tab-add:hover {
  border-color: #0068FF;
  background: rgba(0,104,255,0.03);
  color: #0068FF;
}

/* ─── Pipeline ─── */
.ob-canvas__pipeline {
  position: relative;
  flex: 1;
  overflow: auto;
  padding: 24px;
  zoom: 0.85;
  /* Scale nội dung bên trong 85% */
}
.ob-pipeline-svg {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  z-index: 5;
}
.ob-pipeline-path {
  /* Static dashed lines - no animation */
}
.ob-pipeline {
  position: relative;
  z-index: 10;
  display: flex;
  gap: 36px;
  align-items: flex-start;
  justify-content: space-between;
  width: 100%;
  height: 100%;
}
.ob-pipeline__col {
  flex: 1;
  min-width: 160px;
  max-width: 210px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
/* Cột Khuyến mãi hẹp hơn một chút */
.ob-pipeline__col--promo {
  min-width: 140px;
  max-width: 180px;
}
.ob-pipeline__col-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 4px;
  color: #64748b;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* ─── Promo Node (Khuyến mãi) ─── */
.ob-node--promo {
  border-color: #f59e0b;
  background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
}
.ob-node__promo-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 8px;
  padding: 8px 4px;
}
.ob-node__promo-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: #fef3c7;
  border: 1.5px dashed #f59e0b;
  color: #f59e0b;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ob-node__promo-title {
  font-size: 11px;
  font-weight: 800;
  color: #b45309;
  margin: 0;
}
.ob-node__promo-desc {
  font-size: 9.5px;
  color: #92400e;
  margin: 0;
  line-height: 1.5;
  opacity: 0.85;
}
.ob-node__promo-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 9px;
  font-weight: 700;
  background: #fef3c7;
  color: #b45309;
  padding: 3px 8px;
  border-radius: 12px;
  border: 1px solid #fde68a;
}
.ob-node__promo-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #f59e0b;
  animation: ob-pulse 1.5s infinite;
}

/* Promo node active state (KM đã áp dụng) */
.ob-node--promo-active {
  border-color: #f59e0b !important;
  background: linear-gradient(135deg, #fffbeb 0%, #fef9ee 100%) !important;
}
.ob-promo-node__count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 15px;
  height: 15px;
  border-radius: 8px;
  background: #f59e0b;
  color: #fff;
  font-size: 8px;
  font-weight: 800;
  padding: 0 3px;
  margin-left: 3px;
}

/* Applied promos list */
.ob-node__promo-applied {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 2px 0;
}
.ob-node__promo-applied-item {
  display: flex;
  align-items: center;
  gap: 5px;
  background: #fff;
  border: 1px solid #fde68a;
  border-radius: 6px;
  padding: 4px 7px;
}
.ob-node__promo-applied-badge {
  font-size: 13px;
  line-height: 1;
}
.ob-node__promo-applied-tag {
  font-size: 9px;
  font-weight: 700;
  color: #b45309;
  flex: 1;
}
.ob-node__promo-applied-footer {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 8.5px;
  color: #22c55e;
  font-weight: 600;
  margin-top: 2px;
  padding-top: 4px;
  border-top: 1px dashed #fde68a;
}

/* Gift items in promo column */
.ob-node__gift-section {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed #fde68a;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ob-node__gift-title {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 8.5px;
  font-weight: 700;
  color: #f59e0b;
  margin-bottom: 2px;
}
.ob-node__gift-item {
  display: flex;
  align-items: center;
  gap: 5px;
  background: linear-gradient(135deg, #fffbeb, #fef3c7);
  border: 1px solid #fde68a;
  border-radius: 6px;
  padding: 4px 7px;
}
.ob-node__gift-emoji { font-size: 12px; flex-shrink: 0; }
.ob-node__gift-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.ob-node__gift-name {
  font-size: 8.5px;
  font-weight: 700;
  color: #92400e;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ob-node__gift-qty {
  font-size: 8px;
  color: #b45309;
}
.ob-node__gift-price {
  font-size: 8px;
  font-weight: 800;
  color: #16a34a;
  white-space: nowrap;
  background: #dcfce7;
  padding: 1px 5px;
  border-radius: 10px;
}

/* ─── Nodes ─── */
.ob-node {
  background: #fff;
  border: 2px solid #e2e8f0;
  border-radius: 12px;
  padding: 10px;
  position: relative;
  transition: all 0.2s ease;
}
.ob-node:hover {
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}
.ob-node--customer { border-color: #0068FF; }
.ob-node--product { border-color: #10b981; }
.ob-node--logistics { border-color: #6366f1; }
.ob-node--empty {
  background: #f1f5f9;
  border: 1px dashed #cbd5e1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px 16px;
  color: #94a3b8;
  font-size: 10px;
  text-align: center;
}
.ob-node--checkout {
  background: #eff6ff;
  border-color: #3b82f6;
  color: #1e3a8a;
  overflow: hidden;
  box-shadow: 0 4px 14px rgba(59,130,246,0.12);
  padding: 16px;
  min-height: 180px;
}

/* Node anchors */
.ob-node__anchor {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid #fff;
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 30;
  box-shadow: 0 1px 2px rgba(0,0,0,0.1);
}
.ob-node__anchor--left { left: -6px; }
.ob-node__anchor--right { right: -6px; }

/* Customer Node */
.ob-node__customer-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.ob-node__avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, #0068FF, #3b82f6);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 14px;
  flex-shrink: 0;
}
.ob-node__customer-info h4 {
  font-size: 12px;
  font-weight: 800;
  color: #1e293b;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ob-node__customer-info p {
  font-size: 10px;
  color: #94a3b8;
  margin: 2px 0 0;
}
.ob-node__badge {
  display: inline-block;
  font-size: 9px;
  font-weight: 600;
  background: #eff6ff;
  color: #0068FF;
  padding: 1px 6px;
  border-radius: 4px;
  margin-top: 4px;
}

/* Product Node */
.ob-node__product-row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}
.ob-node__product-color {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 700;
  font-size: 9px;
  flex-shrink: 0;
}
.ob-node__product-info {
  flex: 1;
  min-width: 0;
}
.ob-node__product-info h4 {
  font-size: 11px;
  font-weight: 700;
  color: #1e293b;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-right: 16px;
}
.ob-node__product-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 3px;
  font-size: 9px;
}
.ob-node__product-remove {
  position: absolute;
  right: 6px;
  top: 6px;
  padding: 2px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: #ef4444;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease;
}
.ob-node--product:hover .ob-node__product-remove {
  opacity: 1;
}
.ob-node__product-remove:hover {
  background: #fef2f2;
}

/* Quantity Row */
.ob-node__qty-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px solid #f1f5f9;
}
.ob-node__qty-controls {
  display: flex;
  align-items: center;
  gap: 4px;
  background: #f8fafc;
  border: 1px solid rgba(226,232,240,0.5);
  border-radius: 6px;
  padding: 2px;
}
.ob-node__qty-controls button {
  padding: 3px;
  border: none;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  border-radius: 3px;
  transition: all 0.1s ease;
}
.ob-node__qty-controls button:hover {
  color: #1e293b;
  background: #fff;
}
.ob-node__qty-controls span {
  width: 20px;
  text-align: center;
  font-size: 10px;
  font-weight: 700;
}

/* Logistics Node */
.ob-node__logistics-section {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}
.ob-node__logistics-icon {
  padding: 4px;
  border-radius: 6px;
  flex-shrink: 0;
  color: #fff;
}
.ob-node__logistics-label {
  font-size: 8px;
  color: #94a3b8;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0;
}
.ob-node__logistics-value {
  font-size: 11px;
  font-weight: 700;
  color: #1e293b;
  margin: 2px 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ob-node__logistics-arrow {
  display: flex;
  justify-content: center;
  align-items: center;
  margin: 4px 0 -4px;
}
.ob-node__delivery-body {
  flex: 1;
  min-width: 0;
}
.ob-node__delivery-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.ob-api-tooltip-trigger {
  position: relative;
  display: inline-block;
}
.ob-api-badge {
  font-size: 8px;
  font-weight: 700;
  color: #3b82f6;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  padding: 1px 4px;
  border-radius: 4px;
  cursor: pointer;
}
.ob-api-tooltip-popover {
  visibility: hidden;
  opacity: 0;
  width: 170px;
  background-color: #1e293b;
  color: #fff;
  text-align: center;
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 10px;
  font-weight: 600;
  position: absolute;
  z-index: 100;
  bottom: 125%;
  left: 50%;
  transform: translateX(-50%);
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  transition: opacity 0.2s ease, visibility 0.2s ease;
  pointer-events: none;
}
.ob-api-tooltip-trigger:hover .ob-api-tooltip-popover {
  visibility: visible;
  opacity: 1;
}
.ob-node__delivery-input {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 700;
  color: #1e293b;
  margin-top: 3px;
  background: #fff;
  transition: all 0.15s ease;
}
.ob-node__delivery-input:focus {
  outline: none;
  border-color: #0068FF;
  box-shadow: 0 0 0 2px rgba(0,104,255,0.15);
}
.ob-bg-blue-light {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
}
.ob-node__logistics-divider {
  height: 1px;
  background: #f1f5f9;
  margin: 10px 0;
}
.ob-node__logistics-field {
  flex: 1;
  min-width: 0;
}
.ob-node__logistics-select {
  width: 100%;
  margin-top: 3px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 4px 6px;
  font-size: 11px;
  font-weight: 700;
  color: #1e293b;
  background: #fff;
  outline: none;
  cursor: pointer;
  transition: all 0.15s ease;
  appearance: auto;
}
.ob-node__logistics-select:focus {
  border-color: #0068FF;
  box-shadow: 0 0 0 2px rgba(0,104,255,0.15);
}

/* Checkout Node */
.ob-node__checkout-glow {
  position: absolute;
  right: -40px;
  bottom: -40px;
  width: 96px;
  height: 96px;
  background: rgba(255,255,255,0.1);
  border-radius: 50%;
  filter: blur(16px);
}
.ob-node__checkout-title {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.9;
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 0;
}
.ob-node__checkout-rows {
  margin-top: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(255,255,255,0.1);
}
.ob-node__checkout-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 10px;
  font-weight: 500;
  margin-bottom: 4px;
}

/* Product Discount & Final Price Rows */
.ob-node__discount-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed #f1f5f9;
  font-size: 10px;
}
.ob-node__discount-label {
  color: #64748b;
  font-weight: 600;
}
.ob-node__discount-input-wrap {
  display: flex;
  align-items: center;
  gap: 2px;
  background: #fff5f5;
  border: 1px solid #fecaca;
  border-radius: 6px;
  padding: 1px 4px;
}
.ob-node__discount-minus {
  color: #ef4444;
  font-weight: 800;
  font-size: 11px;
}
.ob-node__discount-input {
  width: 50px;
  border: none;
  background: transparent;
  text-align: right;
  font-size: 11px;
  font-weight: 700;
  color: #ef4444;
  outline: none;
  font-family: monospace;
}
.ob-node__discount-unit {
  font-size: 10px;
  color: #ef4444;
  font-weight: 700;
  text-decoration: underline;
}

.ob-node__final-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 4px;
}
.ob-node__final-label {
  font-size: 11px;
  font-weight: 800;
  color: #047857;
}
.ob-node__final-amount {
  font-size: 12px;
  font-weight: 800;
  color: #047857;
  font-family: monospace;
}

/* Checkout Discount Input */
.ob-node__checkout-discount-wrap {
  display: flex;
  align-items: center;
  gap: 2px;
  background: #fff;
  border: 1px solid #bfdbfe;
  border-radius: 6px;
  padding: 1px 6px;
}
.ob-node__checkout-discount-input {
  width: 60px;
  border: none;
  background: transparent;
  text-align: right;
  font-size: 11px;
  font-weight: 800;
  color: #1e3a8a;
  outline: none;
  font-family: monospace;
}
.ob-node__discount-input::-webkit-outer-spin-button,
.ob-node__discount-input::-webkit-inner-spin-button,
.ob-node__checkout-discount-input::-webkit-outer-spin-button,
.ob-node__checkout-discount-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.ob-node__discount-input,
.ob-node__checkout-discount-input {
  -moz-appearance: textfield;
  appearance: textfield;
}
.ob-node__checkout-discount-input::placeholder {
  color: #94a3b8;
}
.ob-node__checkout-row span:first-child {
  opacity: 0.85;
}
.ob-node__checkout-total {
  padding-top: 8px;
  display: flex;
  flex-direction: column;
}
.ob-node__checkout-total span:first-child {
  font-size: 9px;
  text-transform: uppercase;
  font-weight: 700;
  opacity: 0.8;
}
.ob-node__checkout-total-amount {
  font-size: 18px;
  font-weight: 800;
  font-family: monospace;
  margin-top: 2px;
  letter-spacing: -0.02em;
  color: #0068FF;
}
.ob-node__checkout-btn {
  width: 100%;
  background: #0068FF;
  color: #fff;
  border: none;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 14px;
  cursor: pointer;
  transition: all 0.15s ease;
  position: relative;
  z-index: 30;
}
.ob-node__checkout-btn:hover {
  background: #0056d2;
  box-shadow: 0 4px 12px rgba(0,104,255,0.25);
}

/* ─── Utility ─── */
.ob-text-blue { color: #0068FF; }
.ob-text-green { color: #10b981; }
.ob-text-indigo { color: #6366f1; }
.ob-text-amber { color: #f59e0b; }
.ob-text-muted { color: #94a3b8; }
.ob-text-bold { font-weight: 700; color: #1e293b; }
.ob-mono { font-family: monospace; }
.ob-bg-blue { background: #eff6ff; color: #0068FF; }
.ob-bg-green { background: #ecfdf5; color: #10b981; }

/* ─── Compact Mode & Accordion ─── */
.ob-compact-badge {
  font-size: 9px;
  font-weight: 700;
  color: #0068FF;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  padding: 1px 6px;
  border-radius: 10px;
  margin-left: auto;
}

.ob-compact-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
  width: 100%;
  padding-right: 4px;
}

/* Custom Scrollbar for Compact List */
.ob-compact-group::-webkit-scrollbar {
  width: 4px;
}
.ob-compact-group::-webkit-scrollbar-track {
  background: #f1f5f9;
  border-radius: 4px;
}
.ob-compact-group::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
}
.ob-compact-group::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}

.ob-node--product-collapsed {
  cursor: pointer;
  padding: 8px 10px !important;
  border-color: #e2e8f0;
  transition: all 0.15s ease;
}
.ob-node--product-collapsed:hover {
  border-color: #0068FF !important;
  box-shadow: 0 3px 10px rgba(0, 104, 255, 0.12) !important;
}
</style>
