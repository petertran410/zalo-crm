<template>
  <div class="s1-customer">
    <!-- Customer Info Card -->
    <div class="s1-card">
      <div class="s1-card__main">
        <!-- Avatar -->
        <div class="s1-avatar">
          <span class="s1-avatar__letter">{{ (customer.name || '?')[0] }}</span>
        </div>

        <!-- Info -->
        <div class="s1-info">
          <h4 class="s1-info__name">{{ customer.name }}</h4>
          <div class="s1-info__details">
            <span v-if="customer.phone" class="s1-info__chip s1-info__chip--phone">
              📞 {{ customer.phone }}
            </span>
            <span v-if="customer.posCustomerCode" class="s1-info__chip s1-info__chip--pos">
              🏷️ {{ customer.posCustomerCode }}
            </span>
          </div>
          <p v-if="customer.address" class="s1-info__address">
            📍 {{ customer.address }}
          </p>
        </div>
      </div>

      <!-- Status indicator -->
      <div class="s1-status">
        <span class="s1-status__dot" />
        <span class="s1-status__text">Khách hàng đã liên kết POS</span>
      </div>
    </div>

    <!-- Logistics & Payment Settings -->
    <div class="s1-logistics-box">
      <!-- Người lên đơn -->
      <div class="s1-field">
        <div class="s1-field__icon s1-field__icon--purple">
          <UserCheck :size="14" />
        </div>
        <div class="s1-field__body">
          <label class="s1-field__label">Người lên đơn</label>
          <div class="s1-creator-box">
            <span class="s1-creator-name">{{ creatorName || 'Nhân viên POS' }}</span>
            <span class="s1-creator-tag">Đang đăng nhập</span>
          </div>
        </div>
      </div>

      <!-- Chi nhánh -->
      <div class="s1-field">
        <div class="s1-field__icon s1-field__icon--blue">
          <MapPin :size="14" />
        </div>
        <div class="s1-field__body">
          <label class="s1-field__label">Chi nhánh</label>
          <select
            class="s1-field__select"
            :value="selectedBranchId || ''"
            @change="$emit('select-branch', Number(($event.target as HTMLSelectElement).value))"
          >
            <option value="" disabled>-- Chọn chi nhánh --</option>
            <option v-for="b in branches" :key="b.id" :value="b.id">{{ b.name }}</option>
          </select>
        </div>
      </div>

      <!-- Địa chỉ giao hàng -->
      <div class="s1-field">
        <div class="s1-field__icon s1-field__icon--sky">
          <Truck :size="14" />
        </div>
        <div class="s1-field__body">
          <div class="s1-field__label-row">
            <label class="s1-field__label">Địa chỉ giao hàng</label>
          </div>
          <input
            type="text"
            list="address-list"
            class="s1-field__input"
            :value="deliveryAddress ?? customer.address ?? ''"
            placeholder="Nhập địa chỉ giao hàng..."
            @input="$emit('update-delivery-address', ($event.target as HTMLInputElement).value)"
          />
          <datalist id="address-list">
            <option v-if="customer.address" :value="customer.address"></option>
            <option v-for="addr in customer.secondaryAddresses" :key="addr" :value="addr"></option>
          </datalist>
        </div>
      </div>

      <!-- Kích thước & Trọng lượng giao hàng -->
      <div class="s1-field">
        <div class="s1-field__icon s1-field__icon--orange">
          <Box :size="14" />
        </div>
        <div class="s1-field__body">
          <label class="s1-field__label">Kích thước & Trọng lượng gói hàng</label>
          <div class="s1-package-grid">
            <input
              type="number"
              class="s1-field__input s1-package-input"
              placeholder="Dài (cm)"
              :value="packageLength || ''"
              @input="$emit('update-package-metrics', { length: Number(($event.target as HTMLInputElement).value) || undefined, width: packageWidth, height: packageHeight, weight: packageWeight })"
            />
            <input
              type="number"
              class="s1-field__input s1-package-input"
              placeholder="Rộng (cm)"
              :value="packageWidth || ''"
              @input="$emit('update-package-metrics', { length: packageLength, width: Number(($event.target as HTMLInputElement).value) || undefined, height: packageHeight, weight: packageWeight })"
            />
            <input
              type="number"
              class="s1-field__input s1-package-input"
              placeholder="Cao (cm)"
              :value="packageHeight || ''"
              @input="$emit('update-package-metrics', { length: packageLength, width: packageWidth, height: Number(($event.target as HTMLInputElement).value) || undefined, weight: packageWeight })"
            />
            <input
              type="number"
              class="s1-field__input s1-package-input"
              placeholder="TL (gram)"
              :value="packageWeight || ''"
              @input="$emit('update-package-metrics', { length: packageLength, width: packageWidth, height: packageHeight, weight: Number(($event.target as HTMLInputElement).value) || undefined })"
            />
          </div>
        </div>
      </div>

      <!-- Phương thức thanh toán -->
      <div class="s1-field">
        <div class="s1-field__icon s1-field__icon--green">
          <CreditCard :size="14" />
        </div>
        <div class="s1-field__body">
          <label class="s1-field__label">Phương thức thanh toán</label>
          <div class="s1-payment-grid">
            <button
              v-for="m in PAYMENT_METHODS"
              :key="m.value"
              class="s1-payment-option"
              :class="{ 's1-payment-option--active': selectedPaymentMethod === m.value }"
              @click="$emit('select-payment', m.value)"
            >
              <span class="s1-payment-option__icon">{{ m.icon }}</span>
              <span class="s1-payment-option__label">{{ m.label }}</span>
              <span class="s1-payment-option__desc">{{ m.description }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { MapPin, Truck, CreditCard, UserCheck, Box } from 'lucide-vue-next';
import type { CustomerInfo, POSBranch } from '../types';
import { PAYMENT_METHODS } from '../types';

defineProps<{
  customer: CustomerInfo;
  branches?: POSBranch[];
  selectedBranchId?: number | null;
  selectedPaymentMethod?: string;
  deliveryAddress?: string;
  creatorName?: string;
  packageLength?: number;
  packageWidth?: number;
  packageHeight?: number;
  packageWeight?: number;
}>();

defineEmits<{
  'select-branch': [branchId: number];
  'select-payment': [method: string];
  'update-delivery-address': [address: string];
  'update-package-metrics': [metrics: { length?: number; width?: number; height?: number; weight?: number }];
}>();
</script>

<style scoped>
.s1-customer {
  padding-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ─── Card ─── */
.s1-card {
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.s1-card__main {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}

/* ─── Avatar ─── */
.s1-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: linear-gradient(135deg, #0068FF, #3b82f6);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 3px 10px rgba(0, 104, 255, 0.25);
}
.s1-avatar__letter {
  font-size: 20px;
  font-weight: 800;
  color: #fff;
  text-transform: uppercase;
}

/* ─── Info ─── */
.s1-info {
  flex: 1;
  min-width: 0;
}
.s1-info__name {
  font-size: 16px;
  font-weight: 800;
  color: #1e293b;
  margin: 0 0 6px;
  line-height: 1.3;
}
.s1-info__details {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 4px;
}
.s1-info__chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11.5px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 20px;
  white-space: nowrap;
}
.s1-info__chip--phone {
  background: #eff6ff;
  color: #1d4ed8;
  border: 1px solid #bfdbfe;
}
.s1-info__chip--pos {
  background: #f0fdf4;
  color: #15803d;
  border: 1px solid #bbf7d0;
}
.s1-info__address {
  font-size: 12px;
  color: #64748b;
  margin: 4px 0 0;
  line-height: 1.5;
}

/* ─── Status ─── */
.s1-status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-top: 10px;
  border-top: 1px solid #e2e8f0;
}
.s1-status__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #22c55e;
  flex-shrink: 0;
  box-shadow: 0 0 6px rgba(34, 197, 94, 0.4);
}
.s1-status__text {
  font-size: 11px;
  font-weight: 600;
  color: #16a34a;
}

