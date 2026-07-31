<template>
  <aside class="ob-sidebar">
    <!-- Tab bar: Sản phẩm | Chính sách (locked) -->
    <div class="ob-sidebar__tabs">
      <button
        class="ob-sidebar__tab"
        :class="{ 'ob-sidebar__tab--active': activeTab === 'products' }"
        @click="activeTab = 'products'; searchQuery = ''"
      >
        <ShoppingBag :size="16" />
        <span>Sản phẩm</span>
      </button>

      <!-- Khuyến mãi tab với badge số chương trình -->
      <button
        class="ob-sidebar__tab ob-sidebar__tab--promo"
        :class="{ 'ob-sidebar__tab--active': activeTab === 'policies' }"
        @click="activeTab = 'policies'"
        title="Khuyến mãi — Nhấp để áp dụng"
      >
        <Tag :size="16" />
        <span>Khuyến mãi</span>
        <span class="ob-sidebar__tab-badge">{{ promotions.length }}</span>
      </button>
    </div>

    <!-- Search (only for products tab) -->
    <div v-if="activeTab === 'products'" class="ob-sidebar__search">
      <div class="ob-sidebar__search-wrap">
        <Search :size="14" class="ob-sidebar__search-icon" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Tìm sản phẩm (Tên, mã SP...)"
          class="ob-sidebar__search-input"
          @input="onSearchInput"
        />
      </div>
    </div>

    <!-- Tab content -->
    <div class="ob-sidebar__content" @scroll="handleListScroll">

      <!-- ═══ PRODUCTS TAB ═══ -->
      <div v-if="activeTab === 'products'" class="ob-sidebar__list">
        <div v-if="loading" class="ob-sidebar__empty">
          <Loader2 :size="20" class="ob-spin" />
          <span>Đang tải sản phẩm...</span>
        </div>
        <div v-else-if="filteredProducts.length === 0" class="ob-sidebar__empty">
          <ShoppingBag :size="24" :stroke-width="1" />
          <span>Không tìm thấy sản phẩm phù hợp.</span>
        </div>
        <div
          v-for="product in filteredProducts"
          :key="product.id"
          class="ob-product-card"
          :class="{ 'ob-product-card--selected': isProductSelected(product.id) }"
          @click="$emit('add-product', product)"
          @mouseenter="handleMouseEnter(product, $event)"
          @mouseleave="handleMouseLeave"
        >
          <div v-if="product.imageUrl && !failedImgMap[product.id]" class="ob-product-card__img-wrap">
            <img
              :src="product.imageUrl"
              :alt="product.name"
              class="ob-product-card__img"
              @error="handleTileImgError($event, product)"
            />
          </div>
          <div v-else class="ob-product-card__color" :style="{ background: getProductColor(product.categoryName) }">
            {{ (product.code || '').substring(0, 3) }}
          </div>
          <div class="ob-product-card__info">
            <div class="ob-product-card__header">
              <h4 class="ob-product-card__name">{{ product.name }}</h4>
              <span v-if="isProductSelected(product.id)" class="ob-product-card__check">
                <Check :size="10" />
              </span>
            </div>
            <div class="ob-product-card__meta">
              <span class="ob-product-card__sku">{{ product.code }}</span>
              <span class="ob-product-card__stock">Kho: {{ product.onHand ?? '—' }} {{ product.unit || '' }}</span>
            </div>
            <div class="ob-product-card__footer">
              <span class="ob-product-card__price">{{ formatVND(product.basePrice) }}</span>
              <span class="ob-product-card__add">
                Thêm <Plus :size="12" />
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- ═══ KHUYẾN MÃI TAB ═══ -->
      <div v-if="activeTab === 'policies'" class="ob-sidebar__list">
        <!-- Tóm tắt -->
        <div class="ob-promo-header">
          <span class="ob-promo-header__count">{{ promotions.length }} chương trình</span>
          <span class="ob-promo-header__hint ob-promo-header__hint--eligible" v-if="eligibleCount > 0">
            🟢 {{ eligibleCount }} sẵn sàng áp dụng
          </span>
          <span v-else class="ob-promo-header__hint">Thêm SP để kích hoạt</span>
        </div>

        <!-- Promo cards -->
        <div
          v-for="promo in promotions"
          :key="promo.id"
          class="ob-promo-card"
          :class="{
            'ob-promo-card--applied':  isApplied(promo.id),
            'ob-promo-card--eligible': isEligible(promo) && !isApplied(promo.id),
            'ob-promo-card--disabled': !isEligible(promo) && !isApplied(promo.id),
          }"
          :style="{ '--promo-color': promo.color, '--promo-bg': promo.colorBg }"
          @click="handleApplyPromo(promo)"
        >
          <!-- Left accent bar -->
          <div
            class="ob-promo-card__bar"
            :style="{ background: (isEligible(promo) || isApplied(promo.id)) ? promo.color : '#cbd5e1' }"
          />

          <div class="ob-promo-card__body">
            <!-- Header row -->
            <div class="ob-promo-card__header">
              <span
                class="ob-promo-card__badge"
                :style="(isEligible(promo) || isApplied(promo.id))
                  ? { background: promo.colorBg, color: promo.color, borderColor: promo.color + '33' }
                  : { background: '#f1f5f9', color: '#94a3b8', borderColor: '#e2e8f0' }"
              >
                {{ promo.badge }} {{ promo.tag }}
              </span>

              <!-- Applied -->
              <span v-if="isApplied(promo.id)" class="ob-promo-card__applied">
                <Check :size="10" />
                Đã dùng
              </span>
              <!-- Eligible -->
              <span v-else-if="isEligible(promo)" class="ob-promo-card__add-btn" :style="{ color: promo.color }">
                ▶ Áp dụng
              </span>
              <!-- Not eligible -->
              <span v-else class="ob-promo-card__locked">🔒 Chưa đủ</span>
            </div>

            <!-- Name -->
            <h4
              class="ob-promo-card__name"
              :class="{ 'ob-promo-card__name--dim': !isEligible(promo) && !isApplied(promo.id) }"
            >{{ promo.name }}</h4>

            <!-- Condition & reward -->
            <div class="ob-promo-card__info">
              <div class="ob-promo-card__row">
                <span class="ob-promo-card__label">ĐK:</span>
                <span>{{ promo.conditionText }}</span>
              </div>
              <div
                class="ob-promo-card__row ob-promo-card__row--reward"
                :class="{ 'ob-promo-card__row--reward-dim': !isEligible(promo) && !isApplied(promo.id) }"
              >
                <span class="ob-promo-card__label">Thưởng:</span>
                <span>{{ promo.rewardText }}</span>
              </div>
            </div>

            <!-- Progress bar (chưa đủ điều kiện) -->
            <div v-if="!isEligible(promo) && !isApplied(promo.id)" class="ob-promo-card__progress">
              <div class="ob-promo-card__progress-track">
                <div
                  class="ob-promo-card__progress-fill"
                  :style="{
                    width: Math.min(100, progressOf(promo).required > 0
                      ? (progressOf(promo).current / progressOf(promo).required) * 100
                      : 0) + '%',
                    background: promo.color,
                  }"
                />
              </div>
              <span class="ob-promo-card__progress-text">{{ formatProgress(promo) }}</span>
            </div>

            <!-- Footer -->
            <div v-if="promo.validUntil" class="ob-promo-card__footer">
              <span>⏰ HSD: {{ promo.validUntil }}</span>
            </div>
          </div>
        </div>
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
  </aside>
