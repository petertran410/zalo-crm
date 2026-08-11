/**
 * useWorkspaceSessionStore
 * ─────────────────────────────────────────────────────────────────
 * Sales Workspace Session Store — nâng cấp từ useOrderDraftStore.
 *
 * Mỗi session = 1 ngữ cảnh làm việc của Sales với 1 khách hàng:
 *   Customer + Cart + Shipping + Payment + Chat metadata + UI state.
 *
 * MAX 5 sessions đồng thời.
 * Debounced persist: 500ms → LocalStorage, 2s → Backend.
 * Migration tự động từ order_drafts_v1 nếu có.
 *
 * Backward compat: re-export `useOrderDraftStore` alias.
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { CartItem } from '@/components/order-builder/types';
import { api } from '@/api';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CachedMessage {
  id: string;
  content: string;
  contentType?: string;
  senderType: 'self' | 'customer';
  senderName?: string;
  sentAt: string;
  isDeleted?: boolean;
}

export interface WorkspaceSession {
  id: string;

  // Customer
  contactId?: string;
  contactName: string;
  contactAvatar?: string;
  contactPhone?: string;
  posCustomerId?: number;
  posCustomerCode?: string;

  // Cart state
  cartItems: CartItem[];
  branchId: number | null;
  paymentMethod: string;
  orderStatus: number;
  priceBookId: string;
  orderDiscount: number;
  appliedPromoIds: string[];
  description: string;
  billNote?: string;
  shippingNote?: string;
  paidAmount: number;
  deliveryAddress: string;
  packageLength?: number;
  packageWidth?: number;
  packageHeight?: number;
  packageWeight?: number;
  orderDiscountType?: 'amount' | 'percent';
  orderDiscountValue?: number;

  // Conversation metadata
  conversationId?: string;
  lastMessage?: string;
  unreadCount: number;
  cachedMessages: CachedMessage[];  // max 20 tin gần nhất

  // UI State
  activeSection: string;
  completedSections: string[];
  scrollPositions: Record<string, number>;   // key = section id, value = scrollTop
  accordionState: Record<string, boolean>;   // key = section id, value = isOpen

  // Meta
  isMinimized: boolean;
  createdAt: string;
  updatedAt: string;
  backendId?: string;  // ID trên server (nếu đã sync)
}

export interface OpenSessionOptions {
  contactId?: string;
  contactName: string;
  contactAvatar?: string;
  contactPhone?: string;
  posCustomerId?: number;
  posCustomerCode?: string;
  conversationId?: string;
}

// Re-export old types for backward compat
export type OrderDraftEntry = WorkspaceSession;
export type OpenDraftOptions = OpenSessionOptions;

// ── Constants ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'workspace_sessions_v1';
const OLD_STORAGE_KEY = 'order_drafts_v1';
const MAX_SESSIONS = 5;
const MAX_CACHED_MESSAGES = 20;
const LOCAL_PERSIST_DELAY = 500;   // ms
const BACKEND_SYNC_DELAY = 2000;   // ms

// ── Debounce helper ────────────────────────────────────────────────────────────

function debounce<T extends (...args: any[]) => void>(fn: T, delay: number): T & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const debounced = (...args: any[]) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
  debounced.cancel = () => { if (timer) clearTimeout(timer); };
  return debounced as unknown as T & { cancel: () => void };
}

// ── Factory ────────────────────────────────────────────────────────────────────

function makeSession(opts: OpenSessionOptions): WorkspaceSession {
  const now = new Date();
  return {
    id: `ws-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    contactId: opts.contactId,
    contactName: opts.contactName || 'Khách hàng',
    contactAvatar: opts.contactAvatar,
    contactPhone: opts.contactPhone,
    posCustomerId: opts.posCustomerId,
    posCustomerCode: opts.posCustomerCode,
    conversationId: opts.conversationId,
    // Cart
    cartItems: [],
    branchId: null,
    paymentMethod: 'cash',
    orderStatus: 1,
    priceBookId: 'standard',
    orderDiscount: 0,
    appliedPromoIds: [],
    description: '',
    billNote: '',
    shippingNote: '',
    paidAmount: 0,
    deliveryAddress: '',
    packageLength: undefined,
    packageWidth: undefined,
    packageHeight: undefined,
    packageWeight: undefined,
    orderDiscountType: 'amount',
    orderDiscountValue: 0,
    // Chat
    lastMessage: undefined,
    unreadCount: 0,
    cachedMessages: [],
    // UI
    activeSection: 'customer',
    completedSections: [],
    scrollPositions: {},
    accordionState: {},
    isMinimized: false,
    createdAt: now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    updatedAt: now.toISOString(),
  };
}

/**
 * Migrate OrderDraftEntry (old format) → WorkspaceSession (new format).
 * Thêm các field mới với default values.
 */
