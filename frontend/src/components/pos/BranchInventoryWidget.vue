<template>
  <div class="sp-inventory-widget pa-3 rounded-lg border bg-white">
    <!-- Header -->
    <div class="d-flex align-center justify-space-between mb-2">
      <div class="d-flex align-center">
        <span class="material-symbols-outlined text-primary mr-1 font-18">inventory_2</span>
        <span class="font-weight-bold slate-dark font-14">Tra cứu tồn kho chi nhánh</span>
      </div>
      <span class="text-caption text-grey">Multi-branch realtime</span>
    </div>

    <!-- Search Controls -->
    <div class="sp-inventory-search-row d-flex gap-2 mb-2 align-center flex-wrap">
      <div class="sp-search-input-wrap flex-grow-1 position-relative" style="min-width: 160px;">
        <input
          v-model="searchKeyword"
          type="text"
          class="sp-search-input w-100 pa-2 rounded border font-13"
          placeholder="Nhập tên hoặc mã sản phẩm (SKU)..."
          @keyup.enter="searchInventory"
        />
        <span
          v-if="searchKeyword"
          class="material-symbols-outlined position-absolute right-2 top-2 text-grey cursor-pointer font-16"
          style="right: 8px; top: 8px;"
          @click="searchKeyword = ''; searchResults = []; hasSearched = false"
        >close</span>
      </div>

      <select v-model="selectedBranchId" class="sp-branch-select pa-2 rounded border text-caption" @change="searchInventory">
        <option :value="null">Tất cả chi nhánh</option>
        <option v-for="b in branchList" :key="b.id" :value="b.id">{{ b.name }}</option>
      </select>

      <select v-model="selectedStatus" class="sp-status-select sp-status-chip pa-2 rounded border text-caption" @change="searchInventory">
        <option :value="null">All (Tất cả)</option>
        <option value="InStock">InStock</option>
        <option value="LowStock">LowStock</option>
        <option value="OutOfStock">OutOfStock</option>
      </select>

      <v-btn
        size="small"
        color="primary"
        variant="flat"
        class="text-none font-weight-medium"
        :loading="loading"
        @click="searchInventory"
      >
        <span class="material-symbols-outlined font-18">search</span>
      </v-btn>
    </div>

    <!-- Status filter chips -->
    <div class="d-flex gap-1 mb-3 align-center flex-wrap">
      <button
        v-for="s in statusOptions"
        :key="s.value || 'all'"
        type="button"
        class="sp-status-chip text-caption px-2 py-0-5 rounded border cursor-pointer"
        :class="selectedStatus === s.value ? 'bg-primary text-white border-primary font-weight-bold' : 'bg-grey-lighten-4 text-grey-darken-2 border-grey-lighten-2'"
        @click="selectedStatus = s.value; searchInventory()"
      >
        {{ s.label }}
      </button>
    </div>

    <!-- Results Area -->
    <div v-if="loading" class="text-center py-3">
      <v-progress-circular indeterminate size="18" width="2" color="primary" />
      <span class="text-caption text-grey ml-2">Đang tra cứu tồn kho...</span>
    </div>

    <div v-else-if="searchResults.length > 0" class="sp-inventory-results max-h-56 overflow-y-auto pr-1">
      <div
        v-for="item in searchResults"
        :key="item.id"
        class="sp-inventory-item-card pa-2 mb-2 rounded border bg-grey-lighten-5 d-flex justify-space-between align-center"
      >
        <div class="sp-inventory-item-info">
          <div class="font-weight-bold text-caption slate-dark">
            {{ item.productName }}
            <span class="text-grey font-mono ml-1">({{ item.productCode }})</span>
          </div>
          <div class="text-caption text-grey-darken-1 mt-1">
            🏢 {{ item.branchName }} · Tồn thực: <strong>{{ item.onHand }}</strong> (Khả dụng: <strong class="text-primary">{{ item.available }}</strong>)
          </div>
        </div>

        <div class="d-flex align-center gap-2">
          <span
            class="sp-stock-badge text-caption px-2 py-0-5 rounded font-weight-bold"
            :class="{
              'bg-green-100 text-green-700': item.status === 'InStock' || item.available > 5,
              'bg-amber-100 text-amber-800': item.status === 'LowStock' || (item.available > 0 && item.available <= 5),
              'bg-red-100 text-red-700': item.status === 'OutOfStock' || item.available <= 0
            }"
          >
            {{ (item.status === 'InStock' || item.available > 5) ? '🟢 Còn hàng' : (item.available > 0 ? '🟡 Sắp hết' : '🔴 Hết hàng') }}
          </span>

          <v-btn
            icon
            size="x-small"
            variant="tonal"
            color="primary"
            title="Chèn thông tin tồn kho vào khung chat"
            @click="insertStockInfo(item)"
          >
            <span class="material-symbols-outlined font-16">content_paste</span>
          </v-btn>
        </div>
      </div>
    </div>

    <div v-else-if="hasSearched" class="text-caption text-grey text-center py-3">
      Không tìm thấy sản phẩm phù hợp.
    </div>

    <div v-else class="text-caption text-grey-darken-1 text-center py-2">
      💡 Nhập tên/SKU sản phẩm để kiểm tra số lượng tồn kho theo chi nhánh.
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '@/api/index';
import { useToast } from '@/composables/use-toast';

