<template>
  <div class="ob-invoice-preview-container" @dblclick="printDirectly">
    <!-- Action Toolbar -->
    <div class="ob-invoice-toolbar" @dblclick.stop>
      <div class="ob-invoice-toolbar__left">
        <Printer :size="15" class="ob-text-blue" />
        <span class="ob-invoice-toolbar__title">Xem trước Hóa Đơn</span>
        <span class="ob-invoice-toolbar__hint">(Khổ giấy A4 chuẩn)</span>
      </div>
      <div class="ob-invoice-toolbar__right">
        <button class="ob-inv-btn ob-inv-btn--print" title="In trực tiếp Hóa Đơn hoặc Xuất PDF" @click="printDirectly">
          <Printer :size="13" />
          <span>In / Xuất PDF</span>
        </button>
      </div>
    </div>

    <!-- Paper Invoice Sheet -->
    <div class="ob-invoice-paper" id="ob-printable-invoice">
      <!-- Top Header -->
      <div class="ob-invoice__header">
        <div class="ob-invoice__brand">
          <div class="ob-invoice__brand-info">
            <p v-if="branch?.name" class="ob-invoice__branch-name">Chi nhánh: {{ branch.name }}</p>
            <p v-if="branch?.address" class="ob-invoice__branch-address">ĐC: {{ branch.address }}</p>
          </div>
        </div>

        <div class="ob-invoice__title-box">
          <h1 class="ob-invoice__title">HOÁ ĐƠN BÁN HÀNG</h1>
        </div>

        <div class="ob-invoice__meta-box">
          <table class="ob-invoice__meta-table">
            <tbody>
              <tr>
                <td class="ob-meta-lbl">Số:</td>
                <td class="ob-meta-val ob-text-bold">Phiếu tạm</td>
              </tr>
              <tr>
                <td class="ob-meta-lbl">Ngày:</td>
                <td class="ob-meta-val">{{ currentDateFormatted }}</td>
              </tr>
              <tr v-if="creatorName">
                <td class="ob-meta-lbl">NV tạo:</td>
                <td class="ob-meta-val">{{ creatorName }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Customer Info Box -->
      <div class="ob-invoice__customer-box">
        <div class="ob-invoice__info-row">
          <span class="ob-invoice__info-label">Tên Khách Hàng:</span>
          <span class="ob-invoice__info-value ob-text-bold">{{ customer.name }}</span>
        </div>
        <div class="ob-invoice__info-row">
          <span class="ob-invoice__info-label">Số Điện Thoại:</span>
          <span class="ob-invoice__info-value ob-mono">{{ customer.phone || '—' }}</span>
          <span v-if="customer.posCustomerCode" class="ob-invoice__info-code">(Mã POS: {{ customer.posCustomerCode }})</span>
        </div>
        <div class="ob-invoice__info-row">
          <span class="ob-invoice__info-label">Địa Chỉ:</span>
          <span class="ob-invoice__info-value">{{ deliveryAddress || customer.address || '123 Đường Lê Lợi, Quận 1, TP.HCM' }}</span>
        </div>
      </div>

      <!-- Items Table -->
      <div class="ob-invoice__table-wrap">
        <table class="ob-invoice__table">
          <thead>
            <tr>
              <th style="width: 40px; text-align: center;">STT</th>
              <th style="text-align: left;">Tên Sản Phẩm</th>
              <th style="width: 80px; text-align: center;">Đơn Vị Tính</th>
              <th style="width: 65px; text-align: center;">Số Lượng</th>
              <th style="width: 105px; text-align: right;">Đơn Giá</th>
              <th style="width: 115px; text-align: right;">Thành Tiền</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, idx) in cartItems" :key="idx">
              <td style="text-align: center;">{{ idx + 1 }}</td>
              <td>
                <div class="ob-inv-item-name">{{ item.product.name }}</div>
                <div v-if="item.note" class="ob-inv-item-note">📝 Ghi chú: {{ item.note }}</div>
                <div v-if="item.discount" class="ob-inv-item-discount">CK: -{{ formatVND(item.discount) }}</div>
              </td>
              <td style="text-align: center;">{{ item.product.unit || 'Cái' }}</td>
              <td style="text-align: center;" class="ob-mono">{{ item.quantity }}</td>
              <td style="text-align: right;" class="ob-mono">
                {{ formatVND(getEffectiveProductPrice(item.product.basePrice, priceBookId)) }}
              </td>
              <td style="text-align: right;" class="ob-mono ob-text-bold">
                {{ formatVND(Math.max(0, getEffectiveProductPrice(item.product.basePrice, priceBookId) * item.quantity - (item.discount || 0))) }}
              </td>
            </tr>

            <!-- Minimum 6 empty rows for realistic paper invoice look -->
            <tr v-for="n in emptyRowsCount" :key="'empty-' + n" class="ob-invoice__empty-row">
              <td>&nbsp;</td>
              <td>&nbsp;</td>
              <td>&nbsp;</td>
              <td>&nbsp;</td>
              <td>&nbsp;</td>
              <td>&nbsp;</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td colspan="5" class="ob-inv-total-label">TỔNG CỘNG (CHƯA VAT):</td>
              <td class="ob-inv-total-val ob-mono">{{ formatVND(totalBeforeDiscount) }}</td>
            </tr>
            <tr v-if="orderDiscount > 0">
              <td colspan="5" class="ob-inv-total-label">GIẢM GIÁ ĐƠN HÀNG:</td>
              <td class="ob-inv-total-val ob-mono ob-text-red">-{{ formatVND(orderDiscount) }}</td>
            </tr>
            <tr v-if="paidAmount > 0">
              <td colspan="5" class="ob-inv-total-label">ĐÃ CỌC:</td>
              <td class="ob-inv-total-val ob-mono">{{ formatVND(paidAmount) }}</td>
            </tr>
            <tr>
              <td colspan="5" class="ob-inv-total-label ob-text-bold">CÒN LẠI:</td>
              <td class="ob-inv-total-val ob-mono ob-text-bold ob-text-blue-dark">
                {{ formatVND(Math.max(0, grandTotal - paidAmount)) }}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- Notes / Terms -->
      <div class="ob-invoice__notes">
        <div class="ob-invoice__notes-header">
          <span class="ob-invoice__notes-title">**Ghi chú:&nbsp;</span>
          <span v-if="description && description.trim()" class="ob-invoice__note-text">{{ description }}</span>
          <span class="ob-typing-cursor">|</span>
        </div>
        <ul class="ob-invoice__notes-list">
          <li>Thời gian giao hàng dự kiến: 1 - 3 ngày kể từ ngày đặt hàng.</li>
          <li>Giá trên đã áp dụng ưu đãi chiết khấu, chưa bao gồm thuế giá trị gia tăng VAT (10%).</li>
          <li>Quý khách vui lòng kiểm tra kỹ hàng hóa trước khi ký nhận.</li>
        </ul>
      </div>

      <!-- Signature Blocks -->
      <div class="ob-invoice__signatures">
        <div class="ob-invoice__sig-col">
          <p class="ob-invoice__sig-title">Người lập phiếu</p>
          <span class="ob-invoice__sig-hint">(Ký, họ tên)</span>
        </div>
        <div class="ob-invoice__sig-col">
          <p class="ob-invoice__sig-title">Thủ kho</p>
          <span class="ob-invoice__sig-hint">(Ký, họ tên)</span>
        </div>
        <div class="ob-invoice__sig-col">
          <p class="ob-invoice__sig-title">Khách hàng</p>
          <span class="ob-invoice__sig-hint">(Ký, họ tên)</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Printer } from 'lucide-vue-next';
