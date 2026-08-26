/**
 * use-pos-socket.ts — Subscribe Socket.IO `pos:data:updated` events from backend.
 *
 * Backend emits `pos:data:updated` when:
 *  - Realtime POS Webhook (POST /api/v1/webhooks/pos) is processed
 *  - POS batch sync operations complete in pos-sync-service.ts
 *
 * FE consume:
 *  - POS views: live update tables & cards
 *  - Toast toàn cục đã TẮT (usePosNotification = no-op).
 */
import { type Socket } from 'socket.io-client';
import { createAppSocket } from '@/api/socket';
import { onMounted, onUnmounted } from 'vue';
import { useAuthStore } from '@/stores/auth';

export interface PosDataUpdatedPayload {
  type: 'order' | 'debt' | 'inventory' | 'customer' | 'product';
  action: 'created' | 'updated' | 'deleted' | 'synced' | string;
  orgId: string;
  timestamp: string;
  summary?: string;
  data?: Record<string, unknown>;
}

let socket: Socket | null = null;
let joinedOrgId: string | null = null;

function ensurePosSocket(): Socket {
  if (!socket) {
    socket = createAppSocket();

    socket.on('connect', () => {
      const auth = useAuthStore();
      const orgId = auth.user?.orgId;
      if (orgId) {
        socket!.emit('org:join', { orgId });
        joinedOrgId = orgId;
      }
    });
  }

  if (socket.connected && !joinedOrgId) {
    const auth = useAuthStore();
    const orgId = auth.user?.orgId;
    if (orgId) {
      socket.emit('org:join', { orgId });
      joinedOrgId = orgId;
    }
  }

  return socket;
}

/**
 * Subscribe to 'pos:data:updated' event.
 */
export function usePosSocket(handler?: (payload: PosDataUpdatedPayload) => void): { socket: Socket } {
  const wrappedHandler = (payload: PosDataUpdatedPayload) => {
    try {
      if (handler) {
        handler(payload);
      }
    } catch (err) {
      console.error('[use-pos-socket] Handler error:', err);
    }
  };

  onMounted(() => {
    const s = ensurePosSocket();
    if (handler) {
      s.on('pos:data:updated', wrappedHandler);
    }
  });

  onUnmounted(() => {
    if (socket && handler) {
      socket.off('pos:data:updated', wrappedHandler);
    }
  });

  return { socket: ensurePosSocket() };
}
