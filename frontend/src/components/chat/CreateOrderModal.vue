<template>
  <v-dialog :model-value="modelValue" max-width="720" persistent @update:model-value="$emit('update:modelValue', $event)">
    <v-card class="create-order-card rounded-lg">
      <!-- ═══════ Header ═══════ -->
      <v-card-title class="com-header d-flex justify-space-between align-center px-4 py-3 border-bottom">
        <div class="d-flex align-center gap-2">
          <span class="com-icon">🛒</span>
          <span class="text-subtitle-1 font-weight-bold">Tạo đơn hàng mới</span>
        </div>
        <v-btn icon="mdi-close" variant="text" size="small" @click="close" :disabled="submitting" />
      </v-card-title>

      <v-card-text class="px-4 py-3 com-body">
        <!-- ═══════ Customer Info (read-only) ═══════ -->
        <div class="com-section mb-3">
          <div class="com-label mb-1">Khách hàng</div>
          <div class="com-customer-row d-flex align-center gap-2 pa-2 rounded border bg-grey-lighten-5">
            <div class="flex-grow-1">
              <div class="font-weight-bold text-body-2">{{ customerName }}</div>
              <div class="text-caption text-grey-darken-1" v-if="customerPhone">SĐT: {{ customerPhone }}</div>
            </div>
            <v-chip v-if="posCustomerId" size="small" color="success" variant="tonal" class="text-caption">
              POS #{{ posCustomerId }}
            </v-chip>
            <v-chip v-else size="small" color="warning" variant="tonal" class="text-caption">
              Chưa liên kết POS
            </v-chip>
          </div>
        </div>

        <!-- ═══════ Branch Selection ═══════ -->
        <div class="com-section mb-3">
          <div class="com-label mb-1">Chi nhánh</div>
          <v-select
            v-model="selectedBranch"
            :items="branches"
            item-title="name"
            item-value="id"
            placeholder="Chọn chi nhánh"
            density="compact"
            variant="outlined"
            hide-details
            :loading="branchesLoading"
            :error-messages="errors.branchId"
          />
        </div>

        <!-- ═══════ Product Search + Cart ═══════ -->
        <div class="com-section mb-3">
          <div class="com-label mb-1">Sản phẩm</div>

          <!-- Custom Search Field + Dropdown (thay thế v-autocomplete để tránh infinite loop) -->
          <div class="com-product-search-wrapper" style="position: relative;">
            <v-text-field
              ref="productSearchRef"
              v-model="productSearchKeyword"
              placeholder="Tìm sản phẩm theo tên hoặc mã..."
              density="compact"
              variant="outlined"
              hide-details
              clearable
              prepend-inner-icon="mdi-magnify"
              :loading="productSearchLoading"
              @input="onProductSearchInput"
              @focus="onSearchFocus"
              @click:clear="onSearchClear"
              autocomplete="off"
              class="mb-1"
            />
            <!-- Dropdown kết quả tìm kiếm -->
            <div
              v-if="showProductDropdown && productList.length > 0"
              class="com-product-dropdown"
            >
              <div
                v-for="product in productList"
                :key="product.posId"
                class="com-product-item"
                @mousedown.prevent="selectProduct(product)"
              >
                <div class="com-product-item-left">
                  <span class="com-product-code">{{ product.code }}</span>
                  <span class="com-product-name">{{ product.name }}</span>
                </div>
                <span class="com-product-price">{{ formatCurrency(product.basePrice || 0) }}</span>
              </div>
            </div>
            <div
              v-else-if="showProductDropdown && !productSearchLoading && productSearchKeyword"
              class="com-product-dropdown"
            >
              <div class="com-product-empty">Không tìm thấy sản phẩm</div>
            </div>
          </div>

          <!-- Cart Table -->
          <div v-if="cartItems.length > 0" class="com-cart-table border rounded">
            <table class="com-table w-100">
              <thead>
                <tr class="bg-grey-lighten-4 text-caption text-grey-darken-2">
                  <th class="pa-2 text-left" style="width: 40%">Sản phẩm</th>
                  <th class="pa-2 text-center" style="width: 15%">SL</th>
                  <th class="pa-2 text-right" style="width: 20%">Đơn giá</th>
                  <th class="pa-2 text-right" style="width: 20%">Thành tiền</th>
                  <th class="pa-2 text-center" style="width: 5%"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, idx) in cartItems" :key="idx" class="com-cart-row text-caption">
                  <td class="pa-2">
                    <div class="font-weight-bold">{{ item.productName }}</div>
                    <div class="text-grey font-mono" style="font-size: 10px">{{ item.productCode }}</div>
                  </td>
                  <td class="pa-2 text-center">
                    <div class="com-qty-ctrl d-flex align-center justify-center gap-1">
                      <button class="com-qty-btn" @click="changeQty(idx, -1)" :disabled="item.quantity <= 1">−</button>
                      <input
                        type="number"
                        class="com-qty-input text-center"
                        v-model.number="item.quantity"
                        min="1"
                        @change="recalcLine(idx)"
                      />
                      <button class="com-qty-btn" @click="changeQty(idx, 1)">+</button>
                    </div>
                  </td>
                  <td class="pa-2 text-right font-mono">{{ formatCurrency(item.unitPrice) }}</td>
                  <td class="pa-2 text-right font-mono font-weight-bold text-primary">{{ formatCurrency(item.totalPrice) }}</td>
                  <td class="pa-2 text-center">
                    <button class="com-remove-btn" title="Xoá" @click="removeItem(idx)">×</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="text-center text-caption text-grey-darken-1 py-3 border rounded bg-grey-lighten-5">
            Chưa có sản phẩm nào trong đơn
          </div>
          <div v-if="errors.items" class="text-error text-caption mt-1">{{ errors.items }}</div>
        </div>

        <!-- ═══════ Order Summary ═══════ -->
        <div v-if="cartItems.length > 0" class="com-section mb-3 pa-3 rounded border bg-blue-lighten-5">
          <div class="d-flex justify-space-between text-body-2 mb-1">
            <span>Tổng tiền hàng:</span>
            <span class="font-weight-bold font-mono">{{ formatCurrency(totalAmount) }}</span>
          </div>
          <div class="d-flex justify-space-between text-body-2 mb-1">
            <span>Giảm giá đơn:</span>
            <v-text-field
              v-model.number="orderDiscount"
              type="number"
              min="0"
              density="compact"
              variant="outlined"
              hide-details
              class="com-discount-input"
              style="max-width: 150px"
              suffix="đ"
              @input="recalcTotals"
            />
          </div>
          <v-divider class="my-2" />
          <div class="d-flex justify-space-between text-subtitle-1 font-weight-bold">
            <span>Tổng thanh toán:</span>
            <span class="text-primary font-mono">{{ formatCurrency(grandTotal) }}</span>
          </div>
        </div>

        <!-- ═══════ Status Notice ═══════ -->
        <div v-if="cartItems.length > 0" class="com-section mb-3">
          <div class="text-caption text-grey-darken-1 d-flex align-center gap-1">
            <span class="font-weight-bold">Trạng thái đơn:</span> 📝 Phiếu tạm (Tự động gửi POS dưới dạng Phiếu tạm)
          </div>
        </div>

        <!-- ═══════ Notes ═══════ -->
        <div class="com-section">
          <v-textarea
            v-model="description"
            label="Ghi chú đơn hàng"
            rows="2"
            density="compact"
            variant="outlined"
            hide-details
          />
        </div>
      </v-card-text>

      <!-- ═══════ Footer Actions ═══════ -->
      <v-card-actions class="px-4 py-3 border-top justify-end gap-2">
        <v-btn variant="outlined" color="grey" class="text-none" @click="close" :disabled="submitting">
          Hủy
        </v-btn>
        <v-btn
          color="primary"
          variant="flat"
          class="text-none px-6"
          style="background-color: #0284c7; color: white;"
          :loading="submitting"
          :disabled="!canSubmit"
          @click="submitOrder"
        >
          Tạo đơn hàng
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { api } from '@/api';
import { useToast } from '@/composables/use-toast';

