<template>
  <div class="cs-home-canvas">
    <!-- ════════ HEADER BAR ════════ -->
    <header class="cs-home-header">
      <div class="cs-header-left">
        <div class="cs-header-badge">
          <v-icon size="14" class="mr-1">mdi-headset</v-icon>
          <span>CSKH Workspace</span>
        </div>
        <h1 class="cs-header-title">Trang Chủ Điều Phối Đa Sales</h1>
        <p class="cs-header-subtitle">
          Theo dõi và hỗ trợ trực chat thay mặt các nhân viên kinh doanh được phân quyền.
        </p>
      </div>

      <div class="cs-header-actions">
        <button class="cs-refresh-btn" :disabled="loading" @click="fetchHubData">
          <v-icon size="16" :class="{ 'spin-anim': loading }">mdi-refresh</v-icon>
          <span>Làm mới</span>
        </button>
      </div>
    </header>

    <!-- ════════ METRICS BAR ════════ -->
    <section class="cs-metrics-grid">
      <div class="cs-metric-card">
        <div class="cs-metric-icon-box teal-soft">
          <v-icon size="24" color="#0D9488">mdi-account-tie</v-icon>
        </div>
        <div class="cs-metric-info">
          <span class="cs-metric-label">Sales Phụ Trách</span>
          <span class="cs-metric-val">{{ salesList.length }}</span>
        </div>
      </div>

      <div class="cs-metric-card">
        <div class="cs-metric-icon-box blue-soft">
          <v-icon size="24" color="#0284C7">mdi-forum-outline</v-icon>
        </div>
        <div class="cs-metric-info">
          <span class="cs-metric-label">Tổng Nhóm Điều Phối</span>
          <span class="cs-metric-val">{{ totalDelegatedGroups }}</span>
        </div>
      </div>

      <div class="cs-metric-card">
        <div class="cs-metric-icon-box amber-soft">
          <v-icon size="24" color="#D97706">mdi-clock-alert-outline</v-icon>
        </div>
        <div class="cs-metric-info">
          <span class="cs-metric-label">Tin Chờ Phản Hồi</span>
          <span class="cs-metric-val" :class="{ 'warn-text': totalPendingMessages > 0 }">
            {{ totalPendingMessages }}
          </span>
        </div>
      </div>

      <div class="cs-metric-card">
        <div class="cs-metric-icon-box purple-soft">
          <v-icon size="24" color="#7C3AED">mdi-cellphone-link</v-icon>
        </div>
        <div class="cs-metric-info">
          <span class="cs-metric-label">Nick Sales Đã Kết Nối</span>
          <span class="cs-metric-val">{{ connectedNicksCount }} / {{ totalSalesNicksCount }}</span>
        </div>
      </div>
    </section>

    <!-- ════════ MAIN CONTENT ════════ -->
    <div class="cs-home-body">
      <!-- SECTION 1: CSKH CHUNG (Nick cá nhân của CSKH) -->
      <section class="cs-section">
        <div class="cs-section-header">
          <div class="cs-section-title-wrap">
            <h2 class="cs-section-title">Không Gian CSKH Chung</h2>
            <span class="cs-section-badge">Không gian riêng của bạn</span>
          </div>
        </div>

        <div class="cs-cskh-own-card">
          <div class="cs-own-left">
            <div class="cs-own-avatar-ring">
              <v-icon size="28" color="#0D9488">mdi-account-supervisor-circle</v-icon>
            </div>
            <div class="cs-own-info">
              <h3 class="cs-own-name">Chăm Sóc Khách Hàng Chung</h3>
              <p class="cs-own-desc">
                Sử dụng các nick Zalo cá nhân của bạn để tiếp nhận và phản hồi khách hàng theo phân luồng chung.
              </p>
              <div class="cs-own-chips">
                <span class="cs-own-chip">
                  <v-icon size="14" class="mr-1">mdi-cellphone</v-icon>
                  {{ cskhData.totalAccounts }} nick Zalo của bạn
                </span>
                <span class="cs-own-chip">
                  <v-icon size="14" class="mr-1">mdi-forum</v-icon>
                  {{ cskhData.totalGroups }} nhóm
                </span>
                <span v-if="cskhData.pendingMessages > 0" class="cs-own-chip warn">
                  <v-icon size="14" class="mr-1">mdi-alert-circle</v-icon>
                  {{ cskhData.pendingMessages }} tin chờ rep
                </span>
              </div>
            </div>
          </div>

          <div class="cs-own-actions">
            <button class="cs-btn-enter-own" @click="enterCskhWorkspace">
              <v-icon size="16" class="mr-1">mdi-chat-processing-outline</v-icon>
              <span>Vào Tin Nhắn CSKH</span>
            </button>
          </div>
        </div>
      </section>

      <!-- SECTION 2: DANH SÁCH SALES ĐƯỢC ỦY QUYỀN HỖ TRỢ -->
      <section class="cs-section">
        <div class="cs-section-header">
          <div class="cs-section-title-wrap">
            <h2 class="cs-section-title">Danh Sách Sales Cần Hỗ Trợ</h2>
            <span class="cs-section-count">{{ filteredSalesList.length }} Sales</span>
          </div>

          <!-- Search Filter -->
          <div class="cs-search-box">
            <v-icon size="18" class="cs-search-icon">mdi-magnify</v-icon>
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Tìm theo tên Sales hoặc email..."
              class="cs-search-input"
            />
            <button v-if="searchQuery" class="cs-search-clear" @click="searchQuery = ''">
              <v-icon size="14">mdi-close-circle</v-icon>
            </button>
          </div>
        </div>

        <!-- Loading State -->
        <div v-if="loading" class="cs-loading-wrap">
          <v-progress-circular indeterminate color="#0D9488" size="36" />
          <span>Đang tải danh sách Sales điều phối...</span>
        </div>

        <!-- Empty State -->
        <div v-else-if="filteredSalesList.length === 0" class="cs-empty-card">
          <v-icon size="48" color="#94A3B8" class="mb-2">mdi-account-search-outline</v-icon>
          <div class="cs-empty-title">
            {{ searchQuery ? 'Không tìm thấy Sales phù hợp' : 'Chưa có Sales nào được phân quyền cho bạn' }}
          </div>
          <p class="cs-empty-desc">
            {{ searchQuery
              ? 'Vui lòng kiểm tra lại từ khóa tìm kiếm.'
              : 'Để hỗ trợ trực chat thay cho Sales, Admin cần phân quyền "chat" trên nick Zalo của Sales tại Cài đặt tài khoản Zalo.' }}
          </p>
        </div>

        <!-- Sales Grid -->
        <div v-else class="cs-sales-grid">
          <div
            v-for="sales in filteredSalesList"
            :key="sales.salesUser.id"
            class="cs-sales-card"
            :class="{ 'has-pending': sales.pendingMessages > 0 }"
          >
            <!-- Card Header: Avatar & Info -->
            <div class="cs-card-top">
              <div class="cs-avatar-wrap">
                <img
                  v-if="sales.salesUser.avatarUrl"
                  :src="sales.salesUser.avatarUrl"
                  :alt="sales.salesUser.fullName"
                  class="cs-sales-avatar"
                />
                <div v-else class="cs-avatar-fallback">
                  {{ sales.salesUser.fullName?.charAt(0)?.toUpperCase() || 'S' }}
                </div>
                <span
                  class="cs-status-dot"
                  :class="sales.status === 'online' ? 'status-online' : 'status-offline'"
                  :title="sales.status === 'online' ? 'Đang online' : 'Đang offline'"
                />
              </div>

              <div class="cs-card-user-info">
                <h3 class="cs-card-username" :title="sales.salesUser.fullName">
                  {{ sales.salesUser.fullName }}
                </h3>
                <span class="cs-card-email" :title="sales.salesUser.email">
                  {{ sales.salesUser.email }}
                </span>
              </div>

              <span
                class="cs-presence-badge"
                :class="sales.status === 'online' ? 'badge-online' : 'badge-offline'"
              >
                {{ sales.status === 'online' ? 'Online' : 'Offline' }}
              </span>
            </div>

            <!-- Nick List -->
            <div class="cs-card-nicks">
              <span class="cs-nicks-label">Nick Zalo phụ trách:</span>
              <div class="cs-nicks-list">
                <div
                  v-for="nick in sales.zaloAccounts"
                  :key="nick.id"
                  class="cs-nick-chip"
                  :title="nick.displayName || 'Nick Zalo'"
                >
                  <img
                    v-if="nick.avatarUrl"
                    :src="nick.avatarUrl"
                    class="cs-nick-avatar"
                  />
                  <span
                    class="cs-nick-dot"
                    :class="nick.isOnline ? 'online' : 'offline'"
                  />
                  <span class="cs-nick-name">{{ nick.displayName || 'Nick Zalo' }}</span>
                </div>
              </div>
            </div>

            <!-- Metrics row -->
            <div class="cs-card-metrics">
              <div class="cs-card-stat">
                <span class="cs-stat-num">{{ sales.totalGroups }}</span>
                <span class="cs-stat-text">Nhóm KH</span>
              </div>

              <div class="cs-card-stat-divider" />

              <div class="cs-card-stat">
                <span class="cs-stat-num" :class="{ 'text-warn': sales.pendingMessages > 0 }">
                  {{ sales.pendingMessages }}
                </span>
                <span class="cs-stat-text">Chưa phản hồi</span>
              </div>

              <div class="cs-card-stat-divider" />

              <div class="cs-card-stat">
                <span class="cs-stat-num">{{ sales.unreadMessages }}</span>
                <span class="cs-stat-text">Tin chưa đọc</span>
              </div>
            </div>

            <!-- Card Action Footer -->
            <div class="cs-card-footer">
              <button
                class="cs-btn-delegate-start"
                @click="startSupportingSales(sales)"
              >
                <v-icon size="16" class="mr-1">mdi-headset</v-icon>
                <span>Hỗ Trợ Sales {{ sales.salesUser.fullName.split(' ').pop() }}</span>
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/api/index';
import { useToast } from '@/composables/use-toast';
import { useCsWorkspaceStore, type DelegatedSalesTarget } from '@/stores/use-cs-workspace';

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