import type { CustomerInfo, CartItem, POSBranch } from './types';
import { formatVND, getEffectiveProductPrice } from './types';

const props = defineProps<{
  customer: CustomerInfo;
  cartItems: CartItem[];
  branch: POSBranch | null;
  ticketNumber?: string;
  totalBeforeDiscount: number;
  orderDiscount: number;
  paidAmount: number;
  grandTotal: number;
  priceBookId?: string;
  description?: string;
  deliveryAddress?: string;
  creatorName?: string;
}>();

defineEmits<{
  'update-description': [value: string];
}>();

const currentDateFormatted = computed(() => {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
});

const emptyRowsCount = computed(() => {
  const count = props.cartItems.length;
  return Math.max(0, 6 - count);
});

function printDirectly() {
  const elem = document.getElementById('ob-printable-invoice');
  if (!elem) {
    window.print();
    return;
  }

  let iframe = document.getElementById('ob-print-frame') as HTMLIFrameElement;
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = 'ob-print-frame';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Hóa Đơn Bán Hàng - ${props.customer.name}</title>
        <meta charset="utf-8" />
        <style>
          @page {
            size: A4 portrait;
            margin: 10mm 12mm;
          }
          * { box-sizing: border-box; }
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: #fff;
            margin: 0;
            padding: 0;
            color: #1e293b;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .ob-invoice-paper {
            width: 100%;
            max-width: 210mm;
            margin: 0 auto;
            padding: 16px 20px;
            background: #fff;
          }
          .ob-invoice__header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 14px;
            border-bottom: 2px solid #1e293b;
            padding-bottom: 10px;
          }
          .ob-invoice__brand-info {
            font-size: 11px;
            color: #475569;
          }
          .ob-invoice__branch-name, .ob-invoice__branch-address {
            font-size: 11px;
            color: #475569;
            margin: 2px 0 0;
          }
          .ob-invoice__title {
            font-size: 22px;
            font-weight: 900;
            color: #0f172a;
            letter-spacing: 0.05em;
            margin: 0;
            text-align: center;
          }
          .ob-invoice__meta-table {
            font-size: 11px;
            border-collapse: collapse;
          }
          .ob-invoice__meta-table td {
            padding: 4px 8px;
            border: 1px solid #475569;
          }
          .ob-meta-lbl {
            background: #f8fafc;
            font-weight: 600;
          }
          .ob-meta-val {
            font-family: monospace;
            font-weight: 700;
          }
          .ob-invoice__customer-box {
            border: 1px solid #475569;
            border-radius: 6px;
            padding: 10px 14px;
            margin-bottom: 14px;
            font-size: 12px;
            background: #fafafa;
          }
          .ob-invoice__info-row {
            margin-bottom: 4px;
            display: flex;
            gap: 8px;
          }
          .ob-invoice__info-label {
            font-weight: 700;
            width: 120px;
            display: inline-block;
          }
          .ob-invoice__table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 14px;
            font-size: 11px;
          }
          .ob-invoice__table th, .ob-invoice__table td {
            border: 1px solid #334155;
            padding: 6px 8px;
          }
          .ob-invoice__table th {
            background: #f1f5f9;
            font-weight: 700;
            text-transform: uppercase;
            font-size: 10px;
          }
          .ob-inv-item-name { font-weight: 600; }
          .ob-inv-item-discount { font-size: 9px; color: #ef4444; font-weight: 700; }
          .ob-inv-total-label { text-align: right; font-weight: 700; background: #f8fafc; }
          .ob-inv-total-val { text-align: right; font-weight: 700; font-family: monospace; }
          .ob-invoice__notes { font-size: 10px; color: #475569; margin-top: 14px; page-break-inside: avoid; }
          .ob-invoice__notes-header { margin-bottom: 4px; font-size: 11px; line-height: 1.5; word-break: break-word; }
          .ob-invoice__notes-title { font-weight: 800; color: #1e293b; }
          .ob-invoice__note-text { font-weight: 600; color: #1e293b; white-space: pre-wrap; word-break: break-word; }
          .ob-typing-cursor { display: none !important; }
          .ob-invoice__notes-list { margin: 0; padding-left: 16px; }
          .ob-invoice__signatures { display: flex; justify-content: space-between; margin-top: 32px; text-align: center; font-size: 11px; page-break-inside: avoid; }
          .ob-invoice__sig-col { flex: 1; }
          .ob-invoice__sig-title { font-weight: 700; margin: 0; }
          .ob-invoice__sig-hint { font-size: 9px; color: #94a3b8; font-style: italic; }
          .ob-text-bold { font-weight: 700; }
          .ob-mono {
  font-family: 'Geist Mono', 'SF Mono', 'JetBrains Mono', ui-monospace, monospace;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}
          .ob-text-red { color: #ef4444; }
          .ob-text-blue-dark { color: #1e3a8a; }
        </style>
      </head>
      <body>
        <div class="ob-invoice-paper">
          ${elem.innerHTML}
        </div>
      </body>
    </html>
  `;

  const doc = iframe.contentWindow?.document || iframe.contentDocument;
  if (!doc) return;
  doc.open();
  doc.write(htmlContent);
  doc.close();

  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  }, 250);
}
</script>

<style scoped>
.ob-invoice-preview-container {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: 100%;
  box-sizing: border-box;
  user-select: none;
}

/* ─── Action Toolbar ─── */
.ob-invoice-toolbar {
  width: 100%;
  background: #fff;
  border: 1px solid #cbd5e1;
  border-radius: 10px 10px 0 0;
  padding: 8px 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 2px 6px rgba(0,0,0,0.04);
}
.ob-invoice-toolbar__left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ob-invoice-toolbar__title {
  font-size: 13px;
  font-weight: 700;
  color: #1e293b;
}
.ob-invoice-toolbar__hint {
  font-size: 10px;
  color: #64748b;
  font-style: italic;
}
.ob-invoice-toolbar__right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ob-inv-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  border: none;
  transition: all 0.15s ease;
}
.ob-inv-btn--print {
  background: #0068FF;
  color: #fff;
}
.ob-inv-btn--print:hover {
  background: #0056d2;
  box-shadow: 0 2px 8px rgba(0,104,255,0.25);
}

/* ─── Paper Sheet ─── */
.ob-invoice-paper {
  width: 100%;
  background: #fff;
  border: 1px solid #cbd5e1;
  border-top: none;
  border-radius: 0 0 10px 10px;
  padding: 24px 28px;
  box-shadow: 0 10px 25px rgba(0,0,0,0.08);
  color: #1e293b;
  font-family: system-ui, -apple-system, sans-serif;
  cursor: pointer;
}

/* Header */
.ob-invoice__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 2px solid #1e293b;
}
.ob-invoice__brand {
  display: flex;
  gap: 12px;
  align-items: center;
}
.ob-invoice__branch-name,
.ob-invoice__branch-address {
  font-size: 11px;
  color: #475569;
  margin: 2px 0 0;
}
.ob-invoice__title-box {
  text-align: center;
}
.ob-invoice__title {
  font-size: 22px;
  font-weight: 900;
  color: #0f172a;
  letter-spacing: 0.05em;
  margin: 0;
}
.ob-invoice__meta-table {
  font-size: 11px;
  border-collapse: collapse;
}
.ob-invoice__meta-table td {
  padding: 3px 8px;
  border: 1px solid #475569;
}
.ob-meta-lbl {
  background: #f8fafc;
  font-weight: 600;
}
.ob-meta-val {
  font-family: monospace;
}

/* Customer Box */
.ob-invoice__customer-box {
  border: 1px solid #475569;
  border-radius: 6px;
  padding: 10px 14px;
  margin-bottom: 16px;
  background: #fafafa;
}
.ob-invoice__info-row {
  font-size: 11px;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.ob-invoice__info-row:last-child {
  margin-bottom: 0;
}
.ob-invoice__info-label {
  font-weight: 700;
  width: 110px;
  color: #334155;
  flex-shrink: 0;
}
.ob-invoice__info-value {
  color: #0f172a;
}
.ob-invoice__info-code {
  font-size: 10px;
  color: #0068FF;
  font-weight: 600;
}

/* Items Table */
.ob-invoice__table-wrap {
  margin-bottom: 14px;
}
.ob-invoice__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}
.ob-invoice__table th,
.ob-invoice__table td {
  border: 1px solid #334155;
  padding: 6px 8px;
}
.ob-invoice__table th {
  background: #f1f5f9;
  color: #0f172a;
  font-weight: 800;
  text-transform: uppercase;
  font-size: 10px;
}
.ob-inv-item-name {
  font-weight: 600;
  color: #0f172a;
}
.ob-inv-item-note {
  font-size: 10px;
  font-style: italic;
  color: #2563eb;
  margin-top: 1px;
}
.ob-inv-item-discount {
  font-size: 9px;
  color: #ef4444;
  font-weight: 700;
}
.ob-invoice__empty-row {
  display: none;
}

@media print {
  .ob-invoice__empty-row {
    display: table-row;
  }
  .ob-invoice__empty-row td {
    height: 24px;
  }
}


/* Totals */
.ob-inv-total-label {
  text-align: right;
  font-weight: 700;
  background: #f8fafc;
  font-size: 10px;
  color: #334155;
}
.ob-inv-total-val {
  text-align: right;
  font-weight: 700;
  font-size: 11px;
}

/* Notes & Terms */
.ob-invoice__notes {
  margin-top: 14px;
  font-size: 10px;
  color: #475569;
  line-height: 1.5;
}
.ob-invoice__notes-header {
  margin-bottom: 6px;
  font-size: 11px;
  line-height: 1.5;
  color: #1e293b;
  width: 100%;
  word-break: break-word;
}
.ob-invoice__notes-title {
  font-weight: 800;
  color: #1e293b;
}
.ob-invoice__note-text {
  font-weight: 700;
  color: #1e293b;
  white-space: pre-wrap;
  word-break: break-word;
}
.ob-typing-cursor {
  display: inline-block;
  font-weight: 800;
  color: #0068FF;
  margin-left: 2px;
  animation: ob-blink 1s infinite;
}
@keyframes ob-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
.ob-invoice__notes-list {
  margin: 0;
  padding-left: 16px;
}

/* Signatures */
.ob-invoice__signatures {
  display: flex;
  justify-content: space-between;
  margin-top: 36px;
  padding-top: 12px;
  text-align: center;
}
.ob-invoice__sig-col {
  flex: 1;
}
.ob-invoice__sig-title {
  font-size: 11px;
  font-weight: 800;
  color: #0f172a;
  margin: 0;
}
.ob-invoice__sig-hint {
  font-size: 9px;
  color: #94a3b8;
  font-style: italic;
}

/* Utilities */
.ob-text-bold { font-weight: 700; }
.ob-text-blue { color: #0068FF; }
.ob-text-blue-dark { color: #1e3a8a; }
.ob-text-red { color: #ef4444; }
.ob-mono {
  font-family: 'Geist Mono', 'SF Mono', 'JetBrains Mono', ui-monospace, monospace;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}
</style>
