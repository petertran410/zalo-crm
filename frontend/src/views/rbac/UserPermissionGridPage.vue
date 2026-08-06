<template>
  <div class="upg-page">
    <header class="page-hero">
      <!-- Bỏ hero-sub 2026-08-06: chú giải cuối trang đã mô tả đủ 4 trạng thái ô,
           và mỗi tab hành động đã có 1 dòng gợi ý riêng trên thanh công cụ. -->
      <div class="hero-left">
        <h1 class="hero-title">Quyền theo người</h1>
      </div>
      <div class="hero-actions">
        <RouterLink class="btn-ghost" to="/settings/rbac/compare">So sánh nhóm →</RouterLink>
      </div>
    </header>

    <div v-if="loading" class="loading-state">
      <div class="skel-card" v-for="i in 3" :key="i" style="height: 60px"></div>
    </div>

    <div v-else-if="users.length === 0" class="empty-state">
      <div class="empty-icon">👥</div>
      <h3>Chưa có nhân viên nào</h3>
      <p>Thêm nhân viên ở màn Nhân viên trước.</p>
    </div>

    <template v-else>
      <!-- ── Chọn hành động + lọc ── -->
      <section class="upg-toolbar">
        <div class="upg-actionpick">
          <span class="upg-actionpick-label">Hành động:</span>
          <button
            v-for="a in ACTION_TABS"
            :key="a.key"
            type="button"
            class="upg-tab"
            :class="{ on: activeAction === a.key }"
            @click="activeAction = a.key"
          >{{ a.label }}</button>
        </div>

        <div class="search-box at-search">
          <span class="search-icon">🔍</span>
          <input v-model="searchQ" placeholder="Tìm nhân viên..." />
        </div>

        <label class="upg-toggle" :class="{ on: overriddenOnly }">
          <input type="checkbox" v-model="overriddenOnly" />
          <span>Chỉ hiện người có quyền riêng</span>
          <span class="upg-toggle-count">{{ overriddenUserCount }}</span>
        </label>

        <span class="upg-hint">{{ actionHint }}</span>
      </section>

      <div v-if="error" class="upg-error">{{ error }}</div>

      <!-- ── Lưới người × chức năng ── -->
      <div class="upg-table-wrap">
        <table class="upg-table">
          <thead>
            <tr>
              <th class="th-user">Nhân viên</th>
              <th v-for="r in gridResources" :key="r" class="th-feat">
                <span class="th-feat-icon">{{ resourceIcon(r) }}</span>
                <span class="th-feat-label">{{ resourceLabel(r) }}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="visibleUsers.length === 0">
              <td :colspan="gridResources.length + 1" class="upg-empty-row">
                Không có nhân viên nào khớp bộ lọc.
              </td>
            </tr>
            <tr v-for="u in visibleUsers" :key="u.id">
              <th class="td-user">
                <div class="td-user-name">{{ u.fullName || u.email || u.phone }}</div>
                <div class="td-user-meta">
                  <span class="tag-group">{{ u.permissionGroup?.name ?? 'Chưa gán nhóm' }}</span>
                  <span v-if="u.role === 'owner'" class="tag-owner">Chủ tài khoản</span>
                  <span v-else-if="u.role === 'admin'" class="tag-admin">Quản trị</span>
                  <span v-if="u.id === meId" class="tag-self">Bạn</span>
                </div>
              </th>

              <td v-for="r in gridResources" :key="r" class="td-cell">
                <template v-if="!supportsAction(r)">
                  <span class="cell-na" title="Chức năng này không có hành động đó">—</span>
                </template>
                <template v-else>
                  <label
                    class="cell-box"
                    :class="cellClass(u, r)"
                    :title="cellTitle(u, r)"
                  >
                    <input
                      type="checkbox"
                      :checked="effective(u, r)"
                      :disabled="isLocked(u) || saving.has(u.id)"
                      @change="onToggle(u, r, ($event.target as HTMLInputElement).checked)"
                    />
                  </label>
                  <button
                    v-if="isOverridden(u, r) && !isLocked(u)"
                    type="button"
                    class="cell-reset"
                    title="Bỏ quyền riêng, quay về theo nhóm"
                    :disabled="saving.has(u.id)"
                    @click="onReset(u, r)"
                  >↺</button>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <section class="upg-legend">
        <span class="legend-item"><span class="cell-box inherit-on"><input type="checkbox" checked disabled /></span> theo nhóm — có</span>
        <span class="legend-item"><span class="cell-box"><input type="checkbox" disabled /></span> theo nhóm — không</span>
        <span class="legend-item"><span class="cell-box ov-allow"><input type="checkbox" checked disabled /></span> cấp riêng</span>
        <span class="legend-item"><span class="cell-box ov-deny"><input type="checkbox" disabled /></span> từ chối riêng</span>
        <span class="legend-item"><span class="cell-reset">↺</span> bỏ quyền riêng</span>
      </section>
      <!-- Rút gọn 2026-08-06: 2 vế "chủ tài khoản toàn quyền" và "không tự sửa
           quyền mình" đã thấy ngay trên bảng (ô bị khoá + tooltip khi rê vào), giữ
           lại mỗi điều KHÔNG suy ra được từ giao diện: phải tải lại trang. -->
      <p class="upg-note">Người bị đổi quyền cần tải lại trang để menu cập nhật.</p>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * UserPermissionGridPage — "Quyền theo người" (chỉ admin thấy).
 *
 * Lưới NGƯỜI × CHỨC NĂNG cho 1 hành động mỗi lần (mặc định "Truy cập" = vào được
 * màn đó). Tick = cấp riêng, bỏ tick = TỪ CHỐI riêng, ↺ = xoá quyền riêng để quay
 * về theo nhóm. Ghi vào User.customGrants qua PATCH /rbac/users/:id/overrides.
 *
 * Phụ thuộc bản vá 2026-08-06 ở userHasGrant/getProfile: trước đó customGrants
 * chỉ CỘNG thêm được, `false` bị bỏ qua nên "bỏ tick để cấm" là vô tác dụng.
 *
 * Ví dụ dùng: cho A xem lịch của người khác → tab "Xem tất cả" → cột Lịch hẹn →
 * tick ô của A. Bỏ tick là A chỉ còn thấy lịch KH mình phụ trách.
 */
