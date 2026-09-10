<template>
  <div class="cs-home-canvas">
    <!-- ════════ TOP COMMAND HEADER ════════ -->
    <header class="cs-top-bar">
      <div class="cs-title-group">
        <h1 class="cs-page-title">Các Kênh</h1>
      </div>

      <!-- Right controls: Search & Refresh -->
      <div class="cs-top-controls">
        <div class="cs-search-input-wrap">
          <v-icon size="16" class="cs-search-icon">mdi-magnify</v-icon>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Tìm theo tên Sales..."
            class="cs-search-input"
          />
          <button v-if="searchQuery" class="cs-search-clear" @click="searchQuery = ''">
            <v-icon size="14">mdi-close-circle</v-icon>
          </button>
        </div>

        <button
          class="cs-icon-btn cs-refresh-btn"
          :disabled="loading"
          title="Làm mới dữ liệu"
          @click="fetchHubData"
        >
          <v-icon size="18" :class="{ 'spin-anim': loading }">mdi-refresh</v-icon>
        </button>
      </div>
    </header>

    <!-- ════════ CUSTOM GROUPS TAB BAR (Replaces static filter pills) ════════ -->
    <div class="cs-filter-bar">
      <div class="cs-pills-group">
        <!-- 'Tất cả' Tab -->
        <button
          class="cs-filter-pill"
          :class="{ active: activeFilter === 'all' }"
          @click="activeFilter = 'all'"
        >
          <span>Tất cả</span>
          <span class="cs-pill-badge">{{ totalAllCount }}</span>
        </button>

        <!-- Custom User Group Tabs -->
        <div
          v-for="group in customGroups"
          :key="group.id"
          class="cs-group-pill-wrapper"
        >
          <button
            class="cs-filter-pill custom-group-pill"
            :class="{
              active: activeFilter === group.id,
              'is-drop-target': dragOverGroupId === group.id
            }"
            :title="`Kéo thẻ thả vào đây để thêm vào nhóm ${group.name}`"
            @click="activeFilter = group.id"
            @dragover.prevent="onDragOverGroup($event, group.id)"
            @dragleave="onDragLeaveGroup(group.id)"
            @drop="onDropIntoGroup($event, group)"
          >
            <span class="cs-group-tab-name">{{ group.name }}</span>
            <span class="cs-pill-badge">{{ getGroupCount(group) }}</span>

            <!-- Actions menu on tab: Rename / Delete -->
            <v-menu location="bottom end">
              <template #activator="{ props }">
                <span
                  v-bind="props"
                  class="cs-group-tab-more"
                  title="Tùy chọn nhóm"
                  @click.stop
                >
                  <v-icon size="13">mdi-dots-vertical</v-icon>
                </span>
              </template>
              <v-list density="compact" class="cs-tab-menu-list">
                <v-list-item @click="startRenameGroup(group)">
                  <template #prepend>
                    <v-icon size="15" class="mr-2">mdi-pencil-outline</v-icon>
                  </template>
                  <v-list-item-title>Đổi tên nhóm</v-list-item-title>
                </v-list-item>
                <v-list-item class="text-error" @click="deleteGroup(group)">
                  <template #prepend>
                    <v-icon size="15" color="error" class="mr-2">mdi-trash-can-outline</v-icon>
                  </template>
                  <v-list-item-title class="text-error">Xóa nhóm</v-list-item-title>
                </v-list-item>
              </v-list>
            </v-menu>
          </button>
        </div>

        <!-- Inline Add Group Input / Button -->
        <div v-if="isCreatingGroup" class="cs-add-group-form">
          <input
            ref="newGroupInputRef"
            v-model="newGroupName"
            type="text"
            placeholder="Tên nhóm mới..."
            class="cs-new-group-input"
            maxlength="30"
            @keyup.enter="confirmCreateGroup"
            @keyup.esc="cancelCreateGroup"
          />
          <button
            class="cs-group-confirm-btn"
            title="Lưu (Enter)"
            @click="confirmCreateGroup"
          >
            <v-icon size="14">mdi-check</v-icon>
          </button>
          <button
            class="cs-group-cancel-btn"
            title="Hủy (Esc)"
            @click="cancelCreateGroup"
          >
            <v-icon size="14">mdi-close</v-icon>
          </button>
        </div>

        <button
          v-else
          class="cs-filter-pill add-group-btn"
          title="Tạo nhóm mới để phân loại Sales"
          @click="startCreateGroup"
        >
          <v-icon size="14">mdi-plus</v-icon>
          <span>Thêm nhóm</span>
        </button>
      </div>
    </div>

    <!-- ════════ BENTO GRID (Actionable Deck) ════════ -->
    <div class="cs-grid-container">
      <!-- Loading state -->
      <div v-if="loading && salesList.length === 0" class="cs-loading-deck">
        <v-progress-circular indeterminate color="#0D9488" size="36" />
        <span>Đang nạp dữ liệu điều phối...</span>
      </div>

      <div v-else class="cs-bento-grid">
        <!-- ── LEAD HERO CARD: HỘP THƯ CỦA TÔI ── -->
        <div
          v-if="isOwnerCardVisible"
          class="cs-sales-card cs-lead-card"
          :class="{ 'is-dragging': draggedCardId === 'cskh_me' }"
          draggable="true"
          title="Bấm để vào Hộp thư cá nhân CSKH (Kéo thả lên Tab để thêm vào nhóm)"
          @dragstart="onDragStart($event, 'cskh_me', authStore.user?.fullName || 'Hộp thư của Tôi')"
          @dragend="onDragEnd"
          @click="handleLeadCardClick"
        >
          <div class="cs-card-header">
            <div class="cs-avatar-wrap">
              <img
                v-if="authStore.user?.avatarUrl"
                :src="authStore.user.avatarUrl"
                :alt="authStore.user.fullName"
                class="cs-avatar-img"
              />
              <div v-else class="cs-avatar-fallback teal-fallback">
                {{ authStore.user?.fullName?.charAt(0)?.toUpperCase() || 'CS' }}
              </div>
              <span class="cs-status-dot status-online" />
            </div>

            <div class="cs-user-meta">
              <div class="cs-name-row">
                <h2 class="cs-card-name" :title="authStore.user?.fullName || 'Khoa CSKH'">
                  {{ authStore.user?.fullName || 'Khoa CSKH' }}
                </h2>
                <span class="cs-owner-pill">Tôi</span>
              </div>
            </div>

            <!-- Quick Assign Menu Button -->
            <v-menu location="bottom end" :close-on-content-click="false">
              <template #activator="{ props }">
                <button
                  v-bind="props"
                  class="cs-card-menu-btn"
                  title="Gán vào nhóm"
                  @click.stop
                >
                  <v-icon size="16">mdi-folder-outline</v-icon>
                </button>
              </template>
              <div class="cs-card-assign-menu">
                <div class="cs-assign-menu-title">Gán vào nhóm</div>
                <div v-if="customGroups.length === 0" class="cs-assign-empty">
                  Chưa có nhóm nào. Hãy bấm "+ Thêm nhóm" ở thanh trên để tạo.
                </div>
                <label
                  v-for="grp in customGroups"
                  :key="grp.id"
                  class="cs-assign-option"
                >
                  <input
                    type="checkbox"
                    :checked="grp.assignedIds.includes('cskh_me')"
                    @change="toggleCardInGroup('cskh_me', grp, authStore.user?.fullName || 'Hộp thư của Tôi')"
                  />
                  <span>{{ grp.name }}</span>
                </label>
              </div>
            </v-menu>
          </div>

          <div class="cs-card-footer">
            <div v-if="cskhData.pendingMessages > 0" class="cs-urgent-badge">
              <v-icon size="13" class="mr-1">mdi-fire</v-icon>
              <span>{{ cskhData.pendingMessages }} tin chưa rep</span>
            </div>
            <button
              v-else-if="activeFilter !== 'all'"
              class="cs-btn-remove-from-group"
              title="Bỏ khỏi nhóm hiện tại"
              @click.stop="removeCardFromGroup('cskh_me', activeFilter, authStore.user?.fullName || 'Hộp thư của Tôi')"
            >
              <v-icon size="13" class="mr-1">mdi-minus-circle-outline</v-icon>
              <span>Bỏ khỏi nhóm</span>
            </button>
            <div v-else class="cs-empty-placeholder" />

            <div class="cs-action-hint">
              <span>Vào chat</span>
              <v-icon size="15" class="action-arrow">mdi-arrow-right</v-icon>
            </div>
          </div>
        </div>

        <!-- ── SALES CARDS (Full-card Clickable & Draggable) ── -->
        <div
          v-for="sales in filteredSalesList"
          :key="sales.salesUser.id"
          class="cs-sales-card"
          :class="{
            'is-urgent': sales.pendingMessages > 0,
            'is-offline': sales.status === 'offline',
            'is-dragging': draggedCardId === sales.salesUser.id
          }"
          draggable="true"
          :title="`Bấm để trực thay Sales ${sales.salesUser.fullName} (Kéo thả lên Tab để thêm vào nhóm)`"
          @dragstart="onDragStart($event, sales.salesUser.id, sales.salesUser.fullName)"
          @dragend="onDragEnd"
          @click="handleSalesCardClick(sales)"
        >
          <!-- Card Top: Avatar, Name & Quick Assign Menu -->
          <div class="cs-card-header">
            <div class="cs-avatar-wrap">
              <img
                v-if="sales.salesUser.avatarUrl"
                :src="sales.salesUser.avatarUrl"
                :alt="sales.salesUser.fullName"
                class="cs-avatar-img"
              />
              <div v-else class="cs-avatar-fallback">
                {{ sales.salesUser.fullName?.charAt(0)?.toUpperCase() || 'S' }}
              </div>
              <span
                class="cs-status-dot"
                :class="sales.status === 'online' ? 'status-online' : 'status-offline'"
              />
            </div>

            <div class="cs-user-meta">
              <h3 class="cs-card-name" :title="sales.salesUser.fullName">
                {{ sales.salesUser.fullName }}
              </h3>
            </div>

            <!-- Quick Assign Menu Button -->
            <v-menu location="bottom end" :close-on-content-click="false">
              <template #activator="{ props }">
                <button
                  v-bind="props"
                  class="cs-card-menu-btn"
                  title="Gán vào nhóm"
                  @click.stop
                >
                  <v-icon size="16">mdi-folder-outline</v-icon>
                </button>
              </template>
              <div class="cs-card-assign-menu">
                <div class="cs-assign-menu-title">Gán vào nhóm</div>
                <div v-if="customGroups.length === 0" class="cs-assign-empty">
                  Chưa có nhóm nào. Hãy bấm "+ Thêm nhóm" ở thanh trên để tạo.
                </div>
                <label
                  v-for="grp in customGroups"
                  :key="grp.id"
                  class="cs-assign-option"
                >
                  <input
                    type="checkbox"
                    :checked="grp.assignedIds.includes(sales.salesUser.id)"
                    @change="toggleCardInGroup(sales.salesUser.id, grp, sales.salesUser.fullName)"
                  />
                  <span>{{ grp.name }}</span>
                </label>
              </div>
            </v-menu>
          </div>

          <!-- Card Bottom: Urgent Badge (left) & Direct Action (right) -->
          <div class="cs-card-footer">
            <div v-if="sales.pendingMessages > 0" class="cs-urgent-badge">
              <v-icon size="13" class="mr-1">mdi-fire</v-icon>
              <span>{{ sales.pendingMessages }} tin chưa rep</span>
            </div>
            <button
              v-else-if="activeFilter !== 'all'"
              class="cs-btn-remove-from-group"
              title="Bỏ khỏi nhóm hiện tại"
              @click.stop="removeCardFromGroup(sales.salesUser.id, activeFilter, sales.salesUser.fullName)"
            >
              <v-icon size="13" class="mr-1">mdi-minus-circle-outline</v-icon>
              <span>Bỏ khỏi nhóm</span>
            </button>
            <div v-else class="cs-empty-placeholder" />

            <div class="cs-action-hint">
              <span>Vào chat</span>
              <v-icon size="15" class="action-arrow">mdi-arrow-right</v-icon>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div
        v-if="!loading && filteredSalesList.length === 0 && !isOwnerCardVisible"
        class="cs-empty-state"
      >
        <v-icon size="44" color="#94A3B8" class="mb-2">
          {{ activeFilter !== 'all' ? 'mdi-folder-open-outline' : 'mdi-account-search-outline' }}
        </v-icon>
        <div class="cs-empty-title">
          {{
            searchQuery
              ? 'Không tìm thấy Sales phù hợp'
              : activeFilter !== 'all'
              ? `Chưa có tài khoản nào trong nhóm "${activeGroupName}"`
              : 'Chưa có tài khoản nào được phân quyền'
          }}
        </div>
        <p class="cs-empty-desc">
          {{
            searchQuery
              ? 'Vui lòng kiểm tra lại từ khóa tìm kiếm.'
              : activeFilter !== 'all'
              ? 'Hãy kéo thẻ Sales và thả vào tab nhóm này, hoặc bấm icon thư mục trên thẻ để gán vào nhóm.'
              : 'Hiện tại bạn chưa được phân quyền phụ trách tài khoản Zalo nào.'
          }}
        </p>
        <button
          v-if="activeFilter !== 'all' || searchQuery"
          class="cs-btn-reset-filter"
          @click="activeFilter = 'all'; searchQuery = ''"
        >
          Xem tất cả ({{ totalAllCount }})
        </button>
      </div>
    </div>

    <!-- ════════ DIALOG ĐỔI TÊN NHÓM ════════ -->
    <v-dialog v-model="renameDialogVisible" max-width="380">
      <div class="cs-dialog-card">
        <div class="cs-dialog-title">Đổi tên nhóm</div>
        <input
          v-model="renamingGroupName"
          type="text"
          placeholder="Nhập tên mới..."
          class="cs-dialog-input"
          maxlength="30"
          @keyup.enter="confirmRenameGroup"
        />
        <div class="cs-dialog-actions">
          <button class="cs-dialog-btn cancel" @click="renameDialogVisible = false">
            Hủy
          </button>
          <button
            class="cs-dialog-btn confirm"
            :disabled="!renamingGroupName.trim()"
            @click="confirmRenameGroup"
          >
            Lưu
          </button>
        </div>
      </div>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onActivated, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/api/index';
