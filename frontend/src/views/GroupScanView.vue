<!--
  Feature E1 — Quét nhóm & thành viên.
  4 màn (theo docs/quet-group/mockup.html):
   1. pick   — chọn nhóm (checkbox) + "Quét tất cả" + thanh hành động sticky
   2. scanning — poll trạng thái mỗi ~2s tới khi completed/partial/failed
   3. roster — bảng thành viên + chip isFriend + lọc Tất cả/Là bạn/Người lạ
   (partial = roster + cảnh báo "quét 1 phần")
-->
<template>
  <div class="d-flex flex-column h-100">
    <!-- Toolbar: account picker + back to groups -->
    <div class="d-flex align-center pa-4 pb-2 gap-3">
      <div>
        <div class="text-caption text-medium-emphasis">Nhóm Zalo / Quét thành viên</div>
        <h1 class="text-h5">Quét nhóm &amp; thành viên</h1>
      </div>
      <v-spacer />
      <v-select
        v-model="selectedAccountId"
        :items="accounts"
        item-title="displayName"
        item-value="id"
        label="Tài khoản"
        variant="outlined"
        density="compact"
        hide-details
        style="max-width: 240px"
        :loading="accountLoading"
        @update:model-value="onAccountChange"
      >
        <template #item="{ props: itemProps, item }">
          <v-list-item v-bind="itemProps">
            <template #append>
              <v-chip
                size="x-small"
                :color="acctOnline(item) ? 'success' : 'error'"
                variant="tonal"
              >
                {{ acctOnline(item) ? 'Online' : 'Offline' }}
              </v-chip>
            </template>
          </v-list-item>
        </template>
      </v-select>
    </div>

    <div class="flex-1-1 overflow-auto px-4 pb-4">
      <!-- ════════ STATE 1: PICK GROUPS ════════ -->
      <v-card v-if="phase === 'pick'" variant="outlined" class="d-flex flex-column">
        <div class="d-flex align-center gap-3 pa-4 border-b">
          <div>
            <div class="text-subtitle-1 font-weight-bold">Chọn nhóm để quét thành viên</div>
            <div class="text-caption text-medium-emphasis">
              Đang tham gia {{ groups.length }} nhóm · tick nhóm cần lấy danh sách thành viên
            </div>
          </div>
          <v-spacer />
          <v-btn
            variant="outlined"
            prepend-icon="mdi-flash"
            :disabled="!groups.length || scanLoading"
            :loading="scanLoading && startMode === 'all'"
            @click="startScan(true)"
          >
            Quét tất cả {{ groups.length }} nhóm
          </v-btn>
        </div>

        <!-- search + select-all -->
        <div class="d-flex align-center gap-3 pa-3 border-b flex-wrap">
          <v-text-field
            v-model="search"
            placeholder="Tìm nhóm..."
            prepend-inner-icon="mdi-magnify"
            variant="outlined"
            density="compact"
            hide-details
            style="max-width: 360px"
          />
          <v-spacer />
          <v-btn variant="text" prepend-icon="mdi-check-all" @click="toggleSelectAll">
            {{ allFilteredSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả' }}
          </v-btn>
        </div>

        <!-- group list with checkboxes -->
        <v-progress-linear v-if="loading" indeterminate color="primary" />
        <div v-if="!loading && !filteredGroups.length" class="pa-12 text-center text-medium-emphasis">
          <v-icon size="48" class="mb-3" color="primary">mdi-account-group-outline</v-icon>
          <div class="text-subtitle-1">Chưa có nhóm nào</div>
          <div class="text-body-2">Nick phải đang là thành viên của nhóm để quét.</div>
        </div>
        <v-list v-else lines="two" density="comfortable">
          <v-list-item
            v-for="g in filteredGroups"
            :key="g.id"
            @click="toggleGroup(g.id)"
          >
            <template #prepend>
              <v-checkbox-btn
                :model-value="selectedIds.has(g.id)"
                color="primary"
                @click.stop="toggleGroup(g.id)"
              />
              <v-avatar :color="avatarColor(g.id)" size="42" rounded="lg" class="ml-1 mr-3">
                <span class="text-white font-weight-bold">{{ initials(groupName(g)) }}</span>
              </v-avatar>
            </template>
            <v-list-item-title class="font-weight-medium">{{ groupName(g) }}</v-list-item-title>
            <v-list-item-subtitle class="d-flex align-center gap-2">
              <v-icon size="14">mdi-account-multiple</v-icon>
              <span>{{ g.totalMember ?? g.totalMembers ?? 0 }} thành viên</span>
              <v-chip v-if="isCommunity(g)" size="x-small" color="warning" variant="tonal">
                <v-icon start size="12">mdi-office-building</v-icon> Cộng đồng
              </v-chip>
            </v-list-item-subtitle>
          </v-list-item>
        </v-list>

        <!-- sticky action bar -->
        <div class="d-flex align-center gap-3 pa-3 border-t sticky-bar">
          <div class="text-body-2 font-weight-medium">
            Đã chọn <span class="text-primary font-weight-bold">{{ selectedIds.size }}</span> nhóm
            <span v-if="selectedIds.size" class="text-medium-emphasis">
              · ước tính <span class="text-primary">~{{ estimatedMembers.toLocaleString('vi') }}</span> thành viên
            </span>
          </div>
          <v-spacer />
          <v-btn variant="text" :disabled="!selectedIds.size" @click="selectedIds.clear()">Bỏ chọn</v-btn>
          <v-btn
            color="primary"
            prepend-icon="mdi-download"
            :disabled="!selectedIds.size || scanLoading"
            :loading="scanLoading && startMode === 'selected'"
            @click="startScan(false)"
          >
            Bắt đầu quét
          </v-btn>
        </div>
      </v-card>

      <!-- ════════ STATE 2: SCANNING ════════ -->
      <v-card v-else-if="phase === 'scanning'" variant="outlined">
        <div class="d-flex align-center gap-3 pa-4 border-b">
          <div>
            <div class="text-subtitle-1 font-weight-bold">Đang quét thành viên</div>
            <div class="text-caption text-medium-emphasis">
              Chạy nền — bạn có thể rời trang, quá trình không dừng
            </div>
          </div>
          <v-spacer />
          <v-btn variant="text" prepend-icon="mdi-arrow-left" @click="backToPick">Quét nhóm khác</v-btn>
        </div>

        <div class="pa-5">
          <div class="d-flex align-center gap-4 mb-4">
            <v-progress-circular indeterminate color="primary" size="38" width="3" />
            <div class="flex-1-1">
              <div class="font-weight-medium">Đang quét {{ scan?.scannedGroups ?? 0 }}/{{ scan?.totalGroups ?? 0 }} nhóm</div>
              <v-progress-linear
                :model-value="scanProgress"
                color="primary"
                height="8"
                rounded
                class="my-1"
              />
              <div class="text-caption text-medium-emphasis">
                Đã quét {{ scan?.scannedGroups ?? 0 }} / {{ scan?.totalGroups ?? 0 }} nhóm
              </div>
            </div>
            <div class="text-h6 text-primary font-weight-bold">{{ scanProgress }}%</div>
          </div>

          <div class="stat-grid">
            <v-card variant="tonal" color="surface-variant" class="pa-4">
              <div class="text-caption text-medium-emphasis d-flex align-center gap-1">
                <v-icon size="16">mdi-account-group</v-icon> Nhóm đã xong
              </div>
              <div class="text-h5 font-weight-bold mt-1">
                {{ scan?.scannedGroups ?? 0 }}
                <span class="text-body-2 text-medium-emphasis">/ {{ scan?.totalGroups ?? 0 }}</span>
              </div>
            </v-card>
            <v-card variant="tonal" color="surface-variant" class="pa-4">
              <div class="text-caption text-medium-emphasis d-flex align-center gap-1">
                <v-icon size="16">mdi-account</v-icon> Thành viên đã lưu
              </div>
              <div class="text-h5 font-weight-bold mt-1">{{ scan?.memberCount ?? 0 }}</div>
            </v-card>
            <v-card variant="tonal" color="surface-variant" class="pa-4">
              <div class="text-caption text-medium-emphasis d-flex align-center gap-1">
                <v-icon size="16">mdi-handshake</v-icon> Là bạn của nick
              </div>
              <div class="text-h5 font-weight-bold mt-1">
                {{ scan?.friendCount ?? '—' }}
              </div>
            </v-card>
          </div>

          <v-alert type="info" variant="tonal" density="compact" class="mt-4" icon="mdi-lock">
            Quét bị giới hạn tốc độ để bảo vệ nick — nhóm lớn có thể mất vài phút.
            Tiến độ được lưu, nếu mất kết nối sẽ quét tiếp từ chỗ dở.
          </v-alert>
        </div>
      </v-card>

      <!-- ════════ STATE 3 / 4: ROSTER (completed / partial) ════════ -->
      <v-card v-else-if="phase === 'roster'" variant="outlined">
        <div class="d-flex align-center gap-3 pa-4 border-b">
          <div>
            <div class="text-subtitle-1 font-weight-bold">Thành viên đã quét</div>
            <div class="text-caption text-medium-emphasis">
              {{ totalMembers }} thành viên · {{ friendCount }} là bạn của nick
            </div>
          </div>
          <v-spacer />
          <v-btn
            color="primary"
            variant="flat"
            prepend-icon="mdi-radar"
            :loading="batchInferring"
            :disabled="!filteredMembers.length || batchInferring"
            class="whitespace-nowrap mr-2"
            @click="startBatchRadarInference"
          >
            Suy luận Radar ({{ filteredMembers.length }})
          </v-btn>
          <v-btn variant="text" prepend-icon="mdi-refresh" @click="backToPick">Quét lại</v-btn>
        </div>

        <!-- partial warning (state 4) -->
        <v-alert
          v-if="scan?.state === 'partial'"
          type="warning"
          variant="tonal"
          class="ma-4 mb-0"
          icon="mdi-alert"
        >
          <b>Quét xong một phần.</b> Một số nhóm bị giới hạn do cộng đồng quá lớn.
          Bạn có thể quét lại để lấy nốt phần còn thiếu — phần đã lưu vẫn dùng được.
        </v-alert>
        <v-alert
          v-else-if="scan?.state === 'failed'"
          type="error"
          variant="tonal"
          class="ma-4 mb-0"
          icon="mdi-close-circle"
        >
          <b>Quét thất bại.</b> Vui lòng thử lại — phần thành viên đã lưu (nếu có) vẫn hiển thị bên dưới.
        </v-alert>

        <!-- search + filter segments -->
        <div class="d-flex align-center gap-3 pa-3 border-b flex-wrap">
          <v-text-field
            v-model="memberSearch"
            placeholder="Tìm thành viên..."
            prepend-inner-icon="mdi-magnify"
            variant="outlined"
            density="compact"
            hide-details
            style="max-width: 320px"
          />
          <v-spacer />
          <v-btn-toggle
            v-model="friendFilter"
            color="primary"
            density="comfortable"
            variant="outlined"
            divided
            mandatory
          >
            <v-btn value="all">Tất cả</v-btn>
            <v-btn value="friend">Là bạn</v-btn>
            <v-btn value="stranger">Người lạ</v-btn>
          </v-btn-toggle>
        </div>

        <v-alert type="info" variant="tonal" density="compact" class="ma-4 mb-0" icon="mdi-information">
          <b>Mẹo an toàn:</b> Người lạ chưa kết bạn — nhắn hàng loạt dễ bị khóa nick.
          Chiến dịch nên lọc <b>"Là bạn"</b> hoặc bật bước kết bạn trước.
        </v-alert>

        <v-data-table
          :headers="memberHeaders"
          :items="filteredMembers"
          :loading="scanMembersLoading"
          :search="memberSearch"
          item-value="id"
          density="comfortable"
          class="mt-2"
        >
          <template #item.member="{ item }">
            <div class="d-flex align-center gap-3 py-1">
              <v-avatar :image="item.avatarUrl || undefined" :color="avatarColor(item.id)" size="36">
                <span v-if="!item.avatarUrl" class="text-white font-weight-bold text-caption">
                  {{ initials(item.displayName || item.zaloName) }}
                </span>
              </v-avatar>
              <div>
                <div class="font-weight-medium">{{ item.displayName || item.zaloName || '—' }}</div>
                <div class="text-caption text-medium-emphasis">{{ item.zaloName || '—' }}</div>
              </div>
            </div>
          </template>
          <template #item.memberUid="{ item }">
            <span class="text-caption text-medium-emphasis">{{ item.memberUid }}</span>
          </template>
          <template #item.radarPersona="{ item }">
            <div v-if="(item as any).radar" class="d-flex align-center gap-1 py-1">
              <v-chip
                size="small"
                :color="getClusterVuetifyColor((item as any).radar.personaId)"
                variant="tonal"
                class="font-weight-medium whitespace-nowrap cursor-pointer"
                @click="openMemberRadarModal(item)"
              >
                <span class="mr-1">{{ getPersonaIcon((item as any).radar.personaId) }}</span>
                <span>{{ (item as any).radar.clusterBadge || (item as any).radar.label }}</span>
              </v-chip>

              <v-chip
                size="x-small"
                :color="(item as any).radar.confidenceTier === 'CONSOLIDATED' ? 'success' : 'warning'"
                variant="flat"
                class="whitespace-nowrap font-weight-bold tabular-nums"
              >
                {{ (item as any).radar.confidencePercentage }}&nbsp;%
              </v-chip>

              <v-btn
                icon="mdi-information-outline"
                variant="text"
                size="x-small"
                density="compact"
                color="medium-emphasis"
                title="Xem chi tiết suy luận CKG"
                @click="openMemberRadarModal(item)"
              />
            </div>
            <div v-else class="py-1">
              <v-btn
                size="x-small"
                variant="text"
                color="primary"
                prepend-icon="mdi-radar"
                class="whitespace-nowrap"
                :loading="singleInferringId === item.id"
                @click="inferSingleMember(item)"
              >
                Suy luận
              </v-btn>
            </div>
          </template>
          <template #item.isFriend="{ item }">
            <v-chip v-if="item.isFriend" size="small" color="success" variant="tonal">
              <v-icon start size="13">mdi-handshake</v-icon> Là bạn
            </v-chip>
            <v-chip v-else size="small" color="error" variant="tonal">
              <v-icon start size="13">mdi-account-off</v-icon> Người lạ
            </v-chip>
          </template>
          <template #item.isAdmin="{ item }">
            <v-chip v-if="item.isAdmin" size="small" color="primary" variant="tonal">Admin</v-chip>
            <span v-else class="text-medium-emphasis">—</span>
          </template>
          <template #item.harvestedAt="{ item }">
            <span class="text-medium-emphasis">{{ formatTime(item.harvestedAt) }}</span>
          </template>
        </v-data-table>
      </v-card>
    </div>

    <!-- snackbar -->
    <v-snackbar v-model="snack.show" :color="snack.color" timeout="3000" location="bottom end">
      {{ snack.message }}
    </v-snackbar>

    <!-- CKG Milestone 4: Group Member Radar Modal -->
    <GroupMemberRadarModal
      v-model="memberRadarModalOpen"
      :member="selectedRadarMember"
      :group-name="selectedGroupName"
      @create-contact="handleCreateContactFromModal"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue';
import { useSelectedAccount } from '@/composables/use-selected-account';
import { useGroups, type GroupScanMember } from '@/composables/use-groups';
import GroupMemberRadarModal, { type GroupMemberRadarData } from '@/components/radar/GroupMemberRadarModal.vue';
import { api } from '@/api';

const batchInferring = ref(false);
const singleInferringId = ref<string | null>(null);
const memberRadarModalOpen = ref(false);
const selectedRadarMember = ref<GroupMemberRadarData | null>(null);

const { accounts, selectedAccountId, selectAccount, loading: accountLoading } = useSelectedAccount();

// Online = ưu tiên liveStatus (pool sống), fallback status (DB) — khớp logic chuẩn
// app (NickGridCards / ZaloAccountsView). Dùng status DB đơn lẻ sai sau restart.
function acctOnline(item: any): boolean {
  const a = item?.raw ?? item;
  return String(a?.liveStatus || a?.status || '').toLowerCase() === 'connected';
}
const {
  groups, loading,
  scan, scanMembers, scanLoading, scanMembersLoading,
  fetchGroups, createScan, fetchScanStatus, fetchScanMembers,
} = useGroups();

type Phase = 'pick' | 'scanning' | 'roster';
const phase = ref<Phase>('pick');
const startMode = ref<'all' | 'selected' | null>(null);

const search = ref('');
const selectedIds = reactive(new Set<string>());

const memberSearch = ref('');
const friendFilter = ref<'all' | 'friend' | 'stranger'>('all');

const snack = reactive({ show: false, message: '', color: 'success' });
function notify(message: string, color = 'success') {
  snack.message = message;
  snack.color = color;
  snack.show = true;
}

let pollTimer: ReturnType<typeof setTimeout> | null = null;

/* ── group list helpers ── */
function groupName(g: any): string {
  return g.name || g.groupName || 'Nhóm không tên';
}
function isCommunity(g: any): boolean {
  return g.type === 'community' || g.isCommunity === true;
}
const filteredGroups = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return groups.value;
  return groups.value.filter((g) => groupName(g).toLowerCase().includes(q));
});
const allFilteredSelected = computed(
  () => filteredGroups.value.length > 0 && filteredGroups.value.every((g) => selectedIds.has(g.id)),
);
const estimatedMembers = computed(() =>
  groups.value
    .filter((g) => selectedIds.has(g.id))
    .reduce((sum, g) => sum + (g.totalMember ?? g.totalMembers ?? 0), 0),
);

