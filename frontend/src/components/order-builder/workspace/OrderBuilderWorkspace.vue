<template>
  <teleport to="body">
    <!-- ═══ FULL MODAL WINDOW ═══ -->
    <transition name="ob-modal">
      <div v-if="isModalVisible" class="ob-modal-overlay" @click.self="handleRedButtonClick">
        <div class="ob-modal-wrapper">

          <!-- ═══ ob-modal-frame: Layout POS 2 Cột ═══ -->
          <div class="ob-modal-frame">

            <!-- ═══ Window Header ═══ -->
            <div class="ob-modal__header">
              <div class="ob-modal__header-left">
                <div class="ob-modal__title-group">
                  <ShoppingBag :size="18" class="ob-text-blue" />
                  <h1 class="ob-modal__title">Tạo đơn hàng</h1>
                  <span v-if="draft?.contactName" class="ob-modal__customer-badge">
                    {{ draft.contactName }}
                  </span>
                  <!-- Unread message notification badge -->
                  <transition name="ob-fade">
                    <span
                      v-if="currentSessionUnread > 0"
                      class="ob-modal__unread-badge"
                      title="Tin nhắn mới"
                      @click="scrollMiniChatToBottom"
                    >
                      <MessageSquare :size="11" />
                      {{ currentSessionUnread }}
                    </span>
                  </transition>
                </div>
              </div>
              <div class="ob-modal__header-right">
                <button class="ob-win-btn ob-win-btn--reset" title="Đặt lại đơn hàng" @click="handleReset">
                  <RotateCcw :size="14" />
                </button>
                <div class="ob-win-controls">
                  <button class="ob-win-btn ob-win-btn--minimize" title="Thu nhỏ" @click="handleMinimize">
                    <Minus :size="15" />
                  </button>
                  <button class="ob-win-btn ob-win-btn--close" title="Xóa dữ liệu & Đóng" @click="handleRedButtonClick">
                    <X :size="15" />
                  </button>
                </div>
              </div>
            </div>

            <!-- ═══ POS Header Row: Search + Bảng giá ═══ -->
            <div class="ob-pos-header">
              <!-- Search sản phẩm -->
              <div class="ob-search-zone">
                <Search :size="16" class="ob-search-icon" />
                <input
                  v-model="searchQuery"
                  type="text"
                  placeholder="Tìm sản phẩm (tên, mã SP)..."
                  class="ob-search-input"
                  @input="onSearchInput"
                  @focus="isSearchOpen = true"
                  @blur="onSearchBlur"
                />
                <button v-if="searchQuery" class="ob-search-clear" @mousedown.prevent="clearSearch">
                  <X :size="13" />
                </button>
                <!-- Dropdown kết quả -->
                <div v-if="isSearchOpen && searchQuery.trim()" class="ob-search-dropdown">
                  <div v-if="productsLoading" class="ob-search-state">
                    <Loader2 :size="15" class="ob-spin" /> Đang tìm...
                  </div>
                  <div v-else-if="searchResults.length === 0" class="ob-search-state">
                    Không tìm thấy "{{ searchQuery }}"
                  </div>
                  <template v-else>
                    <div
                      v-for="prod in searchResults"
                      :key="prod.id"
                      class="ob-search-item"
                      @mousedown.prevent="quickAddProduct(prod)"
                    >
                      <div class="ob-search-item__info">
                        <span class="ob-search-item__name">{{ prod.name }}</span>
                        <span class="ob-search-item__code">{{ prod.code }}</span>
                      </div>
                      <span class="ob-search-item__price">
                        {{ formatVND(getEffectiveProductPrice(prod.basePrice, draft?.priceBookId || 'standard')) }}
                      </span>
                      <span class="ob-search-item__action">+ Thêm</span>
                    </div>
                  </template>
                </div>
              </div>

              <!-- Bảng giá -->
              <div class="ob-pricebook">
                <Tag :size="13" class="ob-pricebook__icon" />
                <span class="ob-pricebook__label">Bảng giá:</span>
                <select
                  :value="draft?.priceBookId || 'standard'"
                  class="ob-pricebook__select"
                  @change="handleSelectPriceBook(($event.target as HTMLSelectElement).value)"
                >
                  <option v-for="pb in PRICE_BOOKS" :key="pb.id" :value="pb.id">
                    {{ pb.name }}{{ pb.discountPercent ? ` (-${pb.discountPercent}%)` : '' }}
                  </option>
                </select>
              </div>

              <!-- Tổng nhanh -->
              <div class="ob-quick-summary">
                <ShoppingCart :size="14" class="ob-text-blue" />
                <span class="ob-quick-summary__count">{{ totalCartCount }} SP</span>
                <span class="ob-quick-summary__sep">·</span>
                <span class="ob-quick-summary__total">{{ formatVND(grandTotal) }}</span>
              </div>
            </div>

            <!-- ═══ POS Body: 2 Cột (60/40) ═══ -->
            <div class="ob-pos-body">

              <!-- ════════════════════════════════════
                   CỘT TRÁI (60%): DANH SÁCH SẢN PHẨM
                   ════════════════════════════════════ -->
              <div class="ob-pos-left">
                <!-- Danh sách cart items -->
                <div class="ob-cart-list">
                  <!-- Rỗng -->
                  <div v-if="cartItems.length === 0" class="ob-cart-empty">
                    <ShoppingCart :size="36" class="ob-cart-empty__icon" />
                    <p class="ob-cart-empty__title">Chưa có sản phẩm trong đơn</p>
                    <p class="ob-cart-empty__sub">Tìm kiếm và thêm sản phẩm ở thanh tìm kiếm phía trên</p>
                  </div>

                  <!-- Mỗi dòng sản phẩm -->
                  <div
                    v-for="(item, idx) in cartItems"
                    :key="`${item.product.id}-${idx}`"
                    class="ob-cart-item"
                    :class="{
                      'ob-cart-item--gift': item.isGift,
                      'ob-cart-item--damaged': item.conditionType === 'damaged',
                      'ob-cart-item--near-expiry': item.conditionType === 'near_expiry',
                    }"
                  >
                    <!-- Row trên: Tên SP + Actions -->
                    <div class="ob-cart-item__top">
                      <div class="ob-cart-item__name-wrap">
                        <!-- Badge condition -->
                        <span v-if="item.conditionType === 'damaged'" class="ob-badge ob-badge--red">Bục rách</span>
                        <span v-else-if="item.conditionType === 'near_expiry'" class="ob-badge ob-badge--amber">Cận date</span>
                        <!-- Badge quà tặng -->
                        <span v-if="item.isGift" class="ob-badge ob-badge--pink">🎁 Quà KM</span>
                        <span class="ob-cart-item__code">{{ item.product.code }}</span>
                        <span class="ob-cart-item__name">{{ item.product.name }}</span>
                        <!-- Ghi chú dòng -->
                        <span v-if="item.note" class="ob-cart-item__note">📝 {{ item.note }}</span>
                      </div>
                      <!-- Action buttons -->
                      <div class="ob-cart-item__actions">
                        <button
                          v-if="!item.isGift"
                          class="ob-item-btn ob-item-btn--discount"
                          title="Giảm giá dòng"
                          @click="openLineDiscount(idx)"
                        >
                          <Percent :size="12" /> Giảm
                        </button>
                        <button
                          class="ob-item-btn ob-item-btn--remove"
                          title="Xóa dòng"
                          @click="handleRemoveProduct(idx)"
                        >
                          <Trash2 :size="12" />
                        </button>
                      </div>
                    </div>

                    <!-- Row dưới: Qty + Đơn giá + Thành tiền -->
                    <div class="ob-cart-item__bottom">
                      <!-- Qty controls -->
                      <div class="ob-qty-ctrl">
                        <button
                          class="ob-qty-btn"
                          :disabled="item.quantity <= 1 || item.isGift"
                          @click="changeItemQty(idx, -1)"
                        >
                          <Minus :size="11" />
                        </button>
                        <input
                          type="number"
                          class="ob-qty-input"
                          :value="item.quantity"
                          min="1"
                          :disabled="item.isGift"
                          @change="setItemQty(idx, Number(($event.target as HTMLInputElement).value))"
                        />
                        <button
                          class="ob-qty-btn"
                          :disabled="item.isGift"
                          @click="changeItemQty(idx, 1)"
                        >
                          <Plus :size="11" />
                        </button>
                      </div>

                      <!-- Đơn giá -->
                      <div class="ob-cart-item__price-col">
                        <span class="ob-cart-item__price-label">Đơn giá</span>
                        <span class="ob-cart-item__price-val">
                          {{ formatVND(getEffectiveProductPrice(item.product.basePrice, draft?.priceBookId || 'standard')) }}
                        </span>
                      </div>

                      <!-- Chiết khấu dòng -->
                      <div v-if="(item.discount || 0) > 0" class="ob-cart-item__discount-col">
                        <span class="ob-cart-item__price-label">Chiết khấu</span>
                        <span class="ob-cart-item__discount-val">-{{ formatVND(item.discount || 0) }}</span>
                      </div>

                      <!-- Thành tiền -->
                      <div class="ob-cart-item__total-col">
                        <span class="ob-cart-item__price-label">Thành tiền</span>
                        <span class="ob-cart-item__total-val">
                          {{ formatVND(getLineTotal(item)) }}
                        </span>
                      </div>
                    </div>

                    <!-- Line discount inline editor (khi mở) -->
                    <div v-if="lineDiscountOpenIdx === idx" class="ob-line-discount-editor">
                      <span class="ob-line-discount-editor__label">Giảm giá dòng:</span>
                      <input
                        v-model.number="lineDiscountValue"
                        type="number"
                        min="0"
                        class="ob-line-discount-editor__input"
                        placeholder="0"
                        @keyup.enter="applyLineDiscount(idx)"
                      />
                      <div class="ob-line-discount-editor__toggle">
                        <button
                          :class="['ob-unit-btn', lineDiscountType === 'amount' ? 'ob-unit-btn--active' : '']"
                          @click="lineDiscountType = 'amount'"
                        >₫</button>
                        <button
                          :class="['ob-unit-btn', lineDiscountType === 'percent' ? 'ob-unit-btn--active' : '']"
                          @click="lineDiscountType = 'percent'"
                        >%</button>
                      </div>
                      <button class="ob-line-discount-editor__apply" @click="applyLineDiscount(idx)">Áp dụng</button>
                      <button class="ob-line-discount-editor__cancel" @click="lineDiscountOpenIdx = -1">Hủy</button>
                    </div>
                  </div>
                </div>

                <!-- Ghi chú đơn hàng + KM cộng dồn -->
                <div class="ob-left-footer">
                  <!-- Nút KM (nếu có promo đã áp dụng) -->
                  <div v-if="(draft?.appliedPromoIds?.length || 0) > 0" class="ob-promo-applied-bar">
                    <Gift :size="14" class="ob-promo-applied-bar__icon" />
                    <span>{{ draft?.appliedPromoIds?.length }} khuyến mãi đang áp dụng</span>
                    <button class="ob-promo-applied-bar__clear" @click="clearAllPromos">Hủy tất cả</button>
                  </div>

                  <!-- Ghi chú đơn hàng -->
                  <div class="ob-note-area">
                    <label class="ob-note-area__label">
                      <FileText :size="13" />
                      Ghi chú đơn hàng
                    </label>
                    <textarea
                      class="ob-note-area__input"
                      rows="3"
                      maxlength="500"
                      placeholder="Nhập ghi chú cho đơn hàng..."
                      :value="draft?.billNote || draft?.description || ''"
                      @input="handleUpdateBillNote(($event.target as HTMLTextAreaElement).value)"
                    />
                  </div>
                </div>
              </div>

              <!-- ════════════════════════════════════
                   CỘT PHẢI (40%): THÔNG TIN + THANH TOÁN
                   ════════════════════════════════════ -->
              <div class="ob-pos-right">

                <!-- ─── Card: Thông tin khách hàng ─── -->
                <div class="ob-right-card ob-customer-card">
                  <div class="ob-card-header">
                    <User :size="14" class="ob-text-blue" />
                    <span>KHÁCH HÀNG</span>
                  </div>
                  <div class="ob-customer-info">
                    <div class="ob-customer-avatar">
                      <span>{{ (customerInfo.name || '?')[0].toUpperCase() }}</span>
                    </div>
                    <div class="ob-customer-details">
                      <div class="ob-customer-name">{{ customerInfo.name }}</div>
                      <div v-if="customerInfo.phone" class="ob-customer-meta">📞 {{ customerInfo.phone }}</div>
                      <div v-if="customerInfo.posCustomerCode" class="ob-customer-meta">🏷️ {{ customerInfo.posCustomerCode }}</div>
                    </div>
                  </div>

                  <!-- TODO: customerDebt — sẽ thêm sau khi có API /pos/customers/{id}/debt -->

                  <!-- Người lên đơn + Ngày giờ -->
                  <div class="ob-creator-row">
                    <UserCheck :size="12" class="ob-text-muted" />
                    <span class="ob-creator-name">{{ creatorName }}</span>
                    <span class="ob-creator-time">{{ currentDateTime }}</span>
                  </div>
                </div>

                <!-- ─── Card: Chi nhánh & Giao hàng ─── -->
                <div class="ob-right-card ob-logistics-card">
                  <div class="ob-card-header">
                    <Truck :size="14" class="ob-text-blue" />
                    <span>GIAO HÀNG & CHI NHÁNH</span>
                  </div>

                  <!-- Chi nhánh -->
                  <div class="ob-logistics-field">
                    <label class="ob-logistics-label">
                      <MapPin :size="12" /> Chi nhánh
                    </label>
                    <select
                      class="ob-logistics-select"
                      :value="draft?.branchId || ''"
                      @change="handleSelectBranch(Number(($event.target as HTMLSelectElement).value))"
                    >
                      <option value="" disabled>-- Chọn chi nhánh --</option>
                      <option v-for="b in branches" :key="b.id" :value="b.id">{{ b.name }}</option>
                    </select>
                  </div>

                  <!-- Địa chỉ giao hàng -->
                  <div class="ob-logistics-field">
                    <label class="ob-logistics-label">
                      <Home :size="12" /> Địa chỉ giao hàng
                    </label>
                    <input
                      type="text"
                      class="ob-logistics-input"
                      :value="draft?.deliveryAddress || ''"
                      placeholder="Nhập địa chỉ giao hàng..."
                      @input="handleUpdateDeliveryAddress(($event.target as HTMLInputElement).value)"
                    />
                  </div>

                  <!-- Kích thước & Trọng lượng -->
                  <div class="ob-logistics-field">
                    <label class="ob-logistics-label">
                      <Box :size="12" /> Kích thước & Trọng lượng
                    </label>
                    <div class="ob-package-grid">
                      <input
                        type="number"
                        class="ob-package-input"
                        placeholder="Dài (cm)"
                        :value="draft?.packageLength || ''"
                        @input="updatePackage('length', $event)"
                      />
                      <input
                        type="number"
                        class="ob-package-input"
                        placeholder="Rộng (cm)"
                        :value="draft?.packageWidth || ''"
                        @input="updatePackage('width', $event)"
                      />
                      <input
                        type="number"
                        class="ob-package-input"
                        placeholder="Cao (cm)"
                        :value="draft?.packageHeight || ''"
                        @input="updatePackage('height', $event)"
                      />
                      <input
                        type="number"
                        class="ob-package-input"
                        placeholder="TL (gram)"
                        :value="draft?.packageWeight || ''"
                        @input="updatePackage('weight', $event)"
                      />
                    </div>
                  </div>

                  <!-- Ghi chú bưu tá -->
                  <div class="ob-logistics-field">
                    <label class="ob-logistics-label">
                      <MessageSquare :size="12" /> Ghi chú bưu tá
                    </label>
                    <textarea
                      class="ob-logistics-textarea"
                      rows="2"
                      placeholder="Ghi chú cho bưu tá / shipper..."
                      :value="draft?.shippingNote || ''"
                      @input="handleUpdateShippingNote(($event.target as HTMLTextAreaElement).value)"
                    />
                  </div>
                </div>

                <!-- ─── Card: Thanh toán ─── -->
                <div class="ob-right-card ob-payment-card">
                  <div class="ob-card-header">
                    <CreditCard :size="14" class="ob-text-blue" />
                    <span>THANH TOÁN</span>
                  </div>

                  <!-- Tổng tiền hàng -->
                  <div class="ob-payment-row">
                    <span class="ob-payment-row__label">Tổng tiền hàng</span>
                    <span class="ob-payment-row__val">{{ formatVND(totalAmount) }}</span>
                  </div>

                  <!-- Giảm giá tổng đơn -->
                  <div class="ob-payment-row ob-payment-row--discount">
                    <span class="ob-payment-row__label">Giảm giá</span>
                    <div class="ob-discount-inline">
                      <input
                        type="number"
                        class="ob-discount-inline__input"
                        min="0"
                        placeholder="0"
                        :value="draft?.orderDiscountValue || 0"
                        @input="handleUpdateOrderDiscount(Number(($event.target as HTMLInputElement).value))"
                      />
                      <div class="ob-discount-type-toggle">
                        <button
                          :class="['ob-unit-btn', (draft?.orderDiscountType || 'amount') === 'amount' ? 'ob-unit-btn--active' : '']"
                          @click="handleUpdateOrderDiscountType('amount')"
                        >₫</button>
                        <button
                          :class="['ob-unit-btn', draft?.orderDiscountType === 'percent' ? 'ob-unit-btn--active' : '']"
                          @click="handleUpdateOrderDiscountType('percent')"
                        >%</button>
                      </div>
                    </div>
                  </div>

                  <!-- Divider -->
                  <div class="ob-payment-divider" />

                  <!-- Khách cần trả -->
                  <div class="ob-payment-row ob-payment-row--total">
                    <span class="ob-payment-row__label">Khách cần trả</span>
                    <span class="ob-payment-row__total">{{ formatVND(grandTotal) }}</span>
                  </div>

                  <!-- Phương thức thanh toán -->
                  <div class="ob-payment-method">
                    <span class="ob-payment-method__label">Thanh toán</span>
                    <div class="ob-payment-method__toggle">
                      <button
                        v-for="m in PAYMENT_METHODS"
                        :key="m.value"
                        :class="['ob-pay-btn', (draft?.paymentMethod || 'cash') === m.value ? 'ob-pay-btn--active' : '']"
                        @click="handleSelectPayment(m.value)"
                      >
                        {{ m.icon }} {{ m.label }}
                      </button>
                    </div>
                  </div>

                  <!-- Nút tạo đơn hàng -->
                  <button
                    class="ob-submit-btn"
                    :disabled="submitting || cartItems.filter(c => !c.isGift).length === 0 || !draft?.branchId"
                    @click="handleSubmitOrder"
                  >
                    <CheckCircle2 v-if="!submitting" :size="16" :stroke-width="2.2" />
                    <Loader2 v-else :size="16" class="ob-spin" />
                    <span>{{ submitting ? 'Đang tạo đơn...' : 'TẠO ĐƠN HÀNG' }}</span>
                  </button>

                  <p v-if="!draft?.branchId" class="ob-submit-hint">Vui lòng chọn chi nhánh trước khi tạo đơn</p>
                  <p v-else-if="cartItems.filter(c => !c.isGift).length === 0" class="ob-submit-hint">Vui lòng thêm sản phẩm vào đơn</p>
                </div>

              </div>
            </div><!-- /ob-pos-body -->

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

          <!-- ═══ RESIZER SPLITTER (Invisible Hover Indicator) ═══ -->
          <div
            class="ob-split-resizer"
            :class="{ 'ob-split-resizer--active': isResizing }"
            title="Kéo để thay đổi kích thước chat (Nhấp kép để đặt lại)"
            @mousedown="startResize"
            @dblclick="resetChatPanelWidth"
          >
            <div class="ob-split-resizer-bar" />
          </div>

          <!-- ═══ MINI CHAT PANEL ═══ -->
          <div class="ob-mini-chat-outer" :style="{ width: `${chatPanelWidth}px` }">
            <MiniChatPanel
              :contact-id="draft?.contactId"
              :contact-name="draft?.contactName"
              :contact-phone="draft?.contactPhone"
              :pos-customer-code="draft?.posCustomerCode"
            />
          </div>

          <!-- ═══ CHAT HEADS DOCK (mép phải, bên phải MiniChat) ═══ -->
          <SessionDock
            :sessions="sessionStore.sessions"
            :active-session-id="sessionStore.activeSessionId"
            :is-switching="sessionStore.isSwitching"
            :inbound-contacts="inboundContacts"
            @switch="handleSwitchSession"
            @discard="handleDiscardSession"
            @open-inbound="handleOpenInbound"
          />

        </div><!-- /ob-modal-wrapper -->
      </div>
    </transition>
  </teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, watchEffect, onMounted } from 'vue';
