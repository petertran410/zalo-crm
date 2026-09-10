<template>
  <MobileChatView v-if="isMobile" />
  <div v-else class="cs-chat-wrapper">
    <div class="smax-chat-grid" :style="gridStyle">
      <!-- COL 1: conversation list — FilterBar render INSIDE via named slot -->
      <div class="smax-conv-col">
        <!-- Compact Delegated Pill when in Delegated Mode -->
        <div v-if="csWorkspace.isDelegatedMode" class="cs-delegated-chip">
          <div class="cs-delegated-chip-left">
            <span class="cs-dot-live" />
            <span class="cs-label">Trực thay:</span>
            <strong class="cs-sales-name">{{ csWorkspace.activeSalesTarget?.fullName }}</strong>
          </div>
          <div class="cs-delegated-chip-actions">
            <button class="cs-btn-exit" @click="exitDelegatedMode" title="Thoát trực thay, về hộp thư CSKH">
              <v-icon size="13">mdi-close-circle-outline</v-icon>
              <span>Về CSKH của tôi</span>
            </button>
            <button class="cs-btn-back" @click="returnToCsHome" title="Đổi Sales / Về Trang Chủ">
              <v-icon size="13">mdi-arrow-left</v-icon>
              <span>Đổi Sales</span>
            </button>
          </div>
        </div>

        <!-- FIX socket-chết v2 — báo mất kết nối realtime, KHÔNG để chết âm thầm (bỏ lỡ khách) -->
        <div v-if="realtimeOffline" class="realtime-offline-banner">
          <span class="dot" />
          Mất kết nối realtime — đang thử kết nối lại...
        </div>
        <!-- work-scope 2026-06-15 — 1 DÒNG tóm tắt "N tin ở M nick khác" -->
        <button
          v-if="outOfScopeTotal > 0"
          class="out-of-scope-bar"
          :title="`Có ${outOfScopeTotal} tin ở ${outOfScopeNickCount} nick khác — bấm để xem tất cả`"
          @click="onShowAllOutOfScope"
        >
          <v-icon size="16" class="oos-icon">mdi-bell-outline</v-icon>
          <span class="oos-text">{{ outOfScopeTotal }} tin ở {{ outOfScopeNickCount }} nick khác</span>
        </button>
        <ConversationList
          :conversations="conversations"
          :selected-id="selectedConvId"
          :loading="loadingConvs"
          :accounts="accountList"
          :selected-account-ids="selectedAccountIds"
          :active-tab-key="inboxFilters.state.activeTab"
          :auto-compose-phone="autoComposePhone"
          :following-pairs="followingPairs"
          :filter-collapsed="filterCollapsed"
          v-model:search="searchQuery"
          @select="onSelectConv"
          @filter-account="onFilterAccount"
          @update:filters="onFiltersUpdate"
          @conversation-moved="onConversationMoved"
          @conversation-deleted="onConversationDeleted"
          @compose-opened="onComposeOpened"
          @follow-changed="onFollowChanged"
        >
          <template #filters>
            <ConversationFilterBar
              :filters="inboxFilters"
              :total-count="conversations.length"
              :counts="conversationCounts"
              :priority-has-unread="priorityHasUnread"
              :collapsed="filterCollapsed"
              @reselect-tab="onReselectActiveTab"
              @update:collapsed="filterCollapsed = $event"
            />
          </template>
        </ConversationList>
      </div>

      <!-- Resizer giữa Cột 1 và Cột 2 -->
      <div
        class="sl-resizer"
        :class="{ 'is-active': isResizingConv }"
        title="Kéo thả điều chỉnh chiều rộng danh sách hội thoại"
        @mousedown="startResizeConv"
      />

      <!-- COL 2: message thread (handles header/messages/input bên trong) -->
      <MessageThread
        :conversation="selectedConv"
        :messages="messages"
        :loading="loadingMsgs"
        :sending="sendingMsg"
        :all-conversations="conversations"
        :replying-to="replyingTo"
        :editing-message="editingMessage"
        :typing-users="currentTypers"
        :show-contact-panel="showContactPanel"
        :delegated-operator-info="delegatedOperatorInfo"
        class="smax-msg-col"
        @send="sendMessage"
        @open-media-tab="onOpenMediaTab"
        @toggle-contact-panel="showContactPanel = !showContactPanel"
        @add-reaction="onAddReaction"
        @remove-reaction="onRemoveReaction"
        @delete-message="onDeleteMessage"
        @undo-message="onUndoMessage"
        @edit-message="onEditMessage"
        @forward-message="onForwardMessage"
        @set-reply-to="setReplyTo"
        @set-editing="setEditing"
        @cancel-reply-edit="onCancelReplyEdit"
        @typing="onTyping"
        @refresh-thread="selectedConvId && fetchMessages(selectedConvId)"
        @switch-conversation="onSwitchToNickConv"
        @profile-synced="patchContactProfile"
        @exit-delegated="exitDelegatedMode"
      />

      <!-- Resizer giữa Cột 2 và Cột 3 -->
      <div
        v-if="showContactPanel && selectedConv?.contact"
        class="sl-resizer"
        :class="{ 'is-active': isResizingInfo }"
        title="Kéo thả điều chỉnh chiều rộng thông tin 360"
        @mousedown="startResizeInfo"
      />

      <!-- Folder management modal (overlay) -->
      <FolderManagePopup
        v-model="showFolderManagePopup"
        :filters="inboxFilters"
        :all-accounts-count="zaloAccounts?.length || 0"
        :account-statuses="accountStatuses"
        :total-unread="totalUnreadCount"
        :current-account-id="accountFilter"
        @view-applied="onFolderViewApplied"
      />

      <!-- COL 3: contact info panel (chỉ hiện khi có contact) -->
      <ChatContactPanel
        v-if="showContactPanel && selectedConv?.contact"
        ref="contactPanelRef"
        :contact-id="selectedConv.contact.id"
        :contact="selectedConv.contact"
        :friendship="selectedConv.friendship ?? null"
        :active-zalo-account-id="selectedConv.zaloAccount?.id ?? null"
        :friend-id="selectedConv.friendship?.id ?? null"
        :conversation-id="selectedConv.id ?? null"
        :active-zalo-account-name="selectedConv.zaloAccount?.displayName ?? null"
        :current-role="currentRole"
        class="smax-info-col"
        @close="showContactPanel = false"
        @saved="fetchConversations()"
        @status-changed="onPanelStatusChanged"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onActivated, onUnmounted, watch, nextTick, provide } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/api/index';
