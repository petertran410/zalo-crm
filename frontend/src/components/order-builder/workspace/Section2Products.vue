<template>
  <div class="s2-products">
    <!-- ═══ PRODUCT SEARCH & GRID ═══ -->
    <div class="s2-search-zone">
      <div class="s2-search-bar">
        <Search :size="14" class="s2-search-bar__icon" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Tìm sản phẩm (Tên, mã SP...)"
          class="s2-search-bar__input"
          @input="onSearchInput"
        />
      </div>

      <!-- Price Book selector inline -->
      <div class="s2-pricebook">
        <Tag :size="13" class="s2-pricebook__icon" />
        <span class="s2-pricebook__label">Bảng giá:</span>
        <select
          :value="selectedPriceBookId || 'standard'"
          class="s2-pricebook__select"
          @change="$emit('select-price-book', ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="pb in PRICE_BOOKS" :key="pb.id" :value="pb.id">
            {{ pb.name }} {{ pb.discountPercent ? `(-${pb.discountPercent}%)` : '' }}
          </option>
        </select>
      </div>
    </div>

    <!-- Product Grid (paginated) -->
    <div class="s2-grid-wrapper">
      <!-- Grid luôn render trong DOM, không bị unmount khi loading -->
      <div class="s2-grid-area">
        <!-- Loading overlay — đè lên grid, không thay thế grid -->
        <div v-if="productsLoading" class="s2-loading-overlay">
          <Loader2 :size="22" class="s2-spin" />
          <span>Đang tải...</span>
        </div>

        <!-- Empty state (chỉ hiện khi không loading và không có data) -->
        <div v-if="!productsLoading && paginatedProducts.length === 0" class="s2-empty-overlay">
          <ShoppingBag :size="28" :stroke-width="1" />
          <span>Không tìm thấy sản phẩm phù hợp.</span>
        </div>

        <!-- Grid — luôn dùng v-show, không dùng v-if -->
        <div
          class="s2-product-grid"
          :class="{ 's2-product-grid--loading': productsLoading }"
          @scroll="handleListScroll"
        >
          <div
            v-for="product in paginatedProducts"
            :key="product.id"
            class="s2-product-tile"
            :class="{ 's2-product-tile--selected': isProductSelected(product.id) }"
            @click="$emit('add-product', product)"
            @mouseenter="handleMouseEnter(product, $event)"
            @mouseleave="handleMouseLeave"
          >
            <div v-if="product.imageUrl && !failedImgMap[product.id]" class="s2-product-tile__img-wrap">
              <img
                :src="product.imageUrl"
                :alt="product.name"
                class="s2-product-tile__img"
                @error="handleTileImgError($event, product)"
              />
            </div>
            <div v-else class="s2-product-tile__color" :style="{ background: getProductColor(product.categoryName) }">
              {{ (product.code || '').substring(0, 3) }}
            </div>
            <div class="s2-product-tile__info">
              <h4 class="s2-product-tile__name">{{ product.name }}</h4>
              <div class="s2-product-tile__meta">
                <span class="s2-product-tile__sku">{{ product.code }}</span>
                <span class="s2-product-tile__stock">Kho: {{ product.onHand ?? '—' }}</span>
              </div>
              <div class="s2-product-tile__footer">
                <span class="s2-product-tile__price">{{ formatVND(product.basePrice) }}</span>
                <span v-if="isProductSelected(product.id)" class="s2-product-tile__qty-badge">
                  ×{{ selectedProductIds[product.id] }}
                </span>
                <span v-else class="s2-product-tile__add">
                  Thêm <Plus :size="12" />
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Pagination controls -->
      <div class="s2-pagination">
        <span class="s2-pagination__info">
          {{ paginatedProducts.length }} sản phẩm trang này
        </span>
        <div class="s2-pagination__nav">
          <button
            class="s2-page-btn"
            :disabled="!productsPrevAvailable || productsLoading"
            :class="{ 's2-page-btn--disabled': !productsPrevAvailable || productsLoading }"
            @click="goProductsPrev"
          >
            <ChevronLeft :size="14" :stroke-width="2.5" />
            <span>Trước</span>
          </button>
          <button
            class="s2-page-btn"
            :disabled="!productsNextAvailable || productsLoading"
            :class="{ 's2-page-btn--disabled': !productsNextAvailable || productsLoading }"
            @click="goProductsNext"
          >
            <span>Sau</span>
            <ChevronRight :size="14" :stroke-width="2.5" />
          </button>
        </div>
      </div>
    </div>


    <!-- ═══ CART TABLE (Selected Products) ═══ -->
    <div v-if="cartItems.length > 0" class="s2-cart">
      <div class="s2-cart__header">
        <ShoppingBag :size="14" class="s2-cart__header-icon" />
        <span class="s2-cart__header-title">Sản phẩm đã chọn ({{ realCartItems.length }})</span>
        <span class="s2-cart__header-total">{{ formatVND(totalBeforeDiscount) }}</span>
      </div>

      <div class="s2-cart__table">
        <div class="s2-cart__table-head">
          <span class="s2-col s2-col--name">Sản phẩm</span>
          <span class="s2-col s2-col--price">Đơn giá</span>
          <span class="s2-col s2-col--qty">SL</span>
          <span class="s2-col s2-col--discount">CK</span>
          <span class="s2-col s2-col--total">Thành tiền</span>
          <span class="s2-col s2-col--action"></span>
        </div>
        <div
          v-for="item in realCartItems"
          :key="item.product.id"
          class="s2-cart__row"
          :class="{ 's2-cart__row--gift': item.isGift }"
        >
          <div class="s2-col s2-col--name">
            <div class="s2-cart__product-color" :style="{ background: getProductColor(item.product.categoryName) }">
              {{ (item.product.code || '').substring(0, 2) }}
            </div>
            <div class="s2-cart__product-name-wrap">
              <span class="s2-cart__product-name">{{ item.product.name }}</span>
              <span v-if="item.isGift" class="s2-cart__gift-badge">🎁 Quà tặng</span>
            </div>
          </div>
          <span class="s2-col s2-col--price s2-mono">
            <template v-if="selectedPriceBookId && selectedPriceBookId !== 'standard' && selectedPriceBookId !== 'pos_sync'">
              <s class="s2-strikethrough">{{ formatVND(item.product.basePrice) }}</s>
              {{ formatVND(getEffectiveProductPrice(item.product.basePrice, selectedPriceBookId)) }}
            </template>
            <template v-else>
              {{ formatVND(item.product.basePrice) }}
            </template>
          </span>
          <div class="s2-col s2-col--qty">
            <div v-if="!item.isGift" class="s2-qty-controls">
              <button
                type="button"
                class="s2-qty-btn"
                title="Giảm"
                @click="$emit('update-quantity', item.product.id, Math.max(1, item.quantity - 1))"
              >
                <Minus :size="9" :stroke-width="2.5" />
              </button>
              <input
                type="number"
                class="s2-qty-input s2-mono"
                :value="item.quantity"
                min="1"
                @input="onQuantityInput(item.product.id, ($event.target as HTMLInputElement).value)"
                @blur="onQuantityBlur(item.product.id, ($event.target as HTMLInputElement).value)"
              />
              <button
                type="button"
                class="s2-qty-btn"
                title="Tăng"
                @click="$emit('update-quantity', item.product.id, item.quantity + 1)"
              >
                <Plus :size="9" :stroke-width="2.5" />
              </button>
            </div>
            <span v-else class="s2-mono">{{ item.quantity }}</span>
          </div>
          <div class="s2-col s2-col--discount">
            <div v-if="!item.isGift" class="s2-discount-wrap">
              <span class="s2-discount-minus">-</span>
              <input
                type="number"
                :value="item.discount || ''"
                placeholder="0"
                min="0"
                :max="getEffectiveProductPrice(item.product.basePrice, selectedPriceBookId) * item.quantity"
                class="s2-discount-input"
                @input="onProductDiscountInput(item.product.id, Number(($event.target as HTMLInputElement).value) || 0, getEffectiveProductPrice(item.product.basePrice, selectedPriceBookId) * item.quantity)"
              />
              <span class="s2-discount-unit">đ</span>
            </div>
            <span v-else class="s2-text-muted">—</span>
          </div>
          <span class="s2-col s2-col--total s2-mono s2-text-bold">
            {{ item.isGift ? 'Miễn phí' : formatVND(Math.max(0, getEffectiveProductPrice(item.product.basePrice, selectedPriceBookId) * item.quantity - (item.discount || 0))) }}
          </span>
          <div class="s2-col s2-col--action">
            <button v-if="!item.isGift" class="s2-remove-btn" @click="$emit('remove-product', item.product.id)">
              <Trash2 :size="12" />
            </button>
          </div>
        </div>
      </div>

      <!-- Order discount -->
      <div class="s2-cart__order-discount">
        <span class="s2-cart__order-discount-label">Giảm giá tổng đơn:</span>
        <div class="s2-discount-wrap">
          <span class="s2-discount-minus">-</span>
          <input
            type="number"
            :value="orderDiscount || ''"
            placeholder="0"
            min="0"
            :max="totalBeforeDiscount"
            class="s2-discount-input s2-discount-input--wide"
            @input="onOrderDiscountInput(Number(($event.target as HTMLInputElement).value) || 0)"
          />
          <span class="s2-discount-unit">đ</span>
        </div>
      </div>

      <!-- Subtotal -->
      <div class="s2-cart__subtotal">
        <span>Tổng tạm tính:</span>
        <span class="s2-cart__subtotal-amount">{{ formatVND(grandTotal) }}</span>
      </div>
    </div>

    <!-- ═══ KHUYẾN MÃI SECTION ═══ -->
    <div class="s2-promo">
      <div class="s2-promo__header">
        <Tag :size="14" class="s2-promo__header-icon" />
        <span class="s2-promo__header-title">Khuyến mãi</span>
        <span class="s2-promo__header-count">{{ promotions.length }} chương trình</span>
        <span v-if="eligibleCount > 0" class="s2-promo__eligible">
          🟢 {{ eligibleCount }} sẵn sàng
        </span>
      </div>

      <div class="s2-promo__list">
        <div
          v-for="promo in promotions"
          :key="promo.id"
          class="s2-promo-card"
          :class="{
            's2-promo-card--applied': isApplied(promo.id),
            's2-promo-card--eligible': isEligible(promo) && !isApplied(promo.id),
            's2-promo-card--disabled': !isEligible(promo) && !isApplied(promo.id),
          }"
          :style="{ '--promo-color': promo.color, '--promo-bg': promo.colorBg }"
          @click="handlePromoClick(promo)"
        >
          <div
            class="s2-promo-card__bar"
            :style="{ background: (isEligible(promo) || isApplied(promo.id)) ? promo.color : '#cbd5e1' }"
          />
          <div class="s2-promo-card__body">
            <div class="s2-promo-card__top">
              <span
                class="s2-promo-card__badge"
                :style="(isEligible(promo) || isApplied(promo.id))
                  ? { background: promo.colorBg, color: promo.color, borderColor: promo.color + '33' }
                  : { background: '#f1f5f9', color: '#94a3b8', borderColor: '#e2e8f0' }"
              >
                {{ promo.badge }} {{ promo.tag }}
              </span>
              <span v-if="isApplied(promo.id)" class="s2-promo-card__applied">
                <Check :size="10" /> Đã dùng
              </span>
              <span v-else-if="isEligible(promo)" class="s2-promo-card__add-btn" :style="{ color: promo.color }">
                ▶ Áp dụng
              </span>
              <span v-else class="s2-promo-card__locked">🔒 Chưa đủ</span>
            </div>
            <h4 class="s2-promo-card__name" :class="{ 's2-promo-card__name--dim': !isEligible(promo) && !isApplied(promo.id) }">
              {{ promo.name }}
            </h4>
            <div class="s2-promo-card__info">
              <div class="s2-promo-card__row"><span class="s2-promo-card__label">ĐK:</span> {{ promo.conditionText }}</div>
              <div class="s2-promo-card__row s2-promo-card__row--reward" :class="{ 's2-promo-card__row--dim': !isEligible(promo) && !isApplied(promo.id) }">
                <span class="s2-promo-card__label">Thưởng:</span> {{ promo.rewardText }}
              </div>
            </div>
            <!-- Progress bar -->
            <div v-if="!isEligible(promo) && !isApplied(promo.id)" class="s2-promo-card__progress">
              <div class="s2-promo-card__progress-track">
                <div
                  class="s2-promo-card__progress-fill"
                  :style="{ width: promoProgressPct(promo) + '%', background: promo.color }"
                />
              </div>
              <span class="s2-promo-card__progress-text">{{ formatProgress(promo) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Coming Soon: Sản phẩm bán chạy theo mùa -->
      <div class="s2-coming-soon">
        <Sparkles :size="14" class="s2-coming-soon__icon" />
        <span class="s2-coming-soon__text">Sản phẩm bán chạy nhất theo mùa</span>
        <span class="s2-coming-soon__badge">Tính năng này sắp ra mắt</span>
      </div>
    </div>

    <!-- Product Detail Hover Preview Popover -->
    <ProductPreviewPopover
      :product="hoveredProduct"
      :target-rect="hoverTargetRect"
      :visible="isHoverVisible"
      :category-color="hoveredProduct ? getProductColor(hoveredProduct.categoryName) : undefined"
      @keep-open="handleKeepOpen"
      @close="handleMouseLeave"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue';
import ProductPreviewPopover from '../ProductPreviewPopover.vue';
import {
  Search, ShoppingBag, Tag, Plus, Minus, Trash2, Check,
  Loader2, Sparkles, ChevronLeft, ChevronRight,
} from 'lucide-vue-next';
import type { POSProduct, CartItem, PromotionProgram } from '../types';
import {
  formatVND, PRICE_BOOKS, getEffectiveProductPrice,
  MOCK_PROMOTIONS, evaluatePromoCondition, promoConditionProgress,
} from '../types';
import { usePagination } from '@/composables/use-pagination';

const props = defineProps<{
  selectedProductIds: Record<number, number>;
  cartItems: CartItem[];
  totalBeforeDiscount: number;
  orderDiscount: number;
  grandTotal: number;
  selectedPriceBookId?: string;
  appliedPromoIds: string[];
}>();

const emit = defineEmits<{
  'add-product': [product: POSProduct];
  'update-quantity': [productId: number, quantity: number];
  'remove-product': [productId: number];
  'update-product-discount': [productId: number, discount: number];
  'update-order-discount': [discount: number];
  'select-price-book': [priceBookId: string];
  'apply-promotion': [promo: PromotionProgram];
  'remove-promotion': [promoId: string];
}>();

// ─── Paginated Product Fetching ───────────────────────────────────────────────
const PRODUCTS_PER_PAGE = 18;

const {
  items: rawItems,
  loading: productsLoading,
  hasNext: productsHasNext,
  hasPrev: productsHasPrev,
  loadPage,
  nextPage: goProductsNext,
  prevPage: goProductsPrev,
  search: searchProducts,
  state: paginationState,
} = usePagination<any>({
  endpoint: '/pos/products',
  defaultLimit: PRODUCTS_PER_PAGE,
  defaultSortBy: 'code',
  defaultSortOrder: 'asc',
});

const productsNextAvailable = computed(() => productsHasNext.value);
const productsPrevAvailable = computed(() => productsHasPrev.value);

// Map raw API items to POSProduct shape
const paginatedProducts = computed<POSProduct[]>(() =>
  (rawItems.value || []).map((p: any) => ({
    id: p.posId ?? p.id,
    code: p.code || '',
    name: p.name || '',
    categoryName: p.categoryName || '',
    basePrice: p.basePrice || 0,
    unit: p.unit || '',
    onHand: p.onHand,
    imageUrl: p.images?.[0]?.image || p.imageUrl || undefined,
  }))
);

onMounted(() => {
  loadPage();
});

// ─── Search ───────────────────────────────────────────────────────────────────
const searchQuery = ref('');
let searchTimer: ReturnType<typeof setTimeout> | null = null;

function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    searchProducts(searchQuery.value);
  }, 300);
}

