<template>
  <main class="customers-page">
    <header><div><h1>Khách hàng</h1><span>{{ total }} hồ sơ trong phạm vi truy cập</span></div><RouterLink to="/contacts">Danh bạ Zalo</RouterLink></header>
    <nav v-if="summary" class="customer-summary" aria-label="Tổng hợp khách hàng">
      <button v-for="entry in summaryOptions" :key="entry.key" @click="applySummary(entry.key)"><strong>{{ summary[entry.key] ?? 0 }}</strong>{{ entry.label }}</button>
    </nav>
    <form class="customer-filters" @submit.prevent="offset = 0; load()">
      <input v-model="search" aria-label="Tìm khách" placeholder="Tên, điện thoại, tên quán hoặc mã POS" />
      <select v-model="segment" aria-label="Tệp khách"><option value="">Tất cả tệp khách</option><option value="retail">Khách lẻ</option><option value="chain">Khách chuỗi</option><option value="wholesale">Khách buôn</option></select>
      <select v-model="potential" aria-label="Tiềm năng"><option value="">Mọi mức tiềm năng</option><option value="unrated">Chưa đánh giá</option><option value="cold">Thấp</option><option value="warm">Trung bình</option><option value="hot">Cao</option></select>
      <select v-model="owner" aria-label="Người phụ trách"><option value="">Tất cả sale</option><option v-for="u in staff" :key="u.id" :value="u.id">{{ u.fullName }}</option></select>
      <label><input v-model="purchased" type="checkbox" />Đã mua hàng</label>
      <label><input v-model="debt" type="checkbox" />Có công nợ</label><label><input v-model="overdue" type="checkbox" />Việc quá hạn</label>
      <button type="submit" :disabled="loading"><Search :size="16" />Lọc</button>
    </form>
    <p v-if="error" role="alert">{{ error }} <button @click="load">Thử lại</button></p>
    <p v-else-if="loading" role="status">Đang tải khách hàng...</p>
    <div v-else class="customer-table">
      <table><thead><tr><th>Khách hàng</th><th>Tệp khách</th><th>Tiềm năng</th><th>Sale phụ trách</th><th>Mã POS</th></tr></thead>
        <tbody><tr v-for="c in customers" :key="c.id"><td><RouterLink :to="`/customers/${c.id}`">{{ c.crmName || c.fullName || 'Chưa có tên' }}</RouterLink><small>{{ c.phone }}</small></td><td>{{ segments[c.workspace?.segment || 'retail'] }}</td><td>{{ potentials[c.workspace?.potential || 'unrated'] }}</td><td>{{ c.assignedUser?.fullName || 'Chưa phân công' }}</td><td>{{ c._count.posLinks }}</td></tr></tbody>
      </table>
      <p v-if="!customers.length">Không có khách phù hợp.</p>
    </div>
    <footer><button :disabled="loading || offset === 0" title="Trang trước" @click="offset -= 30; load()"><ChevronLeft :size="18" /></button><span>{{ total ? offset + 1 : 0 }}–{{ Math.min(offset + 30, total) }} / {{ total }}</span><button :disabled="loading || offset + 30 >= total" title="Trang sau" @click="offset += 30; load()"><ChevronRight :size="18" /></button></footer>
  </main>
