<template>
  <div class="s3rc-container">
    <!-- 70% / 30% Split Layout -->
    <div class="s3rc-layout">
      <!-- ═══ CỘT TRÁI (70%): HÓA ĐƠN A4 BẢN CHUẨN (EMBEDDED OFFICIAL INVOICE TEMPLATE) ═══ -->
      <div class="s3rc-left-col">
        <!-- Official Paper Invoice Template Embedded -->
        <div class="s3rc-invoice-embed">
          <InvoiceTemplateModal
            :customer="customer"
            :cart-items="cartItems"
            :branch="branch"
            :ticket-number="'Phiếu tạm'"
            :total-before-discount="totalBeforeDiscount"
            :order-discount="orderDiscount"
            :paid-amount="0"
            :grand-total="grandTotal"
            :price-book-id="priceBookId"
            :description="billNote"
            :delivery-address="deliveryAddress"
            :creator-name="creatorName"
          />
        </div>
      </div>

      <!-- ═══ CỘT PHẢI (30%): GHI CHÚ & CHỐT ĐƠN ═══ -->
      <div class="s3rc-right-col">
        <!-- GHI CHÚ IN TRÊN BILL -->
        <div class="s3rc-panel">
          <div class="s3rc-panel__header">
            <FileText :size="15" class="s3rc-icon-blue" />
            <span>GHI CHÚ IN TRÊN BILL</span>
          </div>
          <textarea
            class="s3rc-textarea"
            rows="3"
            :value="billNote || ''"
            placeholder="Nhập ghi chú in trực tiếp ra hóa đơn gửi cho khách..."
            @input="$emit('update-bill-note', ($event.target as HTMLTextAreaElement).value)"
          ></textarea>
        </div>

        <!-- TỔNG THÀNH TOÁN -->
        <div class="s3rc-panel s3rc-total-panel">
          <div class="s3rc-panel__header">
            <CreditCard :size="15" class="s3rc-icon-green" />
            <span>TỔNG THÀNH TOÁN</span>
          </div>
          <div class="s3rc-total-box">
            <div class="s3rc-total-val">{{ formatVND(grandTotal) }}</div>
            <div v-if="orderDiscount > 0" class="s3rc-total-sub">
              (Đã giảm {{ formatVND(orderDiscount) }})
            </div>
          </div>
        </div>

        <!-- NÚT BẤM CHÍNH: XÁC NHẬN & LÊN ĐƠN (ZALOCRM) -->
        <button
          class="s3rc-submit-btn"
          :disabled="submitting || cartItems.length === 0"
          @click="$emit('submit-order')"
        >
          <CheckCircle2 v-if="!submitting" :size="17" :stroke-width="2.2" />
          <span v-if="submitting">Đang lên đơn...</span>
          <span v-else>XÁC NHẬN & LÊN ĐƠN (ZALOCRM)</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { FileText, CreditCard, CheckCircle2 } from 'lucide-vue-next';
import type { CustomerInfo, CartItem, POSBranch } from '../types';
import { formatVND } from '../types';
import InvoiceTemplateModal from '../InvoiceTemplateModal.vue';

defineProps<{
  customer: CustomerInfo;
  cartItems: CartItem[];
  branch: POSBranch | null;
  selectedPaymentMethod: string;
  deliveryAddress?: string;
  priceBookId?: string;
  totalBeforeDiscount: number;
  orderDiscount: number;
  grandTotal: number;
  billNote?: string;
  shippingNote?: string;
  creatorName?: string;
  submitting?: boolean;
}>();

defineEmits<{
  'jump-to-section': [section: string];
  'update-bill-note': [note: string];
  'update-shipping-note': [note: string];
  'submit-order': [];
}>();
</script>

<style scoped>
.s3rc-container {
  padding-top: 12px;
}

/* ─── Responsive Split Layout ─── */
.s3rc-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 16px;
  align-items: start;
}

@media (max-width: 900px) {
  .s3rc-layout {
    grid-template-columns: 1fr;
  }
}

/* ─── CỘT TRÁI (70%): HÓA ĐƠN A4 BẢN CHUẨN ─── */
.s3rc-left-col {
  min-width: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.s3rc-invoice-embed {
  width: 100%;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.06);
}

/* ─── CỘT PHẢI (30%): GHI CHÚ & CHỐT ĐƠN ─── */
.s3rc-right-col {
  display: flex;
  flex-direction: column;
  gap: 14px;
  position: sticky;
  top: 12px;
  align-self: start;
}

.s3rc-panel {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 14px;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
}

.s3rc-panel__header {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 11px;
  font-weight: 800;
  color: #475569;
  letter-spacing: 0.04em;
  margin-bottom: 8px;
}

.s3rc-icon-blue { color: #0068FF; }
.s3rc-icon-amber { color: #d97706; }
.s3rc-icon-green { color: #10b981; }

.s3rc-textarea {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 12.5px;
  font-family: inherit;
  color: #1e293b;
  outline: none;
  resize: vertical;
  transition: border-color 0.15s, box-shadow 0.15s;
  box-sizing: border-box;
}
.s3rc-textarea:focus {
  border-color: #0068FF;
  box-shadow: 0 0 0 3px rgba(0, 104, 255, 0.08);
}

/* Total Panel */
.s3rc-total-panel {
  background: #EDF3EC;
  border: 1px solid #D1E7DD;
}

.s3rc-total-box {
  margin-top: 4px;
}

.s3rc-total-val {
  font-size: 24px;
  font-weight: 900;
  color: #346538;
  font-family: 'Geist Mono', 'SF Mono', 'JetBrains Mono', ui-monospace, monospace;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
  letter-spacing: -0.02em;
}

.s3rc-total-sub {
  font-size: 11.5px;
  font-weight: 700;
  color: #346538;
  margin-top: 4px;
  font-variant-numeric: tabular-nums;
}

/* Submit Button */
.s3rc-submit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 13px 16px;
  border: none;
  border-radius: 10px;
  background: #0068FF;
  color: #ffffff;
  font-size: 13.5px;
  font-weight: 800;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 4px 14px rgba(0, 104, 255, 0.25);
}

.s3rc-submit-btn:hover:not(:disabled) {
  background: #0056d2;
  box-shadow: 0 6px 18px rgba(0, 104, 255, 0.35);
  transform: translateY(-1px);
}

.s3rc-submit-btn:active:not(:disabled) {
  transform: scale(0.98);
  box-shadow: 0 2px 8px rgba(0, 104, 255, 0.2);
}

.s3rc-submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}
</style>
