<template>
  <div class="ob-invoice-preview-container" @dblclick="printDirectly" @click="handleContainerClick">
    <!-- SVG Connector Line Layer (Dogleg Elbow + Prominent Arrowhead) -->
    <svg
      v-if="editingCell && popoverPos && connectorPath"
      class="ob-popover-svg-layer"
    >
      <defs>
        <marker
          id="ob-arrowhead-blue"
          viewBox="0 0 10 10"
          refX="7"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#2563eb" />
        </marker>
      </defs>

      <!-- White outer glow background path -->
      <path
        :d="connectorPath"
        fill="none"
        stroke="#ffffff"
        stroke-width="4"
        stroke-linecap="round"
        stroke-linejoin="round"
      />

      <!-- Main dashed slate-blue pointer line with arrowhead -->
      <path
        :d="connectorPath"
        fill="none"
        stroke="#2563eb"
        stroke-width="2"
        stroke-dasharray="5 3"
        stroke-linecap="round"
        stroke-linejoin="round"
        marker-end="url(#ob-arrowhead-blue)"
      />
    </svg>

    <!-- Floating Popover Overlay for Editing (Higher Z-index Layer) -->
    <div
      v-if="editingCell && popoverPos"
      class="ob-invoice-popover"
      :style="{ top: `${popoverPos.top}px`, left: `${popoverPos.left}px` }"
      @click.stop
    >
      <div class="ob-popover-header">
        <span class="ob-popover-title">
          {{ getPopoverTitle(editingCell) }}
        </span>
        <button class="ob-popover-close-btn" title="Đóng" @click="cancelEdit">
          <X :size="12" />
        </button>
      </div>

      <div class="ob-popover-body">
        <!-- Item Qty or Price with Stepper Buttons -->
        <template v-if="editingCell.kind === 'item'">
          <button
            class="ob-popover-step-btn"
            :disabled="editingCell.type === 'qty' && Number(editValue) <= 1"
            v-bind="getHoldProps((stepMult) => changeStepValue(-1 * stepMult))"
          >
            <Minus :size="12" />
          </button>

          <input
            type="number"
            class="ob-popover-input"
            v-model.number="editValue"
            @keyup.enter="finishEdit"
            @keyup.esc="cancelEdit"
            v-autofocus
          />

          <button
            class="ob-popover-step-btn"
            v-bind="getHoldProps((stepMult) => changeStepValue(1 * stepMult))"
          >
            <Plus :size="12" />
          </button>
        </template>

        <!-- Meta: Order Discount with Stepper Buttons -->
        <template v-else-if="editingCell.kind === 'meta' && editingCell.field === 'orderDiscount'">
          <button
            class="ob-popover-step-btn"
            :disabled="Number(editValue) <= 0"
            v-bind="getHoldProps((stepMult) => changeStepValue(-1 * stepMult))"
          >
            <Minus :size="12" />
          </button>

          <input
            type="number"
            class="ob-popover-input"
            v-model.number="editValue"
            @keyup.enter="finishEdit"
            @keyup.esc="cancelEdit"
            v-autofocus
          />

          <button
            class="ob-popover-step-btn"
            v-bind="getHoldProps((stepMult) => changeStepValue(1 * stepMult))"
          >
            <Plus :size="12" />
          </button>
        </template>

        <!-- Meta: Text Fields (Description / Shipping Note) -->
        <template v-else>
          <input
            type="text"
            class="ob-popover-input ob-popover-input--text"
            v-model="editValue"
            placeholder="Nhập ghi chú..."
            @keyup.enter="finishEdit"
            @keyup.esc="cancelEdit"
            v-autofocus
          />
        </template>

        <!-- Common Apply Button -->
        <button class="ob-popover-apply-btn" title="Áp dụng" @click="finishEdit">
          <Check :size="13" />
        </button>
      </div>
    </div>

    <!-- Paper Invoice Sheet -->
    <div class="ob-invoice-paper" id="ob-printable-invoice">
      <!-- Screen-only subtle editing hint badge at top right -->
      <div class="ob-inv-top-right-hint ob-no-print" title="Hướng dẫn chỉnh sửa">
        <span class="ob-hint-text">💡 Các ô có nét đứt (---) cho phép nhấp vào để chỉnh sửa</span>
      </div>

      <!-- 1. Header Top Center -->
      <div class="ob-inv-center-header">
        <p class="ob-inv-branch-name">{{ branch?.name || 'Kho Sài Gòn' }}</p>
        <h1 class="ob-inv-main-title">PHIẾU ĐẶT HÀNG</h1>
        <p class="ob-inv-sub-meta">Ngày {{ currentDateFormatted }}</p>
        <p class="ob-inv-sub-meta">Mã đơn hàng: {{ ticketNumber || 'Phiếu tạm' }}</p>
      </div>

      <!-- 2. Customer & Order Meta Lines -->
      <div class="ob-inv-meta-info">
        <div class="ob-inv-info-line">
          <strong class="ob-inv-label">Khách hàng:</strong>
          <span class="ob-inv-val">{{ customer.name }}{{ customer.phone ? ' - ' + customer.phone : '' }}</span>
        </div>
        <div class="ob-inv-info-line">
          <strong class="ob-inv-label">Địa chỉ:</strong>
          <span class="ob-inv-val">{{ deliveryAddress || customer.address || '—' }}</span>
        </div>

        <!-- Editable Ghi chú khách hàng (Bưu tá) -->
        <div class="ob-inv-info-line ob-editable-line" @click.stop="startEditMeta($event, 'shippingNote')">
          <strong class="ob-inv-label">Ghi chú khách hàng:</strong>
          <span
            class="ob-inv-val ob-cell-text ob-meta-text"
            :class="{ 'ob-cell-active': editingCell?.kind === 'meta' && editingCell?.field === 'shippingNote' }"
            title="Nhấp để sửa ghi chú khách hàng (bưu tá)"
          >
            <template v-if="shippingNote">{{ shippingNote }}</template>
            <template v-else>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</template>
          </span>
        </div>

        <!-- Editable Ghi chú đơn hàng -->
        <div class="ob-inv-info-line ob-editable-line" @click.stop="startEditMeta($event, 'description')">
          <strong class="ob-inv-label">Ghi chú đơn hàng:</strong>
          <span
            class="ob-inv-val ob-inv-italic ob-cell-text ob-meta-text"
            :class="{ 'ob-cell-active': editingCell?.kind === 'meta' && editingCell?.field === 'description' }"
            title="Nhấp để sửa ghi chú đơn hàng"
          >
            <template v-if="description">{{ description }}</template>
            <template v-else>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</template>
          </span>
        </div>

        <div class="ob-inv-info-line">
          <strong class="ob-inv-label">Nhân viên:</strong>
          <span class="ob-inv-val">{{ creatorName || 'Admin' }}</span>
        </div>
      </div>

      <!-- 3. Product Table -->
      <table class="ob-inv-table">
        <thead>
          <tr>
            <th class="ob-col-name">Sản phẩm</th>
            <th class="ob-col-price">Đơn giá</th>
            <th class="ob-col-qty">SL</th>
            <th class="ob-col-unit">Đơn vị</th>
            <th class="ob-col-total">Thành tiền</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(item, idx) in cartItems" v-show="!item.isOutOfStock" :key="idx">
            <td class="ob-col-name">
              <div class="ob-inv-prod-name">
                {{ item.product.name }}
                <span v-if="item.isGift"> (Quà KM)</span>
                <span v-else-if="item.discount"> (KM)</span>
              </div>

              <!-- Editable Product Note Line -->
              <div
                class="ob-inv-prod-note-line ob-editable-line"
                @click.stop="startEditItemNote($event, idx)"
              >
                <span class="ob-inv-prod-note-lbl">Ghi chú: </span>
                <span
                  class="ob-cell-text ob-meta-text ob-prod-note-text"
                  :class="{ 'ob-cell-active': editingCell?.kind === 'itemNote' && editingCell?.idx === idx }"
                  title="Nhấp để sửa ghi chú sản phẩm"
                >
                  <template v-if="item.note">{{ item.note }}</template>
                  <template v-else>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</template>
                </span>
              </div>
            </td>

            <!-- Editable Unit Price Cell -->
            <td
              class="ob-col-price"
              :class="{
                'ob-editable-cell': !item.isGift,
                'ob-cell-active': editingCell?.kind === 'item' && editingCell?.idx === idx && editingCell?.type === 'price'
              }"
              @click.stop="!item.isGift && startEditItem($event, idx, 'price')"
            >
              <span class="ob-cell-text" :title="item.isGift ? '' : 'Nhấp để sửa đơn giá'">
                {{ item.isGift ? 0 : formatNumber(OrderPricingCalculator.calculateEffectiveUnitPrice(item.product.basePrice, item.discount)) }}
              </span>
            </td>

            <!-- Editable Quantity Cell -->
            <td
              class="ob-col-qty"
              :class="{
                'ob-editable-cell': !item.isGift,
                'ob-cell-active': editingCell?.kind === 'item' && editingCell?.idx === idx && editingCell?.type === 'qty'
              }"
              @click.stop="!item.isGift && startEditItem($event, idx, 'qty')"
            >
              <span class="ob-cell-text" :title="item.isGift ? '' : 'Nhấp để sửa số lượng'">
                {{ item.quantity }}
              </span>
            </td>

            <td class="ob-col-unit">{{ item.product.unit || 'Hộp' }}</td>

            <!-- Read-Only Line Total Cell -->
            <td class="ob-col-total">
              {{ item.isGift ? 0 : formatNumber(OrderPricingCalculator.calculateLineTotal(item.product.basePrice, item.quantity, item.discount, item.isGift)) }}
            </td>
          </tr>
        </tbody>
      </table>

      <!-- 4. Financial Summary Right Aligned -->
      <div class="ob-inv-totals-wrap">
        <table class="ob-inv-totals-table">
          <tbody>
            <tr>
              <td class="ob-total-lbl">Tổng tiền hàng:</td>
              <td class="ob-total-val">
                <span class="ob-total-text-plain">{{ formatNumber(totalBeforeDiscount) }}</span>
              </td>
            </tr>

            <!-- Editable Order Discount Row -->
            <tr
              class="ob-editable-row"
              @click.stop="startEditMeta($event, 'orderDiscount')"
            >
              <td class="ob-total-lbl">Giảm giá:</td>
              <td class="ob-total-val">
                <span
                  class="ob-cell-text ob-total-text"
                  :class="{ 'ob-cell-active': editingCell?.kind === 'meta' && editingCell?.field === 'orderDiscount' }"
                  title="Nhấp để sửa giảm giá toàn đơn"
                >
                  {{ formatNumber(orderDiscount) }}
                </span>
              </td>
            </tr>

            <tr>
              <td class="ob-total-lbl">Đã thanh toán:</td>
              <td class="ob-total-val">
                <span class="ob-total-text-plain">{{ formatNumber(paidAmount) }}</span>
              </td>
            </tr>
            <tr class="ob-total-highlight">
              <td class="ob-total-lbl">Cần thanh toán:</td>
              <td class="ob-total-val">
                <span class="ob-total-text-plain">{{ formatNumber(Math.max(0, grandTotal - paidAmount)) }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 5. Footer Notice Centered -->
      <div class="ob-inv-footer-note">
        <p class="ob-inv-qr-notice"><strong>Quý khách vui lòng thanh toán theo mã QR dưới đây.</strong></p>
        <p class="ob-inv-pay-hint">
          <strong>Lưu ý:</strong> Thanh toán bằng QR được xác nhận <strong>tự động ngay lập tức</strong>;<br />
          Chuyển khoản qua số tài khoản có thể mất <strong>3–5 giờ</strong> để nhân viên đối soát và xác nhận.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { Minus, Plus, Check, X } from 'lucide-vue-next';
import type { CustomerInfo, CartItem, POSBranch } from './types';
import { OrderPricingCalculator } from '@/utils/orderPricingCalculator';
import { useLongPressStep } from '@/composables/useLongPressStep';

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
  shippingNote?: string;
  deliveryAddress?: string;
  creatorName?: string;
}>();

