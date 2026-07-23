<template>
  <teleport to="body">
    <!-- ═══ MINIMIZED FLOATING WIDGET (Góc dưới bên trái) ═══ -->
    <transition name="ob-float">
      <div
        v-if="modelValue && isMinimized"
        class="ob-floating-widget"
        @click="isMinimized = false"
      >
        <div class="ob-floating-widget__icon">
          <ShoppingBag :size="18" />
          <span v-if="totalCartCount > 0" class="ob-floating-widget__badge">{{ totalCartCount }}</span>
        </div>
        <div class="ob-floating-widget__info">
          <div class="ob-floating-widget__title">
            <span>🛒 Đơn hàng: {{ customerInfo.name }}</span>
          </div>
          <div class="ob-floating-widget__meta">
            <span>{{ drafts.length }} phiếu nháp</span>
            <span class="ob-sep">•</span>
            <span class="ob-floating-widget__amount">{{ formatVND(grandTotal) }}</span>
          </div>
        </div>
        <div class="ob-floating-widget__expand-hint" title="Bấm để mở lại cửa sở đơn hàng">
          <Maximize2 :size="14" />
        </div>
      </div>
    </transition>

    <!-- ═══ FULL MODAL WINDOW ═══ -->
    <transition name="ob-modal">
      <div v-if="modelValue && !isMinimized" class="ob-modal-overlay" @click.self="handleRedButtonClick">
        <div class="ob-modal-frame">
          <!-- ═══ macOS Window Header ═══ -->
          <div class="ob-modal__header">
            <div class="ob-modal__header-left">
              <div class="ob-modal__traffic-lights">
                <span class="ob-traffic ob-traffic--red" title="Xóa dữ liệu & Đóng cửa sổ" @click="handleRedButtonClick" />
                <span class="ob-traffic ob-traffic--yellow" title="Thu nhỏ cửa sổ (Minimize)" @click="isMinimized = true" />
                <span class="ob-traffic ob-traffic--green" title="Đặt lại sơ đồ" @click="handleReset" />
              </div>
              <div class="ob-modal__title-group">
                <h1 class="ob-modal__title">Tạo đơn hàng</h1>
              </div>
            </div>
            <div class="ob-modal__header-right">
              <button class="ob-modal__reset-btn" @click="isMinimized = true">
                <Minimize2 :size="14" class="ob-text-blue" />
                <span>Thu nhỏ</span>
              </button>
              <button class="ob-modal__reset-btn" @click="handleReset">
                <Zap :size="14" class="ob-text-amber" />
                <span>Đặt lại sơ đồ</span>
              </button>
            </div>
          </div>

          <!-- ═══ Main Workspace ═══ -->
          <div class="ob-modal__workspace">
            <!-- Left Sidebar -->
            <SidebarPalette
              :customer="customerInfo"
              :products="products"
              :branches="branches"
              :selected-product-ids="selectedProductIds"
              :selected-branch-id="activeDraft.branchId"
              :selected-payment-method="activeDraft.paymentMethod"
              :selected-order-status="activeDraft.orderStatus"
              :loading="productsLoading"
              @add-product="handleAddProduct"
              @select-branch="handleSelectBranch"
              @select-payment="handleSelectPayment"
              @select-order-status="handleSelectOrderStatus"
              @search="handleSearchProducts"
            />

            <!-- Base Workspace: Flow Canvas (Always rendered) -->
            <FlowCanvas
              :customer="customerInfo"
              :cart-items="activeDraft.cartItems"
              :branch="selectedBranch"
              :selected-payment-method="activeDraft.paymentMethod"
              :selected-price-book-id="activeDraft.priceBookId"
              :delivery-address="activeDraft.deliveryAddress"
              :total-before-discount="totalAmount"
              :order-discount="orderDiscountAmount"
              :grand-total="grandTotal"
              :drafts="drafts"
              :active-draft-id="activeDraftId"
              @select-draft="handleSelectDraft"
              @create-draft="handleCreateDraft"
              @delete-draft="handleDeleteDraft"
              @update-quantity="handleUpdateQuantity"
              @remove-product="handleRemoveProduct"
              @select-price-book="handleSelectPriceBook"
              @update-product-discount="handleUpdateProductDiscount"
              @update-order-discount="handleUpdateOrderDiscount"
              @update-delivery-address="handleUpdateDeliveryAddress"
              @open-details="isDrawerOpen = true"
            />

            <!-- Top Layer: Dark Backdrop + Invoice Template (Center) + Order Summary (Right) -->
            <transition name="ob-fade">
              <div v-if="isDrawerOpen" class="ob-modal__checkout-overlay" @click.self="isDrawerOpen = false">
                <div class="ob-modal__checkout-content">
                  <!-- Invoice Template (Center) -->
                  <div class="ob-modal__checkout-template-wrap">
                    <InvoiceTemplateModal
                      :customer="customerInfo"
                      :cart-items="activeDraft.cartItems"
                      :branch="selectedBranch"
                      :ticket-number="activeDraft.ticketNumber"
                      :total-before-discount="totalAmount"
                      :order-discount="orderDiscountAmount"
                      :paid-amount="activeDraft.paidAmount || 0"
                      :grand-total="grandTotal"
                      :price-book-id="activeDraft.priceBookId"
                      :description="activeDraft.description"
                      :delivery-address="activeDraft.deliveryAddress"
                      @update-description="activeDraft.description = $event"
                    />
                  </div>
                  <!-- Order Summary Drawer (Right) -->
                  <div class="ob-modal__checkout-drawer-wrap">
                    <OrderSummaryDrawer
                      :customer="customerInfo"
                      :cart-items="activeDraft.cartItems"
                      :branch="selectedBranch"
                      :selected-payment-method="activeDraft.paymentMethod"
                      :total-before-discount="totalAmount"
                      :order-discount="orderDiscountAmount"
                      :grand-total="grandTotal"
                      :description="activeDraft.description"
                      :paid-amount="activeDraft.paidAmount"
                      :delivery-address="activeDraft.deliveryAddress"
                      :submitting="submitting"
                      @close="isDrawerOpen = false"
                      @clear-order="handleClearOrder"
                      @submit-order="handleSubmitOrder"
                      @update-description="activeDraft.description = $event"
                      @update-paid="activeDraft.paidAmount = $event"
                    />
                  </div>
                </div>
              </div>
            </transition>
          </div>

          <!-- ═══ CONFIRM CLEAR DIALOG (Khi bấm nút Đỏ) ═══ -->
          <transition name="ob-fade">
            <div v-if="showClearConfirm" class="ob-confirm-overlay" @click.self="showClearConfirm = false">
              <div class="ob-confirm-card">
                <div class="ob-confirm-card__icon">
                  <AlertTriangle :size="32" class="ob-text-red" />
                </div>
                <h3>Xác nhận xóa phiếu đơn hàng?</h3>
                <p>Thao tác này sẽ xóa tất cả sản phẩm và các phiếu nháp đang soạn thảo. Bạn có chắc chắn muốn xóa không?</p>
                <div class="ob-confirm-card__actions">
                  <button class="ob-confirm-btn ob-confirm-btn--cancel" @click="showClearConfirm = false">
                    Hủy bỏ
                  </button>
                  <button class="ob-confirm-btn ob-confirm-btn--danger" @click="confirmClearAll">
                    Xóa toàn bộ & Đóng
                  </button>
                </div>
              </div>
            </div>
          </transition>

          <!-- ═══ Success Modal ═══ -->
          <SuccessModal
            :is-open="isSuccessOpen"
            :order-code="completedOrderCode"
            :customer-name="customerInfo.name"
            :pos-customer-code="customerInfo.posCustomerCode"
            :total-items="completedTotalItems"
            :final-total="completedFinalTotal"
            :payment-method="completedPaymentMethod"
            @close="handleSuccessClose"
          />

          <!-- ═══ Toast ═══ -->
          <transition name="ob-toast">
            <div v-if="toastMessage" class="ob-toast">
              <Zap :size="14" class="ob-text-blue" />
              <span>{{ toastMessage }}</span>
            </div>
          </transition>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { Zap, ShoppingBag, Maximize2, Minimize2, AlertTriangle } from 'lucide-vue-next';
