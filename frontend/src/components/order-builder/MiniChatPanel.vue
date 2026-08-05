<template>
  <div class="mcp-panel">
    <!-- ─── Header ─────────────────────────────────────────── -->
    <div class="mcp-header">
      <div class="mcp-header__left">
        <div class="mcp-header__avatar">
          {{ (contactName || '?')[0].toUpperCase() }}
        </div>
        <div class="mcp-header__info">
          <span class="mcp-header__name">{{ contactName || 'Khách hàng' }}</span>
        </div>
      </div>
      <!-- Nút làm mới ẩn: fallback mode tự poll mỗi 15s, không cần hiển thị thủ công -->
    </div>

    <!-- ─── Messages ──────────────────────────────────────── -->
    <div class="mcp-messages" ref="messagesEl">
      <!-- Loading -->
      <div v-if="displayLoading" class="mcp-center-state">
        <div class="mcp-spinner" />
        <span>Đang tải tin nhắn…</span>
      </div>

      <!-- No conversation -->
      <div v-else-if="!hasConversation" class="mcp-center-state">
        <MessageSquareIcon :size="36" class="mcp-state-icon" />
        <p>Không tìm thấy cuộc trò chuyện Zalo cho khách hàng này.</p>
      </div>

      <!-- Empty -->
      <div v-else-if="displayMessages.length === 0" class="mcp-center-state">
        <MessageSquareIcon :size="36" class="mcp-state-icon" />
        <p>Chưa có tin nhắn nào.</p>
      </div>

      <!-- Bubbles -->
      <template v-else>
        <div v-for="(msg, idx) in displayMessages" :key="msg.id" class="mcp-row" :class="msg.senderType === 'self' ? 'mcp-row--self' : 'mcp-row--other'">
          <!-- Date divider -->
          <div v-if="showDateDivider(idx)" class="mcp-date-divider">
            <span>{{ dateDividerLabel(msg.sentAt) }}</span>
          </div>

          <div class="mcp-bubble-wrap">
            <!-- Sender name for customer -->
            <div v-if="msg.senderType !== 'self' && showSenderName(idx)" class="mcp-sender-name">
              {{ msg.senderName || 'Khách hàng' }}
            </div>

            <div class="mcp-bubble" :class="msg.senderType === 'self' ? 'mcp-bubble--self' : 'mcp-bubble--other'">
              <span v-if="msg.isDeleted" class="mcp-deleted-text">Tin đã thu hồi</span>
              <template v-else-if="!msg.contentType || msg.contentType === 'text'">
                {{ msg.content || '' }}
              </template>
              <span v-else class="mcp-media-badge">[{{ contentTypeLabel(msg.contentType) }}]</span>
            </div>

            <div class="mcp-time">{{ formatTime(msg.sentAt) }}</div>
          </div>
        </div>
      </template>
    </div>

    <!-- ─── Input ──────────────────────────────────────────── -->
    <div class="mcp-input-area" :class="{ 'mcp-input-area--disabled': !hasConversation }">
      <textarea
        v-model="inputText"
        class="mcp-input"
        :placeholder="hasConversation ? 'Nhắn tin cho khách... (Enter để gửi)' : 'Không có cuộc hội thoại'"
        :disabled="!hasConversation || displaySending"
        rows="2"
        @keydown.enter.exact.prevent="onSend"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount, type Ref } from 'vue';
import { MessageSquare as MessageSquareIcon } from 'lucide-vue-next';
import { api } from '@/api';
import type { Conversation, Message } from '@/composables/use-chat';
import { useMiniChatBridgeStore } from '@/stores/use-mini-chat-bridge';

// ── Props ────────────────────────────────────────────────────────────
const props = defineProps<{
  contactId?: string;
  contactName?: string;
  contactPhone?: string;
  posCustomerCode?: string;
}>();

// ── Bridge Store (thay thế inject/provide — hoạt động vượt qua component tree boundary) ──
// SalesChatView.publish() đưa raw refs của useChat() vào store; MiniChatPanel đọc ra.
// Không tạo HTTP request thêm, không polling. Socket.io feed trực tiếp.
const bridge = useMiniChatBridgeStore();
const { conversation: liveConvRef, messages: liveMessagesRef, sendingMsg: liveSendingRef, isLive } = bridge.getLiveRefs();

