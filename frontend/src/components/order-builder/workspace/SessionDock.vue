<template>
  <!-- Chat Heads Dock: thanh dọc mép phải, bên phải MiniChat -->
  <div class="ch-dock">
    <!-- ─── Nhóm 1: Phiên Đang Mở (Active Sessions) ─── -->
    <div v-if="sessions.length > 0" class="ch-group">
      <div
        v-for="session in sessions"
        :key="session.id"
        class="ch-bubble"
        :class="{
          'ch-bubble--active': session.id === activeSessionId,
        }"
        :title="session.contactName"
        @click="$emit('switch', session.id)"
      >
        <!-- Orbit ring (active indicator) -->
        <div class="ch-bubble__orbit">
          <!-- Avatar -->
          <img
            v-if="session.contactAvatar"
            :src="session.contactAvatar"
            :alt="session.contactName"
            class="ch-bubble__avatar"
          />
          <div v-else class="ch-bubble__avatar ch-bubble__avatar--initials" :style="initialsStyle(session.contactName)">
            {{ initials(session.contactName) }}
          </div>

          <!-- Cart items badge (góc dưới trái) -->
          <div v-if="cartCount(session) > 0" class="ch-badge ch-badge--cart">
            {{ cartCount(session) }}
          </div>

          <!-- Unread message badge (góc trên phải) -->
          <div v-if="(session.unreadCount || 0) > 0" class="ch-badge ch-badge--unread">
            {{ (session.unreadCount || 0) > 9 ? '9+' : session.unreadCount }}
          </div>

          <!-- Close button (hover only) -->
          <button
            v-if="sessions.length > 1"
            class="ch-bubble__close"
            title="Xóa phiên"
            @click.stop="$emit('discard', session.id, session.contactName)"
          >
            <X :size="8" />
          </button>
        </div>

        <!-- Hover tooltip label -->
        <div class="ch-tooltip">
          <div class="ch-tooltip__name">{{ session.contactName }}</div>
          <div class="ch-tooltip__sub">
            {{ cartCount(session) > 0 ? `🛒 ${cartCount(session)} SP` : (session.lastMessage || 'Chưa có đơn') }}
          </div>
        </div>
      </div>
    </div>

    <!-- ─── Divider giữa 2 nhóm ─── -->
    <div v-if="sessions.length > 0 && inboundContacts.length > 0" class="ch-divider" />

    <!-- ─── Nhóm 2: Khách vừa nhắn tới (chưa có phiên) ─── -->
    <div v-if="inboundContacts.length > 0" class="ch-group">
      <div
        v-for="contact in inboundContacts"
        :key="contact.conversationId"
        class="ch-bubble ch-bubble--inbound"
        :title="`${contact.contactName} — Tin nhắn mới`"
        @click="$emit('open-inbound', contact)"
      >
        <div class="ch-bubble__orbit">
          <!-- Avatar -->
          <img
            v-if="contact.contactAvatar"
            :src="contact.contactAvatar"
            :alt="contact.contactName"
            class="ch-bubble__avatar"
          />
          <div v-else class="ch-bubble__avatar ch-bubble__avatar--initials" :style="initialsStyle(contact.contactName)">
            {{ initials(contact.contactName) }}
          </div>

          <!-- Unread badge -->
          <div class="ch-badge ch-badge--unread">
            {{ (contact.unreadCount || 1) > 9 ? '9+' : (contact.unreadCount || 1) }}
          </div>
        </div>

        <!-- Hover tooltip -->
        <div class="ch-tooltip">
          <div class="ch-tooltip__name">{{ contact.contactName }}</div>
          <div class="ch-tooltip__sub">{{ contact.lastMessage || 'Tin nhắn mới' }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { X } from 'lucide-vue-next';
import type { WorkspaceSession } from '@/stores/use-workspace-sessions';

export interface InboundContact {
  conversationId: string;
  contactId?: string;
  contactName: string;
  contactAvatar?: string;
  contactPhone?: string;
  lastMessage?: string;
  unreadCount?: number;
}

defineProps<{
  sessions: WorkspaceSession[];
  activeSessionId: string | null;
  isSwitching: boolean;
  inboundContacts: InboundContact[];
}>();

defineEmits<{
  switch: [sessionId: string];
  discard: [sessionId: string, contactName: string];
  'open-inbound': [contact: InboundContact];
}>();

function cartCount(session: WorkspaceSession): number {
  return session.cartItems.reduce((s, c) => s + c.quantity, 0);
}

function initials(name: string): string {
  if (!name) return 'KH';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
}

// Generate a deterministic gradient from name for fallback avatar
function initialsStyle(name: string): Record<string, string> {
  const hash = name.split('').reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
  const hue1 = Math.abs(hash) % 360;
  const hue2 = (hue1 + 40) % 360;
  return {
    background: `linear-gradient(135deg, hsl(${hue1}, 65%, 55%), hsl(${hue2}, 70%, 45%))`,
  };
}
</script>

<style scoped>
/* ── Chat Heads Dock Container ──────────────────────────── */
.ch-dock {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 64px;
  min-width: 64px;
  padding: 14px 6px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 20px;
  box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.08), 0 4px 12px rgba(0, 0, 0, 0.04);
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  scrollbar-color: rgba(148, 163, 184, 0.3) transparent;
}
.ch-dock::-webkit-scrollbar { width: 3px; }
.ch-dock::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.3); border-radius: 3px; }