/* ─── Logistics Box ─── */
.s1-logistics-box {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.s1-package-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-top: 4px;
}
.s1-package-input {
  text-align: center;
  padding: 6px 8px;
}

.s1-field {
  display: flex;
  gap: 12px;
}
.s1-field__icon {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #fff;
}
.s1-field__icon--blue { background: #0068FF; }
.s1-field__icon--sky { background: #0ea5e9; }
.s1-field__icon--green { background: #10b981; }
.s1-field__icon--purple { background: #8b5cf6; }

.s1-field__body {
  flex: 1;
  min-width: 0;
}
.s1-field__label-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.s1-field__label {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
  display: block;
  margin-bottom: 4px;
}

/* ─── Creator Box ─── */
.s1-creator-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
}
.s1-creator-name {
  font-size: 13px;
  font-weight: 700;
  color: #1e293b;
}
.s1-creator-tag {
  font-size: 10px;
  font-weight: 700;
  color: #6d28d9;
  background: #f3e8ff;
  padding: 2px 8px;
  border-radius: 12px;
  border: 1px solid #ddd6fe;
}

.s1-field__select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
  background: #fff;
  outline: none;
  cursor: pointer;
  transition: border-color 0.15s;
}
.s1-field__select:focus { border-color: #0068FF; }

.s1-field__input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: #1e293b;
  background: #fff;
  outline: none;
  transition: border-color 0.15s;
  box-sizing: border-box;
}
.s1-field__input:focus { border-color: #0068FF; }

/* ─── Card ─── */
.s1-card {
  background: #ffffff;
  border: 1px solid #f1f5f9;
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ─── Payment Grid ─── */
.s1-payment-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 8px;
  margin-top: 4px;
}
.s1-payment-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid #EAEAEA;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
  text-align: left;
  font-family: inherit;
}
.s1-payment-option:hover {
  border-color: #0068FF;
  background: #f0f9ff;
}
.s1-payment-option:active {
  transform: scale(0.98);
}
.s1-payment-option--active {
  border-color: #0068FF;
  background: #E1F3FE;
  color: #1F6C9F;
  box-shadow: 0 0 0 2px rgba(0, 104, 255, 0.1);
}
.s1-payment-option__icon {
  font-size: 16px;
  flex-shrink: 0;
}
.s1-payment-option__label {
  font-size: 12px;
  font-weight: 700;
  color: #1e293b;
  white-space: nowrap;
}
.s1-payment-option__desc {
  font-size: 10px;
  color: #94a3b8;
  margin-left: auto;
}
</style>