const emit = defineEmits<{
  'update-description': [value: string];
  'update-shipping-note': [value: string];
  'update-order-discount': [discountAmount: number];
  'update-quantity': [productId: number, qty: number];
  'update-discount': [productId: number, discountAmount: number];
  'update-item-note': [productId: number, note: string];
}>();

const { getHoldProps } = useLongPressStep();

// Custom directive to focus input on mount
const vAutofocus = {
  mounted: (el: HTMLElement) => el.focus(),
};

type EditTarget =
  | { kind: 'item'; idx: number; type: 'price' | 'qty' }
  | { kind: 'itemNote'; idx: number }
  | { kind: 'meta'; field: 'description' | 'shippingNote' | 'orderDiscount' };

// Floating Popover Edit State
const editingCell = ref<EditTarget | null>(null);
const editValue = ref<number | string>('');
const popoverPos = ref<{ top: number; left: number } | null>(null);
const connectorPath = ref<string | null>(null);

function getPopoverTitle(target: EditTarget): string {
  if (target.kind === 'item') {
    return target.type === 'price' ? 'Sửa Đơn giá' : 'Sửa Số lượng';
  }
  if (target.kind === 'itemNote') {
    return 'Sửa Ghi chú sản phẩm';
  }
  switch (target.field) {
    case 'description': return 'Sửa Ghi chú đơn hàng';
    case 'shippingNote': return 'Sửa Ghi chú khách hàng';
    case 'orderDiscount': return 'Sửa Giảm giá toàn đơn';
  }
}