import { api } from '@/api';

import SidebarPalette from './SidebarPalette.vue';
import FlowCanvas from './FlowCanvas.vue';
import OrderSummaryDrawer from './OrderSummaryDrawer.vue';
import SuccessModal from './SuccessModal.vue';
import InvoiceTemplateModal from './InvoiceTemplateModal.vue';

import type {
  POSProduct, POSBranch, CustomerInfo, CartItem, DraftOrder,
} from './types';
import { formatVND, PRICE_BOOKS, getEffectiveProductPrice } from './types';

const props = defineProps<{
  modelValue: boolean;
  contactId?: string;
  contactName?: string;
  contactPhone?: string;
  posCustomerId?: number;
  posCustomerCode?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'order-created': [data: any];
}>();

// ─── Data loaded from backend ─────────────────────────────────────────
const products = ref<POSProduct[]>([]);
const branches = ref<POSBranch[]>([]);
const productsLoading = ref(false);

// ─── Multi-draft state ────────────────────────────────────────────────
const drafts = reactive<DraftOrder[]>([]);
const activeDraftId = ref('');

const activeDraft = computed(() => {
  return drafts.find(d => d.id === activeDraftId.value) || drafts[0];
});

const selectedProductIds = computed<Record<number, number>>(() => {
  const map: Record<number, number> = {};
  if (activeDraft.value) {
    for (const item of activeDraft.value.cartItems) {
      map[item.product.id] = item.quantity;
    }
  }
  return map;
});