function toggleGroup(id: string) {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
}
function toggleSelectAll() {
  if (allFilteredSelected.value) {
    filteredGroups.value.forEach((g) => selectedIds.delete(g.id));
  } else {
    filteredGroups.value.forEach((g) => selectedIds.add(g.id));
  }
}

/* ── avatar helpers (theme-independent, deterministic) ── */
const AVATAR_COLORS = ['#7c5cff', '#12b76a', '#f5a524', '#1786be', '#f04438', '#5bb8e5'];
function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function initials(name?: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function formatTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('vi', { hour: '2-digit', minute: '2-digit' });
}

/* ── scan flow ── */
async function startScan(all: boolean) {
  const acct = selectedAccountId.value;
  if (!acct) {
    notify('Chưa chọn tài khoản Zalo', 'error');
    return;
  }
  startMode.value = all ? 'all' : 'selected';
  const payload = all ? { all: true } : { groupIds: Array.from(selectedIds) };
  const created = await createScan(acct, payload);
  if (!created) {
    notify('Không bắt đầu được phiên quét', 'error');
    startMode.value = null;
    return;
  }
  phase.value = 'scanning';
  pollScan();
}

const POLL_MS = 2000;
async function pollScan() {
  const acct = selectedAccountId.value;
  const scanId = scan.value?.id;
  if (!acct || !scanId) return;
  const snapshot = await fetchScanStatus(acct, scanId);
  const state = snapshot?.state;
  if (state === 'completed' || state === 'partial' || state === 'failed') {
    await loadMembers();
    phase.value = 'roster';
    startMode.value = null;
    return;
  }
  // still pending/running → keep polling
  pollTimer = setTimeout(pollScan, POLL_MS);
}

