<template>
  <div class="dept-page roles-page">
    <header class="roles-page-header">
      <div>
        <h1 class="hero-title">Vai trò &amp; Quyền</h1>
        <p class="roles-page-subtitle">Quản lý vai trò và quyền truy cập của nhân viên.</p>
      </div>
      <button
        v-if="canCreate"
        class="roles-button roles-button-primary"
        type="button"
        @click="openForm()"
      >
        Thêm vai trò
      </button>
    </header>

    <div v-if="loading" class="roles-loading" role="status">Đang tải vai trò…</div>
    <div v-else class="roles-layout">
      <aside class="roles-sidebar" aria-label="Danh sách vai trò">
        <header class="roles-sidebar-header">
          <div>
            <h2>Danh sách vai trò</h2>
            <span>{{ flatGroups.length }} vai trò</span>
          </div>
        </header>

        <div v-if="flatGroups.length" class="roles-list">
          <div
            v-for="group in flatGroups"
            :key="group.id"
            class="roles-list-row"
            :class="{ selected: selectedId === group.id }"
            :style="{ '--role-depth': group._depth }"
          >
            <button
              type="button"
              class="roles-list-select"
              :aria-current="selectedId === group.id ? 'true' : undefined"
              @click="selectGroup(group.id)"
            >
              <span class="roles-list-copy">
                <strong>{{ group.name }}</strong>
                <span v-if="group.description" class="roles-list-description">{{ group.description }}</span>
                <span class="roles-list-meta">
                  <span v-if="isDeprecatedGroup(group.name)" class="roles-status-deprecated">Ngừng dùng</span>
                  <span v-else-if="group.isSystem" class="roles-status-system">Hệ thống</span>
                  <span v-else class="roles-status-custom">Tùy chỉnh</span>
                  <span>{{ group.memberCount }} người dùng</span>
                </span>
              </span>
            </button>
            <div class="roles-row-actions">
              <button
                v-if="canEdit"
                type="button"
                class="roles-row-action"
                title="Sửa vai trò"
                :aria-label="`Sửa vai trò ${group.name}`"
                @click.stop="openForm(group)"
              >Sửa</button>
              <button
                v-if="canDelete && !group.isSystem"
                type="button"
                class="roles-row-action roles-delete-button"
                title="Xóa vai trò"
                :aria-label="`Xóa vai trò ${group.name}`"
                @click.stop="archiveGroup(group)"
              >Xóa</button>
            </div>
          </div>
        </div>
        <p v-else class="roles-empty-list">Chưa có vai trò nào</p>

        <button
          v-if="canCreate"
          class="roles-seed-button"
          type="button"
          :disabled="seeding"
          @click="seedDefaults"
        >{{ seeding ? 'Đang tải vai trò mặc định…' : 'Tạo vai trò mặc định' }}</button>
      </aside>

      <main class="roles-editor">
        <div v-if="!selected" class="roles-editor-empty">
          <p>Chọn một vai trò để xem và chỉnh sửa quyền</p>
        </div>

        <template v-else>
          <header class="roles-editor-header">
            <div class="roles-editor-title">
              <h2>{{ selected.name }}</h2>
              <p>{{ grantsCount }} / {{ totalPermissions }} quyền</p>
            </div>
            <div class="roles-editor-buttons">
              <button
                v-if="canEdit && dirty"
                class="roles-button roles-button-secondary"
                type="button"
                :disabled="saving"
                @click="cancelChanges"
              >Hủy thay đổi</button>
              <button
                v-if="canEdit && dirty"
                class="roles-button roles-button-primary"
                type="button"
                :disabled="saving"
                @click="saveChanges"
              >{{ saving ? 'Đang lưu…' : 'Lưu quyền' }}</button>
            </div>
          </header>

          <div v-if="copyableGroups.length && canEdit" class="roles-copy-tools">
            <label for="roles-copy-select">Sao chép quyền từ</label>
            <select id="roles-copy-select" v-model="copyFromId">
              <option value="">Chọn vai trò</option>
              <option v-for="group in copyableGroups" :key="group.id" :value="group.id">{{ group.name }}</option>
            </select>
            <button type="button" class="roles-button roles-button-secondary" :disabled="!copyFromId" @click="copyGrants">
              Áp dụng
            </button>
          </div>

          <div class="roles-permission-toolbar">
            <label class="roles-search">
              <input v-model="searchQuery" type="search" placeholder="Tìm quyền..." aria-label="Tìm quyền" />
              <button v-if="searchQuery" type="button" aria-label="Xóa tìm kiếm" @click="searchQuery = ''">Xóa</button>
            </label>
            <div class="roles-category-filters" aria-label="Lọc theo danh mục">
              <button
                v-for="category in categories"
                :key="category.key"
                type="button"
                :class="{ active: activeCategory === category.key }"
                @click="activeCategory = category.key"
              >{{ category.label }}</button>
            </div>
          </div>

          <div v-if="displayedCategories.length" class="roles-permission-list">
            <section v-for="category in displayedCategories" :key="category.key" class="roles-category-card">
              <header class="roles-category-header">
                <label class="roles-check-row">
                  <input
                    type="checkbox"
                    :checked="arePermissionsChecked(category.permissionKeys)"
                    :disabled="!canEdit"
                    @change="togglePermissions(category.permissionKeys, ($event.target as HTMLInputElement).checked)"
                  />
                </label>
                <h3>{{ category.label }}</h3>
                <span>{{ checkedCount(category.permissionKeys) }}/{{ category.permissionKeys.length }}</span>
              </header>

              <div v-for="resource in category.resources" :key="resource.key" class="roles-resource-row">
                <div class="roles-resource-header">
                  <label class="roles-check-row">
                    <input
                      type="checkbox"
                      :checked="arePermissionsChecked(resource.permissionKeys)"
                      :disabled="!canEdit"
                      @change="togglePermissions(resource.permissionKeys, ($event.target as HTMLInputElement).checked)"
                    />
                  </label>
                  <strong>{{ resourceLabel(resource.key) }}</strong>
                  <span class="roles-resource-count">{{ checkedCount(resource.permissionKeys) }}/{{ resource.permissionKeys.length }}</span>
                </div>
                <div class="roles-action-grid">
                  <label v-for="permission in resource.permissions" :key="permission.key" class="roles-action-option">
                    <span class="roles-check-row">
                      <input
                        type="checkbox"
                        :checked="localGrants[resource.key]?.[permission.action] === true"
                        :disabled="!canEdit"
                        @change="toggleGrant(resource.key, permission.action, ($event.target as HTMLInputElement).checked)"
                      />
                    </span>
                    <span>{{ actionLabel(permission.action) }}</span>
                  </label>
                </div>
              </div>
            </section>
          </div>
          <div v-else class="roles-no-matches">Không tìm thấy quyền phù hợp.</div>

          <footer class="roles-save-footer" :class="{ dirty }" aria-live="polite">
            <span v-if="saving">Đang lưu quyền…</span>
            <span v-else-if="dirty">Có thay đổi chưa lưu</span>
            <span v-else>Quyền đã được lưu</span>
          </footer>
        </template>
      </main>
    </div>

    <Transition name="modal-fade">
      <div v-if="formOpen" class="roles-modal-backdrop">
        <form class="roles-modal" @submit.prevent="submitForm">
          <header class="roles-modal-header">
            <h2>{{ editingGroup ? 'Sửa vai trò' : 'Thêm vai trò mới' }}</h2>
            <button type="button" class="roles-modal-close" @click="closeForm">Đóng</button>
          </header>
          <div class="roles-modal-body">
            <label for="role-name">Tên vai trò <span>*</span></label>
            <input
              id="role-name"
              v-model.trim="formName"
              type="text"
              maxlength="100"
              required
              :disabled="!!editingGroup?.isSystem"
              placeholder="Ví dụ: Quản lý, Nhân viên bán hàng..."
            />
            <label for="role-description">Mô tả</label>
            <textarea
              id="role-description"
              v-model="formDescription"
              maxlength="1000"
              rows="3"
              placeholder="Mô tả về vai trò này..."
            />
            <label v-if="!editingGroup" for="role-clone">Sao chép quyền từ <span class="roles-optional">(tùy chọn)</span></label>
            <select v-if="!editingGroup" id="role-clone" v-model="cloneFromId">
              <option value="">Tạo vai trò mới chưa có quyền</option>
              <option v-for="group in flatGroups" :key="group.id" :value="group.id">{{ group.name }}</option>
            </select>
            <p v-if="formError" class="roles-form-error" role="alert">{{ formError }}</p>
          </div>
          <footer class="roles-modal-footer">
            <button class="roles-button roles-button-secondary" type="button" :disabled="formSaving" @click="closeForm">Hủy</button>
            <button class="roles-button roles-button-primary" type="submit" :disabled="formSaving || !formName.trim()">
              {{ formSaving ? 'Đang lưu…' : editingGroup ? 'Cập nhật' : 'Tạo mới' }}
            </button>
          </footer>
        </form>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRbacStore, type PermissionGroupNode } from '@/stores/rbac';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/composables/use-toast';
