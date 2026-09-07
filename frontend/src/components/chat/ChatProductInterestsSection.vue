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

        <!-- Related Products Box (2-Tier Stacked Layout) -->
        <div class="cpi-related-box">
          <!-- Tier 1: Header Row -->
          <div class="cpi-related-header">
            <div class="cpi-related-title-wrap">
              <span class="material-symbols-outlined cpi-related-icon">inventory_2</span>
              <span class="cpi-related-title">Sản phẩm liên quan</span>
            </div>
            <button
              type="button"
              class="cpi-related-link"
              title="Mở bảng tra cứu kho POS chi tiết"
              @click="openInventoryDialog(item.productName)"
            >
              <span>Xem thêm</span>
              <span class="material-symbols-outlined cpi-arrow-icon">arrow_forward</span>
            </button>
          </div>

          <!-- Tier 2: Content Row -->
          <div class="cpi-related-body">
            <template v-if="item.relatedProductsPreview && item.relatedProductsPreview.length > 0">
              <div class="cpi-thumb-list">
                <div
                  v-for="rel in item.relatedProductsPreview"
                  :key="rel.posId"
                  class="cpi-thumb-item"
                  :title="`${rel.name}\nGiá: ${formatCurrency(rel.basePrice)}\nTổng tồn: ${rel.totalAvailable} (${rel.totalAvailable > 0 ? 'Còn hàng' : 'Hết hàng'})`"
                  @click="openInventoryDialog(rel.name)"
                >
                  <img v-if="rel.imageUrl" :src="rel.imageUrl" :alt="rel.name" class="cpi-thumb-img" />
                  <div v-else class="cpi-thumb-initials">{{ rel.initials }}</div>

                  <!-- Status Dot on Thumbnail: Green if available > 0, Red if <= 0 -->
                  <span
                    class="cpi-thumb-status-dot"
                    :class="rel.totalAvailable > 0 ? 'cpi-thumb-status-dot--in' : 'cpi-thumb-status-dot--out'"
                  />
                </div>

                <!-- 5th slot: indicator when there are more products -->
                <div
                  v-if="item.hasMoreRelated || (item.relatedProductsPreview && item.relatedProductsPreview.length >= 4)"
                  class="cpi-thumb-item cpi-thumb-more"
                  title="Còn nhiều sản phẩm khác trong kho - Bấm để xem tất cả"
                  @click="openInventoryDialog(item.productName)"
                >
                  <span class="cpi-thumb-more-text">+...</span>
                </div>
              </div>
            </template>
            <!-- Empty state: Soft subtle badge with info icon -->
            <div v-else class="cpi-empty-rel-badge">
              <span class="material-symbols-outlined cpi-empty-rel-icon">info</span>
              <span>Không có sản phẩm này trong kho</span>
            </div>
          </div>
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
    <!-- ════════ MODAL TRA CỨU KHO POS CHI TIẾT (DATA TABLE) ════════ -->
    <v-dialog v-model="showInventoryDialog" max-width="860" scrollable>
      <v-card class="rounded-xl shadow-xl">
        <v-card-title class="d-flex align-center justify-space-between pt-4 pb-2 px-4 text-subtitle-1 font-weight-bold text-primary">
          <div class="d-flex align-center">
            <span class="material-symbols-outlined mr-2" style="font-size: 22px">storefront</span>
            <span>Đối soát sản phẩm trong kho POS</span>
            <span v-if="matchedProducts.length > 0" class="cpi-dialog-count-badge ml-2">
              {{ matchedProducts.length }} sản phẩm
            </span>
          </div>
          <v-btn icon variant="text" size="small" @click="showInventoryDialog = false">
            <span class="material-symbols-outlined">close</span>
          </v-btn>
        </v-card-title>

        <!-- Search Bar -->
        <div class="px-4 py-2 border-b bg-grey-lighten-5">
          <div class="d-flex align-center gap-2">
            <v-text-field
              v-model="inventorySearchQuery"
              placeholder="Nhập tên sản phẩm hoặc mã SKU..."
              variant="outlined"
              density="compact"
              hide-details
              prepend-inner-icon="search"
              clearable
              @keydown.enter="doInventorySearch"
            />
            <v-btn
              color="primary"
              variant="flat"
              class="text-none font-weight-medium px-4 ml-2"
              :loading="loadingInventory"
              @click="doInventorySearch"
            >
              Tìm kiếm
            </v-btn>
          </div>
        </div>

        <!-- Dialog Content: Data Table -->
        <v-card-text class="px-4 py-3" style="max-height: 540px">
          <!-- Loading state -->
          <div v-if="loadingInventory" class="text-center py-8">
            <v-progress-circular indeterminate color="primary" size="32" />
            <div class="mt-2 text-caption text-grey">Đang đối soát dữ liệu với kho POS...</div>
          </div>

          <!-- Empty state -->
          <div v-else-if="matchedProducts.length === 0" class="text-center py-8">
            <span class="material-symbols-outlined text-grey mb-2" style="font-size: 36px">inventory_2</span>
            <div class="text-body-2 text-grey-darken-1 font-weight-medium">
              Không tìm thấy sản phẩm nào trong kho khớp với từ khóa
            </div>
          </div>

          <!-- Data Table list -->
          <div v-else class="cpi-table-container">
            <table class="cpi-inventory-table">
              <thead>
                <tr>
                  <th class="cpi-th-prod">Sản phẩm</th>
                  <th class="cpi-th-price">Giá niêm yết</th>
                  <th class="cpi-th-stock">Tổng tồn</th>
                  <th class="cpi-th-branches">Tồn theo chi nhánh</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="prod in matchedProducts" :key="prod.posId" class="cpi-tbl-row">
                  <td class="cpi-td-prod">
                    <div class="cpi-tbl-prod-wrap">
                      <div class="cpi-tbl-thumb">
                        <img v-if="prod.imageUrl" :src="prod.imageUrl" :alt="prod.name" class="cpi-tbl-thumb-img" />
                        <div v-else class="cpi-tbl-thumb-initials">{{ prod.initials }}</div>
                      </div>
                      <div class="cpi-tbl-prod-info">
                        <div class="cpi-tbl-prod-name" :title="prod.name">{{ prod.name }}</div>
                        <div v-if="prod.code" class="cpi-tbl-prod-sku">SKU: {{ prod.code }}</div>
                      </div>
                    </div>
                  </td>
                  <td class="cpi-td-price">
                    <span class="cpi-price-tag">{{ formatCurrency(prod.basePrice) }}</span>
                  </td>
                  <td class="cpi-td-stock">
                    <div class="cpi-stock-wrap">
                      <span
                        class="cpi-stock-badge"
                        :class="`cpi-stock-badge--${prod.status.toLowerCase()}`"
                      >
                        {{ prod.status === 'InStock' ? 'Còn hàng' : prod.status === 'LowStock' ? 'Sắp hết' : 'Hết hàng' }}
                      </span>
                      <span class="cpi-stock-qty">
                        Khả dụng: <strong>{{ prod.totalAvailable }}</strong>
                      </span>
                    </div>
                  </td>
                  <td class="cpi-td-branches">
                    <div v-if="prod.branches && prod.branches.length > 0" class="cpi-tbl-branches">
                      <div
                        v-for="b in prod.branches"
                        :key="b.branchId"
                        class="cpi-branch-pill"
                        :class="b.available > 0 ? 'cpi-branch-pill--in' : 'cpi-branch-pill--out'"
                      >
                        <span class="cpi-branch-pill-name">{{ b.branchName }}:</span>
                        <span class="cpi-branch-pill-qty">
                          {{ b.available }}
                        </span>
                      </div>
                    </div>
                    <span v-else class="text-caption text-grey font-italic">Chưa có dữ liệu</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </v-card-text>

        <v-card-actions class="px-4 py-2 justify-end border-t">
          <v-btn
            variant="text"
            color="grey-darken-1"
            class="text-none"
            @click="showInventoryDialog = false"
          >
            Đóng
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </section>
</template>