// isLiveMode = true khi SalesChatView đã publish (có socket) — false khi mở từ trang khác
const isLiveMode = computed(() => isLive && !!liveConvRef && !!liveMessagesRef);

// ── Live mode ────────────────────────────────────────────────────────
// Chỉ hiện messages của conv khớp contactId (bảo vệ cross-contact bleed)
const liveMessages = computed<Message[]>(() => {
  if (!isLiveMode.value || !liveMessagesRef) return [];
  const conv = liveConvRef!.value;
  if (!conv) return [];
  if (props.contactId && conv.contact?.id !== props.contactId) return [];
  return liveMessagesRef.value;
});

const liveConvExists = computed(() => {
  if (!isLiveMode.value || !liveConvRef) return false;
  const conv = liveConvRef.value;
  if (!conv) return false;
  if (props.contactId) return conv.contact?.id === props.contactId;
  return true;
});

// ── Fallback mode (không có socket — ví dụ mở từ trang khác) ────────
interface FallbackMsg {
  id: string;
  content: string | null;
  contentType: string;
  senderType: string;
  senderName: string | null;
  sentAt: string;
  isDeleted: boolean;
}

const fallbackMessages = ref<FallbackMsg[]>([]);
const fallbackConvId = ref<string | null>(null);
const fallbackLoading = ref(false);
const fallbackSending = ref(false);
let pollTimer: ReturnType<typeof setInterval> | null = null;

async function findFallbackConv() {
  if (!props.contactId) return;
  try {
    const { data } = await api.get('/conversations', { params: { limit: 100 } });
    const convs: any[] = data?.conversations || [];
    const match = convs.find((c: any) => c.contact?.id === props.contactId);
    fallbackConvId.value = match?.id ?? null;
  } catch {
    fallbackConvId.value = null;
  }
}

async function fallbackFetch() {
  if (!fallbackConvId.value) return;
  fallbackLoading.value = true;
  try {
    const { data } = await api.get(`/conversations/${fallbackConvId.value}/messages`, { params: { limit: 80 } });
    fallbackMessages.value = (data?.messages || []).map((m: any) => ({
      id: m.id,
      content: m.content ?? null,
      contentType: m.contentType || 'text',
      senderType: m.senderType || 'other',
      senderName: m.senderName ?? null,
      sentAt: m.sentAt,
      isDeleted: !!m.isDeleted,
    }));
    await scrollToBottom();
  } finally {
    fallbackLoading.value = false;
  }
}

async function fallbackSend(text: string) {
  if (!fallbackConvId.value || !text.trim()) return;
  fallbackSending.value = true;
  const opt: FallbackMsg = {
    id: `opt-${Date.now()}`,
    content: text,
    contentType: 'text',
    senderType: 'self',
    senderName: null,
    sentAt: new Date().toISOString(),
    isDeleted: false,
  };
  fallbackMessages.value.push(opt);
  await scrollToBottom(true);
  try {
    await api.post(`/conversations/${fallbackConvId.value}/messages`, { content: text });
    await fallbackFetch();
  } catch {
    fallbackMessages.value = fallbackMessages.value.filter(m => m.id !== opt.id);
  } finally {
    fallbackSending.value = false;
  }
}

// ── Unified computed (chọn live (bridge store) hoặc fallback HTTP) ────────────────
const displayMessages = computed(() =>
  isLiveMode.value ? liveMessages.value : (fallbackMessages.value as any[])
);

const hasConversation = computed(() =>
  isLiveMode.value ? liveConvExists.value : !!fallbackConvId.value
);

const displayLoading = computed(() =>
  !isLiveMode.value && fallbackLoading.value && displayMessages.value.length === 0
);

const displaySending = computed(() =>
  isLiveMode.value
    ? (liveSendingRef?.value ?? false)
    : fallbackSending.value
);

// ── Send dispatcher ───────────────────────────────────────────────────
const inputText = ref('');