import { RESOURCE_CATEGORIES, actionLabel, isDeprecatedGroup, resourceLabel } from '@/constants/permission-meta';

type Grants = Record<string, Record<string, boolean>>;
type FlatGroup = PermissionGroupNode & { _depth: number };
type PermissionLeaf = { key: string; action: string };
type ResourceView = { key: string; permissions: PermissionLeaf[]; permissionKeys: string[] };
type CategoryView = { key: string; label: string; resources: ResourceView[]; permissionKeys: string[] };

const store = useRbacStore();
const auth = useAuthStore();
const toast = useToast();
const selectedId = ref<string | null>(null);
const localGrants = ref<Grants>({});
const baselineGrants = ref<Grants>({});
const searchQuery = ref('');
const activeCategory = ref('all');
const copyFromId = ref('');
const saving = ref(false);
const seeding = ref(false);
const formOpen = ref(false);
const formSaving = ref(false);
const formError = ref('');
const formName = ref('');
const formDescription = ref('');
const cloneFromId = ref('');
const editingGroup = ref<FlatGroup | null>(null);

const canCreate = computed(() => auth.canAccess('permission_group', 'create'));
const canEdit = computed(() => auth.canAccess('permission_group', 'edit'));
const canDelete = computed(() => auth.canAccess('permission_group', 'delete'));
const loading = computed(() => store.loading);
const resources = computed(() => store.matrixMeta?.resources ?? []);
const resourceActions = computed(() => store.matrixMeta?.resourceActions ?? {});
const flatGroups = computed<FlatGroup[]>(() => {
  const result: FlatGroup[] = [];
  const walk = (nodes: PermissionGroupNode[], depth: number) => {
    for (const node of nodes) {
      result.push({ ...node, _depth: depth });
      if (node.children?.length) walk(node.children, depth + 1);
    }
  };
  walk(store.permissionGroups, 0);
  return result;
});
const selected = computed(() => flatGroups.value.find((group) => group.id === selectedId.value) ?? null);
const dirty = computed(() => JSON.stringify(localGrants.value) !== JSON.stringify(baselineGrants.value));
const categories = computed(() => [
  { key: 'all', label: 'Tất cả' },
  ...RESOURCE_CATEGORIES.map(({ key, label }) => ({ key, label })),
]);
const copyableGroups = computed(() => flatGroups.value.filter((group) => group.id !== selectedId.value));