import { ref, computed, onMounted } from 'vue';
import { useRbacStore, type RbacUser } from '@/stores/rbac';
import { useAuthStore } from '@/stores/auth';
import { resourceLabel, resourceIcon } from '@/constants/permission-meta';

type Grants = Record<string, Record<string, boolean>>;

const store = useRbacStore();
const auth = useAuthStore();

const ACTION_TABS = [
  { key: 'access', label: 'Truy cập', hint: 'Tick = người đó vào được màn / chức năng này.' },
  { key: 'view_all', label: 'Xem tất cả', hint: 'Tick = xem được dữ liệu của NGƯỜI KHÁC, không chỉ của mình.' },
  { key: 'create', label: 'Thêm mới', hint: 'Tick = tạo mới được ở màn này.' },
  { key: 'edit', label: 'Chỉnh sửa', hint: 'Tick = sửa được ở màn này.' },
  { key: 'delete', label: 'Xóa', hint: 'Tick = xoá được ở màn này.' },
] as const;

const activeAction = ref<string>('access');
const searchQ = ref('');
const overriddenOnly = ref(false);
const error = ref('');
const saving = ref<Set<string>>(new Set());

const loading = computed(() => store.loading && store.users.length === 0);
const users = computed(() => store.users);
const meId = computed(() => auth.user?.id ?? '');

const resourceActions = computed<Record<string, string[]>>(() => store.matrixMeta?.resourceActions ?? {});
const allResources = computed<string[]>(() => store.matrixMeta?.resources ?? []);

onMounted(async () => {
  if (!store.matrixMeta) await store.loadPermissionGroups();
  if (store.users.length === 0) await store.loadUsers();
});

/** Chỉ hiện cột mà resource đó THỰC SỰ có hành động đang chọn. */
const gridResources = computed(() =>
  allResources.value.filter((r) => (resourceActions.value[r] ?? []).includes(activeAction.value)),
);
function supportsAction(resource: string): boolean {
  return (resourceActions.value[resource] ?? []).includes(activeAction.value);
}

const actionHint = computed(
  () => ACTION_TABS.find((a) => a.key === activeAction.value)?.hint ?? '',
);

// ── Tính quyền ───────────────────────────────────────────────────────────────
function customOf(u: RbacUser): Grants {
  return (u.customGrants ?? {}) as Grants;
}
function groupGrant(u: RbacUser, r: string): boolean {
  return u.permissionGroup?.grants?.[r]?.[activeAction.value] === true;
}
/** Có override tường minh (true HOẶC false) cho ô này không? */
function isOverridden(u: RbacUser, r: string): boolean {
  return typeof customOf(u)[r]?.[activeAction.value] === 'boolean';
}
/**
 * Quyền THỰC TẾ — phải khớp userHasGrant() ở backend:
 * owner → luôn có; override tường minh → theo override; quyền nhóm; admin fallback.
 */