function migrateFromDraft(old: any): WorkspaceSession {
  return {
    ...old,
    // Ensure new fields exist
    conversationId: old.conversationId || undefined,
    lastMessage: old.lastMessage || undefined,
    unreadCount: old.unreadCount ?? 0,
    cachedMessages: old.cachedMessages || [],
    scrollPositions: old.scrollPositions || {},
    accordionState: old.accordionState || {},
    updatedAt: old.updatedAt || new Date().toISOString(),
    backendId: old.backendId || undefined,
  };
}

// ── Store ──────────────────────────────────────────────────────────────────────

export const useWorkspaceSessionStore = defineStore('workspaceSessions', () => {
  const sessions = ref<WorkspaceSession[]>([]);

  // ID của session đang hiển thị full modal (không minimize)
  const activeSessionId = ref<string | null>(null);

  // Session switching state
  const isSwitching = ref(false);

  // ── Computed ────────────────────────────────────────────────────────────────

  const activeSession = computed(() =>
    activeSessionId.value ? sessions.value.find(s => s.id === activeSessionId.value) ?? null : null
  );

  // Chỉ hiện modal khi có active session và session đó không minimize
  const isModalOpen = computed(() =>
    !!activeSession.value && !activeSession.value.isMinimized
  );

  // Có ít nhất 1 session đang mở full
  const hasActiveFullSession = computed(() =>
    sessions.value.some(s => !s.isMinimized)
  );

  // Có thể mở session mới không
  const canOpenNew = computed(() => {
    const hasOpenFull = sessions.value.some(s => !s.isMinimized);
    return sessions.value.length < MAX_SESSIONS && !hasOpenFull;
  });

  // Session đang mở full (nếu có)
  const openFullSession = computed(() =>
    sessions.value.find(s => !s.isMinimized) ?? null
  );

  // Total unread across all sessions
  const totalUnread = computed(() =>
    sessions.value.reduce((sum, s) => sum + (s.unreadCount || 0), 0)
  );

  // Total sessions with cart items (đang soạn đơn)
  const totalDrafts = computed(() =>
    sessions.value.filter(s => s.cartItems.length > 0).length
  );

  // ── Backward compat aliases ─────────────────────────────────────────────────
  // Giữ nguyên API cũ để các component chưa migrate vẫn hoạt động

  const drafts = sessions;
  const activeDraftId = activeSessionId;
  const activeDraft = activeSession;
  const openFullDraft = openFullSession;

  // ── Debounced persist ───────────────────────────────────────────────────────

  const debouncedPersistLocal = debounce(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.value));
    } catch { /* quota exceeded — ignore */ }
  }, LOCAL_PERSIST_DELAY);

  const debouncedSyncBackend = debounce((sessionId: string) => {
    syncSessionToBackend(sessionId);
  }, BACKEND_SYNC_DELAY);

  function persist() {
    debouncedPersistLocal();
  }

  async function syncSessionToBackend(sessionId: string) {
    const session = sessions.value.find(s => s.id === sessionId);
    if (!session) return;
    try {
      await api.put(`/workspace-sessions/${session.backendId || session.id}`, {
        contactId: session.contactId,
        contactName: session.contactName,
        sessionData: session,
      });
    } catch (err) {
      // Backend sync failure is non-critical — LocalStorage is primary
      console.warn('[workspace-sessions] Backend sync failed:', err);
    }
  }

  async function deleteSessionFromBackend(sessionId: string) {
    const session = sessions.value.find(s => s.id === sessionId);
    if (!session?.backendId && !session?.id) return;
    try {
      await api.delete(`/workspace-sessions/${session.backendId || session.id}`);
    } catch {
      // Non-critical
    }
  }

  // ── Actions ─────────────────────────────────────────────────────────────────

  /**
   * Mở session cho contact:
   * - Nếu contact đã có session → expand session đó (thu nhỏ cái đang mở nếu có)
   * - Nếu chưa có → tạo mới (chỉ khi canOpenNew)
   * Trả về id của session được mở, hoặc null nếu không thể.
   */
  function openDraft(opts: OpenSessionOptions): string | null {
    return openSession(opts);
  }

  function openSession(opts: OpenSessionOptions): string | null {
    // Tìm session hiện có của contact này
    const existing = opts.contactId
      ? sessions.value.find(s => s.contactId === opts.contactId)
      : null;

    if (existing) {
      // Thu nhỏ cái đang mở (nếu khác) + expand cái existing + cập nhật info nếu có
      sessions.value = sessions.value.map(s => {
        if (s.id === existing.id) {
          return {
            ...s,
            isMinimized: false,
            contactAvatar: opts.contactAvatar || s.contactAvatar,
            contactPhone: opts.contactPhone || s.contactPhone,
            posCustomerId: opts.posCustomerId || s.posCustomerId,
            posCustomerCode: opts.posCustomerCode || s.posCustomerCode,
            conversationId: opts.conversationId || s.conversationId,
          };
        }
        if (!s.isMinimized) return { ...s, isMinimized: true };
        return s;
      });
      activeSessionId.value = existing.id;
      persist();
      return existing.id;
    }

    if (sessions.value.length >= MAX_SESSIONS) return null;

    // Thu nhỏ tất cả các session đang mở trước khi tạo mới
    sessions.value = sessions.value.map(s => 
      !s.isMinimized ? { ...s, isMinimized: true } : s
    );

    const session = makeSession(opts);
    sessions.value = [...sessions.value, session];  // immutable → trigger reactivity
    activeSessionId.value = session.id;
    persist();
    debouncedSyncBackend(session.id);
    return session.id;
  }

  function minimizeDraft(id: string) { minimizeSession(id); }
  function minimizeSession(id: string) {
    const session = sessions.value.find(s => s.id === id);
    if (!session) return;
    sessions.value = sessions.value.map(s =>
      s.id === id ? { ...s, isMinimized: true } : s
    );
    if (activeSessionId.value === id) activeSessionId.value = null;
    persist();
  }

  function expandDraft(id: string) { expandSession(id); }
  function expandSession(id: string) {
    // Thu nhỏ tất cả + expand session target
    sessions.value = sessions.value.map(s => {
      if (s.id === id) return { ...s, isMinimized: false };
      if (!s.isMinimized) return { ...s, isMinimized: true };
      return s;
    });
    activeSessionId.value = id;
    // Clear unread badge khi user xem session
    clearUnread(id);
    persist();
  }

  function closeDraft(id: string) { closeSession(id); }
  function closeSession(id: string) {
    deleteSessionFromBackend(id);
    sessions.value = sessions.value.filter(s => s.id !== id);  // immutable
    if (activeSessionId.value === id) activeSessionId.value = null;
    persist();
  }

  function updateDraft(id: string, patch: Partial<Omit<WorkspaceSession, 'id'>>) { updateSession(id, patch); }
  function updateSession(id: string, patch: Partial<Omit<WorkspaceSession, 'id'>>) {
    sessions.value = sessions.value.map(s =>
      s.id === id ? { ...s, ...patch, updatedAt: new Date().toISOString() } : s
    );
    persist();
    debouncedSyncBackend(id);
  }

  function setBranchDefault(id: string, branchId: number) {
    const session = sessions.value.find(s => s.id === id);
    if (session && !session.branchId) {
      sessions.value = sessions.value.map(s =>
        s.id === id ? { ...s, branchId } : s
      );
      persist();
    }
  }

  /**
   * Switch active session (for Session Dock click).
   * Saves current UI state, shows skeleton, swaps active.
   */
  async function switchSession(
    targetId: string,
    options?: { saveScrollPosition?: Record<string, number>; saveAccordionState?: Record<string, boolean> },
  ) {
    if (targetId === activeSessionId.value) return;

    // Save current session UI state
    if (activeSessionId.value && options) {
      updateSession(activeSessionId.value, {
        scrollPositions: options.saveScrollPosition || {},
        accordionState: options.saveAccordionState || {},
      });
    }

    // Collapse current, expand target
    sessions.value = sessions.value.map(s => {
      if (s.id === targetId) return { ...s, isMinimized: false };
      if (!s.isMinimized) return { ...s, isMinimized: true };
      return s;
    });
    activeSessionId.value = targetId;

    persist();
  }

  /**
   * Update cached messages for a session (max 20).
   */
  function updateCachedMessages(sessionId: string, messages: CachedMessage[]) {
    const session = sessions.value.find(s => s.id === sessionId);
    if (!session) return;
    const trimmed = messages.slice(-MAX_CACHED_MESSAGES);
    updateSession(sessionId, { cachedMessages: trimmed });
  }

  /**
   * Update unread count for a session.
   */
  function setUnreadCount(sessionId: string, count: number) {
    updateSession(sessionId, { unreadCount: count });
  }

  // ── Persistence & Migration ─────────────────────────────────────────────────

  function hydrate() {
    // Start listening for inbound messages as soon as store is active
    startListeningInboundMessages();
    try {
      // 1. Try load new key
      let raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const loaded: WorkspaceSession[] = JSON.parse(raw);
        const valid = loaded.filter(s =>
          s && typeof s.id === 'string' && s.id && s.contactName && Array.isArray(s.cartItems)
        );
        sessions.value = valid.map(s => ({ ...migrateFromDraft(s), isMinimized: true }));
        if (valid.length !== loaded.length) persist();
        return;
      }

      // 2. Try migrate from old key
      raw = localStorage.getItem(OLD_STORAGE_KEY);
      if (raw) {
        const oldDrafts: any[] = JSON.parse(raw);
        const migrated = oldDrafts
          .filter(d => d && typeof d.id === 'string' && d.id && d.contactName && Array.isArray(d.cartItems))
          .map(d => ({ ...migrateFromDraft(d), isMinimized: true }));
        sessions.value = migrated;
        // Write to new key
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        // Clean up old key
        localStorage.removeItem(OLD_STORAGE_KEY);
        return;
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(OLD_STORAGE_KEY);
    }
  }

  // ── Realtime: workspace:inbound-message listener ────────────────────────────
  // Khi chat:message → use-chat.ts bắn `workspace:inbound-message` kèm
  // { conversationId, contactId, contactName, message }
  // → store tìm session tương ứng, +1 unread (nếu ko phải session đang xem),
  //   push cached message.

  let _listeningInbound = false;

  function startListeningInboundMessages() {
    if (_listeningInbound || typeof window === 'undefined') return;
    _listeningInbound = true;

    window.addEventListener('workspace:inbound-message', ((event: CustomEvent) => {
      const detail = event.detail as {
        conversationId: string;
        contactId?: string;
        contactName?: string;
        message: CachedMessage;
      };
      if (!detail) return;

      // Tìm session matching: ưu tiên conversationId, fallback contactId
      let session = sessions.value.find(s => s.conversationId === detail.conversationId);
      if (!session && detail.contactId) {
        session = sessions.value.find(s => s.contactId === detail.contactId);
      }
      if (!session) return;

      // Nếu session đang active (đang xem) → không tăng unread (user đang nhìn)
      // Chỉ tăng unread cho sessions ở background
      const isCurrentlyViewing = session.id === activeSessionId.value && !session.isMinimized;

      // Update last message preview
      const lastMsg = detail.message?.content
        ? (detail.message.content.length > 50
          ? detail.message.content.slice(0, 50) + '…'
          : detail.message.content)
        : undefined;

      // Push cached message (max 20)
      const newCached = [...(session.cachedMessages || []), detail.message].slice(-MAX_CACHED_MESSAGES);

      updateSession(session.id, {
        lastMessage: lastMsg || session.lastMessage,
        unreadCount: isCurrentlyViewing ? session.unreadCount : (session.unreadCount || 0) + 1,
        cachedMessages: newCached,
        // Link conversation nếu chưa có
        conversationId: session.conversationId || detail.conversationId,
      });
    }) as EventListener);
  }

  /**
   * Reset unread khi user xem session (expand / switch to).
   */
  function clearUnread(sessionId: string) {
    const session = sessions.value.find(s => s.id === sessionId);
    if (session && session.unreadCount > 0) {
      updateSession(sessionId, { unreadCount: 0 });
    }
  }

  /**
   * Load sessions from backend and merge with local (LWW).
   * Called after hydrate for initial load.
   */
  async function syncFromBackend() {
    try {
      const { data } = await api.get<{ success: boolean; sessions: any[] }>('/workspace-sessions');
      if (!data?.success || !data.sessions?.length) return;

      for (const remote of data.sessions) {
        const remoteData = remote.sessionData as WorkspaceSession;
        if (!remoteData?.id) continue;

        const local = sessions.value.find(s => s.id === remoteData.id || s.contactId === remote.contactId);
        if (local) {
          // LWW: compare updatedAt
          const localTime = new Date(local.updatedAt).getTime();
          const remoteTime = new Date(remote.updatedAt).getTime();
          if (remoteTime > localTime) {
            // Remote wins
            sessions.value = sessions.value.map(s =>
              s.id === local.id ? { ...migrateFromDraft(remoteData), isMinimized: true, backendId: remote.id } : s
            );
          }
        } else if (sessions.value.length < MAX_SESSIONS) {
          // New remote session not in local
          sessions.value = [
            ...sessions.value,
            { ...migrateFromDraft(remoteData), isMinimized: true, backendId: remote.id },
          ];
        }
      }
      persist();
    } catch {
      // Backend sync failure is non-critical
    }
  }

  return {
    // State
    sessions,
    activeSessionId,
    activeSession,
    isSwitching,
    isModalOpen,
    hasActiveFullSession,
    canOpenNew,
    openFullSession,
    totalUnread,
    totalDrafts,

    // Backward compat aliases (để các component chưa migrate vẫn hoạt động)
    drafts,
    activeDraftId,
    activeDraft,
    openFullDraft,

    // Actions
    openSession,
    minimizeSession,
    expandSession,
    closeSession,
    updateSession,
    switchSession,
    updateCachedMessages,
    setUnreadCount,
    setBranchDefault,
    syncFromBackend,

    // Backward compat action aliases
    openDraft,
    minimizeDraft,
    expandDraft,
    closeDraft,
    updateDraft,

    // Persistence
    persist,
    hydrate,
    startListeningInboundMessages,
    clearUnread,
  };
});

/**
 * Backward compatibility alias.
 * Existing components importing `useOrderDraftStore` will still work.
 */
export const useOrderDraftStore = useWorkspaceSessionStore;
