/**
 * useMiniChatBridgeStore
 * ─────────────────────────────────────────────────────────────────
 * Bridge realtime chat state từ SalesChatView (Socket.io) xuống
 * MiniChatPanel (nằm ở SalesLayout, ngoài provide/inject tree).
 *
 * Thay thế cho inject('miniChat') — trước đây hoạt động khi
 * VisualOrderModal nằm trong SalesChatView. Sau khi OrderBuilderWorkspace
 * chuyển lên SalesLayout, inject thất bại → rơi vào fallback HTTP polling.
 *
 * Flow:
 *   SalesChatView → bridge.publish(conv, messages, sendFn, sending)
 *   MiniChatPanel → bridge.subscribe() (reactive, zero polling)
 */
import { defineStore } from 'pinia';
import { ref, type Ref } from 'vue';
import type { Conversation, Message } from '@/composables/use-chat';

export const useMiniChatBridgeStore = defineStore('miniChatBridge', () => {
  // Conversation đang mở trong SalesChatView (null khi chưa chọn)
  const conversation = ref<Conversation | null>(null);

  // Messages của conversation đó (reactive — socket update tự push vào mảng)
  const messages = ref<Message[]>([]);

  // Trạng thái gửi tin
  const sendingMsg = ref(false);

  // Hàm gửi tin — được SalesChatView gán vào, MiniChatPanel gọi
  const _sendFn = ref<((content: string, replyId?: string | null) => Promise<void>) | null>(null);

  /**
   * SalesChatView gọi hàm này sau khi initSocket() để bridge state.
   * Nhận ref thật (shallow copy) nên không tạo reactive overhead thêm.
   */
  function publish(
    convRef: Ref<Conversation | null>,
    messagesRef: Ref<Message[]>,
    sendingRef: Ref<boolean>,
    sendFn: (content: string, replyId?: string | null) => Promise<void>,
  ) {
    // Gán trực tiếp .value để Pinia reactive theo dõi
    // Dùng watchEffect ở phía consumer thay vì đây để tránh double ref overhead
    conversation.value = convRef.value;
    messages.value = messagesRef.value;
    sendingMsg.value = sendingRef.value;
    _sendFn.value = sendFn;

    // Store raw refs để sync live — được gọi mỗi khi SalesChatView mount
    _rawConvRef = convRef;
    _rawMessagesRef = messagesRef;
    _rawSendingRef = sendingRef;
  }

  // Internal: raw refs để MiniChatPanel dùng trực tiếp (computed/watch)
  let _rawConvRef: Ref<Conversation | null> | null = null;
  let _rawMessagesRef: Ref<Message[]> | null = null;
  let _rawSendingRef: Ref<boolean> | null = null;

  /** Trả về raw refs để MiniChatPanel watch trực tiếp — zero-copy, zero-polling */
  function getLiveRefs() {
    return {
      conversation: _rawConvRef,
      messages: _rawMessagesRef,
      sendingMsg: _rawSendingRef,
      isLive: !!_rawConvRef,
    };
  }

  async function sendMessage(content: string, replyId?: string | null) {
    if (_sendFn.value) {
      await _sendFn.value(content, replyId);
    }
  }

  function unpublish() {
    _rawConvRef = null;
    _rawMessagesRef = null;
    _rawSendingRef = null;
    _sendFn.value = null;
    conversation.value = null;
    messages.value = [];
  }

  return {
    conversation,
    messages,
    sendingMsg,
    publish,
    getLiveRefs,
    sendMessage,
    unpublish,
  };
});
