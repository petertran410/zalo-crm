<template>
  <div class="generic-data-table-container">
    <!-- Search and Actions Toolbar -->
    <div class="table-toolbar mb-4 d-flex justify-space-between align-center flex-wrap gap-4">
      <div class="search-box-wrapper">
        <slot name="search">
          <v-text-field
            v-model="searchQuery"
            placeholder="Nhập từ khóa tìm kiếm..."
            prepend-inner-icon="mdi-magnify"
            hide-details
            variant="outlined"
            density="compact"
            clearable
            class="premium-search-input"
            @input="onSearch"
            @click:clear="onClearSearch"
          />
        </slot>
      </div>
      <div class="toolbar-actions d-flex align-center gap-3">
        <slot name="actions" />
      </div>
    </div>

    <!-- Table Card -->
    <v-card class="table-card elevation-0 outlined-slate-border">
      <v-table fixed-header class="premium-table">
        <thead>
          <tr>
            <th
              v-for="col in columns"
              :key="col.key"
              :class="{ 'sortable-header': col.sortable }"
              :style="col.style"
              @click="col.sortable && handleSort(col.key)"
            >
              <div class="header-inner d-flex align-center gap-1">
                <span class="header-label">{{ col.label }}</span>
                <span v-if="col.sortable" class="sort-indicator">
                  <v-icon v-if="currentSortBy !== col.key" size="14" class="inactive-sort">mdi-swap-vertical</v-icon>
                  <v-icon v-else-if="currentSortOrder === 'asc'" size="14" color="primary">mdi-arrow-up</v-icon>
                  <v-icon v-else size="14" color="primary">mdi-arrow-down</v-icon>
                </span>
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          <!-- Loading State -->
          <tr v-if="loading && items.length === 0">
            <td :colspan="columns.length" class="text-center py-12">
              <v-progress-circular indeterminate color="primary" size="32" width="3" />
              <div class="mt-3 text-caption text-slate-500">Đang cập nhật danh sách...</div>
            </td>
          </tr>
          <!-- Empty State -->
          <tr v-else-if="items.length === 0">
            <td :colspan="columns.length" class="text-center py-12">
              <v-icon size="40" color="grey-lighten-1" class="mb-2">mdi-database-off-outline</v-icon>
              <div class="text-subtitle-2 font-weight-bold text-slate-600">Không tìm thấy dữ liệu</div>
              <div class="text-caption text-slate-400">Không có bản ghi nào khớp với điều kiện tìm kiếm.</div>
            </td>
          </tr>
          <!-- Data Rows -->
          <tr v-else v-for="(item, index) in items" :key="index" class="table-row">
            <td v-for="col in columns" :key="col.key">
              <slot :name="`cell-${col.key}`" :item="item">
                <span class="cell-text">{{ item[col.key] != null ? item[col.key] : '—' }}</span>
              </slot>
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-card>

    <!-- Pagination Footer -->
    <div class="table-footer mt-4 d-flex justify-space-between align-center flex-wrap gap-3">
      <div class="footer-info text-caption text-slate-500">
        Hiển thị tối đa <span class="font-weight-bold text-slate-700">{{ items.length }}</span> bản ghi trang này
      </div>
      <div class="footer-nav d-flex align-center gap-2">
        <v-btn
          :disabled="!hasPrev"
          variant="outlined"
          density="comfortable"
          color="slate"
          class="nav-btn text-capitalize"
          @click="$emit('prev')"
        >
          <v-icon left size="16">mdi-chevron-left</v-icon>Trước
        </v-btn>
        <v-btn
          :disabled="!hasNext"
          variant="outlined"
          density="comfortable"
          color="slate"
          class="nav-btn text-capitalize"
          @click="$emit('next')"
        >
          Sau<v-icon right size="16">mdi-chevron-right</v-icon>
        </v-btn>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  columns: Array<{ key: string; label: string; sortable?: boolean; style?: Record<string, string> }>;
  items: any[];
  loading: boolean;
  hasNext: boolean;
  hasPrev: boolean;
  currentSortBy?: string;
  currentSortOrder?: 'asc' | 'desc';
}>();

const emit = defineEmits(['search', 'sort', 'next', 'prev']);

const searchQuery = ref('');
let searchTimeout: ReturnType<typeof setTimeout>;

function onSearch() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    emit('search', searchQuery.value || '');
  }, 300);
}

function onClearSearch() {
  searchQuery.value = '';
  emit('search', '');
}

function handleSort(key: string) {
  emit('sort', key);
}
</script>

<style scoped>
.generic-data-table-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.table-toolbar {
  flex-shrink: 0;
}

.search-box-wrapper {
  flex: 1;
  max-width: 400px;
}

.premium-search-input :deep(.v-field__outline) {
  --v-field-border-opacity: 0.12;
}

.premium-search-input :deep(.v-field--focused .v-field__outline) {
  --v-field-border-opacity: 1;
  color: var(--v-theme-primary);
}

.outlined-slate-border {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background-color: #ffffff;
  overflow: hidden;
}

.table-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.premium-table {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.premium-table :deep(.v-table__wrapper) {
  flex: 1;
  overflow-y: auto;
}

.premium-table :deep(th) {
  height: 48px !important;
  background-color: #f8fafc !important;
  border-bottom: 2px solid #edf2f7 !important;
  padding: 0 16px !important;
}

.header-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: #64748b;
}

.sortable-header {
  cursor: pointer;
  user-select: none;
  transition: background-color 0.2s ease;
}

.sortable-header:hover {
  background-color: #f1f5f9 !important;
}

.inactive-sort {
  color: #94a3b8;
  opacity: 0.6;
}

.premium-table :deep(td) {
  height: 48px !important;
  padding: 0 16px !important;
  border-bottom: 1px solid #f1f5f9 !important;
  font-size: 13px;
  color: #334155;
}

.table-row {
  transition: background-color 0.15s ease;
}

.table-row:hover {
  background-color: #f8fafc;
}

.cell-text {
  line-height: 1.4;
}

.gap-1 {
  gap: 4px;
}

.gap-2 {
  gap: 8px;
}

.gap-3 {
  gap: 12px;
}

.gap-4 {
  gap: 16px;
}

.text-slate-500 {
  color: #64748b;
}

.text-slate-600 {
  color: #475569;
}

.text-slate-700 {
  color: #334155;
}

.nav-btn {
  border-color: #cbd5e1 !important;
  color: #475569 !important;
  font-weight: 600;
  font-size: 13px;
  border-radius: 8px !important;
  background-color: #ffffff;
  transition: all 0.2s ease;
}

.nav-btn:hover:not(:disabled) {
  background-color: #f8fafc;
  border-color: #94a3b8 !important;
  color: #1e293b !important;
}

.table-footer {
  flex-shrink: 0;
}
</style>
