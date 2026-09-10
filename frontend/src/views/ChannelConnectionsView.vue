<template>
  <div class="cs-home-canvas">
    <!-- ════════ TOP COMMAND HEADER ════════ -->
    <header class="cs-top-bar">
      <div class="cs-title-group">
        <div class="cs-title-lead">
          <h1 class="cs-page-title nowrap">Kênh & Tin nhắn</h1>
          <div class="cs-page-sub">
            <span class="sub-stat"><b>{{ totalChannelsCount }}</b> kênh</span>
            <span class="sub-sep">·</span>
            <span class="sub-stat text-success">{{ connectedChannelsCount }} kết nối</span>
            <span v-if="errorChannelsCount > 0" class="sub-stat text-warn">· {{ errorChannelsCount }} lỗi</span>
            <span class="sub-sep">·</span>
            <span class="sub-time">cập nhật {{ lastRefreshLabel }}</span>
          </div>
        </div>
      </div>

      <!-- Center / Right controls -->
      <div class="cs-top-controls">
        <!-- Search input -->
        <div class="cs-search-input-wrap">
          <v-icon size="16" class="cs-search-icon">mdi-magnify</v-icon>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Tìm tên nick, SĐT, Sales..."
            class="cs-search-input"
          />
          <button v-if="searchQuery" class="cs-search-clear" @click="searchQuery = ''">
            <v-icon size="14">mdi-close-circle</v-icon>
          </button>
        </div>

        <!-- Add Channel CTA Button -->
        <button
          class="cs-btn-add-channel nowrap"
          title="Quét mã QR kết nối thêm tài khoản Zalo mới"
          @click="showAddDialog = true"
        >
          <v-icon size="16" class="mr-1">mdi-plus-circle-outline</v-icon>
          <span>Thêm Kênh</span>
        </button>

        <!-- Refresh Button -->
        <button
          class="cs-icon-btn cs-refresh-btn"
          :disabled="loadingAll"
          title="Làm mới dữ liệu"
          @click="refreshData"
        >
          <v-icon size="18" :class="{ 'spin-anim': loadingAll }">mdi-refresh</v-icon>
        </button>
      </div>
    </header>

    <!-- ════════ CUSTOM GROUPS TAB BAR (Drag & Drop) ════════ -->
    <div class="cs-filter-bar">
      <div class="cs-pills-group">
        <!-- 'Tất cả' Tab -->
        <button
          class="cs-filter-pill"
          :class="{ active: activeFilter === 'all' }"
          @click="activeFilter = 'all'"
        >
          <span class="nowrap">Tất cả</span>
          <span class="cs-pill-badge">{{ totalActiveDeckCount }}</span>
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
            :title="`Kéo thả thẻ vào đây để thêm vào nhóm ${group.name}`"
            @click="activeFilter = group.id"
            @dragover.prevent="onDragOverGroup($event, group.id)"
            @dragleave="onDragLeaveGroup(group.id)"
            @drop="onDropIntoGroup($event, group)"
          >
            <span class="cs-group-tab-name">{{ group.name }}</span>
            <span class="cs-pill-badge">{{ getGroupCount(group) }}</span>

            <!-- Actions menu on tab: Rename / Delete -->
            <v-menu location="bottom end">
              <template #activator="{ props: menuProps }">
                <span
                  v-bind="menuProps"
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
          title="Tạo nhóm mới để gom phân loại Kênh / Sales"
          @click="startCreateGroup"
        >
          <v-icon size="14">mdi-plus</v-icon>
          <span class="nowrap">Thêm nhóm</span>
        </button>
      </div>
    </div>

    <!-- ════════ BENTO GRID (Actionable Deck) ════════ -->
    <div class="cs-grid-container">
      <!-- Loading state -->
      <div v-if="loadingAll && totalActiveDeckCount === 0" class="cs-loading-deck">
        <v-progress-circular indeterminate color="#0D9488" size="36" />
        <span>Đang nạp dữ liệu Kênh & Tin nhắn...</span>
      </div>

      <!-- ── MODE 1: XEM THEO KÊNH (NICK ZALO) ── -->
      <div v-else-if="viewMode === 'channels'" class="cs-bento-grid">
        <div
          v-for="ch in filteredChannelList"
          :key="ch.id"
          class="cs-sales-card cs-channel-card"
          :class="{
            'is-urgent': getChannelPendingCount(ch.id) > 0,
            'is-offline': ch.liveStatus === 'disconnected' || ch.status === 'disconnected',
            'is-error': ch.status === 'token_error',
            'is-dragging': draggedCardId === ch.id
          }"
          draggable="true"
          :title="`Bấm để xem tin nhắn kênh ${ch.displayName || ch.phone} (Kéo thả lên Tab để thêm vào nhóm)`"
          @dragstart="onDragStart($event, ch.id, ch.displayName || ch.phone || 'Kênh Zalo')"
          @dragend="onDragEnd"
          @click="enterChatWithChannel(ch)"
        >
          <!-- Card Top: Avatar, Name & Quick Assign Menu -->
          <div class="cs-card-header">
            <div class="cs-avatar-wrap">
              <img
                v-if="ch.avatarUrl"
                :src="ch.avatarUrl"
                :alt="ch.displayName || 'Zalo'"
                class="cs-avatar-img"
                @error="(e: Event) => (e.target as HTMLImageElement).style.display = 'none'"
              />
              <div
                v-else
                class="cs-avatar-fallback"
                :style="{ background: pickColor(ch.id) }"
              >
                {{ (ch.displayName || 'Z').charAt(0).toUpperCase() }}
              </div>
            </div>

            <div class="cs-user-meta">
              <div class="cs-name-row">
                <h3 class="cs-card-name" :title="ch.displayName || ch.phone || 'Tài khoản Zalo'">
                  {{ ch.displayName || ch.phone || 'Tài khoản Zalo' }}
                </h3>
                <span class="cs-platform-chip">Zalo</span>
              </div>
              <div class="cs-card-subinfo">
                <span class="cs-subinfo-phone">{{ ch.phone || ch.zaloUid || 'ID: ' + ch.id.slice(0, 8) }}</span>
                <span v-if="ch.owner?.fullName" class="cs-owner-badge" :title="`Phụ trách: ${ch.owner.fullName}`">
                  <v-icon size="11" class="mr-0.5">mdi-account</v-icon>
                  {{ ch.owner.fullName }}
                </span>
              </div>
            </div>

            <!-- Header Actions: Quick Assign & 3-dots Menu -->
            <div class="cs-card-header-actions">
              <!-- Quick Assign Menu Button -->
              <v-menu location="bottom end" :close-on-content-click="false">
                <template #activator="{ props: assignProps }">
                  <button
                    v-bind="assignProps"
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
                    @click.stop
                  >
                    <input
                      type="checkbox"
                      :checked="grp.assignedIds.includes(ch.id)"
                      class="cs-assign-checkbox"
                      @change="toggleCardInGroup(ch.id, grp, ch.displayName || ch.phone || 'Kênh Zalo')"
                    />
                    <span class="cs-assign-opt-name">{{ grp.name }}</span>
                    <span class="cs-assign-opt-count">({{ getGroupCount(grp) }})</span>
                  </label>
                </div>
              </v-menu>

              <!-- 3-dots Menu Button -->
              <v-menu location="bottom end">
                <template #activator="{ props: moreProps }">
                  <button
                    v-bind="moreProps"
                    class="cs-card-menu-btn"
                    title="Tùy chọn kênh"
                    @click.stop
                  >
                    <v-icon size="16">mdi-dots-horizontal</v-icon>
                  </button>
                </template>
                <v-list density="compact" min-width="210" class="cs-tab-menu-list">
                  <v-list-item @click="openAccessDialog(ch)">
                    <template #prepend>
                      <v-icon size="16" class="mr-2">mdi-account-multiple-check-outline</v-icon>
                    </template>
                    <v-list-item-title>Phân quyền trực thay</v-list-item-title>
                  </v-list-item>
                  <v-list-item @click="reconnectChannel(ch)">
                    <template #prepend>
                      <v-icon size="16" class="mr-2">mdi-refresh</v-icon>
                    </template>
                    <v-list-item-title>Làm mới kết nối / Quét QR</v-list-item-title>
                  </v-list-item>
                  <v-divider />
                  <v-list-item class="text-error" @click="removeChannel(ch)">
                    <template #prepend>
                      <v-icon size="16" color="error" class="mr-2">mdi-delete-outline</v-icon>
                    </template>
                    <v-list-item-title class="text-error">Gỡ kênh</v-list-item-title>
                  </v-list-item>
                </v-list>
              </v-menu>
            </div>
          </div>

          <!-- Card Middle: Connection Status Indicator -->
          <div class="cs-card-channel-meta">
            <div class="cs-status-indicator" :class="statusClass(ch.liveStatus)">
              <span class="indicator-dot" />
              <span>{{ statusLabel(ch.liveStatus, ch.status) }}</span>
            </div>

            <!-- Reconnect Quick Button if disconnected -->
            <button
              v-if="ch.liveStatus === 'disconnected' || ch.status === 'token_error'"
              class="cs-btn-reconnect nowrap"
              title="Quét lại mã QR để làm mới kết nối"
              @click.stop="reconnectChannel(ch)"
            >
              <v-icon size="13" class="mr-1">mdi-qrcode-scan</v-icon>
              <span>Quét QR</span>
            </button>
          </div>

          <!-- Card Footer: Urgent Fire Badge & Vào chat Action -->
          <div class="cs-card-footer">
            <div v-if="getChannelPendingCount(ch.id) > 0" class="cs-urgent-badge">
              <v-icon size="13" class="mr-1">mdi-fire</v-icon>
              <span>{{ getChannelPendingCount(ch.id) }} tin chưa rep</span>
            </div>
            <button
              v-else-if="activeFilter !== 'all'"
              class="cs-btn-remove-from-group"
              title="Bỏ khỏi nhóm hiện tại"
              @click.stop="removeCardFromGroup(ch.id, activeFilter, ch.displayName || 'Kênh')"
            >
              <v-icon size="13" class="mr-1">mdi-minus-circle-outline</v-icon>
              <span>Bỏ khỏi nhóm</span>
            </button>
            <div v-else class="cs-empty-placeholder" />

            <div class="cs-action-hint">
              <span class="nowrap">Vào chat</span>
              <v-icon size="15" class="action-arrow">mdi-arrow-right</v-icon>
            </div>
          </div>
        </div>
      </div>

      <!-- ── MODE 2: XEM THEO SALES ── -->
      <div v-else class="cs-bento-grid">
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
          :title="`Bấm để xem tin nhắn của Sales ${sales.salesUser.fullName} (Kéo thả lên Tab để thêm vào nhóm)`"
          @dragstart="onDragStart($event, sales.salesUser.id, sales.salesUser.fullName)"
          @dragend="onDragEnd"
          @click="enterChatWithSales(sales)"
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
            </div>

            <div class="cs-user-meta">
              <h3 class="cs-card-name" :title="sales.salesUser.fullName">
                {{ sales.salesUser.fullName }}
              </h3>
              <div class="cs-card-subinfo">
                <span>{{ sales.zaloAccounts.length }} kênh Zalo</span>
                <span v-if="sales.totalGroups > 0">· {{ sales.totalGroups }} nhóm chat</span>
              </div>
            </div>

            <!-- Quick Assign Menu Button -->
            <v-menu location="bottom end" :close-on-content-click="false">
              <template #activator="{ props: assignProps }">
                <button
                  v-bind="assignProps"
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

          <!-- Card Middle: Nick badges -->
          <div class="cs-sales-accounts-dock">
            <span
              v-for="acc in sales.zaloAccounts.slice(0, 3)"
              :key="acc.id"
              class="cs-mini-nick-chip"
              :class="{ 'is-online': acc.isOnline }"
              :title="acc.displayName || 'Nick Zalo'"
            >
              <span class="mini-dot" />
              <span class="mini-name">{{ acc.displayName || 'Zalo' }}</span>
            </span>
            <span v-if="sales.zaloAccounts.length > 3" class="cs-mini-nick-more">
              +{{ sales.zaloAccounts.length - 3 }}
            </span>
          </div>

          <!-- Card Bottom: Urgent Badge & Direct Action -->
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
              <span class="nowrap">Vào chat</span>
              <v-icon size="15" class="action-arrow">mdi-arrow-right</v-icon>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div
        v-if="!loadingAll && totalActiveDeckCount === 0"
        class="cs-empty-state"
      >
        <v-icon size="44" color="#94A3B8" class="mb-2">
          {{ activeFilter !== 'all' ? 'mdi-folder-open-outline' : 'mdi-cellphone-link-off' }}
        </v-icon>
        <div class="cs-empty-title">
          {{
            searchQuery
              ? 'Không tìm thấy Kênh hoặc Sales phù hợp'
              : activeFilter !== 'all'
              ? `Chưa có thẻ nào trong nhóm "${activeGroupName}"`
              : 'Chưa có kênh kết nối nào trong hệ thống'
          }}
        </div>
        <p class="cs-empty-desc">
          {{
            searchQuery
              ? 'Vui lòng kiểm tra lại từ khóa tìm kiếm.'
              : activeFilter !== 'all'
              ? 'Hãy kéo thả thẻ vào tab nhóm này để gom phân loại.'
              : 'Hãy bấm nút "+ Thêm Kênh" ở trên để quét mã QR kết nối nick Zalo đầu tiên.'
          }}
        </p>
        <button
          v-if="activeFilter !== 'all' || searchQuery"
          class="cs-btn-reset-filter"
          @click="activeFilter = 'all'; searchQuery = ''"
        >
          Xem tất cả
        </button>
      </div>
    </div>

    <!-- ════════ DIALOG: THÊM KÊNH ════════ -->
    <div v-if="showAddDialog" class="modal-backdrop" @click.self="showAddDialog = false">
      <div class="modal">
        <div class="modal-head">
          <h3 class="nowrap">Thêm Kênh Kết Nối</h3>
          <button class="x-btn" @click="showAddDialog = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="field">
            <label>Nhân viên sở hữu</label>
            <select v-model="addForm.staffId" class="field-select">
              <option value="">— Chọn nhân viên phụ trách —</option>
              <option v-for="s in staffOptions" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
          </div>
          <div class="field">
            <label>Nền tảng</label>
            <div class="platform-picker">
              <button
                class="plat-opt active"
              >
                <span class="plat-emoji">💙</span>
                <span>Zalo</span>
              </button>
            </div>
          </div>
          <div class="field">
            <label>Số điện thoại Zalo</label>
            <input v-model="addForm.accountInfo" placeholder="VD: 0909123456" />
          </div>
          <div class="field">
            <label>Tên gợi nhớ (tùy chọn)</label>
            <input v-model="addForm.displayName" placeholder="VD: Zalo Tư vấn 01" />
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn" @click="showAddDialog = false">Hủy</button>
          <button
            class="btn btn-primary nowrap"
            :disabled="!addForm.staffId || !addForm.accountInfo"
            @click="onAddChannel"
          >
            <v-icon size="14">mdi-plus</v-icon> Khởi tạo & Quét QR
          </button>
        </div>
      </div>
    </div>

    <!-- ════════ DIALOG: ĐỔI TÊN NHÓM ════════ -->
    <v-dialog v-model="renameDialogVisible" max-width="380">
      <div class="cs-dialog-card">
        <div class="cs-dialog-title nowrap">Đổi tên nhóm</div>
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

    <!-- ════════ KẾT NỐI NICK WIZARD (QR Login) ════════ -->
    <ConnectNickWizard
      v-if="qrWizardOpen"
      v-model:step="qrWizardStep"
      :qr-image="qrImage"
      :qr-scanned="qrScanned"
      :scanned-name="scannedName"
      :qr-error="qrError"
      :qr-session-dead="qrSessionDead"
      :sale-name="authStore.user?.fullName || 'Admin'"
      :connected-nick-name="connectedNickName"
      @retry-qr="retryQrLogin"
      @close="closeQrWizard"
    />

    <!-- ACCESS DIALOG: Phân quyền trực thay -->
    <ZaloAccessDialog
      v-model="showAccessDialog"
      :account-id="accessTargetId"
      :account-name="accessTargetName"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from '@/composables/use-toast';