const selectedBranch = computed<POSBranch | null>(() => {
  if (!activeDraft.value?.branchId) return null;
  return branches.value.find(b => b.id === activeDraft.value.branchId) || null;
});

const totalAmount = computed(() => {
  if (!activeDraft.value) return 0;
  const pbId = activeDraft.value.priceBookId || 'standard';
  return activeDraft.value.cartItems.reduce(
    (sum, item) => {
      const unitPrice = getEffectiveProductPrice(item.product.basePrice, pbId);
      const lineFinal = Math.max(0, unitPrice * item.quantity - (item.discount || 0));
      return sum + lineFinal;
    }, 0
  );
});

const orderDiscountAmount = computed(() => {
  if (!activeDraft.value) return 0;
  return Math.max(0, activeDraft.value.orderDiscount || 0);
});

const grandTotal = computed(() => {
  return Math.max(0, totalAmount.value - orderDiscountAmount.value);
});

const totalCartCount = computed(() => {
  if (!activeDraft.value) return 0;
  return activeDraft.value.cartItems.reduce((sum, item) => sum + item.quantity, 0);
});

const customerInfo = computed<CustomerInfo>(() => ({
  posCustomerId: props.posCustomerId || 0,
  posCustomerCode: props.posCustomerCode,
  contactId: props.contactId,
  name: props.contactName || 'Khách hàng',
  phone: props.contactPhone,
}));

// ─── UI state ─────────────────────────────────────────────────────────
const isMinimized = ref(false);
const showClearConfirm = ref(false);
const isDrawerOpen = ref(false);
const isSuccessOpen = ref(false);
const submitting = ref(false);
const toastMessage = ref<string | null>(null);

// Success data
const completedOrderCode = ref('');
const completedTotalItems = ref(0);
const completedFinalTotal = ref(0);
const completedPaymentMethod = ref('');

// ─── Traffic Light Handlers ───────────────────────────────────────────
function handleRedButtonClick() {
  if (totalCartCount.value > 0 || drafts.length > 1) {
    showClearConfirm.value = true;
  } else {
    closeModal();
  }
}

