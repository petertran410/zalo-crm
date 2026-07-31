<template>
  <!-- Cài đặt › Thùng rác (2026-07-29).
       Chỉ chứa XOÁ VĨNH VIỄN — backend hard-check user.role !== 'owner' → 403 OWNER_ONLY
       (contact-routes.ts). Chuyển vào thùng rác / khôi phục nằm ở màn Khách hàng,
       gate bằng grant contact.delete (Admin / Trưởng phòng / Sale Senior). -->
  <div class="tr-page">
    <header class="tr-head">
      <h1>Thùng rác</h1>
      <p>Xoá vĩnh viễn khách hàng đã chuyển vào thùng rác. Chỉ chủ tài khoản làm được.</p>
    </header>

    <div v-if="!isOwner" class="tr-deny">
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="9" width="12" height="8" rx="2" /><path d="M7 9V6.5a3 3 0 0 1 6 0V9" /></svg>
      <div>
        <b>Chỉ chủ tài khoản (owner) xoá vĩnh viễn được.</b>
        Bạn vẫn có thể chuyển khách vào thùng rác và khôi phục từ màn Khách hàng nếu vai trò
        của bạn có quyền xoá.
      </div>
    </div>

    <template v-else>
      <div class="tr-bar">
        <span class="tr-count">
          <template v-if="loading">Đang tải…</template>
          <template v-else><b>{{ total }}</b> khách trong thùng rác</template>
        </span>
        <div class="tr-sp"></div>
        <template v-if="selected.size > 0">
          <span class="tr-sel">Đã chọn {{ selected.size }}</span>
          <button class="tr-btn" @click="selected = new Set()">Bỏ chọn</button>
          <button class="tr-btn danger" :disabled="working" @click="onBulkPurge">
            {{ working ? 'Đang xoá…' : `Xoá vĩnh viễn ${selected.size} khách` }}
          </button>
        </template>
      </div>

      <div v-if="fetchError" class="tr-empty">
        <div class="tr-empty-t">Không tải được thùng rác</div>
        <div class="tr-empty-d">{{ fetchError }}</div>
        <button class="tr-btn" @click="load">Thử lại</button>
      </div>

      <div v-else-if="loading" class="tr-empty">Đang tải…</div>

      <div v-else-if="!rows.length" class="tr-empty">
        <div class="tr-empty-t">Thùng rác trống</div>
        <div class="tr-empty-d">Không có khách hàng nào đang chờ xoá.</div>
      </div>

      <table v-else class="tr-table">
        <thead>
          <tr>
            <th class="tr-c">
              <input type="checkbox" :checked="allSelected" @change="toggleAll(($event.target as HTMLInputElement).checked)" />
            </th>
            <th>Khách hàng</th>
            <th>SĐT</th>
            <th>Đã xoá lúc</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.id">
            <td class="tr-c">
              <input type="checkbox" :checked="selected.has(r.id)" @change="toggleOne(r.id, ($event.target as HTMLInputElement).checked)" />
            </td>
            <td class="tr-nm">{{ r.crmName || r.fullName || 'Chưa có tên' }}</td>
            <td class="tr-mono">{{ r.phone || '—' }}</td>
            <td class="tr-dim">{{ r.archivedAt ? fmt(r.archivedAt) : '—' }}</td>
            <td class="tr-a">
              <button class="tr-btn sm" :disabled="working" @click="onRestore(r)">Khôi phục</button>
              <button class="tr-btn sm danger" :disabled="working" @click="onPurge(r)">Xoá vĩnh viễn</button>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-if="rows.length && total > rows.length" class="tr-more">
        <button class="tr-btn" :disabled="loading" @click="loadMore">Tải thêm</button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '@/api/index';
import { useContacts, type Contact } from '@/composables/use-contacts';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/composables/use-toast';
import { useConfirm } from '@/composables/use-confirm';

const authStore = useAuthStore();
const toast = useToast();
const { confirm } = useConfirm();
const { permanentDeleteContact, bulkPurgeContacts, restoreContact } = useContacts();

const isOwner = computed(() => authStore.user?.role === 'owner');

const rows = ref<Contact[]>([]);
const total = ref(0);
const page = ref(1);
const loading = ref(false);
const working = ref(false);
const fetchError = ref<string | null>(null);
const selected = ref<Set<string>>(new Set());

const allSelected = computed(
  () => rows.value.length > 0 && rows.value.every((r) => selected.value.has(r.id)),
);
function toggleAll(on: boolean) {
  const next = new Set(selected.value);
  for (const r of rows.value) { if (on) next.add(r.id); else next.delete(r.id); }
  selected.value = next;
}
function toggleOne(id: string, on: boolean) {
  const next = new Set(selected.value);
  if (on) next.add(id); else next.delete(id);
  selected.value = next;
}

