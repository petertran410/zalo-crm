<template>
  <!-- Session Dock: thanh dọc mép phải, giữa Order Builder và MiniChat -->
  <div v-if="sessions.length > 1" class="sd-dock">
    <!-- Title -->
    <div class="sd-dock__title">
      <ShoppingBag :size="12" />
      <span>{{ sessions.length }}</span>
    </div>

    <!-- Session bubbles -->
    <div class="sd-dock__list">
      <div
        v-for="(session, idx) in sessions"
        :key="session.id"
        class="sd-bubble"
        :class="{
          'sd-bubble--active': session.id === activeSessionId,
          'sd-bubble--has-items': session.cartItems.length > 0,
        }"
        :title="`${session.contactName} • ${cartCount(session)} SP`"
        @click="$emit('switch', session.id)"
      >
        <!-- Orbit ring (active indicator) -->
        <div class="sd-bubble__orbit">
          <div class="sd-bubble__ring" />

          <!-- Product count badge -->
          <div v-if="cartCount(session) > 0" class="sd-bubble__badge-count">
            {{ cartCount(session) }}
          </div>

          <!-- Unread badge -->
          <div v-if="session.unreadCount > 0" class="sd-bubble__badge-unread">
            {{ session.unreadCount > 9 ? '9+' : session.unreadCount }}
          </div>

          <!-- Close button (only on hover) -->
          <button
            class="sd-bubble__close"
            title="Xóa phiên"
            @click.stop="$emit('discard', session.id, session.contactName)"
          >
            <X :size="8" />
          </button>

          <!-- Center: Number or initials -->
          <div class="sd-bubble__center">
            <span class="sd-bubble__number">{{ idx + 1 }}</span>
          </div>
        </div>

        <!-- Name label -->
        <div class="sd-bubble__name">{{ shortName(session.contactName) }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ShoppingBag, X } from 'lucide-vue-next';
import type { WorkspaceSession } from '@/stores/use-workspace-sessions';

defineProps<{
  sessions: WorkspaceSession[];
  activeSessionId: string | null;
  isSwitching: boolean;
}>();

defineEmits<{
  switch: [sessionId: string];
  discard: [sessionId: string, contactName: string];
}>();

function cartCount(session: WorkspaceSession): number {
  return session.cartItems.reduce((s, c) => s + c.quantity, 0);
}

function shortName(name: string): string {
  if (!name) return 'KH';
  const parts = name.trim().split(/\s+/);
  // Show last word only to fit in narrow dock
  return parts[parts.length - 1].slice(0, 6);
}
</script>

<style scoped>
/* ── Session Dock Container ────────────────────────────── */
.sd-dock {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 56px;
  min-width: 56px;
  padding: 10px 4px;
  background: rgba(241, 245, 249, 0.95);
  backdrop-filter: blur(6px);
  border-left: 1px solid rgba(203, 213, 225, 0.5);
  border-right: 1px solid rgba(203, 213, 225, 0.5);
  border-radius: 0;
  overflow-y: auto;
  overflow-x: hidden;
  user-select: none;
}

/* ── Title ────────────────────────────────────────────── */
.sd-dock__title {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  font-weight: 700;
  color: #475569;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  white-space: nowrap;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(203, 213, 225, 0.6);
  width: 100%;
  justify-content: center;
}

/* ── Bubble list ──────────────────────────────────────── */
.sd-dock__list {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  width: 100%;
}

/* ── Bubble item ──────────────────────────────────────── */
.sd-bubble {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  cursor: pointer;
  transition: transform 0.15s ease;
  position: relative;
}
.sd-bubble:hover {
  transform: scale(1.08);
}

/* ── Orbit container ──────────────────────────────────── */
.sd-bubble__orbit {
  position: relative;
  width: 38px;
  height: 38px;
}

/* ── Gradient ring (active indicator) ─────────────────── */
.sd-bubble__ring {
  position: absolute;
  inset: -2px;
  border-radius: 50%;
  padding: 2px;
  background: linear-gradient(135deg, #e2e8f0, #cbd5e1);
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px));
  mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px));
  transition: all 0.3s ease;
}

.sd-bubble--active .sd-bubble__ring {
  background: linear-gradient(135deg, #3b82f6, #8b5cf6, #ec4899, #3b82f6);
  background-size: 300% 300%;
  animation: sd-ring-rotate 3s linear infinite;
}

@keyframes sd-ring-rotate {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

/* ── Center circle ────────────────────────────────────── */
.sd-bubble__center {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: linear-gradient(145deg, #ffffff, #f1f5f9);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  transition: background 0.2s ease;
}

.sd-bubble--active .sd-bubble__center {
  background: linear-gradient(145deg, #eff6ff, #dbeafe);
}

.sd-bubble__number {
  font-size: 14px;
  font-weight: 700;
  color: #64748b;
  line-height: 1;
}
.sd-bubble--active .sd-bubble__number {
  color: #2563eb;
}

/* ── Product count badge (bottom-left) ────────────────── */
.sd-bubble__badge-count {
  position: absolute;
  bottom: -2px;
  left: -4px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: #3b82f6;
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  z-index: 2;
}

/* ── Unread badge (top-right) ─────────────────────────── */
.sd-bubble__badge-unread {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: #ef4444;
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  z-index: 2;
  animation: sd-pulse 2s infinite;
}

@keyframes sd-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.15); }
}

/* ── Close button (hover only) ────────────────────────── */
.sd-bubble__close {
  position: absolute;
  top: -3px;
  left: -3px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #ef4444;
  color: #fff;
  border: 1.5px solid #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transform: scale(0.6);
  transition: all 0.15s ease;
  z-index: 3;
  padding: 0;
}
.sd-bubble:hover .sd-bubble__close {
  opacity: 1;
  transform: scale(1);
}
.sd-bubble__close:hover {
  background: #dc2626;
}

/* ── Name label ───────────────────────────────────────── */
.sd-bubble__name {
  font-size: 9px;
  font-weight: 600;
  color: #64748b;
  max-width: 52px;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.2;
}
.sd-bubble--active .sd-bubble__name {
  color: #2563eb;
}
</style>