function isProductSelected(productId: number): boolean {
  return props.selectedProductIds[productId] !== undefined;
}

// ─── Cart ─────────────────────────────────────────────────────────────────────
const realCartItems = computed(() => props.cartItems.filter(c => !c.isGift));

function onProductDiscountInput(productId: number, val: number, maxDiscount: number) {
  const discount = Math.min(Math.max(0, val), maxDiscount);
  emit('update-product-discount', productId, discount);
}

function onQuantityInput(productId: number, valStr: string) {
  const val = parseInt(valStr, 10);
  if (!isNaN(val) && val >= 1) {
    emit('update-quantity', productId, val);
  }
}

function onQuantityBlur(productId: number, valStr: string) {
  const val = parseInt(valStr, 10);
  if (isNaN(val) || val < 1) {
    emit('update-quantity', productId, 1);
  }
}

function onOrderDiscountInput(val: number) {
  const discount = Math.min(Math.max(0, val), props.totalBeforeDiscount);
  emit('update-order-discount', discount);
}

// ─── Promotions ───────────────────────────────────────────────────────────────
const promotions = MOCK_PROMOTIONS;

function isEligible(promo: PromotionProgram): boolean {
  return evaluatePromoCondition(promo.condition, props.cartItems, props.totalBeforeDiscount);
}

