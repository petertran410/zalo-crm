<template>
  <v-dialog v-model="dialog" max-width="560px" :persistent="searching || linking">
    <v-card class="pls-card rounded-xl">
      <!-- ── Header ── -->
      <div class="pls-header">
        <div class="pls-header-inner">
          <span class="material-symbols-outlined pls-header-icon">link</span>
          <div>
            <div class="pls-title">Liên kết khách hàng POS</div>
            <div class="pls-subtitle" v-if="step === 'search'">Tìm kiếm theo tên, SĐT hoặc mã KH</div>
            <div class="pls-subtitle" v-else>Xác nhận trước khi liên kết</div>
          </div>
        </div>
        <button class="pls-close-btn" :disabled="searching || linking" @click="close" title="Đóng">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>

      <!-- ═══════════════════════════════════════ -->
      <!-- STEP 1: SEARCH                          -->
      <!-- ═══════════════════════════════════════ -->
      <template v-if="step === 'search'">
        <!-- Search input -->
        <div class="pls-search-bar">
          <span class="material-symbols-outlined pls-search-icon">search</span>
          <input
            ref="searchInputRef"
            v-model="keyword"
            class="pls-search-input"
            placeholder="Nhập tên, SĐT hoặc mã KH..."
            @input="onKeywordChange"
            @keydown.enter="doSearch"
          />
          <button
            v-if="keyword"
            class="pls-clear-btn"
            @click="clearSearch"
            title="Xóa"
          >
            <span class="material-symbols-outlined">cancel</span>
          </button>
          <button
            class="pls-search-btn"
            :disabled="!keyword.trim() || searching"
            @click="doSearch"
          >
            Tìm
          </button>
        </div>

        <!-- Loading states -->
        <div v-if="searching" class="pls-loading-state">
          <div class="pls-loading-row">
            <div class="pls-spinner"></div>
            <span v-if="currentPhase === 'local'" class="pls-loading-text">
              Đang tìm trong cơ sở dữ liệu...
            </span>
            <span v-else class="pls-loading-text pls-loading-mcp">
              <span class="material-symbols-outlined pls-phase-icon">cloud_sync</span>
              Không tìm thấy local → Đang tìm trực tiếp trên POS...
            </span>
          </div>
        </div>

        <!-- Error state -->
        <div v-else-if="searchError" class="pls-error-state">
          <span class="material-symbols-outlined">error_outline</span>
          {{ searchError }}
        </div>

        <!-- Results list -->
        <div v-else-if="hasSearched && results.length > 0" class="pls-results">
          <!-- Source badge -->
          <div class="pls-results-header">
            <span class="pls-results-count">{{ results.length }} kết quả</span>
            <span class="pls-source-badge" :class="lastSource === 'mcp' ? 'badge-mcp' : 'badge-local'">
              <span class="material-symbols-outlined pls-badge-icon">
                {{ lastSource === 'mcp' ? 'cloud' : 'storage' }}
              </span>
              {{ lastSource === 'mcp' ? 'POS Live' : 'Local DB' }}
            </span>
          </div>

          <!-- Customer rows -->
          <div
            v-for="item in results"
            :key="item.id"
            class="pls-result-row"
            @click="selectCustomer(item)"
          >
            <div class="pls-result-avatar">
              <span class="material-symbols-outlined">person</span>
            </div>
            <div class="pls-result-info">
              <div class="pls-result-name">{{ item.name }}</div>
              <div class="pls-result-meta">
                <span v-if="item.code" class="pls-result-code">{{ item.code }}</span>
                <span v-if="item.phone" class="pls-result-phone">· {{ item.phone }}</span>
              </div>
            </div>
            <div class="pls-result-right">
              <span
                v-if="item.customerType"
                class="pls-type-chip"
                :class="isVip(item.customerType) ? 'chip-vip' : 'chip-normal'"
              >
                {{ isVip(item.customerType) ? '⭐ VIP' : item.customerType }}
              </span>
              <span class="material-symbols-outlined pls-result-arrow">chevron_right</span>
            </div>
          </div>
        </div>

        <!-- Empty state after search -->
        <div v-else-if="hasSearched && results.length === 0" class="pls-empty-state">
          <div class="pls-empty-icon">
            <span class="material-symbols-outlined">search_off</span>
          </div>
          <div class="pls-empty-title">Không tìm thấy khách hàng</div>
          <div class="pls-empty-desc">
            Không có khách nào khớp với "<strong>{{ lastKeyword }}</strong>" trên hệ thống POS.
          </div>
          <button class="pls-create-btn" @click="$emit('create-new'); close()">
            <span class="material-symbols-outlined">person_add</span>
            Tạo khách hàng mới trên POS
          </button>
        </div>

        <!-- Initial empty state -->
        <div v-else class="pls-initial-state">
          <div class="pls-initial-hint">
            <span class="material-symbols-outlined pls-hint-icon">manage_search</span>
            <span>Nhập từ khóa để tìm kiếm khách hàng POS</span>
          </div>
        </div>
      </template>

      <!-- ═══════════════════════════════════════ -->
      <!-- STEP 2: CONFIRM (2-column comparison)   -->
      <!-- ═══════════════════════════════════════ -->
      <template v-else-if="step === 'confirm' && selectedCustomer">
        <div class="pls-confirm-body">

          <!-- 2-column comparison table -->
          <div class="pls-compare">
            <div class="pls-compare-col pls-col-crm">
              <div class="pls-col-header">
                <span class="material-symbols-outlined pls-col-icon">hub</span>
                Contact CRM
              </div>
              <div class="pls-compare-field">
                <span class="pls-cf-label">Tên</span>
                <span class="pls-cf-val">{{ props.contactName || '—' }}</span>
              </div>
              <div class="pls-compare-field">
                <span class="pls-cf-label">SĐT</span>
                <span class="pls-cf-val">{{ props.contactPhone || '—' }}</span>
              </div>
              <div class="pls-compare-field">
                <span class="pls-cf-label">Mã KH POS</span>
                <span class="pls-cf-val pls-val-muted">Chưa liên kết</span>
              </div>
            </div>

            <div class="pls-compare-arrow">
              <span class="material-symbols-outlined">link</span>
            </div>

            <div class="pls-compare-col pls-col-pos">
              <div class="pls-col-header">
                <span class="material-symbols-outlined pls-col-icon">storefront</span>
                Khách hàng POS
              </div>
              <div class="pls-compare-field">
                <span class="pls-cf-label">Tên</span>
                <span class="pls-cf-val pls-val-highlight">{{ selectedCustomer.name }}</span>
              </div>
              <div class="pls-compare-field">
                <span class="pls-cf-label">SĐT</span>
                <span class="pls-cf-val">{{ selectedCustomer.phone || '—' }}</span>
              </div>
              <div class="pls-compare-field">
                <span class="pls-cf-label">Mã KH POS</span>
                <span class="pls-cf-val pls-val-code">{{ selectedCustomer.code || '—' }}</span>
              </div>
              <div class="pls-compare-field" v-if="selectedCustomer.customerType">
                <span class="pls-cf-label">Loại KH</span>
                <span class="pls-cf-val">
                  <span class="pls-type-chip" :class="isVip(selectedCustomer.customerType) ? 'chip-vip' : 'chip-normal'">
                    {{ isVip(selectedCustomer.customerType) ? '⭐ VIP' : selectedCustomer.customerType }}
                  </span>
                </span>
              </div>
            </div>
          </div>

          <!-- Info notice -->
          <div class="pls-notice">
            <span class="material-symbols-outlined pls-notice-icon">info</span>
            <span>Sau khi liên kết, CRM sẽ tự động đồng bộ thông tin cơ bản từ POS nếu Contact chưa có dữ liệu.</span>
          </div>

          <!-- Error alert -->
          <div v-if="linkError" class="pls-link-error">
            <span class="material-symbols-outlined">error</span>
            {{ linkError }}
          </div>
        </div>
      </template>

      <!-- ── Footer actions ── -->
      <div class="pls-footer">
        <template v-if="step === 'search'">
          <button class="pls-btn-ghost" @click="close">Đóng</button>
        </template>
        <template v-else-if="step === 'confirm'">
          <button class="pls-btn-ghost" @click="backToSearch" :disabled="linking">
            <span class="material-symbols-outlined">arrow_back</span>
            Quay lại
          </button>
          <button class="pls-btn-confirm" @click="confirmLink" :disabled="linking">
            <span v-if="linking" class="pls-btn-spinner"></span>
            <span v-else class="material-symbols-outlined">check_circle</span>
            {{ linking ? 'Đang liên kết...' : 'Xác nhận liên kết' }}
          </button>
        </template>
      </div>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { usePosCommands } from '@/composables/use-pos-commands';