const loading = ref(false);
const searchQuery = ref('');

const cskhData = ref<CskhOwnData>({
  totalAccounts: 0,
  zaloAccounts: [],
  totalGroups: 0,
  pendingMessages: 0,
  unreadMessages: 0,
});

const salesList = ref<SalesCardData[]>([]);

// Thống kê tổng hợp
const totalDelegatedGroups = computed(() =>
  salesList.value.reduce((sum, s) => sum + s.totalGroups, 0),
);

const totalPendingMessages = computed(() =>
  salesList.value.reduce((sum, s) => sum + s.pendingMessages, 0) + cskhData.value.pendingMessages,
);

const totalSalesNicksCount = computed(() =>
  salesList.value.reduce((sum, s) => sum + s.zaloAccounts.length, 0),
);

const connectedNicksCount = computed(() =>
  salesList.value.reduce(
    (sum, s) => sum + s.zaloAccounts.filter((n) => n.isOnline).length,
    0,
  ),
);

// Lọc theo search
const filteredSalesList = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return salesList.value;
  return salesList.value.filter(
    (s) =>
      s.salesUser.fullName.toLowerCase().includes(q) ||
      s.salesUser.email.toLowerCase().includes(q) ||
      s.zaloAccounts.some((a) => (a.displayName || '').toLowerCase().includes(q)),
  );
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