function isApplied(promoId: string): boolean {
  return props.appliedPromoIds.includes(promoId);
}

const eligibleCount = computed(() =>
  promotions.filter(p => isEligible(p) && !isApplied(p.id)).length
);

function promoProgressPct(promo: PromotionProgram): number {
  const { current, required } = promoConditionProgress(promo.condition, props.cartItems, props.totalBeforeDiscount);
  return required > 0 ? Math.min(100, (current / required) * 100) : 0;
}

function formatProgress(promo: PromotionProgram): string {
  const { current, required } = promoConditionProgress(promo.condition, props.cartItems, props.totalBeforeDiscount);
  if (promo.condition.type === 'min_order_amount') {
    return `${formatVND(current)} / ${formatVND(required)}`;
  }
  return `Còn thiếu ${required - current} sản phẩm`;
}

function handlePromoClick(promo: PromotionProgram) {
  if (isApplied(promo.id)) {
    emit('remove-promotion', promo.id);
  } else if (isEligible(promo)) {
    emit('apply-promotion', promo);
  }
}

// ─── Color palette ────────────────────────────────────────────────────────────
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

// ─── Product Image Error Handling ─────────────────────────────────────
const failedImgMap = reactive<Record<string, boolean>>({});

function handleTileImgError(e: Event, product: any) {
  const target = e.target as HTMLImageElement;
  if (product.originalImageUrl && target.src !== product.originalImageUrl) {
    target.src = product.originalImageUrl;
  } else {
    failedImgMap[product.id] = true;
  }
}

