<template>
  <teleport to="body">
    <!-- ═══ FULL MODAL WINDOW ═══ -->
    <transition name="ob-modal">
      <div v-if="isModalVisible" class="ob-modal-overlay" @click.self="handleRedButtonClick">
        <div class="ob-modal-wrapper">
          <!-- ═══ OUTSIDE STEPPER RAIL (Tách biệt riêng bên ngoài) ═══ -->
          <div class="ob-outer-left-rail">
            <template v-for="(section, idx) in accordionSections" :key="section.id">
              <div
                class="ob-rail-step"
                :class="{
                  'ob-rail-step--active': section.id === activeSection,
                  'ob-rail-step--done': completedSections.includes(section.id) && section.id !== activeSection,
                  'ob-rail-step--locked': lockedSections.includes(section.id),
                }"
                :title="section.title"
                @click="handleOpenSection(section.id)"
              >
                <Check v-if="completedSections.includes(section.id) && section.id !== activeSection" :size="13" :stroke-width="3" />
                <Lock v-else-if="lockedSections.includes(section.id)" :size="11" :stroke-width="2.5" />
                <span v-else>{{ idx + 1 }}</span>
              </div>

              <div
                v-if="idx < accordionSections.length - 1"
                class="ob-rail-step-arrow"
                :class="{ 'ob-rail-step-arrow--done': completedSections.includes(section.id) }"
              >
                <ArrowDown :size="12" :stroke-width="2.5" />
              </div>
            </template>
          </div>

          <div class="ob-modal-frame">
            <!-- ═══ Window Header ═══ -->
            <div class="ob-modal__header">
              <div class="ob-modal__header-left">
                <div class="ob-modal__title-group">
                  <ShoppingBag :size="18" class="ob-text-blue" />
                  <h1 class="ob-modal__title">Tạo đơn hàng</h1>
                </div>
              </div>

              <div class="ob-modal__header-right">
                <div class="ob-win-controls">
                  <button class="ob-win-btn ob-win-btn--reset" title="Đặt lại dữ liệu" @click="handleReset">
                    <RotateCcw :size="14" />
                  </button>
                  <button class="ob-win-btn ob-win-btn--minimize" title="Thu nhỏ" @click="handleMinimize">
                    <Minus :size="15" />
                  </button>
                  <button class="ob-win-btn ob-win-btn--close" title="Xóa dữ liệu & Đóng" @click="handleRedButtonClick">
                    <X :size="15" />
                  </button>
                </div>
              </div>
            </div>

            <!-- ═══ Main Workspace: Sections + Checkout Overlay ═══ -->
            <div class="ob-modal__workspace">
              <div class="ob-sections-scroll">
                <SectionAccordion
                  :sections="accordionSections"
                  :active-section="activeSection"
                  :completed-sections="completedSections"
                  :locked-sections="lockedSections"
                  @open-section="handleOpenSection"
                  @next-section="handleNextSection"
                >
                  <!-- Section 1: Khách hàng -->
                  <template #customer>
                    <Section1Customer :customer="customerInfo" />
                  </template>

                  <!-- Section 2: Sản phẩm & Khuyến mãi -->
                  <template #products>
                    <Section2Products
                      :selected-product-ids="selectedProductIds"
                      :cart-items="cartItems"
                      :total-before-discount="totalAmount"
                      :order-discount="orderDiscountAmount"
                      :grand-total="grandTotal"
                      :selected-price-book-id="draft?.priceBookId"
                      :applied-promo-ids="draft?.appliedPromoIds ?? []"
                      @add-product="handleAddProduct"
                      @update-quantity="handleUpdateQuantity"
                      @remove-product="handleRemoveProduct"
                      @update-product-discount="handleUpdateProductDiscount"
                      @update-order-discount="handleUpdateOrderDiscount"
                      @select-price-book="handleSelectPriceBook"
                      @apply-promotion="handleApplyPromotion"
                      @remove-promotion="handleRemovePromotion"
                    />
                  </template>

                  <!-- Section 3: Vận chuyển & Thanh toán -->
                  <template #logistics>
                    <Section3Logistics
                      :branches="branches"
                      :selected-branch-id="draft?.branchId ?? null"
                      :selected-payment-method="draft?.paymentMethod ?? 'cash'"
                      :selected-order-status="draft?.orderStatus ?? 1"
                      :delivery-address="draft?.deliveryAddress ?? ''"
                      @select-branch="handleSelectBranch"
                      @select-payment="handleSelectPayment"
                      @select-order-status="handleSelectOrderStatus"
                      @update-delivery-address="handleUpdateDeliveryAddress"
                    />
                  </template>

                  <!-- Section 4: Review -->
                  <template #review>
                    <Section4Review
                      :customer="customerInfo"
                      :cart-items="cartItems"
                      :branch="selectedBranch"
                      :selected-payment-method="draft?.paymentMethod ?? 'cash'"
                      :delivery-address="draft?.deliveryAddress ?? ''"
                      :total-before-discount="totalAmount"
                      :order-discount="orderDiscountAmount"
                      :grand-total="grandTotal"
                      @open-details="isDrawerOpen = true"
                    />
                  </template>
                </SectionAccordion>
              </div>

              <!-- ═══ Top Layer: Invoice Template + Order Summary Drawer ═══ -->
              <transition name="ob-fade">
                <div v-if="isDrawerOpen" class="ob-modal__checkout-overlay" @click.self="isDrawerOpen = false">
                  <div class="ob-modal__checkout-content">
                    <div class="ob-modal__checkout-template-wrap">
                      <InvoiceTemplateModal
                        :customer="customerInfo"
                        :cart-items="cartItems"
                        :branch="selectedBranch"
                        :ticket-number="draft?.id ?? 'Phiếu #1'"
                        :total-before-discount="totalAmount"
                        :order-discount="orderDiscountAmount"
                        :paid-amount="draft?.paidAmount || 0"
                        :grand-total="grandTotal"
                        :price-book-id="draft?.priceBookId"
                        :description="draft?.description ?? ''"
                        :delivery-address="draft?.deliveryAddress ?? ''"
                        @update-description="draftStore.updateDraft(props.draftId, { description: $event })"
                      />
                    </div>
                    <div class="ob-modal__checkout-drawer-wrap">
                      <OrderSummaryDrawer
                        :customer="customerInfo"
                        :cart-items="cartItems"
                        :branch="selectedBranch"
                        :selected-payment-method="draft?.paymentMethod ?? 'cash'"
                        :total-before-discount="totalAmount"
                        :order-discount="orderDiscountAmount"
                        :grand-total="grandTotal"
                        :description="draft?.description ?? ''"
                        :paid-amount="draft?.paidAmount ?? 0"
                        :delivery-address="draft?.deliveryAddress ?? ''"
                        :submitting="submitting"
                        @close="isDrawerOpen = false"
                        @clear-order="handleClearOrder"
                        @submit-order="handleSubmitOrder"
                        @update-description="draftStore.updateDraft(props.draftId, { description: $event })"
                        @update-paid="draftStore.updateDraft(props.draftId, { paidAmount: $event })"
                      />
                    </div>
                  </div>
                </div>
              </transition>
            </div>

            <!-- ═══ CONFIRM CLEAR DIALOG ═══ -->
            <transition name="ob-fade">
              <div v-if="showClearConfirm" class="ob-confirm-overlay" @click.self="showClearConfirm = false">
                <div class="ob-confirm-card">
                  <div class="ob-confirm-card__icon">
                    <AlertTriangle :size="32" class="ob-text-red" />
                  </div>
                  <h3>Xác nhận xóa đơn hàng?</h3>
                  <p>Thao tác này sẽ xóa tất cả sản phẩm đang soạn. Bạn có chắc chắn?</p>
                  <div class="ob-confirm-card__actions">
                    <button class="ob-confirm-btn ob-confirm-btn--cancel" @click="showClearConfirm = false">Hủy bỏ</button>
                    <button class="ob-confirm-btn ob-confirm-btn--danger" @click="confirmClearAll">Xóa toàn bộ & Đóng</button>
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
          </div><!-- /ob-modal-frame -->

          <!-- ═══ MINI CHAT PANEL ═══ -->
          <div class="ob-mini-chat-outer">
            <MiniChatPanel
              :contact-id="draft?.contactId"
              :contact-name="draft?.contactName"
            />
          </div>
        </div><!-- /ob-modal-wrapper -->
      </div>
    </transition>
  </teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { ShoppingBag, AlertTriangle, Minus, X, Check, Lock, RotateCcw, ArrowDown } from 'lucide-vue-next';