const categoryViews = computed<CategoryView[]>(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase('vi');
  return RESOURCE_CATEGORIES
    .filter((category) => activeCategory.value === 'all' || category.key === activeCategory.value)
    .map((category) => {
      const categoryResources = category.resources
        .filter((resource) => resources.value.includes(resource))
        .map((resource): ResourceView => {
          const permissions = (resourceActions.value[resource] ?? [])
            .filter((action) => {
              if (!query) return true;
              const text = `${actionLabel(action)} ${resourceLabel(resource)} ${action} ${resource}`.toLocaleLowerCase('vi');
              return text.includes(query);
            })
            .map((action) => ({ key: `${resource}.${action}`, action }));
          return {
            key: resource,
            permissions,
            permissionKeys: permissions.map((permission) => permission.key),
          };
        })
        .filter((resource) => resource.permissions.length > 0);
      return {
        key: category.key,
        label: category.label,
        resources: categoryResources,
        permissionKeys: categoryResources.flatMap((resource) => resource.permissionKeys),
      };
    })
    .filter((category) => category.resources.length > 0);
});
const displayedCategories = computed(() => categoryViews.value);
const totalPermissions = computed(() => resources.value.reduce((sum, resource) => sum + (resourceActions.value[resource]?.length ?? 0), 0));
const grantsCount = computed(() => resources.value.reduce(
  (sum, resource) => sum + (resourceActions.value[resource] ?? []).filter((action) => localGrants.value[resource]?.[action] === true).length,
  0,
));

onMounted(async () => {
  try {
    await store.loadPermissionGroups();
  } catch (error: any) {
    toast.error(error?.response?.data?.error || 'Không tải được danh sách vai trò');
  }
});

