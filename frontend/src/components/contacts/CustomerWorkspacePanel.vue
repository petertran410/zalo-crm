<template>
  <aside class="crm-workspace" :class="[{ expanded: fullPage }, $attrs.class]">
    <header class="cw-head">
      <div><small>HỒ SƠ KHÁCH HÀNG</small><h2>{{ data?.contact.name || 'Khách hàng' }}</h2><span>{{ data?.contact.phone }}</span></div>
      <div class="cw-actions">
        <RouterLink v-if="customerId && !fullPage" :to="{ path: `/customers/${customerId}`, query: { from: route.fullPath } }" title="Mở hồ sơ đầy đủ"><ExternalLink :size="18" /></RouterLink>
        <button title="Tải lại" :disabled="loading || busy" @click="load"><RefreshCw :size="18" /></button>
        <button v-if="!fullPage" title="Đóng hồ sơ" @click="$emit('close')"><X :size="18" /></button>
      </div>
    </header>
    <div v-if="loading" class="cw-state" role="status">Đang tải hồ sơ...</div>
    <div v-else-if="error && !data" class="cw-state error" role="alert">{{ error }}<button @click="load">Thử lại</button></div>
    <section v-else-if="!customerId" class="cw-section">
      <h3>Chưa liên kết khách hàng</h3>
      <form v-if="canEdit" class="cw-search" @submit.prevent="findContacts"><input v-model="contactSearch" placeholder="Tên hoặc số điện thoại" aria-label="Tìm khách hàng" /><button title="Tìm"><Search :size="18" /></button></form>
      <button v-for="c in contacts" :key="c.id" class="cw-choice" :disabled="busy" @click="linkConversation(c.id)">{{ c.crmName || c.fullName }}<small>{{ c.phone }}</small><Link2 :size="16" /></button>
      <p v-if="searchedContacts && !contacts.length" class="cw-muted">Không có khách phù hợp.</p>
    </section>
    <template v-else-if="data">
      <p v-if="error" role="alert" class="cw-error">{{ error }}</p>
      <div class="cw-scope"><label>Phạm vi hồ sơ<select v-model="selectedPosId" :disabled="busy" @change="load"><option value="">Tất cả quán</option><option v-for="a in data.accounts" :key="a.posId" :value="String(a.posId)">{{ a.name }} · {{ a.code || a.posId }}</option></select></label></div>
      <nav class="cw-tabs" aria-label="Nội dung hồ sơ"><button v-for="tab in tabs" :key="tab.id" :aria-pressed="activeTab === tab.id" @click="selectTab(tab.id)">{{ tab.label }}</button></nav>
      <section v-if="activeTab === 'overview'" class="cw-section">
        <div class="cw-meta"><strong>{{ segmentLabels[profile.segment] }}</strong><span>Tiềm năng: {{ potentialLabels[profile.potential] }}</span><span>Sale: {{ data.assignedUser?.fullName || 'Chưa phân công' }}</span><span>Kế toán: {{ data.accountant?.fullName || 'Chưa phân công' }}</span></div>
        <dl class="cw-facts"><div><dt>Mua hàng</dt><dd>{{ data.purchase.state === 'purchased' ? `Đã mua · ${data.purchase.validInvoiceCount} hóa đơn` : data.purchase.state === 'not_purchased' ? 'Chưa có hóa đơn hợp lệ' : 'Chưa xác định' }}</dd></div>
          <div><dt>Công nợ {{ selectedPosId ? 'quán đã chọn' : 'các mã POS liên kết' }}</dt><dd>{{ money(data.debt.amount) }}</dd><small>{{ debtState(data.debt.state) }} · {{ date(data.debt.updatedAt) }}</small></div></dl>
        <details class="cw-profile-edit"><summary>Phân loại và người phụ trách</summary>
        <form class="cw-fields" @submit.prevent="saveProfile">
          <fieldset :disabled="busy || !canEdit">
          <label>Tệp khách<select v-model="profile.segment"><option value="retail">Khách lẻ</option><option value="chain">Khách chuỗi</option><option value="wholesale">Khách buôn</option></select></label>
          <label>Tiềm năng<select v-model="profile.potential"><option value="unrated">Chưa đánh giá</option><option value="cold">Thấp</option><option value="warm">Trung bình</option><option value="hot">Cao</option></select></label>
          <label>Ghi chú đánh giá<textarea v-model="profile.potentialNotes" maxlength="5000" rows="2" /></label>
          <label>Chăm sóc<select v-model="profile.careStatus"><option value="active">Đang chăm sóc</option><option value="paused">Tạm dừng</option></select></label>
          <p>Sale: <strong>{{ data.assignedUser?.fullName || 'Chưa phân công' }}</strong><br />Kế toán: <strong>{{ data.accountant?.fullName || 'Chưa phân công' }}</strong></p>
          <label>Kế toán phối hợp<select v-model="profile.accountantUserId" @focus="loadStaff"><option value="">Chưa phân công</option><option v-for="u in staff" :key="u.id" :value="u.id">{{ u.fullName }}</option></select></label>
          <button class="cw-primary" :disabled="busy"><Save :size="16" />Lưu hồ sơ</button>
          </fieldset>
        </form>
        </details>
        <button class="cw-primary" :disabled="!canEdit || !data.accounts.length || !data.meta.draftWritesEnabled" @click="draftOpen = true"><Plus :size="16" />Tạo phiếu tạm</button>
        <p v-if="!data.meta.draftWritesEnabled" class="cw-muted">Ghi POS chưa được bật sau kiểm chứng.</p>
        <h3>Nhu cầu sản phẩm</h3>
        <form v-if="canEdit" class="cw-fields" @submit.prevent="addInterest">
          <input v-model="interestName" aria-label="Sản phẩm quan tâm" placeholder="Tên sản phẩm / nhu cầu" maxlength="300" required />
          <textarea v-model="interestNotes" aria-label="Ghi chú nhu cầu" placeholder="Ghi chú" maxlength="5000" rows="2" />
          <button :disabled="busy || !interestName.trim()"><Plus :size="16" />Ghi nhu cầu</button>
        </form>
        <div v-for="i in data.interests" :key="i.id" class="cw-row"><strong>{{ i.productName }}</strong><p>{{ i.notes }}</p><small>{{ accountName(i.posCustomerId) }}</small>
          <select :value="i.status" aria-label="Trạng thái nhu cầu" :disabled="busy || !canEdit" @change="setInterestStatus(i.id, ($event.target as HTMLSelectElement).value)"><option value="inquiring">Đang hỏi</option><option value="quoted">Đã báo giá</option><option value="converted">Đã chuyển đổi</option></select>
        </div>
        <h3>Việc tiếp theo</h3>
        <form v-if="canEdit" class="cw-fields" @submit.prevent="addTask"><input v-model="taskTitle" aria-label="Công việc" placeholder="Nội dung công việc" required /><label>Hạn xử lý<input v-model="taskDue" type="datetime-local" required /></label><button :disabled="busy"><Plus :size="16" />Thêm công việc</button></form>
        <RouterLink v-for="t in data.tasks" :key="t.id" class="cw-row" :to="{ path: '/tasks', query: { contactId: customerId } }">{{ t.title }}<small>{{ t.status }} · {{ date(t.dueAt) }}</small></RouterLink>
        <h3>Lịch hẹn sắp tới</h3><div v-for="a in data.appointments" :key="a.id" class="cw-row">{{ a.title || 'Lịch hẹn' }}<small>{{ date(a.appointmentDate) }}</small></div>
        <RouterLink :to="{ path: '/appointments', query: { contactId: customerId } }">Mở lịch hẹn</RouterLink>
        <h3>Ghi chú nội bộ</h3>
        <form v-if="canEdit" class="cw-fields" @submit.prevent="addNote"><textarea v-model="noteBody" aria-label="Ghi chú nội bộ" maxlength="5000" rows="3" required /><button :disabled="busy || !noteBody.trim()"><Plus :size="16" />Lưu ghi chú nội bộ</button></form>
        <div v-for="n in data.notes" :key="n.id" class="cw-row"><p>{{ n.body }}</p><small>{{ n.author.fullName }} · {{ accountName(n.posCustomerId) }} · {{ date(n.createdAt) }}</small></div>
      </section>
      <section v-else-if="activeTab === 'accounts'" class="cw-section">
        <h3>Quán / mã POS</h3>
        <div v-for="a in data.accounts" :key="a.posId" class="cw-row"><strong>{{ a.name }}</strong><small>{{ a.code || a.posId }} · {{ a.phone }}</small><p>{{ a.address || 'Chưa có địa chỉ' }}</p><button v-if="canEdit" title="Bỏ liên kết mã POS này" :disabled="busy" @click="unlink(a.posId)"><Unlink :size="16" />Bỏ liên kết</button></div>
        <template v-if="canEdit">
        <form class="cw-search" @submit.prevent="searchPos"><input v-model="posSearch" aria-label="Tìm khách POS" placeholder="Tên quán, mã POS, điện thoại" required /><button title="Tìm POS"><Search :size="18" /></button></form>
        <label v-for="p in posResults" :key="p.id" class="cw-pick"><input v-model="pickedPos" type="checkbox" :value="p.id" :disabled="data.accounts.some(a => a.posId === p.id)" /><span>{{ p.name }}<small>{{ p.code }} · {{ p.phone }}</small></span></label>
        <p v-if="searchedPos && !posResults.length" class="cw-muted">Không tìm thấy hồ sơ POS.</p>
        <button :disabled="busy || !pickedPos.length" @click="linkPos"><Link2 :size="16" />Liên kết {{ pickedPos.length || '' }} mã POS</button>
        <details><summary>Tạo khách POS mới</summary><form class="cw-fields" @submit.prevent="createPosCustomer">
          <fieldset :disabled="customerAttempted || busy"><label>Tên quán<input v-model="newCustomer.name" required /></label><label>Điện thoại<input v-model="newCustomer.phone" required /></label><label>Địa chỉ<input v-model="newCustomer.address" required /></label><label>ID Sale PIC trên POS<input v-model.number="newCustomer.salePicId" type="number" min="1" required /></label></fieldset>
          <button :disabled="busy || !data.meta.customerWritesEnabled">{{ customerAttempted ? 'Gửi lại cùng mã thao tác' : 'Tạo khách POS' }}</button><p v-if="!data.meta.customerWritesEnabled" class="cw-muted">Ghi POS chưa được bật.</p></form></details>
        </template>
      </section>
      <section v-else-if="activeTab === 'commerce'" class="cw-section">
        <h3>Công nợ theo POS</h3><p class="cw-amount">{{ money(data.debt.amount) }}</p><small>{{ debtState(data.debt.state) }} · {{ date(data.debt.updatedAt) }}</small>
        <button :disabled="!selectedPosId || busy" @click="fetchLedger(0)">Xem sổ công nợ quán đã chọn</button>
        <div v-if="ledger" class="cw-ledger"><div v-for="(line, index) in ledger.data || []" :key="index" class="cw-row"><strong>{{ line.code || line.referenceCode || line.type }}</strong><small>{{ line.description || line.type }}</small><span>{{ money(line.amount) }} · Dư nợ {{ money(line.runningDebt) }}</span></div>
          <div class="cw-actions"><button :disabled="ledgerOffset === 0 || busy" title="Trang trước" @click="fetchLedger(Math.max(0, ledgerOffset - 30))"><ChevronLeft :size="18" /></button><button :disabled="(ledger.data?.length || 0) < 30 || busy" title="Trang sau" @click="fetchLedger(ledgerOffset + 30)"><ChevronRight :size="18" /></button></div>
        </div>
        <h3>Hóa đơn gần đây</h3><button v-for="i in data.invoices" :key="i.id" class="cw-row" @click="openDocument('invoices', i.id)"><strong>{{ i.invoiceCode }}</strong><small>{{ accountName(i.posCustomerId) }} · {{ i.status }}</small><span>{{ money(i.totalAmount) }} · {{ date(i.invoiceDate) }}</span></button>
        <p v-if="data.meta.invoicesMayBeTruncated" class="cw-muted">Đang hiển thị 50 hóa đơn gần nhất.</p>
        <h3>Đơn hàng gần đây</h3><button v-for="o in data.orders" :key="o.id" class="cw-row" @click="openDocument('orders', o.id)"><strong>{{ o.code }}</strong><small>{{ accountName(o.posCustomerId) }} · {{ o.orderStatus || o.status }}</small><span>{{ money(o.finalAmount) }} · {{ date(o.orderDate) }}</span></button>
      </section>
      <section v-else-if="activeTab === 'journey'" class="cw-section">
        <p v-if="!journey.length" class="cw-muted">Chưa có sự kiện trong phạm vi này.</p>
        <div v-for="e in journey" :key="e.key" class="cw-event"><span class="cw-source">{{ e.source }}</span><div><button v-if="e.type === 'invoice' || e.type === 'order'" @click="openDocument(e.type === 'invoice' ? 'invoices' : 'orders', e.key.split(':')[1])">{{ e.title }}</button><strong v-else>{{ e.title }}</strong><small>{{ date(e.occurredAt) }} · {{ accountName(e.posCustomerId) }}</small></div></div>
        <button v-if="nextOffset !== null" :disabled="busy" @click="fetchJourney(nextOffset)">Xem thêm</button>
      </section>
      <section v-else-if="activeTab === 'conversations'" class="cw-section">
        <RouterLink v-for="c in data.conversations" :key="c.id" class="cw-row" :to="`/sales-chat/${c.id}`"><strong>{{ c.groupName || 'Chat riêng' }}</strong><small>{{ c.dissolvedAt ? 'Đã giải tán' : c.deletedAt ? 'Đã lưu trữ' : 'Đang theo dõi trong CRM' }} · {{ date(c.lastMessageAt) }}</small></RouterLink>
      </section>
      <MediaTabPanel v-else-if="activeTab === 'media' && conversationId" :conversation-id="conversationId" />
    </template>
    <v-dialog v-model="draftOpen" max-width="560" scrollable aria-label="Tạo phiếu tạm">
      <CrmDraftForm v-if="data && customerId" :key="customerId" :contact-id="customerId" :accounts="data.accounts" :enabled="data.meta.draftWritesEnabled" @close="draftOpen = false" @saved="draftOpen = false; load()" />
    </v-dialog>
    <v-dialog v-model="documentOpen" max-width="640" scrollable aria-label="Chi tiết chứng từ POS">
      <section class="cw-document"><header class="cw-head"><h3>{{ documentData?.document?.code || 'Chứng từ POS' }}</h3><button title="Đóng chứng từ" @click="documentOpen = false"><X :size="18" /></button></header>
        <div v-if="documentLoading" class="cw-state">Đang tải chứng từ...</div>
        <p v-else-if="!documentData?.document" class="cw-state">Chi tiết chứng từ chưa đồng bộ.</p>
        <div v-else class="cw-section"><strong>{{ documentData.document.statusValue || 'Chưa xác định trạng thái' }}</strong><p>Tổng chứng từ: {{ money(documentData.document.total ?? documentData.document.totalAmount) }}</p>
          <p>Đã thanh toán: {{ money(documentData.document.paidAmount ?? documentData.document.totalPayment) }}</p>
          <p>Trạng thái thanh toán: {{ documentData.document.paymentStatus || 'Chưa xác định' }}</p>
          <p>Giao hàng: {{ documentData.document.delivery?.status || documentData.document.deliveryStatus || 'Chưa xác định' }}</p>
          <div v-for="(line, idx) in documentData.document.details || documentData.document.items || documentData.document.invoiceDetails || documentData.document.orderDetails || []" :key="idx" class="cw-row"><strong>{{ line.productName || line.product?.name || line.productCode }}</strong><span>{{ line.quantity }} × {{ money(line.unitPrice ?? line.price) }}</span></div>
          <small>POS · {{ date(documentData.updatedAt) }}</small></div>
      </section>
    </v-dialog>
  </aside>
