<template>
  <section class="cpi-section">
    <!-- ════════ HEADER ════════ -->
    <div class="cpi-header">
      <div class="cpi-header-left">
        <span class="material-symbols-outlined cpi-header-icon">stars</span>
        <span class="cpi-header-title">Sản phẩm đang quan tâm</span>
        <span v-if="items.length > 0" class="cpi-count-badge">{{ items.length }}</span>
      </div>

      <button
        class="cpi-scan-btn"
        :disabled="scanning || !contactId"
        :class="{ 'cpi-scan-btn--loading': scanning }"
        title="Dùng Gemini AI phân tích hội thoại chat để tìm sản phẩm khách hỏi"
        @click="handleScan"
      >
        <template v-if="scanning">
          <v-progress-circular indeterminate size="13" width="2" color="white" class="mr-1" />
          <span>Đang phân tích...</span>
        </template>
        <template v-else>
          <span class="material-symbols-outlined cpi-scan-icon">auto_awesome</span>
          <span>Quét nhu cầu từ chat</span>
        </template>
      </button>
    </div>

    <!-- ════════ LAST SCAN SUBTEXT ════════ -->
    <div class="cpi-subtext">
      <span v-if="lastScanInfo">
        Lần quét cuối: <strong>{{ formatDateTime(lastScanInfo.scannedAt) }}</strong>
        <template v-if="lastScanInfo.scannedByName"> bởi {{ lastScanInfo.scannedByName }}</template>
      </span>
      <span v-else class="cpi-subtext--empty">Chưa thực hiện quét lần nào</span>
    </div>

    <!-- ════════ LOADING SKELETON ════════ -->
    <div v-if="loading && items.length === 0" class="cpi-loading-state">
      <v-progress-circular indeterminate size="18" width="2" color="primary" />
      <span class="ml-2 text-caption text-grey">Đang tải sản phẩm...</span>
    </div>

    <!-- ════════ PRODUCT LIST ════════ -->
    <div v-else-if="items.length > 0" class="cpi-list">
      <div
        v-for="item in items"
        :key="item.id"
        class="cpi-card"
        :class="`cpi-card--status-${item.status}`"
      >
        <!-- Card Top: Product Name + Intent Badge + Actions -->
        <div class="cpi-card-header">
          <div class="cpi-card-title-wrap">
            <span class="cpi-product-name" :title="item.productName">{{ item.productName }}</span>
            <span v-if="item.intent" class="cpi-intent-badge" :class="intentClass(item.intent)">
              {{ item.intent }}
            </span>
          </div>

          <div class="cpi-card-actions">
            <!-- Edit Button -->
            <button
              class="cpi-icon-btn"
              title="Chỉnh sửa thông tin"
              @click="openEditDialog(item)"
            >
              <span class="material-symbols-outlined">edit</span>
            </button>
            <!-- Delete Button -->
            <button
              class="cpi-icon-btn cpi-icon-btn--danger"
              title="Xóa khỏi danh sách (kèm lý do)"
              @click="openDeleteDialog(item)"
            >
              <span class="material-symbols-outlined">delete</span>
            </button>
          </div>
        </div>

        <!-- Card Body: AI Extracted Context Notes -->
        <div v-if="item.notes" class="cpi-card-notes">
          <span class="material-symbols-outlined cpi-notes-icon">format_quote</span>
          <span class="cpi-notes-text">{{ item.notes }}</span>
        </div>

        <!-- Card Footer: Status Selector & Scan Timestamp -->
        <div class="cpi-card-footer">
          <div class="cpi-status-selector">
            <select
              :value="item.status"
              class="cpi-status-select"
              :class="`cpi-status-select--${item.status}`"
              @change="handleStatusChange(item, ($event.target as HTMLSelectElement).value)"
            >
              <option value="inquiring">💬 Đang hỏi</option>
              <option value="quoted">📑 Đã báo giá</option>
              <option value="converted">✅ Đã chốt đơn</option>
            </select>
          </div>

          <span class="cpi-card-time" :title="formatFullDateTime(item.scannedAt)">
            {{ relativeTime(item.scannedAt) }}
          </span>
        </div>
      </div>
    </div>

    <!-- ════════ EMPTY STATE ════════ -->
    <div v-else class="cpi-empty-state">
      <span class="material-symbols-outlined cpi-empty-icon">search_insights</span>
      <div class="cpi-empty-text">Chưa có sản phẩm nào được ghi nhận</div>
      <div class="cpi-empty-hint">
        Bấm nút <strong>[ ✨ Quét nhu cầu từ chat ]</strong> để AI tự động trích xuất các sản phẩm khách đang quan tâm.
      </div>
    </div>

    <!-- ════════ MODAL XÓA SẢN PHẨM (KÈM GHI CHÚ BẮT BUỘC) ════════ -->
    <v-dialog v-model="showDeleteDialog" max-width="440" persistent>
      <v-card class="rounded-xl shadow-xl">
        <v-card-title class="d-flex align-center pt-4 pb-2 px-4 text-subtitle-1 font-weight-bold text-error">
          <span class="material-symbols-outlined mr-2" style="font-size: 22px">delete_forever</span>
          Xác nhận xóa sản phẩm
        </v-card-title>

        <v-card-text class="px-4 py-2">
          <p class="text-body-2 text-grey-darken-3 mb-3">
            Bạn đang xóa sản phẩm <strong>"{{ deletingItem?.productName }}"</strong> khỏi danh sách quan tâm của khách hàng.
          </p>

          <div class="cpi-delete-alert mb-3">
            <span class="material-symbols-outlined text-warning mr-2" style="font-size: 18px">info</span>
            <span>Vui lòng nhập lý do xóa để lưu lại lịch sử kiểm toán và báo cáo quản lý.</span>
          </div>

          <v-textarea
            v-model="deleteNoteInput"
            label="Ghi chú của Sales (Lý do xóa) *"
            placeholder="Ví dụ: AI nhận nhầm, khách đổi ý không lấy, khách mua nơi khác..."
            rows="3"
            density="comfortable"
            variant="outlined"
            hide-details="auto"
            :error="deleteNoteError"
            :error-messages="deleteNoteError ? 'Vui lòng nhập lý do xóa sản phẩm.' : ''"
            autofocus
          />
        </v-card-text>

        <v-card-actions class="px-4 pb-4 pt-2 justify-end">
          <v-btn
            variant="text"
            color="grey-darken-1"
            class="text-none"
            :disabled="saving"
            @click="closeDeleteDialog"
          >
            Hủy
          </v-btn>
          <v-btn
            color="error"
            variant="flat"
            class="text-none font-weight-medium px-4"
            :loading="saving"
            :disabled="!deleteNoteInput.trim()"
            @click="confirmDelete"
          >
            Xác nhận xóa
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- ════════ MODAL CHỈNH SỬA THÔNG TIN SẢN PHẨM ════════ -->
    <v-dialog v-model="showEditDialog" max-width="460">
      <v-card class="rounded-xl shadow-xl">
        <v-card-title class="d-flex align-center pt-4 pb-2 px-4 text-subtitle-1 font-weight-bold text-primary">
          <span class="material-symbols-outlined mr-2" style="font-size: 20px">edit</span>
          Chỉnh sửa sản phẩm quan tâm
        </v-card-title>

        <v-card-text class="px-4 py-2">
          <v-text-field
            v-model="editForm.productName"
            label="Tên sản phẩm *"
            variant="outlined"
            density="compact"
            class="mb-3"
            hide-details="auto"
          />

          <v-text-field
            v-model="editForm.intent"
            label="Ý định của khách"
            placeholder="Ví dụ: Hỏi giá sỉ, Xin mẫu thử, Hỏi tồn kho..."
            variant="outlined"
            density="compact"
            class="mb-3"
            hide-details="auto"
          />

          <v-select
            v-model="editForm.status"
            label="Trạng thái"
            :items="statusOptions"
            item-title="title"
            item-value="value"
            variant="outlined"
            density="compact"
            class="mb-3"
            hide-details="auto"
          />

          <v-textarea
            v-model="editForm.notes"
            label="Tóm tắt ngữ cảnh từ chat"
            rows="2"
            variant="outlined"
            density="compact"
            hide-details="auto"
          />
        </v-card-text>

        <v-card-actions class="px-4 pb-4 pt-2 justify-end">
          <v-btn
            variant="text"
            color="grey-darken-1"
            class="text-none"
            :disabled="saving"
            @click="showEditDialog = false"
          >
            Hủy
          </v-btn>
          <v-btn
            color="primary"
            variant="flat"
            class="text-none font-weight-medium px-4"
            :loading="saving"
            :disabled="!editForm.productName.trim()"
            @click="confirmEdit"
          >
            Lưu thay đổi
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </section>
</template>