export interface PosBranchInventoryItem {
  id: string;
  posProductId: number;
  productCode: string;
  productName: string;
  branchId: number;
  branchName: string;
  onHand: number;
  reserved: number;
  available: number;
  status: 'InStock' | 'LowStock' | 'OutOfStock';
}

const props = defineProps<{
  branches?: Array<{ id: number; name: string }>;
}>();

const emit = defineEmits<{
  'insert-inventory-info': [text: string];
}>();

const toast = useToast();

const searchKeyword = ref('');
const selectedBranchId = ref<number | null>(null);
const selectedStatus = ref<string | null>(null);
const branchList = ref<Array<{ id: number; name: string }>>([]);
const searchResults = ref<PosBranchInventoryItem[]>([]);
const loading = ref(false);
const hasSearched = ref(false);

const statusOptions = [
  { label: 'All', value: null },
  { label: 'InStock', value: 'InStock' },
  { label: 'LowStock', value: 'LowStock' },
  { label: 'OutOfStock', value: 'OutOfStock' },
];

async function loadBranches() {
  if (props.branches && props.branches.length > 0) {
    branchList.value = props.branches;
    return;
  }
  try {
    const res = await api.get('/pos/branches');
    if (res.data?.success && Array.isArray(res.data.data)) {
      branchList.value = res.data.data;
    }
  } catch (err) {
    console.error('[BranchInventoryWidget] Error loading branches:', err);
  }
}

async function searchInventory() {
  if (!searchKeyword.value.trim() && !selectedBranchId.value && !selectedStatus.value) {
    searchResults.value = [];
    hasSearched.value = false;
    return;
  }
  loading.value = true;
  hasSearched.value = true;
  try {
    const res = await api.get('/pos/inventory', {
      params: {
        keyword: searchKeyword.value.trim(),
        branchId: selectedBranchId.value,
        status: selectedStatus.value,
      },
    });

    const items = res.data?.data?.items || res.data?.items || [];
    searchResults.value = items;
  } catch (err) {
    console.error('[BranchInventoryWidget] Error searching inventory:', err);
  } finally {
    loading.value = false;
  }
}

function insertStockInfo(item: PosBranchInventoryItem) {
  const statusStr = (item.status === 'InStock' || item.available > 5) ? 'Còn hàng' : (item.available > 0 ? 'Sắp hết' : 'Hết hàng');
  const text = `Sản phẩm: ${item.productName} (${item.productCode})\nChi nhánh: ${item.branchName}\nSố lượng tồn: ${item.onHand} | Khả dụng: ${item.available} (${statusStr})`;

  emit('insert-inventory-info', text);
  window.dispatchEvent(new CustomEvent('chat:insert-suggestion', { detail: { text } }));
  toast.success('Đã chèn thông tin tồn kho vào khung chat!');
}

onMounted(() => {
  loadBranches();
});
</script>

<style scoped>
.sp-search-input {
  outline: none;
  border-color: #cbd5e1;
}
.sp-search-input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
}
.sp-branch-select {
  outline: none;
  background-color: #fff;
  border-color: #cbd5e1;
}
.sp-inventory-results {
  max-height: 240px;
}
</style>