import { useChannelConnections, type ChannelAccount } from '@/composables/use-channel-connections';
import { useZaloAccounts } from '@/composables/use-zalo-accounts';
import { useWorkScope } from '@/composables/use-work-scope';
import { useCsWorkspaceStore, type SalesCardData, type DelegatedSalesTarget } from '@/stores/use-cs-workspace';
import { useAuthStore } from '@/stores/auth';
import ConnectNickWizard from '@/components/zalo-accounts/ConnectNickWizard.vue';
import ZaloAccessDialog from '@/components/settings/ZaloAccessDialog.vue';
import { api } from '@/api/index';

interface CustomGroup {
  id: string;
  name: string;
  assignedIds: string[];
}

const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const workScope = useWorkScope();
const csWorkspace = useCsWorkspaceStore();

// ── DATA COMPOSABLES ──
const {
  groups: channelGroups,
  accounts: channels,
  loading: loadingChannels,
  fetchAll: fetchAllChannels,
  totalChannels,
  connectedCount,
  errorCount,
  lastFetch
} = useChannelConnections();

const {
  showQRDialog,
  qrImage,
  qrScanned,
  scannedName,
  qrError,
  qrSessionDead,
  currentLoginAccountId,
  loginAccount,
  cancelQR,
  setupSocket,
} = useZaloAccounts({ onStatusChange: () => refreshData() });