import { useToast } from '@/composables/use-toast';
import ConversationList from '@/components/chat/ConversationList.vue';
import MessageThread from '@/components/chat/MessageThread.vue';
import ChatContactPanel from '@/components/chat/ChatContactPanel.vue';
import ConversationFilterBar from '@/components/chat/ConversationFilterBar.vue';
import FolderManagePopup from '@/components/chat/FolderManagePopup.vue';
import { useChat } from '@/composables/use-chat';
import { useInboxFilters } from '@/composables/use-inbox-filters';
import { useAuthStore } from '@/stores/auth';
import { useCsWorkspaceStore } from '@/stores/use-cs-workspace';
import { usePrivacyStore } from '@/stores/privacy';
import { useChatOperations } from '@/composables/use-chat-operations';
import { useZaloAccounts } from '@/composables/use-zalo-accounts';
import { useWorkScope } from '@/composables/use-work-scope';
import { shouldAdoptNickScope } from '@/composables/work-scope-logic';
import MobileChatView from '@/views/MobileChatView.vue';
import { useMobile } from '@/composables/use-mobile';

const { isMobile } = useMobile();
const route = useRoute();
const router = useRouter();
const csWorkspace = useCsWorkspaceStore();

const delegatedOperatorInfo = computed(() => {
  if (!csWorkspace.isDelegatedMode || !csWorkspace.activeSalesTarget) return null;
  return {
    salesName: csWorkspace.activeSalesTarget.fullName,
    nickName: selectedConv.value?.zaloAccount?.displayName || undefined,
  };
});

const {
  conversations, selectedConvId, selectedConv, messages,
  loadingConvs, loadingMsgs, sendingMsg, searchQuery, accountFilter, extraFilters,
  fetchConversations, fetchMessages, selectConversation, sendMessage,
  initSocket, destroySocket, getSocket,
  typingConvIds, realtimeOffline,
  outOfScopeCounts, clearOutOfScopeBadge,
  patchContactProfile,
} = useChat();

// ── Mini Chat Context: provide chat state xuống VisualOrderModal.MiniChatPanel
provide('miniChat', {
  conversation: selectedConv,
  messages,
  sendMessage,
  sendingMsg,
});

const {
  typingUsers, replyingTo, editingMessage,
  addReaction, removeReaction, sendTypingEvent, deleteMessage, undoMessage,
  editMessage, forwardMessage,
  setReplyTo, clearReplyTo, setEditing, clearEditing,
  registerSocketListeners,
} = useChatOperations();

// ════════ Auth (cần để compute isOwnedByMe fallback cho accountList) ════════
const authStore = useAuthStore();



const currentRole = ref<string>('cs');
watch(currentRole, (val) => {
  if (val === 'manager') {
    router.push({ name: 'Chat', params: route.params });
  } else if (val === 'sales') {
    router.push({ name: 'SalesChat', params: route.params });
  }
});

// ════════ Zalo accounts (for FilterRail nick picker) ════════
const { accounts: zaloAccounts, fetchAccounts: fetchZaloAccounts } = useZaloAccounts();
// work-scope (nguồn chân lý mới; accountFilter là facade bắc qua nó). Dùng validateAgainst
// để lọc scope đã lưu chỉ còn nick CÓ QUYỀN — bảo mật, Anh nhấn mạnh 2026-06-15.
const workScope = useWorkScope();
// FIX 2026-06-23 (anh báo: chỉ mở 1 nick mà bộ tag cột 2 vẫn load ALL): selectedAccountIds
// truyền xuống ConversationList để fetch /conversations/sidebar-tags theo PHẠM VI XEM.
// TRƯỚC ĐÂY là ref CHẾT luôn [] (không gán bao giờ) → FE gửi accountIds rỗng → BE trả tag
// của MỌI nick. Nối thẳng vào workScope.accountIds (nguồn chân lý PHẠM VI XEM): mở 1 nick →
// chỉ tag nick đó; rỗng = tất cả nick có quyền (đúng thiết kế). Reactive → đổi nick tự refetch.
const selectedAccountIds = computed(() => workScope.accountIds.value);