function confirmClearAll() {
  showClearConfirm.value = false;
  resetAll();
  showToast('Đã xóa dữ liệu phiếu nháp.');
  emit('update:modelValue', false);
}

// ─── Price Book & Discount Handlers ──────────────────────────────────
function handleSelectPriceBook(priceBookId: string) {
  if (activeDraft.value) {
    activeDraft.value.priceBookId = priceBookId;
    const pb = PRICE_BOOKS.find(p => p.id === priceBookId);
    if (pb) {
      if (pb.type === 'pos_sync') {
        showToast(`Đã chọn ${pb.name} — Cần đồng bộ API POS sau.`);
      } else {
        showToast(`Đã áp dụng ${pb.name}`);
      }
    }
  }
}

function handleUpdateProductDiscount(productId: number, discount: number) {
  if (!activeDraft.value) return;
  const item = activeDraft.value.cartItems.find(c => c.product.id === productId);
  if (item) {
    const pbId = activeDraft.value.priceBookId || 'standard';
    const unitPrice = getEffectiveProductPrice(item.product.basePrice, pbId);
    const lineSubtotal = unitPrice * item.quantity;
    item.discount = Math.min(Math.max(0, discount), lineSubtotal);
  }
}

function handleUpdateOrderDiscount(discount: number) {
  if (!activeDraft.value) return;
  const maxAllowed = totalAmount.value;
  activeDraft.value.orderDiscount = Math.min(Math.max(0, discount), maxAllowed);
}

// ─── Init / Reset ─────────────────────────────────────────────────────
function initDraft(): DraftOrder {
  return {
    id: `draft-${Date.now()}`,
    ticketNumber: 'Phiếu #1',
    customer: customerInfo.value,
    cartItems: [],
    branchId: branches.value.length > 0 ? branches.value[0].id : null,
    paymentMethod: 'cash',
    orderStatus: 1,
    priceBookId: 'standard',
    orderDiscount: 0,
    description: '',
    paidAmount: 0,
    deliveryAddress: customerInfo.value.address || '123 Đường Lê Lợi, Quận 1, TP.HCM',
    createdAt: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
  };
}

function resetAll() {
  drafts.splice(0);
  const d = initDraft();
  drafts.push(d);
  activeDraftId.value = d.id;
  isDrawerOpen.value = false;
  isSuccessOpen.value = false;
  submitting.value = false;
  isMinimized.value = false;
}

// ─── Data fetching ────────────────────────────────────────────────────
async function fetchBranches() {
  try {
    const { data } = await api.get<{ success: boolean; data: { id: number; name: string }[] }>('/pos/branches');
    branches.value = (data?.data || []) as POSBranch[];
    if (branches.value.length > 0 && activeDraft.value && !activeDraft.value.branchId) {
      activeDraft.value.branchId = branches.value[0].id;
    }
  } catch (err) {
    console.error('fetchBranches failed:', err);
  }
}

async function fetchProducts(keyword?: string) {
  productsLoading.value = true;
  try {
    const params: any = { limit: 30 };
    if (keyword) params.keyword = keyword;
    const { data } = await api.get<{ items: any[]; nextCursor: string | null }>('/pos/products', { params });
    const items = data?.items || [];
    products.value = items.map((p: any) => ({
      id: p.posId,
      code: p.code || '',
      name: p.name || '',
      categoryName: p.categoryName || '',
      basePrice: p.basePrice || 0,
      unit: p.unit || '',
      onHand: p.onHand,
      imageUrl: p.imageUrl,
    }));
  } catch (err) {
    console.error('fetchProducts failed:', err);
  } finally {
    productsLoading.value = false;
  }
}

// ─── Draft Management ─────────────────────────────────────────────────
function handleSelectDraft(id: string) {
  activeDraftId.value = id;
  const draft = drafts.find(d => d.id === id);
  showToast(`Đã chuyển sang ${draft?.ticketNumber || 'phiếu đặt hàng'}`);
}