// ── STATE ──
const viewMode = ref<'channels' | 'sales'>('channels');
const searchQuery = ref('');
const activeFilter = ref<string>('all');
const loadingSales = ref(false);

const loadingAll = computed(() => loadingChannels.value || loadingSales.value);

const salesList = ref<SalesCardData[]>([]);
const qrWizardOpen = ref(false);
const qrWizardStep = ref<'phone' | 'confirm' | 'qr' | 'done'>('qr');
const connectedNickName = ref<string | null>(null);

const showAddDialog = ref(false);
const addForm = ref({
  staffId: '',
  accountInfo: '',
  displayName: '',
});
const staffOptions = ref<{ id: string; name: string }[]>([]);

const showAccessDialog = ref(false);
const accessTargetId = ref('');
const accessTargetName = ref('');

// ── CUSTOM GROUPS & DRAG DROP ──
const customGroups = ref<CustomGroup[]>([]);
const isCreatingGroup = ref(false);
const newGroupName = ref('');
const newGroupInputRef = ref<HTMLInputElement | null>(null);

const renameDialogVisible = ref(false);
const renamingGroupId = ref('');
const renamingGroupName = ref('');

const draggedCardId = ref<string | null>(null);
const draggedCardName = ref('');
const dragOverGroupId = ref<string | null>(null);

