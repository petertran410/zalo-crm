<template>
  <div class="cc-page">
    <!-- ═══════ TOP BAR ═══════ -->
    <div class="topbar">
      <div class="lead">
        <h1>Kênh Kết Nối</h1>
        <div class="sub">
          <b>{{ totalChannels }}</b> kênh
          <span> · {{ connectedCount }} kết nối</span>
          <span v-if="errorCount" class="warn"> · {{ errorCount }} lỗi</span>
          <span class="dot">·</span>
          cập nhật {{ lastRefreshLabel }}
        </div>
      </div>
      <div class="actions">
        <button class="btn" @click="onRefresh">
          <v-icon size="14">mdi-refresh</v-icon>
          Refresh
        </button>
        <button class="btn" @click="showGroupDialog = true">
          <v-icon size="14">mdi-folder-multiple-outline</v-icon>
          Gộp Kênh Chat
        </button>
        <button class="btn" @click="showReconnectAll">
          <v-icon size="14">mdi-connection</v-icon>
          Làm mới kết nối
        </button>
        <button class="btn btn-primary" @click="showAddDialog = true">
          <v-icon size="14">mdi-plus</v-icon>
          Thêm Kênh
        </button>
      </div>
    </div>

    <!-- ═══════ SEARCH & FILTER ═══════ -->
    <div class="filter-row">
      <div class="search">
        <v-icon size="14" color="#6B7280">mdi-magnify</v-icon>
        <input v-model="searchQuery" placeholder="Nhập tên, số điện thoại, ID..." />
      </div>
      <select v-model="platformFilter" class="select">
        <option value="all">Nền tảng: Tất cả</option>
        <option value="zalo">Zalo</option>
        <option value="facebook">Facebook</option>
        <option value="shopee">Shopee</option>
        <option value="tiktok">TikTok</option>
        <option value="web">Website</option>
      </select>
      <select v-model="statusFilter" class="select">
        <option value="all">Trạng thái: Tất cả</option>
        <option value="connected">Đang kết nối</option>
        <option value="token_error">Lỗi Token</option>
        <option value="disconnected">Chưa kết nối</option>
      </select>
    </div>

    <!-- ═══════ SECTION: BỘ PHẬN ═══════ -->
    <section class="cc-section">
      <div class="section-header">
        <h2><span class="section-bar" />Bộ phận ({{ departments.length }})</h2>
      </div>
      <div v-if="departments.length === 0" class="empty-section">
        <v-icon size="18" color="#9CA3AF">mdi-information-outline</v-icon>
        <span>Chưa có bộ phận nào được phân quyền</span>
      </div>
      <div v-else class="dept-grid">
        <div v-for="dept in departments" :key="dept.id" class="dept-card">
          <div class="dept-icon">
            <v-icon size="18" :color="dept.color">mdi-account-group-outline</v-icon>
          </div>
          <div class="dept-info">
            <div class="dept-name">{{ dept.name }}</div>
            <div class="dept-count">{{ dept.memberCount }} thành viên · {{ dept.channelCount }} kênh</div>
          </div>
          <v-icon size="16" color="#9CA3AF" class="dept-settings">mdi-cog-outline</v-icon>
        </div>
      </div>
    </section>

    <!-- ═══════ SECTION: GỘP KÊNH CHAT ═══════ -->
    <section class="cc-section">
      <div class="section-header">
        <h2><span class="section-bar" />Gộp Kênh Chat ({{ channelGroups.length }})</h2>
      </div>
      <div class="group-grid">
        <div v-for="grp in channelGroups" :key="grp.id" class="group-card">
          <div class="group-top">
            <div class="group-icons">
              <span v-for="p in grp.platforms" :key="p" class="platform-mini" :class="'plat-' + p">
                {{ platformEmoji(p) }}
              </span>
            </div>
            <span class="group-name">{{ grp.name }}</span>
            <v-icon size="16" color="#9CA3AF" class="group-settings">mdi-cog-outline</v-icon>
          </div>
          <div class="group-avatars">
            <span
              v-for="(m, i) in grp.members.slice(0, 3)"
              :key="i"
              class="group-avatar-chip"
              :title="m.name"
            >
              <span class="ga-initial" :style="{ background: m.color }">{{ m.name.charAt(0) }}</span>
            </span>
            <span v-if="grp.members.length > 3" class="group-avatar-chip ga-more">
              +{{ grp.members.length - 3 }}
            </span>
          </div>
          <div class="group-count">{{ grp.channelCount }} Kênh</div>
        </div>
      </div>
    </section>

    <!-- ═══════ SECTION: KÊNH CHAT CHI TIẾT ═══════ -->
    <section class="cc-section">
      <div class="section-header">
        <h2><span class="section-bar" />Kênh Chat ({{ filteredChannels.length }})</h2>
        <select v-model="platformFilter" class="select select-sm">
          <option value="all">Filter by platform</option>
          <option value="zalo">Zalo</option>
          <option value="facebook">Facebook</option>
          <option value="shopee">Shopee</option>
          <option value="tiktok">TikTok</option>
          <option value="web">Website</option>
        </select>
      </div>
      <div class="channel-grid">
        <div
          v-for="ch in filteredChannels"
          :key="ch.id"
          class="channel-card"
          :class="{ 'card-error': ch.status === 'token_error', 'card-off': ch.status === 'disconnected' }"
        >
          <div class="channel-row">
            <!-- Avatar -->
            <div class="ch-avatar-wrap">
              <span class="ch-avatar" :style="{ background: ch.avatarBg }">
                <img v-if="ch.avatarUrl" :src="ch.avatarUrl" :alt="ch.name" @error="(e: Event) => (e.target as HTMLImageElement).style.display='none'" />
                <span v-else class="ch-initial">{{ ch.name.charAt(0) }}</span>
              </span>
              <span class="ch-platform-badge" :class="'plat-' + ch.platform">
                {{ platformEmoji(ch.platform) }}
              </span>
            </div>
            <!-- Info -->
            <div class="ch-info">
              <div class="ch-name-row">
                <span class="ch-name">{{ ch.name }}</span>
                <span class="ch-platform-label" :class="'lbl-' + ch.platform">{{ platformLabel(ch.platform) }}</span>
              </div>
              <div class="ch-phone">{{ ch.phone || ch.accountId }}</div>
              <!-- Status -->
              <div class="ch-status-row">
                <span class="ch-status" :class="statusClass(ch.status)">
                  <span class="status-dot" />{{ statusLabel(ch.status) }}
                </span>
                <button
                  v-if="ch.status === 'token_error'"
                  class="btn-reconnect"
                  @click="reconnectChannel(ch)"
                >
                  <v-icon size="12">mdi-connection</v-icon> Làm mới kết nối
                </button>
              </div>
            </div>
            <!-- Actions -->
            <div class="ch-actions">
              <button class="icon-action" :title="ch.visible ? 'Ẩn kênh' : 'Hiện kênh'" @click="toggleVisible(ch)">
                <v-icon size="16">{{ ch.visible ? 'mdi-eye-outline' : 'mdi-eye-off-outline' }}</v-icon>
              </button>
              <v-menu>
                <template #activator="{ props: act }">
                  <button class="icon-action" v-bind="act">
                    <v-icon size="16">mdi-dots-vertical</v-icon>
                  </button>
                </template>
                <v-list density="compact" min-width="200">
                  <v-list-item title="Đổi bộ phận" prepend-icon="mdi-swap-horizontal" @click="changeDept(ch)" />
                  <v-list-item title="Đổi nhân viên sở hữu" prepend-icon="mdi-account-switch-outline" @click="changeOwner(ch)" />
                  <v-list-item title="Chi tiết kết nối" prepend-icon="mdi-information-outline" @click="viewDetail(ch)" />
                  <v-divider />
                  <v-list-item title="Gỡ kênh" prepend-icon="mdi-delete-outline" class="text-error" @click="removeChannel(ch)" />
                </v-list>
              </v-menu>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══════ DIALOG: THÊM KÊNH ═══════ -->
    <div v-if="showAddDialog" class="modal-backdrop" @click.self="showAddDialog = false">
      <div class="modal">
        <div class="modal-head">
          <h3>Thêm Kênh Kết Nối</h3>
          <button class="x-btn" @click="showAddDialog = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="field">
            <label>Nhân viên sở hữu</label>
            <select v-model="addForm.staffId" class="field-select">
              <option value="">— Chọn nhân viên —</option>
              <option v-for="s in staffOptions" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
          </div>
          <div class="field">
            <label>Nền tảng</label>
            <div class="platform-picker">
              <button
                v-for="p in platformOptions"
                :key="p.key"
                class="plat-opt"
                :class="{ active: addForm.platform === p.key }"
                @click="addForm.platform = p.key"
              >
                <span class="plat-emoji">{{ p.emoji }}</span>
                <span>{{ p.label }}</span>
              </button>
            </div>
          </div>
          <div class="field" v-if="addForm.platform">
            <label>{{ platformConfigLabel(addForm.platform) }}</label>
            <input v-model="addForm.accountInfo" :placeholder="platformConfigPlaceholder(addForm.platform)" />
          </div>
          <div class="field" v-if="addForm.platform">
            <label>Tên hiển thị</label>
            <input v-model="addForm.displayName" placeholder="Ví dụ: Fanpage Bán hàng HN" />
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn" @click="showAddDialog = false">Hủy</button>
          <button
            class="btn btn-primary"
            :disabled="!addForm.staffId || !addForm.platform || !addForm.accountInfo"
            @click="onAddChannel"
          >
            <v-icon size="14">mdi-plus</v-icon> Thêm Kênh
          </button>
        </div>
      </div>
    </div>

    <!-- ═══════ DIALOG: GỘP KÊNH CHAT ═══════ -->
    <div v-if="showGroupDialog" class="modal-backdrop" @click.self="showGroupDialog = false">
      <div class="modal">
        <div class="modal-head">
          <h3>Gộp Kênh Chat</h3>
          <button class="x-btn" @click="showGroupDialog = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="field">
            <label>Tên nhóm</label>
            <input v-model="groupForm.name" placeholder="Ví dụ: Shopee & TikTok" />
          </div>
          <div class="field">
            <label>Chọn kênh để gộp</label>
            <div class="channel-checkbox-list">
              <label v-for="ch in channels" :key="ch.id" class="ch-checkbox-row">
                <input type="checkbox" :value="ch.id" v-model="groupForm.channelIds" />
                <span class="platform-mini" :class="'plat-' + ch.platform">{{ platformEmoji(ch.platform) }}</span>
                <span>{{ ch.name }}</span>
              </label>
            </div>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn" @click="showGroupDialog = false">Hủy</button>
          <button
            class="btn btn-primary"
            :disabled="!groupForm.name || groupForm.channelIds.length < 2"
            @click="onCreateGroup"
          >
            Tạo nhóm
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useToast } from '@/composables/use-toast';

