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

    <!-- ════════ SMART FILTER PILLS (Replaces old bulky KPI cards) ════════ -->
    <div class="cs-filter-bar">
      <div class="cs-pills-group">
        <button
          class="cs-filter-pill"
          :class="{ active: activeFilter === 'all' }"
          @click="activeFilter = 'all'"
        >
          <span>Tất cả</span>
          <span class="cs-pill-badge">{{ salesList.length }}</span>
        </button>

        <button
          class="cs-filter-pill urgent-pill"
          :class="{ active: activeFilter === 'urgent', 'has-urgent': urgentSalesCount > 0 }"
          @click="activeFilter = 'urgent'"
        >
          <v-icon size="14" class="mr-1">mdi-lightning-bolt</v-icon>
          <span>Cần hỗ trợ gấp</span>
          <span class="cs-pill-badge urgent-badge">{{ urgentSalesCount }}</span>
        </button>

        <button
          class="cs-filter-pill"
          :class="{ active: activeFilter === 'online' }"
          @click="activeFilter = 'online'"
        >
          <span class="cs-dot-indicator online" />
          <span>Đang online</span>
          <span class="cs-pill-badge">{{ onlineSalesCount }}</span>
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
        <!-- ── LEAD HERO CARD: HỘP THƯ CỦA TÔI (Hiển thị khi ở tab 'Tất cả') ── -->
        <div
          v-if="activeFilter === 'all' && !searchQuery"
          class="cs-sales-card cs-lead-card"
          title="Bấm để vào Hộp thư cá nhân CSKH"
          @click="enterCskhWorkspace"
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
          </div>

          <div class="cs-card-footer">
            <div v-if="cskhData.pendingMessages > 0" class="cs-urgent-badge">
              <v-icon size="13" class="mr-1">mdi-fire</v-icon>
              <span>{{ cskhData.pendingMessages }} tin chưa rep</span>
            </div>
            <div v-else class="cs-empty-placeholder" />

            <div class="cs-action-hint">
              <span>Vào chat</span>
              <v-icon size="15" class="action-arrow">mdi-arrow-right</v-icon>
            </div>
          </div>
        </div>

        <!-- ── SALES CARDS (Full-card Clickable) ── -->
        <div
          v-for="sales in filteredSalesList"
          :key="sales.salesUser.id"
          class="cs-sales-card"
          :class="{
            'is-urgent': sales.pendingMessages > 0,
            'is-offline': sales.status === 'offline'
          }"
          :title="`Bấm để trực thay Sales ${sales.salesUser.fullName}`"
          @click="startSupportingSales(sales)"
        >
          <!-- Card Top: Avatar, Name -->
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
          </div>

          <!-- Card Bottom: Urgent Badge (left) & Direct Action (right) -->
          <div class="cs-card-footer">
            <div v-if="sales.pendingMessages > 0" class="cs-urgent-badge">
              <v-icon size="13" class="mr-1">mdi-fire</v-icon>
              <span>{{ sales.pendingMessages }} tin chưa rep</span>
            </div>
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
        v-if="filteredSalesList.length === 0 && (!loading || activeFilter !== 'all')"
        class="cs-empty-state"
      >
        <v-icon size="44" color="#94A3B8" class="mb-2">mdi-account-search-outline</v-icon>
        <div class="cs-empty-title">
          {{ searchQuery ? 'Không tìm thấy Sales phù hợp' : 'Không có Sales nào trong danh mục này' }}
        </div>
        <p class="cs-empty-desc">
          {{
            searchQuery
              ? 'Vui lòng kiểm tra lại từ khóa tìm kiếm.'
              : activeFilter === 'urgent'
              ? 'Hiện tại không có Sales nào có tin nhắn khách bị tồn đọng. Tất cả đều đã được phản hồi!'
              : 'Chưa có Sales nào được phân quyền cho bạn.'
          }}
        </p>
        <button
          v-if="activeFilter !== 'all' || searchQuery"
          class="cs-btn-reset-filter"
          @click="activeFilter = 'all'; searchQuery = ''"
        >
          Xem tất cả Sales
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onActivated } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/api/index';
import { useToast } from '@/composables/use-toast';
import { useCsWorkspaceStore, type DelegatedSalesTarget } from '@/stores/use-cs-workspace';
import { useAuthStore } from '@/stores/auth';

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
const activeFilter = ref<'all' | 'urgent' | 'online'>('all');

const cskhData = ref<CskhOwnData>({
  totalAccounts: 0,
  zaloAccounts: [],
  totalGroups: 0,
  pendingMessages: 0,
  unreadMessages: 0,
});

const salesList = ref<SalesCardData[]>([]);

// Thống kê tổng hợp cho Toolbar
const totalDelegatedGroups = computed(() =>
  salesList.value.reduce((sum, s) => sum + s.totalGroups, 0),
);

const totalPendingMessages = computed(() =>
  salesList.value.reduce((sum, s) => sum + s.pendingMessages, 0) + cskhData.value.pendingMessages,
);

const urgentSalesCount = computed(() =>
  salesList.value.filter((s) => s.pendingMessages > 0).length,
);

const onlineSalesCount = computed(() =>
  salesList.value.filter((s) => s.status === 'online').length,
);

// Lọc kết hợp Search + Filter Pill, ưu tiên khẩn cấp lên đầu
const filteredSalesList = computed(() => {
  let list = salesList.value;

  if (activeFilter.value === 'urgent') {
    list = list.filter((s) => s.pendingMessages > 0);
  } else if (activeFilter.value === 'online') {
    list = list.filter((s) => s.status === 'online');
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
  void fetchHubData();
  resetHomeDelegatedState();
});

onActivated(() => {
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

/* ── SMART FILTER PILLS BAR ────────────────────────────── */
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
  gap: 8px;
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

/* Urgent Pill Style */
.cs-filter-pill.urgent-pill.has-urgent {
  border-color: #FDE68A;
  color: #B45309;
}

.cs-filter-pill.urgent-pill.has-urgent .urgent-badge {
  background: #FEF3C7;
  color: #D97706;
}

.cs-filter-pill.urgent-pill.active {
  background: #D97706;
  border-color: #D97706;
  color: #FFFFFF;
}

.cs-filter-pill.urgent-pill.active .urgent-badge {
  background: rgba(255, 255, 255, 0.25);
  color: #FFFFFF;
}

.cs-dot-indicator {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}
.cs-dot-indicator.online { background-color: #10B981; }


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
