<template>
  <div class="ob-drawer">
    <!-- Header -->
    <div class="ob-drawer__header">
      <div class="ob-drawer__header-left">
        <button class="ob-drawer__close" @click="$emit('close')">
          <X :size="16" :stroke-width="2.5" />
        </button>
        <FileText :size="18" class="ob-text-blue" />
        <h2>Chi tiết Hóa Đơn</h2>
      </div>
      <button class="ob-drawer__clear" @click="$emit('clear-order')">Xóa đơn</button>
    </div>

    <!-- Content -->
    <div class="ob-drawer__content">

      <!-- Section: Customer -->
      <div class="ob-drawer__section">
        <h3 class="ob-drawer__section-title">
          <User :size="14" />
          Khách hàng thụ hưởng
        </h3>
        <div class="ob-drawer__customer">
          <div class="ob-drawer__customer-avatar">{{ (customer.name || '?')[0] }}</div>
          <div>
            <p class="ob-drawer__customer-name">{{ customer.name }}</p>
            <p v-if="customer.phone" class="ob-drawer__customer-phone">{{ customer.phone }}</p>
            <p v-if="customer.posCustomerCode" class="ob-drawer__customer-code">POS: {{ customer.posCustomerCode }}</p>
          </div>
        </div>
      </div>

      <!-- Section: Products -->
      <div class="ob-drawer__section ob-drawer__section--bordered">
        <h3 class="ob-drawer__section-title">
          <ShoppingBag :size="14" />
          Sản phẩm đặt mua
        </h3>
        <div v-if="cartItems.length > 0" class="ob-drawer__products">
          <div
            v-for="item in cartItems"
            :key="item.product.id"
            class="ob-drawer__product-row"
          >
            <div class="ob-drawer__product-info">
              <p class="ob-drawer__product-name">{{ item.product.name }}</p>
              <p class="ob-drawer__product-meta">
                {{ item.quantity }} {{ item.product.unit || 'sp' }} × {{ formatVND(item.product.basePrice) }}
                <span v-if="item.discount" class="ob-text-red"> (CK: -{{ formatVND(item.discount) }})</span>
              </p>
            </div>
            <span class="ob-drawer__product-total">{{ formatVND(Math.max(0, item.product.basePrice * item.quantity - (item.discount || 0))) }}</span>
          </div>
        </div>
        <p v-else class="ob-drawer__empty">Chưa chọn sản phẩm nào.</p>
      </div>

      <!-- Section: Routing Info -->
      <div class="ob-drawer__section ob-drawer__section--bordered">
        <h3 class="ob-drawer__section-title">Cấu hình giao nhận</h3>
        <div class="ob-drawer__routing-grid">
          <div class="ob-drawer__routing-card">
            <p class="ob-drawer__routing-label">CHI NHÁNH</p>
            <p class="ob-drawer__routing-value">{{ branch ? branch.name : 'Chưa chọn' }}</p>
          </div>
          <div class="ob-drawer__routing-card">
            <p class="ob-drawer__routing-label">THANH TOÁN</p>
            <p class="ob-drawer__routing-value">{{ paymentLabel }}</p>
          </div>
          <div class="ob-drawer__routing-card ob-drawer__routing-card--full">
            <p class="ob-drawer__routing-label">ĐỊA CHỈ ĐẾN</p>
            <p class="ob-drawer__routing-value">{{ deliveryAddress || '123 Đường Lê Lợi, Quận 1, TP.HCM' }}</p>
          </div>
        </div>
      </div>

      <!-- Section: Description / Note -->
      <div class="ob-drawer__section ob-drawer__section--bordered">
        <h3 class="ob-drawer__section-title">
          <FileText :size="14" />
          Ghi chú đơn hàng
        </h3>
        <textarea
          :value="description"
          class="ob-drawer__textarea"
          placeholder="Nhập ghi chú cho đơn hàng (tùy chọn)..."
          @input="$emit('update-description', ($event.target as HTMLTextAreaElement).value)"
        />
      </div>

      <!-- Section: Paid Amount -->
      <div class="ob-drawer__section ob-drawer__section--bordered">
        <h3 class="ob-drawer__section-title">
          <Banknote :size="14" />
          Thanh toán trước
        </h3>
        <div class="ob-drawer__paid-row">
          <input
            type="number"
            :value="paidAmount"
            class="ob-drawer__paid-input"
            placeholder="0"
            min="0"
            @input="$emit('update-paid', Number(($event.target as HTMLInputElement).value) || 0)"
          />
          <span class="ob-drawer__paid-unit">đ</span>
        </div>
      </div>
    </div>

    <!-- Pricing Footer -->
    <div class="ob-drawer__footer">
      <div class="ob-drawer__pricing">
        <div class="ob-drawer__pricing-row">
          <span>Tạm tính sản phẩm:</span>
          <span class="ob-mono ob-text-bold">{{ formatVND(totalBeforeDiscount) }}</span>
        </div>
        <div class="ob-drawer__pricing-row ob-text-green">
          <span>Giảm giá:</span>
          <span class="ob-mono ob-text-bold">-{{ formatVND(orderDiscount) }}</span>
        </div>
        <div class="ob-drawer__pricing-row ob-drawer__pricing-row--total">
          <span>Tổng cộng đơn hàng:</span>
          <span class="ob-drawer__pricing-grand">{{ formatVND(grandTotal) }}</span>
        </div>
        <div v-if="paidAmount > 0" class="ob-drawer__pricing-row">
          <span>Đã thanh toán:</span>
          <span class="ob-mono ob-text-bold">{{ formatVND(paidAmount) }}</span>
        </div>
        <div v-if="paidAmount > 0" class="ob-drawer__pricing-row">
          <span>Còn nợ:</span>
          <span class="ob-mono" style="font-weight: 700; color: #ef4444">
            {{ formatVND(Math.max(0, grandTotal - paidAmount)) }}
          </span>
        </div>
      </div>

      <button
        class="ob-drawer__submit"
        :class="{ 'ob-drawer__submit--disabled': !isValid }"
        :disabled="!isValid || submitting"
        @click="$emit('submit-order')"
      >
        <Loader2 v-if="submitting" :size="16" class="ob-spin" />
        <CheckSquare v-else :size="16" />
        <span>{{ submitting ? 'Đang xử lý...' : 'XÁC NHẬN & LÊN ĐƠN (ZALOCRM)' }}</span>
      </button>

      <p v-if="!isValid" class="ob-drawer__error">
        * Vui lòng chọn Sản phẩm, Chi nhánh & Thanh toán để hoàn tất đơn.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  X, FileText, User, ShoppingBag, CheckSquare,
  Loader2, Banknote,
} from 'lucide-vue-next';
import type { CustomerInfo, CartItem, POSBranch } from './types';
import { formatVND, PAYMENT_METHODS } from './types';