// ── DATA FETCHING ──
async function fetchDelegatedSales() {
  loadingSales.value = true;
  try {
    const res = await api.get<{ cskh: any; sales: SalesCardData[] }>('/cs/delegated-sales');
    if (res.data?.sales) {
      salesList.value = res.data.sales;
    }
  } catch (err) {
    console.error('Fetch delegated sales failed:', err);
  } finally {
    loadingSales.value = false;
  }
}

async function loadStaffOptions() {
  try {
    const { data } = await api.get('/users');
    const users = Array.isArray(data) ? data : (data.users ?? []);
    staffOptions.value = users.map((u: any) => ({
      id: u.id,
      name: u.fullName || u.email,
    }));
  } catch (err) {
    console.error('Không thể tải danh sách nhân viên', err);
  }
}

async function refreshData() {
  await Promise.all([fetchAllChannels(), fetchDelegatedSales()]);
  toast.push('Đã làm mới dữ liệu Kênh & Tin nhắn', 'success');
}

// ── STORAGE FOR CUSTOM GROUPS ──
const storageKey = computed(() => `admin_channels_groups_${authStore.user?.id || 'default'}`);

function loadCustomGroups() {
  try {
    const raw = localStorage.getItem(storageKey.value);
    if (raw) {
      customGroups.value = JSON.parse(raw);
    } else {
      // Fallback lấy từ cskh groups nếu có
      const cskhRaw = localStorage.getItem(`cs_custom_groups_${authStore.user?.id || 'default'}`);
      if (cskhRaw) {
        customGroups.value = JSON.parse(cskhRaw);
      }
    }
  } catch (e) {
    customGroups.value = [];
  }
}

function saveCustomGroups() {
  try {
    localStorage.setItem(storageKey.value, JSON.stringify(customGroups.value));
  } catch (e) {
    console.error('Failed to save groups', e);
  }
}

// ── COUNTS & MAPPINGS ──
const totalChannelsCount = computed(() => channels.value.length);
const connectedChannelsCount = computed(() =>
  channels.value.filter((c) => c.liveStatus === 'connected').length
);
const errorChannelsCount = computed(() =>
  channels.value.filter((c) => c.status === 'token_error' || c.liveStatus === 'disconnected').length
);