function effective(u: RbacUser, r: string): boolean {
  if (u.role === 'owner') return true;
  const ov = customOf(u)[r]?.[activeAction.value];
  if (typeof ov === 'boolean') return ov;
  if (groupGrant(u, r)) return true;
  return u.role === 'admin';
}
/** Owner không giới hạn được; không tự sửa quyền của chính mình (backend cũng chặn). */
function isLocked(u: RbacUser): boolean {
  return u.role === 'owner' || u.id === meId.value;
}

function cellClass(u: RbacUser, r: string) {
  const on = effective(u, r);
  if (isOverridden(u, r)) return on ? 'ov-allow' : 'ov-deny';
  return on ? 'inherit-on' : '';
}
function cellTitle(u: RbacUser, r: string): string {
  if (u.role === 'owner') return 'Chủ tài khoản: toàn quyền, không giới hạn được';
  if (u.id === meId.value) return 'Không thể tự sửa quyền của chính mình';
  const label = `${resourceLabel(r)} · ${ACTION_TABS.find((a) => a.key === activeAction.value)?.label}`;
  if (isOverridden(u, r)) {
    return `${label} — ${effective(u, r) ? 'CẤP RIÊNG' : 'TỪ CHỐI RIÊNG'} (bấm ↺ để theo nhóm)`;
  }
  return `${label} — theo nhóm "${u.permissionGroup?.name ?? 'chưa gán'}": ${effective(u, r) ? 'có' : 'không'}`;
}

// ── Lọc ──────────────────────────────────────────────────────────────────────
function hasAnyOverride(u: RbacUser): boolean {
  const c = customOf(u);
  return Object.values(c).some((row) => Object.values(row ?? {}).some((v) => typeof v === 'boolean'));
}
const overriddenUserCount = computed(() => users.value.filter(hasAnyOverride).length);

const visibleUsers = computed(() => {
  const q = searchQ.value.trim().toLowerCase();
  return users.value.filter((u) => {
    if (overriddenOnly.value && !hasAnyOverride(u)) return false;
    if (!q) return true;
    return [u.fullName, u.email, u.phone, u.permissionGroup?.name]
      .some((s) => (s ?? '').toLowerCase().includes(q));
  });
});

// ── Ghi ──────────────────────────────────────────────────────────────────────
async function persist(u: RbacUser, next: Grants) {
  error.value = '';
  saving.value = new Set(saving.value).add(u.id);
  const prev = JSON.parse(JSON.stringify(customOf(u)));
  try {
    // Optimistic: vẽ ngay rồi mới gọi API, lỗi thì trả lại trạng thái cũ.
    u.customGrants = next;
    await store.setUserOverrides(u.id, next);
  } catch (e: any) {
    u.customGrants = prev;
    error.value = e?.response?.data?.error ?? 'Không lưu được quyền, thử lại.';
  } finally {
    const s = new Set(saving.value);
    s.delete(u.id);
    saving.value = s;
  }
}

function onToggle(u: RbacUser, r: string, checked: boolean) {
  const next: Grants = JSON.parse(JSON.stringify(customOf(u)));
  (next[r] ??= {})[activeAction.value] = checked;
  persist(u, next);
}

/** Xoá override ô này → quay về theo nhóm. Dọn luôn resource rỗng cho map gọn. */
function onReset(u: RbacUser, r: string) {
  const next: Grants = JSON.parse(JSON.stringify(customOf(u)));
  if (next[r]) {
    delete next[r][activeAction.value];
    if (Object.keys(next[r]).length === 0) delete next[r];
  }
  persist(u, next);
}
</script>

<style scoped>
/* UserPermissionGridPage — Airtable theme, khớp PermissionComparePage */

.upg-page { padding-bottom: 24px; }