// ─── Product Hover Preview State & Handlers ───────────────────────────
const hoveredProduct = ref<POSProduct | null>(null);
const hoverTargetRect = ref<DOMRect | null>(null);
const isHoverVisible = ref(false);
let hoverTimer: ReturnType<typeof setTimeout> | null = null;
let leaveTimer: ReturnType<typeof setTimeout> | null = null;

const DWELL_DELAY_MS = 1250; // Chuột dừng cố định 1.25 giây mới kích hoạt

function handleMouseEnter(product: POSProduct, event: MouseEvent) {
  // Chỉ áp dụng hover trên Desktop (pointer: fine)
  if (window.matchMedia && !window.matchMedia('(pointer: fine)').matches) return;

  // Luôn hủy timer và ẩn popover cũ ngay khi di chuyển sang sản phẩm mới
  if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
  if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }

  isHoverVisible.value = false;
  hoveredProduct.value = null;
  hoverTargetRect.value = null;

  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();

  // Chỉ khi chuột dừng cố định 1.25 giây trên sản phẩm này mới bật Popover
  hoverTimer = setTimeout(() => {
    hoveredProduct.value = product;
    hoverTargetRect.value = rect;
    isHoverVisible.value = true;
  }, DWELL_DELAY_MS);
}

function handleMouseLeave() {
  if (hoverTimer) {
    clearTimeout(hoverTimer);
    hoverTimer = null;
  }
  if (leaveTimer) {
    clearTimeout(leaveTimer);
    leaveTimer = null;
  }
  // Rời khỏi sản phẩm -> Tắt popover ngay lập tức
  isHoverVisible.value = false;
  hoveredProduct.value = null;
  hoverTargetRect.value = null;
}