async function loadMembers() {
  const acct = selectedAccountId.value;
  const scanId = scan.value?.id;
  if (!acct || !scanId) return;
  const opts =
    friendFilter.value === 'all'
      ? {}
      : { isFriend: friendFilter.value === 'friend' };
  await fetchScanMembers(acct, scanId, opts);
}

const selectedGroupName = computed(() => {
  const g = groups.value.find((group) => selectedIds.has(group.id));
  return g ? groupName(g) : undefined;
});

function getClusterVuetifyColor(id?: string): string {
  switch (String(id).toUpperCase()) {
    case 'FNB_WORKSHOP_STUDENT': return 'indigo';
    case 'FNB_SHOP_OWNER': return 'amber-darken-2';
    case 'WHOLESALE_DISTRIBUTOR': return 'purple';
    case 'HOME_CAFE_RETAIL': return 'teal';
    case 'TRIAL_EXPLORER': return 'blue-grey';
    default: return 'primary';
  }
}

function getPersonaIcon(id?: string): string {
  switch (String(id).toUpperCase()) {
    case 'FNB_WORKSHOP_STUDENT': return '🎓';
    case 'FNB_SHOP_OWNER': return '🧋';
    case 'WHOLESALE_DISTRIBUTOR': return '🏢';
    case 'HOME_CAFE_RETAIL': return '🏠';
    case 'TRIAL_EXPLORER': return '🎁';
    default: return '🎯';
  }
}

