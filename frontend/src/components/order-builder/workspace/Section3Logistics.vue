<template>
  <div class="s3-logistics">
    <!-- Chi nhánh -->
    <div class="s3-field">
      <div class="s3-field__icon s3-field__icon--blue">
        <MapPin :size="14" />
      </div>
      <div class="s3-field__body">
        <label class="s3-field__label">Chi nhánh xuất hàng</label>
        <select
          class="s3-field__select"
          :value="selectedBranchId || ''"
          @change="$emit('select-branch', Number(($event.target as HTMLSelectElement).value))"
        >
          <option value="" disabled>-- Chọn chi nhánh --</option>
          <option v-for="b in branches" :key="b.id" :value="b.id">{{ b.name }}</option>
        </select>
      </div>
    </div>

    <div class="s3-divider" />

    <!-- Địa chỉ đến -->
    <div class="s3-field">
      <div class="s3-field__icon s3-field__icon--sky">
        <MapPin :size="14" />
      </div>
      <div class="s3-field__body">
        <div class="s3-field__label-row">
          <label class="s3-field__label">Địa chỉ giao hàng</label>
          <span class="s3-api-badge">Chưa setup API</span>
        </div>
        <input
          type="text"
          class="s3-field__input"
          :value="deliveryAddress || '123 Đường Lê Lợi, Quận 1, TP.HCM'"
          placeholder="Nhập địa chỉ đến..."
          @input="$emit('update-delivery-address', ($event.target as HTMLInputElement).value)"
        />
      </div>
    </div>

    <div class="s3-divider" />

    <!-- Thanh toán -->
    <div class="s3-field">
      <div class="s3-field__icon s3-field__icon--green">
        <CreditCard :size="14" />
      </div>
      <div class="s3-field__body">
        <label class="s3-field__label">Phương thức thanh toán</label>
        <div class="s3-payment-grid">
          <button
            v-for="m in PAYMENT_METHODS"
            :key="m.value"
            class="s3-payment-option"
            :class="{ 's3-payment-option--active': selectedPaymentMethod === m.value }"
            @click="$emit('select-payment', m.value)"
          >
            <span class="s3-payment-option__icon">{{ m.icon }}</span>
            <span class="s3-payment-option__label">{{ m.label }}</span>
            <span class="s3-payment-option__desc">{{ m.description }}</span>
          </button>
        </div>
      </div>
    </div>

    <div class="s3-divider" />

    <!-- Trạng thái đơn -->
    <div class="s3-field">
      <div class="s3-field__icon s3-field__icon--purple">
        <Sparkles :size="14" />
      </div>
      <div class="s3-field__body">
        <label class="s3-field__label">Trạng thái đơn hàng</label>
        <select
          class="s3-field__select"
          :value="selectedOrderStatus ?? 1"
          @change="$emit('select-order-status', Number(($event.target as HTMLSelectElement).value))"
        >
          <option v-for="s in ORDER_STATUSES" :key="s.value" :value="s.value">{{ s.label }}</option>
        </select>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { MapPin, CreditCard, Sparkles } from 'lucide-vue-next';
import type { POSBranch } from '../types';
import { PAYMENT_METHODS, ORDER_STATUSES } from '../types';

defineProps<{
  branches: POSBranch[];
  selectedBranchId?: number | null;
  selectedPaymentMethod: string;
  selectedOrderStatus?: number;
  deliveryAddress?: string;
}>();

defineEmits<{
  'select-branch': [branchId: number];
  'select-payment': [method: string];
  'select-order-status': [status: number];
  'update-delivery-address': [address: string];
}>();
</script>

<style scoped>
.s3-logistics {
  padding-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* ─── Field ─── */
.s3-field {
  display: flex;
  gap: 12px;
  padding: 12px 0;
}
.s3-field__icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #fff;
}
.s3-field__icon--blue { background: #0068FF; }
.s3-field__icon--sky { background: #e0f2fe; color: #0284c7; }
.s3-field__icon--green { background: #10b981; }
.s3-field__icon--purple { background: #f1f5f9; color: #6366f1; }

.s3-field__body {
  flex: 1;
  min-width: 0;
}
.s3-field__label-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.s3-field__label {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
  display: block;
  margin-bottom: 6px;
}
.s3-field__label-row .s3-field__label {
  margin-bottom: 0;
}
.s3-field__select {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
  background: #fff;
  outline: none;
  cursor: pointer;
  transition: border-color 0.15s;
  appearance: auto;
}
.s3-field__select:focus { border-color: #0068FF; }

.s3-field__input {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
  color: #1e293b;
  background: #fff;
  outline: none;
  transition: border-color 0.15s;
  box-sizing: border-box;
}
.s3-field__input:focus { border-color: #0068FF; }

/* ─── API Badge ─── */
.s3-api-badge {
  font-size: 9px;
  font-weight: 700;
  color: #f59e0b;
  background: #fefce8;
  padding: 2px 8px;
  border-radius: 20px;
  border: 1px solid #fde68a;
}

/* ─── Payment Grid ─── */
.s3-payment-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.s3-payment-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border: 1.5px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
  cursor: pointer;
  transition: all 0.18s;
  text-align: left;
  font-family: inherit;
}
.s3-payment-option:hover {
  border-color: #0068FF;
  background: #f0f9ff;
}
.s3-payment-option--active {
  border-color: #0068FF;
  background: #eff6ff;
  box-shadow: 0 0 0 3px rgba(0, 104, 255, 0.08);
}
.s3-payment-option__icon {
  font-size: 20px;
  flex-shrink: 0;
}
.s3-payment-option__label {
  font-size: 13px;
  font-weight: 700;
  color: #1e293b;
  white-space: nowrap;
}
.s3-payment-option__desc {
  font-size: 11px;
  color: #94a3b8;
  margin-left: auto;
}

/* ─── Divider ─── */
.s3-divider {
  height: 1px;
  background: #f1f5f9;
}
</style>