</template>
<script setup lang="ts">
import { ref, reactive, watch, computed } from 'vue';
import { useRoute } from 'vue-router';
import { ChevronLeft, ChevronRight, ExternalLink, Link2, Plus, RefreshCw, Save, Search, Unlink, X } from 'lucide-vue-next';
import { api } from '@/api';
import { useConfirm } from '@/composables/use-confirm';
import { useAuthStore } from '@/stores/auth';
import { formatInOrgTz, orgWallClockToUtc } from '@/composables/use-org-timezone';
import CrmDraftForm from './CrmDraftForm.vue';
import MediaTabPanel from '@/components/chat/MediaTabPanel.vue';
import type { CustomerWorkspace } from '@/composables/use-customer-workspace';
defineOptions({ inheritAttrs: false });
const props = defineProps<{ contactId?: string | null; conversationId?: string | null; fullPage?: boolean }>();
defineEmits<{ close: []; saved: []; 'status-changed': [value: string | null] }>();
const route = useRoute(), { confirm } = useConfirm(), auth = useAuthStore();
const canEdit = computed(() => auth.canAccess('contact', 'edit'));
const data = ref<CustomerWorkspace | null>(null), customerId = ref(''), selectedPosId = ref('');
const loading = ref(false), busy = ref(false), error = ref(''), activeTab = ref('overview'), draftOpen = ref(false);
const contactSearch = ref(''), contacts = ref<any[]>([]), searchedContacts = ref(false);
const posSearch = ref(''), posResults = ref<any[]>([]), pickedPos = ref<number[]>([]), searchedPos = ref(false);
const profile = reactive({ segment: 'retail', potential: 'unrated', potentialNotes: '', careStatus: 'active', accountantUserId: '' });
const interestName = ref(''), interestNotes = ref(''), taskTitle = ref(''), taskDue = ref('');
const noteBody = ref(''), documentOpen = ref(false), documentLoading = ref(false), documentData = ref<any>(null);
const staff = ref<Array<{ id: string; fullName: string }>>([]);
const journey = ref<any[]>([]), nextOffset = ref<number | null>(null), journeyUntil = ref('');
const ledger = ref<any>(null), ledgerOffset = ref(0);
const customerAttempted = ref(false);
const newCustomer = reactive({ name: '', phone: '', address: '', salePicId: 0, operationKey: crypto.randomUUID() });
let customerDraftLoadedFor = '';
function customerStorageKey() { return `crm-new-pos:${auth.user?.id}:${customerId.value}`; }
function restoreCustomerDraft(id: string) {
  if (customerDraftLoadedFor === id) return;
  customerDraftLoadedFor = id;
  Object.assign(newCustomer, { name: '', phone: '', address: '', salePicId: 0, operationKey: crypto.randomUUID() });
  customerAttempted.value = false;
  try {
    const saved = JSON.parse(localStorage.getItem(customerStorageKey()) || 'null');
    if (saved?.operationKey) { Object.assign(newCustomer, saved); customerAttempted.value = true; }
  } catch { /* Ignore malformed storage; server operation keys still prevent replay conflicts. */ }
}
const tabs = [{ id: 'overview', label: 'Tổng quan' }, { id: 'accounts', label: 'Quán / POS' }, { id: 'journey', label: 'Hành trình' }, { id: 'commerce', label: 'Mua hàng & nợ' }, { id: 'conversations', label: 'Hội thoại' }];
const segmentLabels: Record<string, string> = { retail: 'Khách lẻ', chain: 'Khách chuỗi', wholesale: 'Khách buôn' };
const potentialLabels: Record<string, string> = { unrated: 'Chưa đánh giá', cold: 'Thấp', warm: 'Trung bình', hot: 'Cao' };
let generation = 0;
const money = (n: unknown) => n == null || !Number.isFinite(Number(n)) ? 'Chưa xác định' : new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(n));
const date = (v: unknown) => typeof v === 'string' && v ? formatInOrgTz(v) : 'Chưa cập nhật';
const debtState = (v: string) => ({ available: 'Đã đồng bộ', stale: 'Dữ liệu cũ', unknown: 'Chưa xác định' }[v] || v);
const accountName = (id: number | null) => data.value?.accounts.find(a => a.posId === id)?.name || (id ? `POS ${id}` : 'Nhu cầu / hoạt động chung');
const fail = (e: any) => { error.value = e.response?.data?.error || e.response?.data?.message || e.message || 'Không thực hiện được thao tác.'; };
async function run(action: () => Promise<void>) { busy.value = true; error.value = ''; try { await action(); } catch (e) { fail(e); } finally { busy.value = false; } }
async function load() {
  const seq = ++generation;
  loading.value = true; error.value = ''; ledger.value = null;
  try {
    let id = props.contactId || '';
    if (props.conversationId) id = (await api.get(`/crm/conversations/${props.conversationId}/customer`)).data.contactId || '';
    if (seq !== generation) return;
    customerId.value = id;
    if (id) restoreCustomerDraft(id);
    if (!id) { data.value = null; return; }
    const result = await api.get(`/crm/customers/${id}`, { params: { posCustomerId: selectedPosId.value || undefined } });
    if (seq !== generation) return;
    data.value = result.data;
    Object.assign(profile, { segment: 'retail', potential: 'unrated', potentialNotes: '', careStatus: 'active', accountantUserId: '' }, result.data.workspace || {});
    profile.accountantUserId ||= ''; profile.potentialNotes ||= '';
    if (activeTab.value === 'journey') await fetchJourney(0);
  } catch (e) { if (seq === generation) { data.value = null; fail(e); } }
  finally { if (seq === generation) loading.value = false; }
}
watch(() => [props.contactId, props.conversationId], () => {
  selectedPosId.value = ''; data.value = null; customerId.value = ''; draftOpen.value = false; activeTab.value = 'overview';
  journey.value = []; ledger.value = null; interestName.value = ''; interestNotes.value = ''; taskTitle.value = ''; taskDue.value = '';
  contacts.value = []; posResults.value = []; pickedPos.value = []; void load();
}, { immediate: true });
async function findContacts() { await run(async () => { contacts.value = (await api.get('/crm/customers', { params: { search: contactSearch.value } })).data.items; searchedContacts.value = true; }); }
async function linkConversation(id: string) { await run(async () => { await api.put(`/crm/conversations/${props.conversationId}/customer`, { contactId: id }); await load(); }); }
async function saveProfile() { await run(async () => {
  await api.patch(`/crm/customers/${customerId.value}`, {
    segment: profile.segment, potential: profile.potential, potentialNotes: profile.potentialNotes,
    careStatus: profile.careStatus, accountantUserId: profile.accountantUserId || null,
  }); await load();
}); }
async function loadStaff() { if (staff.value.length) return; await run(async () => { staff.value = (await api.get('/crm/staff')).data.items; }); }
async function searchPos() { await run(async () => { posResults.value = (await api.get('/pos/customers/search', { params: { keyword: posSearch.value } })).data.items; searchedPos.value = true; }); }
async function linkPos() { await run(async () => { await api.post(`/crm/customers/${customerId.value}/pos-links`, { posCustomerIds: pickedPos.value }); pickedPos.value = []; await load(); }); }
async function unlink(id: number) {
  if (!await confirm({ title: 'Bỏ liên kết mã POS?', message: 'Chứng từ tại POS vẫn giữ nguyên. Hồ sơ CRM này không còn tổng hợp dữ liệu của mã đã bỏ.', tone: 'danger' })) return;
  await run(async () => { await api.delete(`/crm/customers/${customerId.value}/pos-links/${id}`); selectedPosId.value = ''; await load(); });
}
async function addInterest() { await run(async () => { await api.post(`/crm/customers/${customerId.value}/interests`, { productName: interestName.value, notes: interestNotes.value, posCustomerId: selectedPosId.value ? Number(selectedPosId.value) : undefined }); interestName.value = ''; interestNotes.value = ''; await load(); }); }
async function setInterestStatus(id: string, status: string) { await run(async () => { await api.patch(`/contacts/${customerId.value}/product-interests/${id}`, { status }); await load(); }); }
async function addTask() { await run(async () => {
  const [day, time] = taskDue.value.split('T');
  const due = orgWallClockToUtc(day || '', time);
  if (!due) throw new Error('Hạn xử lý không hợp lệ.');
  await api.post('/tasks', { contactId: customerId.value, posCustomerId: selectedPosId.value ? Number(selectedPosId.value) : undefined, conversationId: props.conversationId || undefined, title: taskTitle.value, assigneeUserId: auth.user?.id, dueAt: due.toISOString(), dueHasTime: true });
  taskTitle.value = ''; taskDue.value = ''; await load();
}); }
async function addNote() { await run(async () => { await api.post(`/contacts/${customerId.value}/notes`, { body: noteBody.value, posCustomerId: selectedPosId.value ? Number(selectedPosId.value) : undefined, conversationId: props.conversationId || undefined }); noteBody.value = ''; await load(); }); }
async function openDocument(kind: string, id: string) {
  documentOpen.value = true; documentLoading.value = true; documentData.value = null;
  await run(async () => { documentData.value = (await api.get(`/crm/customers/${customerId.value}/documents/${kind}/${id}`)).data; });
  documentLoading.value = false;
}
async function selectTab(tab: string) { activeTab.value = tab; if (tab === 'journey') await fetchJourney(0); }
async function fetchJourney(offset: number) {
  const seq = generation;
  await run(async () => {
    const result = (await api.get(`/crm/customers/${customerId.value}/journey`, { params: { offset, posCustomerId: selectedPosId.value || undefined, until: offset ? journeyUntil.value : undefined } })).data;
    if (seq !== generation) return;
    journey.value = offset ? [...journey.value, ...result.items] : result.items; nextOffset.value = result.nextOffset; journeyUntil.value = result.until;
  });
}
async function fetchLedger(offset: number) { const seq = generation; await run(async () => { const result = (await api.get(`/crm/customers/${customerId.value}/ledger/${selectedPosId.value}`, { params: { offset } })).data; if (seq === generation) { ledger.value = result; ledgerOffset.value = offset; } }); }
async function createPosCustomer() {
  await run(async () => {
    localStorage.setItem(customerStorageKey(), JSON.stringify(newCustomer));
    customerAttempted.value = true;
    let result;
    try { result = (await api.post('/pos/customers', { ...newCustomer, contactId: customerId.value })).data; }
    catch (e: any) {
      if (e.response?.data?.code === 'POS_REJECTED') {
        customerAttempted.value = false; newCustomer.operationKey = crypto.randomUUID(); localStorage.removeItem(customerStorageKey());
      }
      throw e;
    }
    if (!result.success) throw new Error(result.message);
    localStorage.removeItem(customerStorageKey());
    customerAttempted.value = false; Object.assign(newCustomer, { name: '', phone: '', address: '', salePicId: 0, operationKey: crypto.randomUUID() }); await load();
  });
}
defineExpose({ setMainTab: (tab: string) => { activeTab.value = tab === 'media' ? 'media' : 'overview'; } });
</script>
<style scoped>
.crm-workspace{height:100%;min-height:0;min-width:0;overflow-y:auto;background:#fff;color:#273331;border-left:1px solid #dce3e0;font-size:13px;letter-spacing:0}.cw-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:18px 16px;border-bottom:1px solid #e2e7e5}.cw-head small{font-size:10px;color:#697973}.cw-head h2{font-size:19px;line-height:1.35;margin:4px 0;overflow-wrap:anywhere}.cw-actions{display:flex;gap:6px;flex-shrink:0}.crm-workspace button,.cw-actions a{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:8px;border:1px solid #d3dcd7;border-radius:4px;background:#fff;color:inherit;cursor:pointer;text-decoration:none;min-height:34px}.crm-workspace button:disabled{opacity:.5;cursor:not-allowed}.crm-workspace :focus-visible{outline:2px solid #287cbb;outline-offset:2px}.cw-scope{padding:14px 16px;background:#f5f8f6}.crm-workspace label{display:grid;gap:5px;color:#56645e;font-size:12px}.crm-workspace input,.crm-workspace select,.crm-workspace textarea{width:100%;min-width:0;border:1px solid #ccd6d0;border-radius:4px;padding:9px;background:#fff;color:#273331;font-size:13px;box-sizing:border-box}.cw-tabs{display:flex;gap:4px;overflow-x:auto;padding:10px 12px;border-bottom:1px solid #e2e7e5}.cw-tabs button{white-space:nowrap;border:0;background:transparent;font-size:12px}.cw-tabs button[aria-pressed=true]{background:#e4f1eb;color:#146044}.cw-section{padding:16px;display:grid;gap:14px}.cw-section h3{font-size:14px;margin:6px 0 0}.cw-fields{display:grid;gap:10px}.cw-fields fieldset{border:0;display:grid;gap:10px;padding:0;min-width:0}.crm-workspace .cw-primary{background:#176b58;color:white;border-color:#176b58}.cw-facts{margin:0;border-block:1px solid #e2e7e5}.cw-facts>div{padding:13px 0}.cw-facts dt{color:#687971;font-size:12px}.cw-facts dd{font-size:18px;font-weight:600;margin:4px 0;font-variant-numeric:tabular-nums}.cw-facts small,.cw-muted{font-size:12px;color:#75827c}.cw-row{display:grid;gap:5px;padding:12px 0;border-bottom:1px solid #e4e9e6;text-decoration:none;color:inherit;overflow-wrap:anywhere}.cw-row p{margin:0}.cw-row small,.cw-pick small,.cw-event small{display:block;color:#76847c;font-size:12px}.cw-row button{justify-self:start}.cw-search{display:flex;gap:6px}.cw-choice{justify-content:space-between!important;text-align:left}.crm-workspace .cw-pick{display:flex;align-items:center;gap:10px;padding:8px 0}.cw-pick input{width:17px;height:17px;flex:none}.cw-event{display:flex;gap:12px;padding:12px 0;border-bottom:1px solid #e1e7e4}.cw-source{font-size:10px;background:#edf2f6;padding:4px;height:24px;flex:none}.cw-state{padding:28px 18px;display:grid;gap:12px}.error,.cw-error{color:#a72e40}.cw-error{margin:12px 16px}.cw-amount{font-size:24px;font-weight:600;margin:0;font-variant-numeric:tabular-nums}.cw-modal{position:fixed;inset:0;background:#182d2866;z-index:100;display:flex;justify-content:flex-end}.cw-modal>:deep(.draft-form){width:min(520px,100%);height:100%;overflow:auto}.expanded{border:1px solid #dce3e0;max-width:1100px;margin:auto;height:auto;min-height:70vh}.expanded .cw-fields{max-width:620px}.expanded .cw-tabs{gap:12px}.expanded .cw-section{padding:24px}.expanded .cw-head h2{font-size:24px}@media(max-width:600px){.cw-head{padding:12px}.cw-head h2{font-size:17px}.cw-section{padding:12px}.expanded .cw-section{padding:14px}.cw-modal{z-index:120}}
</style>
<style scoped>
.cw-meta{display:flex;flex-wrap:wrap;gap:8px 18px;color:#5d6e64;font-size:12px}.cw-meta strong{color:#176b58}.cw-profile-edit summary{cursor:pointer;padding:6px 0;color:#325b49}.cw-profile-edit[open] .cw-fields{padding-top:12px}.cw-document{background:#fff;width:min(560px,100%);height:100%;overflow:auto}.crm-workspace button.cw-row{display:grid;justify-content:stretch;text-align:left;gap:6px}.expanded .cw-facts{display:grid;grid-template-columns:1fr 1fr;gap:24px}.cw-modal :deep(.draft-form){width:min(520px,100%);height:100%;overflow:auto}@media(max-width:600px){.expanded .cw-facts{grid-template-columns:1fr;gap:0}}
</style>