<script setup lang="ts">
import { ref, reactive, watch, onMounted } from 'vue';
import { useProductInterests, type ProductInterestItem } from '@/composables/use-product-interests';

const props = defineProps<{
  contactId?: string | null;
  contactName?: string | null;
}>();

const {
  items,
  lastScanInfo,
  loading,
  scanning,
  saving,
  fetchInterests,
  scanInterests,
  updateInterest,
  deleteInterest,
} = useProductInterests(() => props.contactId);

// ── Status Options ──
const statusOptions = [
  { title: '💬 Đang hỏi (Inquiring)', value: 'inquiring' },
  { title: '📑 Đã báo giá (Quoted)', value: 'quoted' },
  { title: '✅ Đã chốt đơn (Converted)', value: 'converted' },
];

// ── Delete Dialog State ──
const showDeleteDialog = ref(false);
const deletingItem = ref<ProductInterestItem | null>(null);
const deleteNoteInput = ref('');
const deleteNoteError = ref(false);

function openDeleteDialog(item: ProductInterestItem) {
  deletingItem.value = item;
  deleteNoteInput.value = '';
  deleteNoteError.value = false;
  showDeleteDialog.value = true;
}

function closeDeleteDialog() {
  showDeleteDialog.value = false;
  deletingItem.value = null;
  deleteNoteInput.value = '';
}