import { useToast } from '@/composables/use-toast';
import { useCsWorkspaceStore, type DelegatedSalesTarget } from '@/stores/use-cs-workspace';
import { useAuthStore } from '@/stores/auth';

export interface CustomGroup {
  id: string;
  name: string;
  assignedIds: string[]; // Sales user IDs or 'cskh_me'
}

interface SalesCardData {
  salesUser: {
    id: string;
    fullName: string;
    avatarUrl: string | null;
    email: string;
  };
  zaloAccounts: Array<{
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
    isOnline: boolean;
  }>;
  totalGroups: number;
  pendingMessages: number;
  unreadMessages: number;
  status: 'online' | 'offline';
}

interface CskhOwnData {
  totalAccounts: number;
  zaloAccounts: Array<{
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
    status: string;
    isOnline: boolean;
  }>;
  totalGroups: number;
  pendingMessages: number;
  unreadMessages: number;
}

const router = useRouter();
const toast = useToast();
const csWorkspace = useCsWorkspaceStore();
const authStore = useAuthStore();

const loading = ref(false);
const searchQuery = ref('');

// ── CUSTOM GROUPS & FILTERS ──
const customGroups = ref<CustomGroup[]>([]);
const activeFilter = ref<string>('all'); // 'all' or group.id

// Inline create group state
const isCreatingGroup = ref(false);
const newGroupName = ref('');
const newGroupInputRef = ref<HTMLInputElement | null>(null);

