<template>
  <div class="mobile-chat" style="height: calc(100vh - 120px);">
    <!-- Conversation list (shown when no conversation selected) -->
    <div v-if="!activeSelectedConvId" style="height: 100%;">
      <ConversationList
        :conversations="activeConversations"
        :selected-id="activeSelectedConvId"
        :loading="activeLoadingConvs"
        v-model:search="activeSearch"
        @select="handleSelect"
        @filter-account="handleFilterAccount"
      />
    </div>

    <!-- Message thread (shown when conversation selected) -->
    <div v-else style="height: 100%; display: flex; flex-direction: column;">
      <!-- Back button bar -->
      <div class="d-flex align-center pa-2" style="flex-shrink: 0;">
        <v-btn icon variant="text" size="small" @click="handleBack">
          <v-icon>mdi-arrow-left</v-icon>
        </v-btn>
        <span v-if="activeSelectedConv" class="text-body-2 font-weight-medium ml-1">
          {{ activeSelectedConv.contact?.fullName || 'Chat' }}
        </span>
      </div>

      <MessageThread
        :conversation="activeSelectedConv"
        :messages="allMessages"
        :loading="activeLoadingMsgs"
        :sending="activeSendingMsg"
        :show-contact-panel="false"
        @send="handleSend"
        @refresh-thread="activeSelectedConvId && activeFetchMessages(activeSelectedConvId)"
        style="flex: 1; min-height: 0;"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import ConversationList from '@/components/chat/ConversationList.vue';
import MessageThread from '@/components/chat/MessageThread.vue';
import type { Conversation, Message } from '@/composables/use-chat';
import { useOfflineQueue } from '@/composables/use-offline-queue';

const props = defineProps<{
  conversations: Conversation[];
  selectedConvId: string | null;
  selectedConv: Conversation | null;
  messages: Message[];
  loadingConvs: boolean;
  loadingMsgs: boolean;
  sendingMsg: boolean;
  searchQuery: string;
  sendMessage: (
    content: string,
    replyMessageId?: string | null,
    styles?: Array<{ st: string; start: number; len: number }>,
    mentions?: Array<{ uid: string; pos: number; len: number }>,
  ) => Promise<void>;
  sendMessageTo: (conversationId: string, content: string) => Promise<void>;
  fetchMessages: (conversationId: string) => Promise<void>;
}>();

const emit = defineEmits<{
  select: [id: string];
  back: [];
  'update:search': [value: string];
  'filter-account': [accountId: string | null];
}>();

const { pendingMessages, enqueue, flush } = useOfflineQueue();

const activeConversations = computed(() => props.conversations);
const activeSelectedConvId = computed(() => props.selectedConvId);
const activeSelectedConv = computed(() => props.selectedConv);
const activeLoadingConvs = computed(() => props.loadingConvs);
const activeLoadingMsgs = computed(() => props.loadingMsgs);
const activeSendingMsg = computed(() => props.sendingMsg);
const activeSearch = computed({
  get: () => props.searchQuery,
  set: (value: string) => emit('update:search', value),
});
const activeFetchMessages = (conversationId: string) => props.fetchMessages(conversationId);

function handleSelect(conversationId: string) {
  emit('select', conversationId);
}

function handleFilterAccount(accountId: string | null) {
  emit('filter-account', accountId);
}

function handleBack() {
  emit('back');
}

const allMessages = computed(() => {
  const pending = pendingMessages.value
    .filter(p => p.conversationId === activeSelectedConvId.value)
    .map(p => ({
      id: p.id,
      content: p.content,
      contentType: 'text',
      senderType: 'self',
      senderName: null,
      sentAt: p.createdAt,
      isDeleted: false,
      zaloMsgId: null,
      albumKey: null,
      albumIndex: null,
      albumTotal: null,
      _pending: true,
    }));
  return [...props.messages, ...pending];
});

async function handleSend(
  content: string,
  replyMessageId?: string | null,
  styles?: Array<{ st: string; start: number; len: number }>,
  mentions?: Array<{ uid: string; pos: number; len: number }>,
) {
  if (!activeSelectedConvId.value) return;
  if (!navigator.onLine) {
    enqueue(activeSelectedConvId.value, content);
    return;
  }
  await props.sendMessage(content, replyMessageId, styles, mentions);
}

function onOnline() {
  flush(props.sendMessageTo);
}

onMounted(() => {
  window.addEventListener('online', onOnline);
});

onUnmounted(() => {
  window.removeEventListener('online', onOnline);
});
</script>