async function onSend() {
  const text = inputText.value.trim();
  if (!text || displaySending.value || !hasConversation.value) return;
  inputText.value = '';
  if (isLiveMode.value) {
    // Gọi sendMessage từ bridge store (đã được SalesChatView gán vào)
    try { await bridge.sendMessage(text); } catch { inputText.value = text; }
  } else {
    await fallbackSend(text);
  }
  await scrollToBottom(true);
}

// ── UI helpers ────────────────────────────────────────────────────────
const messagesEl = ref<HTMLElement | null>(null);

async function scrollToBottom(smooth = false) {
  await nextTick();
  if (messagesEl.value) {
    messagesEl.value.scrollTo({ top: messagesEl.value.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }
}

function showDateDivider(idx: number): boolean {
  if (idx === 0) return true;
  const msgs = displayMessages.value;
  return new Date(msgs[idx].sentAt).toDateString() !== new Date(msgs[idx - 1].sentAt).toDateString();
}

function dateDividerLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Hôm nay';
  if (d.toDateString() === yesterday.toDateString()) return 'Hôm qua';
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function showSenderName(idx: number): boolean {
  if (idx === 0) return true;
  const msgs = displayMessages.value;
  return msgs[idx - 1].senderType === 'self';
}

function formatTime(iso: string): string {
  try { return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
}

function contentTypeLabel(type: string): string {
  return ({ image: 'Ảnh', video: 'Video', voice: 'Âm thanh', audio: 'Âm thanh', file: 'File', sticker: 'Sticker', gif: 'GIF', location: 'Vị trí', link: 'Link' } as Record<string, string>)[type] || type;
}

const initials = computed(() => {
  const name = props.contactName || 'K';
  return name.split(' ').slice(-2).map(w => w[0]).join('').toUpperCase().slice(0, 2);
});

// ── Lifecycle ─────────────────────────────────────────────────────────
// Live mode: watch messages, scroll xuống khi có tin mới
watch(
  () => isLiveMode.value && liveMessagesRef ? liveMessagesRef.value.length : 0,
  () => { if (isLiveMode.value) void scrollToBottom(true); }
);

onMounted(async () => {
  if (!isLiveMode.value && props.contactId) {
    // Fallback HTTP: chỉ dùng khi không có Socket.io bridge (người dùng chưa mở SalesChatView)
    await findFallbackConv();
    if (fallbackConvId.value) {
      await fallbackFetch();
      pollTimer = setInterval(() => { void fallbackFetch(); }, 15000);
    }
  } else if (isLiveMode.value) {
    // Live: scroll xuống ngay khi mở modal
    await scrollToBottom();
  }
});

onBeforeUnmount(() => {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
});
</script>

<style scoped>
/* ═══ Panel Shell ═══ */
.mcp-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fff;
  border-radius: 16px;
  border: 1px solid rgba(226, 232, 240, 0.8);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
  overflow: hidden;
  font-family: 'Inter', system-ui, sans-serif;
}

/* ═══ Header ═══ */
.mcp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  background: linear-gradient(135deg, #0068FF 0%, #0050CC 100%);
  flex-shrink: 0;
}

.mcp-header__left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mcp-header__avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.25);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.5px;
  flex-shrink: 0;
  border: 1.5px solid rgba(255, 255, 255, 0.4);
}

.mcp-header__info {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: nowrap;
  min-width: 0;
}

.mcp-header__name {
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  line-height: 1.2;
  white-space: nowrap;
  flex-shrink: 0;
}

.mcp-header__chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 10.5px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 10px;
  white-space: nowrap;
  flex-shrink: 0;
}

.mcp-header__chip--phone {
  background: rgba(255, 255, 255, 0.2);
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.35);
}

.mcp-header__chip--pos {
  background: rgba(34, 197, 94, 0.25);
  color: #ffffff;
  border: 1px solid rgba(134, 239, 172, 0.5);
}

.mcp-header__sub {
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.8);
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 2px;
}

.mcp-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.mcp-dot--active {
  background: #4ade80;
  box-shadow: 0 0 0 2px rgba(74, 222, 128, 0.35);
  animation: mcp-pulse 2s infinite;
}

.mcp-dot--fallback {
  background: #fbbf24;
}