function startEditItem(event: MouseEvent, idx: number, type: 'price' | 'qty') {
  const item = props.cartItems[idx];
  if (!item || item.isGift) return;

  editingCell.value = { kind: 'item', idx, type };
  if (type === 'price') {
    const effectivePrice = OrderPricingCalculator.calculateEffectiveUnitPrice(
      item.product.basePrice,
      item.discount
    );
    editValue.value = Math.round(effectivePrice);
  } else {
    editValue.value = item.quantity;
  }

  calculatePopoverPosition(event.currentTarget as HTMLElement);
}

function startEditItemNote(event: MouseEvent, idx: number) {
  const item = props.cartItems[idx];
  if (!item) return;

  editingCell.value = { kind: 'itemNote', idx };
  editValue.value = item.note || '';

  calculatePopoverPosition(event.currentTarget as HTMLElement);
}

function startEditMeta(event: MouseEvent, field: 'description' | 'shippingNote' | 'orderDiscount') {
  editingCell.value = { kind: 'meta', field };
  if (field === 'orderDiscount') {
    editValue.value = props.orderDiscount || 0;
  } else if (field === 'shippingNote') {
    editValue.value = props.shippingNote || '';
  } else if (field === 'description') {
    editValue.value = props.description || '';
  }

  const currentEl = event.currentTarget as HTMLElement;
  const targetEl = field === 'orderDiscount'
    ? (currentEl.querySelector('.ob-total-val') as HTMLElement || currentEl)
    : currentEl;

  calculatePopoverPosition(targetEl);
}