// Rename dialog state
const renameDialogVisible = ref(false);
const renamingGroupId = ref('');
const renamingGroupName = ref('');

// Drag & drop state
const draggedCardId = ref<string | null>(null);
const draggedCardName = ref('');
const dragOverGroupId = ref<string | null>(null);
let isDraggingCard = false;

const cskhData = ref<CskhOwnData>({
  totalAccounts: 0,
  zaloAccounts: [],
  totalGroups: 0,
  pendingMessages: 0,
  unreadMessages: 0,
});

const salesList = ref<SalesCardData[]>([]);

// ── LOCAL STORAGE PERSISTENCE ──
const storageKey = computed(() => `cs_custom_groups_${authStore.user?.id || 'default'}`);

function loadCustomGroups() {
  try {
    const raw = localStorage.getItem(storageKey.value);
    if (raw) {
      customGroups.value = JSON.parse(raw);
    } else {
      customGroups.value = [];
    }
  } catch (e) {
    console.error('Failed to load custom groups from localStorage', e);
    customGroups.value = [];
  }
}

function saveCustomGroups() {
  try {
    localStorage.setItem(storageKey.value, JSON.stringify(customGroups.value));
  } catch (e) {
    console.error('Failed to save custom groups to localStorage', e);
  }
}

// ── TOTALS & COUNTS ──
const totalAllCount = computed(() => salesList.value.length + 1);

