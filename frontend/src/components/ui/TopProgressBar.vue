<template>
  <Transition name="progress-fade">
    <div v-if="visible" class="top-progress-bar" aria-hidden="true">
      <div
        class="top-progress-fill"
        :class="{ 'is-finishing': finishing }"
        :style="{ width: progress + '%' }"
      />
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { useProgress } from '@/composables/use-progress';

const { progress, visible, finishing } = useProgress();
</script>

<style scoped>
/* ── Container: pinned to top edge, full width, above everything ── */
.top-progress-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  z-index: 99999;
  pointer-events: none;
  background: transparent;
}

/* ── Fill bar ── */
.top-progress-fill {
  height: 100%;
  width: 0%;
  background: linear-gradient(90deg, #0068FF 0%, #38a9ff 50%, #0068FF 100%);
  background-size: 200% 100%;
  border-radius: 0 2px 2px 0;

  /* Smooth trickle */
  transition: width 0.2s ease-out;

  /* Shimmer animation while loading */
  animation: progress-shimmer 1.6s linear infinite;
}

/* When finishing: snap to 100% fast, no more shimmer */
.top-progress-fill.is-finishing {
  transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  animation: none;
  background: #0068FF;
}

/* Glow drop shadow for premium feel */
.top-progress-fill::after {
  content: '';
  position: absolute;
  right: 0;
  top: 0;
  width: 80px;
  height: 3px;
  background: rgba(255, 255, 255, 0.6);
  filter: blur(4px);
  border-radius: 50%;
}

/* Shimmer keyframe */
@keyframes progress-shimmer {
  0%   { background-position: 200% center; }
  100% { background-position: -200% center; }
}

/* ── Fade in/out transition ── */
.progress-fade-enter-active {
  transition: opacity 0.15s ease;
}
.progress-fade-leave-active {
  transition: opacity 0.35s ease 0.05s;
}
.progress-fade-enter-from,
.progress-fade-leave-to {
  opacity: 0;
}
</style>