function calculatePopoverPosition(target: HTMLElement) {
  const container = document.querySelector('.ob-invoice-preview-container') as HTMLElement;
  if (!target || !container) return;

  const targetRect = target.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const popoverWidth = 235;

  // 1. Determine connection target coordinates on the target element
  let targetX = Math.round(targetRect.right - containerRect.left - 4);
  const targetY = Math.round(targetRect.top - containerRect.top + targetRect.height / 2 + container.scrollTop);

  // If target element is wide (e.g. metadata line), pick a clean connection point near the end of line
  if (targetRect.width > 220) {
    targetX = Math.round(targetRect.left - containerRect.left + 210);
  }
  targetX = Math.max(20, Math.min(targetX, containerRect.width - 20));

  // 2. Calculate Popover X (Left): Center over targetX, strictly CLAMP within container bounds
  const maxLeft = Math.max(12, Math.round(containerRect.width - popoverWidth - 16));
  let pLeft = Math.round(targetX - popoverWidth / 2);
  pLeft = Math.max(16, Math.min(pLeft, maxLeft));

  // 3. Calculate Popover Y (Top): Position floating above target element
  let pTop = Math.round(targetRect.top - containerRect.top - 88 + container.scrollTop);
  let isBelow = false;
  if (pTop < 10) {
    pTop = Math.round(targetRect.bottom - containerRect.top + 16 + container.scrollTop);
    isBelow = true;
  }

  popoverPos.value = { top: pTop, left: pLeft };

  // 4. Calculate dynamic SVG connector path
  const popoverCenterX = pLeft + popoverWidth / 2;
  const startX = Math.max(pLeft + 25, Math.min(popoverCenterX, pLeft + popoverWidth - 25));

  if (!isBelow) {
    const startY = pTop + 62;
    const midY = startY + 20;
    connectorPath.value = `M ${startX} ${startY} V ${midY} L ${targetX} ${targetY}`;
  } else {
    const startY = pTop;
    const midY = startY - 14;
    connectorPath.value = `M ${startX} ${startY} V ${midY} L ${targetX} ${targetY}`;
  }
}