function getGroupCount(group: CustomGroup): number {
  let count = 0;
  if (group.assignedIds.includes('cskh_me')) count++;
  count += salesList.value.filter((s) => group.assignedIds.includes(s.salesUser.id)).length;
  return count;
}

const activeGroupName = computed(() => {
  if (activeFilter.value === 'all') return 'Tất cả';
  const grp = customGroups.value.find((g) => g.id === activeFilter.value);
  return grp ? grp.name : '';
});

// Owner card visibility: Shown in 'all' OR when assigned to the active custom group
const isOwnerCardVisible = computed(() => {
  if (searchQuery.value) return false;
  if (activeFilter.value === 'all') return true;
  const currentGroup = customGroups.value.find((g) => g.id === activeFilter.value);
  return currentGroup ? currentGroup.assignedIds.includes('cskh_me') : false;
});

// Lọc kết hợp Search + Group Tab, ưu tiên khẩn cấp lên đầu
const filteredSalesList = computed(() => {
  let list = salesList.value;

  if (activeFilter.value !== 'all') {
    const currentGroup = customGroups.value.find((g) => g.id === activeFilter.value);
    if (currentGroup) {
      list = list.filter((s) => currentGroup.assignedIds.includes(s.salesUser.id));
    } else {
      list = [];
    }
  }

  const q = searchQuery.value.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (s) =>
        s.salesUser.fullName.toLowerCase().includes(q) ||
        s.zaloAccounts.some((a) => (a.displayName || '').toLowerCase().includes(q)),
    );
  }

  // Sắp xếp: Sales có tin chờ rep lên đầu (nhiều hơn lên trước), sau đó đến Online, sau đó theo tên
  return [...list].sort((a, b) => {
    if (b.pendingMessages !== a.pendingMessages) {
      return b.pendingMessages - a.pendingMessages;
    }
    if (a.status !== b.status) {
      return a.status === 'online' ? -1 : 1;
    }
    return a.salesUser.fullName.localeCompare(b.salesUser.fullName);
  });
});

// ── GROUP MANAGEMENT ACTIONS ──
function startCreateGroup() {
  isCreatingGroup.value = true;
  newGroupName.value = '';
  void nextTick(() => {
    newGroupInputRef.value?.focus();
  });
}

