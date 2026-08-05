<template>
  <div class="pos-customers-page pa-6">
    <!-- Page Header with Back Navigation -->
    <header class="d-flex justify-space-between align-center mb-6">
      <div class="d-flex align-center">
        <v-btn
          icon
          to="/pos"
          class="mr-3 back-btn"
          elevation="1"
          color="white"
          title="Quay lại POS Hub"
        >
          <v-icon color="grey darken-2">mdi-arrow-left</v-icon>
        </v-btn>
        <div>
          <h1 class="text-h4 font-weight-bold slate-dark mb-1">Khách hàng POS</h1>
          <p class="text-body-2 grey--text text--darken-1 mb-0">Quản lý và tra cứu khách hàng đồng bộ từ KiotViet POS</p>
        </div>
      </div>
    </header>

    <!-- Data Table -->
    <GenericDataTable
      :columns="columns"
      :items="items"
      :loading="loading"
      :hasNext="hasNext"
      :hasPrev="hasPrev"
      :current-sort-by="state.sortBy"
      :current-sort-order="state.sortOrder"
      @search="search"
      @sort="onSort"
      @next="nextPage"
      @prev="prevPage"
    >
      <!-- Custom code formatting -->
      <template #cell-code="{ item }">
        <span class="sku-badge font-mono text-caption">{{ item.code || '—' }}</span>
      </template>

      <!-- Custom phone number formatting -->
      <template #cell-phone="{ item }">
        <span v-if="item.phone" class="phone-num font-mono text-body-2">{{ item.phone }}</span>
        <span v-else class="grey--text">——</span>
      </template>

      <!-- Custom customer tags formatting -->
      <template #cell-tags="{ item }">
        <div class="d-flex flex-wrap gap-1">
          <v-chip
            v-for="tag in parseTags(item.tags)"
            :key="tag"
            x-small
            outlined
            color="primary"
            class="text-caption px-2"
            style="height: 20px; border-radius: 4px;"
          >
            {{ tag }}
          </v-chip>
          <span v-if="parseTags(item.tags).length === 0" class="grey--text text--lighten-1">—</span>
        </div>
      </template>

      <!-- Custom address text formatting -->
      <template #cell-address="{ item }">
        <span class="text-caption grey--text text--darken-2" :title="item.address">
          {{ truncateString(item.address, 36) }}
        </span>
      </template>
    </GenericDataTable>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { usePagination } from '@/composables/use-pagination';
import GenericDataTable from '@/components/ui/GenericDataTable.vue';

const columns = [
  { key: 'code', label: 'Mã Khách Hàng', sortable: true, style: { width: '160px' } },
  { key: 'name', label: 'Họ Tên', sortable: true },
  { key: 'phone', label: 'Số Điện Thoại', sortable: true, style: { width: '150px' } },
  { key: 'customerType', label: 'Nhóm Khách Hàng', style: { width: '160px' } },
  { key: 'tags', label: 'Nhãn POS', style: { width: '180px' } },
  { key: 'address', label: 'Địa Chỉ' },
  { key: 'assignedSaleName', label: 'Sale Phụ Trách', style: { width: '160px' } },
];

const {
  items,
  loading,
  hasNext,
  hasPrev,
  state,
  loadPage,
  nextPage,
  prevPage,
  search,
  sort,
} = usePagination({
  endpoint: '/pos/customers',
  defaultSortBy: 'name',
  defaultSortOrder: 'asc',
});

onMounted(() => {
  loadPage();
});

function onSort(key: string) {
  sort(key);
}

function truncateString(str: string | null | undefined, length: number) {
  if (!str) return '—';
  if (str.length <= length) return str;
  return str.slice(0, length) + '...';
}

function parseTags(tags: any) {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags;
  try {
    const parsed = typeof tags === 'string' ? JSON.parse(tags) : tags;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
</script>

<style scoped>
.pos-customers-page {
  background-color: #f8fafc;
  height: calc(100vh - var(--smax-topnav-h));
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.slate-dark {
  color: #1e293b;
}

.back-btn {
  border: 1px solid #e2e8f0;
}

.sku-badge {
  background-color: #f1f5f9;
  color: #475569;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
}

.phone-num {
  letter-spacing: -0.3px;
  color: #0284c7;
}

.gap-1 {
  gap: 4px;
}
</style>