function fmt(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

async function fetchAt(p: number, append: boolean) {
  loading.value = true;
  fetchError.value = null;
  try {
    const res = await api.get('/contacts', { params: { page: p, limit: 50, archived: 'true' } });
    const list: Contact[] = res.data.contacts ?? res.data ?? [];
    total.value = res.data.total ?? list.length;
    rows.value = append ? rows.value.concat(list) : list;
  } catch (err) {
    console.error('[TrashPage] fetch failed:', err);
    const status = (err as { response?: { status?: number } }).response?.status;
    fetchError.value = status === 403
      ? 'Vai trò của bạn không xem được danh sách này.'
      : 'Lỗi kết nối tới server.';
    if (!append) { rows.value = []; total.value = 0; }
  } finally {
    loading.value = false;
  }
}
function load() { page.value = 1; return fetchAt(1, false); }
function loadMore() { page.value += 1; return fetchAt(page.value, true); }

async function onRestore(c: Contact) {
  working.value = true;
  try {
    await restoreContact(c.id);
    toast.success('Đã khôi phục khách hàng');
    await load();
  } finally {
    working.value = false;
  }
}

async function onPurge(c: Contact) {
  const name = c.crmName || c.fullName || 'khách này';
  const ok = await confirm({
    title: 'Xoá vĩnh viễn?',
    message: `${name} sẽ bị xoá khỏi hệ thống cùng toàn bộ dữ liệu liên quan. KHÔNG thể hoàn tác.`,
    tone: 'danger',
    confirmText: 'Xoá vĩnh viễn',
    requireTypedConfirm: 'XOA',
  });
  if (!ok) return;
  working.value = true;
  try {
    await permanentDeleteContact(c.id);
    selected.value.delete(c.id);
    toast.success('Đã xoá vĩnh viễn');
    await load();
  } finally {
    working.value = false;
  }
}

async function onBulkPurge() {
  const ids = [...selected.value];
  const ok = await confirm({
    title: `Xoá vĩnh viễn ${ids.length} khách?`,
    message: 'Toàn bộ dữ liệu liên quan sẽ bị xoá. KHÔNG thể hoàn tác.',
    tone: 'danger',
    confirmText: 'Xoá vĩnh viễn',
    requireTypedConfirm: 'XOA',
  });
  if (!ok) return;
  working.value = true;
  try {
    const n = await bulkPurgeContacts(ids);
    selected.value = new Set();
    toast.success(`Đã xoá vĩnh viễn ${n} khách`);
    await load();
  } finally {
    working.value = false;
  }
}

onMounted(() => { if (isOwner.value) load(); });
</script>

<style scoped>
.tr-page { padding: 24px 28px 40px; max-width: 1100px; }
.tr-head h1 { margin: 0; font-size: 22px; font-weight: 800; color: var(--ink); }
.tr-head p { margin: 6px 0 0; font-size: 13.5px; color: var(--ink-2); }

.tr-deny {
  margin-top: 18px; padding: 14px 16px; border-radius: 12px;
  background: var(--surface-3); border: 1px solid var(--line);
  display: flex; gap: 12px; align-items: flex-start;
  font-size: 13px; line-height: 1.6; color: var(--ink-2);
}
.tr-deny svg { width: 18px; height: 18px; flex: none; margin-top: 2px; color: var(--ink-3); }

.tr-bar { margin-top: 20px; display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--ink-2); }
.tr-count b { color: var(--ink); font-weight: 800; }
.tr-sp { flex: 1; }
.tr-sel { font-weight: 600; color: var(--ink); }

.tr-btn {
  height: 32px; padding: 0 13px; border: 1px solid var(--line); border-radius: 8px;
  background: var(--surface); color: var(--ink);
  font-family: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer;
}
.tr-btn:hover:not(:disabled) { background: var(--surface-3); }
.tr-btn.sm { height: 28px; padding: 0 10px; font-size: 12px; }
.tr-btn.danger { border-color: var(--error); color: var(--error); }
.tr-btn:disabled { opacity: .55; cursor: not-allowed; }

.tr-table { margin-top: 14px; width: 100%; border-collapse: collapse; font-size: 13px; }
.tr-table th {
  text-align: left; padding: 9px 10px; border-bottom: 1px solid var(--line);
  font-size: 11px; text-transform: uppercase; letter-spacing: .06em;
  color: var(--ink-3); font-weight: 700;
}
.tr-table td { padding: 10px; border-bottom: 1px solid var(--line); color: var(--ink-2); }
.tr-c { width: 34px; }
.tr-c input { width: 15px; height: 15px; accent-color: var(--brand); cursor: pointer; }
.tr-nm { color: var(--ink); font-weight: 600; }
.tr-mono { font-variant-numeric: tabular-nums; }
.tr-dim { color: var(--ink-3); }
.tr-a { text-align: right; white-space: nowrap; display: flex; gap: 6px; justify-content: flex-end; }

.tr-empty {
  margin-top: 20px; padding: 40px; border-radius: 14px;
  background: var(--surface); border: 1px solid var(--line);
  text-align: center; color: var(--ink-2); font-size: 13px;
  display: flex; flex-direction: column; align-items: center; gap: 8px;
}
.tr-empty-t { font-size: 16px; font-weight: 700; color: var(--ink); }
.tr-empty-d { font-size: 13px; color: var(--ink-2); max-width: 380px; line-height: 1.6; }
.tr-more { margin-top: 14px; text-align: center; }
</style>