import {
  ShoppingBag, ShoppingCart, AlertTriangle, Minus, X, RotateCcw,
  Search, Loader2, Tag, User, Truck, MapPin, Home, Box, MessageSquare,
  CreditCard, CheckCircle2, Plus, Trash2, Percent, Gift, FileText,
  Zap, UserCheck,
} from 'lucide-vue-next';
import { api } from '@/api';
import { useWorkspaceSessionStore } from '@/stores/use-workspace-sessions';
import { useMiniChatBridgeStore } from '@/stores/use-mini-chat-bridge';
import { useAuthStore } from '@/stores/auth';

// Shared components (giữ nguyên)
import SessionDock from './SessionDock.vue';

import SuccessModal from '../SuccessModal.vue';
import MiniChatPanel from '../MiniChatPanel.vue';

import type { POSProduct, POSBranch, CustomerInfo, PromotionProgram } from '../types';
import { formatVND, PRICE_BOOKS, PAYMENT_METHODS, getEffectiveProductPrice, MOCK_PROMOTIONS, evaluatePromoCondition } from '../types';

// ─── Props / Emits ────────────────────────────────────────────────
const props = defineProps<{
  draftId: string;
}>();

const emit = defineEmits<{
  'order-created': [data: any];
}>();

// ─── Stores ───────────────────────────────────────────────────────
const authStore = useAuthStore();
const sessionStore = useWorkspaceSessionStore();
const draftStore = sessionStore; // backward compat alias
const miniChatBridge = useMiniChatBridgeStore();