// Map số tin chờ từ salesList vào từng account ID
const accountPendingMap = computed(() => {
  const map: Record<string, number> = {};
  for (const s of salesList.value) {
    if (s.zaloAccounts.length === 1 && s.pendingMessages > 0) {
      map[s.zaloAccounts[0].id] = s.pendingMessages;
    } else if (s.zaloAccounts.length > 1) {
      // Chia đều hoặc gán nếu có tin
      for (const a of s.zaloAccounts) {
        map[a.id] = s.pendingMessages;
      }
    }
  }
  return map;
});

function getChannelPendingCount(channelId: string): number {
  return accountPendingMap.value[channelId] || 0;
}

// ── FILTERED LISTS ──
const filteredChannelList = computed(() => {
  let list = channels.value;
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    list = list.filter(
      (ch) =>
        (ch.displayName || '').toLowerCase().includes(q) ||
        (ch.phone || '').includes(q) ||
        (ch.zaloUid || '').toLowerCase().includes(q) ||
        (ch.owner?.fullName || '').toLowerCase().includes(q)
    );
  }
  if (activeFilter.value !== 'all') {
    const targetGroup = customGroups.value.find((g) => g.id === activeFilter.value);
    if (targetGroup) {
      list = list.filter((ch) => targetGroup.assignedIds.includes(ch.id));
    }
  }
  return list;
});

const filteredSalesList = computed(() => {
  let list = salesList.value;
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    list = list.filter((s) => s.salesUser.fullName.toLowerCase().includes(q));
  }
  if (activeFilter.value !== 'all') {
    const targetGroup = customGroups.value.find((g) => g.id === activeFilter.value);
    if (targetGroup) {
      list = list.filter((s) => targetGroup.assignedIds.includes(s.salesUser.id));
    }
  }
  return list;
});

const totalActiveDeckCount = computed(() => {
  return viewMode.value === 'channels'
    ? filteredChannelList.value.length
    : filteredSalesList.value.length;
});

const activeGroupName = computed(() => {
  if (activeFilter.value === 'all') return 'Tất cả';
  return customGroups.value.find((g) => g.id === activeFilter.value)?.name || '';
});

function getGroupCount(group: CustomGroup): number {
  if (viewMode.value === 'channels') {
    return channels.value.filter((c) => group.assignedIds.includes(c.id)).length;
  }
  return salesList.value.filter((s) => group.assignedIds.includes(s.salesUser.id)).length;
}

// ── NAVIGATION TO CHAT ──
function enterChatWithChannel(ch: ChannelAccount) {
  workScope.setScope([ch.id]);
  router.push({
    path: '/chat',
    query: {
      acc: ch.id,
      name: ch.displayName || ch.phone || 'Kênh Zalo',
    },
  });
}

function enterChatWithSales(sales: SalesCardData) {
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
  const accIds = sales.zaloAccounts.map((a) => a.id);
  if (accIds.length > 0) {
    workScope.setScope(accIds);
  }
  router.push({
    path: '/chat',
    query: {
      sales: sales.salesUser.id,
      name: sales.salesUser.fullName,
    },
  });
}

// ── RECONNECT & ACTIONS ──
function openQrFor(accountId: string, displayName?: string | null) {
  connectedNickName.value = displayName ?? null;
  qrWizardStep.value = 'qr';
  qrWizardOpen.value = true;
  return loginAccount(accountId);
}

function closeQrWizard() {
  qrWizardOpen.value = false;
  cancelQR();
  refreshData();
}

function retryQrLogin() {
  const accountId = currentLoginAccountId.value;
  if (accountId) loginAccount(accountId);
}

async function reconnectChannel(ch: ChannelAccount) {
  await openQrFor(ch.id, ch.displayName);
}

function openAccessDialog(ch: ChannelAccount) {
  accessTargetId.value = ch.id;
  accessTargetName.value = ch.displayName || ch.phone || ch.zaloUid || ch.id;
  showAccessDialog.value = true;
}

async function removeChannel(ch: ChannelAccount) {
  if (!confirm(`Bạn có chắc chắn muốn gỡ kênh "${ch.displayName || 'Zalo'}"?`)) return;
  try {
    await api.delete(`/zalo-accounts/${ch.id}`);
    toast.push(`Đã gỡ kênh "${ch.displayName || 'Zalo'}"`, 'success');
    refreshData();
  } catch (err: any) {
    toast.push('Gỡ thất bại: ' + (err.response?.data?.error || err.message), 'error');
  }
}

async function onAddChannel() {
  try {
    const res = await api.post('/zalo-accounts', {
      phone: addForm.value.accountInfo,
      displayName: addForm.value.displayName,
    });
    if (res.data?.id && addForm.value.staffId) {
      await api.post(`/zalo-accounts/${res.data.id}/access`, {
        userId: addForm.value.staffId,
        permission: 'admin',
      }).catch(() => {});
    }
    toast.push('Đã khởi tạo kênh kết nối mới. Hãy quét QR để hoàn tất.', 'success');
    showAddDialog.value = false;
    const newAccountId = res.data?.id;
    const newDisplayName = addForm.value.displayName;
    addForm.value = { staffId: '', accountInfo: '', displayName: '' };
    refreshData();
    if (newAccountId) await openQrFor(newAccountId, newDisplayName);
  } catch (err: any) {
    toast.push('Lỗi khởi tạo kênh: ' + (err.response?.data?.error || err.message), 'error');
  }
}