import { User, Truck, Tag, Sparkles, Zap } from 'lucide-vue-next';
import { api } from '@/api';
import { useOrderDraftStore } from '@/stores/use-order-drafts';

// Sub-components
import SectionAccordion from './SectionAccordion.vue';
import type { AccordionSection } from './SectionAccordion.vue';
import Section1Customer from './Section1Customer.vue';
import Section2Products from './Section2Products.vue';
import Section3Logistics from './Section3Logistics.vue';
import Section4Review from './Section4Review.vue';

// Existing shared components (unchanged)
import OrderSummaryDrawer from '../OrderSummaryDrawer.vue';
import SuccessModal from '../SuccessModal.vue';
import InvoiceTemplateModal from '../InvoiceTemplateModal.vue';
import MiniChatPanel from '../MiniChatPanel.vue';

import type {
  POSProduct, POSBranch, CustomerInfo, CartItem, PromotionProgram,
} from '../types';
import { formatVND, PRICE_BOOKS, getEffectiveProductPrice, MOCK_PROMOTIONS, evaluatePromoCondition } from '../types';

const props = defineProps<{
  draftId: string;
}>();

const emit = defineEmits<{
  'order-created': [data: any];
}>();

// ─── Store ────────────────────────────────────────────────────────────
const draftStore = useOrderDraftStore();