const props = defineProps<{
  customer: CustomerInfo;
  cartItems: CartItem[];
  branch: POSBranch | null;
  selectedPaymentMethod: string;
  totalBeforeDiscount: number;
  orderDiscount: number;
  grandTotal: number;
  description: string;
  paidAmount: number;
  deliveryAddress?: string;
  submitting?: boolean;
}>();

defineEmits<{
  'close': [];
  'clear-order': [];
  'submit-order': [];
  'update-description': [value: string];
  'update-paid': [value: number];
}>();

const isValid = computed(() => {
  return props.cartItems.length > 0 &&
    props.branch !== null &&
    props.selectedPaymentMethod !== '';
});

const paymentLabel = computed(() => {
  const m = PAYMENT_METHODS.find(p => p.value === props.selectedPaymentMethod);
  return m ? m.label : 'Chưa chọn';
});
</script>

<style scoped>
.ob-drawer {
  width: 100%;
  height: 100%;
  background: #fff;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Header */
.ob-drawer__header {
  padding: 16px;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}
.ob-drawer__header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ob-drawer__header h2 {
  font-size: 14px;
  font-weight: 700;
  color: #1e293b;
  text-transform: uppercase;
  letter-spacing: -0.01em;
  margin: 0;
}
.ob-drawer__close {
  padding: 4px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  transition: all 0.15s;
  margin-right: 4px;
}
.ob-drawer__close:hover { background: #e2e8f0; }
.ob-drawer__clear {
  font-size: 12px;
  color: #ef4444;
  background: transparent;
  border: none;
  font-weight: 600;
  cursor: pointer;
}
.ob-drawer__clear:hover { color: #dc2626; }

/* Content */
.ob-drawer__content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}
.ob-drawer__section { margin-bottom: 16px; }
.ob-drawer__section--bordered {
  padding-top: 12px;
  border-top: 1px solid #f1f5f9;
}
.ob-drawer__section-title {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #94a3b8;
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 0 0 8px;
}
.ob-drawer__empty {
  font-size: 12px;
  color: #94a3b8;
  font-style: italic;
}

/* Customer */
.ob-drawer__customer {
  display: flex;
  gap: 12px;
  align-items: center;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px;
}
.ob-drawer__customer-avatar {
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
.ob-drawer__customer-name {
  font-size: 13px;
  font-weight: 700;
  color: #1e293b;
  margin: 0;
}
.ob-drawer__customer-phone {
  font-size: 11px;
  color: #64748b;
  font-family: monospace;
  margin: 2px 0 0;
}
.ob-drawer__customer-code {
  font-size: 10px;
  color: #0068FF;
  font-weight: 600;
  margin: 2px 0 0;
}

/* Products */
.ob-drawer__products {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ob-drawer__product-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  background: #f8fafc;
  border: 1px solid #f1f5f9;
  padding: 8px 10px;
  border-radius: 8px;
}
.ob-drawer__product-name {
  font-size: 12px;
  font-weight: 600;
  color: #1e293b;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ob-drawer__product-meta {
  font-size: 10px;
  color: #94a3b8;
  font-family: monospace;
  margin: 2px 0 0;
}
.ob-drawer__product-total {
  font-size: 12px;
  font-weight: 700;
  color: #475569;
  font-family: monospace;
  flex-shrink: 0;
}

/* Routing */
.ob-drawer__routing-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.ob-drawer__routing-card {
  background: #f8fafc;
  border: 1px solid #f1f5f9;
  border-radius: 8px;
  padding: 8px;
}
.ob-drawer__routing-card--full {
  grid-column: span 2;
}
.ob-drawer__routing-label {
  font-size: 9px;
  color: #94a3b8;
  font-weight: 800;
  text-transform: uppercase;
  margin: 0;
}
.ob-drawer__routing-value {
  font-size: 12px;
  font-weight: 700;
  color: #1e293b;
  margin: 4px 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Textarea */
.ob-drawer__textarea {
  width: 100%;
  min-height: 60px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 12px;
  resize: vertical;
  outline: none;
  font-family: inherit;
  transition: border-color 0.15s;
}
.ob-drawer__textarea:focus {
  border-color: #0068FF;
}

/* Paid Amount */
.ob-drawer__paid-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ob-drawer__paid-input {
  width: 100%;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 14px;
  font-weight: 700;
  font-family: monospace;
  outline: none;
  transition: border-color 0.15s;
  -moz-appearance: textfield;
  appearance: textfield;
}
.ob-drawer__paid-input::-webkit-outer-spin-button,
.ob-drawer__paid-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.ob-drawer__paid-input:focus {
  border-color: #0068FF;
}
.ob-drawer__paid-unit {
  font-size: 14px;
  font-weight: 700;
  color: #64748b;
}

/* Footer */
.ob-drawer__footer {
  padding: 16px;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
}
.ob-drawer__pricing {
  margin-bottom: 12px;
}
.ob-drawer__pricing-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #64748b;
  margin-bottom: 6px;
}
.ob-drawer__pricing-row--total {
  padding-top: 8px;
  border-top: 1px solid #e2e8f0;
  font-size: 14px;
  font-weight: 800;
  color: #1e293b;
}
.ob-drawer__pricing-grand {
  font-family: monospace;
  font-size: 16px;
  color: #0068FF;
}
.ob-drawer__submit {
  width: 100%;
  padding: 14px 16px;
  border-radius: 12px;
  font-weight: 700;
  font-size: 12px;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: none;
  cursor: pointer;
  transition: all 0.15s;
  background: #0068FF;
  color: #fff;
  box-shadow: 0 4px 12px rgba(0,104,255,0.15);
}
.ob-drawer__submit:hover {
  background: #0055d4;
  box-shadow: 0 6px 16px rgba(0,104,255,0.25);
}
.ob-drawer__submit--disabled {
  background: #e2e8f0;
  color: #94a3b8;
  cursor: not-allowed;
  box-shadow: none;
}
.ob-drawer__error {
  font-size: 10px;
  color: #ef4444;
  text-align: center;
  font-weight: 500;
  margin: 8px 0 0;
}

/* Utility */
.ob-text-blue { color: #0068FF; }
.ob-text-green { color: #10b981; }
.ob-text-bold { font-weight: 700; color: #475569; }
.ob-mono { font-family: monospace; }
.ob-spin { animation: ob-spin 1s linear infinite; }
@keyframes ob-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