function handleCreateDraft() {
  const maxNum = drafts.reduce((max, d) => {
    const match = d.ticketNumber.match(/Phiếu #(\d+)/);
    return match ? Math.max(max, parseInt(match[1])) : max;
  }, 0);

  const newDraft: DraftOrder = {
    id: `draft-${Date.now()}`,
    ticketNumber: `Phiếu #${maxNum + 1}`,
    customer: customerInfo.value,
    cartItems: [],
    branchId: branches.value.length > 0 ? branches.value[0].id : null,
    paymentMethod: 'cash',
    orderStatus: 1,
    priceBookId: 'standard',
    description: '',
    paidAmount: 0,
    deliveryAddress: customerInfo.value.address || '123 Đường Lê Lợi, Quận 1, TP.HCM',
    createdAt: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
  };
  drafts.push(newDraft);
  activeDraftId.value = newDraft.id;
  showToast(`Đã mở ${newDraft.ticketNumber} mới.`);
}

function handleDeleteDraft(id: string) {
  if (drafts.length <= 1) {
    showToast('Hệ thống yêu cầu tối thiểu 1 phiếu nháp.');
    return;
  }
  const draft = drafts.find(d => d.id === id);
  const idx = drafts.findIndex(d => d.id === id);
  if (idx !== -1) drafts.splice(idx, 1);
  if (activeDraftId.value === id) {
    activeDraftId.value = drafts[0].id;
  }
  if (draft) showToast(`Đã hủy ${draft.ticketNumber}.`);
}

// ─── Cart Operations ──────────────────────────────────────────────────
function handleAddProduct(product: POSProduct) {
  if (!activeDraft.value) return;
  const existing = activeDraft.value.cartItems.find(c => c.product.id === product.id);
  if (existing) {
    existing.quantity++;
    showToast(`Đã tăng số lượng ${product.name}.`);
  } else {
    activeDraft.value.cartItems.push({ product, quantity: 1 });
    showToast(`Đã thêm ${product.name} vào bảng vẽ.`);
  }
}

function handleUpdateQuantity(productId: number, quantity: number) {
  if (!activeDraft.value) return;
  const item = activeDraft.value.cartItems.find(c => c.product.id === productId);
  if (item) item.quantity = quantity;
}

function handleRemoveProduct(productId: number) {
  if (!activeDraft.value) return;
  const idx = activeDraft.value.cartItems.findIndex(c => c.product.id === productId);
  if (idx !== -1) activeDraft.value.cartItems.splice(idx, 1);
}

function handleClearOrder() {
  if (!activeDraft.value) return;
  activeDraft.value.cartItems.splice(0);
  showToast('Đã dọn sạch sơ đồ đơn hàng.');
}

// ─── Sidebar selections ───────────────────────────────────────────────
function handleSelectBranch(branchId: number) {
  if (activeDraft.value) activeDraft.value.branchId = branchId;
}

function handleSelectPayment(method: string) {
  if (activeDraft.value) activeDraft.value.paymentMethod = method;
}

function handleSelectOrderStatus(status: number) {
  if (activeDraft.value) activeDraft.value.orderStatus = status;
}

function handleUpdateDeliveryAddress(address: string) {
  if (activeDraft.value) {
    activeDraft.value.deliveryAddress = address;
  }
}

function handleSearchProducts(keyword: string) {
  fetchProducts(keyword || undefined);
}

function handleReset() {
  if (activeDraft.value) {
    activeDraft.value.cartItems.splice(0);
    activeDraft.value.paidAmount = 0;
    activeDraft.value.description = '';
    activeDraft.value.orderStatus = 1;
    showToast('Đã đặt lại sơ đồ đơn hàng về mặc định.');
  }
}

// ─── Submit Order ─────────────────────────────────────────────────────
async function handleSubmitOrder() {
  if (!activeDraft.value || activeDraft.value.cartItems.length === 0) {
    showToast('Vui lòng thêm sản phẩm trước khi tạo đơn.');
    return;
  }
  if (!activeDraft.value.branchId) {
    showToast('Vui lòng chọn chi nhánh.');
    return;
  }
  if (!props.posCustomerId) {
    showToast('Chưa liên kết khách hàng POS.');
    return;
  }

  submitting.value = true;
  try {
    const pbId = activeDraft.value.priceBookId || 'standard';
    const payload = {
      contactId: props.contactId || undefined,
      posCustomerId: props.posCustomerId,
      branchId: activeDraft.value.branchId,
      priceBookId: pbId,
      items: activeDraft.value.cartItems.map(c => ({
        productId: c.product.id,
        productCode: c.product.code,
        productName: c.product.name,
        quantity: c.quantity,
        unitPrice: getEffectiveProductPrice(c.product.basePrice, pbId),
        discount: c.discount || 0,
        note: '',
      })),
      discount: activeDraft.value.orderDiscount || 0,
      paidAmount: activeDraft.value.paidAmount || 0,
      paymentMethod: activeDraft.value.paymentMethod,
      orderStatus: activeDraft.value.orderStatus,
      description: activeDraft.value.description || '',
    };

    const { data } = await api.post<any>('/pos/orders', payload);
    if (data?.success) {
      completedOrderCode.value = data.data?.orderCode || `DH${Date.now()}`;
      completedTotalItems.value = activeDraft.value.cartItems.reduce((s, c) => s + c.quantity, 0);
      completedFinalTotal.value = grandTotal.value;
      completedPaymentMethod.value = activeDraft.value.paymentMethod;
      isDrawerOpen.value = false;
      isSuccessOpen.value = true;
      emit('order-created', data.data);
    } else {
      showToast(data?.message || 'Tạo đơn hàng thất bại');
    }
  } catch (err: any) {
    const msg = err?.response?.data?.message || err?.message || 'Lỗi khi tạo đơn hàng';
    showToast(msg);
  } finally {
    submitting.value = false;
  }
}

function handleSuccessClose() {
  isSuccessOpen.value = false;
  if (drafts.length <= 1) {
    if (activeDraft.value) {
      activeDraft.value.cartItems.splice(0);
      activeDraft.value.paidAmount = 0;
      activeDraft.value.description = '';
      activeDraft.value.orderStatus = 1;
    }
  } else {
    const idx = drafts.findIndex(d => d.id === activeDraftId.value);
    if (idx !== -1) drafts.splice(idx, 1);
    activeDraftId.value = drafts[0].id;
  }
  showToast('Đơn hàng thành công! Đã dọn sạch phiếu đặt hàng.');
}

// ─── Toast ────────────────────────────────────────────────────────────
function showToast(msg: string) {
  toastMessage.value = msg;
  setTimeout(() => { toastMessage.value = null; }, 3000);
}

// ─── Close ────────────────────────────────────────────────────────────
function closeModal() {
  if (!submitting.value) {
    emit('update:modelValue', false);
  }
}

// ─── Watch open ───────────────────────────────────────────────────────
watch(() => props.modelValue, (open) => {
  if (open) {
    if (drafts.length === 0) {
      resetAll();
    }
    isMinimized.value = false;
    fetchBranches();
    fetchProducts();
  }
});
</script>

<style scoped>
/* ═══ FLOATING WIDGET (Thu nhỏ góc dưới bên trái) ═══ */
.ob-floating-widget {
  position: fixed;
  bottom: 24px;
  left: 24px;
  z-index: 9999;
  background: #ffffff;
  border: 2px solid #0068FF;
  border-radius: 16px;
  padding: 10px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  box-shadow: 0 10px 30px rgba(0, 104, 255, 0.25);
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  user-select: none;
}
.ob-floating-widget:hover {
  transform: translateY(-3px) scale(1.02);
  box-shadow: 0 14px 36px rgba(0, 104, 255, 0.35);
  background: #f8fafc;
}
.ob-floating-widget__icon {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: #0068FF;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  flex-shrink: 0;
}
.ob-floating-widget__badge {
  position: absolute;
  top: -6px;
  right: -6px;
  background: #ef4444;
  color: #fff;
  font-size: 10px;
  font-weight: 800;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid #fff;
}
.ob-floating-widget__info {
  display: flex;
  flex-direction: column;
}
.ob-floating-widget__title {
  font-size: 12px;
  font-weight: 800;
  color: #1e293b;
}
.ob-floating-widget__meta {
  font-size: 10px;
  color: #64748b;
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
}
.ob-floating-widget__amount {
  font-weight: 700;
  color: #0068FF;
  font-family: monospace;
}
.ob-floating-widget__expand-hint {
  padding: 6px;
  border-radius: 8px;
  background: #eff6ff;
  color: #0068FF;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: 4px;
}
.ob-sep { opacity: 0.4; }

/* ═══ Overlay ═══ */
.ob-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 9000;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 10px;
}