// 2026-06-09 (anh chốt) — NHỚ "Phạm vi xem" qua reload/tắt-mở tab. Lưu {folderId, accountId}
// vào localStorage. Khôi phục lúc mount SAU khi fetchZaloAccounts (để validate quyền):
// accountId đã lưu phải còn nằm trong danh sách nick accessible (zaloAccounts đã qua
// getZaloScope ở BE) — nếu không còn quyền/nick bị gỡ thì BỎ, về ALL (tuân thủ scope nghiêm ngặt).
const SCOPE_KEY = 'chat.scope.v1';
function saveScope(folderId: string | null, accountId: string | null) {
  try {
    // CSKH không dùng folder filter -> luôn lưu folderId = null để không bị kẹt bộ lọc folder
    localStorage.setItem(SCOPE_KEY, JSON.stringify({ folderId: null, accountId }));
  } catch { /* localStorage đầy/chặn → bỏ qua */ }
}
function loadScopeRaw(): { folderId: string | null; accountId: string | null } {
  try {
    const r = JSON.parse(localStorage.getItem(SCOPE_KEY) || '{}');
    return { folderId: r.folderId ?? null, accountId: r.accountId ?? null };
  } catch { return { folderId: null, accountId: null }; }
}
// Áp scope đã lưu vào state, CÓ validate quyền nick.
// work-scope migration 2026-06-15: NICK giờ do workScope quản (seed từ chat.workscope.v2).
// validateAgainst bỏ nick MẤT QUYỀN (bảo mật — KHÔNG vượt quyền server getZaloScope cấp).
// CSKH view: không dùng folder sidebar -> luôn ép inboxFilters.setFolder(null) và xóa folderId cũ khỏi localStorage.
function restoreScope() {
  const accessibleIds = (zaloAccounts.value || []).map(a => a.id);
  workScope.validateAgainst(accessibleIds); // lọc scope đã lưu chỉ còn nick có quyền
  inboxFilters.setFolder(null);
  const saved = loadScopeRaw();
  if (saved.folderId) {
    saveScope(null, saved.accountId);
  }
}
// work-scope 2026-06-15 — tóm tắt "N tin ở M nick khác" (anh chốt: 1 dòng, không liệt kê).
// CHỈ đếm nick CÓ QUYỀN (join zaloAccounts đã qua getZaloScope) — bảo mật, không lộ/đếm
// nick ngoài quyền.
const outOfScopeAccessible = computed(() => {
  const out: Array<{ id: string; count: number }> = [];
  for (const [id, count] of outOfScopeCounts.value) {
    const acc = (zaloAccounts.value || []).find(a => a.id === id);
    if (!acc) continue; // nick ngoài quyền/đã gỡ → KHÔNG đếm (bảo mật)
    out.push({ id, count });
  }
  return out;
});
const outOfScopeTotal = computed(() => outOfScopeAccessible.value.reduce((s, b) => s + b.count, 0));
const outOfScopeNickCount = computed(() => outOfScopeAccessible.value.length);
// Bấm dòng → về "Toàn bộ" (scope rỗng = tất cả nick có quyền) + reload (anh chốt).
function onShowAllOutOfScope() {
  for (const b of outOfScopeAccessible.value) clearOutOfScopeBadge(b.id);
  workScope.setScope([]); // [] = TẤT CẢ nick có quyền
  window.location.reload();
}

// Theo dõi (anh chốt 2026-06-15) — Set "contactId|nickId" đang theo dõi → ConversationList
// hiện chuông sau tên. Fetch 1 lần lúc mount; cập nhật ngay khi toggle follow ở menu.
const followingPairs = ref<Set<string>>(new Set());
async function fetchFollowingPairs() {
  try {
    const res = await api.get<{ pairs: Array<{ contactId: string; nickId: string; externalThreadId?: string | null }> }>(
      '/automation/care-sessions/listening-pairs',
    );
    // 2026-06-21 dual-key: khớp chuông theo THREAD Zalo (nick+externalThreadId) — chính xác kể cả
    // khi hội thoại trỏ hồ sơ trùng KHÁC với phiên (~29 ca mất chuông). GIỮ khóa contactId làm
    // fallback cho phiên thread-NULL + tương thích. Prefix 'c|'/'t|' để 2 loại khóa không đụng nhau.
    const next = new Set<string>();
    for (const p of res.data.pairs ?? []) {
      // Phiên CÓ thread → CHỈ khóa 't|' (khớp đúng 1 hội thoại theo thread Zalo, KHÔNG lan sang
      // hội thoại khác cùng contact+nick nhưng khác thread). Phiên thread-NULL → khóa 'c|'
      // (wildcard theo contact, giữ hành vi cũ cho phiên không có Friend row). Loại trừ nhau.
      if (p.externalThreadId) next.add(`t|${p.nickId}|${p.externalThreadId}`);
      else next.add(`c|${p.nickId}|${p.contactId}`);
    }
    followingPairs.value = next;
  } catch (err) {
    console.error('[follow] fetch listening-pairs failed', err);
  }
}
function onFollowChanged(_contactId: string, _nickId: string, _following: boolean) {
  // Refetch authoritative: toggle (ConversationList.toggleFollowFromMenu) đã AWAIT API tạo/đóng
  // phiên XONG mới emit → fetch lại ra đúng trạng thái. Tránh lệch khóa c|/t| khi UN-follow
  // (optimistic không biết threadId của phiên nên không xoá được khóa 't|' → chuông treo). 1 GET nhẹ.
  void fetchFollowingPairs();
}

const currentAccount = computed(() => {
  if (!accountFilter.value) return null;
  return zaloAccounts.value.find(a => a.id === accountFilter.value) || null;
});
const accountList = computed(() =>
  (zaloAccounts.value || []).map(a => ({
    id: a.id,
    displayName: a.displayName,
    avatarUrl: a.avatarUrl ?? null,
    ownerUserId: a.ownerUserId,
    privacyMode: (a as any).privacyMode ?? 'sub',
    isOwnedByMe: (a as any).isOwnedByMe ?? (a.ownerUserId === authStore.user?.id),
    owner: (a as any).owner ?? null,
    zaloUid: (a as any).zaloUid ?? null,
  })),
);
// 2026-06-11: trạng thái LIVE từng nick (liveStatus pool → fallback DB status) cho sidebar
// đếm online/offline + chấm màu thay vì chỉ tổng "N nick".
const accountStatuses = computed(() =>
  (zaloAccounts.value || []).map(a => ({
    id: a.id,
    online: (((a as any).liveStatus || a.status) === 'connected'),
  })),
);

