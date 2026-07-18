<!--
  BillingDraftEditor.vue — modal tạo hoá đơn từ chat (goal 4, 2026-07-18).

  Pop-out riêng giống WorkItemEditor (Teleport + backdrop + Esc/Ctrl+Enter) thay vì
  form inline trong panel — anh yêu cầu 2026-07-18. KH khoá theo contact đang mở
  (hoá đơn bắt buộc KH đã link POS — không có picker đổi KH).

  Có discount từng dòng + số tiền đã trả (paidAmount) — backend validate sẵn từ V1
  nhưng UI cũ chưa có chỗ nhập.

  Chế độ "từ tin nhắn" (right-click tin nhắn → Tạo hoá đơn): nhận sourceMessageId +
  prefill ghi chú bằng nội dung tin — truy vết draft ↔ tin chốt đơn.
-->
<template>
  <Teleport to="body">
    <div v-if="modelValue" class="editor-backdrop" @click.self="requestClose">
      <div class="editor" @keydown.escape="requestClose" @keydown.ctrl.enter="save" tabindex="-1">
        <!-- Header -->
        <div class="editor-head">
          <h2><v-icon size="19" class="head-ic">mdi-receipt-text-outline</v-icon> Tạo hoá đơn</h2>
          <button class="close" @click="requestClose" title="Đóng (Esc)"><v-icon size="18">mdi-close</v-icon></button>
        </div>

        <!-- Body -->
        <div class="editor-body">
          <!-- KH khoá theo panel chat -->
          <div class="kh-row">
            <v-icon size="16" class="kh-ic">mdi-account-check-outline</v-icon>
            <div class="kh-info">
              <span class="name">{{ contactName || 'Khách hàng' }}</span>
              <span class="sub">Đã liên kết POS (KH #{{ posCustomerId }})</span>
            </div>
          </div>

          <!-- Từ tin nhắn (nếu có) -->
          <div v-if="fromMessage" class="from-msg-row">
            <v-icon size="16" class="from-msg-ic">mdi-message-reply-text-outline</v-icon>
            <span class="from-msg-text" :title="fromMessage.text">Từ tin nhắn: “{{ shortMsg }}”</span>
          </div>

          <div class="tfield">
            <span class="tfield-label">Chi nhánh xuất</span>
            <select v-model.number="branchId" class="field-select">
              <option :value="null" disabled>— Chọn chi nhánh —</option>
              <option v-for="b in branches" :key="b.id" :value="b.id">{{ b.name }}</option>
            </select>
          </div>

          <div class="tfield">
            <span class="tfield-label">Thêm sản phẩm (từ POS)</span>
            <div class="search-wrap">
              <input
                ref="searchInputRef" v-model="search" class="field-input" type="text"
                placeholder="Gõ tên/mã sản phẩm…" autocomplete="off" @input="onSearchInput"
              />
              <div v-if="searching" class="search-hint">Đang tìm…</div>
              <ul v-else-if="results.length" class="search-results">
                <li v-for="p in results" :key="p.id" @mousedown.prevent="addLine(p)">
                  <span class="res-name">{{ p.name }}</span>
                  <span class="res-meta">{{ p.code }} · {{ fmt(p.basePrice) }}₫{{ p.unit ? ' / ' + p.unit : '' }}</span>
                </li>
              </ul>
              <div v-else-if="search.trim() && searched" class="search-hint">Không có sản phẩm khớp.</div>
            </div>
          </div>

          <!-- Dòng hàng -->
          <div v-if="lines.length" class="lines-wrap">
            <table class="lines">
              <thead>
                <tr><th>Sản phẩm</th><th>SL</th><th>Đơn giá</th><th>Giảm</th><th>T.Tiền</th><th></th></tr>
              </thead>
              <tbody>
                <tr v-for="(l, i) in lines" :key="i">
                  <td class="cell-name" :title="l.productName">{{ l.productName }}<span v-if="l.unit" class="cell-unit"> /{{ l.unit }}</span></td>
                  <td><input v-model.number="l.quantity" class="in-qty" type="number" min="1" /></td>
                  <td><input v-model.number="l.unitPrice" class="in-price" type="number" min="0" step="1000" /></td>
                  <td><input v-model.number="l.discount" class="in-disc" type="number" min="0" step="1000" placeholder="0" :class="{ bad: discountBad(l) }" /></td>
                  <td class="cell-sub">{{ fmt(lineTotal(l)) }}</td>
                  <td><button class="rm" type="button" title="Bỏ dòng" @click="lines.splice(i, 1)">✕</button></td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="lines-empty">Chưa có sản phẩm — tìm và bấm để thêm dòng.</p>

          <div class="row-2">
            <div class="tfield">
              <span class="tfield-label">Đã trả trước (tuỳ chọn)</span>
              <input v-model.number="paidAmount" class="field-input" type="number" min="0" step="1000" placeholder="0" :class="{ bad: paidBad }" />
            </div>
            <div class="tfield">
              <span class="tfield-label">Ghi chú</span>
              <input v-model="description" class="field-input" type="text" maxlength="500" placeholder="Ghi chú hoá đơn…" />
            </div>
          </div>

          <div class="total-row">
            <span>Tổng cộng</span>
            <b class="total">{{ fmt(grandTotal) }}₫</b>
          </div>
          <div v-if="paidAmount && !paidBad" class="paid-row">
            <span>Còn lại sau trả trước</span>
            <span>{{ fmt(grandTotal - (paidAmount || 0)) }}₫</span>
          </div>

          <div v-if="error" class="error-banner"><v-icon size="15">mdi-alert-outline</v-icon> {{ error }}</div>
        </div>

        <!-- Footer -->
        <div class="editor-foot">
          <span class="tip"><kbd>Ctrl</kbd>+<kbd>Enter</kbd> lưu · <kbd>Esc</kbd> huỷ</span>
          <div class="actions">
            <button type="button" class="btn" @click="requestClose">Huỷ</button>
            <button type="button" class="btn btn--primary" :disabled="!canSave || saving" @click="save">
              <v-icon v-if="!saving" size="16">mdi-check</v-icon>
              {{ saving ? 'Đang lưu…' : 'Lưu nháp hoá đơn' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { useToast } from '@/composables/use-toast';
import { useConfirm } from '@/composables/use-confirm';
import {
  fetchPosBranches, searchPosProducts, createBillingDraft,
  type PosBranch, type PosProduct, type CreateDraftResult,
} from '@/api/pos-billing';

interface EditorLine {
  productId: number;
  productName: string;
  productCode: string | null;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  discount: number | null;
}

const props = defineProps<{
  modelValue: boolean;
  contactId: string;
  posCustomerId: number;
  contactName?: string | null;
  /** Right-click tin nhắn → tạo hoá đơn gắn tin nguồn (truy vết chốt đơn). */
  fromMessage?: { sourceMessageId: string; text: string } | null;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'created', result: CreateDraftResult): void;
}>();

const toast = useToast();
const { confirm } = useConfirm();

const branches = ref<PosBranch[]>([]);
const branchId = ref<number | null>(null);
const search = ref('');
const results = ref<PosProduct[]>([]);
const searching = ref(false);
const searched = ref(false);
const lines = ref<EditorLine[]>([]);
const paidAmount = ref<number | null>(null);
const description = ref('');
const saving = ref(false);
const error = ref('');
const searchInputRef = ref<HTMLInputElement | null>(null);
let searchTimer: ReturnType<typeof setTimeout> | null = null;

const shortMsg = computed(() => {
  const t = props.fromMessage?.text?.trim() || '';
  return t.length > 80 ? `${t.slice(0, 80)}…` : t;
});

function fmt(n: number): string { return (n || 0).toLocaleString('vi-VN'); }
function lineTotal(l: EditorLine): number {
  return Math.max(0, (l.quantity || 0) * (l.unitPrice || 0) - (l.discount || 0));
}
function discountBad(l: EditorLine): boolean {
  return (l.discount || 0) > (l.quantity || 0) * (l.unitPrice || 0);
}
const grandTotal = computed(() => lines.value.reduce((s, l) => s + lineTotal(l), 0));
const paidBad = computed(() => (paidAmount.value || 0) > grandTotal.value);
const canSave = computed(() =>
  branchId.value != null
  && lines.value.length > 0
  && lines.value.every((l) => l.quantity > 0 && l.unitPrice >= 0 && !discountBad(l))
  && !paidBad.value,
);

// ── Init mỗi lần mở ────────────────────────────────────────────────────────
watch(() => props.modelValue, (open) => {
  if (!open) return;
  error.value = '';
  saving.value = false;
  lines.value = [];
  search.value = '';
  results.value = [];
  searched.value = false;
  paidAmount.value = null;
  // Prefill ghi chú từ tin nhắn chốt đơn (cắt 200 ký tự cho vừa cột description).
  description.value = props.fromMessage ? props.fromMessage.text.trim().slice(0, 200) : '';
  if (!branches.value.length) {
    fetchPosBranches()
      .then((bs) => {
        branches.value = bs;
        if (bs.length === 1) branchId.value = bs[0].id;
      })
      .catch(() => toast.error('Không tải được chi nhánh POS'));
  }
  nextTick(() => searchInputRef.value?.focus());
});

function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer);
  const term = search.value.trim();
  if (!term) { results.value = []; searched.value = false; return; }
  searchTimer = setTimeout(async () => {
    searching.value = true;
    try {
      results.value = await searchPosProducts({ search: term, branchId: branchId.value ?? undefined, limit: 15 });
    } catch { results.value = []; } finally { searching.value = false; searched.value = true; }
  }, 350);
}