async function confirmDelete() {
  if (!deletingItem.value) return;
  if (!deleteNoteInput.value.trim()) {
    deleteNoteError.value = true;
    return;
  }
  const success = await deleteInterest(deletingItem.value.id, deleteNoteInput.value);
  if (success) {
    closeDeleteDialog();
  }
}

// ── Edit Dialog State ──
const showEditDialog = ref(false);
const editingItem = ref<ProductInterestItem | null>(null);
const editForm = reactive({
  productName: '',
  intent: '',
  status: 'inquiring',
  notes: '',
});

function openEditDialog(item: ProductInterestItem) {
  editingItem.value = item;
  editForm.productName = item.productName;
  editForm.intent = item.intent || '';
  editForm.status = item.status || 'inquiring';
  editForm.notes = item.notes || '';
  showEditDialog.value = true;
}

async function confirmEdit() {
  if (!editingItem.value) return;
  await updateInterest(editingItem.value.id, {
    productName: editForm.productName,
    intent: editForm.intent,
    status: editForm.status,
    notes: editForm.notes,
  });
  showEditDialog.value = false;
}

// ── Status Quick Change ──
async function handleStatusChange(item: ProductInterestItem, newStatus: string) {
  if (item.status === newStatus) return;
  await updateInterest(item.id, { status: newStatus });
}

// ── Scan Trigger ──
async function handleScan() {
  if (!props.contactId || scanning.value) return;
  await scanInterests();
}