// ════════ Phase 6+ Inbox Triage Filters ════════
const inboxFilters = useInboxFilters();
const workspaceName = computed(() => authStore.user?.fullName?.split(' ')[0] || 'CRM');
const currentUserName = computed(() => authStore.user?.fullName || 'Tôi');
const currentUserId = computed(() => authStore.user?.id || '');
const showFolderManagePopup = ref(false);

const totalUnreadCount = computed(() =>
  conversations.value.reduce((sum, c) => sum + ((c as any).unreadCount || 0), 0)
);

// 2026-06-11 — tab "Ưu tiên" (tab=other) KHÔNG hiện số nhưng IN ĐẬM khi còn hội
// thoại chưa đọc. Lấy từ backend (otherUnread) vì khi đang ở tab khác, list cột 2
// không chứa conv tab Ưu tiên. Refresh khi mount / sau move / sau delete.
const priorityUnreadCount = ref(0);
const priorityHasUnread = computed(() => priorityUnreadCount.value > 0);
async function fetchPriorityUnread() {
  try {
    const params: Record<string, string> = {};
    if (accountFilter.value) params.accountId = accountFilter.value;
    const res = await api.get('/conversations/counts', { params });
    priorityUnreadCount.value = res.data?.otherUnread ?? 0;
  } catch {
    /* non-critical badge */
  }
}
// 2026-06-12 (anh báo đơ) — DEBOUNCE: refreshPriorityUnread gọi network /conversations/counts
// (endpoint nặng với admin: 4 count org-wide). Trước đây fire mỗi lần mở conv (route watch +
// click) + mỗi socket → triage nhanh 5-10 conv = 5-10 lần gọi /counts thừa. Gộp burst lại,
// trailing 400ms — badge "Ưu tiên" vẫn cập nhật sau khi ngừng chuyển ~0.4s (chấp nhận được
// cho 1 badge), giảm tải backend đúng phần GROUP 2 cũng lo.
let priorityUnreadTimer: ReturnType<typeof setTimeout> | null = null;
function refreshPriorityUnread() {
  if (priorityUnreadTimer) clearTimeout(priorityUnreadTimer);
  priorityUnreadTimer = setTimeout(() => { void fetchPriorityUnread(); }, 400);
}

// 2026-06-12 (anh báo đơ khi 50 nick gửi tin) — gộp 6 lần .filter() (6 vòng duyệt
// cả list) thành 1 VÒNG LẶP duy nhất. Computed này re-tính mỗi khi conversations.value
// đổi (mỗi tin socket đến của bất kỳ nick nào trong 50 nick) → trước đây 6×100 = 600 phép
// duyệt/lần, giờ còn 100. Badge vẫn cập nhật tức thì trong cùng tick (không debounce →
// không lag con số "Chưa rep" mà sale dựa vào).
const conversationCounts = computed(() => {
  let unread = 0, unanswered = 0, stuck = 0, ready = 0, individual = 0, group = 0;
  for (const c of conversations.value) {
    const cc = c as any;
    if ((cc.unreadCount || 0) > 0) unread++;
    if (cc.isReplied === false) unanswered++;
    if (cc.friendship?.stuckSince != null) stuck++;
    if ((cc.contact?.leadScore || 0) >= 80) ready++;
    if (c.threadType === 'user') individual++;
    else if (c.threadType === 'group') group++;
  }
  return { unread, unanswered, stuck, ready, individual, group };
});

// Apply inbox filter state → extraFilters → refetch.
// Sync ngay extraFilters trên mount để first fetch dùng đúng default tab
// (Cá nhân → threadType=user) thay vì load tất cả conv.
inboxFilters.setFolder(null);
extraFilters.value = inboxFilters.buildQueryParams();

let filterApplyTimer: ReturnType<typeof setTimeout> | null = null;
// M-tier follow-up (2026-05-21) — tách activeTab khỏi debounce.
// Tab click cần FEEDBACK NGAY (cache hit paint instant), 150ms debounce làm user
// cảm giác lag 280-420ms thay vì <100ms. Filter khác (tags/pills) vẫn debounce
// để tránh refetch khi user gõ nhiều ký tự.
watch(
  () => inboxFilters.state.activeTab,
  () => {
    if (filterApplyTimer) clearTimeout(filterApplyTimer);
    // 2026-06-12 — đổi tab (Cá nhân/Nhóm/Chính/Ưu tiên) thì XÓA ô tìm kiếm (anh báo:
    // search dính mãi). Clear trước khi fetch để list tab mới không còn lọc theo từ
    // khóa cũ. Chỉ clear khi đang có search → tránh đổi tab thường bị double-fetch.
    if (searchQuery.value) searchQuery.value = '';
    const params = inboxFilters.buildQueryParams();
    extraFilters.value = params;
    fetchConversations();
    // Bộ lọc link với nhau: số đếm folder cột 1 lọc theo cùng tab (anh chốt).
    void inboxFilters.fetchFolders();
  },
);