const toast = useToast();

const props = defineProps<{
  modelValue: boolean;
  contactId?: string | null;
  contactName?: string;
  contactPhone?: string;
  posCustomerId?: number | null;
  posCustomerCode?: string | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'order-created': [data: any];
}>();

// ─── State ────────────────────────────────────────────────────────────
const customerName = computed(() => props.contactName || 'Khách hàng');
const customerPhone = computed(() => props.contactPhone || '');

// Branches
const branches = ref<{ id: number; name: string }[]>([]);
const branchesLoading = ref(false);
const selectedBranch = ref<number | null>(null);

// Products — Custom search (thay thế v-autocomplete để tránh infinite loop)
interface ProductItem {
  posId: number;
  code: string;
  name: string;
  basePrice: number;
  label: string;
}
const productList = ref<ProductItem[]>([]);
const productSearchLoading = ref(false);
const productSearchKeyword = ref('');
const showProductDropdown = ref(false);
const productSearchRef = ref<any>(null);
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

// Cart
interface CartItem {
  productId: number;
  productCode: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  totalPrice: number;
  note: string;
}
const cartItems = reactive<CartItem[]>([]);

// Order
const orderDiscount = ref(0);
const paidAmount = ref(0);
const paymentMethod = ref('cash');
const orderStatusCode = ref(1); // 1=Phiếu tạm, 2=Đã xác nhận
const description = ref('');
const submitting = ref(false);
const errors = reactive<Record<string, string>>({});