/* ── Group wrapper ──────────────────────────────────────── */
.ch-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

/* ── Divider between groups ─────────────────────────────── */
.ch-divider {
  width: 28px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(148, 163, 184, 0.5), transparent);
  margin: 4px 0;
}

/* ── Bubble base ────────────────────────────────────────── */
.ch-bubble {
  position: relative;
  cursor: pointer;
  transition: transform 0.15s ease;
}
.ch-bubble:active {
  transform: scale(0.92);
}

/* ── Orbit ring container ───────────────────────────────── */
.ch-bubble__orbit {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  position: relative;
  border: 2.5px solid transparent;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

/* Active session: glowing blue ring */
.ch-bubble--active .ch-bubble__orbit {
  border-color: #0068FF;
  box-shadow: 0 0 0 2px rgba(0, 104, 255, 0.2);
}

/* Inbound (group 2): subtle pulsing ring */
.ch-bubble--inbound .ch-bubble__orbit {
  border-color: rgba(239, 68, 68, 0.4);
  animation: ch-inbound-pulse 2.5s ease-in-out infinite;
}
@keyframes ch-inbound-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.3); }
  50% { box-shadow: 0 0 0 5px rgba(239, 68, 68, 0); }
}

/* ── Avatar ─────────────────────────────────────────────── */
.ch-bubble__avatar {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ch-bubble__avatar--initials {
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
}

/* ── Badges ─────────────────────────────────────────────── */
.ch-badge {
  position: absolute;
  font-size: 9px;
  font-weight: 800;
  line-height: 1;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  border: 2px solid #fff;
}

/* Cart badge: bottom-left */
.ch-badge--cart {
  bottom: -2px;
  left: -4px;
  background: #475569;
  color: #fff;
}

/* Unread badge: top-right, red with pulse */
.ch-badge--unread {
  top: -3px;
  right: -4px;
  background: #ef4444;
  color: #fff;
  animation: ch-unread-pulse 2s ease-in-out infinite;
}
@keyframes ch-unread-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
  50% { box-shadow: 0 0 0 4px rgba(239, 68, 68, 0); }
}

/* ── Close button (hover only) ──────────────────────────── */
.ch-bubble__close {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.75);
  border: 1.5px solid #fff;
  color: #fff;
  display: none;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  z-index: 5;
  transition: background 0.15s ease;
}
.ch-bubble__close:hover { background: #ef4444; }
.ch-bubble:hover .ch-bubble__close { display: flex; }
/* Hide unread badge when close is visible */
.ch-bubble:hover .ch-badge--unread { display: none; }

/* ── Hover Tooltip ──────────────────────────────────────── */
.ch-tooltip {
  position: absolute;
  right: calc(100% + 10px);
  top: 50%;
  transform: translateY(-50%) translateX(8px);
  opacity: 0;
  pointer-events: none;
  white-space: nowrap;
  background: rgba(15, 23, 42, 0.92);
  backdrop-filter: blur(8px);
  border-radius: 10px;
  padding: 6px 10px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  transition: all 0.2s cubic-bezier(0.22, 1, 0.36, 1);
  z-index: 20;
}
.ch-bubble:hover .ch-tooltip {
  opacity: 1;
  transform: translateY(-50%) translateX(0);
  pointer-events: auto;
}
.ch-tooltip__name {
  font-size: 12px;
  font-weight: 700;
  color: #e2e8f0;
}
.ch-tooltip__sub {
  font-size: 10px;
  color: #94a3b8;
  margin-top: 1px;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