// 2026-06-20 (anh báo): click LẠI chính tab đang active (activeTab không đổi → watch trên
// không fire) cũng phải XÓA ô tìm kiếm. ConversationFilterBar emit 'reselect-tab' khi đó.
function onReselectActiveTab() {
  if (searchQuery.value) searchQuery.value = ''; // watch(searchQuery) tự refetch
}
watch(
  () => [
    inboxFilters.state.folderId,
    inboxFilters.state.saleAssigneeId,
    Array.from(inboxFilters.state.quickPills).join(','),
    inboxFilters.state.tagsZalo.join(','),
    inboxFilters.state.tagsCrm.join(','),
    inboxFilters.state.sortMode,
    inboxFilters.state.timeAxis,
    inboxFilters.state.timeRangePreset,
    // 2026-06-08 — Tier-1 deep CRM filter (cột 1 sidebar). Trước đây các field này
    // KHÔNG nằm trong watch → bấm nút sáng nhưng list không refetch ("nút chết").
    inboxFilters.state.autoTags.join(','),
    inboxFilters.state.scoreMin,
    inboxFilters.state.scoreMax,
    inboxFilters.state.scoreTier,
    inboxFilters.state.stages.join(','),
    inboxFilters.state.stuckDuration,
    inboxFilters.state.lastMessageWithin,
    inboxFilters.state.customerWaitingReply,
    inboxFilters.state.saleWaitingReply,
    inboxFilters.state.birthdayWithin7d,
    inboxFilters.state.appointmentWithin24h,
    inboxFilters.state.appointmentOverdue,
    inboxFilters.state.engagementPatterns.join(','),
    inboxFilters.state.messageReplyState,
  ],
  () => {
    if (filterApplyTimer) clearTimeout(filterApplyTimer);
    filterApplyTimer = setTimeout(() => {
      const params = inboxFilters.buildQueryParams();
      extraFilters.value = params;
      fetchConversations();
    }, 150);
  },
  { deep: true }
);

// Anh chốt 2026-05-22: khi privacy state đổi (lock/unlock) → refetch conversation
// list + messages thread đang mở. Server sẽ trả msg.redacted + conv.redacted
// theo state mới → bubble blur cập nhật đúng cả cột 2 + cột 3 ngay lập tức
// (không phải F5 mới apply). Skip lần đầu mount.
const _privacyStore = usePrivacyStore();
watch(
  () => _privacyStore.isUnlocked,
  () => {
    fetchConversations();
    if (selectedConvId.value) fetchMessages(selectedConvId.value);
  },
);

// ════════ Existing handlers ════════
// currentTypers: sale collab typing (typingUsers từ presence) + KH typing
// (typingConvIds từ Wave 1 zalo:typing socket). KH hiện thành "KH" hoặc tên contact.
// Loại bỏ CHÍNH user đang đăng nhập khỏi list — user tự biết mình đang gõ, không
// cần hiện "thanhpc@x đang nhập" cho chính họ thấy. Anh chốt 2026-05-22.
const currentTypers = computed(() => {
  const myId = currentUserId.value;
  const internalAll = (selectedConvId.value ? typingUsers.value.get(selectedConvId.value) : null) || [];
  const internal = myId ? internalAll.filter(u => u.userId !== myId) : internalAll;
  if (!selectedConvId.value || !typingConvIds.value.has(selectedConvId.value)) {
    return internal;
  }
  const conv = selectedConv.value;
  const customerName = conv?.contact?.fullName || (conv?.threadType === 'group' ? 'Thành viên' : 'Khách hàng');
  return [
    { userId: '__customer__', userName: customerName },
    ...internal,
  ];
});

async function onAddReaction(msgId: string, reaction: string) {
  if (!selectedConvId.value) return;
  await addReaction(selectedConvId.value, msgId, reaction);
}
async function onRemoveReaction(msgId: string, reaction: string) {
  if (!selectedConvId.value) return;
  await removeReaction(selectedConvId.value, msgId, reaction);
}
const toast = useToast();

async function onDeleteMessage(msgId: string) {
  if (!selectedConvId.value) return;
  await deleteMessage(selectedConvId.value, msgId);
}
async function onUndoMessage(msgId: string) {
  if (!selectedConvId.value) return;
  try {
    await undoMessage(selectedConvId.value, msgId);
    toast.success('Đã thu hồi tin nhắn');
    await fetchMessages(selectedConvId.value);
  } catch (err: any) {
    toast.error(err?.response?.data?.error || 'Không thu hồi được tin');
  }
}
async function onEditMessage(msgId: string, content: string) {
  if (!selectedConvId.value) return;
  try {
    await editMessage(selectedConvId.value, msgId, content);
    toast.warning('Đã sửa trên CRM — KH ở Zalo vẫn thấy bản gốc');
    clearEditing();
    await fetchMessages(selectedConvId.value);
  } catch (err: any) {
    toast.error(err?.response?.data?.error || 'Không sửa được tin');
  }
}
async function onForwardMessage(msgId: string, targetIds: string[]) {
  if (!selectedConvId.value) return;
  try {
    await forwardMessage(selectedConvId.value, msgId, targetIds);
    toast.success(`Đã chuyển tiếp tới ${targetIds.length} hội thoại`);
  } catch (err: any) {
    toast.error(err?.response?.data?.error || 'Không chuyển tiếp được');
  }
}
function onCancelReplyEdit() {
  clearReplyTo();
  clearEditing();
}
function onTyping() {
  if (selectedConvId.value) sendTypingEvent(selectedConvId.value);
}
function onFilterAccount(id: string | null) {
  accountFilter.value = id;
  saveScope(null, id); // CSKH không lưu folderId
  fetchConversations();
}
function onFolderViewApplied(payload: { folderId: string | null; accountId: string | null }) {
  inboxFilters.setFolder(null);
  accountFilter.value = payload.accountId;
  saveScope(null, payload.accountId);
  fetchConversations();
}
function onFiltersUpdate(params: Record<string, string>) {
  extraFilters.value = { ...extraFilters.value, ...params };
  fetchConversations();
}
function onConversationMoved(_id: string, _tab: string) {
  // bypassCache: conv vừa move qua tab khác → cache cũ sẽ flicker conv tại tab cũ
  fetchConversations({ bypassCache: true });
  // Move có thể đẩy conv chưa đọc vào/ra tab Ưu tiên → cập nhật badge đậm.
  void refreshPriorityUnread();
}