import { useToast } from '@/composables/use-toast';

// ── Props & Emits ──────────────────────────────────────────────
const props = defineProps<{
  modelValue: boolean;
  contactId: string;
  contactName?: string;
  contactPhone?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [val: boolean];
  /** Phát ra khi liên kết thành công */
  'linked': [data: { posCustomerId: number; posCustomerCode?: string; posCustomerName?: string }];
  /** Phát ra khi user chọn "Tạo khách hàng mới" */
  'create-new': [];
}>();

// ── Dialog v-model ─────────────────────────────────────────────
const dialog = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
});

// ── Composables ────────────────────────────────────────────────
const { searchPosCustomers, linkContactToPos, loading: linking, error: posError, searchPhase } = usePosCommands();
const toast = useToast();

// ── State ──────────────────────────────────────────────────────
type Step = 'search' | 'confirm';
const step = ref<Step>('search');
const keyword = ref('');
const results = ref<any[]>([]);
const searching = ref(false);
const hasSearched = ref(false);
const lastKeyword = ref('');
const lastSource = ref<'local' | 'mcp' | 'error'>('local');
const searchError = ref<string | null>(null);
const linkError = ref<string | null>(null);
const selectedCustomer = ref<any>(null);
const currentPhase = ref<'local' | 'mcp' | null>(null);
const searchInputRef = ref<HTMLInputElement | null>(null);