<script setup lang="ts">
import { ref, reactive, watch, onMounted } from 'vue';
import {
  useProductInterests,
  type ProductInterestItem,
  type PosDetailedProductItem,
} from '@/composables/use-product-interests';

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
  checkPosInventory,
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

// ── POS Inventory Dialog State & Actions ──
const showInventoryDialog = ref(false);
const inventorySearchQuery = ref('');
const loadingInventory = ref(false);
const matchedProducts = ref<PosDetailedProductItem[]>([]);

async function openInventoryDialog(keyword: string) {
  inventorySearchQuery.value = keyword || '';
  showInventoryDialog.value = true;
  await doInventorySearch();
}

async function doInventorySearch() {
  const q = inventorySearchQuery.value.trim();
  if (!q) {
    matchedProducts.value = [];
    return;
  }
  loadingInventory.value = true;
  try {
    matchedProducts.value = await checkPosInventory(q);
  } finally {
    loadingInventory.value = false;
  }
}

function formatCurrency(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return 'Chưa có giá';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);
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
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-left: 3.5px solid #64748b;
  border-radius: 12px;
  padding: 10px 12px;
  transition: all 0.2s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.cpi-card:hover {
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.07);
}

/* Color-Coded Status: Nhận diện trực quan theo trạng thái */
.cpi-card--status-inquiring {
  background: #f0f7ff;
  border-color: #bfdbfe;
  border-left-color: #3b82f6;
}
.cpi-card--status-inquiring:hover {
  background: #e8f3fe;
  border-color: #93c5fd;
}