function inferMemberRadar(member: any): any {
  // Homophily inference based on member name and selected group names
  const combinedText = `${member.displayName || ''} ${member.zaloName || ''} ${selectedGroupName.value || ''}`.toLowerCase();
  let personaId = 'TRIAL_EXPLORER';
  let label = 'Khách mới chuộng mẫu thử 100g';
  let clusterBadge = 'Dùng thử';
  let confidencePercentage = 58;

  if (/workshop|học|pha chế|khóa học|chuyển giao|đào tạo|công thức/i.test(combinedText)) {
    personaId = 'FNB_WORKSHOP_STUDENT';
    label = 'Học viên Workshop & Khởi nghiệp F&B';
    clusterBadge = 'Học viên WS';
    confidencePercentage = 65;
  } else if (/quán|trà sữa|cafe|ăn vặt|topping|menu|cost/i.test(combinedText)) {
    personaId = 'FNB_SHOP_OWNER';
    label = 'Chủ quán Trà sữa / Cafe / Ăn vặt';
    clusterBadge = 'Chủ quán';
    confidencePercentage = 64;
  } else if (/sỉ|đại lý|npp|phân phối|buôn|pallet|thùng|tấn/i.test(combinedText)) {
    personaId = 'WHOLESALE_DISTRIBUTOR';
    label = 'Đại lý phân phối & Sỉ lớn';
    clusterBadge = 'Đại lý sỉ';
    confidencePercentage = 66;
  } else if (/làm bánh|tự pha|gia đình|tại nhà|uống ở nhà|yêu bếp/i.test(combinedText)) {
    personaId = 'HOME_CAFE_RETAIL';
    label = 'Khách tự pha tại nhà & Gia đình';
    clusterBadge = 'Pha tại nhà';
    confidencePercentage = 60;
  }

  return {
    personaId,
    label,
    clusterBadge,
    confidenceScore: confidencePercentage / 100,
    confidencePercentage,
    confidenceTier: 'PRELIMINARY',
    source: 'GROUP_HOMOPHILY',
    homophilyGroupName: selectedGroupName.value,
  };
}