// Xóa mềm hội thoại từ cột 2: gỡ optimistic khỏi list, rời conv nếu đang mở,
// rồi refetch (bypassCache để khỏi flicker conv đã ẩn) + cập nhật badge Ưu tiên.
function onConversationDeleted(id: string) {
  const idx = conversations.value.findIndex((c) => c.id === id);
  if (idx !== -1) conversations.value.splice(idx, 1);
  if (selectedConvId.value === id) {
    router.push({ name: 'CsChat' }).catch(() => {});
  }
  fetchConversations({ bypassCache: true });
  void refreshPriorityUnread();
}

// Khi user tạo conv mới từ "Tin nhắn mới" dialog → refresh list + nav vào conv đó.
async function onComposeOpened(conversationId: string) {
  await fetchConversations();
  router.push({ name: 'CsChat', params: { convId: conversationId } });
}

// Sprint v3 Tuần 3 Row 6.9 (2026-06-03): sale switch nick trong header chat.
// Conv mới có thể chưa nằm trong list 100 → refresh trước khi push.
async function onSwitchToNickConv(convId: string) {
  // Nếu conv chưa nằm trong list (KH chưa từng chat qua nick mới) → refresh để list có
  if (!conversations.value.find(c => c.id === convId)) {
    await fetchConversations();
  }
  router.push({ name: 'CsChat', params: { convId } });
}

// Auto-show panel khi chọn conv có contact
const showContactPanel = ref(true);

// 2026-06-12 (anh chốt): nút "Chèn từ kho" ở composer cột 3 → mở cột 4 sang tab Media.
// Panel render bằng v-if nên nếu đang ẩn phải bật + chờ nextTick rồi mới gọi setMainTab.
const contactPanelRef = ref<{ setMainTab: (t: 'profile' | 'media' | 'ai' | 'followup') => void } | null>(null);
async function onOpenMediaTab() {
  if (!showContactPanel.value) {
    showContactPanel.value = true;
    await nextTick();
  }
  contactPanelRef.value?.setMainTab('media');
}

// ════════ URL routing: /cs-chat/:convId — deep-link hội thoại ════════
/** Khi user click 1 conv → push URL /cs-chat/:id (watcher bên dưới sẽ trigger selectConversation) */
function onSelectConv(convId: string) {
  if (route.params.convId === convId) {
    // Click lại conv đang mở → vẫn refresh messages
    // 2026-06-12 — sau khi đọc (mark-read), refresh badge "Ưu tiên" để chấm đỏ/đậm
    // tắt khi đã đọc hết. selectConversation async (mark-read bên trong) → chờ xong.
    void selectConversation(convId).then(() => refreshPriorityUnread());
    return;
  }
  router.push({ name: 'CsChat', params: { convId } });
}

// Watch route → select conv khi convId thay đổi (deep-link, back/forward, mới click)
// work-scope 2026-06-15 — FIX BUG NHẢY NICK: nếu hội thoại mở thuộc nick NGOÀI scope
// (vd từ Friend bấm chat khách nick B trong khi đang khóa nick A) → đặt scope = nick B
// rồi RELOAD trang (Anh chốt: state sạch). Nick TRONG scope → luồng tự thông (không reload).
// Đặt adopt-scope Ở ĐÂY (watcher), KHÔNG trong selectConversation (selectConversation có
// nhiều caller: onSelectConv/onLabelsSynced/onSwitchToNickConv — tránh adopt nhầm). Eng-review.
watch(
  () => route.params.convId,
  (id) => {
    if (typeof id === 'string' && id && id !== selectedConvId.value) {
      void selectConversation(id).then(() => {
        // Sau resolve: selectedConv đã có (từ list HOẶC selectedConvDetail). Đọc nick của nó.
        const convNick = (selectedConv.value as any)?.zaloAccount?.id as string | undefined;
        if (shouldAdoptNickScope(workScope.accountIds.value, convNick) && convNick) {
          // setScope idempotent (đã check shouldAdopt → chắc chắn đổi). Persist localStorage
          // rồi reload → restoreScope nạp scope mới → cột 2 + cột 3 đều đúng nick B (hết split-brain).
          workScope.setScope([convNick]);
          window.location.reload();
          return;
        }
        refreshPriorityUnread();
      });
    }
  },
  { immediate: false },
);

// Phase 2026-05-30 — Mở chat từ lead Facebook (/chat?compose=SĐT). Truyền xuống
// ConversationList để tự mở "Tin nhắn mới" + điền sẵn SĐT → dialog tự lookup Zalo + tạo hội thoại.
const autoComposePhone = computed(() => {
  const c = route.query.compose;
  return typeof c === 'string' ? c : '';
});

// Watch query.contactId — khi nav từ Contacts/Friends qua /cs-chat?contactId=xxx
// Resolve sang convId qua conversations list, rồi redirect /cs-chat/:convId.
watch(
  [() => route.query.contactId, conversations],
  ([contactId, convs]) => {
    if (!contactId || typeof contactId !== 'string') return;
    if (!Array.isArray(convs) || !convs.length) return;
    const match = convs.find(c => c.contact?.id === contactId && c.threadType === 'user');
    if (match) {
      router.replace({ name: 'CsChat', params: { convId: match.id } });
    }
  },
  { deep: false, immediate: false },
);

// Listener cho zalo-labels-synced custom event (dispatch từ MessageThread sau khi
// touch/assign/sync labels). Refetch conversation detail để update friendship.zaloLabels.
function onLabelsSynced() {
  if (selectedConvId.value) {
    selectConversation(selectedConvId.value);
  }
}