function addLine(p: PosProduct) {
  const existing = lines.value.find((l) => l.productId === p.id);
  if (existing) existing.quantity += 1;
  else {
    lines.value.push({
      productId: p.id, productName: p.name, productCode: p.code, unit: p.unit,
      quantity: 1, unitPrice: p.basePrice, discount: null,
    });
  }
  search.value = '';
  results.value = [];
  searched.value = false;
}

async function save() {
  if (!canSave.value || branchId.value == null) return;
  saving.value = true;
  error.value = '';
  try {
    const res = await createBillingDraft(props.contactId, {
      branchId: branchId.value,
      items: lines.value.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        ...(l.discount ? { discount: l.discount } : {}),
        // Snapshot tên/mã/đơn vị — BE lưu vào items JSON, gửi kèm note khi dispatch.
        productName: l.productName,
        productCode: l.productCode,
        unit: l.unit,
      })),
      ...(paidAmount.value ? { paidAmount: paidAmount.value } : {}),
      description: description.value.trim() || undefined,
      ...(props.fromMessage ? { sourceMessageId: props.fromMessage.sourceMessageId } : {}),
    });
    toast.success(`Đã lưu nháp hoá đơn ${fmt(res.totalAmount)}₫`);
    emit('created', res);
    emit('update:modelValue', false);
  } catch (e: unknown) {
    const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
    error.value = msg || 'Không lưu được hoá đơn';
  } finally {
    saving.value = false;
  }
}