function changeStepValue(delta: number) {
  if (!editingCell.value) return;
  const stepUnit = (editingCell.value.kind === 'meta' && editingCell.value.field === 'orderDiscount')
    ? 5000
    : (editingCell.value.kind === 'item' && editingCell.value.type === 'price') ? 1000 : 1;
  const current = Number(editValue.value) || 0;
  const minVal = (editingCell.value.kind === 'item' && editingCell.value.type === 'qty') ? 1 : 0;
  editValue.value = Math.max(minVal, current + delta * stepUnit);
}

function finishEdit() {
  if (!editingCell.value) return;

  if (editingCell.value.kind === 'item') {
    const { idx, type } = editingCell.value;
    const item = props.cartItems[idx];
    if (item) {
      if (type === 'price') {
        const newUnitPrice = Math.max(0, Number(editValue.value) || 0);
        const derivedPerUnitDiscount = OrderPricingCalculator.derivePerUnitDiscountFromTargetPrice(
          item.product.basePrice,
          newUnitPrice
        );
        emit('update-discount', item.product.id, derivedPerUnitDiscount);
      } else if (type === 'qty') {
        const newQty = Math.max(1, Number(editValue.value) || 1);
        emit('update-quantity', item.product.id, newQty);
      }
    }
  } else if (editingCell.value.kind === 'itemNote') {
    const { idx } = editingCell.value;
    const item = props.cartItems[idx];
    if (item) {
      emit('update-item-note', item.product.id, String(editValue.value || ''));
    }
  } else if (editingCell.value.kind === 'meta') {
    const { field } = editingCell.value;
    if (field === 'orderDiscount') {
      const discountVal = Math.max(0, Number(editValue.value) || 0);
      emit('update-order-discount', discountVal);
    } else if (field === 'shippingNote') {
      emit('update-shipping-note', String(editValue.value || ''));
    } else if (field === 'description') {
      emit('update-description', String(editValue.value || ''));
    }
  }

  cancelEdit();
}

function cancelEdit() {
  editingCell.value = null;
  popoverPos.value = null;
  connectorPath.value = null;
}

function handleContainerClick() {
  if (editingCell.value) {
    finishEdit();
  }
}

const currentDateFormatted = computed(() => {
  const d = new Date();
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
});