const toast = useToast();

// ── Types ──
interface Channel {
  id: string;
  name: string;
  phone: string;
  accountId: string;
  platform: 'zalo' | 'facebook' | 'shopee' | 'tiktok' | 'web';
  status: 'connected' | 'token_error' | 'disconnected';
  avatarUrl: string;
  avatarBg: string;
  visible: boolean;
  staffName: string;
  staffId: string;
  deptId: string;
}
interface ChannelGroup {
  id: string;
  name: string;
  platforms: string[];
  channelCount: number;
  members: { name: string; color: string }[];
}
interface Department {
  id: string;
  name: string;
  color: string;
  memberCount: number;
  channelCount: number;
}

// ── Mock Data ──
const AVATAR_COLORS = ['#6366F1', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6'];
function pickColor(i: number) { return AVATAR_COLORS[i % AVATAR_COLORS.length]; }

const departments = ref<Department[]>([]);

const channelGroups = ref<ChannelGroup[]>([
  {
    id: 'g1', name: 'Facebook & Website', platforms: ['facebook', 'web'], channelCount: 5,
    members: [
      { name: 'Phong', color: '#6366F1' },
      { name: 'Linh', color: '#0EA5E9' },
    ],
  },
  {
    id: 'g2', name: 'Facebook & Website & Zalo', platforms: ['facebook', 'web', 'zalo'], channelCount: 6,
    members: [
      { name: 'Hùng', color: '#10B981' },
      { name: 'Mai', color: '#F59E0B' },
    ],
  },
  {
    id: 'g3', name: 'Shopee & TikTok', platforms: ['shopee', 'tiktok'], channelCount: 2,
    members: [
      { name: 'An', color: '#EC4899' },
    ],
  },
  {
    id: 'g4', name: 'Ecom', platforms: ['shopee', 'tiktok', 'web'], channelCount: 4,
    members: [
      { name: 'Bảo', color: '#8B5CF6' },
      { name: 'Duy', color: '#14B8A6' },
    ],
  },
  {
    id: 'g5', name: 'CSKH Zalo', platforms: ['zalo'], channelCount: 3,
    members: [
      { name: 'Trang', color: '#F59E0B' },
      { name: 'Quân', color: '#6366F1' },
      { name: 'Hoài', color: '#0EA5E9' },
      { name: 'Vy', color: '#EF4444' },
    ],
  },
  {
    id: 'g6', name: 'Sale HCM', platforms: ['zalo', 'facebook'], channelCount: 4,
    members: [
      { name: 'Nhật', color: '#10B981' },
      { name: 'Khoa', color: '#EC4899' },
    ],
  },
]);

const channels = ref<Channel[]>([
  { id: 'c1',  name: 'Phong',   phone: '0903***123', accountId: 'fb-page-001', platform: 'facebook', status: 'connected',    avatarUrl: '', avatarBg: pickColor(0), visible: true,  staffName: 'Nguyễn Phong', staffId: 's1', deptId: 'd1' },
  { id: 'c2',  name: 'Linh',    phone: '0912***456', accountId: 'zalo-001',     platform: 'zalo',     status: 'connected',    avatarUrl: '', avatarBg: pickColor(1), visible: true,  staffName: 'Trần Linh',    staffId: 's2', deptId: 'd1' },
  { id: 'c3',  name: 'Hùng',    phone: '0987***789', accountId: 'sp-shop-001',  platform: 'shopee',   status: 'token_error',  avatarUrl: '', avatarBg: pickColor(2), visible: true,  staffName: 'Lê Hùng',      staffId: 's3', deptId: 'd1' },
  { id: 'c4',  name: 'An',      phone: '0976***321', accountId: 'tt-shop-001',  platform: 'tiktok',   status: 'connected',    avatarUrl: '', avatarBg: pickColor(3), visible: true,  staffName: 'Phạm An',      staffId: 's4', deptId: 'd2' },
  { id: 'c5',  name: 'Bảo',     phone: '0934***654', accountId: 'web-001',      platform: 'web',      status: 'connected',    avatarUrl: '', avatarBg: pickColor(4), visible: true,  staffName: 'Võ Bảo',       staffId: 's5', deptId: 'd2' },
  { id: 'c6',  name: 'Mai',     phone: '0908***987', accountId: 'fb-page-002',  platform: 'facebook', status: 'token_error',  avatarUrl: '', avatarBg: pickColor(5), visible: true,  staffName: 'Đỗ Mai',       staffId: 's6', deptId: 'd1' },
  { id: 'c7',  name: 'Trang',   phone: '0909***111', accountId: 'zalo-002',     platform: 'zalo',     status: 'connected',    avatarUrl: '', avatarBg: pickColor(6), visible: true,  staffName: 'Ngô Trang',    staffId: 's7', deptId: 'd2' },
  { id: 'c8',  name: 'Duy',     phone: '0918***222', accountId: 'sp-shop-002',  platform: 'shopee',   status: 'disconnected', avatarUrl: '', avatarBg: pickColor(7), visible: false, staffName: 'Bùi Duy',      staffId: 's8', deptId: 'd1' },
  { id: 'c9',  name: 'Quân',    phone: '0936***333', accountId: 'tt-shop-002',  platform: 'tiktok',   status: 'connected',    avatarUrl: '', avatarBg: pickColor(0), visible: true,  staffName: 'Hoàng Quân',   staffId: 's9', deptId: 'd2' },
  { id: 'c10', name: 'Hoài',    phone: '0944***444', accountId: 'zalo-003',     platform: 'zalo',     status: 'connected',    avatarUrl: '', avatarBg: pickColor(1), visible: true,  staffName: 'Lý Hoài',      staffId: 's10', deptId: 'd1' },
  { id: 'c11', name: 'Nhật',    phone: '0955***555', accountId: 'fb-page-003',  platform: 'facebook', status: 'connected',    avatarUrl: '', avatarBg: pickColor(2), visible: true,  staffName: 'Trương Nhật',  staffId: 's11', deptId: 'd2' },
  { id: 'c12', name: 'Khoa',    phone: '0966***666', accountId: 'web-002',      platform: 'web',      status: 'token_error',  avatarUrl: '', avatarBg: pickColor(3), visible: true,  staffName: 'Đặng Khoa',    staffId: 's12', deptId: 'd1' },
  { id: 'c13', name: 'Vy',      phone: '0977***777', accountId: 'zalo-004',     platform: 'zalo',     status: 'connected',    avatarUrl: '', avatarBg: pickColor(4), visible: true,  staffName: 'Phan Vy',      staffId: 's13', deptId: 'd2' },
  { id: 'c14', name: 'Thảo',    phone: '0988***888', accountId: 'sp-shop-003',  platform: 'shopee',   status: 'connected',    avatarUrl: '', avatarBg: pickColor(5), visible: true,  staffName: 'Hồ Thảo',      staffId: 's14', deptId: 'd1' },
  { id: 'c15', name: 'Minh',    phone: '0922***999', accountId: 'tt-shop-003',  platform: 'tiktok',   status: 'disconnected', avatarUrl: '', avatarBg: pickColor(6), visible: false, staffName: 'Cao Minh',     staffId: 's15', deptId: 'd2' },
  { id: 'c16', name: 'Hương',   phone: '0911***000', accountId: 'fb-page-004',  platform: 'facebook', status: 'connected',    avatarUrl: '', avatarBg: pickColor(7), visible: true,  staffName: 'Vũ Hương',     staffId: 's16', deptId: 'd1' },
  { id: 'c17', name: 'Tuấn',    phone: '0945***112', accountId: 'zalo-005',     platform: 'zalo',     status: 'connected',    avatarUrl: '', avatarBg: pickColor(0), visible: true,  staffName: 'Lưu Tuấn',     staffId: 's17', deptId: 'd2' },
  { id: 'c18', name: 'Diệp',    phone: '0933***223', accountId: 'web-003',      platform: 'web',      status: 'connected',    avatarUrl: '', avatarBg: pickColor(1), visible: true,  staffName: 'Trần Diệp',    staffId: 's18', deptId: 'd1' },
]);

// ── State ──
const searchQuery = ref('');
const platformFilter = ref('all');
const statusFilter = ref('all');
const lastRefresh = ref(new Date());
const showAddDialog = ref(false);
const showGroupDialog = ref(false);

const addForm = ref({
  staffId: '',
  platform: '' as string,
  accountInfo: '',
  displayName: '',
});

const groupForm = ref({
  name: '',
  channelIds: [] as string[],
});

const staffOptions = [
  { id: 's1',  name: 'Nguyễn Phong' },
  { id: 's2',  name: 'Trần Linh' },
  { id: 's3',  name: 'Lê Hùng' },
  { id: 's4',  name: 'Phạm An' },
  { id: 's5',  name: 'Võ Bảo' },
  { id: 's6',  name: 'Đỗ Mai' },
  { id: 's7',  name: 'Ngô Trang' },
  { id: 's8',  name: 'Bùi Duy' },
  { id: 's9',  name: 'Hoàng Quân' },
  { id: 's10', name: 'Lý Hoài' },
];

const platformOptions = [
  { key: 'zalo',     emoji: '💙', label: 'Zalo' },
  { key: 'facebook', emoji: '📘', label: 'Facebook Page' },
  { key: 'shopee',   emoji: '🛒', label: 'Shopee Shop' },
  { key: 'tiktok',   emoji: '🎵', label: 'TikTok Shop' },
  { key: 'web',      emoji: '🌐', label: 'Web Widget' },
];

// ── Computed ──
const filteredChannels = computed(() => {
  let list = channels.value;
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    list = list.filter(
      (ch) =>
        ch.name.toLowerCase().includes(q) ||
        ch.phone.includes(q) ||
        ch.accountId.toLowerCase().includes(q) ||
        ch.staffName.toLowerCase().includes(q),
    );
  }
  if (platformFilter.value !== 'all') {
    list = list.filter((ch) => ch.platform === platformFilter.value);
  }
  if (statusFilter.value !== 'all') {
    list = list.filter((ch) => ch.status === statusFilter.value);
  }
  return list;
});

