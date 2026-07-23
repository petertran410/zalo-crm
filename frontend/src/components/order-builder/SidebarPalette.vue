<template>
  <aside class="ob-sidebar">
    <!-- Category Tabs -->
    <div class="ob-sidebar__tabs">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="ob-sidebar__tab"
        :class="{ 'ob-sidebar__tab--active': activeTab === tab.key }"
        @click="activeTab = tab.key; searchQuery = ''"
      >
        <component :is="tab.icon" :size="16" />
        <span>{{ tab.label }}</span>
      </button>
    </div>

    <!-- Search Input -->
    <div v-if="activeTab !== 'logistics'" class="ob-sidebar__search">
      <div class="ob-sidebar__search-wrap">
        <Search :size="14" class="ob-sidebar__search-icon" />
        <input
          v-model="searchQuery"
          type="text"
          :placeholder="searchPlaceholder"
          class="ob-sidebar__search-input"
          @input="onSearchInput"
        />
      </div>
    </div>

    <!-- Tab Contents -->
    <div class="ob-sidebar__content">

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
        >
          <div class="ob-product-card__color" :style="{ background: getProductColor(product.categoryName) }">
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

      <!-- ═══ CUSTOMER TAB ═══ -->
      <div v-if="activeTab === 'customers'" class="ob-sidebar__list">
        <div class="ob-customer-locked">
          <div class="ob-customer-locked__badge">
            <Lock :size="12" />
            <span>Khách hàng liên kết từ Chat</span>
          </div>
          <div class="ob-customer-card">
            <div class="ob-customer-card__avatar">
              {{ (customer.name || '?')[0] }}
            </div>
            <div class="ob-customer-card__info">
              <h4>{{ customer.name }}</h4>
              <p v-if="customer.phone" class="ob-customer-card__phone">SĐT: {{ customer.phone }}</p>
              <p v-if="customer.posCustomerId" class="ob-customer-card__pos">
                POS ID: {{ customer.posCustomerId }}
                <span v-if="customer.posCustomerCode"> • {{ customer.posCustomerCode }}</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- ═══ POLICIES TAB ═══ -->
      <div v-if="activeTab === 'policies'" class="ob-sidebar__list">
        <div class="ob-policy-coming-soon">
          <div class="ob-policy-coming-soon__icon">🚧</div>
          <h4>Tính năng đang phát triển</h4>
          <p>Chính sách khuyến mãi tự động & thủ công sẽ được tích hợp khi hệ thống POS cung cấp API chính sách.</p>
          <div class="ob-policy-coming-soon__badge">Sắp ra mắt</div>
        </div>
      </div>

      <!-- ═══ LOGISTICS TAB ═══ -->
      <div v-if="activeTab === 'logistics'" class="ob-sidebar__list">
        <!-- Branch Selection -->
        <div class="ob-logistics-section">
          <h4 class="ob-logistics-section__title">
            <MapPin :size="16" class="ob-text-blue" />
            Chi nhánh POS
          </h4>
          <div class="ob-logistics-options">
            <div
              v-for="branch in branches"
              :key="branch.id"
              class="ob-logistics-option"
              :class="{ 'ob-logistics-option--selected': selectedBranchId === branch.id }"
              @click="$emit('select-branch', branch.id)"
            >
              <h5>{{ branch.name }}</h5>
              <p v-if="branch.address">{{ branch.address }}</p>
            </div>
          </div>
        </div>

        <!-- Payment Method -->
        <div class="ob-logistics-section">
          <h4 class="ob-logistics-section__title">
            <CreditCard :size="16" class="ob-text-blue" />
            Phương thức thanh toán
          </h4>
          <div class="ob-logistics-options">
            <div
              v-for="method in paymentMethods"
              :key="method.value"
              class="ob-logistics-option ob-logistics-option--radio"
              :class="{ 'ob-logistics-option--selected': selectedPaymentMethod === method.value }"
              @click="$emit('select-payment', method.value)"
            >
              <div class="ob-radio" :class="{ 'ob-radio--active': selectedPaymentMethod === method.value }">
                <div v-if="selectedPaymentMethod === method.value" class="ob-radio__dot" />
              </div>
              <div>
                <h5>{{ method.icon }} {{ method.label }}</h5>
                <p>{{ method.description }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Order Status -->
        <div class="ob-logistics-section">
          <h4 class="ob-logistics-section__title">
            <FileText :size="16" class="ob-text-blue" />
            Trạng thái đơn hàng
          </h4>
          <div class="ob-logistics-options">
            <div
              v-for="status in orderStatuses"
              :key="status.value"
              class="ob-logistics-option ob-logistics-option--radio"
              :class="{ 'ob-logistics-option--selected': selectedOrderStatus === status.value }"
              @click="$emit('select-order-status', status.value)"
            >
              <div class="ob-radio" :class="{ 'ob-radio--active': selectedOrderStatus === status.value }">
                <div v-if="selectedOrderStatus === status.value" class="ob-radio__dot" />
              </div>
              <div><h5>{{ status.label }}</h5></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Safety Footer -->
    <div class="ob-sidebar__footer">
      <ShieldCheck :size="14" class="ob-text-green" />
      <span>Quy trình tự động hóa đã kích hoạt.</span>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  Search, ShoppingBag, User, Tag, Truck,
  Plus, Check, Lock, MapPin, CreditCard, FileText,
  ShieldCheck, Loader2,
} from 'lucide-vue-next';
import type { POSProduct, POSBranch, CustomerInfo, PaymentMethodOption, OrderStatusOption } from './types';
import { formatVND, PAYMENT_METHODS, ORDER_STATUSES } from './types';