const paymentMethods = [
  { value: 'cash', label: 'Tiền mặt' },
  { value: 'bank_transfer', label: 'Chuyển khoản' },
  { value: 'card', label: 'Quẹt thẻ' },
];

const orderStatusOptions = [
  { value: 1, label: '📝 Phiếu tạm (Nháp)' },
  { value: 2, label: '✅ Đã xác nhận' },
];

// ─── Computeds ────────────────────────────────────────────────────────
const totalAmount = computed(() => cartItems.reduce((sum, item) => sum + item.totalPrice, 0));
const grandTotal = computed(() => Math.max(0, totalAmount.value - (orderDiscount.value || 0)));
const canSubmit = computed(() =>
  props.posCustomerId &&
  selectedBranch.value &&
  cartItems.length > 0 &&
  !submitting.value
);

// ─── Fetch Branches ───────────────────────────────────────────────────
async function fetchBranches() {
  branchesLoading.value = true;
  try {
    const { data } = await api.get<{ success: boolean; data: { id: number; name: string }[] }>('/pos/branches');
    branches.value = data?.data || [];
    if (branches.value.length > 0 && !selectedBranch.value) {
      selectedBranch.value = branches.value[0].id;
    }
  } catch (err) {
    console.error('fetchBranches failed:', err);
  } finally {
    branchesLoading.value = false;
  }
}

// ─── Product Search (Custom – không dùng v-autocomplete) ─────────────
function onProductSearchInput() {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  const term = (productSearchKeyword.value || '').trim();
  searchDebounceTimer = setTimeout(() => fetchProducts(term), 300);
}

function onSearchFocus() {
  // Nếu chưa có sản phẩm nào trong danh sách, tải mặc định
  if (productList.value.length === 0) {
    fetchProducts('');
  }
  showProductDropdown.value = true;
}

function onSearchClear() {
  productSearchKeyword.value = '';
  fetchProducts('');
}

async function fetchProducts(keyword: string) {
  productSearchLoading.value = true;
  try {
    const params: any = { limit: 20 };
    if (keyword) params.keyword = keyword;
    const { data } = await api.get<{ items: any[]; nextCursor: string | null }>('/pos/products', { params });
    const items = data?.items || [];
    productList.value = items.map((p: any) => ({
      posId: p.posId,
      code: p.code,
      name: p.name,
      basePrice: p.basePrice || 0,
      label: `${p.code} — ${p.name}`,
    }));
    showProductDropdown.value = true;
  } catch (err) {
    console.error('fetchProducts failed:', err);
  } finally {
    productSearchLoading.value = false;
  }
}

function selectProduct(product: ProductItem) {
  addToCart(product);
  productSearchKeyword.value = '';
  showProductDropdown.value = false;
}

// ─── Cart Operations ──────────────────────────────────────────────────
function addToCart(product: ProductItem | null) {
  if (!product) return;

  // Check duplicate
  const existing = cartItems.find(c => c.productId === product.posId);
  if (existing) {
    existing.quantity++;
    existing.totalPrice = existing.quantity * existing.unitPrice - existing.discount;
    return;
  }

  cartItems.push({
    productId: product.posId,
    productCode: product.code,
    productName: product.name,
    quantity: 1,
    unitPrice: product.basePrice,
    discount: 0,
    totalPrice: product.basePrice,
    note: '',
  });
  // Clear error if any
  delete errors.items;
}

function changeQty(idx: number, delta: number) {
  const item = cartItems[idx];
  if (!item) return;
  item.quantity = Math.max(1, item.quantity + delta);
  item.totalPrice = item.quantity * item.unitPrice - item.discount;
}

function recalcLine(idx: number) {
  const item = cartItems[idx];
  if (!item) return;
  if (item.quantity < 1) item.quantity = 1;
  item.totalPrice = item.quantity * item.unitPrice - item.discount;
}

function removeItem(idx: number) {
  cartItems.splice(idx, 1);
}

function recalcTotals() {
  // Just triggers vue reactivity recalc through computed
}