</template>
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ChevronLeft, ChevronRight, Search } from 'lucide-vue-next';
import { api } from '@/api';
const customers = ref<any[]>([]), total = ref(0), offset = ref(0), loading = ref(false), error = ref('');
const search = ref(''), segment = ref(''), potential = ref(''), debt = ref(false), overdue = ref(false);
const owner = ref(''), purchased = ref(false), staff = ref<Array<{id:string;fullName:string}>>([]);
const summary = ref<Record<string, number> | null>(null);
const summaryOptions = [{ key: 'retail', label: 'Khách lẻ' }, { key: 'chain', label: 'Khách chuỗi' }, { key: 'wholesale', label: 'Khách buôn' }, { key: 'hot', label: 'Tiềm năng cao' }, { key: 'overdue', label: 'Việc quá hạn' }];
function applySummary(key: string) {
  search.value = ''; segment.value = ['retail', 'chain', 'wholesale'].includes(key) ? key : '';
  potential.value = key === 'hot' ? 'hot' : ''; overdue.value = key === 'overdue'; debt.value = false; purchased.value = false; owner.value = '';
  offset.value = 0; void load();
}
const segments: Record<string,string> = { retail: 'Khách lẻ', chain: 'Khách chuỗi', wholesale: 'Khách buôn' };
const potentials: Record<string,string> = { unrated: 'Chưa đánh giá', cold: 'Thấp', warm: 'Trung bình', hot: 'Cao' };
let version = 0;
async function load() {
  const seq = ++version; loading.value = true; error.value = '';
  try {
    const { data } = await api.get('/crm/customers', { params: { search: search.value, segment: segment.value || undefined, potential: potential.value || undefined, owner: owner.value || undefined, purchase: purchased.value ? 'purchased' : undefined, debt: debt.value ? 'positive' : undefined, overdue: overdue.value ? 'true' : undefined, offset: offset.value } });
    if (seq === version) { customers.value = data.items; total.value = data.total; }
  } catch (e: any) { if (seq === version) error.value = e.response?.data?.error || 'Không tải được danh sách.'; }
  finally { if (seq === version) loading.value = false; }
}
onMounted(async () => {
  await load();
  try { staff.value = (await api.get('/crm/staff')).data.items; } catch { /* Main list remains available. */ }
  try { summary.value = (await api.get('/crm/summary')).data; } catch { /* Do not replace unknown totals with zero. */ }
});
</script>
<style scoped>
.customers-page{padding:24px;overflow:auto;height:100%;background:#fff;color:#273331}.customers-page header{display:flex;justify-content:space-between;gap:16px;align-items:center}.customers-page h1{font-size:24px;margin:0 0 6px}.customers-page header span{font-size:13px;color:#748178}.customers-page a{color:#176b58;text-decoration:none}.customer-filters{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:22px 0;border-bottom:1px solid #dce3df}.customer-filters>input{min-width:240px;flex:1}.customer-filters input:not([type=checkbox]),.customer-filters select{border:1px solid #cbd5cf;border-radius:4px;padding:9px;font-size:13px;background:#fff}.customer-filters label{display:flex;align-items:center;gap:6px;font-size:13px}.customers-page button{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid #ccd7d0;border-radius:4px;padding:8px;background:white;cursor:pointer}.customers-page button:disabled{opacity:.45}.customer-table{overflow-x:auto}.customer-table table{width:100%;border-collapse:collapse;text-align:left}.customer-table th{font-size:12px;color:#6b7971;background:#f5f8f6;font-weight:500;white-space:nowrap}.customer-table th,.customer-table td{padding:14px 12px;border-bottom:1px solid #e4eae6}.customer-table td{font-size:13px}.customer-table small{display:block;color:#78867d;margin-top:4px}.customers-page footer{display:flex;align-items:center;justify-content:flex-end;gap:12px;padding-top:16px;font-size:13px}.customers-page :focus-visible{outline:2px solid #287cbb;outline-offset:2px}@media(max-width:600px){.customers-page{padding:14px}.customer-filters>input{min-width:0;flex-basis:100%}.customer-filters select{max-width:100%}}
</style>
<style scoped>
.customers-page{min-height:0}@media(max-width:600px){.customers-page{height:calc(100dvh - 120px)}}
.customer-summary{display:flex;flex-wrap:wrap;gap:24px;padding-top:22px}.customer-summary button{border:0;border-bottom:2px solid #d7e3db;border-radius:0;padding:8px 2px;display:flex;align-items:baseline;gap:8px;font-size:12px}.customer-summary strong{font-size:20px;font-variant-numeric:tabular-nums;color:#176b58}
</style>
