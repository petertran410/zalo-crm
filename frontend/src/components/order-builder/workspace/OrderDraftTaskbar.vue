<template>
  <teleport to="body">
    <transition name="odt-slide">
      <div v-if="store.sessions.length > 0 && !store.hasActiveFullSession" class="odt-taskbar">
        <!-- Label & counter -->
        <div class="odt-label">
          <ShoppingBag :size="14" class="odt-label__icon" />
          <span class="odt-label__title">PHIÊN</span>
          <span class="odt-label__badge">{{ store.sessions.length }} phiên</span>
          <span v-if="store.totalUnread > 0" class="odt-label__unread">💬 {{ store.totalUnread }}</span>
        </div>

        <!-- Avatar Bubble Items (Các phiên đơn nháp) -->
        <transition-group name="odt-bubble-anim" tag="div" class="odt-bubbles">
          <div
            v-for="(draft, idx) in visibleDrafts"
            :key="draft.id"
            class="odt-bubble"
            :class="{ 'odt-bubble--active': !draft.isMinimized }"
            :title="`${draft.contactName || 'Khách hàng'} • ${cartCount(draft)} SP • ${formatVND(grandTotal(draft))}`"
            @click="handleCardClick(draft.id)"
          >
            <!-- Orbit Container -->
            <div class="odt-bubble__orbit">
              <!-- Animated Gradient Ring -->
              <div class="odt-bubble__ring" />

              <!-- Avatar Image or Initials -->
              <img
                v-if="draft.contactAvatar && !avatarErrorMap[draft.id]"
                :src="draft.contactAvatar"
                :alt="draft.contactName"
                class="odt-bubble__img"
                @error="avatarErrorMap[draft.id] = true"
              />
              <div v-else class="odt-bubble__avatar-bg">
                <span class="odt-bubble__initials">{{ getInitials(draft.contactName) }}</span>
              </div>

              <!-- Cart items badge (góc dưới phải) -->
              <div v-if="cartCount(draft) > 0" class="odt-bubble__badge-left" title="Số lượng sản phẩm">
                {{ cartCount(draft) }}
              </div>

              <!-- Close button [X] (góc trên phải - hover mới hiện) -->
              <button
                class="odt-bubble__badge-right"
                title="Xóa đơn nháp"
                @click.stop="confirmClose(draft.id, draft.contactName || 'Khách hàng')"
              >
                <X :size="10" />
              </button>
            </div>

            <!-- Side Label: Name & Total Price -->
            <div class="odt-bubble__info">
              <div class="odt-bubble__name">{{ draft.contactName || 'Khách hàng' }}</div>
              <div class="odt-bubble__price" v-if="grandTotal(draft) > 0">
                {{ formatVND(grandTotal(draft)) }}
              </div>
              <div class="odt-bubble__price odt-bubble__price--empty" v-else>
                Chưa có SP
              </div>
            </div>
          </div>
        </transition-group>

        <!-- Overflow button (khi > 3 draft) -->
        <div v-if="overflowDrafts.length > 0" class="odt-overflow">
          <button class="odt-overflow__btn" @click="overflowOpen = !overflowOpen">
            <ChevronUp v-if="overflowOpen" :size="13" />
            <ChevronDown v-else :size="13" />
            <span>+{{ overflowDrafts.length }}</span>
          </button>

          <!-- Overflow menu -->
          <transition name="odt-popup">
            <div v-if="overflowOpen" class="odt-overflow__menu">
              <div
                v-for="draft in overflowDrafts"
                :key="draft.id"
                class="odt-overflow__item"
                @click="handleCardClick(draft.id); overflowOpen = false"
              >
                <ShoppingBag :size="14" />
                <span class="odt-overflow__name">{{ draft.contactName }}</span>
                <span class="odt-overflow__meta">{{ cartCount(draft) }} SP</span>
                <button
                  class="odt-overflow__close"
                  @click.stop="confirmClose(draft.id, draft.contactName)"
                >
                  <X :size="10" />
                </button>
              </div>
            </div>
          </transition>
        </div>
      </div>
    </transition>

    <!-- Confirm close dialog -->
    <transition name="odt-fade">
      <div v-if="closeConfirm.open" class="odt-confirm-overlay" @click.self="closeConfirm.open = false">
        <div class="odt-confirm-box">
          <div class="odt-confirm-title">🗑 Xóa đơn nháp?</div>
          <div class="odt-confirm-body">
            Đơn hàng cho <strong>{{ closeConfirm.name }}</strong> sẽ bị xóa vĩnh viễn.
          </div>
          <div class="odt-confirm-actions">
            <button class="odt-confirm-cancel" @click="closeConfirm.open = false">Hủy</button>
            <button class="odt-confirm-ok" @click="doClose">Xóa</button>
          </div>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import { ShoppingBag, Maximize2, Minus, X, ChevronUp, ChevronDown } from 'lucide-vue-next';
