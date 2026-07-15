<template>
  <div class="network-page">
    <!-- Canvas Workspace -->
    <div class="canvas-container" ref="canvasRef">

      <!-- Floating User Selection Dropdown -->
      <div class="floating-filter-box">
        <v-autocomplete
          v-model="selectedUserId"
          :items="users"
          item-title="fullName"
          item-value="id"
          label="Chọn nhân sự cần thiết lập..."
          placeholder="Gõ tên, email hoặc SĐT để tìm..."
          :custom-filter="filterUser"
          variant="solo-filled"
          density="comfortable"
          hide-details
          prepend-inner-icon="mdi-account-search"
          bg-color="#1e293b"
          class="user-select-dropdown"
        >
          <template v-slot:item="{ props: itemProps, item }">
            <v-list-item
              v-bind="itemProps"
              :prepend-avatar="getUserItem(item).avatarUrl || '/avatar-placeholder.png'"
              :title="getUserItem(item).fullName"
              :subtitle="getUserItem(item).permissionGroup?.name || 'Chưa gán nhóm'"
            ></v-list-item>
          </template>
        </v-autocomplete>
      </div>
      <!-- SVG Overlay for Connecting Lines -->
      <svg class="connections-svg">
        <defs>
          <!-- Neon Glow Filters -->
          <filter id="glow-blue" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glow-purple" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <!-- Draw connection paths dynamically -->
        <g v-if="selectedUser">
          <!-- Line: User ➔ Role -->
          <path
            v-if="coords.user && coords.role"
            :d="drawCurve(coords.user.x, coords.user.y, coords.role.x, coords.role.y)"
            class="edge-line edge-blue-dashed"
            filter="url(#glow-blue)"
          />
          <!-- Line: User ➔ Overrides -->
          <path
            v-if="coords.user && coords.custom"
            :d="drawCurve(coords.user.x, coords.user.y, coords.custom.x, coords.custom.y)"
            class="edge-line edge-purple"
            filter="url(#glow-purple)"
          />
          <!-- Line: Role ➔ Role Container -->
          <path
            v-if="coords.role && coords.roleBox"
            :d="drawCurve(coords.role.x, coords.role.y, coords.roleBox.x, coords.roleBox.y)"
            class="edge-line edge-blue-solid"
            filter="url(#glow-blue)"
          />
          <!-- Line: Overrides ➔ Overrides Container -->
          <path
            v-if="coords.custom && coords.customBox"
            :d="drawCurve(coords.custom.x, coords.custom.y, coords.customBox.x, coords.customBox.y)"
            class="edge-line edge-purple"
            filter="url(#glow-purple)"
          />
        </g>
      </svg>

      <!-- Main Layout Columns -->
      <div class="network-columns" v-if="selectedUser">
        <!-- COLUMN 1: USER ROOT -->
        <div class="network-column col-left">
          <div
            class="node-card user-node"
            :class="{ active: activeSelection === 'user' }"
            ref="userNodeRef"
            @click="selectSource('user')"
          >
            <div class="node-glow-border"></div>
            <v-avatar size="60" class="mb-3 border-2 border-white">
              <v-img :src="selectedUser.avatarUrl || '/avatar-placeholder.png'"></v-img>
            </v-avatar>
            <h3 class="user-name">{{ selectedUser.fullName }}</h3>
            <span class="user-role-badge">{{ selectedUser.permissionGroup?.name || 'Không có vai trò' }}</span>
            <div class="user-info-rows text-xs mt-3">
              <div>SĐT: {{ selectedUser.phone || 'Chưa cập nhật' }}</div>
              <div>Phòng ban: {{ selectedUser.departmentMember?.department?.name || 'Chưa phân phòng' }}</div>
            </div>
            <div class="click-indicator text-xs">
              {{ activeSelection === 'user' ? '● Đang chọn kết nối' : 'Click để chọn kết nối' }}
            </div>
          </div>
        </div>

        <!-- COLUMN 2: ROLES & CUSTOM OVERRIDES MIDDLEWARE -->
        <div class="network-column col-middle">
          <!-- Role Node -->
          <div
            class="node-card role-node mb-10"
            ref="roleNodeRef"
          >
            <div class="role-icon">🛡</div>
            <h4 class="node-title">Nhóm Quyền: {{ selectedUser.permissionGroup?.name || 'Mặc định' }}</h4>
            <p class="text-xs text-grey-darken-1 mt-1">Cung cấp bộ quyền tiêu chuẩn</p>
          </div>

          <!-- Custom Overrides Node -->
          <div
            class="node-card custom-node"
            :class="{ active: activeSelection === 'custom' }"
            ref="customNodeRef"
            @click="selectSource('custom')"
          >
            <div class="custom-icon">✨</div>
            <h4 class="node-title">Tính Năng Cấp Riêng</h4>
            <p class="text-xs text-grey-darken-1 mt-1">Ghi đè hoặc bổ sung quyền lẻ</p>
            <div class="click-indicator text-xs">
              {{ activeSelection === 'custom' ? '● Đang chọn kết nối' : 'Click để chọn kết nối' }}
            </div>
          </div>
        </div>

        <!-- COLUMN 3: CONTAINERS & FEATURES -->
        <div class="network-column col-right">
          <!-- Container 1: Role Permissions (Blue Glassmorphism) -->
          <div class="glass-container container-role" ref="roleContainerRef">
            <div class="container-title text-blue">Quyền Theo Nhóm (Đọc chỉ ghi)</div>
            <div class="features-grid">
              <div
                v-for="r in roleFeatures"
                :key="`role-${r}`"
                class="feature-pill pill-role"
                :class="{ 'is-overridden': isOverridden(r) }"
              >
                <span class="feature-icon">{{ resourceIcon(r) }}</span>
                <div class="feature-details">
                  <span class="feature-name">{{ resourceLabel(r) }}</span>
                  <div class="feature-actions">
                    {{ activeActionsList(getRoleGrantsForResource(r)) }}
                  </div>
                </div>
                <v-tooltip v-if="isOverridden(r)" location="top" text="Bị ghi đè bởi phân quyền lẻ">
                  <template #activator="{ props: tipProps }">
                    <span v-bind="tipProps" class="override-badge" aria-label="Đã ghi đè">⚡</span>
                  </template>
                </v-tooltip>
              </div>
              <div v-if="roleFeatures.length === 0" class="text-xs text-grey">Chưa gán quyền nhóm</div>
            </div>
          </div>

          <!-- Container 2: Custom Overrides (Purple Glassmorphism) -->
          <div class="glass-container container-custom" ref="customContainerRef">
            <div class="container-title text-purple">Tính Năng Cấp Thêm (Click-to-Connect)</div>
            <div class="features-grid">
              <div
                v-for="r in resources"
                :key="r"
                class="feature-pill pill-custom"
                :class="{
                  active: isOverridden(r),
                  inactive: !isOverridden(r),
                  targeted: isTargeted(r)
                }"
                @click="toggleFeatureOverride(r)"
              >
                <span class="feature-icon">{{ resourceIcon(r) }}</span>
                <div class="feature-details">
                  <span class="feature-name">{{ resourceLabel(r) }}</span>
                  <div class="feature-action-badges" v-if="isOverridden(r)">
                    <span
                      v-for="a in resourceActions[r]"
                      :key="a"
                      class="action-badge"
                      :class="{ active: localCustomGrants[r]?.[a] }"
                      @click.stop="toggleActionOverride(r, a)"
                    >
                      {{ actionLabelShort(a) }}
                    </span>
                  </div>
                </div>
                <div class="toggle-icon">
                  {{ isOverridden(r) ? '✓' : '+' }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Select User Hint & Loading states -->
      <div v-else-if="loadingUsers" class="empty-canvas-state">
        <v-skeleton-loader type="card-avatar, list-item-three-line@3" />
      </div>
      <div v-else-if="users.length === 0" class="empty-canvas-state">
        <div class="empty-icon">🛡</div>
        <h2>Chưa có nhân sự nào trong tổ chức</h2>
        <p>Vào mục "Nhân viên" để tạo user trước.</p>
      </div>
      <div v-else class="empty-canvas-state">
        <div class="empty-icon">🛡</div>
        <h2>Vui lòng chọn một tài khoản nhân sự ở trên</h2>
        <p>Bản đồ mạng lưới liên kết quyền hạn sẽ hiển thị ngay khi tài khoản được tải lên.</p>
      </div>
    </div>

    <!-- Action Bar at Bottom -->
    <div class="action-bar-wrap" v-if="selectedUser && hasChanges">
      <div class="action-bar-card">
        <span class="warn-text">⚠️ Bạn có thay đổi chưa lưu trên tài khoản này!</span>
        <div class="d-flex" style="gap: 8px;">
          <v-btn variant="outlined" color="grey-lighten-1" :disabled="saving" @click="resetLocalGrants">Hoàn tác</v-btn>
          <v-btn color="primary" :loading="saving" @click="saveOverrides">Lưu thay đổi</v-btn>
        </div>
      </div>
    </div>

    <ConfirmOverridesDialog
      v-model="showConfirm"
      :user-name="selectedUser?.fullName ?? ''"
      :diff="grantsDiff"
      :loading="saving"
      @confirm="performSave"
      @cancel="showConfirm = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import { useRbacStore, type RbacUser } from '@/stores/rbac';
import { api } from '@/api/index';
import { useToast } from '@/composables/use-toast';
import { resourceLabel, resourceIcon, actionLabelShort } from '@/constants/permission-meta';
import ConfirmOverridesDialog from '@/components/rbac/ConfirmOverridesDialog.vue';
import { useGrantsDiff } from '@/composables/use-grants-diff';

const store = useRbacStore();
const toast = useToast();

function removeAccents(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

function filterUser(_value: string, query: string, item?: any): boolean {
  const q = removeAccents(query || '').trim().toLowerCase();
  if (!q) return true;
  const raw = item?.raw || item;
  const name = removeAccents(raw?.fullName || '').toLowerCase();
  const email = removeAccents(raw?.email || '').toLowerCase();
  const phone = removeAccents(raw?.phone || '').toLowerCase();
  return name.includes(q) || email.includes(q) || phone.includes(q);
}

function getUserItem(item: any): any {
  return item?.raw ?? item ?? {};
}

const users = ref<RbacUser[]>([]);
const selectedUserId = ref<string | null>(null);
const activeSelection = ref<'user' | 'custom'>('custom');
const saving = ref(false);

// Local state for overrides to allow instant responsive toggling
const localCustomGrants = ref<Record<string, Record<string, boolean>>>({});
const initialCustomGrants = ref<string>('{}');

// Refs for measuring coordinates to draw SVG lines
const canvasRef = ref<HTMLElement | null>(null);
const userNodeRef = ref<HTMLElement | null>(null);
const roleNodeRef = ref<HTMLElement | null>(null);
const customNodeRef = ref<HTMLElement | null>(null);
const roleContainerRef = ref<HTMLElement | null>(null);
const customContainerRef = ref<HTMLElement | null>(null);

const coords = ref<{
  user: { x: number; y: number } | null;
  role: { x: number; y: number } | null;
  custom: { x: number; y: number } | null;
  roleBox: { x: number; y: number } | null;
  customBox: { x: number; y: number } | null;
}>({
  user: null,
  role: null,
  custom: null,
  roleBox: null,
  customBox: null,
});

let resizeObserver: ResizeObserver | null = null;

function setupResizeObserver() {
  if (resizeObserver) resizeObserver.disconnect();
  const refs = [
    userNodeRef.value,
    roleNodeRef.value,
    customNodeRef.value,
    roleContainerRef.value,
    customContainerRef.value,
  ].filter((el): el is HTMLElement => el !== null);

  if (refs.length === 0) return;
  resizeObserver = new ResizeObserver(() => {
    requestAnimationFrame(recalculateCoords);
  });
  refs.forEach((el) => resizeObserver!.observe(el));
}

const showConfirm = ref(false);
const grantsDiff = useGrantsDiff(initialCustomGrants, localCustomGrants);
const loadingUsers = ref(false);

onMounted(async () => {
  await store.loadPermissionGroups();
  loadingUsers.value = true;
  try {
    const { data } = await api.get('/rbac/users');
    users.value = data.users ?? [];
  } catch {
    users.value = [];
  } finally {
    loadingUsers.value = false;
  }
  window.addEventListener('resize', recalculateCoords);
  // Defer 1 frame để DOM render xong
  nextTick(() => {
    setTimeout(() => {
      setupResizeObserver();
      recalculateCoords();
    }, 100);
  });
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', recalculateCoords);
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
});

const resources = computed(() => store.matrixMeta?.resources ?? []);
const resourceActions = computed(() => store.matrixMeta?.resourceActions ?? {});

const selectedUser = computed(() => users.value.find((u) => u.id === selectedUserId.value));

// Standard features active for the selected user's role group
const roleFeatures = computed(() => {
  const pg = selectedUser.value?.permissionGroup as any;
  if (!pg?.grants) return [];
  const grants = pg.grants as Record<string, Record<string, boolean>>;
  return resources.value.filter((r) => {
    const row = grants[r];
    if (!row) return false;
    return Object.values(row).some((val) => val === true);
  });
});

function getRoleGrantsForResource(r: string): Record<string, boolean> {
  const pg = selectedUser.value?.permissionGroup as any;
  return pg?.grants?.[r] || {};
}

const hasChanges = computed(() => {
  return JSON.stringify(localCustomGrants.value) !== initialCustomGrants.value;
});

// Watch selected user to sync local grants & trigger visual coordinates redraw
watch(selectedUserId, (newVal) => {
  if (newVal) {
    const u = users.value.find((x) => x.id === newVal);
    const overrides = (u as any)?.customGrants || {};
    localCustomGrants.value = JSON.parse(JSON.stringify(overrides));
    initialCustomGrants.value = JSON.stringify(overrides);
    activeSelection.value = 'custom';
    nextTick(() => {
      setTimeout(() => {
        setupResizeObserver(); // ← quan trọng: setup LẠI sau DOM swap
        recalculateCoords();
      }, 100);
    });
  } else {
    localCustomGrants.value = {};
    initialCustomGrants.value = '{}';
  }
});

watch(
  () => localCustomGrants.value,
  () => {
    nextTick(() => requestAnimationFrame(recalculateCoords));
  },
  { deep: true }
);

// Selection helpers
function selectSource(type: 'user' | 'custom') {
  activeSelection.value = type;
}

function isOverridden(r: string): boolean {
  const row = localCustomGrants.value[r];
  if (!row) return false;
  return Object.values(row).some((v) => v === true);
}

function isTargeted(r: string): boolean {
  return activeSelection.value === 'custom' && !isOverridden(r);
}

// Click-to-connect logic: toggles feature override on or off
function toggleFeatureOverride(r: string) {
  if (isOverridden(r)) {
    // Delete/disconnect override
    delete localCustomGrants.value[r];
  } else {
    // Connect override - default to grant all actions
    localCustomGrants.value[r] = {};
    const actions = resourceActions.value[r] ?? [];
    for (const a of actions) {
      localCustomGrants.value[r][a] = true;
    }
  }
}

function toggleActionOverride(r: string, a: string) {
  if (!localCustomGrants.value[r]) localCustomGrants.value[r] = {};
  localCustomGrants.value[r][a] = !localCustomGrants.value[r][a];
  // Cleanup row if all actions are false
  const hasAny = Object.values(localCustomGrants.value[r]).some((v) => v === true);
  if (!hasAny) {
    delete localCustomGrants.value[r];
  }
}

function resetLocalGrants() {
  localCustomGrants.value = JSON.parse(initialCustomGrants.value);
}

function saveOverrides() {
  if (!selectedUserId.value) return;
  showConfirm.value = true; // ← chỉ mở dialog, không gọi API
}

async function performSave() {
  if (!selectedUserId.value) return;
  saving.value = true;
  try {
    const { data } = await api.patch(`/rbac/users/${selectedUserId.value}/overrides`, {
      customGrants: localCustomGrants.value,
    });
    // Sync local users list (đã có)
    const idx = users.value.findIndex((u) => u.id === selectedUserId.value);
    if (idx !== -1) {
      (users.value[idx] as any).customGrants = data.customGrants;
    }
    // sync store.users nếu user đang trong store cache
    const storeIdx = store.users.findIndex((u) => u.id === selectedUserId.value);
    if (storeIdx !== -1) {
      (store.users[storeIdx] as any).customGrants = data.customGrants;
    }
    initialCustomGrants.value = JSON.stringify(data.customGrants);
    showConfirm.value = false;
    toast.success('Đã lưu sơ đồ phân quyền lẻ thành công!');
  } catch (e: any) {
    toast.error(e?.response?.data?.error || 'Lỗi lưu phân quyền lẻ');
  } finally {
    saving.value = false;
  }
}

// Coordinate measurement for drawing connector curves
function recalculateCoords() {
  if (!canvasRef.value || !selectedUser.value) return;

  const canvasBound = canvasRef.value.getBoundingClientRect();

  const getCenterOfRef = (refEl: HTMLElement | null) => {
    if (!refEl) return null;
    const b = refEl.getBoundingClientRect();
    return {
      x: b.left - canvasBound.left + b.width / 2,
      y: b.top - canvasBound.top + b.height / 2,
    };
  };

  const getContainerLeftCenter = (refEl: HTMLElement | null) => {
    if (!refEl) return null;
    const b = refEl.getBoundingClientRect();
    return {
      x: b.left - canvasBound.left,
      y: b.top - canvasBound.top + b.height / 2,
    };
  };

  coords.value = {
    user: getCenterOfRef(userNodeRef.value),
    role: getCenterOfRef(roleNodeRef.value),
    custom: getCenterOfRef(customNodeRef.value),
    roleBox: getContainerLeftCenter(roleContainerRef.value),
    customBox: getContainerLeftCenter(customContainerRef.value),
  };
}

// Draws a smooth horizontal cubic bezier curve between node centers
function drawCurve(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.abs(x2 - x1);
  const cx1 = x1 + dx * 0.45;
  const cy1 = y1;
  const cx2 = x2 - dx * 0.45;
  const cy2 = y2;
  return `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
}

function activeActionsList(actionsObj: Record<string, boolean>): string {
  return Object.entries(actionsObj)
    .filter(([_, val]) => val === true)
    .map(([key, _]) => actionLabelShort(key))
    .join(', ') || 'N/A';
}
</script>

<style scoped>
.network-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  color: #f8fafc;
}

/* Floating Controls on Canvas */
.floating-title-box {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 50;
  pointer-events: none;
}
.canvas-title {
  font-size: 14px;
  font-weight: 700;
  text-transform: uppercase;
  color: #38bdf8;
  letter-spacing: 0.05em;
  background: rgba(15, 23, 42, 0.7);
  backdrop-filter: blur(8px);
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
}
.floating-filter-box {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 320px;
  z-index: 50;
}
.floating-filter-box :deep(.user-select-dropdown) {
  border-radius: 8px !important;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4) !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
}

/* Canvas Container Workspace with Subtle Grid Background */
.canvas-container {
  flex: 1;
  position: relative;
  background-color: #0f172a;
  background-image: 
    radial-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 0),
    radial-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 0);
  background-size: 24px 24px;
  background-position: 0 0, 12px 12px;
  overflow: auto;
  min-height: 700px;
  padding: 40px;
}

.empty-canvas-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 80%;
  text-align: center;
  color: #64748b;
  margin-top: 100px;
}
.empty-icon {
  font-size: 72px;
  margin-bottom: 20px;
  animation: float 4s ease-in-out infinite;
}
@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}

/* Interactive SVG edge connections overlay */
.connections-svg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1;
}

.edge-line {
  fill: none;
  stroke-linecap: round;
  transition: all 0.3s;
}

.edge-blue-dashed {
  stroke: #0ea5e9;
  stroke-width: 2.5px;
  stroke-dasharray: 6 6;
  opacity: 0.85;
}

.edge-blue-solid {
  stroke: #0ea5e9;
  stroke-width: 3px;
  opacity: 0.85;
}

.edge-purple {
  stroke: #d946ef;
  stroke-width: 3px;
  opacity: 0.95;
}

/* Network Columns layout */
.network-columns {
  display: grid;
  grid-template-columns: 280px 300px 1fr;
  gap: 60px;
  position: relative;
  z-index: 2;
  height: 100%;
  align-items: center;
}

.network-column {
  display: flex;
  flex-direction: column;
  justify-content: center;
}

/* Node Cards */
.node-card {
  position: relative;
  background: rgba(30, 41, 59, 0.7);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  text-align: center;
}

.node-card:hover {
  transform: translateY(-4px) scale(1.02);
  border-color: rgba(255, 255, 255, 0.2);
}

.node-card.active {
  box-shadow: 0 0 25px rgba(217, 70, 239, 0.2);
}

.node-card.active .node-glow-border {
  opacity: 1;
}

.node-glow-border {
  position: absolute;
  inset: -1px;
  border-radius: 16px;
  background: linear-gradient(135deg, #0ea5e9, #d946ef);
  z-index: -1;
  opacity: 0;
  transition: opacity 0.3s;
  padding: 1px;
  content: '';
}

.user-node {
  border-color: rgba(14, 165, 233, 0.3);
}

.user-name {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
}

.user-role-badge {
  display: inline-block;
  background: rgba(14, 165, 233, 0.15);
  color: #38bdf8;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 12px;
  margin-top: 6px;
}

.click-indicator {
  margin-top: 14px;
  color: #64748b;
  font-weight: 500;
}
.node-card.active .click-indicator {
  color: #d946ef;
  font-weight: 700;
}

.role-node {
  border-color: rgba(14, 165, 233, 0.3);
  cursor: default;
}
.role-icon {
  font-size: 32px;
  margin-bottom: 8px;
}

.custom-node {
  border-color: rgba(217, 70, 239, 0.3);
}
.custom-node.active {
  border-color: #d946ef;
}
.custom-icon {
  font-size: 32px;
  margin-bottom: 8px;
  color: #d946ef;
}

/* Glassmorphic Containers on the Right */
.glass-container {
  background: rgba(15, 23, 42, 0.75);
  backdrop-filter: blur(20px);
  border-radius: 20px;
  padding: 24px;
  box-shadow: 0 15px 40px rgba(0, 0, 0, 0.3);
  margin-bottom: 30px;
  border: 1.5px solid transparent;
}

.container-role {
  border-color: rgba(14, 165, 233, 0.25);
  background: linear-gradient(185deg, rgba(15, 23, 42, 0.8), rgba(14, 165, 233, 0.03));
}

.container-custom {
  border-color: rgba(217, 70, 239, 0.25);
  background: linear-gradient(185deg, rgba(15, 23, 42, 0.8), rgba(217, 70, 239, 0.03));
}

.container-title {
  font-size: 14px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  margin-bottom: 18px;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}

/* Feature Pills styling */
.feature-pill {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
  transition: all 0.2s ease-in-out;
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.pill-role {
  background: rgba(30, 41, 59, 0.4);
  color: #94a3b8;
  border-color: rgba(14, 165, 233, 0.1);
}
.pill-role .feature-actions {
  margin-left: auto;
  font-size: 10px;
  color: #38bdf8;
  background: rgba(14, 165, 233, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
}

.pill-custom {
  cursor: pointer;
}
.pill-custom.inactive {
  background: rgba(30, 41, 59, 0.3);
  color: #475569;
}
.pill-custom.inactive:hover {
  background: rgba(30, 41, 59, 0.5);
  color: #94a3b8;
  border-color: rgba(255, 255, 255, 0.15);
}

.pill-custom.active {
  background: rgba(217, 70, 239, 0.06);
  color: #fff;
  border-color: rgba(217, 70, 239, 0.4);
  box-shadow: 0 4px 15px rgba(217, 70, 239, 0.08);
}
.pill-custom.active:hover {
  border-color: rgba(217, 70, 239, 0.6);
  background: rgba(217, 70, 239, 0.1);
}

.pill-custom.targeted {
  animation: pulse-purple 2s infinite;
}

@keyframes pulse-purple {
  0% { border-color: rgba(217, 70, 239, 0.2); }
  50% { border-color: rgba(217, 70, 239, 0.6); }
  100% { border-color: rgba(217, 70, 239, 0.2); }
}

.feature-icon {
  font-size: 18px;
  margin-right: 12px;
}

.feature-details {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.feature-action-badges {
  display: flex;
  gap: 4px;
  margin-top: 6px;
  flex-wrap: wrap;
}

.action-badge {
  font-size: 9px;
  font-weight: 700;
  padding: 1px 4px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.06);
  color: #64748b;
  border: 1px solid transparent;
  transition: all 0.15s;
}

.action-badge.active {
  background: rgba(217, 70, 239, 0.15);
  color: #d946ef;
  border-color: rgba(217, 70, 239, 0.3);
}

.toggle-icon {
  margin-left: auto;
  font-size: 16px;
  color: #475569;
  font-weight: 700;
}
.pill-custom.active .toggle-icon {
  color: #d946ef;
}

/* Floating Action Bar at the Bottom */
.action-bar-wrap {
  position: fixed;
  bottom: 24px;
  left: 290px; /* offset sidebar if needed, or center */
  right: 24px;
  z-index: 100;
  display: flex;
  justify-content: center;
}
.action-bar-card {
  background: rgba(30, 41, 59, 0.9);
  backdrop-filter: blur(16px);
  border: 1.5px solid rgba(217, 70, 239, 0.4);
  border-radius: 14px;
  padding: 14px 28px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  max-width: 800px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
  animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes slideUp {
  from { transform: translateY(50px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.warn-text {
  font-size: 13px;
  font-weight: 600;
  color: #e2e8f0;
}

.pill-role.is-overridden {
  border-color: rgba(217, 70, 239, 0.35);
  background: rgba(217, 70, 239, 0.04);
}
.override-badge {
  margin-left: auto;
  font-size: 13px;
  color: #d946ef;
  cursor: help;
}
</style>
