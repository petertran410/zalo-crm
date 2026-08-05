<!--
  FacebookInboxView.vue — trang inbox Facebook Messenger TỐI GIẢN (multi-channel Phase 2, 2026-07-21).
  Mục tiêu: xem tin tester gửi + trả lời để test kết nối. UI thô, không tô vẽ.
  Dùng endpoint sẵn: GET /channels/facebook/conversations, GET/POST /conversations/:id/messages.
  Realtime qua socket 'chat:message' (accountId = facebookPageAccountId).
-->
<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { api } from '@/api/index';
import { createAppSocket } from '@/api/socket';
import type { Socket } from 'socket.io-client';

interface FbConv {
  id: string;
  threadId: string | null;
  pageName: string | null;
  senderName: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  isReplied: boolean;
  preview: { content: string | null; senderType: string; contentType: string } | null;
}
interface FbMsg {
  id: string;
  senderType: string; // 'contact' = khách, 'self' = mình
  content: string | null;
  contentType: string;
  sentAt: string;
  attachments?: Array<{ type?: string; url?: string }>;
}

const convs = ref<FbConv[]>([]);
const selectedId = ref<string | null>(null);
const messages = ref<FbMsg[]>([]);
const draft = ref('');
const loadingConvs = ref(false);
const loadingMsgs = ref(false);
const sending = ref(false);
const errorMsg = ref('');
const threadEl = ref<HTMLElement | null>(null);
let socket: Socket | null = null;

async function loadConvs() {
  loadingConvs.value = true;
  errorMsg.value = '';
  try {
    const { data } = await api.get('/channels/facebook/conversations');
    convs.value = data.conversations ?? [];
  } catch (e: any) {
    errorMsg.value = e?.response?.data?.error || 'Không tải được danh sách hội thoại';
  } finally {
    loadingConvs.value = false;
  }
}

async function selectConv(id: string) {
  selectedId.value = id;
  messages.value = [];
  loadingMsgs.value = true;
  errorMsg.value = '';
  try {
    const { data } = await api.get(`/conversations/${id}/messages`, { params: { limit: 100 } });
    messages.value = data.messages ?? [];
    await scrollBottom();
    // clear badge chưa đọc ở list (best-effort UI)
    const c = convs.value.find((x) => x.id === id);
    if (c) c.unreadCount = 0;
  } catch (e: any) {
    errorMsg.value = e?.response?.data?.error || 'Không tải được tin nhắn';
  } finally {
    loadingMsgs.value = false;
  }
}

async function send() {
  const text = draft.value.trim();
  if (!text || !selectedId.value || sending.value) return;
  sending.value = true;
  errorMsg.value = '';
  try {
    const { data } = await api.post(`/conversations/${selectedId.value}/messages`, { content: text });
    draft.value = '';
    // append nếu socket chưa kịp (dedup theo id)
    if (data?.id && !messages.value.some((m) => m.id === data.id)) {
      messages.value.push(data as FbMsg);
      await scrollBottom();
    }
    void loadConvs();
  } catch (e: any) {
    errorMsg.value = e?.response?.data?.error || 'Gửi tin thất bại';
  } finally {
    sending.value = false;
  }
}

async function scrollBottom() {
  await nextTick();
  if (threadEl.value) threadEl.value.scrollTop = threadEl.value.scrollHeight;
}

function fmt(ts: string | null): string {
  if (!ts) return '';
  return new Date(ts).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
}

onMounted(() => {
  void loadConvs();
  socket = createAppSocket();
  socket.on('chat:message', (payload: { conversationId: string; message: FbMsg }) => {
    if (!payload?.message) return;
    if (payload.conversationId === selectedId.value) {
      if (!messages.value.some((m) => m.id === payload.message.id)) {
        messages.value.push(payload.message);
        void scrollBottom();
      }
    }
    // cập nhật list (đưa hội thoại có tin mới lên đầu + preview)
    void loadConvs();
  });
});

onBeforeUnmount(() => {
  socket?.off('chat:message');
  socket?.disconnect();
  socket = null;
});
</script>

