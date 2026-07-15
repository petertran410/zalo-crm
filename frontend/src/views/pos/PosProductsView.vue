<template>
  <div class="pos-products-page pa-6">
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
          <h1 class="text-h4 font-weight-bold slate-dark mb-1">Sản phẩm POS</h1>
          <p class="text-body-2 grey--text text--darken-1 mb-0">Tra cứu danh mục sản phẩm đồng bộ từ KiotViet POS</p>
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
      <!-- Custom price cell formatting with tabular numbers -->
      <template #cell-basePrice="{ item }">
        <span class="font-weight-medium primary--text tabular-nums">
          {{ formatCurrency(item.basePrice) }}
        </span>
      </template>

      <!-- Custom SKU/Code formatting -->
      <template #cell-code="{ item }">
        <span class="sku-badge font-mono text-caption">{{ item.code }}</span>
      </template>
    </GenericDataTable>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { usePagination } from '@/composables/use-pagination';
import GenericDataTable from '@/components/ui/GenericDataTable.vue';

const columns = [
  { key: 'code', label: 'Mã Sản Phẩm (SKU)', sortable: true, style: { width: '220px' } },
  { key: 'name', label: 'Tên Sản Phẩm', sortable: true },
  { key: 'basePrice', label: 'Giá Bán POS', sortable: true, style: { width: '180px' } },
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
  endpoint: '/pos/products',
  defaultSortBy: 'code',
  defaultSortOrder: 'asc',
});

onMounted(() => {
  loadPage();
});

function onSort(key: string) {
  sort(key);
}

function formatCurrency(val: number | null | undefined) {
  if (val == null) return '—';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);
}
</script>

<style scoped>
.pos-products-page {
  background-color: #f8fafc;
  height: calc(100vh - 48px);
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

.tabular-nums {
  font-variant-numeric: tabular-nums;
  font-family: monospace, sans-serif;
  letter-spacing: -0.2px;
}
</style>