function enterCskhWorkspace() {
  const ownIds = cskhData.value.zaloAccounts.map((a) => a.id);
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

onMounted(() => {
  void fetchHubData();
});
</script>

<style scoped>
/* ══════════════════════════════════════════════════════════
   CSKH Home View — Neo-SaaS Care Teal Styling
   ══════════════════════════════════════════════════════════ */
.cs-home-canvas {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  padding: 24px 32px;
  overflow-y: auto;
  box-sizing: border-box;
  background: transparent;
  font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

/* ── HEADER ────────────────────────────────────────────── */
.cs-home-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 24px;
}

.cs-header-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  background: rgba(13, 148, 136, 0.1);
  color: #0D9488;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  margin-bottom: 8px;
}

.cs-header-title {
  margin: 0 0 6px;
  font-size: 26px;
  font-weight: 800;
  color: #0F172A;
  letter-spacing: -0.02em;
}

.cs-header-subtitle {
  margin: 0;
  font-size: 14px;
  color: #64748B;
  font-weight: 400;
}

.cs-refresh-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: #FFFFFF;
  border: 1px solid #E2E8F0;
  border-radius: 10px;
  color: #475569;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  transition: all 0.2s ease;
}

.cs-refresh-btn:hover {
  background: #F8FAFC;
  border-color: #CBD5E1;
  color: #0F172A;
}