function handleKeepOpen() {
  if (leaveTimer) {
    clearTimeout(leaveTimer);
    leaveTimer = null;
  }
}

function handleListScroll() {
  if (hoverTimer) clearTimeout(hoverTimer);
  if (leaveTimer) clearTimeout(leaveTimer);
  isHoverVisible.value = false;
  hoveredProduct.value = null;
  hoverTargetRect.value = null;
}

onUnmounted(() => {
  if (hoverTimer) clearTimeout(hoverTimer);
  if (leaveTimer) clearTimeout(leaveTimer);
});
</script>

<style scoped>
.s2-products {
  padding-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ─── Search Zone ─── */
.s2-search-zone {
  display: flex;
  gap: 10px;
  align-items: center;
}
.s2-search-bar {
  flex: 1;
  position: relative;
}
.s2-search-bar__icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: #94a3b8;
}
.s2-search-bar__input {
  width: 100%;
  padding: 8px 12px 8px 32px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  font-size: 12.5px;
  background: #f8fafc;
  outline: none;
  transition: all 0.15s;
  box-sizing: border-box;
}
.s2-search-bar__input:focus {
  border-color: #0068FF;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(0, 104, 255, 0.08);
}

/* ─── Price Book ─── */
.s2-pricebook {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 5px 10px;
  flex-shrink: 0;
}
.s2-pricebook__icon {
  color: #0068FF;
  flex-shrink: 0;
}
.s2-pricebook__label {
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
  white-space: nowrap;
}
.s2-pricebook__select {
  border: none;
  background: transparent;
  font-size: 11.5px;
  font-weight: 600;
  color: #1e293b;
  outline: none;
  cursor: pointer;
}