const creatorName = computed(() => authStore.user?.fullName || 'Nhân viên POS');

// ─── Inbound Contacts (Group 2 Chat Heads) ───────────────────────
// Khách hàng nhắn tin tới nhưng chưa có phiên tạo đơn
// Persist to localStorage để không mất khi modal đóng/mở lại
import type { InboundContact } from './SessionDock.vue';

const INBOUND_STORAGE_KEY = 'workspace_inbound_contacts_v1';
const MAX_INBOUND = 10;

// Load từ localStorage
function loadInboundContacts(): InboundContact[] {
  try {
    const raw = localStorage.getItem(INBOUND_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as InboundContact[];
  } catch { /* ignore */ }
  return [];
}

function saveInboundContacts(list: InboundContact[]) {
  try {
    localStorage.setItem(INBOUND_STORAGE_KEY, JSON.stringify(list));
  } catch { /* ignore */ }
}

const inboundContacts = ref<InboundContact[]>(loadInboundContacts());

// Auto-persist khi thay đổi
watch(inboundContacts, (val) => saveInboundContacts(val), { deep: true });

function onInboundMessage(event: Event) {
  const detail = (event as CustomEvent).detail as {
    conversationId: string;
    contactId?: string;
    contactName?: string;
    contactAvatar?: string;
    message: { content?: string; sentAt?: string };
  };
  if (!detail?.conversationId) return;

  // Bỏ qua nếu conversation đang hiện trong MiniChat (user đang xem)
  const currentConvId = miniChatBridge.conversation?.id;
  if (detail.conversationId === currentConvId) return;

  // Bỏ qua nếu đã có session cho khách này (thuộc Nhóm 1)
  const hasSession = sessionStore.sessions.some(
    s => s.conversationId === detail.conversationId || s.contactId === detail.contactId,
  );
  if (hasSession) return; // Nhóm 1 xử lý qua store listener

  const preview = detail.message?.content
    ? (detail.message.content.length > 50
      ? detail.message.content.slice(0, 50) + '…'
      : detail.message.content)
    : 'Tin nhắn mới';

  // Tìm existing inbound contact
  const existing = inboundContacts.value.find(c => c.conversationId === detail.conversationId);
  if (existing) {
    // Cập nhật message mới nhất + tăng unread
    existing.lastMessage = preview;
    existing.unreadCount = (existing.unreadCount || 0) + 1;
    // Đẩy lên đầu
    inboundContacts.value = [
      existing,
      ...inboundContacts.value.filter(c => c.conversationId !== detail.conversationId),
    ];
  } else {
    // Thêm mới
    const contact: InboundContact = {
      conversationId: detail.conversationId,
      contactId: detail.contactId,
      contactName: detail.contactName || 'Khách hàng',
      contactAvatar: detail.contactAvatar,
      lastMessage: preview,
      unreadCount: 1,
    };
    inboundContacts.value = [contact, ...inboundContacts.value].slice(0, MAX_INBOUND);
  }
}

async function handleOpenInbound(contact: InboundContact) {
  // Check giới hạn phiên
  if (sessionStore.sessions.length >= 5) {
    toastMessage.value = 'Đã đạt tối đa 5 phiên. Vui lòng đóng 1 phiên trước.';
    setTimeout(() => { toastMessage.value = ''; }, 3000);
    return;
  }

  // Tạo phiên mới (hoặc trả về session cũ nếu KH đã có) → add vào Nhóm 1
  const newSessionId = sessionStore.openDraft({
    contactId: contact.contactId,
    contactName: contact.contactName,
    contactAvatar: contact.contactAvatar,
    contactPhone: contact.contactPhone,
    conversationId: contact.conversationId,
  });

  // Xóa khỏi Nhóm 2 (đã được add vào Nhóm 1)
  inboundContacts.value = inboundContacts.value.filter(
    c => c.conversationId !== contact.conversationId,
  );

  // Switch sang phiên vừa tạo/mở để Sales làm việc ngay
  if (newSessionId) {
    await handleSwitchSession(newSessionId);
  }
}

// Register event listener
let _notifListenerAdded = false;
onMounted(() => {
  if (!_notifListenerAdded && typeof window !== 'undefined') {
    window.addEventListener('workspace:inbound-message', onInboundMessage);
    _notifListenerAdded = true;
  }
});

// Auto-link conversationId và đồng bộ thông tin contact (sĐT, mã POS) từ MiniChat vào session hiện tại
// Khi SalesChatView publish conversation → bridge.conversation cập nhật
// → tự động backfill phone, posCustomerCode, conversationId nếu session còn thiếu
watchEffect(() => {
  const conv = miniChatBridge.conversation;
  const session = sessionStore.activeSession;
  if (conv && session) {
    const convContactId = conv.contact?.id;
    const isMatch = (convContactId && session.contactId === convContactId) || (conv.id && session.conversationId === conv.id);
    if (isMatch) {
      const patch: Partial<WorkspaceSession> = {};
      if (!session.conversationId && conv.id) patch.conversationId = conv.id;
      if (!session.contactPhone && conv.contact?.phone) patch.contactPhone = conv.contact.phone;
      if (!session.posCustomerCode && (conv.contact as any)?.posCustomerCode) {
        patch.posCustomerCode = (conv.contact as any).posCustomerCode;
      }
      if (!session.posCustomerId && (conv.contact as any)?.posCustomerId) {
        patch.posCustomerId = (conv.contact as any).posCustomerId;
      }
      if (Object.keys(patch).length > 0) {
        sessionStore.updateSession(session.id, patch);
      }
    }
  }
});

// ─── Unread badge cho session hiện tại ───────────────────────────
const currentSessionUnread = computed(() => {
  const session = sessionStore.activeSession;
  return session?.unreadCount ?? 0;
});

function scrollMiniChatToBottom() {
  // Clear unread khi user click badge
  if (sessionStore.activeSession) {
    sessionStore.clearUnread(sessionStore.activeSession.id);
  }
  // Scroll mini chat panel to bottom
  const chatEl = document.querySelector('.mini-chat-messages, .mc-messages');
  if (chatEl) chatEl.scrollTop = chatEl.scrollHeight;
}

// ─── Resizable Splitter (Order Builder <-> Mini Chat) ──────────────
const defaultChatWidth = 340;
const savedWidth = localStorage.getItem('ob_mini_chat_width');
const chatPanelWidth = ref<number>(savedWidth ? Math.min(Math.max(Number(savedWidth), 260), 650) : defaultChatWidth);
const isResizing = ref<boolean>(false);

function startResize(e: MouseEvent) {
  e.preventDefault();
  isResizing.value = true;
  const startX = e.clientX;
  const startWidth = chatPanelWidth.value;

  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';

  const onMouseMove = (moveEvent: MouseEvent) => {
    const deltaX = startX - moveEvent.clientX;
    const newWidth = Math.min(Math.max(startWidth + deltaX, 260), 650);
    chatPanelWidth.value = newWidth;
  };

  const onMouseUp = () => {
    isResizing.value = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    localStorage.setItem('ob_mini_chat_width', String(chatPanelWidth.value));
  };

  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
}

function resetChatPanelWidth() {
  chatPanelWidth.value = defaultChatWidth;
  localStorage.setItem('ob_mini_chat_width', String(defaultChatWidth));
}

// Draft hiện tại — theo activeSessionId (thay đổi khi switch session)
// Fallback sang props.draftId nếu chưa có activeSessionId (lần đầu mở)
const draft = computed(() => {
  const targetId = sessionStore.activeSessionId || props.draftId;
  return draftStore.drafts.find(d => d.id === targetId) ?? null;
});

// Modal visible khi BẤT KỲ session nào đang active (không minimize)
const isModalVisible = computed(() => {
  // Hiện modal nếu có ít nhất 1 session đang mở (không minimize)
  return sessionStore.sessions.some(s => !s.isMinimized);
});

// ─── Backend data ─────────────────────────────────────────────────
const branches = ref<POSBranch[]>([]);
const productsLoading = ref(false);
const searchResults = ref<POSProduct[]>([]);

// ─── Derived từ draft ─────────────────────────────────────────────
const cartItems = computed(() => draft.value?.cartItems ?? []);

const customerInfo = computed<CustomerInfo>(() => ({
  posCustomerId: draft.value?.posCustomerId || 0,
  posCustomerCode: draft.value?.posCustomerCode,
  contactId: draft.value?.contactId,
  name: draft.value?.contactName || 'Khách hàng',
  phone: draft.value?.contactPhone,
}));

const totalAmount = computed(() => {
  const pbId = draft.value?.priceBookId || 'standard';
  return cartItems.value.reduce((sum, item) => {
    const unitPrice = getEffectiveProductPrice(item.product.basePrice, pbId);
    return sum + Math.max(0, unitPrice * item.quantity - (item.discount || 0));
  }, 0);
});

const orderDiscountAmount = computed(() => {
  if (!draft.value) return 0;
  const type = draft.value.orderDiscountType || 'amount';
  const val = draft.value.orderDiscountValue || 0;
  if (type === 'percent') return Math.floor(totalAmount.value * (val / 100));
  return Math.max(0, val);
});

const grandTotal = computed(() => Math.max(0, totalAmount.value - orderDiscountAmount.value));
const totalCartCount = computed(() => cartItems.value.reduce((sum, item) => sum + item.quantity, 0));

// Ngày giờ hiện tại
const currentDateTime = computed(() => {
  const now = new Date();
  return now.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
});

// ─── UI State ─────────────────────────────────────────────────────
const showClearConfirm = ref(false);
const isSuccessOpen = ref(false);
const submitting = ref(false);
const toastMessage = ref<string | null>(null);

// Search
const searchQuery = ref('');
const isSearchOpen = ref(false);
let searchTimer: ReturnType<typeof setTimeout> | null = null;

// Line discount inline editor
const lineDiscountOpenIdx = ref(-1);
const lineDiscountValue = ref(0);
const lineDiscountType = ref<'amount' | 'percent'>('amount');

// Success data
const completedOrderCode = ref('');
const completedTotalItems = ref(0);
const completedFinalTotal = ref(0);
const completedPaymentMethod = ref('');

// ─── Search handlers ──────────────────────────────────────────────
function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer);
  const term = searchQuery.value.trim();
  if (!term) { searchResults.value = []; return; }
  searchTimer = setTimeout(() => fetchProducts(term), 280);
}