.spin-anim {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ── METRICS GRID ──────────────────────────────────────── */
.cs-metrics-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 28px;
}

.cs-metric-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 18px 20px;
  background: #FFFFFF;
  border: 1px solid rgba(226, 232, 240, 0.8);
  border-radius: 16px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.02);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.cs-metric-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.05);
}

.cs-metric-icon-box {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.teal-soft { background: rgba(13, 148, 136, 0.12); }
.blue-soft { background: rgba(2, 132, 199, 0.12); }
.amber-soft { background: rgba(217, 119, 6, 0.12); }
.purple-soft { background: rgba(124, 58, 237, 0.12); }

.cs-metric-info {
  display: flex;
  flex-direction: column;
}

.cs-metric-label {
  font-size: 13px;
  color: #64748B;
  font-weight: 500;
  margin-bottom: 2px;
}

.cs-metric-val {
  font-size: 24px;
  font-weight: 800;
  color: #0F172A;
  line-height: 1.1;
}

.cs-metric-val.warn-text {
  color: #D97706;
}

/* ── SECTIONS ─────────────────────────────────────────── */
.cs-home-body {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.cs-section {
  display: flex;
  flex-direction: column;
}

.cs-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.cs-section-title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}

.cs-section-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #0F172A;
}

.cs-section-badge {
  font-size: 12px;
  font-weight: 600;
  color: #0D9488;
  background: rgba(13, 148, 136, 0.1);
  padding: 3px 8px;
  border-radius: 6px;
}

.cs-section-count {
  font-size: 12px;
  font-weight: 700;
  color: #64748B;
  background: #F1F5F9;
  padding: 3px 10px;
  border-radius: 999px;
}

/* ── CSKH OWN CARD ─────────────────────────────────────── */
.cs-cskh-own-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  background: linear-gradient(135deg, #FFFFFF 0%, #F0FDFA 100%);
  border: 1px solid #99F6E4;
  border-radius: 16px;
  box-shadow: 0 4px 14px rgba(13, 148, 136, 0.06);
}

.cs-own-left {
  display: flex;
  align-items: center;
  gap: 18px;
}

.cs-own-avatar-ring {
  width: 54px;
  height: 54px;
  border-radius: 50%;
  background: rgba(13, 148, 136, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.cs-own-info {
  display: flex;
  flex-direction: column;
}

.cs-own-name {
  margin: 0 0 4px;
  font-size: 17px;
  font-weight: 700;
  color: #0F172A;
}

.cs-own-desc {
  margin: 0 0 10px;
  font-size: 13px;
  color: #64748B;
}

.cs-own-chips {
  display: flex;
  align-items: center;
  gap: 10px;
}

.cs-own-chip {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  background: #FFFFFF;
  border: 1px solid #CCFBF1;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  color: #0F766E;
}

.cs-own-chip.warn {
  background: #FFFBEB;
  border-color: #FDE68A;
  color: #D97706;
}

.cs-btn-enter-own {
  display: inline-flex;
  align-items: center;
  padding: 10px 20px;
  background: #0D9488;
  color: #FFFFFF;
  border: none;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(13, 148, 136, 0.25);
  transition: all 0.2s ease;
}

.cs-btn-enter-own:hover {
  background: #0F766E;
  box-shadow: 0 6px 16px rgba(13, 148, 136, 0.35);
  transform: translateY(-1px);
}

/* ── SEARCH BOX ────────────────────────────────────────── */
.cs-search-box {
  position: relative;
  width: 280px;
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
  padding: 8px 32px 8px 36px;
  background: #FFFFFF;
  border: 1px solid #CBD5E1;
  border-radius: 10px;
  font-size: 13px;
  color: #0F172A;
  outline: none;
  font-family: inherit;
  transition: border-color 0.2s;
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
}

/* ── SALES GRID ────────────────────────────────────────── */
.cs-sales-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
}

.cs-sales-card {
  display: flex;
  flex-direction: column;
  background: #FFFFFF;
  border: 1px solid #E2E8F0;
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
  transition: all 0.2s ease;
}

.cs-sales-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.06);
  border-color: #CBD5E1;
}