.cpi-card--status-quoted {
  background: #f5f3ff;
  border-color: #ddd6fe;
  border-left-color: #8b5cf6;
}
.cpi-card--status-quoted:hover {
  background: #ede9fe;
  border-color: #c4b5fd;
}

.cpi-card--status-converted {
  background: #ecfdf5;
  border-color: #a7f3d0;
  border-left-color: #10b981;
}
.cpi-card--status-converted:hover {
  background: #d1fae5;
  border-color: #6ee7b7;
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
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.cpi-product-name {
  font-size: 13px;
  font-weight: 700;
  color: #0f172a;
  word-break: break-word;
  line-height: 1.35;
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
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  transition: all 0.15s ease;
}

.cpi-icon-btn span {
  font-size: 16px;
}

.cpi-icon-btn:hover {
  background: rgba(0, 0, 0, 0.06);
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
  gap: 6px;
  margin-top: 6px;
  margin-bottom: 8px;
  padding: 6px 10px;
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 8px;
  font-size: 11.5px;
  color: #334155;
  line-height: 1.45;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
}

.cpi-notes-icon {
  font-size: 14px;
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
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed rgba(0, 0, 0, 0.08);
}

.cpi-status-select {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 16px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  cursor: pointer;
  outline: none;
  transition: all 0.15s ease;
}

.cpi-status-select:hover {
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.cpi-status-select--inquiring {
  color: #2563eb;
  border-color: #93c5fd;
  background: #eff6ff;
}

.cpi-status-select--quoted {
  color: #7c3aed;
  border-color: #c4b5fd;
  background: #f5f3ff;
}

.cpi-status-select--converted {
  color: #059669;
  border-color: #6ee7b7;
  background: #ecfdf5;
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

/* ── RELATED PRODUCTS BOX (2-TIER STACKED LAYOUT) ── */
.cpi-related-box {
  margin-top: 8px;
  margin-bottom: 8px;
  padding: 8px 10px;
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 10px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
}

.cpi-related-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.cpi-related-title-wrap {
  display: flex;
  align-items: center;
  gap: 4px;
}

.cpi-related-icon {
  font-size: 15px;
  color: #4f46e5;
}

.cpi-related-title {
  font-size: 11.5px;
  font-weight: 700;
  color: #1e293b;
}

.cpi-related-count {
  color: #64748b;
  font-weight: 600;
}

.cpi-related-link {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: transparent;
  border: none;
  color: #2563eb;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  transition: all 0.15s ease;
}

.cpi-related-link:hover {
  color: #1d4ed8;
  background: #eff6ff;
}

.cpi-arrow-icon {
  font-size: 13px;
  transition: transform 0.15s ease;
}

.cpi-related-link:hover .cpi-arrow-icon {
  transform: translateX(2px);
}

.cpi-related-body {
  display: flex;
  align-items: center;
}

.cpi-thumb-list {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cpi-thumb-item {
  position: relative;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: visible;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  cursor: pointer;
  transition: all 0.18s ease;
  flex-shrink: 0;
}

.cpi-thumb-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.06);
  border-color: #3b82f6;
}

.cpi-thumb-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 9px;
  padding: 2px;
}

.cpi-thumb-initials {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #e0e7ff 0%, #ede9fe 100%);
  color: #4338ca;
  font-size: 13px;
  font-weight: 700;
  border-radius: 9px;
}

/* Status Dot on Thumbnail */
.cpi-thumb-status-dot {
  position: absolute;
  top: -3px;
  right: -3px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  border: 1.5px solid #ffffff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

.cpi-thumb-status-dot--in {
  background: #10b981;
}

.cpi-thumb-status-dot--out {
  background: #ef4444;
}

/* 5th slot indicator: +... */
.cpi-thumb-more {
  background: #f1f5f9;
  border: 1.5px dashed #94a3b8;
  color: #475569;
  cursor: pointer;
  transition: all 0.18s ease;
}

.cpi-thumb-more:hover {
  background: #e0e7ff;
  border-color: #4f46e5;
  border-style: solid;
  color: #4338ca;
  transform: translateY(-2px);
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.06);
}

.cpi-thumb-more-text {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: -0.5px;
}

/* Subtle empty badge */
.cpi-empty-rel-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 8px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 11px;
  color: #64748b;
}