// Draft hiện tại (reactive reference to store entry)
const draft = computed(() => draftStore.drafts.find(d => d.id === props.draftId) ?? null);

// Modal visible khi draft tồn tại và không minimize
const isModalVisible = computed(() => !!draft.value && !draft.value.isMinimized);

// Helper: đọc field từ draft
function d<K extends keyof NonNullable<typeof draft.value>>(key: K) {
  return draft.value?.[key];
}

// ─── Backend data ─────────────────────────────────────────────────────
const branches = ref<POSBranch[]>([]);

// ─── Derived from draft (store) ───────────────────────────────────────
const cartItems = computed(() => draft.value?.cartItems ?? []);

const selectedProductIds = computed<Record<number, number>>(() => {
  const map: Record<number, number> = {};
  for (const item of cartItems.value) {
    map[item.product.id] = item.quantity;
  }
  return map;
});

const selectedBranch = computed<POSBranch | null>(() => {
  const branchId = draft.value?.branchId;
  if (!branchId) return null;
  return branches.value.find(b => b.id === branchId) || null;
});

const totalAmount = computed(() => {
  const pbId = draft.value?.priceBookId || 'standard';
  return cartItems.value.reduce((sum, item) => {
    const unitPrice = getEffectiveProductPrice(item.product.basePrice, pbId);
    return sum + Math.max(0, unitPrice * item.quantity - (item.discount || 0));
  }, 0);
});

const orderDiscountAmount = computed(() => Math.max(0, draft.value?.orderDiscount || 0));
const grandTotal = computed(() => Math.max(0, totalAmount.value - orderDiscountAmount.value));
const totalCartCount = computed(() => cartItems.value.reduce((sum, item) => sum + item.quantity, 0));

const customerInfo = computed<CustomerInfo>(() => ({
  posCustomerId: draft.value?.posCustomerId || 0,
  posCustomerCode: draft.value?.posCustomerCode,
  contactId: draft.value?.contactId,
  name: draft.value?.contactName || 'Khách hàng',
  phone: draft.value?.contactPhone,
}));

// ─── UI state (local — không cần persist) ────────────────────────────
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

// ─── Section Accordion State (lưu vào store) ─────────────────────────
const activeSection = computed({
  get: () => draft.value?.activeSection ?? 'customer',
  set: (v) => draftStore.updateDraft(props.draftId, { activeSection: v }),
});
const completedSections = computed({
  get: () => draft.value?.completedSections ?? [],
  set: (v) => draftStore.updateDraft(props.draftId, { completedSections: v }),
});

const lockedSections = computed<string[]>(() => {
  const locked: string[] = [];
  const realItems = cartItems.value.filter(c => !c.isGift);
  if (realItems.length === 0) locked.push('logistics');
  if (!completedSections.value.includes('logistics')) locked.push('review');
  if (realItems.length === 0) locked.push('review');
  return locked;
});