async function startBatchRadarInference() {
  batchInferring.value = true;
  try {
    for (const member of scanMembers.value) {
      if (!(member as any).radar) {
        (member as any).radar = inferMemberRadar(member);
      }
    }
    notify(`Đã hoàn tất phân loại chân dung Radar cho ${scanMembers.value.length} thành viên!`, 'success');
  } finally {
    batchInferring.value = false;
  }
}

async function inferSingleMember(item: any) {
  singleInferringId.value = item.id;
  try {
    item.radar = inferMemberRadar(item);
    notify(`Đã suy luận chân dung cho ${item.displayName || 'thành viên'}`, 'success');
  } finally {
    singleInferringId.value = null;
  }
}

function openMemberRadarModal(item: any) {
  if (!item.radar) {
    item.radar = inferMemberRadar(item);
  }
  selectedRadarMember.value = item;
  memberRadarModalOpen.value = true;
}

async function handleCreateContactFromModal(memberData: GroupMemberRadarData) {
  try {
    await api.post('/contacts/quick-create', {
      fullName: memberData.displayName || memberData.zaloName || 'Thành viên Zalo',
      source: 'group_scan',
      tags: memberData.radar?.personaId ? [`auto:${memberData.radar.personaId.toLowerCase()}`] : undefined,
    });
    notify(`Đã tạo liên hệ CRM cho ${memberData.displayName || 'thành viên'}!`, 'success');
  } catch (err: any) {
    notify(err?.response?.data?.message || 'Không thể tạo liên hệ CRM', 'error');
  }
}