const props = defineProps<{
  customer: CustomerInfo;
  products: POSProduct[];
  branches: POSBranch[];
  selectedProductIds: Record<number, number>;  // productId -> quantity
  selectedBranchId: number | null;
  selectedPaymentMethod: string;
  selectedOrderStatus: number;
  loading?: boolean;
}>();

const emit = defineEmits<{
  'add-product': [product: POSProduct];
  'select-branch': [branchId: number];
  'select-payment': [method: string];
  'select-order-status': [status: number];
  'search': [keyword: string];
}>();

type TabType = 'products' | 'customers' | 'policies' | 'logistics';

const activeTab = ref<TabType>('products');
const searchQuery = ref('');

const tabs = [
  { key: 'products' as TabType, label: 'Sản phẩm', icon: ShoppingBag },
  { key: 'customers' as TabType, label: 'Khách hàng', icon: User },
  { key: 'policies' as TabType, label: 'Chính sách', icon: Tag },
  { key: 'logistics' as TabType, label: 'Vận chuyển', icon: Truck },
];

const paymentMethods = PAYMENT_METHODS;
const orderStatuses = ORDER_STATUSES;

const searchPlaceholder = computed(() => {
  switch (activeTab.value) {
    case 'products': return 'Tìm sản phẩm (Tên, mã SP...)';
    case 'customers': return 'Tìm khách hàng...';
    case 'policies': return 'Tìm chính sách ưu đãi...';
    default: return 'Tìm kiếm...';
  }
});

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
  if (activeTab.value === 'products') {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      emit('search', searchQuery.value);
    }, 300);
  }
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
</script>

<style scoped>
.ob-sidebar {
  width: 320px;
  min-width: 280px;
  max-width: 340px;
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
  padding: 8px 4px;
  text-align: center;
  font-size: 11px;
  font-weight: 600;
  border-radius: 6px;
  cursor: pointer;
  border: none;
  background: transparent;
  color: #64748b;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  transition: all 0.15s ease;
}
.ob-sidebar__tab:hover {
  color: #1e293b;
  background: #f1f5f9;
}
.ob-sidebar__tab--active {
  background: #fff;
  color: #0068FF;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
  border: 1px solid rgba(226,232,240,0.5);
}

/* ─── Search ─── */
.ob-sidebar__search {
  padding: 12px;
  border-bottom: 1px solid #f1f5f9;
}
.ob-sidebar__search-wrap {
  position: relative;
}
.ob-sidebar__search-icon {
  position: absolute;
  left: 10px;
  top: 9px;
  color: #94a3b8;
}
.ob-sidebar__search-input {
  width: 100%;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 6px 12px 6px 32px;
  font-size: 12px;
  outline: none;
  transition: all 0.15s ease;
}
.ob-sidebar__search-input:focus {
  border-color: #0068FF;
  background: #fff;
}

/* ─── Content ─── */
.ob-sidebar__content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}
.ob-sidebar__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ob-sidebar__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px 16px;
  color: #94a3b8;
  font-size: 11px;
}

