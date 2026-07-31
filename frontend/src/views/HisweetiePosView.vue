<!--
  HisweetiePosView — browse POS data via MCP (no curl).
  Route: /settings/channels/hisweetie-pos
  Calls backend /api/v1/integrations/hisweetie/* (JWT already in api client).
-->
<template>
  <div class="hsp">
    <div class="hsp-head">
      <div>
        <h1 class="hsp-title">
          <v-icon class="mr-2" color="primary">mdi-storefront-outline</v-icon>
          Hisweetie POS
        </h1>
        <p class="hsp-sub">Xem dữ liệu POS qua MCP (chỉ đọc). Cấu hình env backend: HISWEETIE_MCP_*.</p>
      </div>
      <v-btn variant="tonal" prepend-icon="mdi-refresh" :loading="loadingStatus" @click="refreshAll">Làm mới</v-btn>
    </div>

    <v-alert v-if="error" type="error" variant="tonal" class="mb-4" closable @click:close="error = ''">
      {{ error }}
    </v-alert>

    <!-- Connection status -->
    <v-card class="mb-4 pa-4" variant="outlined">
      <div class="d-flex flex-wrap align-center ga-3">
        <v-chip :color="status?.configured ? 'success' : 'warning'" variant="flat" size="small">
          {{ status?.configured ? 'Đã cấu hình' : 'Chưa cấu hình' }}
        </v-chip>
        <span v-if="status?.baseUrl" class="text-body-2 text-medium-emphasis">{{ status.baseUrl }}</span>
        <span v-if="status?.clientIdHint" class="text-caption">client: {{ status.clientIdHint }}</span>
        <v-spacer />
        <v-chip v-if="health" :color="health.ok ? 'success' : 'error'" size="small" variant="tonal">
          MCP health: {{ health.ok ? 'OK' : 'Lỗi' }}
          <template v-if="health.status"> ({{ health.status }})</template>
        </v-chip>
      </div>
      <div v-if="!status?.configured" class="text-body-2 mt-3 text-medium-emphasis">
        Thêm vào <code>backend/.env</code>:
        <code>HISWEETIE_MCP_URL</code>, <code>HISWEETIE_CLIENT_ID</code>, <code>HISWEETIE_CLIENT_SECRET</code>
        rồi restart backend.
      </div>
    </v-card>

    <v-tabs v-model="tab" color="primary" class="mb-3">
      <v-tab value="branches">Chi nhánh</v-tab>
      <v-tab value="customers">Khách hàng POS</v-tab>
      <v-tab value="products">Sản phẩm</v-tab>
    </v-tabs>

    <v-window v-model="tab">
      <!-- Branches -->
      <v-window-item value="branches">
        <v-card variant="outlined">
          <v-card-title class="d-flex align-center">
            Chi nhánh
            <v-spacer />
            <v-btn size="small" variant="text" :loading="loadingBranches" @click="loadBranches">Tải lại</v-btn>
          </v-card-title>
          <v-data-table
            :headers="branchHeaders"
            :items="branches"
            :loading="loadingBranches"
            density="compact"
            item-value="id"
            class="elevation-0"
          >
            <template #item.id="{ item }">{{ item.id }}</template>
            <template #item.name="{ item }">{{ item.name ?? '—' }}</template>
            <template #item.code="{ item }">{{ item.code ?? '—' }}</template>
            <template #item.address="{ item }">{{ item.address ?? '—' }}</template>
          </v-data-table>
        </v-card>
      </v-window-item>

      <!-- Customers -->
      <v-window-item value="customers">
        <v-card variant="outlined">
          <v-card-title class="d-flex flex-wrap align-center ga-2">
            Khách hàng POS
            <v-spacer />
            <v-text-field
              v-model="customerSearch"
              density="compact"
              hide-details
              placeholder="Tìm tên / SĐT…"
              style="max-width: 220px"
              clearable
              @keyup.enter="loadCustomers"
            />
            <v-btn size="small" color="primary" :loading="loadingCustomers" @click="loadCustomers">Tìm / Tải</v-btn>
          </v-card-title>
          <div class="px-4 pb-2 text-caption text-medium-emphasis">
            Offset {{ customerOffset }} · trang {{ customers.length }} dòng
            <v-btn size="x-small" variant="text" :disabled="customerOffset === 0 || loadingCustomers" @click="prevCustomers">‹ Trước</v-btn>
            <v-btn size="x-small" variant="text" :disabled="customers.length < pageSize || loadingCustomers" @click="nextCustomers">Sau ›</v-btn>
          </div>
          <v-data-table
            :headers="customerHeaders"
            :items="customers"
            :loading="loadingCustomers"
            density="compact"
            item-value="id"
            class="elevation-0"
          >
            <template #item.id="{ item }">{{ item.id }}</template>
            <template #item.code="{ item }">{{ item.code ?? '—' }}</template>
            <template #item.name="{ item }">{{ item.name ?? '—' }}</template>
            <template #item.phone="{ item }">{{ item.phone || item.contactNumber || '—' }}</template>
            <template #item.email="{ item }">{{ item.email ?? '—' }}</template>
          </v-data-table>
        </v-card>
      </v-window-item>

      <!-- Products -->
      <v-window-item value="products">
        <v-card variant="outlined">
          <v-card-title class="d-flex flex-wrap align-center ga-2">
            Sản phẩm
            <v-spacer />
            <v-select
              v-model="productBranchId"
              :items="branchSelectItems"
              density="compact"
              hide-details
              label="Chi nhánh"
              style="max-width: 200px"
              clearable
            />
            <v-btn size="small" color="primary" :loading="loadingProducts" @click="loadProducts">Tải</v-btn>
          </v-card-title>
          <div class="px-4 pb-2 text-caption text-medium-emphasis">
            Trang {{ productPage }}
            <v-btn size="x-small" variant="text" :disabled="productPage <= 1 || loadingProducts" @click="productPage--; loadProducts()">‹ Trước</v-btn>
            <v-btn size="x-small" variant="text" :disabled="products.length < pageSize || loadingProducts" @click="productPage++; loadProducts()">Sau ›</v-btn>
          </div>
          <v-data-table
            :headers="productHeaders"
            :items="products"
            :loading="loadingProducts"
            density="compact"
            item-value="id"
            class="elevation-0"
          >
            <template #item.id="{ item }">{{ item.id }}</template>
            <template #item.code="{ item }">{{ item.code ?? item.productCode ?? '—' }}</template>
            <template #item.name="{ item }">{{ item.name ?? item.productName ?? '—' }}</template>
            <template #item.basePrice="{ item }">{{ formatMoney(item.basePrice ?? item.price) }}</template>
          </v-data-table>
        </v-card>
      </v-window-item>
    </v-window>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { api } from '@/api';

const tab = ref('branches');
const error = ref('');
const pageSize = 20;

const status = ref<{ configured: boolean; baseUrl: string | null; clientIdHint: string | null } | null>(null);
const health = ref<{ ok: boolean; status?: number } | null>(null);
const loadingStatus = ref(false);

const branches = ref<Record<string, any>[]>([]);
const loadingBranches = ref(false);

const customers = ref<Record<string, any>[]>([]);
const loadingCustomers = ref(false);
const customerSearch = ref('');
const customerOffset = ref(0);

const products = ref<Record<string, any>[]>([]);
const loadingProducts = ref(false);
const productPage = ref(1);
const productBranchId = ref<number | null>(null);

const branchHeaders = [
  { title: 'ID', key: 'id', width: '80px' },
  { title: 'Tên', key: 'name' },
  { title: 'Mã', key: 'code' },
  { title: 'Địa chỉ', key: 'address' },
];
const customerHeaders = [
  { title: 'ID', key: 'id', width: '90px' },
  { title: 'Mã', key: 'code' },
  { title: 'Tên', key: 'name' },
  { title: 'SĐT', key: 'phone' },
  { title: 'Email', key: 'email' },
];
const productHeaders = [
  { title: 'ID', key: 'id', width: '90px' },
  { title: 'Mã', key: 'code' },
  { title: 'Tên', key: 'name' },
  { title: 'Giá', key: 'basePrice' },
];

const branchSelectItems = computed(() =>
  branches.value.map((b) => ({ title: b.name || `CN ${b.id}`, value: b.id })),
);

function unwrapList(payload: any): Record<string, any>[] {
  if (!payload) return [];
  // Prefer new backend shape: { items: [...] }
  if (Array.isArray(payload.items)) return payload.items;
  // Legacy / nested MCP shapes
  let d = payload.data ?? payload;
  if (d && typeof d === 'object' && !Array.isArray(d) && Array.isArray(d.data)) d = d.data;
  if (Array.isArray(d)) return d;
  if (d && typeof d === 'object') {
    for (const k of ['items', 'customers', 'products', 'branches', 'result', 'rows']) {
      if (Array.isArray(d[k])) return d[k];
    }
  }
  console.warn('[hisweetie-pos] could not unwrap list payload keys:', payload && typeof payload === 'object' ? Object.keys(payload) : payload);
  return [];
}

function formatMoney(v: unknown): string {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString('vi-VN') + ' ₫';
}

async function loadStatus() {
  loadingStatus.value = true;
  try {
    const { data } = await api.get('/integrations/hisweetie/status');
    status.value = data;
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Không tải được trạng thái MCP';
    status.value = { configured: false, baseUrl: null, clientIdHint: null };
  } finally {
    loadingStatus.value = false;
  }
}

async function loadHealth() {
  try {
    const { data } = await api.get('/integrations/hisweetie/health');
    health.value = { ok: !!data.ok, status: data.status };
  } catch {
    health.value = { ok: false };
  }
}

async function loadBranches() {
  loadingBranches.value = true;
  error.value = '';
  try {
    const { data } = await api.get('/integrations/hisweetie/branches');
    branches.value = unwrapList(data);
    if (!branches.value.length && data) {
      error.value = 'MCP trả về 0 chi nhánh (hoặc format không nhận diện được). Kiểm tra backend log / quyền POS service account.';
    }
  } catch (err: any) {
    error.value = err.response?.data?.error || err.response?.data?.detail || 'Lỗi tải chi nhánh';
    branches.value = [];
  } finally {
    loadingBranches.value = false;
  }
}

async function loadCustomers() {
  loadingCustomers.value = true;
  error.value = '';
  try {
    const params: Record<string, string | number> = {};
    if (customerSearch.value.trim()) {
      params.search = customerSearch.value.trim();
    } else {
      params.currentItem = customerOffset.value;
      params.pageSize = pageSize;
    }
    const { data } = await api.get('/integrations/hisweetie/customers', { params });
    customers.value = unwrapList(data);
  } catch (err: any) {
    error.value = err.response?.data?.error || err.response?.data?.detail || 'Lỗi tải khách hàng POS';
    customers.value = [];
  } finally {
    loadingCustomers.value = false;
  }
}

function prevCustomers() {
  customerOffset.value = Math.max(0, customerOffset.value - pageSize);
  loadCustomers();
}
function nextCustomers() {
  customerOffset.value += pageSize;
  loadCustomers();
}

async function loadProducts() {
  loadingProducts.value = true;
  error.value = '';
  try {
    const params: Record<string, string | number> = { page: productPage.value, limit: pageSize };
    if (productBranchId.value != null) params.branchId = productBranchId.value;
    const { data } = await api.get('/integrations/hisweetie/products', { params });
    products.value = unwrapList(data);
  } catch (err: any) {
    error.value = err.response?.data?.error || err.response?.data?.detail || 'Lỗi tải sản phẩm';
    products.value = [];
  } finally {
    loadingProducts.value = false;
  }
}

async function refreshAll() {
  await loadStatus();
  if (status.value?.configured) {
    await loadHealth();
    await loadBranches();
    if (tab.value === 'customers') await loadCustomers();
    if (tab.value === 'products') await loadProducts();
  }
}

watch(tab, (t) => {
  if (!status.value?.configured) return;
  if (t === 'branches' && !branches.value.length) loadBranches();
  if (t === 'customers' && !customers.value.length) loadCustomers();
  if (t === 'products' && !products.value.length) loadProducts();
});

onMounted(async () => {
  await loadStatus();
  if (status.value?.configured) {
    await loadHealth();
    await loadBranches();
  }
});
</script>

<style scoped>
.hsp { max-width: 1100px; }
.hsp-head {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 12px; margin-bottom: 16px; flex-wrap: wrap;
}
.hsp-title {
  font-size: 1.5rem; font-weight: 600; margin: 0;
  display: flex; align-items: center;
}
.hsp-sub { margin: 4px 0 0; font-size: 13px; color: #64748b; }
code {
  font-size: 12px; background: #f1f5f9; padding: 1px 5px; border-radius: 4px;
}
</style>