import { useWorkspaceSessionStore, type WorkspaceSession as OrderDraftEntry } from '@/stores/use-workspace-sessions';
import { formatVND, getEffectiveProductPrice } from '@/components/order-builder/types';

const store = useWorkspaceSessionStore();
const overflowOpen = ref(false);
const avatarErrorMap = reactive<Record<string, boolean>>({});

// Visible = tối đa 5 đầu tiên
const visibleDrafts = computed(() => store.sessions.slice(0, 5));
const overflowDrafts = computed(() => store.sessions.slice(5));

function getInitials(name: string): string {
  if (!name) return 'KH';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function cartCount(draft: OrderDraftEntry): number {
  return draft.cartItems.reduce((s, c) => s + c.quantity, 0);
}

function grandTotal(draft: OrderDraftEntry): number {
  const pb = draft.priceBookId || 'standard';
  const subtotal = draft.cartItems.reduce((s, item) => {
    const unit = getEffectiveProductPrice(item.product.basePrice, pb);
    return s + Math.max(0, unit * item.quantity - (item.discount || 0));
  }, 0);
  return Math.max(0, subtotal - (draft.orderDiscount || 0));
}

function handleCardClick(id: string) {
  const draft = store.drafts.find(d => d.id === id);
  if (!draft) return;
  if (draft.isMinimized) {
    store.expandDraft(id);
  } else {
    store.minimizeDraft(id);
  }
}

// Confirm close
const closeConfirm = ref({ open: false, id: '', name: '' });
function confirmClose(id: string, name: string) {
  closeConfirm.value = { open: true, id, name };
}
function doClose() {
  store.closeDraft(closeConfirm.value.id);
  closeConfirm.value.open = false;
}
</script>

<style scoped>
/* ── Taskbar ──────────────────────────────────────────────────────────── */
.odt-taskbar {
  position: fixed;
  bottom: 20px;
  right: 24px;
  z-index: 8500;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid #cbd5e1;
  border-radius: 24px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.15), 0 2px 8px rgba(0, 0, 0, 0.06);
  pointer-events: auto;
}

/* Slide up/down animation */
.odt-slide-enter-active, .odt-slide-leave-active { transition: transform 0.25s ease, opacity 0.25s ease; }
.odt-slide-enter-from, .odt-slide-leave-to { transform: translateY(20px); opacity: 0; }