// Debounce timer
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

// ── Watchers ───────────────────────────────────────────────────
watch(() => props.modelValue, (isOpen) => {
  if (isOpen) {
    resetAll();
    nextTick(() => searchInputRef.value?.focus());
  }
});

// Track phase spinner from composable
watch(searchPhase, (phase) => {
  currentPhase.value = phase;
});

// ── Methods ────────────────────────────────────────────────────
function resetAll() {
  step.value = 'search';
  keyword.value = '';
  results.value = [];
  searching.value = false;
  hasSearched.value = false;
  lastKeyword.value = '';
  lastSource.value = 'local';
  searchError.value = null;
  linkError.value = null;
  selectedCustomer.value = null;
  currentPhase.value = null;
}

function close() {
  dialog.value = false;
}

function clearSearch() {
  keyword.value = '';
  results.value = [];
  hasSearched.value = false;
  searchError.value = null;
  nextTick(() => searchInputRef.value?.focus());
}

function onKeywordChange() {
  if (debounceTimer) clearTimeout(debounceTimer);
  searchError.value = null;
  if (!keyword.value.trim()) {
    results.value = [];
    hasSearched.value = false;
    return;
  }
  debounceTimer = setTimeout(() => {
    doSearch();
  }, 500);
}

async function doSearch() {
  const kw = keyword.value.trim();
  if (!kw) return;
  if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }

  searching.value = true;
  hasSearched.value = false;
  searchError.value = null;
  results.value = [];
  lastKeyword.value = kw;

  try {
    const res = await searchPosCustomers(kw);
    results.value = res.items || [];
    lastSource.value = (res.source as 'local' | 'mcp') || 'local';
  } catch (err) {
    searchError.value = 'Không thể tìm kiếm. Vui lòng thử lại.';
    results.value = [];
  } finally {
    searching.value = false;
    hasSearched.value = true;
    currentPhase.value = null;
  }
}

function selectCustomer(customer: any) {
  selectedCustomer.value = customer;
  step.value = 'confirm';
  linkError.value = null;
}

function backToSearch() {
  step.value = 'search';
  selectedCustomer.value = null;
  linkError.value = null;
}

async function confirmLink() {
  if (!selectedCustomer.value) return;
  linkError.value = null;

  const result = await linkContactToPos(
    props.contactId,
    selectedCustomer.value.id,
    selectedCustomer.value.code,
    selectedCustomer.value.name,
    selectedCustomer.value.phone,
  );

  if (result && result.success) {
    toast.success('Liên kết khách hàng thành công!');
    emit('linked', {
      posCustomerId: selectedCustomer.value.id,
      posCustomerCode: selectedCustomer.value.code,
      posCustomerName: selectedCustomer.value.name,
    });
    close();
  } else {
    linkError.value = posError.value || result?.error || 'Có lỗi xảy ra khi liên kết';
  }
}