watch(selectedId, (id) => {
  const group = flatGroups.value.find((entry) => entry.id === id);
  const grants = JSON.parse(JSON.stringify(group?.grants ?? {})) as Grants;
  localGrants.value = grants;
  baselineGrants.value = JSON.parse(JSON.stringify(grants));
  searchQuery.value = '';
  activeCategory.value = 'all';
  copyFromId.value = '';
});

function cloneGrants(grants: Grants): Grants {
  return JSON.parse(JSON.stringify(grants ?? {}));
}

function selectGroup(id: string) {
  if (id === selectedId.value) return;
  if (dirty.value && !window.confirm('Bạn có thay đổi chưa lưu. Chuyển vai trò sẽ mất thay đổi.')) return;
  selectedId.value = id;
}

function arePermissionsChecked(keys: string[]): boolean {
  return keys.length > 0 && keys.every((key) => {
    const [resource, action] = key.split('.');
    return localGrants.value[resource]?.[action] === true;
  });
}

function checkedCount(keys: string[]): number {
  return keys.filter((key) => {
    const [resource, action] = key.split('.');
    return localGrants.value[resource]?.[action] === true;
  }).length;
}

function toggleGrant(resource: string, action: string, checked: boolean) {
  if (!canEdit.value) return;
  if (!localGrants.value[resource]) localGrants.value[resource] = {};
  localGrants.value[resource][action] = checked;
}

function togglePermissions(keys: string[], checked: boolean) {
  if (!canEdit.value) return;
  for (const key of keys) {
    const [resource, action] = key.split('.');
    if (!localGrants.value[resource]) localGrants.value[resource] = {};
    localGrants.value[resource][action] = checked;
  }
}

function copyGrants() {
  const source = flatGroups.value.find((group) => group.id === copyFromId.value);
  if (!source || !canEdit.value) return;
  localGrants.value = cloneGrants(source.grants);
  copyFromId.value = '';
}

async function saveChanges() {
  if (!selected.value || !dirty.value || !canEdit.value || saving.value) return;
  saving.value = true;
  try {
    const snapshot = cloneGrants(localGrants.value);
    await store.updateGroupGrants(selected.value.id, snapshot);
    baselineGrants.value = cloneGrants(snapshot);
    toast.success('Cập nhật quyền vai trò thành công');
  } catch (error: any) {
    toast.error(error?.response?.data?.error || 'Không thể lưu quyền');
  } finally {
    saving.value = false;
  }
}

function cancelChanges() {
  localGrants.value = cloneGrants(baselineGrants.value);
}

function openForm(group?: FlatGroup) {
  if (group && !canEdit.value) return;
  if (!group && !canCreate.value) return;
  editingGroup.value = group ?? null;
  formName.value = group?.name ?? '';
  formDescription.value = group?.description ?? '';
  cloneFromId.value = '';
  formError.value = '';
  formOpen.value = true;
}

function closeForm() {
  if (formSaving.value) return;
  formOpen.value = false;
}

async function submitForm() {
  const name = formName.value.trim();
  if (!name) return;
  formSaving.value = true;
  formError.value = '';
  try {
    if (editingGroup.value) {
      const group = editingGroup.value;
      await store.updatePermissionGroup(group.id, {
        name: group.isSystem ? group.name : name,
        description: formDescription.value.trim() || null,
      });
      if (selectedId.value === group.id) selectedId.value = group.id;
      toast.success('Cập nhật vai trò thành công');
    } else {
      const created = await store.createPermissionGroup({
        name,
        description: formDescription.value.trim(),
        parentId: null,
        cloneFromId: cloneFromId.value || undefined,
      });
      selectedId.value = created.id;
      toast.success('Tạo vai trò thành công');
    }
    formOpen.value = false;
  } catch (error: any) {
    formError.value = error?.response?.data?.error || 'Không thể lưu vai trò';
  } finally {
    formSaving.value = false;
  }
}

async function archiveGroup(group: FlatGroup) {
  if (!canDelete.value || group.isSystem) return;
  if (!window.confirm(`Bạn có chắc chắn muốn xóa vai trò “${group.name}” không?`)) return;
  try {
    await store.archivePermissionGroup(group.id);
    if (selectedId.value === group.id) selectedId.value = null;
    toast.success('Đã xóa vai trò');
  } catch (error: any) {
    toast.error(error?.response?.data?.error || 'Không thể xóa vai trò');
  }
}

