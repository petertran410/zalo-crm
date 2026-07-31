<template>
  <div class="s4-review">
    <!-- Summary Cards -->
    <div class="s4-summary-grid">
      <!-- Customer card -->
      <div class="s4-summary-card">
        <div class="s4-summary-card__icon s4-summary-card__icon--blue">
          <User :size="14" />
        </div>
        <div class="s4-summary-card__body">
          <span class="s4-summary-card__label">Khách hàng</span>
          <span class="s4-summary-card__value">{{ customer.name }}</span>
          <span v-if="customer.posCustomerCode" class="s4-summary-card__sub">{{ customer.posCustomerCode }}</span>
        </div>
      </div>

      <!-- Branch card -->
      <div class="s4-summary-card">
        <div class="s4-summary-card__icon s4-summary-card__icon--indigo">
          <MapPin :size="14" />
        </div>
        <div class="s4-summary-card__body">
          <span class="s4-summary-card__label">Chi nhánh</span>
          <span class="s4-summary-card__value">{{ branch ? branch.name : 'Chưa chọn' }}</span>
        </div>
      </div>

      <!-- Payment card -->
      <div class="s4-summary-card">
        <div class="s4-summary-card__icon s4-summary-card__icon--green">
          <CreditCard :size="14" />
        </div>
        <div class="s4-summary-card__body">
          <span class="s4-summary-card__label">Thanh toán</span>
          <span class="s4-summary-card__value">{{ paymentLabel }}</span>
        </div>
      </div>

      <!-- Delivery card -->
      <div class="s4-summary-card">
        <div class="s4-summary-card__icon s4-summary-card__icon--sky">
          <Truck :size="14" />
        </div>
        <div class="s4-summary-card__body">
          <span class="s4-summary-card__label">Địa chỉ giao hàng</span>
          <span class="s4-summary-card__value" :title="deliveryAddress || '123 Đường Lê Lợi, Quận 1, TP.HCM'">{{ deliveryAddress || '123 Đường Lê Lợi, Quận 1, TP.HCM' }}</span>
        </div>
      </div>
    </div>

    <!-- Product Summary -->
    <div class="s4-products">
      <div class="s4-products__header">
        <ShoppingBag :size="14" />
        <span>{{ cartItems.length }} sản phẩm</span>
      </div>
      <div class="s4-products__list">
        <div v-for="item in cartItems" :key="item.product.id" class="s4-products__row">
          <span class="s4-products__name">
            {{ item.product.name }}
            <span v-if="item.isGift" class="s4-products__gift">🎁</span>
          </span>
          <span class="s4-products__qty">×{{ item.quantity }}</span>
          <span class="s4-products__price s4-mono">
            {{ item.isGift ? 'Miễn phí' : formatVND(Math.max(0, item.product.basePrice * item.quantity - (item.discount || 0))) }}
          </span>
        </div>
      </div>
    </div>

    <!-- Pricing -->
    <div class="s4-pricing">
      <div class="s4-pricing__row">
        <span>Tạm tính sản phẩm:</span>
        <span class="s4-mono s4-text-bold">{{ formatVND(totalBeforeDiscount) }}</span>
      </div>
      <div v-if="orderDiscount > 0" class="s4-pricing__row s4-pricing__row--discount">
        <span>Giảm giá đơn:</span>
        <span class="s4-mono s4-text-green">-{{ formatVND(orderDiscount) }}</span>
      </div>
      <div class="s4-pricing__row s4-pricing__row--total">
        <span>Tổng thanh toán:</span>
        <span class="s4-pricing__grand">{{ formatVND(grandTotal) }}</span>
      </div>
    </div>

    <!-- CTA -->
    <button class="s4-submit-btn" @click="$emit('open-details')">
      <Eye :size="16" :stroke-width="2.5" />
      <span>Xem & Chốt đơn</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { User, MapPin, CreditCard, Truck, ShoppingBag, Eye } from 'lucide-vue-next';
import type { CustomerInfo, CartItem, POSBranch } from '../types';
import { formatVND, PAYMENT_METHODS } from '../types';

const props = defineProps<{
  customer: CustomerInfo;
  cartItems: CartItem[];
  branch: POSBranch | null;
  selectedPaymentMethod: string;
  deliveryAddress?: string;
  totalBeforeDiscount: number;
  orderDiscount: number;
  grandTotal: number;
}>();

defineEmits<{
  'open-details': [];
}>();

const paymentLabel = computed(() => {
  const m = PAYMENT_METHODS.find(p => p.value === props.selectedPaymentMethod);
  return m ? `${m.icon} ${m.label}` : 'Chưa chọn';
});
</script>

<style scoped>
.s4-review {
  padding-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ─── Summary Grid ─── */
.s4-summary-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.s4-summary-card {
  display: flex;
  gap: 10px;
  padding: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
}
.s4-summary-card--full { grid-column: span 2; }
.s4-summary-card__icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #fff;
}
.s4-summary-card__icon--blue { background: #0068FF; }
.s4-summary-card__icon--indigo { background: #6366f1; }
.s4-summary-card__icon--green { background: #10b981; }
.s4-summary-card__icon--sky { background: #0ea5e9; }

.s4-summary-card__body {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.s4-summary-card__label {
  font-size: 9px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #94a3b8;
}
.s4-summary-card__value {
  font-size: 12.5px;
  font-weight: 700;
  color: #1e293b;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.s4-summary-card__sub {
  font-size: 10px;
  color: #0068FF;
  font-weight: 600;
}

/* ─── Products ─── */
.s4-products {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
}
.s4-products__header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  font-size: 11px;
  font-weight: 700;
  color: #475569;
}
.s4-products__list {
  max-height: 200px;
  overflow-y: auto;
}
.s4-products__list::-webkit-scrollbar { width: 3px; }
.s4-products__list::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 2px; }

.s4-products__row {
  display: flex;
  align-items: center;
  padding: 7px 12px;
  gap: 8px;
  border-bottom: 1px solid #fafbfc;
  font-size: 11.5px;
}
.s4-products__name {
  flex: 1;
  font-weight: 600;
  color: #1e293b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.s4-products__gift { font-size: 10px; }
.s4-products__qty {
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
  font-family: monospace;
}
.s4-products__price {
  font-weight: 700;
  color: #475569;
  min-width: 80px;
  text-align: right;
}

/* ─── Pricing ─── */
.s4-pricing {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 12px;
}
.s4-pricing__row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #64748b;
  margin-bottom: 6px;
}
.s4-pricing__row--discount { color: #10b981; }
.s4-pricing__row--total {
  padding-top: 10px;
  margin-top: 6px;
  margin-bottom: 0;
  border-top: 1.5px solid #e2e8f0;
  font-size: 14px;
  font-weight: 800;
  color: #1e293b;
}
.s4-pricing__grand {
  font-family: monospace;
  font-size: 18px;
  font-weight: 800;
  color: #0068FF;
}

/* ─── Submit Button ─── */
.s4-submit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px 24px;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg, #0068FF, #3b82f6);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 4px 14px rgba(0, 104, 255, 0.25);
}
.s4-submit-btn:hover {
  background: linear-gradient(135deg, #0055d4, #2563eb);
  box-shadow: 0 6px 20px rgba(0, 104, 255, 0.35);
  transform: translateY(-2px);
}

/* ─── Utility ─── */
.s4-mono { font-family: monospace; }
.s4-text-bold { font-weight: 700; color: #475569; }
.s4-text-green { color: #10b981; font-weight: 700; }
</style>