/* ─── Grid Wrapper + Pagination ─── */
.s2-grid-wrapper {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Container luôn giữ chiều cao ổn định — không bị collapse khi loading */
.s2-grid-area {
  position: relative;
  min-height: 220px;
}

/* Loading overlay: đè lên grid, KHÔNG unmount grid */
.s2-loading-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: rgba(248, 250, 252, 0.85);
  backdrop-filter: blur(2px);
  border-radius: 10px;
  font-size: 11px;
  color: #64748b;
  font-weight: 600;
}

/* Empty state overlay */
.s2-empty-overlay {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #94a3b8;
  font-size: 12px;
  border: 1px dashed #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
}

/* Grid mờ đi khi đang loading, nhưng VẪN chiếm không gian — không giật layout */
.s2-product-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 8px;
  padding: 2px;
  transition: opacity 0.2s ease;
}
.s2-product-grid--loading {
  opacity: 0.35;
  pointer-events: none;
}

/* ─── Pagination Controls ─── */
.s2-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 4px 0;
  border-top: 1px solid #f1f5f9;
  margin-top: 2px;
}
.s2-pagination__info {
  font-size: 10.5px;
  color: #94a3b8;
  font-weight: 500;
}
.s2-pagination__nav {
  display: flex;
  align-items: center;
  gap: 6px;
}
.s2-page-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  font-size: 11.5px;
  font-weight: 600;
  color: #475569;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}
.s2-page-btn:hover:not(.s2-page-btn--disabled) {
  background: #eff6ff;
  color: #0068FF;
  border-color: #93c5fd;
}
.s2-page-btn--disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.s2-empty {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px;
  color: #94a3b8;
  font-size: 12px;
}

.s2-product-tile {
  display: flex;
  gap: 8px;
  padding: 8px;
  border: 1px solid #f1f5f9;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s;
  background: #fff;
  user-select: none;
}
.s2-product-tile:hover {
  border-color: #cbd5e1;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
}
.s2-product-tile--selected {
  border-color: #0068FF;
  background: rgba(0, 104, 255, 0.03);
}