function getMyOwnedAccountIds(): string[] {
  const myId = authStore.user?.id;
  return (zaloAccounts.value || [])
    .filter(a => a.ownerUserId === myId || (a as any).isOwnedByMe)
    .map(a => a.id);
}

async function syncCurrentScopeAndConversations() {
  if (isMobile.value) return;
  inboxFilters.setFolder(null);
  await fetchZaloAccounts();
  const ownIds = getMyOwnedAccountIds();

  // Khôi phục scope theo Sales đang chọn nếu đang ở delegated mode, ngược lại khóa về nick của CSKH
  if (csWorkspace.isDelegatedMode && csWorkspace.activeSalesAccountIds.length > 0) {
    workScope.setScope(csWorkspace.activeSalesAccountIds);
  } else {
    if (ownIds.length > 0) {
      workScope.setScope(ownIds);
    } else {
      restoreScope();
    }
  }

  // Làm sạch khung chat giữa (trạng thái chờ chọn hội thoại mới, tránh nhầm lẫn giữa Sales và CSKH)
  selectedConvId.value = null;
  messages.value = [];
  if (route.params.convId) {
    router.replace({ name: 'CsChat' });
  }

  extraFilters.value = inboxFilters.buildQueryParams();
  await fetchConversations({ bypassCache: true });
  void fetchPriorityUnread();
  void fetchFollowingPairs();
}

function exitDelegatedMode() {
  const ownIds = getMyOwnedAccountIds();
  csWorkspace.clearSalesTarget(ownIds);
  void syncCurrentScopeAndConversations();
  toast.success('Đã quay lại hộp thư Zalo CSKH của bạn');
}

function returnToCsHome() {
  const ownIds = getMyOwnedAccountIds();
  csWorkspace.clearSalesTarget(ownIds);
  selectedConvId.value = null;
  messages.value = [];
  router.push('/cs-home');
}

watch(
  () => csWorkspace.activeSalesTarget,
  () => {
    void syncCurrentScopeAndConversations();
  },
  { deep: true }
);

onActivated(async () => {
  await syncCurrentScopeAndConversations();
});

onMounted(async () => {
  if (!isMobile.value) {
    await syncCurrentScopeAndConversations();
    initSocket();
    registerSocketListeners(getSocket());
    // 2026-06-06 (Anh chốt): listen 'friend:updated' để sync realtime giai đoạn KH
    // cross-device. BE emit patch.statusId cho mọi friend của contact khi đổi trạng thái.
    // Cập nhật conversations[].contact.statusId → cột 3 (DealStageSelector watch) + cột 4 đổi ngay.
    const _socket = getSocket();
    if (_socket) {
      _socket.emit('org:join', { orgId: authStore.user?.orgId });
      _socket.on('friend:updated', (p: {
        contactId?: string;
        zaloUidInNick?: string;
        patch?: { statusId?: string | null; zaloLabels?: Array<{ id?: number; name?: string; color?: string }> };
      }) => {
        if (!p?.contactId || !p.patch) return;
        // statusId → cột 3 (DealStageSelector watch) + cột 4 đổi ngay (toàn bộ friend của contact).
        if ('statusId' in p.patch) {
          for (const conv of conversations.value) {
            if ((conv as any).contact?.id === p.contactId) {
              (conv as any).contact.statusId = p.patch.statusId ?? null;
            }
          }
        }
        // 2026-06-06 (Anh chốt) — Tag Zalo Real realtime: BE emit patch.zaloLabels khi sync/assign.
        // Match theo (contactId × zaloUidInNick = externalThreadId) — KHÔNG ghi đè mọi friend của
        // contact, vì per-nick UID rule: cùng KH nhiều friend rows, mỗi nick label riêng.
        // Cột 2 (ConversationList.displayTags) đọc friendship.zaloLabels → tự re-render.
        if ('zaloLabels' in p.patch && Array.isArray(p.patch.zaloLabels)) {
          for (const conv of conversations.value) {
            const c = conv as any;
            if (c.contact?.id !== p.contactId) continue;
            // Khớp đúng friend row qua thread id (nếu BE gửi kèm), fallback theo contact.
            if (p.zaloUidInNick && c.externalThreadId && c.externalThreadId !== p.zaloUidInNick) continue;
            if (!c.friendship) c.friendship = {};
            c.friendship.zaloLabels = p.patch.zaloLabels;
          }
        }
      });
    }
    // Nếu URL đã có /chat/:convId → select luôn (deep-link)
    const initId = route.params.convId;
    if (typeof initId === 'string' && initId) {
      selectConversation(initId);
    }
    window.addEventListener('zalo-labels-synced', onLabelsSynced);
    // 2026-06-12 — tin mới đến (use-chat bắn 'chat:inbound-message') → refresh badge tab
    // "Ưu tiên". Cần vì conv tab Ưu tiên không nằm trong list tab đang xem nên socket
    // không cập nhật được badge tại chỗ. refreshPriorityUnread đã debounce 400ms.
    window.addEventListener('chat:inbound-message', refreshPriorityUnread);
  }
});
onUnmounted(() => {
  if (!isMobile.value) {
    destroySocket();
    window.removeEventListener('zalo-labels-synced', onLabelsSynced);
    window.removeEventListener('chat:inbound-message', refreshPriorityUnread);
  }
});

// Đổi trạng thái ở cột 4 (panel) → cập nhật selectedConv.contact.statusId → cột 3 sync (cùng tab).
function onPanelStatusChanged(statusId: string | null) {
  if (selectedConv.value?.contact) {
    (selectedConv.value.contact as { statusId?: string | null }).statusId = statusId;
  }
}

let searchTimeout: ReturnType<typeof setTimeout>;
watch(searchQuery, () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => fetchConversations(), 300);
});