const memberHeaders = [
  { title: 'Thành viên', key: 'member', sortable: false },
  { title: 'Zalo UID', key: 'memberUid' },
  { title: 'Chân dung Radar', key: 'radarPersona', sortable: false },
  { title: 'Trạng thái', key: 'isFriend' },
  { title: 'Vai trò', key: 'isAdmin' },
  { title: 'Lưu lúc', key: 'harvestedAt', align: 'end' as const },
];

// Client-side fallback filter (backend already filters via isFriend param, but
// keeps the segment instant when toggling before the refetch resolves).
const filteredMembers = computed<GroupScanMember[]>(() => {
  if (friendFilter.value === 'all') return scanMembers.value;
  const want = friendFilter.value === 'friend';
  return scanMembers.value.filter((m) => m.isFriend === want);
});
const totalMembers = computed(() => scan.value?.memberCount ?? scanMembers.value.length);
const friendCount = computed(
  () => scan.value?.friendCount ?? scanMembers.value.filter((m) => m.isFriend).length,
);
const scanProgress = computed(() => {
  const total = scan.value?.totalGroups ?? 0;
  if (!total) return 0;
  return Math.round(((scan.value?.scannedGroups ?? 0) / total) * 100);
});

function stopPolling() {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}
function backToPick() {
  stopPolling();
  phase.value = 'pick';
  scan.value = null;
  scanMembers.value = [];
  selectedIds.clear();
  friendFilter.value = 'all';
}

async function onAccountChange(id: string) {
  selectAccount(id);
  backToPick();
  if (id) await fetchGroups(id);
}

onMounted(() => {
  if (selectedAccountId.value) fetchGroups(selectedAccountId.value);
});
onBeforeUnmount(stopPolling);
</script>

<style scoped>
.gap-1 { gap: 4px; }
.gap-2 { gap: 8px; }
.gap-3 { gap: 12px; }
.gap-4 { gap: 16px; }
.border-b { border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); }
.border-t { border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); }
.sticky-bar {
  position: sticky;
  bottom: 0;
  background: rgb(var(--v-theme-surface));
  z-index: 1;
}
.stat-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
@media (max-width: 760px) {
  .stat-grid { grid-template-columns: 1fr; }
}
</style>