const accordionSections = computed<AccordionSection[]>(() => [
  {
    id: 'customer',
    title: 'Thông tin khách hàng',
    icon: User,
    summary: customerInfo.value.name + (customerInfo.value.posCustomerCode ? ` · ${customerInfo.value.posCustomerCode}` : ''),
    nextLabel: 'Tiếp theo →',
  },
  {
    id: 'products',
    title: 'Sản phẩm & Khuyến mãi',
    icon: ShoppingBag,
    summary: cartItems.value.filter(c => !c.isGift).length > 0
      ? `${cartItems.value.filter(c => !c.isGift).length} SP · ${formatVND(grandTotal.value)}${(draft.value?.appliedPromoIds?.length || 0) > 0 ? ` · ${draft.value!.appliedPromoIds!.length} KM` : ''}`
      : undefined,
    nextLabel: 'Tiếp theo →',
    nextDisabled: cartItems.value.filter(c => !c.isGift).length === 0,
  },
  {
    id: 'logistics',
    title: 'Vận chuyển & Thanh toán',
    icon: Truck,
    summary: selectedBranch.value
      ? `${selectedBranch.value.name} · ${draft.value?.paymentMethod === 'cash' ? 'Tiền mặt' : draft.value?.paymentMethod === 'bank_transfer' ? 'Chuyển khoản' : 'Quẹt thẻ'}`
      : undefined,
    lockReason: 'Thêm sản phẩm trước',
    nextLabel: 'Tiếp theo →',
    nextDisabled: !draft.value?.branchId,
  },
  {
    id: 'review',
    title: 'Xem lại & Chốt đơn',
    icon: Sparkles,
    lockReason: 'Hoàn thành vận chuyển & thanh toán trước',
    showNext: false,
  },
]);

function handleOpenSection(sectionId: string) {
  if (lockedSections.value.includes(sectionId)) return;
  activeSection.value = sectionId;
}

function handleNextSection() {
  const sectionOrder = ['customer', 'products', 'logistics', 'review'];
  const currentIdx = sectionOrder.indexOf(activeSection.value);
  const newCompleted = [...completedSections.value];
  if (!newCompleted.includes(activeSection.value)) {
    newCompleted.push(activeSection.value);
    completedSections.value = newCompleted;
  }
  if (currentIdx < sectionOrder.length - 1) {
    const nextId = sectionOrder[currentIdx + 1];
    if (!lockedSections.value.includes(nextId)) {
      activeSection.value = nextId;
    }
  }
}

// ─── Handlers ─────────────────────────────────────────────────────────
function handleMinimize() {
  draftStore.minimizeDraft(props.draftId);
}

function handleRedButtonClick() {
  if (totalCartCount.value > 0) {
    showClearConfirm.value = true;
  } else {
    draftStore.closeDraft(props.draftId);
  }
}

function confirmClearAll() {
  showClearConfirm.value = false;
  draftStore.closeDraft(props.draftId);
  showToast('Đã xóa dữ liệu đơn hàng.');
}

function handleSelectPriceBook(priceBookId: string) {
  draftStore.updateDraft(props.draftId, { priceBookId });
  const pb = PRICE_BOOKS.find(p => p.id === priceBookId);
  if (pb) showToast(pb.type === 'pos_sync' ? `Đã chọn ${pb.name} — Cần đồng bộ API POS sau.` : `Đã áp dụng ${pb.name}`);
}

function handleUpdateProductDiscount(productId: number, discount: number) {
  if (!draft.value) return;
  const items = [...cartItems.value];
  const item = items.find(c => c.product.id === productId);
  if (item) {
    const pbId = draft.value.priceBookId || 'standard';
    const lineSubtotal = getEffectiveProductPrice(item.product.basePrice, pbId) * item.quantity;
    item.discount = Math.min(Math.max(0, discount), lineSubtotal);
    draftStore.updateDraft(props.draftId, { cartItems: items });
  }
}

function handleUpdateOrderDiscount(discount: number) {
  draftStore.updateDraft(props.draftId, { orderDiscount: Math.min(Math.max(0, discount), totalAmount.value) });
}

function resetAll() {
  draftStore.updateDraft(props.draftId, {
    cartItems: [],
    branchId: branches.value.length > 0 ? branches.value[0].id : null,
    paymentMethod: 'cash',
    orderStatus: 1,
    priceBookId: 'standard',
    orderDiscount: 0,
    appliedPromoIds: [],
    description: '',
    paidAmount: 0,
    deliveryAddress: '',
    activeSection: 'customer',
    completedSections: [],
  });
  isDrawerOpen.value = false;
  isSuccessOpen.value = false;
  submitting.value = false;
}