<template>
  <div class="fb-inbox">
    <h2 class="fb-title">Facebook Messenger (test)</h2>
    <p v-if="errorMsg" class="fb-err">{{ errorMsg }}</p>
    <div class="fb-body">
      <!-- Cột trái: danh sách hội thoại -->
      <aside class="fb-list">
        <div class="fb-list-head">
          <span>Hội thoại</span>
          <button class="fb-btn-sm" :disabled="loadingConvs" @click="loadConvs">↻</button>
        </div>
        <p v-if="loadingConvs" class="fb-hint">Đang tải…</p>
        <p v-else-if="convs.length === 0" class="fb-hint">Chưa có hội thoại nào. Nhờ tester nhắn cho Page.</p>
        <ul>
          <li
            v-for="c in convs"
            :key="c.id"
            :class="['fb-conv', { active: c.id === selectedId }]"
            @click="selectConv(c.id)"
          >
            <div class="fb-conv-top">
              <span class="fb-conv-name">{{ c.senderName || 'PSID ' + (c.threadId?.slice(-6) || '—') }}</span>
              <span v-if="c.unreadCount > 0" class="fb-badge">{{ c.unreadCount }}</span>
            </div>
            <div class="fb-conv-sub">{{ c.pageName || 'Page' }}</div>
            <div class="fb-conv-prev">
              <span v-if="c.preview">{{ c.preview.senderType === 'self' ? 'Bạn: ' : '' }}{{ c.preview.content || '[' + c.preview.contentType + ']' }}</span>
              <span v-else class="fb-hint">—</span>
            </div>
            <div class="fb-conv-time">{{ fmt(c.lastMessageAt) }}</div>
          </li>
        </ul>
      </aside>

      <!-- Cột phải: thread + ô gửi -->
      <section class="fb-thread-wrap">
        <p v-if="!selectedId" class="fb-hint fb-center">Chọn một hội thoại để xem.</p>
        <template v-else>
          <div ref="threadEl" class="fb-thread">
            <p v-if="loadingMsgs" class="fb-hint">Đang tải tin…</p>
            <div
              v-for="m in messages"
              :key="m.id"
              :class="['fb-msg', m.senderType === 'self' ? 'me' : 'them']"
            >
              <div class="fb-bubble">
                <span v-if="m.content">{{ m.content }}</span>
                <span v-else class="fb-hint">[{{ m.contentType }}]</span>
                <template v-if="m.attachments && m.attachments.length">
                  <div v-for="(a, i) in m.attachments" :key="i" class="fb-att">
                    <a v-if="a.url" :href="a.url" target="_blank" rel="noopener">[{{ a.type || 'file' }}]</a>
                  </div>
                </template>
              </div>
              <div class="fb-msg-time">{{ fmt(m.sentAt) }}</div>
            </div>
          </div>
          <div class="fb-compose">
            <input
              v-model="draft"
              type="text"
              placeholder="Nhập trả lời… (Enter để gửi)"
              :disabled="sending"
              @keyup.enter="send"
            />
            <button class="fb-btn" :disabled="sending || !draft.trim()" @click="send">
              {{ sending ? 'Đang gửi…' : 'Gửi' }}
            </button>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* 12px dôi ra = padding của chính khối này (60 = 48 + 12) — giữ nguyên phần dôi,
   chỉ thay số nav cứng bằng biến (revamp nav 2026-08-05). */
.fb-inbox { padding: 12px; height: calc(100vh - var(--smax-topnav-h) - 12px); display: flex; flex-direction: column; }
.fb-title { font-size: 18px; font-weight: 600; margin: 0 0 8px; }
.fb-err { color: #c0392b; background: #fdecea; padding: 6px 10px; border-radius: 4px; margin: 0 0 8px; }
.fb-body { flex: 1; display: flex; gap: 12px; min-height: 0; }
.fb-list { width: 300px; border: 1px solid #ddd; border-radius: 6px; overflow-y: auto; display: flex; flex-direction: column; }
.fb-list-head { display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; border-bottom: 1px solid #eee; font-weight: 600; position: sticky; top: 0; background: #fff; }
.fb-list ul { list-style: none; margin: 0; padding: 0; }
.fb-conv { padding: 8px 10px; border-bottom: 1px solid #f0f0f0; cursor: pointer; }
.fb-conv:hover { background: #f7f7f7; }
.fb-conv.active { background: #e8f0fe; }
.fb-conv-top { display: flex; justify-content: space-between; align-items: center; }
.fb-conv-name { font-weight: 600; font-size: 13px; }
.fb-conv-sub { font-size: 11px; color: #888; }
.fb-badge { background: #e74c3c; color: #fff; border-radius: 10px; padding: 0 6px; font-size: 11px; }
.fb-conv-prev { font-size: 12px; color: #555; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fb-conv-time { font-size: 11px; color: #999; }
.fb-thread-wrap { flex: 1; border: 1px solid #ddd; border-radius: 6px; display: flex; flex-direction: column; min-width: 0; }
.fb-thread { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 6px; }
.fb-msg { max-width: 70%; display: flex; flex-direction: column; }
.fb-msg.me { align-self: flex-end; align-items: flex-end; }
.fb-msg.them { align-self: flex-start; align-items: flex-start; }
.fb-bubble { padding: 6px 10px; border-radius: 10px; font-size: 14px; word-break: break-word; }
.fb-msg.me .fb-bubble { background: #0084ff; color: #fff; }
.fb-msg.them .fb-bubble { background: #eee; color: #111; }
.fb-msg-time { font-size: 10px; color: #999; margin-top: 2px; }
.fb-att a { color: inherit; text-decoration: underline; }
.fb-compose { display: flex; gap: 8px; padding: 10px; border-top: 1px solid #eee; }
.fb-compose input { flex: 1; padding: 8px 10px; border: 1px solid #ccc; border-radius: 6px; font-size: 14px; }
.fb-btn { padding: 8px 16px; background: #0084ff; color: #fff; border: none; border-radius: 6px; cursor: pointer; }
.fb-btn:disabled { opacity: 0.5; cursor: default; }
.fb-btn-sm { border: 1px solid #ccc; background: #fff; border-radius: 4px; cursor: pointer; padding: 2px 8px; }
.fb-hint { color: #999; font-size: 13px; padding: 6px 10px; }
.fb-center { margin: auto; }
</style>