.s2-product-tile__img-wrap {
  width: 34px;
  height: 34px;
  border-radius: 7px;
  overflow: hidden;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.s2-product-tile__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.s2-product-tile__color {
  width: 34px;
  height: 34px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 700;
  font-size: 8.5px;
  flex-shrink: 0;
}
.s2-product-tile__info { flex: 1; min-width: 0; }
.s2-product-tile__name {
  font-size: 11px;
  font-weight: 600;
  color: #1e293b;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.s2-product-tile__meta {
  display: flex;
  gap: 6px;
  margin-top: 2px;
}
.s2-product-tile__sku {
  font-size: 9.5px;
  background: #f1f5f9;
  color: #64748b;
  padding: 0 5px;
  border-radius: 3px;
  font-weight: 500;
}
.s2-product-tile__stock {
  font-size: 9.5px;
  color: #94a3b8;
}
.s2-product-tile__footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 4px;
}
.s2-product-tile__price {
  font-size: 11px;
  font-weight: 700;
  color: #0068FF;
}
.s2-product-tile__add {
  font-size: 9.5px;
  color: #94a3b8;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 2px;
}
.s2-product-tile:hover .s2-product-tile__add { color: #0068FF; }
.s2-product-tile__qty-badge {
  font-size: 10px;
  font-weight: 800;
  color: #fff;
  background: #0068FF;
  padding: 1px 7px;
  border-radius: 10px;
}

/* ─── Cart ─── */
.s2-cart {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
}
.s2-cart__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}
.s2-cart__header-icon { color: #10b981; }
.s2-cart__header-title {
  font-size: 12px;
  font-weight: 700;
  color: #1e293b;
  flex: 1;
}
.s2-cart__header-total {
  font-size: 12px;
  font-weight: 800;
  color: #0068FF;
  font-family: monospace;
}

/* Table */
.s2-cart__table-head {
  display: flex;
  align-items: center;
  padding: 6px 14px;
  background: #f1f5f9;
  border-bottom: 1px solid #e2e8f0;
  gap: 8px;
}
.s2-cart__table-head .s2-col {
  font-size: 9px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #94a3b8;
}

.s2-cart__row {
  display: flex;
  align-items: center;
  padding: 8px 14px;
  gap: 8px;
  border-bottom: 1px solid #f8fafc;
  transition: background 0.1s;
}
.s2-cart__row:hover { background: #fafbfc; }
.s2-cart__row--gift { background: #fffbeb; }

.s2-col { display: flex; align-items: center; }
.s2-col--name { flex: 2.5; gap: 8px; min-width: 0; }
.s2-col--price { flex: 1.2; font-size: 11px; }
.s2-col--qty { flex: 0.8; justify-content: center; }
.s2-col--discount { flex: 1; }
.s2-col--total { flex: 1; justify-content: flex-end; font-size: 11.5px; }
.s2-col--action { flex: 0 0 28px; justify-content: center; }

.s2-cart__product-color {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 700;
  font-size: 8px;
  flex-shrink: 0;
}
.s2-cart__product-name-wrap {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.s2-cart__product-name {
  font-size: 11.5px;
  font-weight: 600;
  color: #1e293b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.s2-cart__gift-badge {
  font-size: 9px;
  color: #f59e0b;
  font-weight: 700;
}

/* Qty controls */
.s2-qty-controls {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: #f1f5f9;
  border-radius: 6px;
  padding: 2px;
  border: 1px solid #e2e8f0;
}
.s2-qty-btn {
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 4px;
  background: #fff;
  color: #475569;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.1s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}
.s2-qty-btn:hover {
  background: #0068FF;
  color: #fff;
}
.s2-qty-btn:active {
  transform: scale(0.92);
}
.s2-qty-input {
  width: 32px;
  height: 18px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  text-align: center;
  font-size: 11.5px;
  font-weight: 700;
  color: #0f172a;
  outline: none;
  padding: 0 2px;
  -moz-appearance: textfield;
}
.s2-qty-input::-webkit-outer-spin-button,
.s2-qty-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.s2-qty-input:focus {
  background: #fff;
  border-color: #0068FF;
  box-shadow: 0 0 0 2px rgba(0, 104, 255, 0.15);
}

/* Discount */
.s2-discount-wrap {
  display: flex;
  align-items: center;
  gap: 2px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 2px 6px;
}
.s2-discount-minus {
  font-size: 11px;
  font-weight: 700;
  color: #ef4444;
}
.s2-discount-input {
  width: 60px;
  border: none;
  background: transparent;
  font-size: 11px;
  font-weight: 600;
  font-family: monospace;
  outline: none;
  text-align: right;
  -moz-appearance: textfield;
  appearance: textfield;
}
.s2-discount-input::-webkit-outer-spin-button,
.s2-discount-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.s2-discount-input--wide { width: 90px; }
.s2-discount-unit {
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
}

/* Remove button */
.s2-remove-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: #cbd5e1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: all 0.15s;
}
.s2-remove-btn:hover {
  background: #fef2f2;
  color: #ef4444;
}

/* Order discount row */
.s2-cart__order-discount {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 10px 14px;
  border-top: 1px dashed #e2e8f0;
  background: #fefce8;
}
.s2-cart__order-discount-label {
  font-size: 11.5px;
  font-weight: 700;
  color: #92400e;
}

/* Subtotal */
.s2-cart__subtotal {
  display: flex;
  justify-content: space-between;
  padding: 12px 14px;
  background: #f0f9ff;
  border-top: 1.5px solid #0068FF;
}
.s2-cart__subtotal span:first-child {
  font-size: 13px;
  font-weight: 700;
  color: #1e293b;
}
.s2-cart__subtotal-amount {
  font-size: 15px;
  font-weight: 800;
  color: #0068FF;
  font-family: monospace;
}

/* ─── Promo ─── */
.s2-promo {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  overflow: hidden;
}
.s2-promo__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}
.s2-promo__header-icon { color: #f59e0b; }
.s2-promo__header-title {
  font-size: 12px;
  font-weight: 700;
  color: #1e293b;
}
.s2-promo__header-count {
  font-size: 10px;
  color: #64748b;
  font-weight: 500;
}
.s2-promo__eligible {
  margin-left: auto;
  font-size: 10px;
  font-weight: 700;
  color: #16a34a;
}

.s2-promo__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  max-height: 280px;
  overflow-y: auto;
}
.s2-promo__list::-webkit-scrollbar { width: 3px; }
.s2-promo__list::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 2px; }

/* Promo Card */
.s2-promo-card {
  display: flex;
  border: 1.5px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.18s ease;
  background: #fff;
}
.s2-promo-card:hover {
  border-color: var(--promo-color, #0068FF);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  transform: translateY(-1px);
}
.s2-promo-card--applied {
  border-color: #22c55e !important;
  background: #f0fdf4;
}
.s2-promo-card--eligible {
  border-color: var(--promo-color, #0068FF);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--promo-color, #0068FF) 15%, transparent);
}
.s2-promo-card--disabled {
  opacity: 0.55;
  cursor: not-allowed;
  background: #f8fafc;
}
.s2-promo-card--disabled:hover {
  border-color: #e2e8f0;
  box-shadow: none;
  transform: none;
}

.s2-promo-card__bar { width: 4px; flex-shrink: 0; }
.s2-promo-card__body { flex: 1; padding: 8px 10px; min-width: 0; }
.s2-promo-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 4px;
}
.s2-promo-card__badge {
  font-size: 9px;
  font-weight: 800;
  padding: 2px 7px;
  border-radius: 20px;
  border: 1px solid transparent;
  white-space: nowrap;
}
.s2-promo-card__applied {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 9px;
  font-weight: 700;
  color: #16a34a;
  background: #dcfce7;
  padding: 2px 7px;
  border-radius: 20px;
}
.s2-promo-card__add-btn {
  font-size: 9.5px;
  font-weight: 800;
  opacity: 0.7;
  transition: opacity 0.15s;
}
.s2-promo-card:hover .s2-promo-card__add-btn { opacity: 1; }
.s2-promo-card__locked {
  font-size: 8.5px;
  font-weight: 700;
  color: #94a3b8;
}
.s2-promo-card__name {
  font-size: 11px;
  font-weight: 700;
  color: #1e293b;
  margin: 0 0 4px;
  line-height: 1.4;
}
.s2-promo-card__name--dim { color: #94a3b8; }
.s2-promo-card__info { display: flex; flex-direction: column; gap: 2px; }
.s2-promo-card__row {
  display: flex;
  gap: 4px;
  font-size: 9.5px;
  color: #475569;
  line-height: 1.4;
}
.s2-promo-card__row--reward { color: #047857; font-weight: 600; }
.s2-promo-card__row--dim { color: #94a3b8 !important; font-weight: 400 !important; }
.s2-promo-card__label {
  font-weight: 700;
  color: #94a3b8;
  flex-shrink: 0;
  font-size: 8.5px;
  text-transform: uppercase;
  margin-top: 1px;
}

/* Progress */
.s2-promo-card__progress { margin-top: 6px; display: flex; flex-direction: column; gap: 2px; }
.s2-promo-card__progress-track { height: 3px; background: #e2e8f0; border-radius: 3px; overflow: hidden; }
.s2-promo-card__progress-fill { height: 100%; border-radius: 3px; transition: width 0.4s ease; min-width: 2px; }
.s2-promo-card__progress-text { font-size: 8.5px; color: #64748b; font-weight: 600; }

/* ─── Coming Soon ─── */
.s2-coming-soon {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px dashed #e2e8f0;
  background: #fafbfc;
}
.s2-coming-soon__icon { color: #f59e0b; flex-shrink: 0; }
.s2-coming-soon__text {
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
}
.s2-coming-soon__badge {
  margin-left: auto;
  font-size: 9px;
  font-weight: 700;
  color: #f59e0b;
  background: #fefce8;
  padding: 2px 8px;
  border-radius: 20px;
  border: 1px solid #fde68a;
}

/* ─── Utility ─── */
.s2-mono { font-family: monospace; }
.s2-text-bold { font-weight: 700; color: #475569; }
.s2-text-muted { color: #94a3b8; font-size: 10px; }
.s2-strikethrough { text-decoration: line-through; color: #94a3b8; margin-right: 4px; }
.s2-spin { animation: s2-spin 1s linear infinite; }
@keyframes s2-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
</style>