// ── Helpers ────────────────────────────────────────────────────
function isVip(customerType: string): boolean {
  if (!customerType) return false;
  return customerType.toLowerCase().includes('vip') || customerType.toLowerCase().includes('khách vip');
}
</script>

<style scoped>
/* ══ Card wrapper ══ */
.pls-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  overflow: hidden;
}

/* ══ Header ══ */
.pls-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%);
  color: white;
}
.pls-header-inner {
  display: flex;
  align-items: center;
  gap: 10px;
}
.pls-header-icon {
  font-size: 22px;
  color: #60a5fa;
}
.pls-title {
  font-size: 15px;
  font-weight: 700;
  line-height: 1.2;
}
.pls-subtitle {
  font-size: 12px;
  color: #94a3b8;
  margin-top: 2px;
}
.pls-close-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  color: #94a3b8;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;
}
.pls-close-btn:hover:not(:disabled) {
  background: rgba(255,255,255,0.1);
  color: white;
}
.pls-close-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ══ Search bar ══ */
.pls-search-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}
.pls-search-icon {
  font-size: 18px;
  color: #64748b;
  flex-shrink: 0;
}
.pls-search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  color: #1e293b;
  min-width: 0;
}
.pls-search-input::placeholder {
  color: #94a3b8;
}
.pls-clear-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  color: #94a3b8;
  display: flex;
  align-items: center;
  padding: 2px;
  border-radius: 4px;
  transition: color 0.15s;
}
.pls-clear-btn:hover {
  color: #475569;
}
.pls-clear-btn .material-symbols-outlined {
  font-size: 16px;
}
.pls-search-btn {
  background: #0284c7;
  color: white;
  border: none;
  border-radius: 6px;
  padding: 5px 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s;
  flex-shrink: 0;
}
.pls-search-btn:hover:not(:disabled) {
  background: #0369a1;
}
.pls-search-btn:disabled {
  background: #94a3b8;
  cursor: not-allowed;
}

/* ══ Loading states ══ */
.pls-loading-state {
  padding: 20px 16px;
}
.pls-loading-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.pls-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid #e2e8f0;
  border-top-color: #0284c7;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  flex-shrink: 0;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.pls-loading-text {
  font-size: 13px;
  color: #64748b;
  display: flex;
  align-items: center;
  gap: 5px;
}
.pls-loading-mcp {
  color: #0284c7;
  font-weight: 500;
}
.pls-phase-icon {
  font-size: 15px;
}

/* ══ Error ══ */
.pls-error-state {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  color: #dc2626;
  font-size: 13px;
}

/* ══ Results ══ */
.pls-results {
  overflow-y: auto;
  max-height: 300px;
}
.pls-results-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px 6px;
  border-bottom: 1px solid #f1f5f9;
}
.pls-results-count {
  font-size: 11px;
  color: #94a3b8;
}
.pls-source-badge {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 12px;
}
.badge-local {
  background: #f0fdf4;
  color: #16a34a;
}
.badge-mcp {
  background: #eff6ff;
  color: #2563eb;
}
.pls-badge-icon {
  font-size: 12px;
}
.pls-result-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  cursor: pointer;
  transition: background 0.12s;
  border-bottom: 1px solid #f8fafc;
}
.pls-result-row:hover {
  background: #f0f9ff;
}
.pls-result-row:last-child {
  border-bottom: none;
}
.pls-result-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: linear-gradient(135deg, #60a5fa, #3b82f6);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.pls-result-avatar .material-symbols-outlined {
  font-size: 18px;
  color: white;
}
.pls-result-info {
  flex: 1;
  min-width: 0;
}
.pls-result-name {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pls-result-meta {
  font-size: 12px;
  color: #64748b;
  margin-top: 1px;
}
.pls-result-code {
  font-family: monospace;
  background: #f1f5f9;
  padding: 0 4px;
  border-radius: 3px;
  font-size: 11px;
}
.pls-result-phone {
  margin-left: 4px;
}
.pls-result-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.pls-result-arrow {
  font-size: 18px;
  color: #cbd5e1;
}
.pls-type-chip {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 10px;
}
.chip-vip {
  background: #fef3c7;
  color: #92400e;
}
.chip-normal {
  background: #f1f5f9;
  color: #475569;
}

/* ══ Empty states ══ */
.pls-empty-state {
  padding: 28px 20px;
  text-align: center;
}
.pls-empty-icon .material-symbols-outlined {
  font-size: 40px;
  color: #cbd5e1;
}
.pls-empty-title {
  font-size: 14px;
  font-weight: 600;
  color: #475569;
  margin-top: 8px;
}
.pls-empty-desc {
  font-size: 13px;
  color: #94a3b8;
  margin-top: 4px;
}
.pls-create-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 14px;
  padding: 8px 18px;
  background: #0284c7;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
.pls-create-btn:hover {
  background: #0369a1;
}
.pls-create-btn .material-symbols-outlined {
  font-size: 16px;
}
.pls-initial-state {
  padding: 24px 16px;
}
.pls-initial-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #94a3b8;
  background: #f8fafc;
  border-radius: 8px;
  padding: 12px;
}
.pls-hint-icon {
  font-size: 20px;
  color: #cbd5e1;
}