const totalChannels = computed(() => channels.value.length);
const connectedCount = computed(() => channels.value.filter((ch) => ch.status === 'connected').length);
const errorCount = computed(() => channels.value.filter((ch) => ch.status === 'token_error').length);

const lastRefreshLabel = computed(() => {
  const diff = Math.floor((Date.now() - lastRefresh.value.getTime()) / 1000);
  if (diff < 10) return 'vừa xong';
  if (diff < 60) return `${diff}s trước`;
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  return `${Math.floor(diff / 3600)} giờ trước`;
});

// ── Helpers ──
function platformEmoji(p: string): string {
  const map: Record<string, string> = { zalo: '💙', facebook: '📘', shopee: '🛒', tiktok: '🎵', web: '🌐' };
  return map[p] ?? '📱';
}
function platformLabel(p: string): string {
  const map: Record<string, string> = { zalo: 'Zalo', facebook: 'Facebook', shopee: 'Shopee', tiktok: 'TikTok', web: 'Website' };
  return map[p] ?? p;
}
function statusClass(s: string): string {
  return s === 'connected' ? 'st-ok' : s === 'token_error' ? 'st-err' : 'st-off';
}
function statusLabel(s: string): string {
  return s === 'connected' ? 'Đang kết nối' : s === 'token_error' ? 'Token error' : 'Chưa kết nối';
}
function platformConfigLabel(p: string): string {
  const map: Record<string, string> = {
    zalo: 'Số điện thoại Zalo',
    facebook: 'Page ID hoặc URL',
    shopee: 'Shopee Shop ID',
    tiktok: 'TikTok Shop ID',
    web: 'Domain website',
  };
  return map[p] ?? 'Thông tin tài khoản';
}
function platformConfigPlaceholder(p: string): string {
  const map: Record<string, string> = {
    zalo: '0909123456',
    facebook: 'https://fb.com/yourpage hoặc 123456789',
    shopee: 'shop_12345678',
    tiktok: 'tiktok_shop_id',
    web: 'example.com',
  };
  return map[p] ?? '';
}