// ── DRAG & DROP GROUP LOGIC ──
function onDragStart(event: DragEvent, id: string, name: string) {
  draggedCardId.value = id;
  draggedCardName.value = name;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
  }
}

function onDragEnd() {
  draggedCardId.value = null;
  draggedCardName.value = '';
  dragOverGroupId.value = null;
}

function onDragOverGroup(event: DragEvent, groupId: string) {
  event.preventDefault();
  dragOverGroupId.value = groupId;
}

function onDragLeaveGroup(groupId: string) {
  if (dragOverGroupId.value === groupId) dragOverGroupId.value = null;
}

function onDropIntoGroup(event: DragEvent, group: CustomGroup) {
  event.preventDefault();
  dragOverGroupId.value = null;
  const id = draggedCardId.value || event.dataTransfer?.getData('text/plain');
  if (!id) return;
  if (group.assignedIds.includes(id)) {
    toast.push(`"${draggedCardName.value || 'Thẻ'}" đã nằm trong nhóm "${group.name}"`, 'info');
    return;
  }
  group.assignedIds.push(id);
  saveCustomGroups();
  toast.push(`Đã thêm "${draggedCardName.value || 'Thẻ'}" vào nhóm "${group.name}"`, 'success');
}

function toggleCardInGroup(id: string, group: CustomGroup, name: string) {
  const idx = group.assignedIds.indexOf(id);
  if (idx >= 0) {
    group.assignedIds.splice(idx, 1);
    toast.push(`Đã gỡ "${name}" khỏi nhóm "${group.name}"`, 'info');
  } else {
    group.assignedIds.push(id);
    toast.push(`Đã thêm "${name}" vào nhóm "${group.name}"`, 'success');
  }
  saveCustomGroups();
}

function removeCardFromGroup(id: string, groupId: string, name: string) {
  const group = customGroups.value.find((g) => g.id === groupId);
  if (!group) return;
  const idx = group.assignedIds.indexOf(id);
  if (idx >= 0) {
    group.assignedIds.splice(idx, 1);
    saveCustomGroups();
    toast.push(`Đã gỡ "${name}" khỏi nhóm "${group.name}"`, 'info');
  }
}

// ── CREATE / RENAME / DELETE GROUPS ──
function startCreateGroup() {
  isCreatingGroup.value = true;
  newGroupName.value = '';
  nextTick(() => newGroupInputRef.value?.focus());
}

function confirmCreateGroup() {
  const name = newGroupName.value.trim();
  if (!name) {
    cancelCreateGroup();
    return;
  }
  customGroups.value.push({
    id: `group_${Date.now()}`,
    name,
    assignedIds: [],
  });
  saveCustomGroups();
  isCreatingGroup.value = false;
  newGroupName.value = '';
  toast.push(`Đã tạo nhóm "${name}"`, 'success');
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
  if (!name) return;
  const target = customGroups.value.find((g) => g.id === renamingGroupId.value);
  if (target) {
    target.name = name;
    saveCustomGroups();
    toast.push('Đã đổi tên nhóm', 'success');
  }
  renameDialogVisible.value = false;
}

function deleteGroup(group: CustomGroup) {
  if (!confirm(`Bạn có chắc chắn muốn xóa nhóm "${group.name}"?`)) return;
  customGroups.value = customGroups.value.filter((g) => g.id !== group.id);
  if (activeFilter.value === group.id) activeFilter.value = 'all';
  saveCustomGroups();
  toast.push(`Đã xóa nhóm "${group.name}"`, 'success');
}

// ── HELPERS ──
const AVATAR_COLORS = ['#6366F1', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6'];
function pickColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function statusClass(s: string): string {
  return s === 'connected' ? 'st-ok' : s === 'qr_pending' ? 'st-warn' : 'st-off';
}

function statusLabel(live: string, dbStatus?: string): string {
  if (live === 'connected') return 'Đang kết nối';
  if (live === 'qr_pending' || dbStatus === 'token_error') return 'Chờ quét QR / Lỗi Token';
  return 'Chưa kết nối';
}

const lastRefreshLabel = computed(() => {
  if (!lastFetch.value) return 'vừa xong';
  const diff = Math.floor((Date.now() - lastFetch.value.getTime()) / 1000);
  if (diff < 10) return 'vừa xong';
  if (diff < 60) return `${diff}s trước`;
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  return `${Math.floor(diff / 3600)} giờ trước`;
});

onMounted(() => {
  setupSocket();
  fetchAllChannels();
  fetchDelegatedSales();
  loadStaffOptions();
  loadCustomGroups();
});

onUnmounted(() => {
  cancelQR();
});
</script>

<style scoped>
/* ══════════════════════════════════════════════════════════
   CANVAS WRAPPER (Glassmorphic Backdrop)
   ══════════════════════════════════════════════════════════ */
.cs-home-canvas {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  width: 100%;
  padding: 24px 32px;
  box-sizing: border-box;
  background: #F8FAFC;
  font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #0F172A;
}

/* ── TOP BAR ────────────────────────────────────────────── */
.cs-top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 16px;
}

.cs-title-group {
  display: flex;
  align-items: center;
}