function confirmCreateGroup() {
  const name = newGroupName.value.trim();
  if (!name) return;

  const newGroup: CustomGroup = {
    id: `grp_${Date.now()}`,
    name,
    assignedIds: [],
  };

  customGroups.value.push(newGroup);
  saveCustomGroups();
  activeFilter.value = newGroup.id;
  isCreatingGroup.value = false;
  newGroupName.value = '';
  toast.success(`Đã tạo nhóm "${name}"`);
}

function cancelCreateGroup() {
  isCreatingGroup.value = false;
  newGroupName.value = '';
}

function startRenameGroup(group: CustomGroup) {
  renamingGroupId.value = group.id;
  renamingGroupName.value = group.name;
  renameDialogVisible.value = true;
}

function confirmRenameGroup() {
  const name = renamingGroupName.value.trim();
  if (!name || !renamingGroupId.value) return;

  const grp = customGroups.value.find((g) => g.id === renamingGroupId.value);
  if (grp) {
    grp.name = name;
    saveCustomGroups();
    toast.success(`Đã đổi tên nhóm thành "${name}"`);
  }
  renameDialogVisible.value = false;
}

function deleteGroup(group: CustomGroup) {
  if (
    !confirm(
      `Bạn có chắc muốn xóa nhóm "${group.name}"?\n(Các tài khoản trong nhóm vẫn được giữ nguyên ở tab "Tất cả").`,
    )
  ) {
    return;
  }
  const name = group.name;
  customGroups.value = customGroups.value.filter((g) => g.id !== group.id);
  if (activeFilter.value === group.id) {
    activeFilter.value = 'all';
  }
  saveCustomGroups();
  toast.info(`Đã xóa nhóm "${name}"`);
}

function toggleCardInGroup(cardId: string, group: CustomGroup, cardName?: string) {
  const idx = group.assignedIds.indexOf(cardId);
  if (idx >= 0) {
    group.assignedIds.splice(idx, 1);
    toast.info(`Đã gỡ "${cardName || 'Tài khoản'}" khỏi nhóm "${group.name}"`);
  } else {
    group.assignedIds.push(cardId);
    toast.success(`Đã thêm "${cardName || 'Tài khoản'}" vào nhóm "${group.name}"`);
  }
  saveCustomGroups();
}

function removeCardFromGroup(cardId: string, groupId: string, cardName?: string) {
  const grp = customGroups.value.find((g) => g.id === groupId);
  if (!grp) return;
  const idx = grp.assignedIds.indexOf(cardId);
  if (idx >= 0) {
    grp.assignedIds.splice(idx, 1);
    saveCustomGroups();
    toast.info(`Đã gỡ "${cardName || 'Tài khoản'}" khỏi nhóm "${grp.name}"`);
  }
}

function assignCardToGroup(cardId: string, groupId: string, cardName?: string) {
  const grp = customGroups.value.find((g) => g.id === groupId);
  if (!grp) return;
  if (grp.assignedIds.includes(cardId)) {
    toast.info(`"${cardName || 'Tài khoản'}" đã có trong nhóm "${grp.name}"`);
    return;
  }
  grp.assignedIds.push(cardId);
  saveCustomGroups();
  toast.success(`Đã thêm "${cardName || 'Tài khoản'}" vào nhóm "${grp.name}"`);
}

// ── DRAG & DROP HANDLERS ──
function onDragStart(e: DragEvent, id: string, name: string) {
  isDraggingCard = true;
  draggedCardId.value = id;
  draggedCardName.value = name;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'copyMove';
    e.dataTransfer.setData('text/plain', id);
  }
}

function onDragEnd() {
  setTimeout(() => {
    isDraggingCard = false;
  }, 120);
  draggedCardId.value = null;
  draggedCardName.value = '';
  dragOverGroupId.value = null;
}

function onDragOverGroup(e: DragEvent, groupId: string) {
  e.preventDefault();
  dragOverGroupId.value = groupId;
}

function onDragLeaveGroup(groupId: string) {
  if (dragOverGroupId.value === groupId) {
    dragOverGroupId.value = null;
  }
}

function onDropIntoGroup(e: DragEvent, group: CustomGroup) {
  e.preventDefault();
  dragOverGroupId.value = null;
  const cardId = draggedCardId.value || e.dataTransfer?.getData('text/plain');
  if (!cardId) return;
  assignCardToGroup(cardId, group.id, draggedCardName.value);
}

function handleLeadCardClick() {
  if (isDraggingCard) return;
  void enterCskhWorkspace();
}

function handleSalesCardClick(sales: SalesCardData) {
  if (isDraggingCard) return;
  startSupportingSales(sales);
}