function onSearchBlur() {
  setTimeout(() => { isSearchOpen.value = false; }, 200);
}

function clearSearch() {
  searchQuery.value = '';
  searchResults.value = [];
  isSearchOpen.value = false;
}

async function fetchProducts(keyword: string) {
  productsLoading.value = true;
  isSearchOpen.value = true;
  try {
    const { data } = await api.get<{ items: any[]; nextCursor: string | null }>('/pos/products', {
      params: { limit: 20, keyword },
    });
    const items = data?.items || [];
    searchResults.value = items.map((p: any) => ({
      id: p.posId,
      code: p.code || '',
      name: p.name || '',
      categoryName: p.categoryName || '',
      basePrice: p.basePrice || 0,
      unit: p.unit || '',
      onHand: p.onHand,
      imageUrl: p.images?.[0]?.image || p.imageUrl || undefined,
    }));
  } catch (err) {
    console.error('fetchProducts failed:', err);
  } finally {
    productsLoading.value = false;
  }
}

// Quick add: thêm SP trực tiếp từ dropdown (qty=1)
function quickAddProduct(product: POSProduct) {
  handleAddProduct(product);
  searchQuery.value = '';
  searchResults.value = [];
  isSearchOpen.value = false;
}

// ─── Line total helper ────────────────────────────────────────────
function getLineTotal(item: typeof cartItems.value[0]) {
  const pbId = draft.value?.priceBookId || 'standard';
  const unitPrice = getEffectiveProductPrice(item.product.basePrice, pbId);
  return Math.max(0, unitPrice * item.quantity - (item.discount || 0));
}

// ─── Cart item qty controls ───────────────────────────────────────
function changeItemQty(idx: number, delta: number) {
  const item = cartItems.value[idx];
  if (!item) return;
  const newQty = Math.max(1, item.quantity + delta);
  handleUpdateQuantity(item.product.id, newQty);
}

function setItemQty(idx: number, qty: number) {
  const item = cartItems.value[idx];
  if (!item) return;
  handleUpdateQuantity(item.product.id, Math.max(1, qty));
}