// ─── Cart Operations ──────────────────────────────────────────────────
function handleAddProduct(product: POSProduct) {
  if (!draft.value) return;
  const items = [...cartItems.value];
  const existing = items.find(c => c.product.id === product.id);
  if (existing) {
    existing.quantity++;
    showToast(`Đã tăng số lượng ${product.name}.`);
  } else {
    items.push({ product, quantity: 1 });
    showToast(`Đã thêm ${product.name}.`);
  }
  draftStore.updateDraft(props.draftId, { cartItems: items });
}

function handleUpdateQuantity(productId: number, quantity: number) {
  const items = [...cartItems.value];
  const item = items.find(c => c.product.id === productId);
  if (item) { item.quantity = quantity; draftStore.updateDraft(props.draftId, { cartItems: items }); }
}

function handleRemoveProduct(productId: number) {
  const items = cartItems.value.filter(c => c.product.id !== productId);
  draftStore.updateDraft(props.draftId, { cartItems: items });
}

function handleClearOrder() {
  draftStore.updateDraft(props.draftId, { cartItems: [], appliedPromoIds: [] });
  showToast('Đã xóa sạch đơn hàng.');
}

// ─── Promotion Handlers ──────────────────────────────────────────
function handleApplyPromotion(promo: PromotionProgram) {
  if (!draft.value) return;
  if (draft.value.appliedPromoIds?.includes(promo.id)) return;

  const items = [...cartItems.value];
  let newOrderDiscount = draft.value.orderDiscount || 0;

  if (promo.reward.type === 'free_product' && promo.reward.giftProduct) {
    const gift = promo.reward.giftProduct;
    const qty = promo.reward.giftQuantity ?? 1;
    const existing = items.find(c => c.product.id === gift.id && c.isGift);
    if (existing) { existing.quantity += qty; }
    else { items.push({ product: gift, quantity: qty, discount: gift.basePrice * qty, isGift: true, promoId: promo.id }); }
    showToast(`🎁 Đã thêm ${qty} "${gift.name}" miễn phí!`);
  } else if (promo.reward.type === 'order_discount' && promo.reward.discountAmount) {
    newOrderDiscount += promo.reward.discountAmount;
    showToast(`💰 Đã giảm thêm ${formatVND(promo.reward.discountAmount)}!`);
  }

  draftStore.updateDraft(props.draftId, {
    cartItems: items,
    orderDiscount: newOrderDiscount,
    appliedPromoIds: [...(draft.value.appliedPromoIds ?? []), promo.id],
  });
}

function handleRemovePromotion(promoId: string) {
  if (!draft.value) return;
  const items = cartItems.value.filter(c => !(c.isGift && c.promoId === promoId));
  const promo = MOCK_PROMOTIONS.find(p => p.id === promoId);
  let newOrderDiscount = draft.value.orderDiscount || 0;
  if (promo?.reward.type === 'order_discount' && promo.reward.discountAmount) {
    newOrderDiscount = Math.max(0, newOrderDiscount - promo.reward.discountAmount);
  }
  draftStore.updateDraft(props.draftId, {
    cartItems: items,
    orderDiscount: newOrderDiscount,
    appliedPromoIds: (draft.value.appliedPromoIds ?? []).filter(id => id !== promoId),
  });
  showToast('Đã hủy khuyến mãi.');
}

watch(
  () => [draft.value?.cartItems, draft.value?.priceBookId],
  () => {
    if (!draft.value?.appliedPromoIds?.length) return;
    const real = cartItems.value.filter(c => !c.isGift);
    const pbId = draft.value.priceBookId || 'standard';
    const total = real.reduce((s, i) => s + Math.max(0, getEffectiveProductPrice(i.product.basePrice, pbId) * i.quantity - (i.discount || 0)), 0);
    for (const promoId of [...(draft.value.appliedPromoIds ?? [])]) {
      const promo = MOCK_PROMOTIONS.find(p => p.id === promoId);
      if (promo && !evaluatePromoCondition(promo.condition, cartItems.value, total)) {
        handleRemovePromotion(promoId);
        showToast(`⚠️ Không còn đủ điều kiện "${promo.tag}" — Đã hủy.`);
      }
    }
  },
  { deep: true },
);