// ── Actions (mock) ──
function onRefresh() {
  lastRefresh.value = new Date();
  toast.push('Đã làm mới danh sách kênh kết nối', 'success');
}
function showReconnectAll() {
  const errCount = channels.value.filter((ch) => ch.status === 'token_error').length;
  if (errCount === 0) {
    toast.push('Tất cả kênh đang hoạt động bình thường', 'success');
    return;
  }
  // Mock reconnect
  channels.value.forEach((ch) => {
    if (ch.status === 'token_error') ch.status = 'connected';
  });
  toast.push(`Đã làm mới ${errCount} kênh bị lỗi token`, 'success');
}
function reconnectChannel(ch: Channel) {
  ch.status = 'connected';
  toast.push(`Đã kết nối lại "${ch.name}"`, 'success');
}
function toggleVisible(ch: Channel) {
  ch.visible = !ch.visible;
  toast.push(ch.visible ? `Đã hiện kênh "${ch.name}"` : `Đã ẩn kênh "${ch.name}"`, 'info');
}
function changeDept(ch: Channel) {
  toast.push(`Chức năng "Đổi bộ phận" cho kênh "${ch.name}" — sẽ triển khai khi có API`, 'info');
}
function changeOwner(ch: Channel) {
  toast.push(`Chức năng "Đổi nhân viên sở hữu" cho kênh "${ch.name}" — sẽ triển khai khi có API`, 'info');
}
function viewDetail(ch: Channel) {
  toast.push(`Chi tiết kết nối: ${ch.name} (${platformLabel(ch.platform)}) — ${ch.accountId}`, 'info');
}
function removeChannel(ch: Channel) {
  channels.value = channels.value.filter((c) => c.id !== ch.id);
  toast.push(`Đã gỡ kênh "${ch.name}"`, 'success');
}
function onAddChannel() {
  const p = addForm.value.platform as Channel['platform'];
  const staff = staffOptions.find((s) => s.id === addForm.value.staffId);
  const newCh: Channel = {
    id: `c-new-${Date.now()}`,
    name: addForm.value.displayName || staff?.name || 'Kênh mới',
    phone: addForm.value.accountInfo,
    accountId: addForm.value.accountInfo,
    platform: p,
    status: 'connected',
    avatarUrl: '',
    avatarBg: pickColor(channels.value.length),
    visible: true,
    staffName: staff?.name || 'N/A',
    staffId: addForm.value.staffId,
    deptId: 'd1',
  };
  channels.value.push(newCh);
  showAddDialog.value = false;
  addForm.value = { staffId: '', platform: '', accountInfo: '', displayName: '' };
  toast.push(`Đã thêm kênh "${newCh.name}" (${platformLabel(p)})`, 'success');
}
function onCreateGroup() {
  const selected = channels.value.filter((ch) => groupForm.value.channelIds.includes(ch.id));
  const platforms = [...new Set(selected.map((ch) => ch.platform))];
  channelGroups.value.push({
    id: `g-new-${Date.now()}`,
    name: groupForm.value.name,
    platforms,
    channelCount: selected.length,
    members: selected.map((ch) => ({ name: ch.name, color: ch.avatarBg })),
  });
  showGroupDialog.value = false;
  groupForm.value = { name: '', channelIds: [] };
  toast.push(`Đã tạo nhóm kênh "${groupForm.value.name || 'Mới'}"`, 'success');
}
</script>