// ── Layout Resizing (Cache & Drag) ───────────────────────────────────────────
const filterCollapsed = ref(false);

const LAYOUT_CACHE_KEY = 'cs.chat.layout.v1';
function loadCachedLayout(): { convWidth: number; infoWidth: number } {
  try {
    const raw = localStorage.getItem(LAYOUT_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        convWidth: Math.min(Math.max(Number(parsed.convWidth) || 360, 280), 480),
        infoWidth: Math.min(Math.max(Number(parsed.infoWidth) || 340, 280), 450),
      };
    }
  } catch { /* parse fallback */ }
  return { convWidth: 360, infoWidth: 340 };
}

const cachedLayout = loadCachedLayout();
const convColWidth = ref<number>(cachedLayout.convWidth);
const infoColWidth = ref<number>(cachedLayout.infoWidth);

function saveCachedLayout() {
  try {
    localStorage.setItem(
      LAYOUT_CACHE_KEY,
      JSON.stringify({ convWidth: convColWidth.value, infoWidth: infoColWidth.value })
    );
  } catch { /* storage full / blocked */ }
}

const isResizingConv = ref(false);
const isResizingInfo = ref(false);

function startResizeConv(e: MouseEvent) {
  e.preventDefault();
  isResizingConv.value = true;
  const startX = e.clientX;
  const startWidth = convColWidth.value;

  function onMouseMove(moveEvent: MouseEvent) {
    const deltaX = moveEvent.clientX - startX;
    const newWidth = Math.min(Math.max(startWidth + deltaX, 280), 480);
    convColWidth.value = newWidth;
  }

  function onMouseUp() {
    isResizingConv.value = false;
    saveCachedLayout();
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  }

  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
}

function startResizeInfo(e: MouseEvent) {
  e.preventDefault();
  isResizingInfo.value = true;
  const startX = e.clientX;
  const startWidth = infoColWidth.value;

  function onMouseMove(moveEvent: MouseEvent) {
    const deltaX = startX - moveEvent.clientX;
    const newWidth = Math.min(Math.max(startWidth + deltaX, 280), 450);
    infoColWidth.value = newWidth;
  }

  function onMouseUp() {
    isResizingInfo.value = false;
    saveCachedLayout();
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  }

  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
}

const gridStyle = computed(() => {
  const hasInfo = showContactPanel.value && selectedConv.value?.contact;
  if (hasInfo) {
    return {
      gridTemplateColumns: `${convColWidth.value}px 6px 1fr 6px ${infoColWidth.value}px`,
      gap: '8px',
    };
  }
  return {
    gridTemplateColumns: `${convColWidth.value}px 6px 1fr`,
    gap: '8px',
  };
});
</script>

<style scoped>
.cs-chat-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.smax-chat-grid {
  display: grid;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background: transparent;
  gap: 8px;
}

.smax-conv-col,
.smax-msg-col,
.smax-info-col {
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.smax-conv-col {
  border-right: 1px solid var(--smax-grey-200);
  background: var(--smax-bg);
  display: flex;
  flex-direction: column;
}

/* Compact Delegated Pill in Conv Column Header */
.cs-delegated-chip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: #f0fdfa;
  border-bottom: 1px solid #ccfbf1;
  font-size: 12px;
  color: #0f766e;
  gap: 8px;
  flex-shrink: 0;
}
.cs-delegated-chip-left {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cs-delegated-chip-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.cs-btn-exit {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #0d9488;
  border: 1px solid #0d9488;
  color: white;
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s;
}
.cs-btn-exit:hover {
  background: #0f766e;
}
.cs-dot-live {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #0d9488;
  flex-shrink: 0;
  animation: cs-pulse 1.8s infinite;
}
@keyframes cs-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.85); }
}
.cs-label {
  color: #64748b;
  font-size: 11px;
}
.cs-sales-name {
  color: #0f766e;
  font-weight: 700;
}
.cs-btn-back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: white;
  border: 1px solid #99f6e4;
  color: #0f766e;
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s;
}
.cs-btn-back:hover {
  background: #0d9488;
  color: white;
  border-color: #0d9488;
}

/* Resizer giữa các cột */
.sl-resizer {
  width: 6px;
  cursor: col-resize;
  background: transparent;
  transition: background 0.15s;
  position: relative;
  z-index: 10;
  user-select: none;
}
.sl-resizer::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 2px;
  width: 2px;
  background: var(--smax-grey-200, #e2e8f0);
  transition: background 0.15s;
}
.sl-resizer:hover::after,
.sl-resizer.is-active::after {
  background: #0D9488;
}

/* work-scope 2026-06-15 — 1 DÒNG "N tin ở M nick khác" ở đầu cột conv */
.out-of-scope-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 12px;
  background: #eff6ff;
  border: none;
  border-bottom: 1px solid #bfdbfe;
  font-size: 12px;
  font-weight: 600;
  color: #1e40af;
  cursor: pointer;
  text-align: left;
}
.out-of-scope-bar:hover { background: #dbeafe; }
.out-of-scope-bar .oos-icon { color: #1e40af; }
.out-of-scope-bar .oos-text { line-height: 1.2; }

/* FIX socket-chết v2 — banner mất kết nối realtime ở đầu cột conv */
.realtime-offline-banner {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 500;
  color: #92400e;
  background: #fef3c7;
  border-bottom: 1px solid #fde68a;
}
.realtime-offline-banner .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #f59e0b;
  animation: rt-pulse 1.2s ease-in-out infinite;
}
@keyframes rt-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.smax-msg-col {
  background: var(--smax-grey-100);
}

@media (max-width: 1024px) {
  .smax-info-col,
  .sl-resizer:last-of-type {
    display: none !important;
  }
}
</style>
