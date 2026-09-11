<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      ref="flyoutRef"
      class="cs-scope-flyout"
      :class="{
        'is-multi-row': isMultiRow,
        'is-pinned': isPinned,
      }"
      :style="{
        top: `${targetTop}px`,
        left: `${targetLeft}px`,
      }"
      role="dialog"
      aria-label="Chuyển nhanh hộp thư"
      @mouseenter="$emit('mouseenter')"
      @mouseleave="$emit('mouseleave')"
      @click.stop
    >
      <!-- Mũi tên trỏ sang icon menu bên trái -->
      <div class="cs-flyout-pointer" />

      <!-- Header nhỏ gọn -->
      <div class="cs-flyout-header">
        <div class="cs-flyout-title-wrap">
          <span class="cs-flyout-title">Chuyển nhanh hộp thư</span>
          <span v-if="salesList.length > 0" class="cs-flyout-count">
            ({{ salesList.length }} Sales)
          </span>
        </div>
        <button
          v-if="isPinned"
          class="cs-flyout-unpin-btn"
          title="Bỏ ghim (tự động đóng khi rê chuột ra ngoài)"
          @click.stop="$emit('unpin')"
        >
          <v-icon size="14">mdi-pin-off</v-icon>
        </button>
      </div>

      <!-- Khung thân Dock ngang -->
      <div class="cs-flyout-body">
        <!-- 1. Hộp thư cá nhân ("Tôi") -->
        <div
          class="cs-avatar-item"
          :class="{ 'is-active': !csWorkspace.isDelegatedMode }"
          title="Hộp thư Zalo CSKH của tôi"
          @click="selectOwnInbox"
        >
          <div class="cs-avatar-ring">
            <Avatar
              :src="authStore.user?.avatarUrl"
              :name="authStore.user?.fullName || 'Tôi'"
              :size="42"
              :platform="null"
            />
            <span v-if="!csWorkspace.isDelegatedMode" class="cs-active-check">
              <v-icon size="12" color="white">mdi-check</v-icon>
            </span>
          </div>
          <span class="cs-avatar-label">Tôi</span>
        </div>

        <!-- Vạch ngăn cách giữa Tôi và Sales -->
        <div class="cs-flyout-divider" />

        <!-- Loading skeleton -->
        <div v-if="csWorkspace.loadingDelegated && salesList.length === 0" class="cs-flyout-loading">
          <v-progress-circular indeterminate size="20" width="2" color="primary" />
        </div>

        <!-- 2. Danh sách Sales được phân công trực thay -->
        <div
          v-else-if="salesList.length > 0"
          class="cs-sales-dock"
          :class="{ 'is-grid-2': isMultiRow }"
        >
          <div
            v-for="sales in salesList"
            :key="sales.salesUser.id"
            class="cs-avatar-item"
            :class="{
              'is-active': csWorkspace.activeSalesTarget?.id === sales.salesUser.id,
            }"
            :title="`Trực thay Sales: ${sales.salesUser.fullName} (${getSalesNickCount(sales)} nick)`"
            @click="selectSalesTarget(sales)"
          >
            <div class="cs-avatar-ring">
              <Avatar
                :src="sales.salesUser.avatarUrl"
                :name="sales.salesUser.fullName"
                :size="42"
                :platform="null"
              />
              <!-- Chấm trạng thái Online / Offline -->
              <span
                class="cs-status-dot"
                :class="isSalesOnline(sales) ? 'is-online' : 'is-offline'"
                :title="isSalesOnline(sales) ? 'Sales đang online' : 'Sales offline'"
              />
              <!-- Dấu tích kích hoạt khi đang chọn Sales này -->
              <span
                v-if="csWorkspace.activeSalesTarget?.id === sales.salesUser.id"
                class="cs-active-check"
              >
                <v-icon size="12" color="white">mdi-check</v-icon>
              </span>
            </div>
            <span class="cs-avatar-label">
              {{ formatShortName(sales.salesUser.fullName) }}
            </span>
          </div>
        </div>

        <!-- Trạng thái chưa có Sales nào được phân công -->
        <div v-else class="cs-flyout-empty">
          <span class="cs-empty-text">Chưa có Sales nào được phân công</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useCsWorkspaceStore, type SalesCardData, type DelegatedSalesTarget } from '@/stores/use-cs-workspace';
