<template>
  <teleport to="body">
    <div v-if="isOpen" class="ob-success-overlay" @click.self="$emit('close')">
      <div class="ob-success-card">
        <!-- Header Ribbon -->
        <div class="ob-success__header">
          <button class="ob-success__close" @click="$emit('close')">
            <X :size="16" />
          </button>
          <div class="ob-success__icon-ring">
            <CheckCircle2 :size="40" class="ob-text-green" />
          </div>
          <h2>LÊN ĐƠN THÀNH CÔNG!</h2>
          <p>Đơn hàng đã được ghi nhận trên ZaloCRM & đồng bộ lên POS</p>
        </div>

        <!-- Body -->
        <div class="ob-success__body">
          <!-- Order Code -->
          <div class="ob-success__code-strip">
            <div>
              <p class="ob-success__code-label">MÃ ĐƠN HÀNG POS</p>
              <p class="ob-success__code-value">{{ orderCode }}</p>
            </div>
            <button class="ob-success__copy-btn" @click="handleCopyCode">
              <Check v-if="copied" :size="14" class="ob-text-green" />
              <Copy v-else :size="14" />
              <span>{{ copied ? 'Đã chép' : 'Copy mã' }}</span>
            </button>
          </div>

          <!-- Summary Grid -->
          <div class="ob-success__grid">
            <div>
              <p class="ob-label">Khách hàng:</p>
              <p class="ob-value">{{ customerName }}</p>
            </div>
            <div>
              <p class="ob-label">POS ID:</p>
              <p class="ob-value ob-text-blue">{{ posCustomerCode || '—' }}</p>
            </div>
            <div>
              <p class="ob-label">Sản phẩm:</p>
              <p class="ob-value">{{ totalItems }} món</p>
            </div>
            <div>
              <p class="ob-label">Thanh toán:</p>
              <p class="ob-value">{{ paymentLabel }}</p>
            </div>
          </div>

          <!-- Sync Status -->
          <div class="ob-success__sync">
            <ShieldCheck :size="16" class="ob-text-green" />
            <span>Giao dịch an toàn và chống trùng lặp POS thành công.</span>
          </div>
        </div>

        <!-- Footer -->
        <div class="ob-success__footer">
          <button class="ob-success__action" @click="$emit('close')">
            Đóng & Tạo đơn hàng mới
          </button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { X, CheckCircle2, Copy, Check, ShieldCheck } from 'lucide-vue-next';
import { PAYMENT_METHODS } from './types';

const props = defineProps<{
  isOpen: boolean;
  orderCode: string;
  customerName: string;
  posCustomerCode?: string;
  totalItems: number;
  finalTotal: number;
  paymentMethod: string;
}>();

defineEmits<{
  'close': [];
}>();

const copied = ref(false);

const paymentLabel = computed(() => {
  const m = PAYMENT_METHODS.find(p => p.value === props.paymentMethod);
  return m ? m.label : props.paymentMethod;
});

function handleCopyCode() {
  navigator.clipboard.writeText(props.orderCode);
  copied.value = true;
  setTimeout(() => { copied.value = false; }, 2000);
}
</script>

<style scoped>
.ob-success-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(15,23,42,0.6);
  backdrop-filter: blur(4px);
}

.ob-success-card {
  background: #fff;
  border-radius: 24px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.15);
  max-width: 480px;
  width: 100%;
  overflow: hidden;
  border: 1px solid #f1f5f9;
  display: flex;
  flex-direction: column;
  max-height: 90vh;
}

/* Header */
.ob-success__header {
  background: #10b981;
  color: #fff;
  padding: 32px 24px;
  text-align: center;
  position: relative;
}
.ob-success__close {
  position: absolute;
  right: 16px;
  top: 16px;
  color: rgba(255,255,255,0.8);
  background: rgba(255,255,255,0.1);
  border: none;
  border-radius: 50%;
  padding: 6px;
  cursor: pointer;
  transition: all 0.15s;
}
.ob-success__close:hover {
  background: rgba(255,255,255,0.2);
  color: #fff;
}
.ob-success__icon-ring {
  width: 64px;
  height: 64px;
  background: #fff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 12px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}
.ob-success__header h2 {
  font-size: 18px;
  font-weight: 800;
  letter-spacing: -0.02em;
  margin: 0;
}
.ob-success__header p {
  font-size: 12px;
  color: rgba(255,255,255,0.8);
  margin: 4px 0 0;
  font-weight: 500;
}

/* Body */
.ob-success__body {
  padding: 24px;
  overflow-y: auto;
  flex: 1;
}
.ob-success__code-strip {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.ob-success__code-label {
  font-size: 10px;
  color: #94a3b8;
  font-weight: 700;
  text-transform: uppercase;
  margin: 0;
}
.ob-success__code-value {
  font-size: 16px;
  font-weight: 700;
  font-family: monospace;
  color: #1e293b;
  margin: 4px 0 0;
}
.ob-success__copy-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
  transition: all 0.15s;
}
.ob-success__copy-btn:hover {
  background: #f8fafc;
}
.ob-success__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  background: #f8fafc;
  border-radius: 12px;
  padding: 12px;
  border: 1px solid #f1f5f9;
  margin-bottom: 16px;
}
.ob-success__sync {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #64748b;
  font-weight: 500;
}

/* Footer */
.ob-success__footer {
  padding: 24px;
  background: #f8fafc;
  border-top: 1px solid #f1f5f9;
}
.ob-success__action {
  width: 100%;
  background: #0068FF;
  color: #fff;
  border: none;
  padding: 14px;
  border-radius: 12px;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
  box-shadow: 0 4px 12px rgba(0,104,255,0.15);
}
.ob-success__action:hover {
  background: #0055d4;
  box-shadow: 0 6px 16px rgba(0,104,255,0.25);
}

/* Utility */
.ob-text-blue { color: #0068FF; }
.ob-text-green { color: #10b981; }
.ob-label {
  font-size: 12px;
  color: #94a3b8;
  font-weight: 600;
  margin: 0;
}
.ob-value {
  font-size: 13px;
  font-weight: 700;
  color: #1e293b;
  margin: 2px 0 0;
}
</style>