// ─── Sidebar selections ───────────────────────────────────────────────
function handleSelectBranch(branchId: number) { draftStore.updateDraft(props.draftId, { branchId }); }
function handleSelectPayment(method: string) { draftStore.updateDraft(props.draftId, { paymentMethod: method }); }
function handleSelectOrderStatus(status: number) { draftStore.updateDraft(props.draftId, { orderStatus: status }); }
function handleUpdateDeliveryAddress(address: string) { draftStore.updateDraft(props.draftId, { deliveryAddress: address }); }

function handleReset() {
  draftStore.updateDraft(props.draftId, { cartItems: [], paidAmount: 0, description: '', orderStatus: 1, activeSection: 'customer', completedSections: [] });
  showToast('Đã đặt lại đơn hàng.');
}

// ─── Submit Order ─────────────────────────────────────────────────────
async function handleSubmitOrder() {
  if (!draft.value) return;
  if (cartItems.value.length === 0) { showToast('Vui lòng thêm sản phẩm trước khi tạo đơn.'); return; }
  if (!draft.value.branchId) { showToast('Vui lòng chọn chi nhánh.'); return; }
  if (!draft.value.posCustomerId) { showToast('Chưa liên kết khách hàng POS.'); return; }

  submitting.value = true;
  try {
    const payload = {
      contactId: draft.value.contactId || undefined,
      posCustomerId: draft.value.posCustomerId,
      branchId: draft.value.branchId,
      priceBookId: 1,
      items: cartItems.value.map(c => ({
        productId: c.product.id,
        productCode: c.product.code,
        productName: c.product.name,
        quantity: c.quantity,
        unitPrice: getEffectiveProductPrice(c.product.basePrice, 'standard'),
        discount: c.discount || 0,
        note: '',
      })),
      discount: draft.value.orderDiscount || 0,
      paidAmount: 0,
      paymentMethod: draft.value.paymentMethod || 'cash',
      orderStatus: 1,
      description: draft.value.description || '',
    };

    const { data } = await api.post<any>('/pos/orders', payload);
    if (data?.success) {
      completedOrderCode.value = data.data?.orderCode || `DH${Date.now()}`;
      completedTotalItems.value = cartItems.value.reduce((s, c) => s + c.quantity, 0);
      completedFinalTotal.value = grandTotal.value;
      completedPaymentMethod.value = draft.value.paymentMethod;
      isDrawerOpen.value = false;
      isSuccessOpen.value = true;
      emit('order-created', data.data);
    } else {
      showToast(data?.message || 'Tạo đơn hàng thất bại');
    }
  } catch (err: any) {
    showToast(err?.response?.data?.message || err?.message || 'Lỗi khi tạo đơn hàng');
  } finally {
    submitting.value = false;
  }
}

function handleSuccessClose() {
  isSuccessOpen.value = false;
  draftStore.closeDraft(props.draftId);
  showToast('Đơn hàng thành công! Đã dọn sạch.');
}

// ─── Toast ────────────────────────────────────────────────────────────
function showToast(msg: string) {
  toastMessage.value = msg;
  setTimeout(() => { toastMessage.value = null; }, 3000);
}

// ─── Fetch branches khi workspace mount ──────────────────────────────
onMounted(() => {
  fetchBranches();
});

// Set branch default khi branches load xong
async function fetchBranches() {
  try {
    const { data } = await api.get<{ success: boolean; data: { id: number; name: string }[] }>('/pos/branches');
    branches.value = (data?.data || []) as POSBranch[];
    if (branches.value.length > 0) {
      draftStore.setBranchDefault(props.draftId, branches.value[0].id);
    }
  } catch (err) {
    console.error('fetchBranches failed:', err);
  }
}
</script>