// ─── Line discount editor ─────────────────────────────────────────
function openLineDiscount(idx: number) {
  lineDiscountOpenIdx.value = idx;
  const item = cartItems.value[idx];
  lineDiscountValue.value = item?.discount || 0;
  lineDiscountType.value = 'amount';
}

function applyLineDiscount(idx: number) {
  const item = cartItems.value[idx];
  if (!item) return;
  const pbId = draft.value?.priceBookId || 'standard';
  const unitPrice = getEffectiveProductPrice(item.product.basePrice, pbId);
  let discountAmt = lineDiscountValue.value;
  if (lineDiscountType.value === 'percent') {
    discountAmt = Math.floor((unitPrice * item.quantity) * (discountAmt / 100));
  }
  handleUpdateProductDiscount(item.product.id, discountAmt);
  lineDiscountOpenIdx.value = -1;
}

// ─── Package update helper ────────────────────────────────────────
function updatePackage(field: 'length' | 'width' | 'height' | 'weight', event: Event) {
  const val = Number((event.target as HTMLInputElement).value) || undefined;
  handleUpdatePackageMetrics({
    length: field === 'length' ? val : draft.value?.packageLength,
    width: field === 'width' ? val : draft.value?.packageWidth,
    height: field === 'height' ? val : draft.value?.packageHeight,
    weight: field === 'weight' ? val : draft.value?.packageWeight,
  });
}

// ─── Clear all promos ─────────────────────────────────────────────
function clearAllPromos() {
  if (!draft.value?.appliedPromoIds) return;
  for (const id of [...draft.value.appliedPromoIds]) {
    handleRemovePromotion(id);
  }
}

// ─── Handlers (giữ nguyên từ bản cũ) ─────────────────────────────
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

function handleUpdateOrderDiscount(discountVal: number) {
  draftStore.updateDraft(props.draftId, { orderDiscountValue: Math.max(0, discountVal) });
}

function handleUpdateOrderDiscountType(type: string) {
  draftStore.updateDraft(props.draftId, { orderDiscountType: type as 'amount' | 'percent' });
}

function handleAddProduct(product: POSProduct, opts?: { quantity?: number; discount?: number; note?: string; conditionType?: string }) {
  if (!draft.value) return;
  const items = [...cartItems.value];
  const qty = opts?.quantity || 1;
  const discount = opts?.discount || 0;
  const note = opts?.note || '';
  const conditionType = opts?.conditionType as 'normal' | 'damaged' | 'near_expiry' | undefined;

  const existingIdx = items.findIndex(c =>
    c.product.id === product.id && !c.isGift &&
    (c.note || '') === note && (c.discount || 0) === discount && c.conditionType === conditionType
  );
  if (existingIdx !== -1) {
    const existing = items[existingIdx];
    existing.quantity += qty;
    items.splice(existingIdx, 1);
    items.unshift(existing);
    showToast(`Đã tăng số lượng ${product.name}.`);
  } else {
    items.unshift({ product, quantity: qty, discount, note: note || undefined, conditionType });
    showToast(`Đã thêm ${product.name}.`);
  }
  draftStore.updateDraft(props.draftId, { cartItems: items });
}

function handleUpdateQuantity(productId: number, quantity: number) {
  const items = [...cartItems.value];
  const item = items.find(c => c.product.id === productId);
  if (item) { item.quantity = quantity; draftStore.updateDraft(props.draftId, { cartItems: items }); }
}

function handleRemoveProduct(indexOrId: number) {
  const items = [...cartItems.value];
  if (typeof indexOrId === 'number' && indexOrId >= 0 && indexOrId < items.length && items[indexOrId]) {
    items.splice(indexOrId, 1);
  } else {
    const idx = items.findIndex(c => c.product.id === indexOrId);
    if (idx !== -1) items.splice(idx, 1);
  }
  draftStore.updateDraft(props.draftId, { cartItems: items });
}

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

function handleSelectBranch(branchId: number) { draftStore.updateDraft(props.draftId, { branchId }); }
function handleSelectPayment(method: string) { draftStore.updateDraft(props.draftId, { paymentMethod: method }); }
function handleUpdateDeliveryAddress(address: string) { draftStore.updateDraft(props.draftId, { deliveryAddress: address }); }
function handleUpdateBillNote(note: string) { draftStore.updateDraft(props.draftId, { billNote: note, description: note }); }
function handleUpdateShippingNote(note: string) { draftStore.updateDraft(props.draftId, { shippingNote: note }); }
function handleUpdatePackageMetrics(metrics: { length?: number; width?: number; height?: number; weight?: number }) {
  draftStore.updateDraft(props.draftId, {
    packageLength: metrics.length,
    packageWidth: metrics.width,
    packageHeight: metrics.height,
    packageWeight: metrics.weight,
  });
}

function handleReset() {
  draftStore.updateDraft(props.draftId, { cartItems: [], paidAmount: 0, description: '', billNote: '', orderStatus: 1 });
  showToast('Đã đặt lại đơn hàng.');
}