// ── DATA FETCHING & ROUTING ──
async function fetchHubData() {
  loading.value = true;
  try {
    const res = await api.get<{ cskh: CskhOwnData; sales: SalesCardData[] }>(
      '/cs/delegated-sales',
    );
    if (res.data) {
      cskhData.value = res.data.cskh || {
        totalAccounts: 0,
        zaloAccounts: [],
        totalGroups: 0,
        pendingMessages: 0,
        unreadMessages: 0,
      };
      salesList.value = res.data.sales || [];
    }
  } catch (err: any) {
    console.error('Fetch CS Hub data failed:', err);
    toast.error('Không tải được dữ liệu điều phối CSKH');
  } finally {
    loading.value = false;
  }
}

async function enterCskhWorkspace() {
  let ownIds = cskhData.value.zaloAccounts.map((a) => a.id);
  if (ownIds.length === 0) {
    try {
      const res = await api.get('/zalo-accounts');
      const accs = res.data?.accounts || res.data || [];
      const myId = authStore.user?.id;
      ownIds = accs.filter((a: any) => a.ownerUserId === myId || a.isOwnedByMe).map((a: any) => a.id);
    } catch {}
  }
  csWorkspace.clearSalesTarget(ownIds);
  router.push('/cs-chat');
}

function startSupportingSales(sales: SalesCardData) {
  const target: DelegatedSalesTarget = {
    id: sales.salesUser.id,
    fullName: sales.salesUser.fullName,
    avatarUrl: sales.salesUser.avatarUrl,
    zaloAccounts: sales.zaloAccounts.map((a) => ({
      id: a.id,
      displayName: a.displayName || undefined,
      avatarUrl: a.avatarUrl,
      isOnline: a.isOnline,
    })),
  };

  csWorkspace.setSalesTarget(target);
  toast.success(`Đã chuyển sang chế độ hỗ trợ Sales ${sales.salesUser.fullName}`);
  router.push('/cs-chat');
}

function resetHomeDelegatedState() {
  const ownIds = cskhData.value.zaloAccounts.map((a) => a.id);
  csWorkspace.clearSalesTarget(ownIds);
}

onMounted(() => {
  loadCustomGroups();
  void fetchHubData();
  resetHomeDelegatedState();
});

onActivated(() => {
  loadCustomGroups();
  void fetchHubData();
  resetHomeDelegatedState();
});
</script>

<style scoped>
/* ══════════════════════════════════════════════════════════
   CSKH Home View — Neo-SaaS Bento Command Center
   Aesthetics: Clean Slate, Linear.app minimalism, Anti-slop
   ══════════════════════════════════════════════════════════ */
.cs-home-canvas {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  padding: 24px 32px;
  overflow-y: auto;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.65);
  border-radius: 24px;
  box-shadow: 0 4px 20px 0 rgba(31, 38, 135, 0.06);
  font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #0F172A;
}

/* ── TOP BAR ────────────────────────────────────────────── */
.cs-top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.cs-title-group {
  display: flex;
  align-items: center;
}

.cs-page-title {
  margin: 0;
  font-size: 24px;
  font-weight: 800;
  color: #0F172A;
  letter-spacing: -0.025em;
  line-height: 1.2;
}

.cs-top-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.cs-search-input-wrap {
  position: relative;
  width: 240px;
}

.cs-search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #94A3B8;
  pointer-events: none;
}

.cs-search-input {
  width: 100%;
  height: 38px;
  padding: 0 32px 0 36px;
  background: #FFFFFF;
  border: 1px solid #CBD5E1;
  border-radius: 12px;
  font-size: 13px;
  color: #0F172A;
  outline: none;
  font-family: inherit;
  transition: all 0.2s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
}

.cs-search-input:focus {
  border-color: #0D9488;
  box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.12);
}

.cs-search-clear {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: #94A3B8;
  cursor: pointer;
  padding: 2px;
  display: flex;
}

.cs-icon-btn {
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #FFFFFF;
  border: 1px solid #CBD5E1;
  border-radius: 12px;
  color: #475569;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
}

.cs-icon-btn:hover {
  background: #F1F5F9;
  color: #0F172A;
  border-color: #94A3B8;
}

.spin-anim {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ── CUSTOM GROUPS TAB BAR ────────────────────────────── */
.cs-filter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 22px;
  flex-wrap: wrap;
  gap: 12px;
}

.cs-pills-group {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.cs-group-pill-wrapper {
  display: inline-flex;
  align-items: center;
}

.cs-filter-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 14px;
  background: #FFFFFF;
  border: 1px solid #E2E8F0;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  color: #475569;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
  user-select: none;
}

.cs-filter-pill:hover {
  background: #F1F5F9;
  border-color: #CBD5E1;
  color: #0F172A;
}

.cs-filter-pill.active {
  background: #0F172A;
  border-color: #0F172A;
  color: #FFFFFF;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.18);
}

.cs-pill-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 1px 7px;
  background: #F1F5F9;
  color: #475569;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}

.cs-filter-pill.active .cs-pill-badge {
  background: rgba(255, 255, 255, 0.2);
  color: #FFFFFF;
}