.cs-sales-card.has-pending {
  border-color: #FCD34D;
  background: linear-gradient(180deg, #FFFFFF 0%, #FFFDF5 100%);
}

.cs-card-top {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.cs-avatar-wrap {
  position: relative;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
}

.cs-sales-avatar {
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
  font-size: 17px;
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

.status-online { background-color: #10B981; }
.status-offline { background-color: #94A3B8; }

.cs-card-user-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.cs-card-username {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #0F172A;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cs-card-email {
  font-size: 12px;
  color: #64748B;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cs-presence-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 6px;
  flex-shrink: 0;
}

.badge-online {
  background: rgba(16, 185, 129, 0.12);
  color: #059669;
}

.badge-offline {
  background: #F1F5F9;
  color: #64748B;
}

/* Nicks list */
.cs-card-nicks {
  margin-bottom: 14px;
}

.cs-nicks-label {
  font-size: 11px;
  font-weight: 600;
  color: #94A3B8;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  display: block;
  margin-bottom: 6px;
}

.cs-nicks-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.cs-nick-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  background: #F8FAFC;
  border: 1px solid #E2E8F0;
  border-radius: 6px;
  font-size: 12px;
  color: #334155;
  font-weight: 500;
  max-width: 100%;
}

.cs-nick-avatar {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  object-fit: cover;
}

.cs-nick-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.cs-nick-dot.online { background-color: #10B981; }
.cs-nick-dot.offline { background-color: #CBD5E1; }

.cs-nick-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Card metrics */
.cs-card-metrics {
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 12px 8px;
  background: #F8FAFC;
  border-radius: 12px;
  margin-bottom: 16px;
}

.cs-card-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.cs-stat-num {
  font-size: 16px;
  font-weight: 800;
  color: #0F172A;
}

.cs-stat-num.text-warn {
  color: #D97706;
}

.cs-stat-text {
  font-size: 11px;
  color: #64748B;
  font-weight: 500;
}

.cs-card-stat-divider {
  width: 1px;
  height: 24px;
  background: #E2E8F0;
}

/* Action button */
.cs-card-footer {
  margin-top: auto;
}

.cs-btn-delegate-start {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 9px 16px;
  background: #0D9488;
  color: #FFFFFF;
  border: none;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(13, 148, 136, 0.2);
  transition: all 0.2s ease;
  font-family: inherit;
}

.cs-btn-delegate-start:hover {
  background: #0F766E;
  box-shadow: 0 4px 12px rgba(13, 148, 136, 0.35);
}

/* Loading & Empty */
.cs-loading-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 0;
  gap: 12px;
  color: #64748B;
  font-size: 14px;
}

.cs-empty-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 48px 24px;
  background: #FFFFFF;
  border: 1px dashed #CBD5E1;
  border-radius: 16px;
}

.cs-empty-title {
  font-size: 16px;
  font-weight: 700;
  color: #334155;
  margin-bottom: 4px;
}

.cs-empty-desc {
  margin: 0;
  max-width: 440px;
  font-size: 13px;
  color: #64748B;
  line-height: 1.5;
}

/* ── RESPONSIVE ───────────────────────────────────────── */
@media (max-width: 1024px) {
  .cs-metrics-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 640px) {
  .cs-home-canvas {
    padding: 16px;
  }
  .cs-metrics-grid {
    grid-template-columns: 1fr;
  }
  .cs-cskh-own-card {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }
  .cs-btn-enter-own {
    width: 100%;
    justify-content: center;
  }
}
</style>