async function seedDefaults() {
  if (!canCreate.value || seeding.value) return;
  seeding.value = true;
  try {
    await store.seedDefaultGroups();
    toast.success('Đã tải vai trò mặc định');
  } catch (error: any) {
    toast.error(error?.response?.data?.error || 'Không thể tải vai trò mặc định');
  } finally {
    seeding.value = false;
  }
}
</script>

<style scoped>
.roles-page { --roles-cyan: #00b7cc; --roles-cyan-soft: rgba(0, 183, 204, .08); }
.roles-page-header { display:flex; align-items:center; justify-content:space-between; gap:20px; margin:0 0 20px; }
.roles-page-header .hero-title { margin:0; font-family:var(--app-font-heading); }
.roles-page-subtitle { margin:6px 0 0; color:var(--app-text-secondary); font-size:13px; }
.roles-layout { display:grid; grid-template-columns:320px minmax(0,1fr); grid-template-rows:minmax(0,1fr); height:min(75vh,860px); min-height:620px; overflow:hidden; background:#fff; border:1px solid var(--app-border-subtle); border-radius:12px; box-shadow:var(--app-shadow-sm); }
.roles-sidebar { display:flex; min-width:0; flex-direction:column; border-right:1px solid var(--app-border-subtle); background:#fafbfc; }
.roles-sidebar-header { display:flex; align-items:center; justify-content:space-between; padding:18px 16px; border-bottom:1px solid var(--app-border-subtle); }
.roles-sidebar-header h2 { margin:0 0 4px; font-size:15px; font-weight:650; }
.roles-sidebar-header span { color:var(--app-text-secondary); font-size:12px; }
.roles-list { min-height:0; flex:1; overflow:auto; padding:8px; }
.roles-list-row { display:flex; align-items:center; gap:4px; margin:3px 0; padding:0 5px 0 calc(5px + var(--role-depth) * 10px); border:1px solid transparent; border-left:4px solid transparent; border-radius:8px; background:#fff; }
.roles-list-row.selected { border-color:rgba(0,183,204,.2); border-left-color:var(--roles-cyan); background:var(--roles-cyan-soft); }
.roles-list-select { display:flex; min-width:0; flex:1; align-items:flex-start; gap:10px; padding:10px 5px; border:0; background:transparent; color:inherit; text-align:left; cursor:pointer; }
.roles-list-copy { display:flex; min-width:0; flex-direction:column; gap:4px; }
.roles-list-copy strong { overflow:hidden; color:var(--app-text-primary); font-size:13px; font-weight:600; text-overflow:ellipsis; white-space:nowrap; }
.roles-list-description { overflow:hidden; color:var(--app-text-secondary); font-size:11px; text-overflow:ellipsis; white-space:nowrap; }
.roles-list-meta { display:flex; flex-wrap:wrap; align-items:center; gap:7px; color:var(--app-text-secondary); font-size:10px; }
.roles-status-system,.roles-status-custom,.roles-status-deprecated { padding:2px 6px; border-radius:999px; background:#e8f7f9; color:#087e8b; }
.roles-status-custom { background:#f2f3f5; color:#59616d; }
.roles-status-deprecated { background:#f3f4f6; color:#6b7280; }
.roles-row-actions { display:flex; flex:0 0 auto; gap:4px; }
.roles-row-action { padding:5px; border:0; border-radius:5px; background:transparent; color:var(--roles-cyan); cursor:pointer; font:inherit; font-size:11px; }
.roles-row-action:hover { background:#effbfc; }
.roles-delete-button { color:#ba3a35; }
.roles-delete-button:hover { background:#fff0ef; }
.roles-empty-list { margin:auto; padding:24px; color:var(--app-text-secondary); text-align:center; font-size:13px; }
.roles-seed-button { margin:0 12px 12px; padding:7px; border:0; background:transparent; color:var(--app-text-muted); cursor:pointer; font:inherit; font-size:11px; }
.roles-seed-button:hover { color:var(--roles-cyan); }
.roles-seed-button:disabled { cursor:wait; opacity:.6; }
.roles-editor { display:flex; min-width:0; min-height:0; flex-direction:column; overflow:hidden; background:#f7f9fa; }
.roles-editor-empty { display:flex; flex:1; min-height:400px; flex-direction:column; align-items:center; justify-content:center; gap:12px; padding:32px; color:#87909a; text-align:center; }
.roles-editor-empty p { max-width:320px; margin:0; font-size:14px; }
.roles-editor-header { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:18px 22px; border-bottom:1px solid var(--app-border-subtle); background:#fff; }
.roles-editor-title h2 { margin:0 0 5px; color:#183d43; font-size:20px; font-weight:650; }
.roles-editor-title p { margin:0; color:var(--app-text-secondary); font-size:12px; }
.roles-editor-buttons { display:flex; flex-wrap:wrap; gap:8px; }
.roles-button { display:inline-flex; min-height:36px; align-items:center; justify-content:center; gap:6px; padding:8px 13px; border:1px solid var(--app-border-default); border-radius:8px; background:#fff; color:var(--app-text-primary); cursor:pointer; font:inherit; font-size:12px; font-weight:600; }
.roles-button:disabled { cursor:not-allowed; opacity:.55; }
.roles-button-primary { border-color:var(--roles-cyan); background:var(--roles-cyan); color:#fff; }
.roles-button-primary:hover:not(:disabled) { border-color:#009bad; background:#009bad; }
.roles-button-secondary:hover:not(:disabled) { border-color:var(--roles-cyan); color:#007e8a; }
.roles-copy-tools { display:flex; align-items:center; gap:8px; padding:10px 22px; border-bottom:1px solid var(--app-border-subtle); background:#fff; }
.roles-copy-tools label { color:var(--app-text-secondary); font-size:11px; }
.roles-copy-tools select { min-width:170px; flex:1; max-width:300px; padding:7px 9px; border:1px solid var(--app-border-default); border-radius:7px; background:#fff; color:var(--app-text-primary); font:inherit; font-size:12px; }
.roles-permission-toolbar { display:flex; flex-direction:column; gap:12px; padding:15px 22px 12px; }
.roles-search { display:flex; max-width:460px; align-items:center; gap:8px; padding:0 11px; border:1px solid var(--app-border-default); border-radius:8px; background:#fff; color:var(--app-text-muted); }
.roles-search:focus-within { border-color:var(--roles-cyan); box-shadow:0 0 0 3px rgba(0,183,204,.1); }
.roles-search input { width:100%; min-width:0; padding:9px 0; border:0; outline:0; background:transparent; color:var(--app-text-primary); font:inherit; font-size:12px; }
.roles-search input::-webkit-search-cancel-button { cursor:pointer; }
.roles-search button { border:0; background:transparent; color:var(--app-text-muted); cursor:pointer; font:inherit; font-size:11px; }
.roles-category-filters { display:flex; flex-wrap:wrap; gap:7px; }
.roles-category-filters button { padding:6px 11px; border:1px solid var(--app-border-default); border-radius:999px; background:#fff; color:var(--app-text-secondary); cursor:pointer; font:inherit; font-size:11px; }
.roles-category-filters button.active { border-color:var(--roles-cyan); background:var(--roles-cyan); color:#fff; }
.roles-permission-list { min-height:0; flex:1; display:flex; flex-direction:column; gap:12px; overflow:auto; padding:0 22px 18px; }
.roles-category-card { flex:0 0 auto; overflow:hidden; border:1px solid var(--app-border-subtle); border-radius:10px; background:#fff; }
.roles-category-header { display:flex; align-items:center; gap:10px; padding:11px 14px; background:#f0f3f4; }
.roles-category-header h3 { flex:1; margin:0; color:#35484d; font-size:12px; font-weight:700; }
.roles-category-header > span:last-child { color:var(--app-text-secondary); font-size:10px; }
.roles-check-row { display:inline-flex; align-items:center; cursor:pointer; }
.roles-check-row input { width:16px; height:16px; margin:0; accent-color:var(--roles-cyan); cursor:pointer; }
.roles-check-row input:disabled { cursor:not-allowed; }
.roles-resource-row + .roles-resource-row { border-top:1px solid #edf0f1; }
.roles-resource-header { display:flex; min-height:39px; align-items:center; gap:8px; padding:7px 14px 3px; }
.roles-resource-header strong { flex:1; color:#526168; font-size:10px; font-weight:700; letter-spacing:.045em; text-transform:uppercase; }
.roles-resource-count { color:var(--app-text-muted); font-size:10px; }
.roles-action-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:2px 14px; padding:4px 18px 11px 58px; }
.roles-action-option { display:flex; min-height:30px; align-items:center; gap:8px; color:var(--app-text-primary); cursor:pointer; font-size:12px; }
.roles-action-option:has(input:disabled) { cursor:default; }
.roles-no-matches { margin:0 22px 20px; padding:34px; border:1px dashed var(--app-border-default); border-radius:10px; color:var(--app-text-secondary); text-align:center; font-size:13px; }
.roles-save-footer { padding:10px 22px; border-top:1px solid var(--app-border-subtle); background:#f1f4f5; color:var(--app-text-secondary); font-size:11px; }
.roles-save-footer.dirty { background:#effbfc; color:#087e8b; }
.roles-loading { min-height:300px; display:grid; place-items:center; color:var(--app-text-secondary); }
.roles-modal-backdrop { position:fixed; z-index:2500; inset:0; display:grid; place-items:center; padding:20px; background:rgba(0,0,0,.5); }
.roles-modal { width:min(100%,448px); overflow:hidden; border:1px solid rgba(0,0,0,.06); border-radius:12px; background:#fff; box-shadow:0 18px 60px rgba(0,0,0,.24); }
.roles-modal-header { display:flex; align-items:center; justify-content:space-between; padding:17px 20px; border-bottom:1px solid #edf0f1; }
.roles-modal-header h2 { margin:0; color:#153c43; font-size:18px; font-weight:650; }
.roles-modal-close { padding:5px 8px; border:1px solid var(--app-border-default); border-radius:6px; background:#fff; color:var(--app-text-secondary); cursor:pointer; font:inherit; font-size:11px; }
.roles-modal-close:hover { border-color:var(--roles-cyan); color:#007e8a; }
.roles-modal-body { display:flex; flex-direction:column; gap:8px; padding:19px 20px 22px; }
.roles-modal-body label { margin-top:5px; color:#34484d; font-size:12px; font-weight:600; }
.roles-modal-body label span { color:#c43f3b; }
.roles-modal-body label .roles-optional { color:var(--app-text-muted); font-weight:400; }
.roles-modal-body input,.roles-modal-body textarea,.roles-modal-body select { width:100%; box-sizing:border-box; padding:10px 11px; border:1px solid var(--app-border-default); border-radius:8px; background:#fff; color:var(--app-text-primary); font:inherit; font-size:12px; }
.roles-modal-body textarea { resize:vertical; }
.roles-modal-body input:focus,.roles-modal-body textarea:focus,.roles-modal-body select:focus { border-color:var(--roles-cyan); outline:3px solid rgba(0,183,204,.12); }
.roles-modal-body input:disabled { background:#f2f4f5; color:var(--app-text-secondary); }
.roles-form-error { margin:5px 0 0; color:#b42318; font-size:12px; }
.roles-modal-footer { display:flex; justify-content:flex-end; gap:8px; padding:13px 20px; background:#f7f9fa; }
@media (min-width:900px) { .roles-action-grid { grid-template-columns:repeat(3,minmax(0,1fr)); } }
@media (min-width:1200px) { .roles-action-grid { grid-template-columns:repeat(4,minmax(0,1fr)); } }
@media (max-width:850px) {
  .roles-layout { grid-template-columns:260px minmax(0,1fr); }
  .roles-editor-header { align-items:flex-start; flex-direction:column; }
}
@media (max-width:650px) {
  .roles-page-header { align-items:flex-start; }
  .roles-page-header .roles-button-primary { flex:0 0 auto; }
  .roles-layout { grid-template-columns:minmax(0,1fr); height:auto; min-height:0; overflow:visible; }
  .roles-sidebar { max-height:330px; border-right:0; border-bottom:1px solid var(--app-border-subtle); }
  .roles-list { max-height:230px; }
  .roles-editor { min-height:460px; }
  .roles-editor-header,.roles-copy-tools,.roles-permission-toolbar { padding-right:14px; padding-left:14px; }
  .roles-permission-list { padding-right:12px; padding-left:12px; }
  .roles-category-filters { flex-wrap:nowrap; overflow:auto; padding-bottom:3px; }
  .roles-category-filters button { flex:0 0 auto; }
  .roles-action-grid { padding-left:50px; }
  .roles-copy-tools { flex-wrap:wrap; }
  .roles-copy-tools select { min-width:120px; }
}
@media (max-width:400px) {
  .roles-page-header { flex-direction:column; }
  .roles-action-grid { grid-template-columns:minmax(0,1fr); }
  .roles-list-row { padding-left:5px; }
}
</style>