@keyframes mcp-pulse {
  0%, 100% { box-shadow: 0 0 0 2px rgba(74, 222, 128, 0.35); }
  50% { box-shadow: 0 0 0 4px rgba(74, 222, 128, 0.15); }
}

.mcp-header__refresh {
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 8px;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}

.mcp-header__refresh:hover {
  background: rgba(255, 255, 255, 0.25);
}

/* ═══ Messages ═══ */
.mcp-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  background: #f8fafc;
}

.mcp-messages::-webkit-scrollbar { width: 4px; }
.mcp-messages::-webkit-scrollbar-track { background: transparent; }
.mcp-messages::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 2px; }

/* ─── Center States ─── */
.mcp-center-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #94a3b8;
  text-align: center;
  padding: 20px;
}

.mcp-center-state p { font-size: 12px; line-height: 1.5; margin: 0; }
.mcp-state-icon { color: #cbd5e1; }

/* ─── Date Divider ─── */
.mcp-date-divider {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0 4px;
}

.mcp-date-divider::before,
.mcp-date-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #e2e8f0;
}

.mcp-date-divider span {
  font-size: 10px;
  color: #94a3b8;
  font-weight: 600;
  white-space: nowrap;
  padding: 0 4px;
}

/* ─── Message Rows ─── */
.mcp-row { display: flex; flex-direction: column; margin-bottom: 1px; }
.mcp-row--self { align-items: flex-end; }
.mcp-row--other { align-items: flex-start; }

.mcp-bubble-wrap {
  display: flex;
  flex-direction: column;
  max-width: 87%;
}

.mcp-sender-name {
  font-size: 10px;
  color: #64748b;
  font-weight: 600;
  margin-bottom: 2px;
  padding-left: 2px;
}

.mcp-bubble {
  padding: 7px 11px;
  border-radius: 14px;
  font-size: 12.5px;
  line-height: 1.45;
  word-break: break-word;
}

.mcp-bubble--other {
  background: #fff;
  color: #1e293b;
  border: 1px solid #e2e8f0;
  border-bottom-left-radius: 4px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.mcp-bubble--self {
  background: linear-gradient(135deg, #0068FF, #0050CC);
  color: #fff;
  border-bottom-right-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 104, 255, 0.22);
}

.mcp-deleted-text { opacity: 0.5; font-style: italic; font-size: 11.5px; }
.mcp-media-badge { opacity: 0.65; font-style: italic; font-size: 11.5px; }

.mcp-time {
  font-size: 10px;
  color: #94a3b8;
  margin-top: 3px;
  padding: 0 2px;
}

/* ═══ Input Area ═══ */
.mcp-input-area {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 10px 12px;
  background: #fff;
  border-top: 1px solid #e2e8f0;
  flex-shrink: 0;
}

.mcp-input-area--disabled { opacity: 0.5; }

.mcp-input {
  flex: 1;
  resize: none;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 12.5px;
  color: #1e293b;
  font-family: inherit;
  line-height: 1.45;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
  max-height: 80px;
  background: #f8fafc;
}

.mcp-input:focus {
  border-color: #0068FF;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(0, 104, 255, 0.08);
}

.mcp-input:disabled { cursor: not-allowed; }
.mcp-input::placeholder { color: #94a3b8; }

.mcp-send-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, #0068FF, #0050CC);
  color: #fff;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s;
  box-shadow: 0 2px 8px rgba(0, 104, 255, 0.28);
}

.mcp-send-btn:hover:not(:disabled) {
  transform: scale(1.06);
  box-shadow: 0 4px 12px rgba(0, 104, 255, 0.38);
}

.mcp-send-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }

/* ═══ Spinners ═══ */
.mcp-spinner {
  width: 24px;
  height: 24px;
  border: 2.5px solid #e2e8f0;
  border-top-color: #0068FF;
  border-radius: 50%;
  animation: mcp-spin 0.7s linear infinite;
}

.mcp-mini-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: mcp-spin 0.7s linear infinite;
}

.mcp-spin { animation: mcp-spin 0.7s linear infinite; }

@keyframes mcp-spin { to { transform: rotate(360deg); } }
</style>