// ── Helpers & Formatters ──
function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  const date = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${time} ${date}`;
}

function formatFullDateTime(dateStr?: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString('vi-VN');
}

function relativeTime(dateStr?: string | null): string {
  if (!dateStr) return '';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Vừa quét';
  if (diffMins < 60) return `${diffMins} phút trước`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} giờ trước`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} ngày trước`;
  return new Date(dateStr).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

function intentClass(intent?: string | null): string {
  if (!intent) return 'cpi-intent-default';
  const lower = intent.toLowerCase();
  if (lower.includes('giá')) return 'cpi-intent-price';
  if (lower.includes('mẫu')) return 'cpi-intent-sample';
  if (lower.includes('kho') || lower.includes('tồn')) return 'cpi-intent-stock';
  if (lower.includes('đặt') || lower.includes('mua')) return 'cpi-intent-order';
  return 'cpi-intent-consult';
}

// ── Lifecycle & Watchers ──
watch(
  () => props.contactId,
  (newId) => {
    if (newId) {
      fetchInterests();
    } else {
      items.value = [];
      lastScanInfo.value = null;
    }
  },
  { immediate: true },
);
</script>

<style scoped>
.cpi-section {
  background: #ffffff;
  border-radius: 12px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  padding: 12px;
  margin-top: 12px;
  margin-bottom: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

/* ── HEADER ── */
.cpi-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.cpi-header-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.cpi-header-icon {
  font-size: 18px;
  color: #f59e0b; /* Amber star */
}

.cpi-header-title {
  font-size: 13px;
  font-weight: 700;
  color: #1e293b;
}

.cpi-count-badge {
  background: #f1f5f9;
  color: #475569;
  font-size: 11px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
}

/* Scan Button: Gradient glow */
.cpi-scan-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
  color: #ffffff;
  border: none;
  border-radius: 16px;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(99, 102, 241, 0.25);
  transition: all 0.2s ease;
  white-space: nowrap;
}

.cpi-scan-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(99, 102, 241, 0.35);
}

.cpi-scan-btn:active:not(:disabled) {
  transform: translateY(0);
}

.cpi-scan-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.cpi-scan-icon {
  font-size: 14px;
}

/* ── SUBTEXT ── */
.cpi-subtext {
  font-size: 11px;
  color: #64748b;
  margin-top: 4px;
  margin-bottom: 10px;
  padding-left: 2px;
}

.cpi-subtext strong {
  color: #334155;
}

.cpi-subtext--empty {
  color: #94a3b8;
  font-style: italic;
}

/* ── LOADING ── */
.cpi-loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px 0;
}

/* ── LIST & CARDS ── */
.cpi-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cpi-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-left: 3px solid #64748b;
  border-radius: 8px;
  padding: 8px 10px;
  transition: all 0.15s ease;
}

.cpi-card:hover {
  background: #f1f5f9;
  border-color: #cbd5e1;
}

.cpi-card--status-inquiring {
  border-left-color: #3b82f6; /* Blue */
}

.cpi-card--status-quoted {
  border-left-color: #8b5cf6; /* Purple */
}

.cpi-card--status-converted {
  border-left-color: #10b981; /* Emerald */
}

/* Card Header */
.cpi-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 6px;
}

.cpi-card-title-wrap {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  flex: 1;
  min-width: 0;
}

.cpi-product-name {
  font-size: 12.5px;
  font-weight: 700;
  color: #0f172a;
  word-break: break-word;
}

/* Intent Badges */
.cpi-intent-badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
}

.cpi-intent-price {
  background: #e0f2fe;
  color: #0369a1;
}

.cpi-intent-sample {
  background: #fef3c7;
  color: #b45309;
}

.cpi-intent-stock {
  background: #ccfbf1;
  color: #0f766e;
}

.cpi-intent-order {
  background: #dcfce7;
  color: #15803d;
}

.cpi-intent-consult,
.cpi-intent-default {
  background: #f1f5f9;
  color: #475569;
}

/* Action Icons */
.cpi-card-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.cpi-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  transition: all 0.15s ease;
}

.cpi-icon-btn span {
  font-size: 15px;
}

.cpi-icon-btn:hover {
  background: #e2e8f0;
  color: #1e293b;
}

.cpi-icon-btn--danger:hover {
  background: #fee2e2;
  color: #dc2626;
}

/* Card Notes Context */
.cpi-card-notes {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  margin-top: 5px;
  margin-bottom: 6px;
  padding: 4px 6px;
  background: rgba(255, 255, 255, 0.7);
  border-radius: 4px;
  font-size: 11.5px;
  color: #334155;
  line-height: 1.4;
}

.cpi-notes-icon {
  font-size: 13px;
  color: #94a3b8;
  flex-shrink: 0;
  margin-top: 1px;
}

.cpi-notes-text {
  word-break: break-word;
}

/* Card Footer */
.cpi-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px dashed rgba(0, 0, 0, 0.06);
}

.cpi-status-select {
  font-size: 11px;
  font-weight: 600;
  padding: 1px 4px;
  border-radius: 4px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  cursor: pointer;
  outline: none;
}

.cpi-status-select--inquiring {
  color: #2563eb;
  border-color: #bfdbfe;
}

.cpi-status-select--quoted {
  color: #7c3aed;
  border-color: #ddd6fe;
}

.cpi-status-select--converted {
  color: #059669;
  border-color: #a7f3d0;
}

.cpi-card-time {
  font-size: 10.5px;
  color: #94a3b8;
}

/* ── EMPTY STATE ── */
.cpi-empty-state {
  text-align: center;
  padding: 16px 8px;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  border-radius: 8px;
}

.cpi-empty-icon {
  font-size: 28px;
  color: #94a3b8;
  margin-bottom: 4px;
}

.cpi-empty-text {
  font-size: 12px;
  font-weight: 600;
  color: #475569;
}

.cpi-empty-hint {
  font-size: 11px;
  color: #64748b;
  margin-top: 2px;
  line-height: 1.4;
}

/* ── DELETE MODAL ── */
.cpi-delete-alert {
  display: flex;
  align-items: center;
  padding: 6px 10px;
  background: #fefce8;
  border: 1px solid #fef08a;
  border-radius: 6px;
  font-size: 11.5px;
  color: #854d0e;
}
</style>