/* Custom Group Tab styles */
.custom-group-pill {
  position: relative;
  padding-right: 6px;
}

.cs-group-tab-name {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cs-group-tab-more {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin-left: 2px;
  border-radius: 50%;
  color: #94A3B8;
  transition: all 0.15s ease;
}

.cs-group-tab-more:hover {
  background: rgba(0, 0, 0, 0.08);
  color: #0F172A;
}

.custom-group-pill.active .cs-group-tab-more {
  color: rgba(255, 255, 255, 0.7);
}

.custom-group-pill.active .cs-group-tab-more:hover {
  background: rgba(255, 255, 255, 0.2);
  color: #FFFFFF;
}

/* Drag Over Highlight Target */
.custom-group-pill.is-drop-target {
  border: 2px dashed #0D9488 !important;
  background: #F0FDFA !important;
  color: #0F766E !important;
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(13, 148, 136, 0.25) !important;
}

/* Add Group Form & Button */
.add-group-btn {
  border-style: dashed;
  border-color: #94A3B8;
  color: #475569;
}

.add-group-btn:hover {
  border-color: #0D9488;
  color: #0D9488;
  background: #F0FDFA;
}

.cs-add-group-form {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #FFFFFF;
  border: 1.5px solid #0D9488;
  border-radius: 999px;
  padding: 2px 4px 2px 12px;
  box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.12);
}

.cs-new-group-input {
  width: 140px;
  height: 28px;
  border: none;
  outline: none;
  font-size: 13px;
  font-weight: 600;
  color: #0F172A;
  background: transparent;
  font-family: inherit;
}

.cs-group-confirm-btn,
.cs-group-cancel-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
}

.cs-group-confirm-btn {
  background: #0D9488;
  color: #FFFFFF;
}

.cs-group-confirm-btn:hover {
  background: #0F766E;
}

.cs-group-cancel-btn {
  background: #F1F5F9;
  color: #64748B;
}

.cs-group-cancel-btn:hover {
  background: #E2E8F0;
  color: #0F172A;
}

.cs-tab-menu-list {
  border-radius: 12px !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12) !important;
  border: 1px solid #E2E8F0 !important;
}


/* ── BENTO GRID CONTAINER ──────────────────────────────── */
.cs-grid-container {
  flex: 1;
}

.cs-bento-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(310px, 1fr));
  gap: 16px;
}

/* ── CARD ANATOMY ──────────────────────────────────────── */
.cs-sales-card,
.cs-lead-card {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 18px 20px;
  background: #FFFFFF;
  border: 1px solid #E2E8F0;
  border-radius: 18px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02), 0 4px 12px rgba(0, 0, 0, 0.02);
  cursor: pointer;
  transition: all 0.22s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
}

.cs-sales-card:hover,
.cs-lead-card:hover {
  transform: translateY(-2px);
  border-color: #CBD5E1;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.06);
}

.cs-sales-card:active,
.cs-lead-card:active {
  transform: translateY(0);
}

