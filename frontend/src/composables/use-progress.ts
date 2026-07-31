/**
 * useProgress — Global navigation progress bar singleton.
 * Used by router guards (beforeEach/afterEach) and TopProgressBar.vue.
 *
 * Strategy:
 *  - start()     → reset + bắt đầu trickle từ 0
 *  - finish()    → snap lên 100%, fade out
 *  - increment() → API request bắt đầu (tăng pending counter)
 *  - decrement() → API request kết thúc (giảm counter; tự finish nếu đủ điều kiện)
 *
 * Bar chỉ finish sau khi CẢ HAI:
 *   1. routerDone = true  (afterEach đã fire)
 *   2. pendingCount = 0   (không còn API request đang chờ)
 */
import { ref, readonly } from 'vue';

const progress   = ref(0);        // 0–100
const visible    = ref(false);    // controls opacity transition
const finishing  = ref(false);    // true khi đang snap → 100%

// Internal state — không export ra ngoài
let trickleTimer:  ReturnType<typeof setInterval> | null = null;
let pendingCount   = 0;    // số API request đang pending
let routerDone     = false; // afterEach đã fire chưa
let started        = false; // start() đã được gọi chưa (tránh decrement vô tình trigger lần đầu)

function clearTrickle() {
  if (trickleTimer !== null) {
    clearInterval(trickleTimer);
    trickleTimer = null;
  }
}

function tryFinish() {
  if (routerDone && pendingCount <= 0 && started) {
    _finish();
  }
}

function start() {
  clearTrickle();
  finishing.value  = false;
  progress.value   = 0;
  visible.value    = true;
  routerDone       = false;
  pendingCount     = 0;
  started          = true;

  // Trickle: giảm dần khi tiến gần 85%
  trickleTimer = setInterval(() => {
    if (progress.value >= 85) {
      clearTrickle();
      return;
    }
    const remaining = 85 - progress.value;
    const increment = Math.max(0.5, remaining * 0.06);
    progress.value = Math.min(85, progress.value + increment);
  }, 120);
}

function _finish() {
  if (!started) return;
  started = false;
  clearTrickle();
  finishing.value = true;
  progress.value  = 100;

  setTimeout(() => {
    visible.value   = false;
    finishing.value = false;
    progress.value  = 0;
  }, 450);
}

/** Gọi từ router afterEach */
function finish() {
  routerDone = true;
  tryFinish();
}

/** Gọi từ axios request interceptor — mỗi request bắt đầu */
function increment() {
  if (!started) return; // chỉ track request phát sinh trong navigation cycle hiện tại
  pendingCount++;
}

/** Gọi từ axios response interceptor — mỗi request kết thúc (success hoặc error) */
function decrement() {
  if (!started && pendingCount <= 0) return;
  pendingCount = Math.max(0, pendingCount - 1);
  tryFinish();
}

export function useProgress() {
  return {
    progress:  readonly(progress),
    visible:   readonly(visible),
    finishing: readonly(finishing),
    start,
    finish,
    increment,
    decrement,
  };
}
