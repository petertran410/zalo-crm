<template>
  <form class="draft-form" @submit.prevent="submit">
    <header><h3>Tạo phiếu tạm</h3><button type="button" title="Đóng" @click="$emit('close')"><X :size="18" /></button></header>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <p v-if="!enabled" class="notice">Ghi POS chưa được bật sau kiểm chứng.</p>
    <fieldset :disabled="busy || attempted">
      <label>Quán / mã POS<select v-model.number="form.posCustomerId" required @change="loadAddress">
        <option :value="0" disabled>Chọn quán</option><option v-for="a in accounts" :key="a.posId" :value="a.posId">{{ a.name }} · {{ a.code || a.posId }}</option>
      </select></label>
      <label>Chi nhánh<select v-model.number="form.branchId" required><option :value="0" disabled>Chọn chi nhánh</option>
        <option v-for="b in branches" :key="b.id" :value="b.id">{{ b.name }}</option>
      </select></label>
      <label>Địa chỉ mặc định POS<input v-model="form.delivery.address" required readonly /></label>
      <div class="product-search"><input v-model="search" placeholder="Tên hoặc mã sản phẩm" aria-label="Tìm sản phẩm" /><button type="button" title="Tìm sản phẩm" @click="findProducts"><Search :size="18" /></button></div>
      <button v-for="p in products" :key="p.posId" type="button" class="product-choice" @click="addProduct(p)"><Plus :size="16" />{{ p.code }} · {{ p.name }}</button>
      <div v-for="(line, index) in form.items" :key="line.productId" class="line">
        <strong>{{ line.productName }}</strong>
        <label>Số lượng<input v-model.number="line.quantity" type="number" min="0.01" step="0.01" required /></label>
        <label>Đơn giá<input v-model.number="line.unitPrice" type="number" min="0" step="1" required /></label>
        <button type="button" title="Bỏ dòng hàng" @click="form.items.splice(index, 1)"><Trash2 :size="16" /></button>
      </div>
    </fieldset>
    <strong>Tổng dòng hàng: {{ money(total) }}</strong>
    <label class="ack"><input v-model="confirmed" type="checkbox" :disabled="attempted" />Đã kiểm tra đúng quán, chi nhánh và địa chỉ</label>
    <button type="submit" class="primary" :disabled="busy || !enabled || !confirmed || !form.posCustomerId || !form.branchId || !form.delivery.address || !form.items.length">
      {{ busy ? 'Đang gửi...' : attempted ? 'Đối soát / gửi lại cùng mã' : 'Tạo phiếu tạm' }}
    </button>
  </form>
</template>
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { Plus, Search, Trash2, X } from 'lucide-vue-next';
import { api } from '@/api';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/composables/use-toast';
const props = defineProps<{ contactId: string; accounts: Array<{ posId: number; name: string; code?: string | null }>; enabled: boolean }>();
const emit = defineEmits<{ close: []; saved: [] }>();
const toast = useToast();
interface Line { productId: number; productCode: string; productName: string; quantity: number; unitPrice: number }
const form = reactive({ contactId: props.contactId, operationKey: crypto.randomUUID(), posCustomerId: 0, branchId: 0, delivery: { address: '' }, items: [] as Line[] });
const attempted = ref(false), confirmed = ref(false), busy = ref(false), error = ref(''), search = ref('');
const products = ref<Array<{ posId: number; code: string; name: string; basePrice?: number | null }>>([]);
const branches = ref<Array<{ id: number; name: string }>>([]);
const storageKey = `crm-draft:${useAuthStore().user?.id}:${props.contactId}`;
try {
  const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
  if (saved?.form?.contactId === props.contactId) {
    Object.assign(form, saved.form); attempted.value = saved.attempted === true; confirmed.value = attempted.value;
  }
} catch { /* Corrupt local storage must not block the form. */ }
watch([form, attempted], () => {
  try { localStorage.setItem(storageKey, JSON.stringify({ form, attempted: attempted.value })); } catch { error.value = 'Không lưu được mã thao tác trên máy. Không đóng trang khi đang gửi.'; }
}, { deep: true });
const total = computed(() => form.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0));
const money = (n: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
const fail = (e: any) => { error.value = e.response?.data?.error || e.response?.data?.message || e.message || 'Không thực hiện được thao tác.'; };
async function loadAddress() {
  form.delivery.address = ''; error.value = '';
  try {
    const { data } = await api.get(`/crm/customers/${props.contactId}/addresses/${form.posCustomerId}`);
    form.delivery.address = data.defaultAddress || '';
    if (!form.delivery.address) error.value = 'POS chưa có địa chỉ mặc định. Cập nhật địa chỉ tại POS trước.';
  } catch (e) { fail(e); }
}
async function findProducts() {
  try { products.value = (await api.get('/pos/products', { params: { keyword: search.value, limit: 15 } })).data.items || []; }
  catch (e) { fail(e); }
}
function addProduct(p: typeof products.value[number]) {
  const old = form.items.find(i => i.productId === p.posId);
  if (old) old.quantity++;
  else form.items.push({ productId: p.posId, productCode: p.code, productName: p.name, quantity: 1, unitPrice: p.basePrice ?? 0 });
  products.value = [];
}
async function submit() {
  busy.value = true; error.value = ''; attempted.value = true;
  // Persist before sending, so navigation/reload cannot turn a retry into a new command.
  try {
    localStorage.setItem(storageKey, JSON.stringify({ form, attempted: true }));
    const { data } = await api.post('/pos/orders', form);
    if (!data.success) throw new Error(data.message || 'Chờ đối soát POS.');
    localStorage.removeItem(storageKey);
    toast.success(`Đã tạo phiếu tạm ${data.data?.orderCode || ''}. Xác nhận đơn tại POS.`);
    emit('saved');
  } catch (e: any) {
    if (e.response?.data?.code === 'POS_REJECTED') {
      attempted.value = false; form.operationKey = crypto.randomUUID();
    }
    fail(e);
  } finally { busy.value = false; }
}
onMounted(async () => {
  try { branches.value = (await api.get('/pos/branches')).data.data || []; } catch (e) { fail(e); }
});
</script>
<style scoped>
.draft-form{display:grid;gap:14px;padding:18px;background:#fff;color:#243034}.draft-form header{display:flex;justify-content:space-between;align-items:center}.draft-form h3{font-size:18px;margin:0}.draft-form label{display:grid;gap:5px;font-size:13px}.draft-form input,.draft-form select{min-width:0;width:100%;border:1px solid #c9d2d0;border-radius:4px;padding:9px;background:white;color:#243034}.draft-form button{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:8px;border:1px solid #ccd5d2;border-radius:4px;cursor:pointer}.draft-form fieldset{border:0;padding:0;display:grid;gap:12px;min-width:0}.product-search{display:flex;gap:6px}.product-choice{text-align:left;justify-content:flex-start!important}.line{display:grid;grid-template-columns:1fr 1fr 32px;gap:8px;border-bottom:1px solid #e3e7e6;padding-bottom:10px}.line strong{grid-column:1/-1;font-size:13px}.draft-form .ack{display:flex;align-items:center}.ack input{width:16px;height:16px;flex:none}.primary{background:#176b58;color:white}.error{color:#aa2939}.notice{color:#856109}.draft-form button:disabled{opacity:.5;cursor:not-allowed}.draft-form :focus-visible{outline:2px solid #287cbb;outline-offset:2px}
</style>