<style scoped>
/* ═══════ PAGE LAYOUT ═══════ */
.cc-page {
  padding: 20px 24px 120px;
  max-width: 1480px;
  margin: 0 auto;
}

/* ═══════ TOP BAR — reuse from ZaloAccountsView ═══════ */
.topbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 18px;
}
.topbar h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: #111827;
}
.topbar .sub {
  font-size: 12.5px;
  color: #6B7280;
  margin-top: 2px;
}
.topbar .sub b { color: #111827; font-weight: 600; }
.topbar .sub .warn { color: #B91C1C; font-weight: 500; }
.topbar .sub .dot { margin: 0 6px; color: #D1D5DB; }
.topbar .actions { display: flex; gap: 8px; }

/* ═══════ BUTTONS ═══════ */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border-radius: 8px;
  border: 1px solid #E5E7EB;
  background: white;
  cursor: pointer;
  font-size: 12.5px;
  color: #4B5563;
  font-weight: 500;
  font-family: inherit;
  transition: background 0.12s, border 0.12s, color 0.12s;
}
.btn:hover:not(:disabled) {
  border-color: #D1D5DB;
  color: #111827;
}
.btn:disabled { opacity: 0.55; cursor: not-allowed; }
.btn-primary {
  background: #6366F1;
  color: white;
  border-color: #6366F1;
}
.btn-primary:hover:not(:disabled) {
  background: #4F46E5;
  border-color: #4F46E5;
  color: white;
}

/* ═══════ FILTER ROW ═══════ */
.filter-row {
  display: flex;
  gap: 8px;
  align-items: center;
  background: white;
  border: 1px solid #F3F4F6;
  border-radius: 10px;
  padding: 8px 10px;
  margin-bottom: 20px;
}
.search {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  background: #F9FAFB;
  border: 1px solid #F3F4F6;
  border-radius: 8px;
  height: 32px;
}
.search input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 12.5px;
  color: #111827;
  font-family: inherit;
}
.search input::placeholder { color: #9CA3AF; }
.select {
  height: 32px;
  padding: 0 9px;
  border: 1px solid #E5E7EB;
  border-radius: 7px;
  background: white;
  font-size: 12px;
  color: #4B5563;
  cursor: pointer;
  font-family: inherit;
}
.select:hover { border-color: #D1D5DB; }
.select-sm { height: 28px; font-size: 11.5px; }

/* ═══════ SECTIONS ═══════ */
.cc-section { margin-bottom: 28px; }
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.section-header h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #111827;
  display: flex;
  align-items: center;
  gap: 8px;
}
.section-bar {
  width: 3px; height: 18px;
  background: #6366F1;
  border-radius: 2px;
  display: inline-block;
}
.empty-section {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  background: #F9FAFB;
  border: 1px dashed #E5E7EB;
  border-radius: 10px;
  color: #9CA3AF;
  font-size: 13px;
}

/* ═══════ DEPARTMENTS ═══════ */
.dept-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 10px;
}
.dept-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  background: white;
  border: 1px solid #F3F4F6;
  border-radius: 10px;
  transition: border-color 0.15s, box-shadow 0.15s;
  cursor: default;
}
.dept-card:hover {
  border-color: #E0E7FF;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.06);
}
.dept-icon {
  width: 36px; height: 36px;
  background: #EEF2FF;
  border-radius: 9px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.dept-info { flex: 1; min-width: 0; }
.dept-name {
  font-size: 13.5px;
  font-weight: 600;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dept-count {
  font-size: 11.5px;
  color: #9CA3AF;
  margin-top: 1px;
}
.dept-settings { cursor: pointer; opacity: 0; transition: opacity 0.15s; }
.dept-card:hover .dept-settings { opacity: 1; }

/* ═══════ CHANNEL GROUPS ═══════ */
.group-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
}
.group-card {
  background: white;
  border: 1px solid #F3F4F6;
  border-radius: 10px;
  padding: 14px;
  transition: border-color 0.15s, box-shadow 0.15s;
  cursor: default;
}
.group-card:hover {
  border-color: #E0E7FF;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.06);
}
.group-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.group-icons {
  display: flex;
  gap: 3px;
}
.platform-mini {
  font-size: 14px;
  width: 24px; height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: #F3F4F6;
}
.plat-zalo     { background: #E0F2FE; }
.plat-facebook { background: #DBEAFE; }
.plat-shopee   { background: #FEF3C7; }
.plat-tiktok   { background: #F1F1F4; }
.plat-web      { background: #ECFDF5; }
.group-name {
  flex: 1;
  font-size: 13.5px;
  font-weight: 600;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.group-settings { cursor: pointer; opacity: 0; transition: opacity 0.15s; }
.group-card:hover .group-settings { opacity: 1; }
.group-avatars {
  display: flex;
  gap: 4px;
  margin-bottom: 8px;
}
.group-avatar-chip { display: inline-flex; }
.ga-initial {
  width: 26px; height: 26px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 11px;
  font-weight: 700;
}
.ga-more {
  width: 26px; height: 26px;
  border-radius: 50%;
  background: #F3F4F6;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  color: #6B7280;
}
.group-count {
  font-size: 12px;
  color: #9CA3AF;
  font-weight: 500;
}

/* ═══════ CHANNEL CARDS ═══════ */
.channel-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 10px;
}
.channel-card {
  background: white;
  border: 1px solid #F3F4F6;
  border-radius: 10px;
  padding: 12px 14px;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.channel-card:hover {
  border-color: #E0E7FF;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.06);
}
.channel-card.card-error {
  border-color: #FECACA;
  background: #FFFBFB;
}
.channel-card.card-off {
  opacity: 0.65;
}
.channel-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* Avatar + platform badge */
.ch-avatar-wrap {
  position: relative;
  flex-shrink: 0;
}
.ch-avatar {
  width: 42px; height: 42px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.ch-avatar img {
  width: 100%; height: 100%;
  object-fit: cover;
}
.ch-initial {
  color: white;
  font-size: 16px;
  font-weight: 700;
}
.ch-platform-badge {
  position: absolute;
  bottom: -3px;
  right: -3px;
  width: 20px; height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  border: 2px solid white;
}

/* Info block */
.ch-info {
  flex: 1;
  min-width: 0;
}
.ch-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ch-name {
  font-size: 13.5px;
  font-weight: 600;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ch-platform-label {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  white-space: nowrap;
}
.lbl-zalo     { background: #E0F2FE; color: #0369A1; }
.lbl-facebook { background: #DBEAFE; color: #1D4ED8; }
.lbl-shopee   { background: #FEF3C7; color: #92400E; }
.lbl-tiktok   { background: #F1F1F4; color: #111827; }
.lbl-web      { background: #ECFDF5; color: #065F46; }
.ch-phone {
  font-size: 12px;
  color: #9CA3AF;
  margin-top: 1px;
}
.ch-status-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}
.ch-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  font-weight: 600;
}
.status-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
.st-ok  { color: #059669; }
.st-ok .status-dot  { background: #10B981; box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2); }
.st-err { color: #B91C1C; }
.st-err .status-dot { background: #EF4444; box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.2); }
.st-off { color: #9CA3AF; }
.st-off .status-dot { background: #D1D5DB; }

.btn-reconnect {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  background: #FEF2F2;
  border: 1px solid #FECACA;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  color: #B91C1C;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.12s;
}
.btn-reconnect:hover {
  background: #FEE2E2;
}

/* Card actions */
.ch-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}
.icon-action {
  width: 30px; height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  border: none;
  background: transparent;
  color: #9CA3AF;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.icon-action:hover {
  background: #F3F4F6;
  color: #4B5563;
}

/* ═══════ MODAL ═══════ */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(17, 24, 39, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}
.modal {
  background: white;
  border-radius: 14px;
  width: 480px;
  max-width: 92vw;
  box-shadow: 0 24px 60px rgba(17, 24, 39, 0.18);
  overflow: hidden;
}
.modal-head {
  padding: 14px 18px;
  border-bottom: 1px solid #F3F4F6;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.modal-head h3 { margin: 0; font-size: 15px; font-weight: 600; color: #111827; }
.x-btn {
  background: transparent;
  border: none;
  color: #6B7280;
  cursor: pointer;
  font-size: 16px;
  padding: 4px 8px;
  font-family: inherit;
}
.modal-body {
  padding: 18px;
  font-size: 13px;
  color: #4B5563;
  max-height: 60vh;
  overflow-y: auto;
}
.field { margin-bottom: 14px; }
.field label {
  display: block;
  font-size: 11.5px;
  font-weight: 600;
  color: #6B7280;
  text-transform: uppercase;
  letter-spacing: .04em;
  margin-bottom: 5px;
}
.field input, .field-select {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #E5E7EB;
  border-radius: 7px;
  font-size: 13px;
  outline: none;
  font-family: inherit;
  background: white;
  color: #111827;
}
.field input:focus, .field-select:focus { border-color: #6366F1; }
.modal-foot {
  padding: 12px 18px;
  background: #FAFBFC;
  border-top: 1px solid #F3F4F6;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* Platform picker */
.platform-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.plat-opt {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 12px;
  background: #F9FAFB;
  border: 1px solid #E5E7EB;
  border-radius: 8px;
  cursor: pointer;
  font-size: 12.5px;
  font-weight: 500;
  color: #4B5563;
  font-family: inherit;
  transition: all 0.12s;
}
.plat-opt:hover { border-color: #C7D2FE; }
.plat-opt.active {
  background: #EEF2FF;
  border-color: #6366F1;
  color: #4F46E5;
  font-weight: 600;
}
.plat-emoji { font-size: 14px; }

/* Channel checkbox list (for grouping dialog) */
.channel-checkbox-list {
  max-height: 240px;
  overflow-y: auto;
  border: 1px solid #F3F4F6;
  border-radius: 8px;
  padding: 6px 0;
}
.ch-checkbox-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  font-size: 13px;
  color: #374151;
  cursor: pointer;
}
.ch-checkbox-row:hover { background: #F9FAFB; }
.ch-checkbox-row input { accent-color: #6366F1; }

/* ═══════ Vuetify list error color override ═══════ */
.text-error :deep(.v-list-item-title) { color: #EF4444; }
.text-error :deep(.v-icon) { color: #EF4444 !important; }

/* ═══════ RESPONSIVE ═══════ */
@media (max-width: 768px) {
  .topbar { flex-direction: column; gap: 10px; }
  .topbar .actions { flex-wrap: wrap; }
  .filter-row { flex-wrap: wrap; }
  .channel-grid { grid-template-columns: 1fr; }
  .group-grid { grid-template-columns: 1fr 1fr; }
}
</style>