.cs-title-lead {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cs-page-title {
  margin: 0;
  font-size: 24px;
  font-weight: 800;
  color: #0F172A;
  letter-spacing: -0.025em;
  line-height: 1.2;
}

.cs-page-sub {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #64748B;
}

.sub-sep {
  color: #CBD5E1;
}

.text-success {
  color: #10B981;
  font-weight: 600;
}

.text-warn {
  color: #EF4444;
  font-weight: 600;
}

.cs-top-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

/* View Mode Switcher Toggle */
.cs-view-toggle {
  display: inline-flex;
  align-items: center;
  background: #E2E8F0;
  padding: 3px;
  border-radius: 10px;
}

.cs-toggle-btn {
  display: inline-flex;
  align-items: center;
  padding: 5px 12px;
  border-radius: 8px;
  border: none;
  background: transparent;
  font-size: 12px;
  font-weight: 600;
  color: #475569;
  cursor: pointer;
  transition: all 0.2s ease;
}

.cs-toggle-btn.active {
  background: #FFFFFF;
  color: #0F172A;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.cs-search-input-wrap {
  position: relative;
  width: 250px;
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

.cs-btn-add-channel {
  display: inline-flex;
  align-items: center;
  height: 38px;
  padding: 0 16px;
  background: #0D9488;
  color: #FFFFFF;
  border: none;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 2px 6px rgba(13, 148, 136, 0.25);
}

.cs-btn-add-channel:hover {
  background: #0F766E;
  transform: translateY(-1px);
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

.custom-group-pill {
  position: relative;
  padding-right: 6px;
}

.custom-group-pill.is-drop-target {
  background: #CCFBF1 !important;
  border-color: #0D9488 !important;
  color: #0D9488 !important;
  transform: scale(1.05);
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
  width: 18px;
  height: 18px;
  border-radius: 50%;
  margin-left: 2px;
  opacity: 0.6;
  transition: all 0.15s ease;
}

.cs-group-tab-more:hover {
  opacity: 1;
  background: rgba(0, 0, 0, 0.08);
}

.cs-filter-pill.active .cs-group-tab-more:hover {
  background: rgba(255, 255, 255, 0.25);
}

.add-group-btn {
  border-style: dashed;
  color: #64748B;
  background: #F8FAFC;
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
  border: 1px solid #0D9488;
  border-radius: 999px;
  padding: 2px 4px 2px 10px;
  box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.12);
}

.cs-new-group-input {
  border: none;
  outline: none;
  font-size: 13px;
  color: #0F172A;
  width: 110px;
  font-family: inherit;
}

.cs-group-confirm-btn,
.cs-group-cancel-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
}

.cs-group-confirm-btn {
  background: #0D9488;
  color: #FFFFFF;
}

.cs-group-cancel-btn {
  background: #F1F5F9;
  color: #64748B;
}

/* ── BENTO GRID & ACTIONABLE CARDS ────────────────────── */
.cs-grid-container {
  flex: 1;
}

.cs-bento-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.cs-sales-card {
  position: relative;
  display: flex;
  flex-direction: column;
  background: #FFFFFF;
  border: 1px solid #E2E8F0;
  border-radius: 16px;
  padding: 16px 18px;
  box-sizing: border-box;
  cursor: pointer;
  user-select: none;
  transition: all 0.22s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}

.cs-sales-card:hover {
  transform: translateY(-2px);
  border-color: #0D9488;
  box-shadow: 0 8px 24px -4px rgba(13, 148, 136, 0.12);
}

.cs-sales-card.is-urgent {
  border-color: #FCA5A5;
  background: linear-gradient(180deg, #FFF5F5 0%, #FFFFFF 30%);
}

.cs-sales-card.is-offline {
  opacity: 0.82;
}

.cs-sales-card.is-error {
  border-color: #FDE68A;
  background: linear-gradient(180deg, #FFFBEB 0%, #FFFFFF 30%);
}

.cs-sales-card.is-dragging {
  opacity: 0.4;
  border-style: dashed;
}

/* Card Header */
.cs-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.cs-avatar-wrap {
  position: relative;
  flex-shrink: 0;
}

.cs-avatar-img {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid #FFFFFF;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
}

.cs-avatar-fallback {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #475569;
  color: #FFFFFF;
  font-weight: 700;
  font-size: 16px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
}

.cs-status-dot {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid #FFFFFF;
}

.status-online {
  background: #10B981;
  box-shadow: 0 0 6px #10B981;
}

.status-warn {
  background: #F59E0B;
  box-shadow: 0 0 6px #F59E0B;
}

.status-offline {
  background: #94A3B8;
}

.cs-user-meta {
  flex: 1;
  min-width: 0;
}

.cs-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.cs-card-name {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #0F172A;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}

.cs-platform-chip {
  display: inline-flex;
  padding: 1px 6px;
  background: #E0F2FE;
  color: #0369A1;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
}

.cs-card-subinfo {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #64748B;
  margin-top: 2px;
}

.cs-subinfo-phone {
  font-weight: 500;
}

.cs-owner-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  background: #F1F5F9;
  color: #475569;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  max-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cs-card-header-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.cs-card-menu-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: #94A3B8;
  cursor: pointer;
  transition: all 0.15s ease;
}

.cs-card-menu-btn:hover {
  background: #F1F5F9;
  color: #0F172A;
}

/* Card Middle in Channels mode */
.cs-card-channel-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  padding: 8px 10px;
  background: #F8FAFC;
  border-radius: 8px;
  font-size: 12px;
}

.cs-status-indicator {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-weight: 600;
}

.cs-status-indicator.st-ok {
  color: #059669;
}

.cs-status-indicator.st-warn {
  color: #D97706;
}

.cs-status-indicator.st-off {
  color: #64748B;
}

.indicator-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.cs-btn-reconnect {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: 6px;
  border: 1px solid #CBD5E1;
  background: #FFFFFF;
  color: #0D9488;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.cs-btn-reconnect:hover {
  background: #F0FDFA;
  border-color: #0D9488;
}

/* Card Middle in Sales mode */
.cs-sales-accounts-dock {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 14px;
  min-height: 26px;
}

.cs-mini-nick-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: #F1F5F9;
  border-radius: 6px;
  font-size: 11px;
  color: #475569;
  font-weight: 500;
  max-width: 120px;
}

.cs-mini-nick-chip .mini-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #94A3B8;
}