</template>


<script setup lang="ts">
import { ref, reactive, computed, watch, onUnmounted } from 'vue';
import { Search, ShoppingBag, Plus, Check, Tag, Loader2 } from 'lucide-vue-next';
import ProductPreviewPopover from './ProductPreviewPopover.vue';
import type { POSProduct, CartItem, PromotionProgram } from './types';
import { formatVND, MOCK_PROMOTIONS, evaluatePromoCondition, promoConditionProgress } from './types';

const props = defineProps<{
  products: POSProduct[];
  selectedProductIds: Record<number, number>;
  appliedPromoIds: string[];
  cartItems: CartItem[];    // để evaluate điều kiện KM
  orderTotal: number;       // tổng tiền đơn (trước giảm) để check KM loại amount
  loading?: boolean;
}>();

const emit = defineEmits<{
  'add-product': [product: POSProduct];
  'search': [keyword: string];
  'apply-promotion': [promo: PromotionProgram];
  'remove-promotion': [promoId: string];
  'promo-became-eligible': [promo: PromotionProgram];
}>();

const promotions = MOCK_PROMOTIONS;

/** Kiểm tra điều kiện đủ dùng KM */
function isEligible(promo: PromotionProgram): boolean {
  return evaluatePromoCondition(promo.condition, props.cartItems, props.orderTotal);
}