import { useToast } from '@/composables/use-toast';
import Avatar from '@/components/ui/Avatar.vue';

const props = withDefaults(
  defineProps<{
    isOpen: boolean;
    isPinned?: boolean;
    targetTop?: number;
    targetLeft?: number;
  }>(),
  {
    isPinned: false,
    targetTop: 120,
    targetLeft: 84,
  }
);

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'unpin'): void;
  (e: 'mouseenter'): void;
  (e: 'mouseleave'): void;
}>();

const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const csWorkspace = useCsWorkspaceStore();

const salesList = computed(() => csWorkspace.delegatedSalesList);

// Khi có trên 4 Sales -> Tự động mở rộng thành lưới 2 hàng (Grid)
const isMultiRow = computed(() => salesList.value.length > 4);

function isSalesOnline(sales: SalesCardData): boolean {
  if (sales.status === 'online') return true;
  return sales.zaloAccounts.some((a) => a.isOnline);
}

function getSalesNickCount(sales: SalesCardData): number {
  return sales.zaloAccounts?.length || 0;
}

function formatShortName(fullName: string): string {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 2) return fullName;
  return parts.slice(-2).join(' ');
}

function selectOwnInbox() {
  if (!csWorkspace.isDelegatedMode) {
    // Đang ở CSKH của tôi rồi -> chỉ điều hướng nếu chưa ở /cs-chat
    router.push('/cs-chat');
    emit('close');
    return;
  }
  csWorkspace.clearSalesTarget();
  toast.success('Đã chuyển về hộp thư Zalo CSKH của bạn');
  router.push('/cs-chat');
  emit('close');
}

function selectSalesTarget(sales: SalesCardData) {
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
  toast.success(`Đã chuyển sang trực thay: ${sales.salesUser.fullName}`);
  router.push('/cs-chat');
  emit('close');
}
</script>

<style scoped>
.cs-scope-flyout {
  position: fixed;
  transform: translateY(-50%);
  z-index: 2500;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 20px;
  padding: 12px 16px 14px;
  box-shadow:
    0 10px 30px -5px rgba(0, 0, 0, 0.12),
    0 20px 40px -10px rgba(0, 0, 0, 0.08),
    0 0 0 1px rgba(255, 255, 255, 0.6) inset;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 200px;
  animation: csFlyoutFadeSlide 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  pointer-events: auto;
  user-select: none;
}

/* Dark theme support nếu layout dark */
:global(.theme--dark) .cs-scope-flyout,
:global(.v-theme--dark) .cs-scope-flyout {
  background: rgba(24, 30, 42, 0.95);
  border-color: rgba(255, 255, 255, 0.12);
  box-shadow:
    0 12px 36px -4px rgba(0, 0, 0, 0.45),
    0 0 0 1px rgba(255, 255, 255, 0.08) inset;
}

@keyframes csFlyoutFadeSlide {
  from {
    opacity: 0;
    transform: translate(-10px, -50%) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translate(0, -50%) scale(1);
  }
}

/* Mũi tên trỏ sang icon menu bên trái */
.cs-flyout-pointer {
  position: absolute;
  left: -9px;
  top: 50%;
  transform: translateY(-50%);
  width: 0;
  height: 0;
  border-top: 8px solid transparent;
  border-bottom: 8px solid transparent;
  border-right: 9px solid rgba(255, 255, 255, 0.94);
  filter: drop-shadow(-3px 0 2px rgba(0, 0, 0, 0.04));
}

:global(.theme--dark) .cs-flyout-pointer,
:global(.v-theme--dark) .cs-flyout-pointer {
  border-right-color: rgba(24, 30, 42, 0.95);
}

/* Header */
.cs-flyout-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 4px;
}