/* ══ Confirm step ══ */
.pls-confirm-body {
  padding: 16px 20px;
}
.pls-compare {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  margin-bottom: 14px;
}
.pls-compare-col {
  flex: 1;
  border-radius: 10px;
  overflow: hidden;
}
.pls-col-crm {
  border: 1px solid #e2e8f0;
  background: #f8fafc;
}
.pls-col-pos {
  border: 2px solid #0284c7;
  background: #f0f9ff;
}
.pls-col-header {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 700;
  color: #475569;
  border-bottom: 1px solid #e2e8f0;
  background: rgba(0,0,0,0.02);
}
.pls-col-pos .pls-col-header {
  color: #0369a1;
  background: rgba(2,132,199,0.06);
  border-bottom-color: rgba(2,132,199,0.2);
}
.pls-col-icon {
  font-size: 15px;
}
.pls-compare-field {
  padding: 7px 12px;
  display: flex;
  flex-direction: column;
  gap: 1px;
  border-bottom: 1px solid rgba(0,0,0,0.04);
}
.pls-compare-field:last-child {
  border-bottom: none;
}
.pls-cf-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #94a3b8;
  font-weight: 600;
}
.pls-cf-val {
  font-size: 13px;
  color: #1e293b;
  font-weight: 500;
}
.pls-val-muted {
  color: #94a3b8;
  font-style: italic;
}
.pls-val-highlight {
  color: #0369a1;
  font-weight: 700;
}
.pls-val-code {
  font-family: monospace;
  font-size: 12px;
  background: #e0f2fe;
  padding: 1px 5px;
  border-radius: 4px;
  width: fit-content;
  color: #0369a1;
}
.pls-compare-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  padding-top: 36px;
  flex-shrink: 0;
}
.pls-compare-arrow .material-symbols-outlined {
  font-size: 22px;
  color: #0284c7;
}
.pls-notice {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  font-size: 12px;
  color: #64748b;
  background: #fafafa;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px 12px;
}
.pls-notice-icon {
  font-size: 16px;
  color: #94a3b8;
  flex-shrink: 0;
  margin-top: 1px;
}
.pls-link-error {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 10px;
  padding: 9px 12px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  font-size: 12px;
  color: #dc2626;
}
.pls-link-error .material-symbols-outlined {
  font-size: 16px;
  flex-shrink: 0;
}

/* ══ Footer ══ */
.pls-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
}
.pls-btn-ghost {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 7px 14px;
  background: transparent;
  border: 1px solid #cbd5e1;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 500;
  color: #475569;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
}
.pls-btn-ghost:hover:not(:disabled) {
  background: #f1f5f9;
  border-color: #94a3b8;
}
.pls-btn-ghost:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.pls-btn-ghost .material-symbols-outlined {
  font-size: 15px;
}
.pls-btn-confirm {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 18px;
  background: linear-gradient(135deg, #0284c7, #0369a1);
  color: white;
  border: none;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.1s;
  box-shadow: 0 2px 8px rgba(2,132,199,0.25);
}
.pls-btn-confirm:hover:not(:disabled) {
  opacity: 0.92;
  transform: translateY(-1px);
}
.pls-btn-confirm:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}
.pls-btn-confirm .material-symbols-outlined {
  font-size: 17px;
}
.pls-btn-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
</style>