/** Số KM đang đủ điều kiện nhưng chưa apply */
const eligibleCount = computed(() =>
  promotions.filter(p => isEligible(p) && !isApplied(p.id)).length,
);

/** Progress của một promo so với điều kiện */
function progressOf(promo: PromotionProgram) {
  return promoConditionProgress(promo.condition, props.cartItems, props.orderTotal);
}

/** Text mô tả tiến trình đủ điều kiện */
function formatProgress(promo: PromotionProgram): string {
  const { current, required } = progressOf(promo);
  const cond = promo.condition;
  if (cond.type === 'min_order_amount') {
    return `${formatVND(current)} / ${formatVND(required)}`;
  }
  return `Còn thiếu ${required - current} ${cond.type === 'min_cart_count' ? 'sản phẩm' : 'sp'}`;
}

// Watch giỏ hàng: phát hiện khi một promo vừa đủ điều kiện → toast
const prevEligible = new Set<string>();
watch(
  () => props.cartItems,
  () => {
    for (const promo of promotions) {
      const eligible = isEligible(promo);
      if (eligible && !prevEligible.has(promo.id) && !isApplied(promo.id)) {
        emit('promo-became-eligible', promo);
      }
      if (eligible) prevEligible.add(promo.id);
      else prevEligible.delete(promo.id);
    }
  },
  { deep: true },
);

/** Kiểm tra xem một promo đã được áp dụng chưa */
function isApplied(promoId: string): boolean {
  return props.appliedPromoIds.includes(promoId);
}

/** Xử lý click vào promo card: chỉ cho phép nếu đủ điều kiện hoặc đang applied */
function handleApplyPromo(promo: PromotionProgram) {
  if (isApplied(promo.id)) {
    emit('remove-promotion', promo.id);
  } else if (isEligible(promo)) {
    emit('apply-promotion', promo);
  }
  // Nếu chưa đủ điều kiện: không làm gì (card mờ)
}


type TabType = 'products' | 'policies';
const activeTab = ref<TabType>('products');
const searchQuery = ref('');

const filteredProducts = computed(() => {
  if (!searchQuery.value) return props.products;
  const q = searchQuery.value.toLowerCase();
  return props.products.filter(p =>
    p.name.toLowerCase().includes(q) ||
    (p.code || '').toLowerCase().includes(q)
  );
});

function isProductSelected(productId: number): boolean {
  return props.selectedProductIds[productId] !== undefined;
}

let searchTimer: ReturnType<typeof setTimeout> | null = null;
function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    emit('search', searchQuery.value);
  }, 300);
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
.ob-sidebar {
  width: 300px;
  min-width: 260px;
  max-width: 320px;
  background: #fff;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  flex-shrink: 0;
}

/* ─── Tabs ─── */
.ob-sidebar__tabs {
  display: flex;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
  padding: 4px;
  gap: 4px;
}
.ob-sidebar__tab {
  flex: 1;
  padding: 9px 4px;
  text-align: center;
  font-size: 11.5px;
  font-weight: 600;
  border-radius: 7px;
  cursor: pointer;
  border: none;
  background: transparent;
  color: #64748b;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  transition: all .15s;
}
.ob-sidebar__tab:hover {
  color: #1e293b;
  background: #f1f5f9;
}
.ob-sidebar__tab--active {
  background: #fff;
  color: #0068FF;
  box-shadow: 0 1px 2px rgba(0,0,0,.05);
  border: 1px solid rgba(226,232,240,.5);
}

/* Locked tab */
.ob-sidebar__tab--locked {
  color: #94a3b8;
  position: relative;
}
.ob-sidebar__tab--locked:hover {
  color: #64748b;
  background: #f1f5f9;
}
.ob-sidebar__tab--locked.ob-sidebar__tab--active {
  color: #94a3b8;
  background: #f8fafc;
  border-color: #e2e8f0;
}

/* ─── Search ─── */
.ob-sidebar__search {
  padding: 10px 12px;
  border-bottom: 1px solid #f1f5f9;
  flex-shrink: 0;
}
.ob-sidebar__search-wrap { position: relative; }
.ob-sidebar__search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: #94a3b8;
}
.ob-sidebar__search-input {
  width: 100%;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 7px 12px 7px 32px;
  font-size: 12px;
  outline: none;
  transition: all .15s;
  box-sizing: border-box;
}
.ob-sidebar__search-input:focus { border-color: #0068FF; background: #fff; }

/* ─── Content ─── */
.ob-sidebar__content {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
}
.ob-sidebar__content::-webkit-scrollbar { width: 4px; }
.ob-sidebar__content::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 2px; }