function formatNumber(val: number): string {
  if (val === undefined || val === null || isNaN(val)) return '0';
  return Math.round(val).toLocaleString('en-US');
}

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
        <title>Phiếu Đặt Hàng - ${props.customer.name}</title>
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
            color: #000;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .ob-invoice-paper {
            width: 100%;
            max-width: 210mm;
            margin: 0 auto;
            padding: 16px 20px;
            background: #fff;
            color: #000;
          }
          .ob-inv-center-header {
            text-align: center;
            margin-bottom: 20px;
          }
          .ob-inv-branch-name {
            font-size: 13px;
            font-style: italic;
            margin: 0 0 2px;
          }
          .ob-inv-main-title {
            font-size: 20px;
            font-weight: 800;
            margin: 0 0 4px;
            letter-spacing: 0.05em;
          }
          .ob-inv-sub-meta {
            font-size: 13px;
            margin: 2px 0;
          }
          .ob-inv-meta-info {
            margin-bottom: 18px;
            font-size: 13px;
            line-height: 1.6;
          }
          .ob-inv-info-line {
            margin-bottom: 3px;
          }
          .ob-inv-label {
            font-weight: 700;
            display: inline-block;
            width: 140px;
          }
          .ob-inv-italic {
            font-style: italic;
          }
          .ob-inv-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 16px;
            font-size: 12px;
          }
          .ob-inv-table th,
          .ob-inv-table td {
            border: 1px solid #000000;
            padding: 8px 10px;
          }
          .ob-inv-table th {
            font-weight: 700;
            background: #ffffff;
            text-align: center;
          }
          .ob-col-name { text-align: left; }
          .ob-col-price { text-align: right; width: 100px; }
          .ob-col-qty { text-align: center; width: 60px; }
          .ob-col-unit { text-align: center; width: 75px; }
          .ob-col-total { text-align: right; width: 120px; }
          .ob-inv-totals-wrap {
            display: flex;
            justify-content: flex-end;
            margin-bottom: 24px;
          }
          .ob-inv-totals-table {
            border-collapse: collapse;
            font-size: 13px;
            min-width: 320px;
          }
          .ob-inv-totals-table td {
            padding: 4px 12px;
          }
          .ob-total-lbl {
            text-align: right;
            font-weight: 700;
          }
          .ob-total-val {
            text-align: right;
            min-width: 120px;
            font-weight: 600;
            padding-right: 12px;
          }
          .ob-total-text, .ob-total-text-plain {
            display: inline-block;
            text-align: right;
            padding: 1px 0px;
            margin: 0;
          }
          .ob-total-highlight {
            font-weight: 800;
          }
          .ob-inv-footer-note {
            text-align: center;
            margin-top: 30px;
            font-size: 12px;
            line-height: 1.6;
          }
          .ob-inv-qr-notice {
            font-size: 13px;
            margin-bottom: 6px;
          }
          .ob-inv-pay-hint {
            font-size: 12px;
            margin: 0;
          }
          .ob-no-print {
            display: none !important;
          }
        </style>
      </head>
      <body>
        ${elem.outerHTML}
        <script>
          window.onload = function() {
            window.print();
          };
        </` + `script>
      </body>
    </html>
  `;

  const doc = iframe.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(htmlContent);
    doc.close();
  }
}
</script>

<style scoped>
.ob-invoice-preview-container {
  padding: 12px;
  background: #ffffff;
  user-select: none;
  position: relative;
}

/* ─── SVG Connector Line Overlay Layer ─── */
.ob-popover-svg-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 99;
}

/* ─── Floating Popover Edit Card (Layer Above Invoice Paper) ─── */
.ob-invoice-popover {
  position: absolute;
  z-index: 100;
  width: 235px;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 9px 11px;
  box-shadow: 0 14px 32px -4px rgba(15, 23, 42, 0.14), 0 6px 14px -4px rgba(15, 23, 42, 0.08);
  animation: ob-pop-in 0.15s ease-out;
}

@keyframes ob-pop-in {
  from { opacity: 0; transform: translateY(4px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.ob-popover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
  padding-bottom: 5px;
  border-bottom: 1px solid #f1f5f9;
}

.ob-popover-title {
  font-size: 11px;
  font-weight: 700;
  color: #1e293b;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.ob-popover-close-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
  display: flex;
  align-items: center;
}
.ob-popover-close-btn:hover { background: #f1f5f9; color: #334155; }

.ob-popover-body {
  display: flex;
  align-items: center;
  gap: 5px;
}

.ob-popover-step-btn {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  color: #475569;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}
.ob-popover-step-btn:hover:not(:disabled) {
  background: #2563eb;
  color: #ffffff;
  border-color: #2563eb;
}
.ob-popover-step-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.ob-popover-input {
  flex: 1;
  width: 100%;
  height: 26px;
  padding: 2px 6px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 12.5px;
  font-weight: 700;
  text-align: right;
  outline: none;
  color: #0f172a;
}
.ob-popover-input--text {
  text-align: left;
  font-weight: 500;
}
.ob-popover-input:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}

.ob-popover-apply-btn {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  border: none;
  background: #10b981;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s ease;
}
.ob-popover-apply-btn:hover {
  background: #059669;
}

/* Active Highlight Cell / Line / Row */
.ob-editable-line, .ob-editable-row {
  cursor: pointer;
}
.ob-editable-line:hover .ob-cell-text,
.ob-editable-row:hover .ob-cell-text {
  background: #eff6ff;
  border-bottom-color: #2563eb;
}

.ob-cell-active {
  background: #eff6ff !important;
  box-shadow: inset 0 0 0 1.5px #3b82f6;
  border-radius: 3px;
}

/* ─── Paper Sheet ─── */
.ob-invoice-paper {
  width: 100%;
  background: #fff;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 24px 28px;
  box-shadow: 0 4px 18px rgba(0,0,0,0.06);
  color: #000000;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  cursor: pointer;
}

/* Header Centered */
.ob-inv-center-header {
  text-align: center;
  margin-bottom: 20px;
}
.ob-inv-branch-name {
  font-size: 13px;
  font-style: italic;
  margin: 0 0 2px;
  color: #000;
}
.ob-inv-main-title {
  font-size: 20px;
  font-weight: 800;
  margin: 0 0 4px;
  color: #000;
  letter-spacing: 0.05em;
}
.ob-inv-sub-meta {
  font-size: 13px;
  margin: 2px 0;
  color: #000;
}

/* Customer & Order Metadata */
.ob-inv-meta-info {
  margin-bottom: 18px;
  font-size: 13px;
  line-height: 1.6;
  color: #000;
}
.ob-inv-info-line {
  margin-bottom: 3px;
}
.ob-inv-label {
  font-weight: 700;
  display: inline-block;
  width: 140px;
  color: #000;
}
.ob-inv-val {
  color: #000;
}
.ob-inv-italic {
  font-style: italic;
}

/* Product Table */
.ob-inv-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 16px;
  font-size: 12px;
}
.ob-inv-table th,
.ob-inv-table td {
  border: 1px solid #000000;
  padding: 8px 10px;
  color: #000;
}
.ob-inv-table th {
  font-weight: 700;
  background: #ffffff;
  color: #000;
  text-align: center;
}
.ob-col-name { text-align: left; }
.ob-col-price { text-align: right; width: 100px; }
.ob-col-qty { text-align: center; width: 60px; }
.ob-col-unit { text-align: center; width: 75px; }
.ob-col-total { text-align: right; width: 120px; }

/* Totals Summary */
.ob-inv-totals-wrap {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 24px;
}
.ob-inv-totals-table {
  border-collapse: collapse;
  font-size: 13px;
  min-width: 320px;
  color: #000;
}
.ob-inv-totals-table td {
  padding: 5px 12px;
  vertical-align: middle;
}
.ob-total-lbl {
  text-align: right;
  font-weight: 700;
  white-space: nowrap;
}
.ob-total-val {
  text-align: right;
  min-width: 130px;
  font-weight: 600;
  padding-right: 12px;
}
.ob-total-text {
  display: inline-block;
  text-align: right;
  padding: 1px 0px;
  margin: 0;
}
.ob-total-text-plain {
  display: inline-block;
  text-align: right;
  padding: 1px 0px;
  margin: 0;
}
.ob-total-highlight {
  font-weight: 800;
}

/* Footer Notice */
.ob-inv-footer-note {
  text-align: center;
  margin-top: 30px;
  font-size: 12px;
  line-height: 1.6;
  color: #000;
}
.ob-inv-qr-notice {
  font-size: 13px;
  margin-bottom: 6px;
}
.ob-inv-pay-hint {
  font-size: 12px;
  margin: 0;
}

/* Inline Editable Cells */
.ob-editable-cell {
  cursor: pointer;
  position: relative;
  transition: background 0.15s ease;
}
.ob-editable-cell:hover {
  background: #eff6ff;
}
.ob-cell-text {
  border-bottom: 1px dashed #94a3b8;
  display: inline-block;
}
.ob-meta-text {
  min-width: 140px;
  letter-spacing: 0.05em;
  color: #64748b;
  padding-bottom: 1px;
}
.ob-inv-prod-name {
  font-weight: 600;
  color: #0f172a;
}
.ob-inv-prod-note-line {
  margin-top: 3px;
  font-size: 11px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.ob-inv-prod-note-lbl {
  font-style: italic;
  color: #64748b;
  font-weight: 600;
}
.ob-prod-note-text {
  min-width: 100px;
  font-style: italic;
}

/* Top Right Editing Hint Badge (Screen Only) */
.ob-inv-top-right-hint {
  position: absolute;
  top: 24px;
  right: 24px;
  font-size: 11px;
  color: #64748b;
  font-style: italic;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  padding: 4px 10px;
  border-radius: 8px;
  user-select: none;
  pointer-events: none;
}

@media print {
  .ob-no-print {
    display: none !important;
  }
}

/* Utilities */
.ob-text-blue { color: #0068FF; }
</style>