/* ─── Product Card ─── */
.ob-product-card {
  display: flex;
  gap: 10px;
  border: 1px solid #f1f5f9;
  border-radius: 10px;
  padding: 10px;
  cursor: pointer;
  transition: all 0.15s ease;
  background: #fff;
  user-select: none;
}
.ob-product-card:hover {
  border-color: #cbd5e1;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}
.ob-product-card--selected {
  border-color: #0068FF;
  background: rgba(0,104,255,0.03);
}
.ob-product-card__color {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 700;
  font-size: 10px;
  flex-shrink: 0;
}
.ob-product-card__info {
  flex: 1;
  min-width: 0;
}
.ob-product-card__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 4px;
}
.ob-product-card__name {
  font-size: 11px;
  font-weight: 600;
  color: #1e293b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin: 0;
}
.ob-product-card__check {
  background: #22c55e;
  color: #fff;
  border-radius: 50%;
  padding: 2px;
  font-size: 10px;
  display: flex;
  flex-shrink: 0;
}
.ob-product-card__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 3px;
}
.ob-product-card__sku {
  font-size: 10px;
  background: #f1f5f9;
  color: #64748b;
  font-weight: 500;
  padding: 1px 6px;
  border-radius: 4px;
}
.ob-product-card__stock {
  font-size: 10px;
  color: #94a3b8;
}
.ob-product-card__footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 6px;
}
.ob-product-card__price {
  font-size: 12px;
  font-weight: 700;
  color: #0068FF;
}
.ob-product-card__add {
  font-size: 10px;
  color: #94a3b8;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 2px;
}
.ob-product-card:hover .ob-product-card__add {
  color: #0068FF;
}

/* ─── Customer Locked ─── */
.ob-customer-locked {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ob-customer-locked__badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.ob-customer-card {
  display: flex;
  gap: 12px;
  align-items: center;
  border: 2px solid #0068FF;
  border-radius: 12px;
  padding: 12px;
  background: rgba(0,104,255,0.03);
}
.ob-customer-card__avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, #0068FF, #3b82f6);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 16px;
  flex-shrink: 0;
}
.ob-customer-card__info h4 {
  font-size: 13px;
  font-weight: 700;
  color: #1e293b;
  margin: 0;
}
.ob-customer-card__phone {
  font-size: 11px;
  color: #64748b;
  font-family: monospace;
  margin: 3px 0 0;
}
.ob-customer-card__pos {
  font-size: 10px;
  color: #0068FF;
  font-weight: 600;
  margin: 3px 0 0;
}

/* ─── Policy Coming Soon ─── */
.ob-policy-coming-soon {
  text-align: center;
  padding: 32px 16px;
  background: #fffbeb;
  border: 1px solid rgba(245,158,11,0.2);
  border-radius: 12px;
}
.ob-policy-coming-soon__icon {
  font-size: 32px;
  margin-bottom: 8px;
}
.ob-policy-coming-soon h4 {
  font-size: 13px;
  font-weight: 700;
  color: #92400e;
  margin: 0 0 6px;
}
.ob-policy-coming-soon p {
  font-size: 11px;
  color: #a16207;
  line-height: 1.5;
  margin: 0 0 12px;
}
.ob-policy-coming-soon__badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  background: #f59e0b;
  color: #fff;
  padding: 3px 10px;
  border-radius: 20px;
}

/* ─── Logistics Section ─── */
.ob-logistics-section {
  margin-bottom: 16px;
}
.ob-logistics-section__title {
  font-size: 12px;
  font-weight: 700;
  color: #475569;
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 8px;
}
.ob-logistics-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ob-logistics-option {
  border: 1px solid #f1f5f9;
  border-radius: 10px;
  padding: 10px;
  cursor: pointer;
  transition: all 0.15s ease;
  background: #fff;
}
.ob-logistics-option:hover {
  border-color: #cbd5e1;
}
.ob-logistics-option--selected {
  border-color: #0068FF;
  background: rgba(0,104,255,0.03);
  box-shadow: 0 1px 2px rgba(0,104,255,0.08);
}
.ob-logistics-option--radio {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.ob-logistics-option h5 {
  font-size: 12px;
  font-weight: 600;
  color: #1e293b;
  margin: 0;
}
.ob-logistics-option p {
  font-size: 10px;
  color: #94a3b8;
  margin: 3px 0 0;
}

/* ─── Radio ─── */
.ob-radio {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid #cbd5e1;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 2px;
  transition: all 0.15s ease;
}
.ob-radio--active {
  background: #0068FF;
  border-color: #0068FF;
}
.ob-radio__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #fff;
}

/* ─── Footer ─── */
.ob-sidebar__footer {
  padding: 10px 12px;
  background: #f8fafc;
  border-top: 1px solid #f1f5f9;
  font-size: 10px;
  color: #94a3b8;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ─── Utility ─── */
.ob-text-blue { color: #0068FF; }
.ob-text-green { color: #22c55e; }
.ob-spin {
  animation: ob-spin 1s linear infinite;
}
@keyframes ob-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