.ob-sidebar__list { display: flex; flex-direction: column; gap: 7px; }
.ob-sidebar__empty {
  display: flex; flex-direction: column; align-items: center;
  gap: 8px; padding: 32px 16px; color: #94a3b8; font-size: 11px;
}

/* ─── Product Card ─── */
.ob-product-card {
  display: flex;
  gap: 10px;
  border: 1px solid #f1f5f9;
  border-radius: 10px;
  padding: 10px;
  cursor: pointer;
  transition: all .15s;
  background: #fff;
  user-select: none;
}
.ob-product-card:hover {
  border-color: #cbd5e1;
  box-shadow: 0 2px 6px rgba(0,0,0,.05);
}
.ob-product-card--selected {
  border-color: #0068FF;
  background: rgba(0,104,255,.03);
}
.ob-product-card__img-wrap {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  overflow: hidden;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.ob-product-card__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ob-product-card__color {
  width: 40px; height: 40px;
  border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-weight: 700; font-size: 9px;
  flex-shrink: 0; letter-spacing: -.5px;
}
.ob-product-card__info { flex: 1; min-width: 0; }
.ob-product-card__header { display: flex; justify-content: space-between; align-items: flex-start; gap: 4px; }
.ob-product-card__name {
  font-size: 11.5px; font-weight: 600; color: #1e293b;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin: 0;
}
.ob-product-card__check {
  background: #22c55e; color: #fff;
  border-radius: 50%; padding: 2px;
  display: flex; flex-shrink: 0;
}
.ob-product-card__meta { display: flex; align-items: center; gap: 8px; margin-top: 3px; }
.ob-product-card__sku {
  font-size: 10px; background: #f1f5f9; color: #64748b;
  font-weight: 500; padding: 1px 6px; border-radius: 4px;
}
.ob-product-card__stock { font-size: 10px; color: #94a3b8; }
.ob-product-card__footer { display: flex; justify-content: space-between; align-items: center; margin-top: 6px; }
.ob-product-card__price { font-size: 12px; font-weight: 700; color: #0068FF; }
.ob-product-card__add {
  font-size: 10px; color: #94a3b8; font-weight: 600;
  display: flex; align-items: center; gap: 2px;
}
.ob-product-card:hover .ob-product-card__add { color: #0068FF; }

/* ─── Policy Locked ─── */
.ob-policy-locked {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 32px 16px;
  background: #f8fafc;
  border: 1.5px dashed #e2e8f0;
  border-radius: 14px;
  gap: 10px;
}
.ob-policy-locked__lock-ring {
  width: 56px; height: 56px;
  border-radius: 50%;
  background: #f1f5f9;
  border: 2px solid #e2e8f0;
  display: flex; align-items: center; justify-content: center;
}
.ob-policy-locked__lock-icon { color: #94a3b8; }
.ob-policy-locked__title {
  font-size: 13px; font-weight: 700; color: #475569; margin: 0;
}
.ob-policy-locked__desc {
  font-size: 11px; color: #94a3b8; line-height: 1.6; margin: 0;
}
.ob-policy-locked__badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10.5px;
  font-weight: 700;
  background: #f1f5f9;
  color: #64748b;
  padding: 5px 12px;
  border-radius: 20px;
  border: 1px solid #e2e8f0;
}
.ob-policy-locked__badge-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: #94a3b8;
}



/* ─── Utility ─── */
.ob-text-green { color: #22c55e; }
.ob-spin { animation: ob-spin 1s linear infinite; }
@keyframes ob-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

/* Tab badge (số chương trình KM) */
.ob-sidebar__tab-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  border-radius: 8px;
  background: #f59e0b;
  color: #fff;
  font-size: 9px;
  font-weight: 800;
  padding: 0 4px;
  margin-left: 2px;
}
.ob-sidebar__tab--promo.ob-sidebar__tab--active .ob-sidebar__tab-badge {
  background: #0068FF;
}

/* ─── Promo Header ─── */
.ob-promo-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 2px 8px;
  border-bottom: 1px solid #f1f5f9;
  margin-bottom: 4px;
}
.ob-promo-header__count {
  font-size: 11px;
  font-weight: 700;
  color: #475569;
}
.ob-promo-header__hint {
  font-size: 9.5px;
  color: #94a3b8;
  font-style: italic;
}

/* ─── Promo Cards ─── */
.ob-promo-card {
  display: flex;
  border: 1.5px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.18s ease;
  background: #fff;
  position: relative;
}
.ob-promo-card:hover {
  border-color: var(--promo-color, #0068FF);
  box-shadow: 0 3px 10px rgba(0,0,0,0.08);
  transform: translateY(-1px);
}
.ob-promo-card--applied {
  border-color: #22c55e !important;
  background: #f0fdf4;
}
.ob-promo-card--applied:hover {
  box-shadow: 0 3px 10px rgba(34,197,94,0.15);
}

/* Left accent bar */
.ob-promo-card__bar {
  width: 4px;
  flex-shrink: 0;
}

/* Card body */
.ob-promo-card__body {
  flex: 1;
  padding: 10px 10px 8px;
  min-width: 0;
}

/* Header row */
.ob-promo-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 6px;
}
.ob-promo-card__badge {
  font-size: 9px;
  font-weight: 800;
  padding: 2px 7px;
  border-radius: 20px;
  border: 1px solid transparent;
  white-space: nowrap;
}
.ob-promo-card__applied {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 9px;
  font-weight: 700;
  color: #16a34a;
  background: #dcfce7;
  padding: 2px 7px;
  border-radius: 20px;
  white-space: nowrap;
}
.ob-promo-card__add-btn {
  font-size: 9.5px;
  font-weight: 800;
  white-space: nowrap;
  opacity: 0.7;
  transition: opacity 0.15s;
}
.ob-promo-card:hover .ob-promo-card__add-btn {
  opacity: 1;
}

/* Name */
.ob-promo-card__name {
  font-size: 11px;
  font-weight: 700;
  color: #1e293b;
  margin: 0 0 6px;
  line-height: 1.4;
}

/* Info rows */
.ob-promo-card__info {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.ob-promo-card__row {
  display: flex;
  gap: 4px;
  font-size: 9.5px;
  color: #475569;
  line-height: 1.4;
}
.ob-promo-card__row--reward {
  color: #047857;
  font-weight: 600;
}
.ob-promo-card__label {
  font-weight: 700;
  color: #94a3b8;
  flex-shrink: 0;
  font-size: 8.5px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin-top: 1px;
}

/* Footer */
.ob-promo-card__footer {
  margin-top: 7px;
  padding-top: 6px;
  border-top: 1px dashed #f1f5f9;
  font-size: 9px;
  color: #94a3b8;
}

/* ── Eligibility states ── */

/* Eligible: card sáng, viền màu, hover glow */
.ob-promo-card--eligible {
  border-color: var(--promo-color, #0068FF);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--promo-color, #0068FF) 15%, transparent);
  animation: ob-promo-eligible-pulse 2s ease-in-out infinite;
}
.ob-promo-card--eligible:hover {
  box-shadow: 0 4px 16px color-mix(in srgb, var(--promo-color, #0068FF) 30%, transparent);
  transform: translateY(-2px);
}

@keyframes ob-promo-eligible-pulse {
  0%, 100% { box-shadow: 0 0 0 2px color-mix(in srgb, var(--promo-color, #0068FF) 15%, transparent); }
  50%       { box-shadow: 0 0 0 4px color-mix(in srgb, var(--promo-color, #0068FF) 25%, transparent); }
}

/* Disabled: mờ, không click được */
.ob-promo-card--disabled {
  opacity: 0.55;
  cursor: not-allowed;
  background: #f8fafc;
  border-color: #e2e8f0;
}
.ob-promo-card--disabled:hover {
  border-color: #e2e8f0;
  box-shadow: none;
  transform: none;
}

/* Lock badge */
.ob-promo-card__locked {
  font-size: 8.5px;
  font-weight: 700;
  color: #94a3b8;
  white-space: nowrap;
}

/* Dim modifiers */
.ob-promo-card__name--dim {
  color: #94a3b8;
}
.ob-promo-card__row--reward-dim {
  color: #94a3b8 !important;
  font-weight: 400 !important;
}

/* Progress bar */
.ob-promo-card__progress {
  margin-top: 7px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.ob-promo-card__progress-track {
  height: 4px;
  background: #e2e8f0;
  border-radius: 4px;
  overflow: hidden;
}
.ob-promo-card__progress-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.4s ease;
  min-width: 2px;
}
.ob-promo-card__progress-text {
  font-size: 8.5px;
  color: #64748b;
  font-weight: 600;
}

/* Hint color when eligible */
.ob-promo-header__hint--eligible {
  color: #16a34a !important;
  font-weight: 700;
  font-style: normal !important;
}
</style>