.cs-mini-nick-chip.is-online .mini-dot {
  background: #10B981;
}

.mini-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cs-mini-nick-more {
  font-size: 11px;
  font-weight: 700;
  color: #94A3B8;
  padding: 0 4px;
}

/* Card Footer */
.cs-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid #F1F5F9;
  padding-top: 12px;
  margin-top: auto;
}

.cs-urgent-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 9px;
  background: #FEE2E2;
  color: #DC2626;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: -0.01em;
  animation: pulse-urgent 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes pulse-urgent {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.75; }
}

.cs-btn-remove-from-group {
  display: inline-flex;
  align-items: center;
  border: none;
  background: transparent;
  color: #94A3B8;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  padding: 2px 0;
  transition: all 0.15s ease;
}

.cs-btn-remove-from-group:hover {
  color: #EF4444;
}

.cs-empty-placeholder {
  flex: 1;
}

.cs-footer-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cs-card-more-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  border: none;
  background: #F1F5F9;
  color: #64748B;
  cursor: pointer;
  transition: all 0.15s ease;
}

.cs-card-more-btn:hover {
  background: #E2E8F0;
  color: #0F172A;
}

.cs-action-hint {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 700;
  color: #0D9488;
}

.action-arrow {
  transition: transform 0.2s ease;
}

.cs-sales-card:hover .action-arrow {
  transform: translateX(3px);
}

/* Card Assign Menu Popup */
.cs-card-assign-menu {
  background: #FFFFFF;
  border-radius: 12px;
  padding: 12px;
  min-width: 200px;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15);
  border: 1px solid #E2E8F0;
}

.cs-assign-menu-title {
  font-size: 12px;
  font-weight: 700;
  color: #0F172A;
  margin-bottom: 8px;
}

.cs-assign-empty {
  font-size: 11px;
  color: #94A3B8;
  line-height: 1.4;
}

.cs-assign-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
  font-size: 13px;
  color: #334155;
  cursor: pointer;
}

/* Empty State */
.cs-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
  background: #FFFFFF;
  border: 1px dashed #CBD5E1;
  border-radius: 16px;
}

.cs-empty-title {
  font-size: 16px;
  font-weight: 700;
  color: #334155;
  margin-bottom: 6px;
}

.cs-empty-desc {
  font-size: 13px;
  color: #64748B;
  max-width: 440px;
  margin: 0 0 16px 0;
}

.cs-btn-reset-filter {
  padding: 8px 16px;
  background: #0F172A;
  color: #FFFFFF;
  border: none;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

/* Dialog & Modals */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: #FFFFFF;
  border-radius: 16px;
  width: 90%;
  max-width: 480px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #E2E8F0;
}

.modal-head h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}

.x-btn {
  background: none;
  border: none;
  font-size: 16px;
  color: #94A3B8;
  cursor: pointer;
}

.modal-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.field label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #475569;
  margin-bottom: 6px;
}

.field input,
.field-select {
  width: 100%;
  height: 38px;
  padding: 0 12px;
  border: 1px solid #CBD5E1;
  border-radius: 8px;
  font-size: 13px;
  color: #0F172A;
  box-sizing: border-box;
}

.platform-picker {
  display: flex;
  gap: 8px;
}

.plat-opt {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: 1px solid #0D9488;
  background: #F0FDFA;
  border-radius: 8px;
  color: #0D9488;
  font-weight: 600;
  font-size: 13px;
}

.modal-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid #E2E8F0;
  background: #F8FAFC;
}

.btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid #CBD5E1;
  background: #FFFFFF;
  color: #475569;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
}

.btn-primary {
  background: #0D9488;
  border-color: #0D9488;
  color: #FFFFFF;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.cs-dialog-card {
  background: #FFFFFF;
  border-radius: 16px;
  padding: 20px;
}

.cs-dialog-title {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 12px;
}

.cs-dialog-input {
  width: 100%;
  height: 40px;
  padding: 0 12px;
  border: 1px solid #CBD5E1;
  border-radius: 8px;
  font-size: 14px;
  box-sizing: border-box;
  margin-bottom: 16px;
}

.cs-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.cs-dialog-btn {
  padding: 8px 16px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  border: none;
}

.cs-dialog-btn.cancel {
  background: #F1F5F9;
  color: #64748B;
}

.cs-dialog-btn.confirm {
  background: #0D9488;
  color: #FFFFFF;
}

.nowrap {
  white-space: nowrap;
}
</style>