.cpi-empty-rel-icon {
  font-size: 13px;
  color: #94a3b8;
}

/* ── POS INVENTORY DIALOG (DATA TABLE STYLES) ── */
.cpi-dialog-count-badge {
  background: #e0e7ff;
  color: #4338ca;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 12px;
}

.cpi-table-container {
  width: 100%;
  overflow-x: auto;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

.cpi-inventory-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  text-align: left;
}

.cpi-inventory-table thead th {
  background: #f8fafc;
  color: #475569;
  font-weight: 700;
  padding: 10px 12px;
  border-bottom: 1px solid #e2e8f0;
  white-space: nowrap;
}

.cpi-inventory-table tbody tr {
  border-bottom: 1px solid #f1f5f9;
  transition: background 0.15s ease;
}

.cpi-inventory-table tbody tr:hover {
  background: #f8fafc;
}

.cpi-inventory-table tbody tr:last-child {
  border-bottom: none;
}

.cpi-inventory-table td {
  padding: 8px 12px;
  vertical-align: middle;
}

.cpi-th-prod, .cpi-td-prod {
  min-width: 220px;
}

.cpi-th-price, .cpi-td-price {
  min-width: 110px;
}

.cpi-th-stock, .cpi-td-stock {
  min-width: 120px;
}

.cpi-th-branches, .cpi-td-branches {
  min-width: 220px;
}

.cpi-tbl-prod-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}

.cpi-tbl-thumb {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}

.cpi-tbl-thumb-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 2px;
}

.cpi-tbl-thumb-initials {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #e0e7ff 0%, #ede9fe 100%);
  color: #4338ca;
  font-size: 13px;
  font-weight: 700;
}

.cpi-tbl-prod-info {
  min-width: 0;
}

.cpi-tbl-prod-name {
  font-weight: 700;
  color: #0f172a;
  font-size: 12.5px;
  line-height: 1.35;
  word-break: break-word;
}

.cpi-tbl-prod-sku {
  font-size: 11px;
  color: #64748b;
  margin-top: 2px;
}

.cpi-price-tag {
  font-weight: 700;
  color: #059669;
  font-size: 12.5px;
  white-space: nowrap;
}

.cpi-stock-wrap {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cpi-stock-badge {
  display: inline-block;
  font-size: 10.5px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 10px;
  width: fit-content;
}

.cpi-stock-badge--instock {
  background: #dcfce7;
  color: #15803d;
}

.cpi-stock-badge--lowstock {
  background: #fef3c7;
  color: #b45309;
}

.cpi-stock-badge--outofstock {
  background: #fee2e2;
  color: #dc2626;
}

.cpi-stock-qty {
  font-size: 11px;
  color: #475569;
}

.cpi-tbl-branches {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.cpi-branch-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border-radius: 5px;
  font-size: 11px;
  white-space: nowrap;
}

.cpi-branch-pill--in {
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  color: #065f46;
}

.cpi-branch-pill--in .cpi-branch-pill-qty {
  font-weight: 700;
  color: #047857;
}

.cpi-branch-pill--out {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  color: #94a3b8;
}

.cpi-branch-pill--out .cpi-branch-pill-qty {
  font-weight: 600;
  color: #64748b;
}
</style>