.upg-toolbar {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px;
}
.upg-actionpick { display: inline-flex; align-items: center; gap: 4px; }
.upg-actionpick-label { font-size: 12px; color: #6b7280; margin-right: 4px; }
.upg-tab {
  font-size: 12.5px; padding: 6px 11px; border-radius: 8px; cursor: pointer;
  background: white; border: 1px solid #e0e2e6; color: #4b5563; transition: all 0.12s;
}
.upg-tab:hover { border-color: #c9ccd1; }
.upg-tab.on { background: #181d26; border-color: #181d26; color: white; font-weight: 600; }

.upg-toolbar .search-box {
  display: flex; align-items: center; gap: 6px; background: white;
  border: 1px solid #e0e2e6; border-radius: 8px; padding: 6px 10px; min-width: 200px;
}
.upg-toolbar .search-box input {
  border: 0; outline: 0; font-size: 13px; width: 100%; background: transparent; color: #181d26;
}
.search-icon { font-size: 12px; opacity: 0.5; }

.upg-toggle {
  display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; color: #4b5563;
  background: white; border: 1px solid #e0e2e6; border-radius: 8px; padding: 7px 11px;
  cursor: pointer; user-select: none;
}
.upg-toggle.on { border-color: #181d26; background: #f8fafc; color: #181d26; font-weight: 600; }
.upg-toggle input { accent-color: #181d26; cursor: pointer; }
.upg-toggle-count {
  font-size: 11px; background: #eef0f3; border-radius: 999px; padding: 1px 7px;
  color: #4b5563; font-weight: 600;
}
.upg-hint { font-size: 12px; color: #6b7280; margin-left: auto; }

.upg-error {
  background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c;
  border-radius: 8px; padding: 9px 12px; font-size: 12.5px; margin-bottom: 10px;
}

.upg-table-wrap {
  background: white; border: 1px solid #e0e2e6; border-radius: 12px;
  box-shadow: 0 1px 3px rgba(24,29,38,0.04);
  overflow: auto; max-height: calc(100vh - 320px);
}
.upg-table {
  border-collapse: separate; border-spacing: 0;
  width: max-content; min-width: 100%; font-size: 12.5px;
}
.upg-table th, .upg-table td {
  border-right: 1px solid #eef0f3; border-bottom: 1px solid #eef0f3;
  padding: 8px 10px; text-align: left; vertical-align: middle; background: white;
}
.upg-table thead th {
  position: sticky; top: 0; z-index: 3; background: #f8fafc; border-bottom: 1px solid #e0e2e6;
}
.th-user, .td-user { position: sticky; left: 0; z-index: 2; min-width: 210px; background: white; }
.upg-table thead .th-user { z-index: 4; background: #f8fafc; }

.th-feat { min-width: 96px; text-align: center; }
.th-feat-icon { display: block; font-size: 14px; }
.th-feat-label { display: block; font-size: 10.5px; color: #4b5563; line-height: 1.25; margin-top: 2px; }

.td-user-name { font-size: 12.5px; font-weight: 600; color: #181d26; }
.td-user-meta { display: flex; gap: 5px; margin-top: 3px; flex-wrap: wrap; }
.tag-group { font-size: 10px; background: #eef0f3; color: #4b5563; border-radius: 4px; padding: 1px 5px; }
.tag-owner { font-size: 10px; background: #fef3c7; color: #92400e; border-radius: 4px; padding: 1px 5px; font-weight: 600; }
.tag-admin { font-size: 10px; background: #eaf3ff; color: #1d4ed8; border-radius: 4px; padding: 1px 5px; font-weight: 600; }
.tag-self { font-size: 10px; background: #f3e8ff; color: #6b21a8; border-radius: 4px; padding: 1px 5px; font-weight: 600; }

.td-cell { text-align: center; white-space: nowrap; }
.cell-na { color: #d1d5db; }

.cell-box {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border-radius: 5px; border: 1px solid #e5e7eb;
  background: #fafbfc; cursor: pointer; vertical-align: middle;
}
.cell-box input { margin: 0; cursor: pointer; accent-color: #181d26; }
.cell-box input:disabled { cursor: not-allowed; }
/* có quyền do KẾ THỪA nhóm — nền nhạt, không nhấn */
.cell-box.inherit-on { background: #f1f5f9; border-color: #dbe1e8; }
/* CẤP RIÊNG — xanh lá, nổi lên để thấy ngay chỗ nào bị can thiệp */
.cell-box.ov-allow { background: #dcfce7; border-color: #16a34a; box-shadow: 0 0 0 1px #16a34a33; }
.cell-box.ov-allow input { accent-color: #16a34a; }
/* TỪ CHỐI RIÊNG — đỏ */
.cell-box.ov-deny { background: #fee2e2; border-color: #dc2626; box-shadow: 0 0 0 1px #dc262633; }

.cell-reset {
  margin-left: 3px; border: 0; background: transparent; cursor: pointer;
  color: #9ca3af; font-size: 12px; line-height: 1; padding: 2px;
}
.cell-reset:hover { color: #181d26; }
.cell-reset:disabled { opacity: 0.4; cursor: not-allowed; }

.upg-empty-row { text-align: center; color: #9ca3af; padding: 28px; font-size: 13px; }

.upg-legend {
  margin-top: 12px; padding: 10px 14px; background: #f8fafc;
  border: 1px solid #e0e2e6; border-radius: 10px;
  display: flex; gap: 16px; flex-wrap: wrap; align-items: center;
}
.legend-item { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; color: #4b5563; }
.upg-note { font-size: 11.5px; color: #6b7280; margin: 8px 2px 0; line-height: 1.5; }

@media (max-width: 900px) {
  .upg-hint { margin-left: 0; }
  .upg-table-wrap { max-height: none; }
}
</style>