.cs-flyout-title-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}

.cs-flyout-title {
  font-size: 11.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #64748b;
}

:global(.theme--dark) .cs-flyout-title,
:global(.v-theme--dark) .cs-flyout-title {
  color: #94a3b8;
}

.cs-flyout-count {
  font-size: 11px;
  color: #94a3b8;
  font-weight: 500;
}

.cs-flyout-unpin-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  transition: all 0.15s ease;
}

.cs-flyout-unpin-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  color: #0f172a;
}

/* Body: Thanh dock ngang */
.cs-flyout-body {
  display: flex;
  align-items: center;
  gap: 12px;
}

.cs-avatar-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  padding: 4px;
  border-radius: 12px;
  transition: transform 0.18s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.15s ease;
  position: relative;
}

.cs-avatar-item:hover {
  transform: translateY(-2px);
}

.cs-avatar-ring {
  position: relative;
  border-radius: 50%;
  padding: 2.5px;
  transition: all 0.2s ease;
}

/* Active Ring khi đang chọn */
.cs-avatar-item.is-active .cs-avatar-ring {
  background: linear-gradient(135deg, #0ea5e9, #2563eb);
  box-shadow:
    0 0 0 2px rgba(255, 255, 255, 0.9),
    0 0 14px rgba(37, 99, 235, 0.45);
}

:global(.theme--dark) .cs-avatar-item.is-active .cs-avatar-ring,
:global(.v-theme--dark) .cs-avatar-item.is-active .cs-avatar-ring {
  box-shadow:
    0 0 0 2px rgba(24, 30, 42, 0.9),
    0 0 14px rgba(56, 189, 248, 0.45);
}

.cs-avatar-label {
  font-size: 11.5px;
  font-weight: 500;
  color: #334155;
  text-align: center;
  max-width: 64px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

:global(.theme--dark) .cs-avatar-label,
:global(.v-theme--dark) .cs-avatar-label {
  color: #e2e8f0;
}

.cs-avatar-item.is-active .cs-avatar-label {
  font-weight: 700;
  color: #2563eb;
}

:global(.theme--dark) .cs-avatar-item.is-active .cs-avatar-label,
:global(.v-theme--dark) .cs-avatar-item.is-active .cs-avatar-label {
  color: #38bdf8;
}

/* Status dot (Online / Offline) */
.cs-status-dot {
  position: absolute;
  right: 2px;
  bottom: 2px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid white;
  z-index: 2;
}

.cs-status-dot.is-online {
  background-color: #10b981;
  box-shadow: 0 0 6px rgba(16, 185, 129, 0.6);
}

.cs-status-dot.is-offline {
  background-color: #94a3b8;
}

:global(.theme--dark) .cs-status-dot,
:global(.v-theme--dark) .cs-status-dot {
  border-color: #181e2a;
}

/* Dấu tích kích hoạt */
.cs-active-check {
  position: absolute;
  right: -2px;
  top: -2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #2563eb;
  border: 2px solid white;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3;
}

:global(.theme--dark) .cs-active-check,
:global(.v-theme--dark) .cs-active-check {
  background: #0284c7;
  border-color: #181e2a;
}

/* Vạch ngăn cách */
.cs-flyout-divider {
  width: 1px;
  height: 44px;
  background: linear-gradient(to bottom, transparent, rgba(203, 213, 225, 0.8), transparent);
  margin: 0 4px;
}

:global(.theme--dark) .cs-flyout-divider,
:global(.v-theme--dark) .cs-flyout-divider {
  background: linear-gradient(to bottom, transparent, rgba(255, 255, 255, 0.15), transparent);
}

/* Sales Dock */
.cs-sales-dock {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* Grid 2 hàng khi có trên 4 Sales */
.cs-sales-dock.is-grid-2 {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px 8px;
}

.cs-flyout-loading,
.cs-flyout-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 16px;
}

.cs-empty-text {
  font-size: 12px;
  color: #94a3b8;
  font-style: italic;
}
</style>