/* ── LEAD HERO CARD STYLING ── */
.cs-lead-card {
  background: linear-gradient(145deg, #FFFFFF 0%, #F0FDFA 100%);
  border: 1.5px solid #99F6E4;
  box-shadow: 0 2px 10px rgba(13, 148, 136, 0.05);
}

.cs-lead-card:hover {
  border-color: #5EEAD4;
  box-shadow: 0 8px 24px rgba(13, 148, 136, 0.12);
}

/* ── SALES CARD STYLING ── */
.cs-sales-card.is-urgent {
  background: linear-gradient(180deg, #FFFFFF 0%, #FFFDF7 100%);
  border: 1.5px solid #FCD34D;
  box-shadow: 0 2px 10px rgba(245, 158, 11, 0.06);
}

.cs-sales-card.is-urgent:hover {
  border-color: #F59E0B;
  box-shadow: 0 8px 24px rgba(245, 158, 11, 0.14);
}

.cs-sales-card.is-offline {
  opacity: 0.85;
}

.cs-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.cs-avatar-wrap {
  position: relative;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
}

.cs-avatar-img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
}

.cs-avatar-fallback {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: linear-gradient(135deg, #0D9488 0%, #0284C7 100%);
  color: #FFFFFF;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 16px;
}

.cs-avatar-fallback.teal-fallback {
  background: linear-gradient(135deg, #0F766E 0%, #0D9488 100%);
}

.cs-status-dot {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  border: 2px solid #FFFFFF;
}

.status-online { background-color: #10B981; }
.status-offline { background-color: #94A3B8; }

.cs-user-meta {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.cs-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.cs-card-name {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #0F172A;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: -0.01em;
}

.cs-owner-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  background: rgba(13, 148, 136, 0.12);
  border: 1px solid rgba(13, 148, 136, 0.25);
  color: #0F766E;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
  flex-shrink: 0;
}

/* Urgent Badge */
.cs-urgent-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  background: #FEF3C7;
  border: 1px solid #FDE68A;
  color: #B45309;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
}

/* Card Footer: Action */
.cs-card-footer {
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px solid rgba(226, 232, 240, 0.6);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.cs-empty-placeholder {
  flex: 1;
}

.cs-action-hint {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 700;
  color: #0D9488;
  flex-shrink: 0;
}

.action-arrow {
  transition: transform 0.2s ease;
}

.cs-sales-card:hover .action-arrow {
  transform: translateX(3px);
}

.cs-sales-card.is-urgent .cs-action-hint {
  color: #D97706;
}

/* ── EMPTY & LOADING STATES ────────────────────────────── */
.cs-loading-deck {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 0;
  gap: 12px;
  color: #64748B;
  font-size: 14px;
}

.cs-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 48px 24px;
  background: #FFFFFF;
  border: 1px dashed #CBD5E1;
  border-radius: 20px;
  margin-top: 8px;
}

.cs-empty-title {
  font-size: 15px;
  font-weight: 700;
  color: #334155;
  margin-bottom: 4px;
}

.cs-empty-desc {
  margin: 0 0 16px;
  max-width: 440px;
  font-size: 13px;
  color: #64748B;
  line-height: 1.5;
}

.cs-btn-reset-filter {
  padding: 7px 16px;
  background: #F1F5F9;
  border: 1px solid #CBD5E1;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  color: #334155;
  cursor: pointer;
  transition: all 0.2s ease;
}

.cs-btn-reset-filter:hover {
  background: #E2E8F0;
  color: #0F172A;
}

/* ── CARD MENU & ASSIGN STYLES ────────────────────────── */
.cs-card-menu-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid #E2E8F0;
  background: #F8FAFC;
  color: #64748B;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-left: auto;
  flex-shrink: 0;
}

.cs-card-menu-btn:hover {
  background: #F0FDFA;
  border-color: #99F6E4;
  color: #0D9488;
}

.cs-card-assign-menu {
  min-width: 210px;
  max-height: 260px;
  overflow-y: auto;
  background: #FFFFFF;
  border-radius: 14px;
  border: 1px solid #E2E8F0;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
  padding: 10px 12px;
}

.cs-assign-menu-title {
  font-size: 11px;
  font-weight: 700;
  color: #64748B;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid #F1F5F9;
}

.cs-assign-empty {
  font-size: 12px;
  color: #94A3B8;
  line-height: 1.4;
  padding: 4px 0;
}

.cs-assign-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #1E293B;
  cursor: pointer;
  transition: background 0.15s ease;
  user-select: none;
}

.cs-assign-option:hover {
  background: #F1F5F9;
}

.cs-assign-option input[type='checkbox'] {
  accent-color: #0D9488;
  width: 15px;
  height: 15px;
  cursor: pointer;
}

/* Button Remove From Group */
.cs-btn-remove-from-group {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  background: #FEF2F2;
  border: 1px solid #FECACA;
  border-radius: 6px;
  color: #DC2626;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.cs-btn-remove-from-group:hover {
  background: #FEE2E2;
  border-color: #F87171;
  color: #B91C1C;
}

/* Card Dragging State */
.cs-sales-card.is-dragging,
.cs-lead-card.is-dragging {
  opacity: 0.45;
  border: 2px dashed #0D9488 !important;
  transform: scale(0.98);
}

/* Dialog Rename Group */
.cs-dialog-card {
  padding: 22px 24px;
  background: #FFFFFF;
  border-radius: 20px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
}

.cs-dialog-title {
  font-size: 16px;
  font-weight: 700;
  color: #0F172A;
  margin-bottom: 14px;
}

.cs-dialog-input {
  width: 100%;
  height: 40px;
  padding: 0 14px;
  border: 1px solid #CBD5E1;
  border-radius: 10px;
  font-size: 14px;
  color: #0F172A;
  outline: none;
  box-sizing: border-box;
  font-family: inherit;
  transition: all 0.2s ease;
}

.cs-dialog-input:focus {
  border-color: #0D9488;
  box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.12);
}

.cs-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}

.cs-dialog-btn {
  height: 36px;
  padding: 0 16px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.cs-dialog-btn.cancel {
  background: #F1F5F9;
  border: 1px solid #CBD5E1;
  color: #475569;
}

.cs-dialog-btn.cancel:hover {
  background: #E2E8F0;
  color: #0F172A;
}

.cs-dialog-btn.confirm {
  background: #0D9488;
  border: none;
  color: #FFFFFF;
}

.cs-dialog-btn.confirm:hover {
  background: #0F766E;
}

.cs-dialog-btn.confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ── RESPONSIVE ───────────────────────────────────────── */
@media (max-width: 768px) {
  .cs-home-canvas {
    padding: 16px;
  }
  .cs-top-bar {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
  .cs-top-controls {
    width: 100%;
  }
  .cs-search-input-wrap {
    flex: 1;
    width: auto;
  }
  .cs-filter-bar {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