// ─── Submit Order ─────────────────────────────────────────────────────
async function submitOrder() {
  // Clear errors
  Object.keys(errors).forEach(k => delete errors[k]);

  if (!props.posCustomerId) {
    errors.posCustomerId = 'Chưa liên kết khách hàng POS. Vui lòng tạo hoặc liên kết khách hàng trước.';
    toast.error(errors.posCustomerId);
    return;
  }
  if (!selectedBranch.value) {
    errors.branchId = 'Vui lòng chọn chi nhánh';
    return;
  }
  if (cartItems.length === 0) {
    errors.items = 'Vui lòng thêm ít nhất 1 sản phẩm';
    return;
  }

  submitting.value = true;
  try {
    const payload = {
      contactId: props.contactId || undefined,
      posCustomerId: props.posCustomerId,
      branchId: selectedBranch.value,
      items: cartItems.map(c => ({
        productId: c.productId,
        productCode: c.productCode,
        productName: c.productName,
        quantity: c.quantity,
        unitPrice: c.unitPrice,
        discount: c.discount,
        note: c.note,
      })),
      paidAmount: 0,
      paymentMethod: 'cash',
      orderStatus: 1,
      priceBookId: 1,
      description: description.value || '',
    };

    const { data } = await api.post<any>('/pos/orders', payload);
    if (data?.success) {
      toast.success(`Tạo đơn hàng thành công! Mã: ${data.data?.orderCode || ''}`);
      emit('order-created', data.data);
      resetForm();
      emit('update:modelValue', false);
    } else {
      const msg = data?.message || 'Tạo đơn hàng thất bại';
      toast.error(msg);
      if (data?.errors) {
        Object.assign(errors, data.errors);
      }
    }
  } catch (err: any) {
    const msg = err?.response?.data?.message || err?.message || 'Lỗi khi tạo đơn hàng';
    toast.error(msg);
  } finally {
    submitting.value = false;
  }
}

function resetForm() {
  cartItems.splice(0);
  orderDiscount.value = 0;
  paidAmount.value = 0;
  paymentMethod.value = 'cash';
  orderStatusCode.value = 1;
  description.value = '';
  productSearchKeyword.value = '';
  showProductDropdown.value = false;
  productList.value = [];
  Object.keys(errors).forEach(k => delete errors[k]);
}

function close() {
  if (!submitting.value) {
    showProductDropdown.value = false;
    emit('update:modelValue', false);
  }
}

// ─── Init ─────────────────────────────────────────────────────────────
watch(() => props.modelValue, (open) => {
  if (open) {
    fetchBranches();
    resetForm();
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
}
</script>

<style scoped>
.create-order-card {
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}
.com-header {
  background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
}
.com-header .com-icon {
  font-size: 20px;
}
.com-body {
  overflow-y: auto;
  max-height: 60vh;
}
.com-label {
  font-size: 12px;
  font-weight: 600;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.com-table {
  border-collapse: collapse;
  font-size: 12px;
}
.com-table th {
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.com-cart-row {
  border-top: 1px solid #e2e8f0;
}
.com-cart-row:hover {
  background-color: #f8fafc;
}
.com-qty-ctrl {
  display: inline-flex;
}
.com-qty-btn {
  width: 22px;
  height: 22px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background: #fff;
  color: #475569;
  cursor: pointer;
  font-size: 14px;
  line-height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.com-qty-btn:hover:not(:disabled) {
  background: #e2e8f0;
}
.com-qty-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.com-qty-input {
  width: 40px;
  height: 22px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  font-size: 12px;
  outline: none;
  text-align: center;
  -moz-appearance: textfield;
}
.com-qty-input::-webkit-outer-spin-button,
.com-qty-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.com-remove-btn {
  width: 20px;
  height: 20px;
  border: none;
  background: none;
  color: #ef4444;
  cursor: pointer;
  font-size: 16px;
  font-weight: bold;
  border-radius: 50%;
  line-height: 20px;
}
.com-remove-btn:hover {
  background: #fee2e2;
}
.com-discount-input :deep(.v-field__input) {
  font-size: 13px;
  padding-top: 2px;
  padding-bottom: 2px;
}

/* ─── Custom Product Search Dropdown ─── */
.com-product-search-wrapper {
  position: relative;
}
.com-product-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 100;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.12);
  max-height: 240px;
  overflow-y: auto;
  margin-top: 2px;
}
.com-product-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  cursor: pointer;
  transition: background-color 0.15s;
  border-bottom: 1px solid #f1f5f9;
}
.com-product-item:last-child {
  border-bottom: none;
}
.com-product-item:hover {
  background-color: #f0f9ff;
}
.com-product-item-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}
.com-product-code {
  font-family: monospace;
  font-size: 11px;
  color: #94a3b8;
  white-space: nowrap;
  flex-shrink: 0;
}
.com-product-name {
  font-size: 13px;
  color: #1e293b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.com-product-price {
  font-size: 12px;
  font-weight: 600;
  color: #0284c7;
  white-space: nowrap;
  margin-left: 12px;
  flex-shrink: 0;
}
.com-product-empty {
  padding: 16px;
  text-align: center;
  color: #94a3b8;
  font-size: 13px;
}
</style>