// ─── Submit Order (giữ nguyên logic) ─────────────────────────────
async function handleSubmitOrder() {
  if (!draft.value) return;
  if (cartItems.value.filter(c => !c.isGift).length === 0) { showToast('Vui lòng thêm sản phẩm trước khi tạo đơn.'); return; }
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
        note: c.note || '',
      })),
      discount: draft.value.orderDiscount || 0,
      paidAmount: 0,
      paymentMethod: draft.value.paymentMethod || 'cash',
      orderStatus: 1,
      description: draft.value.description || draft.value.billNote || '',
    };

    const { data } = await api.post<any>('/pos/orders', payload);
    if (data?.success) {
      completedOrderCode.value = data.data?.orderCode || `DH${Date.now()}`;
      completedTotalItems.value = cartItems.value.reduce((s, c) => s + c.quantity, 0);
      completedFinalTotal.value = grandTotal.value;
      completedPaymentMethod.value = draft.value.paymentMethod;
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

// ─── Toast ────────────────────────────────────────────────────────
function showToast(msg: string) {
  toastMessage.value = msg;
  setTimeout(() => { toastMessage.value = null; }, 3000);
}

// ─── Session Switch / Discard ─────────────────────────────────────

async function handleSwitchSession(targetSessionId: string) {
  if (targetSessionId === sessionStore.activeSessionId) return;

  // Save current scroll position
  const scrollEl = document.querySelector('.ob-pos-body');
  const saveScrollPositions: Record<string, number> = scrollEl
    ? { 'pos-body': scrollEl.scrollTop }
    : {};

  // Switch session (includes skeleton 300ms)
  await sessionStore.switchSession(targetSessionId, {
    saveScrollPosition: saveScrollPositions,
  });

  // Switch MiniChat conversation
  const targetSession = sessionStore.sessions.find(s => s.id === targetSessionId);
  if (targetSession?.conversationId) {
    miniChatBridge.switchConversation(targetSession.conversationId);
  } else if (targetSession?.contactId) {
    // Session chưa có conversationId — yêu cầu bridge tìm theo contactId
    miniChatBridge.switchByContact(targetSession.contactId);
  }

  // Restore scroll position after DOM update
  const { nextTick } = await import('vue');
  await nextTick();
  if (targetSession?.scrollPositions?.['pos-body'] && scrollEl) {
    scrollEl.scrollTop = targetSession.scrollPositions['pos-body'];
  }
}

function handleDiscardSession(sessionId: string, _contactName: string) {
  showClearConfirm.value = true;
  // Store session id for confirm dialog
  (showClearConfirm as any)._discardTarget = sessionId;
}

// ─── Fetch branches ───────────────────────────────────────────────
onMounted(() => { fetchBranches(); });

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
/* ════════════════════════════════════
   OVERLAY & WRAPPER
   ════════════════════════════════════ */
.ob-modal-overlay {
  position: fixed; inset: 0; z-index: 9000;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center;
  padding: 12px 10px;
}
.ob-modal-wrapper {
  display: flex; flex-direction: row; align-items: stretch;
  gap: 4px;
  width: 99.5vw;
  max-width: clamp(1200px, 96vw, 1850px);
  height: 95vh;
  max-height: clamp(800px, 94vh, 1100px);
  position: relative; z-index: 10;
}
.ob-modal-frame {
  flex: 1; min-width: 0;
  background: #f1f5f9;
  border-radius: 16px;
  border: 1px solid rgba(226, 232, 240, 0.8);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
  overflow: hidden;
  display: flex; flex-direction: column;
}

/* ════════════════════════════════════
   RESIZER SPLITTER (Invisible Hover Indicator)
   ════════════════════════════════════ */
.ob-split-resizer {
  width: 6px;
  margin: 0 -5px;
  height: 100%;
  cursor: col-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  z-index: 25;
  user-select: none;
  flex-shrink: 0;
  touch-action: none;
}
.ob-split-resizer-bar {
  width: 3px;
  height: 48px;
  background: #bfdbfe;
  border-radius: 999px;
  opacity: 0;
  transition: opacity 0.2s ease, background 0.2s ease, height 0.2s ease, box-shadow 0.2s ease;
}
.ob-split-resizer:hover .ob-split-resizer-bar,
.ob-split-resizer--active .ob-split-resizer-bar {
  opacity: 1;
  background: #0068FF;
  height: 96px;
  box-shadow: 0 0 10px rgba(0, 104, 255, 0.4);
}

/* ════════════════════════════════════
   MINI CHAT OUTER
   ════════════════════════════════════ */
.ob-mini-chat-outer {
  flex-shrink: 0; height: 100%;
}

/* ════════════════════════════════════
   WINDOW HEADER
   ════════════════════════════════════ */
.ob-modal__header {
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
  padding: 10px 16px;
  display: flex; align-items: center; justify-content: space-between;
  flex-shrink: 0; user-select: none;
}
.ob-modal__header-left { display: flex; align-items: center; gap: 14px; min-width: 0; }
.ob-modal__title-group { display: flex; align-items: center; gap: 8px; }
.ob-modal__title {
  font-size: 14px; font-weight: 800; color: #1e293b;
  letter-spacing: -0.02em; margin: 0;
}
.ob-modal__customer-badge {
  font-size: 11px; font-weight: 700;
  background: #eff6ff; color: #1d4ed8;
  border: 1px solid #bfdbfe;
  border-radius: 20px; padding: 2px 10px;
}
.ob-modal__unread-badge {
  display: inline-flex; align-items: center; gap: 3px;
  font-size: 11px; font-weight: 700;
  background: #ef4444; color: #fff;
  border-radius: 20px; padding: 2px 10px;
  cursor: pointer;
  animation: ob-unread-pulse 2s ease-in-out infinite;
  transition: background 0.15s ease;
}
.ob-modal__unread-badge:hover { background: #dc2626; }
@keyframes ob-unread-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
  50% { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
}
.ob-modal__header-right { display: flex; align-items: center; gap: 6px; }
.ob-win-controls { display: flex; align-items: center; gap: 4px; }
.ob-win-btn {
  width: 32px; height: 30px; border-radius: 6px;
  border: 1px solid #e2e8f0; background: #fff; color: #64748b;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all 0.15s ease;
}
.ob-win-btn--reset:hover { background: #fef3c7; color: #d97706; border-color: #fde68a; }
.ob-win-btn--minimize:hover { background: #f1f5f9; color: #0068FF; border-color: #cbd5e1; }
.ob-win-btn--close:hover { background: #ef4444; color: #fff; border-color: #ef4444; }

/* ════════════════════════════════════
   POS HEADER ROW (Search + Bảng giá)
   ════════════════════════════════════ */
.ob-pos-header {
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
  padding: 10px 16px;
  display: flex; align-items: center; gap: 12px;
  flex-shrink: 0;
}

/* Search Zone */
.ob-search-zone {
  flex: 1; max-width: 440px;
  position: relative;
  display: flex; align-items: center;
}
.ob-search-icon {
  position: absolute; left: 10px;
  color: #94a3b8; pointer-events: none; z-index: 1;
}
.ob-search-input {
  width: 100%;
  padding: 8px 36px 8px 34px;
  border: 1.5px solid #e2e8f0;
  border-radius: 10px;
  font-size: 13px; color: #1e293b;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
  background: #f8fafc;
  font-family: inherit;
}
.ob-search-input:focus {
  border-color: #0068FF;
  box-shadow: 0 0 0 3px rgba(0, 104, 255, 0.08);
  background: #fff;
}
.ob-search-clear {
  position: absolute; right: 8px;
  width: 20px; height: 20px; border-radius: 50%;
  border: none; background: #e2e8f0; color: #64748b;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: background 0.15s;
}
.ob-search-clear:hover { background: #cbd5e1; }

/* Search Dropdown */
.ob-search-dropdown {
  position: absolute; top: calc(100% + 6px); left: 0; right: 0;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  max-height: 300px; overflow-y: auto;
  z-index: 200;
}
.ob-search-state {
  display: flex; align-items: center; gap: 8px;
  padding: 14px 16px; font-size: 12.5px; color: #64748b;
}
.ob-search-item {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid #f1f5f9;
  cursor: pointer;
  transition: background 0.12s;
}
.ob-search-item:last-child { border-bottom: none; }
.ob-search-item:hover { background: #f0f9ff; }
.ob-search-item__info { flex: 1; min-width: 0; }
.ob-search-item__name { display: block; font-size: 13px; font-weight: 600; color: #1e293b; }
.ob-search-item__code { display: block; font-size: 10.5px; color: #94a3b8; font-family: monospace; }
.ob-search-item__price { font-size: 12px; font-weight: 700; color: #0068FF; white-space: nowrap; flex-shrink: 0; }
.ob-search-item__action {
  font-size: 11px; font-weight: 700;
  background: #0068FF; color: #fff;
  border-radius: 6px; padding: 3px 8px;
  flex-shrink: 0; white-space: nowrap;
}

/* Bảng giá */
.ob-pricebook {
  display: flex; align-items: center; gap: 6px;
  flex-shrink: 0;
}
.ob-pricebook__icon { color: #64748b; }
.ob-pricebook__label { font-size: 11.5px; font-weight: 700; color: #64748b; white-space: nowrap; }
.ob-pricebook__select {
  padding: 6px 10px; border: 1.5px solid #e2e8f0;
  border-radius: 8px; font-size: 12px; font-weight: 600;
  color: #1e293b; background: #f8fafc; outline: none;
  cursor: pointer; transition: border-color 0.15s;
}
.ob-pricebook__select:focus { border-color: #0068FF; }

/* Quick Summary */
.ob-quick-summary {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 12px;
  background: #f0f9ff; border: 1px solid #bfdbfe;
  border-radius: 8px;
  flex-shrink: 0;
}
.ob-quick-summary__count { font-size: 12px; font-weight: 700; color: #1e293b; }
.ob-quick-summary__sep { color: #94a3b8; }
.ob-quick-summary__total { font-size: 12px; font-weight: 800; color: #0068FF; font-family: monospace; }

/* ════════════════════════════════════
   POS BODY: 2 CỘT
   ════════════════════════════════════ */
.ob-pos-body {
  flex: 1; display: flex; overflow: hidden;
}

/* ════════════════════════════════════
   CỘT TRÁI (60%)
   ════════════════════════════════════ */
.ob-pos-left {
  flex: 0 0 60%;
  max-width: 60%;
  display: flex; flex-direction: column;
  overflow: hidden;
  border-right: 1px solid #e2e8f0;
}

/* Cart list scroll area */
.ob-cart-list {
  flex: 1; overflow-y: auto;
  padding: 12px;
  display: flex; flex-direction: column; gap: 6px;
}
.ob-cart-list::-webkit-scrollbar { width: 4px; }
.ob-cart-list::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 2px; }

/* Empty state */
.ob-cart-empty {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  padding: 48px 24px;
  text-align: center;
}
.ob-cart-empty__icon { color: #cbd5e1; margin-bottom: 14px; }
.ob-cart-empty__title { font-size: 14px; font-weight: 700; color: #475569; margin: 0 0 6px; }
.ob-cart-empty__sub { font-size: 12px; color: #94a3b8; margin: 0; line-height: 1.5; }

/* Cart item card */
.ob-cart-item {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px 12px;
  transition: box-shadow 0.15s, border-color 0.15s;
}
.ob-cart-item:hover { box-shadow: 0 2px 8px rgba(0, 104, 255, 0.06); border-color: #bfdbfe; }
.ob-cart-item--gift { border-color: #fbcfe8; background: #fdf2f8; }
.ob-cart-item--damaged { border-color: #fca5a5; background: #fff5f5; }
.ob-cart-item--near-expiry { border-color: #fde68a; background: #fffbeb; }

.ob-cart-item__top {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;
  margin-bottom: 8px;
}
.ob-cart-item__name-wrap {
  display: flex; flex-wrap: wrap; align-items: center; gap: 5px; flex: 1; min-width: 0;
}
.ob-cart-item__code {
  font-family: monospace; font-size: 10.5px; color: #94a3b8;
  background: #f1f5f9; padding: 1px 5px; border-radius: 4px;
  white-space: nowrap; flex-shrink: 0;
}
.ob-cart-item__name {
  font-size: 13px; font-weight: 700; color: #1e293b;
  overflow: hidden; text-overflow: ellipsis;
}
.ob-cart-item__note {
  font-size: 11px; color: #6366f1; font-style: italic;
  white-space: nowrap;
}

/* Badges */
.ob-badge {
  display: inline-flex; align-items: center;
  font-size: 10.5px; font-weight: 700;
  padding: 2px 7px; border-radius: 12px;
  white-space: nowrap; flex-shrink: 0;
}
.ob-badge--red { background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; }
.ob-badge--amber { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
.ob-badge--pink { background: #fce7f3; color: #9d174d; border: 1px solid #fbcfe8; }

/* Action buttons */
.ob-cart-item__actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.ob-item-btn {
  display: flex; align-items: center; gap: 4px;
  padding: 4px 8px; border-radius: 6px;
  font-size: 11px; font-weight: 700;
  border: 1px solid transparent;
  cursor: pointer; transition: all 0.12s;
}
.ob-item-btn--discount {
  background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe;
}
.ob-item-btn--discount:hover { background: #dbeafe; }
.ob-item-btn--remove {
  background: #fff; color: #ef4444; border-color: #fca5a5;
}
.ob-item-btn--remove:hover { background: #fee2e2; }

/* Bottom row: qty + giá */
.ob-cart-item__bottom {
  display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
}

/* Qty controls */
.ob-qty-ctrl { display: flex; align-items: center; gap: 4px; }
.ob-qty-btn {
  width: 26px; height: 26px; border-radius: 6px;
  border: 1.5px solid #e2e8f0; background: #f8fafc; color: #475569;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all 0.12s;
}
.ob-qty-btn:hover:not(:disabled) { border-color: #0068FF; color: #0068FF; background: #eff6ff; }
.ob-qty-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.ob-qty-input {
  width: 44px; height: 26px;
  border: 1.5px solid #e2e8f0; border-radius: 6px;
  text-align: center; font-size: 13px; font-weight: 700;
  color: #1e293b; outline: none;
  transition: border-color 0.15s;
}
.ob-qty-input:focus { border-color: #0068FF; }
.ob-qty-input:disabled { opacity: 0.5; background: #f8fafc; }

/* Price columns */
.ob-cart-item__price-col,
.ob-cart-item__discount-col,
.ob-cart-item__total-col {
  display: flex; flex-direction: column; align-items: flex-end; min-width: 72px;
}
.ob-cart-item__price-label { font-size: 10px; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; }
.ob-cart-item__price-val { font-size: 12.5px; font-weight: 600; color: #475569; font-family: monospace; }
.ob-cart-item__discount-val { font-size: 12.5px; font-weight: 700; color: #dc2626; font-family: monospace; }
.ob-cart-item__total-val { font-size: 13.5px; font-weight: 800; color: #0068FF; font-family: monospace; }
.ob-cart-item__total-col { margin-left: auto; }

/* Line discount editor */
.ob-line-discount-editor {
  display: flex; align-items: center; gap: 8px;
  margin-top: 8px; padding: 8px 10px;
  background: #f0f9ff; border: 1px solid #bfdbfe;
  border-radius: 8px; flex-wrap: wrap;
}
.ob-line-discount-editor__label { font-size: 11.5px; font-weight: 700; color: #1e293b; white-space: nowrap; }
.ob-line-discount-editor__input {
  width: 90px; padding: 5px 8px;
  border: 1.5px solid #93c5fd; border-radius: 6px;
  font-size: 13px; font-weight: 600; color: #1e293b;
  outline: none; text-align: right;
}
.ob-line-discount-editor__input:focus { border-color: #0068FF; }
.ob-line-discount-editor__toggle { display: flex; border: 1.5px solid #bfdbfe; border-radius: 6px; overflow: hidden; }
.ob-line-discount-editor__apply {
  padding: 5px 12px; background: #0068FF; color: #fff;
  border: none; border-radius: 6px;
  font-size: 12px; font-weight: 700; cursor: pointer;
  transition: background 0.15s;
}
.ob-line-discount-editor__apply:hover { background: #0056d2; }
.ob-line-discount-editor__cancel {
  padding: 5px 10px; background: #f1f5f9; color: #64748b;
  border: none; border-radius: 6px;
  font-size: 12px; font-weight: 700; cursor: pointer;
  transition: background 0.15s;
}
.ob-line-discount-editor__cancel:hover { background: #e2e8f0; }

/* Unit buttons (dùng chung) */
.ob-unit-btn {
  padding: 4px 8px; border: none;
  font-size: 11.5px; font-weight: 700; color: #64748b;
  background: #fff; cursor: pointer; transition: all 0.12s;
}
.ob-unit-btn--active { background: #0068FF; color: #fff; }
.ob-unit-btn:hover:not(.ob-unit-btn--active) { background: #f1f5f9; }

/* Left footer */
.ob-left-footer {
  flex-shrink: 0; padding: 10px 12px;
  border-top: 1px solid #e2e8f0;
  background: #fff;
  display: flex; flex-direction: column; gap: 8px;
}

/* Promo bar */
.ob-promo-applied-bar {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 12px;
  background: #fdf2f8; border: 1px solid #fbcfe8;
  border-radius: 8px; font-size: 12px; font-weight: 700; color: #9d174d;
}
.ob-promo-applied-bar__icon { color: #db2777; flex-shrink: 0; }
.ob-promo-applied-bar__clear {
  margin-left: auto; padding: 3px 8px;
  border: 1px solid #fbcfe8; border-radius: 6px;
  background: #fff; color: #db2777;
  font-size: 11px; font-weight: 700; cursor: pointer;
  transition: background 0.12s;
}
.ob-promo-applied-bar__clear:hover { background: #fce7f3; }

/* Ghi chú */
.ob-note-area { display: flex; flex-direction: column; gap: 5px; }
.ob-note-area__label {
  display: flex; align-items: center; gap: 5px;
  font-size: 11px; font-weight: 700; color: #64748b;
  text-transform: uppercase; letter-spacing: 0.04em;
}
.ob-note-area__input {
  width: 100%;
  padding: 8px 10px;
  border: 1.5px solid #e2e8f0; border-radius: 8px;
  font-size: 12.5px; color: #1e293b;
  outline: none; resize: none;
  font-family: inherit;
  transition: border-color 0.15s, box-shadow 0.15s;
  box-sizing: border-box;
}
.ob-note-area__input:focus { border-color: #0068FF; box-shadow: 0 0 0 3px rgba(0, 104, 255, 0.08); }

/* ════════════════════════════════════
   CỘT PHẢI (40%)
   ════════════════════════════════════ */
/* ════════════════════════════════════
   CỘT PHẢI (40%) - CỐ ĐỊNH, PHÂN BỔ ĐỀU CHIỀU CAO
   ════════════════════════════════════ */
.ob-pos-right {
  flex: 0 0 40%;
  max-width: 40%;
  overflow: hidden;
  padding: 12px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background: #f8fafc;
}

/* Right cards */
.ob-right-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px 14px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}
.ob-card-header {
  display: flex; align-items: center; gap: 6px;
  font-size: 10.5px; font-weight: 800; color: #64748b;
  text-transform: uppercase; letter-spacing: 0.05em;
  margin-bottom: 8px;
}

/* Customer card */
.ob-customer-info { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.ob-customer-avatar {
  width: 36px; height: 36px; border-radius: 50%;
  background: linear-gradient(135deg, #0068FF, #3b82f6);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 2px 6px rgba(0, 104, 255, 0.2);
}
.ob-customer-avatar span { font-size: 15px; font-weight: 800; color: #fff; }
.ob-customer-details { flex: 1; min-width: 0; }
.ob-customer-name { font-size: 13.5px; font-weight: 800; color: #1e293b; margin-bottom: 2px; }
.ob-customer-meta { font-size: 11px; color: #64748b; }
.ob-creator-row {
  display: flex; align-items: center; gap: 6px;
  padding-top: 8px; border-top: 1px solid #f1f5f9;
}
.ob-creator-name { font-size: 11.5px; font-weight: 700; color: #1e293b; flex: 1; }
.ob-creator-time { font-size: 10px; color: #94a3b8; white-space: nowrap; }

/* Logistics card */
.ob-logistics-field { display: flex; flex-direction: column; gap: 3px; margin-bottom: 8px; }
.ob-logistics-field:last-child { margin-bottom: 0; }
.ob-logistics-label {
  display: flex; align-items: center; gap: 4px;
  font-size: 10.5px; font-weight: 700; color: #64748b;
  text-transform: uppercase; letter-spacing: 0.03em;
}
.ob-logistics-select,
.ob-logistics-input {
  width: 100%; padding: 6px 10px;
  border: 1.5px solid #e2e8f0; border-radius: 7px;
  font-size: 12.5px; font-weight: 500; color: #1e293b;
  background: #fff; outline: none;
  transition: border-color 0.15s;
  font-family: inherit;
  box-sizing: border-box;
}
.ob-logistics-select:focus,
.ob-logistics-input:focus { border-color: #0068FF; }
.ob-package-grid {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px;
}
.ob-package-input {
  padding: 5px 7px;
  border: 1.5px solid #e2e8f0; border-radius: 7px;
  font-size: 12px; text-align: center; color: #1e293b;
  background: #fff; outline: none;
  transition: border-color 0.15s; font-family: inherit;
  width: 100%; box-sizing: border-box;
}
.ob-package-input:focus { border-color: #0068FF; }
.ob-logistics-textarea {
  width: 100%; padding: 6px 10px;
  border: 1.5px solid #e2e8f0; border-radius: 7px;
  font-size: 12.5px; color: #1e293b;
  background: #fff; outline: none; resize: none;
  transition: border-color 0.15s; font-family: inherit;
  box-sizing: border-box;
  min-height: 42px; height: 42px;
}
.ob-logistics-textarea:focus { border-color: #0068FF; }

/* Payment card */
.ob-payment-row {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 6px;
}
.ob-payment-row__label { font-size: 12.5px; color: #475569; }
.ob-payment-row__val { font-size: 12.5px; font-weight: 700; color: #1e293b; font-family: monospace; }
.ob-payment-row--discount { align-items: center; }
.ob-discount-inline { display: flex; align-items: center; gap: 5px; }
.ob-discount-inline__input {
  width: 80px; padding: 4px 7px; text-align: right;
  border: 1.5px solid #e2e8f0; border-radius: 7px;
  font-size: 12.5px; font-weight: 600; color: #1e293b;
  outline: none; transition: border-color 0.15s;
}
.ob-discount-inline__input:focus { border-color: #0068FF; }
.ob-discount-type-toggle { display: flex; border: 1.5px solid #e2e8f0; border-radius: 7px; overflow: hidden; }
.ob-payment-divider { height: 1px; background: #e2e8f0; margin: 8px 0; }
.ob-payment-row--total .ob-payment-row__label { font-size: 13.5px; font-weight: 700; color: #1e293b; }
.ob-payment-row__total { font-size: 19px; font-weight: 900; color: #0068FF; font-family: monospace; letter-spacing: -0.03em; }

.ob-payment-method {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 10px;
}
.ob-payment-method__label { font-size: 12px; font-weight: 700; color: #475569; }
.ob-payment-method__toggle { display: flex; border: 1.5px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
.ob-pay-btn {
  padding: 5px 12px; border: none;
  font-size: 12px; font-weight: 700; color: #64748b;
  background: #fff; cursor: pointer;
  transition: all 0.12s;
  display: flex; align-items: center; gap: 5px;
}
.ob-pay-btn:hover:not(.ob-pay-btn--active) { background: #f8fafc; }
.ob-pay-btn--active { background: #0068FF; color: #fff; }

/* Submit button */
.ob-submit-btn {
  display: flex; align-items: center; justify-content: center; gap: 7px;
  width: 100%; padding: 11px 16px;
  border: none; border-radius: 9px;
  background: #0068FF; color: #fff;
  font-size: 13.5px; font-weight: 800; letter-spacing: 0.03em;
  cursor: pointer; transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 3px 12px rgba(0, 104, 255, 0.25);
  font-family: inherit;
}
.ob-submit-btn:hover:not(:disabled) {
  background: #0056d2;
  box-shadow: 0 5px 16px rgba(0, 104, 255, 0.35);
  transform: translateY(-1px);
}
.ob-submit-btn:active:not(:disabled) { transform: scale(0.98); }
.ob-submit-btn:disabled {
  opacity: 0.5; cursor: not-allowed;
  transform: none; box-shadow: none;
  background: #94a3b8;
}
.ob-submit-hint { font-size: 10.5px; color: #f59e0b; text-align: center; margin: 4px 0 0; }

/* ════════════════════════════════════
   CONFIRM DIALOG
   ════════════════════════════════════ */
.ob-confirm-overlay {
  position: absolute; inset: 0; z-index: 80;
  background: rgba(15, 23, 42, 0.5);
  backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center; padding: 16px;
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
  font-size: 12px; font-weight: 700; border: none; cursor: pointer; transition: all 0.15s;
}
.ob-confirm-btn--cancel { background: #f1f5f9; color: #64748b; }
.ob-confirm-btn--cancel:hover { background: #e2e8f0; color: #1e293b; }
.ob-confirm-btn--danger { background: #ef4444; color: #fff; }
.ob-confirm-btn--danger:hover { background: #dc2626; }

/* ════════════════════════════════════
   INBOUND MESSAGE NOTIFICATIONS
   ════════════════════════════════════ */
.ob-notif-stack {
  position: absolute;
  bottom: 16px;
  left: 16px;
  z-index: 100;
  display: flex;
  flex-direction: column-reverse;
  gap: 8px;
  pointer-events: none;
}
.ob-notif-item {
  pointer-events: all;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: rgba(15, 23, 42, 0.92);
  backdrop-filter: blur(12px);
  border-radius: 12px;
  border: 1px solid rgba(59, 130, 246, 0.3);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(59, 130, 246, 0.1);
  cursor: pointer;
  min-width: 240px;
  max-width: 360px;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.ob-notif-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(59, 130, 246, 0.3);
}
.ob-notif-avatar {
  width: 32px; height: 32px; min-width: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #3b82f6, #8b5cf6);
  display: flex; align-items: center; justify-content: center;
  color: #fff;
}
.ob-notif-body {
  flex: 1;
  min-width: 0;
}
.ob-notif-name {
  font-size: 12px;
  font-weight: 700;
  color: #e2e8f0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ob-notif-text {
  font-size: 11px;
  color: #94a3b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 1px;
}
.ob-notif-close {
  width: 18px; height: 18px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: #94a3b8;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  padding: 0;
  transition: background 0.15s ease;
}
.ob-notif-close:hover { background: rgba(239, 68, 68, 0.5); color: #fff; }

/* Transition-group animations */
.ob-notif-enter-active { transition: all 0.35s cubic-bezier(0.22, 1, 0.36, 1); }
.ob-notif-leave-active { transition: all 0.25s ease-in; }
.ob-notif-enter-from { opacity: 0; transform: translateX(-40px) scale(0.9); }
.ob-notif-leave-to { opacity: 0; transform: translateX(-30px) scale(0.95); }
.ob-notif-move { transition: transform 0.3s ease; }

/* ════════════════════════════════════
   TOAST
   ════════════════════════════════════ */
.ob-toast {
  position: fixed; bottom: 24px; left: 24px; z-index: 9999;
  background: #0f172a; color: #fff;
  padding: 12px 16px; border-radius: 12px;
  font-size: 12px; font-weight: 700;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  display: flex; align-items: center; gap: 8px;
  border: 1px solid #1e293b;
}

/* ════════════════════════════════════
   TRANSITIONS
   ════════════════════════════════════ */
.ob-modal-enter-active, .ob-modal-leave-active { transition: opacity 0.25s ease; }
.ob-modal-enter-from, .ob-modal-leave-to { opacity: 0; }
.ob-toast-enter-active, .ob-toast-leave-active { transition: all 0.3s ease; }
.ob-toast-enter-from, .ob-toast-leave-to { opacity: 0; transform: translateY(20px); }
.ob-fade-enter-active, .ob-fade-leave-active { transition: opacity 0.2s ease; }
.ob-fade-enter-from, .ob-fade-leave-to { opacity: 0; }

/* ════════════════════════════════════
   UTILITY
   ════════════════════════════════════ */
.ob-text-blue { color: #0068FF; }
.ob-text-muted { color: #94a3b8; }
.ob-text-red { color: #ef4444; }
.ob-spin { animation: ob-spin 1s linear infinite; }
@keyframes ob-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

:deep(input[type="number"]::-webkit-outer-spin-button),
:deep(input[type="number"]::-webkit-inner-spin-button) { -webkit-appearance: none; margin: 0; }
:deep(input[type="number"]) { -moz-appearance: textfield; appearance: textfield; }

/* ════════════════════════════════════
   SESSION SWITCHING SKELETON OVERLAY
   ════════════════════════════════════ */
.ob-skeleton-overlay {
  position: absolute;
  inset: 0;
  z-index: 50;
  background: rgba(248, 250, 252, 0.92);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
}

.ob-skeleton-content {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 60%;
  max-width: 420px;
  padding: 32px;
}

.ob-skeleton-bar {
  height: 14px;
  border-radius: 8px;
  background: linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%);
  background-size: 200% 100%;
  animation: ob-shimmer 1.5s ease-in-out infinite;
}
.ob-skeleton-bar--title { width: 45%; height: 18px; }
.ob-skeleton-bar--subtitle { width: 65%; height: 12px; }
.ob-skeleton-bar--row { width: 100%; }
.ob-skeleton-bar--short { width: 40%; }

@keyframes ob-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
</style>