<style scoped>
/* ═══ FLOATING WIDGET ═══ */
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
}
.ob-floating-widget__icon {
  width: 38px; height: 38px;
  border-radius: 10px; background: #0068FF; color: #fff;
  display: flex; align-items: center; justify-content: center;
  position: relative; flex-shrink: 0;
}
.ob-floating-widget__badge {
  position: absolute; top: -6px; right: -6px;
  background: #ef4444; color: #fff;
  font-size: 10px; font-weight: 800;
  width: 18px; height: 18px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  border: 2px solid #fff;
}
.ob-floating-widget__info { display: flex; flex-direction: column; }
.ob-floating-widget__title { font-size: 12px; font-weight: 800; color: #1e293b; }
.ob-floating-widget__meta { font-size: 10px; color: #64748b; display: flex; align-items: center; gap: 4px; margin-top: 2px; }
.ob-floating-widget__amount { font-weight: 700; color: #0068FF; font-family: monospace; }
.ob-floating-widget__expand-hint {
  padding: 6px; border-radius: 8px; background: #eff6ff; color: #0068FF;
  display: flex; align-items: center; justify-content: center; margin-left: 4px;
}
.ob-sep { opacity: 0.4; }

/* ═══ Overlay ═══ */
.ob-modal-overlay {
  position: fixed; inset: 0; z-index: 9000;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center;
  padding: 12px 10px;
}

/* ═══ Wrapper ═══ */
.ob-modal-wrapper {
  display: flex; flex-direction: row; align-items: stretch;
  gap: 10px;
  width: 99.5vw;
  max-width: clamp(1200px, 90vw, 1800px);
  height: 95vh;
  max-height: clamp(820px, 94vh, 1100px);
  position: relative; z-index: 10;
}

/* ═══ Frame ═══ */
.ob-modal-frame {
  flex: 1; min-width: 0;
  background: #fff;
  border-radius: 16px;
  border: 1px solid rgba(226, 232, 240, 0.8);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
  overflow: hidden;
  display: flex; flex-direction: column;
}

/* ═══ Mini Chat ═══ */
.ob-mini-chat-outer {
  width: 340px; flex-shrink: 0; height: 100%;
}

/* ═══ Header ═══ */
.ob-modal__header {
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  padding: 10px 16px;
  display: flex; align-items: center; justify-content: space-between;
  flex-shrink: 0; user-select: none;
}
/* ═══ Outer Stepper Rail (Thanh tiến trình tách riêng gọn gàng ở chính giữa) ═══ */
.ob-outer-left-rail {
  width: 48px;
  flex-shrink: 0;
  background: #ffffff;
  border-radius: 16px;
  border: 1px solid rgba(226, 232, 240, 0.8);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 14px 0;
  gap: 6px;
  user-select: none;
  align-self: center;
  height: auto;
}

.ob-rail-step {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid #cbd5e1;
  background: #ffffff;
  color: #64748b;
  font-size: 11.5px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.ob-rail-step:hover:not(.ob-rail-step--locked) {
  border-color: #0068FF;
  color: #0068FF;
  transform: scale(1.1);
  box-shadow: 0 2px 8px rgba(0, 104, 255, 0.15);
}
.ob-rail-step--active {
  border-color: #0068FF !important;
  background: #0068FF !important;
  color: #ffffff !important;
  box-shadow: 0 0 0 3px rgba(0, 104, 255, 0.2);
}
.ob-rail-step--done {
  border-color: #10b981;
  background: #dcfce7;
  color: #15803d;
}
.ob-rail-step--locked {
  border-color: #e2e8f0;
  background: #f8fafc;
  color: #cbd5e1;
  cursor: not-allowed;
}

.ob-rail-step-arrow {
  color: #cbd5e1;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s ease;
  margin: 2px 0;
}
.ob-rail-step-arrow--done {
  color: #0068FF;
}

.ob-modal__title-group { display: flex; align-items: center; gap: 8px; }
.ob-win-btn--reset:hover {
  background: #fef3c7;
  color: #d97706;
  border-color: #fde68a;
}
.ob-modal__title {
  font-size: 14px; font-weight: 800; color: #1e293b;
  letter-spacing: -0.02em; margin: 0;
}
.ob-modal__reset-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 12px; font-size: 12px; font-weight: 700;
  color: #64748b; background: #fff;
  border: 1px solid #e2e8f0; border-radius: 8px;
  cursor: pointer; transition: all 0.15s;
}
.ob-modal__reset-btn:hover { background: #f1f5f9; color: #1e293b; }
.ob-win-controls { display: flex; align-items: center; gap: 4px; margin-left: 6px; }
.ob-win-btn {
  width: 32px; height: 30px; border-radius: 6px;
  border: 1px solid #e2e8f0; background: #fff; color: #64748b;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all 0.15s ease;
}
.ob-win-btn--minimize:hover { background: #f1f5f9; color: #0068FF; border-color: #cbd5e1; }
.ob-win-btn--close:hover { background: #ef4444; color: #fff; border-color: #ef4444; }

/* ═══ Workspace (Sections area) ═══ */
.ob-modal__workspace {
  flex: 1; display: flex; overflow: hidden; position: relative;
}
.ob-sections-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  background: #f8fafc;
}

.ob-sections-scroll::-webkit-scrollbar { width: 5px; }
.ob-sections-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }

/* ═══ Checkout Overlay ═══ */
.ob-modal__checkout-overlay {
  position: absolute; inset: 0; z-index: 60;
  background: rgba(15, 23, 42, 0.5);
  backdrop-filter: blur(5px);
  -webkit-backdrop-filter: blur(5px);
  display: flex;
}
.ob-modal__checkout-content { width: 100%; height: 100%; display: flex; }
.ob-modal__checkout-template-wrap {
  flex: 1; overflow-y: auto; padding: 20px;
  display: flex; justify-content: center; align-items: flex-start;
}
.ob-modal__checkout-drawer-wrap {
  width: 400px; min-width: 360px; max-width: 420px;
  height: 100%; flex-shrink: 0;
  background: #fff; border-left: 1px solid #cbd5e1;
  box-shadow: -8px 0 24px rgba(0, 0, 0, 0.15); z-index: 10;
}

/* ═══ Confirm Dialog ═══ */
.ob-confirm-overlay {
  position: absolute; inset: 0; z-index: 80;
  background: rgba(15, 23, 42, 0.5);
  backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
}
.ob-confirm-card {
  background: #fff; border-radius: 20px; padding: 24px;
  max-width: 400px; width: 100%; text-align: center;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.2);
}
.ob-confirm-card__icon {
  width: 56px; height: 56px; border-radius: 50%;
  background: #fef2f2;
  display: flex; align-items: center; justify-content: center;
  margin: 0 auto 12px;
}
.ob-confirm-card h3 { font-size: 16px; font-weight: 800; color: #1e293b; margin: 0 0 6px; }
.ob-confirm-card p { font-size: 12px; color: #64748b; margin: 0 0 20px; line-height: 1.5; }
.ob-confirm-card__actions { display: flex; gap: 10px; }
.ob-confirm-btn {
  flex: 1; padding: 10px 14px; border-radius: 10px;
  font-size: 12px; font-weight: 700; border: none; cursor: pointer;
  transition: all 0.15s;
}
.ob-confirm-btn--cancel { background: #f1f5f9; color: #64748b; }
.ob-confirm-btn--cancel:hover { background: #e2e8f0; color: #1e293b; }
.ob-confirm-btn--danger { background: #ef4444; color: #fff; }
.ob-confirm-btn--danger:hover { background: #dc2626; }

/* ═══ Toast ═══ */
.ob-toast {
  position: fixed; bottom: 24px; left: 24px; z-index: 9999;
  background: #0f172a; color: #fff;
  padding: 12px 16px; border-radius: 12px;
  font-size: 12px; font-weight: 700;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  display: flex; align-items: center; gap: 8px;
  border: 1px solid #1e293b;
}

/* ═══ Transitions ═══ */
.ob-float-enter-active, .ob-float-leave-active { transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1); }
.ob-float-enter-from, .ob-float-leave-to { opacity: 0; transform: translateY(20px) scale(0.9); }
.ob-modal-enter-active, .ob-modal-leave-active { transition: opacity 0.25s ease; }
.ob-modal-enter-from, .ob-modal-leave-to { opacity: 0; }
.ob-toast-enter-active, .ob-toast-leave-active { transition: all 0.3s ease; }
.ob-toast-enter-from, .ob-toast-leave-to { opacity: 0; transform: translateY(20px); }
.ob-fade-enter-active, .ob-fade-leave-active { transition: opacity 0.2s ease; }
.ob-fade-enter-from, .ob-fade-leave-to { opacity: 0; }

/* ═══ Utility ═══ */
.ob-text-blue { color: #0068FF; }
.ob-text-amber { color: #f59e0b; }
.ob-text-red { color: #ef4444; }

:deep(input[type="number"]::-webkit-outer-spin-button),
:deep(input[type="number"]::-webkit-inner-spin-button) {
  -webkit-appearance: none; margin: 0;
}
:deep(input[type="number"]) {
  -moz-appearance: textfield; appearance: textfield;
}
</style>