/* ═══ Frame (Tăng 25% chiều ngang 2 bên) ═══ */
.ob-modal-frame {
  position: relative;
  z-index: 10;
  width: 99.5vw;
  max-width: 1850px;
  height: 95vh;
  max-height: 900px;
  background: #fff;
  border-radius: 16px;
  border: 1px solid rgba(226,232,240,0.8);
  box-shadow: 0 20px 60px rgba(0,0,0,0.25);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* ═══ Header ═══ */
.ob-modal__header {
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  padding: 10px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  user-select: none;
}
.ob-modal__header-left {
  display: flex;
  align-items: center;
  gap: 20px;
}
.ob-modal__traffic-lights {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ob-traffic {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  transition: transform 0.1s ease;
}
.ob-traffic:hover {
  transform: scale(1.15);
}
.ob-traffic--red {
  background: rgba(239,68,68,0.9);
  border: 1px solid rgba(239,68,68,0.3);
  cursor: pointer;
}
.ob-traffic--red:hover { background: #ef4444; }
.ob-traffic--yellow {
  background: rgba(245,158,11,0.9);
  border: 1px solid rgba(245,158,11,0.3);
  cursor: pointer;
}
.ob-traffic--yellow:hover { background: #f59e0b; }
.ob-traffic--green {
  background: rgba(16,185,129,0.9);
  border: 1px solid rgba(16,185,129,0.3);
  cursor: pointer;
}
.ob-traffic--green:hover { background: #10b981; }

.ob-modal__title-group {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ob-modal__badge {
  font-size: 10px;
  text-transform: uppercase;
  font-weight: 700;
  color: #0068FF;
  letter-spacing: 0.05em;
  padding: 2px 8px;
  background: #eff6ff;
  border: 1px solid rgba(0,104,255,0.15);
  border-radius: 4px;
}
.ob-modal__title {
  font-size: 14px;
  font-weight: 800;
  color: #1e293b;
  letter-spacing: -0.02em;
  margin: 0;
}
.ob-modal__header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.ob-modal__sync-status {
  font-size: 11px;
  color: #64748b;
  display: flex;
  align-items: center;
  gap: 6px;
  padding-right: 12px;
  border-right: 1px solid #e2e8f0;
}
.ob-modal__sync-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #10b981;
}
.ob-modal__reset-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 700;
  color: #64748b;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
}
.ob-modal__reset-btn:hover {
  background: #f1f5f9;
  color: #1e293b;
}

/* ═══ Workspace ═══ */
.ob-modal__workspace {
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
}

/* ═══ Top Layer Checkout Modal (Backdrop + Template + Drawer) ═══ */
.ob-modal__checkout-overlay {
  position: absolute;
  inset: 0;
  z-index: 60;
  background: rgba(15, 23, 42, 0.5);
  backdrop-filter: blur(5px);
  -webkit-backdrop-filter: blur(5px);
  display: flex;
}
.ob-modal__checkout-content {
  width: 100%;
  height: 100%;
  display: flex;
}
.ob-modal__checkout-template-wrap {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}
.ob-modal__checkout-drawer-wrap {
  width: 400px;
  min-width: 360px;
  max-width: 420px;
  height: 100%;
  flex-shrink: 0;
  background: #fff;
  border-left: 1px solid #cbd5e1;
  box-shadow: -8px 0 24px rgba(0,0,0,0.15);
  z-index: 10;
}

/* ═══ Confirm Dialog (Red button) ═══ */
.ob-confirm-overlay {
  position: absolute;
  inset: 0;
  z-index: 80;
  background: rgba(15, 23, 42, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.ob-confirm-card {
  background: #fff;
  border-radius: 20px;
  padding: 24px;
  max-width: 400px;
  width: 100%;
  text-align: center;
  box-shadow: 0 20px 50px rgba(0,0,0,0.2);
}
.ob-confirm-card__icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: #fef2f2;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 12px;
}
.ob-confirm-card h3 {
  font-size: 16px;
  font-weight: 800;
  color: #1e293b;
  margin: 0 0 6px;
}
.ob-confirm-card p {
  font-size: 12px;
  color: #64748b;
  margin: 0 0 20px;
  line-height: 1.5;
}
.ob-confirm-card__actions {
  display: flex;
  gap: 10px;
}
.ob-confirm-btn {
  flex: 1;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 700;
  border: none;
  cursor: pointer;
  transition: all 0.15s;
}
.ob-confirm-btn--cancel {
  background: #f1f5f9;
  color: #64748b;
}
.ob-confirm-btn--cancel:hover { background: #e2e8f0; color: #1e293b; }
.ob-confirm-btn--danger {
  background: #ef4444;
  color: #fff;
}
.ob-confirm-btn--danger:hover { background: #dc2626; }

/* ═══ Drawer Panel (Side-by-Side Panel) ═══ */
.ob-modal__drawer-overlay {
  position: relative;
  width: 400px;
  min-width: 360px;
  max-width: 420px;
  height: 100%;
  flex-shrink: 0;
  background: #fff;
  z-index: 50;
  border-left: 1px solid #cbd5e1;
  box-shadow: -4px 0 16px rgba(0,0,0,0.06);
}
.ob-modal__drawer {
  position: relative;
  width: 100%;
  height: 100%;
  background: #fff;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ═══ Toast ═══ */
.ob-toast {
  position: fixed;
  bottom: 24px;
  left: 24px;
  z-index: 9999;
  background: #0f172a;
  color: #fff;
  padding: 12px 16px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 700;
  box-shadow: 0 4px 16px rgba(0,0,0,0.2);
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid #1e293b;
}

/* ═══ Transitions ═══ */
.ob-float-enter-active,
.ob-float-leave-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.ob-float-enter-from,
.ob-float-leave-to {
  opacity: 0;
  transform: translateY(20px) scale(0.9);
}

.ob-modal-enter-active,
.ob-modal-leave-active {
  transition: opacity 0.25s ease;
}
.ob-modal-enter-from,
.ob-modal-leave-to {
  opacity: 0;
}

.ob-slide-enter-active,
.ob-slide-leave-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.ob-slide-enter-from,
.ob-slide-leave-to {
  margin-right: -400px;
  opacity: 0;
}

.ob-toast-enter-active,
.ob-toast-leave-active {
  transition: all 0.3s ease;
}
.ob-toast-enter-from,
.ob-toast-leave-to {
  opacity: 0;
  transform: translateY(20px);
}

.ob-fade-enter-active,
.ob-fade-leave-active {
  transition: opacity 0.2s ease;
}
.ob-fade-enter-from,
.ob-fade-leave-to {
  opacity: 0;
}

/* ═══ Utility ═══ */
.ob-text-blue { color: #0068FF; }
.ob-text-amber { color: #f59e0b; }
.ob-text-red { color: #ef4444; }
</style>