/* ── Label ───────────────────────────────────────────────────────────── */
.odt-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  color: #334155;
  letter-spacing: 0.02em;
  white-space: nowrap;
  user-select: none;
  padding-right: 8px;
  margin-right: 2px;
  border-right: 1px solid #e2e8f0;
}
.odt-label__icon {
  color: #0068FF;
}
.odt-label__title {
  font-size: 10.5px;
  font-weight: 800;
  color: #1e293b;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}
.odt-label__badge {
  background: #eff6ff;
  color: #0068FF;
  font-size: 10.5px;
  font-weight: 800;
  padding: 1px 6px;
  border-radius: 10px;
  border: 1px solid #bfdbfe;
}

/* ── Bubbles container ───────────────────────────────────────────────── */
.odt-bubbles {
  display: flex;
  align-items: center;
  gap: 10px;
}

.odt-bubble-anim-enter-active, .odt-bubble-anim-leave-active { transition: all 0.2s ease; }
.odt-bubble-anim-enter-from { opacity: 0; transform: scale(0.8) translateY(10px); }
.odt-bubble-anim-leave-to { opacity: 0; transform: scale(0.8) translateY(10px); }

/* ── Single Bubble Item ─────────────────────────────────────────────── */
.odt-bubble {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px 4px 4px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 20px;
  cursor: pointer;
  user-select: none;
  transition: all 0.15s ease;
}
.odt-bubble:hover {
  background: #eff6ff;
  border-color: #93c5fd;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 104, 255, 0.12);
}
.odt-bubble--active {
  background: #eff6ff;
  border-color: #3b82f6;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.15);
}

/* ── Orbit Container (Avatar Ring) ───────────────── */
.odt-bubble__orbit {
  position: relative;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.odt-bubble__ring {
  position: absolute;
  inset: -1px;
  border-radius: 50%;
  padding: 2px;
  background: conic-gradient(from 0deg, transparent 0%, #10b981 35%, #0068FF 70%, #38bdf8 92%, #ffffff 100%);
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  animation: odt-ring-spin 3.5s linear infinite;
  opacity: 0.8;
}

.odt-bubble--active .odt-bubble__ring {
  opacity: 1;
  background: conic-gradient(from 0deg, transparent 0%, #06b6d4 30%, #0068FF 65%, #22c55e 90%, #ffffff 100%);
  animation: odt-ring-spin 2s linear infinite;
}

@keyframes odt-ring-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.odt-bubble__img {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
}

.odt-bubble__avatar-bg {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #0068FF, #2563eb);
  display: flex;
  align-items: center;
  justify-content: center;
}

.odt-bubble__initials {
  font-size: 11.5px;
  font-weight: 800;
  color: #ffffff;
}

/* 1) Bottom-Right Badge (Số sản phẩm) */
.odt-bubble__badge-left {
  position: absolute;
  bottom: -2px;
  right: -2px;
  z-index: 5;
  background: #10b981;
  color: #ffffff;
  font-size: 9.5px;
  font-weight: 800;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid #ffffff;
  box-shadow: 0 1px 3px rgba(16, 185, 129, 0.3);
}

/* 2) Top-Right Badge (Nút tắt [X] - hover mới hiện) */
.odt-bubble__badge-right {
  position: absolute;
  top: -3px;
  right: -3px;
  z-index: 6;
  background: #ef4444;
  color: #ffffff;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid #ffffff;
  padding: 0;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease, transform 0.15s ease;
  box-shadow: 0 1px 4px rgba(239, 68, 68, 0.4);
}
.odt-bubble:hover .odt-bubble__badge-right {
  opacity: 1;
}

/* Side Info: Name & Price */
.odt-bubble__info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
  text-align: left;
}
.odt-bubble__name {
  font-size: 11.5px;
  font-weight: 700;
  color: #1e293b;
  max-width: 85px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.25;
}
.odt-bubble__price {
  font-size: 10.5px;
  font-weight: 800;
  color: #0068FF;
  max-width: 85px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.25;
  margin-top: 1px;
}
.odt-bubble__price--empty {
  color: #94a3b8;
  font-style: italic;
  font-weight: 500;
}

/* ── Overflow ────────────────────────────────────────────────────────── */
.odt-overflow { position: relative; }

.odt-overflow__btn {
  display: flex;
  align-items: center;
  gap: 5px;
  background: #1e293b;
  color: #e2e8f0;
  border: none;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  font-family: inherit;
}
.odt-overflow__btn:hover { background: #334155; }

.odt-overflow__menu {
  position: absolute;
  bottom: calc(100% + 8px);
  right: 0;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  min-width: 220px;
  overflow: hidden;
  z-index: 10;
}

.odt-popup-enter-active, .odt-popup-leave-active { transition: all 0.18s ease; }
.odt-popup-enter-from, .odt-popup-leave-to { opacity: 0; transform: translateY(8px); }

.odt-overflow__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  color: #475569;
  font-size: 12px;
  transition: background 0.1s;
}
.odt-overflow__item:hover { background: #f8fafc; }
.odt-overflow__name { flex: 1; font-weight: 600; color: #1e293b; }
.odt-overflow__meta { font-size: 10px; color: #94a3b8; }
.odt-overflow__close {
  width: 18px; height: 18px;
  border: none; background: transparent; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  border-radius: 4px; color: #94a3b8;
}
.odt-overflow__close:hover { background: #fef2f2; color: #ef4444; }

/* ── Label ───────────────────────────────────────────────────────────── */
.odt-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  color: #334155;
  letter-spacing: 0.02em;
  white-space: nowrap;
  user-select: none;
  padding-right: 8px;
  margin-right: 2px;
  border-right: 1px solid #e2e8f0;
}
.odt-label__icon {
  color: #0068FF;
}
.odt-label__title {
  font-size: 10.5px;
  font-weight: 800;
  color: #1e293b;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}
.odt-label__badge {
  background: #eff6ff;
  color: #0068FF;
  font-size: 10.5px;
  font-weight: 800;
  padding: 1px 6px;
  border-radius: 10px;
  border: 1px solid #bfdbfe;
}

/* ── Confirm dialog ──────────────────────────────────────────────────── */
.odt-confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.odt-fade-enter-active, .odt-fade-leave-active { transition: opacity 0.18s ease; }
.odt-fade-enter-from, .odt-fade-leave-to { opacity: 0; }

.odt-confirm-box {
  background: #fff;
  border-radius: 14px;
  padding: 24px;
  width: 320px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
}
.odt-confirm-title {
  font-size: 15px;
  font-weight: 800;
  color: #1e293b;
  margin-bottom: 10px;
}
.odt-confirm-body {
  font-size: 13px;
  color: #475569;
  line-height: 1.5;
  margin-bottom: 20px;
}
.odt-confirm-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.odt-confirm-cancel,
.odt-confirm-ok {
  padding: 8px 18px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
  border: none;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
}
.odt-confirm-cancel { background: #f1f5f9; color: #475569; }
.odt-confirm-cancel:hover { background: #e2e8f0; }
.odt-confirm-ok { background: #ef4444; color: #fff; }
.odt-confirm-ok:hover { background: #dc2626; }
</style>