async function requestClose() {
  if (lines.value.length > 0) {
    const ok = await confirm({
      title: 'Bỏ hoá đơn đang tạo?',
      message: 'Các dòng sản phẩm vừa chọn sẽ không được lưu.',
      tone: 'danger',
    });
    if (!ok) return;
  }
  emit('update:modelValue', false);
}
</script>

<style scoped>
.editor-backdrop {
  position: fixed; inset: 0;
  background: rgba(24, 29, 38, 0.55);
  backdrop-filter: blur(4px);
  z-index: 100;
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
}
.editor {
  width: 520px; max-width: 100%;
  max-height: 94vh;
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.32), 0 2px 8px rgba(0, 0, 0, 0.12);
  display: flex; flex-direction: column;
  overflow: hidden; outline: none;
  color: #1a1d24;
}
.editor-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid #e5e7eb;
}
.editor-head h2 { font-size: 17px; font-weight: 500; margin: 0; display: flex; align-items: center; gap: 6px; }
.editor-head .close {
  width: 32px; height: 32px; border-radius: 8px;
  background: transparent; border: none; color: #6b7280; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
}
.editor-body {
  flex: 1; overflow-y: auto;
  padding: 14px 18px;
  display: flex; flex-direction: column; gap: 12px;
}
.editor-foot {
  display: flex; align-items: center; justify-content: space-between; gap: 6px;
  padding: 10px 18px;
  background: #f8fafc;
  border-top: 1px solid #e5e7eb;
}
.editor-foot .tip { font-size: 11.5px; color: #6b7280; }
.editor-foot kbd {
  display: inline-block; padding: 1px 5px;
  background: #fff; border: 1px solid #e5e7eb; border-radius: 4px;
  font-family: ui-monospace, Consolas, monospace; font-size: 10.5px;
}
.editor-foot .actions { display: flex; gap: 6px; }
.btn {
  padding: 7px 14px; border-radius: 8px; font-size: 13px; font-weight: 500;
  cursor: pointer; border: 1px solid #e5e7eb; background: #fff; color: #374151;
  display: inline-flex; align-items: center; gap: 4px;
}
.btn--primary { background: #2563eb; border-color: #2563eb; color: #fff; }
.btn--primary:disabled { opacity: 0.55; cursor: not-allowed; }

.kh-row {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px;
  background: #ecfdf5; border: 1px solid #a7f3d0;
  border-radius: 8px;
}
.kh-ic { color: #059669; flex-shrink: 0; }
.kh-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.kh-info .name { font-weight: 500; font-size: 13.5px; }
.kh-info .sub { font-size: 11.5px; color: #047857; }

.from-msg-row {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 10px;
  background: #f5f3ff; border: 1px solid #ddd6fe;
  border-radius: 8px;
}
.from-msg-ic { color: #7c3aed; flex-shrink: 0; }
.from-msg-text { font-size: 12px; color: #5b21b6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.tfield { display: flex; flex-direction: column; gap: 5px; }
.tfield-label {
  font-size: 11.5px; font-weight: 500; color: #6b7280;
  text-transform: uppercase; letter-spacing: 0.08em;
}
.row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.field-input, .field-select {
  width: 100%; height: 38px; padding: 0 10px; box-sizing: border-box;
  border: 1px solid #e5e7eb; border-radius: 8px;
  font-family: inherit; font-size: 13px; color: #1a1d24;
  background: #fff; outline: none;
}
.field-input:focus, .field-select:focus { border-color: #2563eb; }
.field-input.bad { border-color: #ef4444; }

.search-wrap { position: relative; }
.search-hint { font-size: 11.5px; color: #6b7280; padding: 4px 2px; }
.search-results {
  list-style: none; margin: 4px 0 0; padding: 0; max-height: 190px; overflow-y: auto;
  border: 1px solid #e5e7eb; border-radius: 8px;
}
.search-results li { padding: 7px 10px; cursor: pointer; display: flex; flex-direction: column; gap: 1px; }
.search-results li:hover { background: #f8fafc; }
.res-name { font-size: 12.5px; font-weight: 500; }
.res-meta { font-size: 11px; color: #6b7280; }

.lines-wrap { overflow-x: auto; }
.lines { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.lines th {
  text-align: left; font-size: 10.5px; text-transform: uppercase; color: #6b7280;
  padding: 3px 4px; font-weight: 600;
}
.lines td { padding: 4px; border-top: 1px solid #f3f4f6; vertical-align: middle; }
.cell-name { max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.cell-unit { color: #6b7280; font-weight: 400; font-size: 11px; }
.in-qty { width: 48px; }
.in-price { width: 84px; }
.in-disc { width: 74px; }
.in-qty, .in-price, .in-disc {
  border: 1px solid #e5e7eb; border-radius: 6px; padding: 4px 5px; font-size: 12.5px;
  font-family: inherit; box-sizing: border-box;
}
.in-disc.bad { border-color: #ef4444; background: #fef2f2; }
.cell-sub { font-variant-numeric: tabular-nums; white-space: nowrap; font-weight: 500; }
.rm { border: none; background: transparent; color: #ef4444; cursor: pointer; font-size: 12px; }
.lines-empty { font-size: 12px; color: #94a3b8; font-style: italic; margin: 0; text-align: center; padding: 10px; border: 1px dashed #e5e7eb; border-radius: 8px; }

.total-row {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 13.5px; padding-top: 6px; border-top: 1px solid #e5e7eb;
}
.total { font-size: 16px; color: #2563eb; font-variant-numeric: tabular-nums; }
.paid-row {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 12px; color: #6b7280; font-variant-numeric: tabular-nums;
}
.error-banner {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 10px; border-radius: 8px;
  background: #fee2e2; color: #991b1b; font-size: 12.5px;
}

@media (max-width: 768px) {
  .row-2 { grid-template-columns: 1fr; }
  .editor { width: 100%; }
}
</style>
