/**
 * Hold-and-pop-out drag reorder via Pointer Events.
 * Clone teleports to body (position: fixed). holdDelayMs default 180.
 */
import { ref, type Ref } from 'vue';

export function usePointerDragReorder<T>(opts: {
  items: Ref<T[]>;
  getKey: (item: T) => string;
  onReorder: (next: T[]) => void | Promise<void>;
  holdDelayMs?: number;
}) {
  const holdDelay = opts.holdDelayMs ?? 180;
  const activeKey = ref<string | null>(null);
  const ghostIndex = ref<number>(-1);
  const popOut = ref<{ x: number; y: number; w: number; h: number; src: string | null } | null>(null);
  const saving = ref(false);

  let holdTimer: number | null = null;
  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let fromIndex = -1;
  let tileRects: DOMRect[] = [];
  let dragging = false;
  let el: HTMLElement | null = null;

  function clearHold() {
    if (holdTimer != null) {
      window.clearTimeout(holdTimer);
      holdTimer = null;
    }
  }

  function endDrag(commit: boolean) {
    clearHold();
    if (pointerId != null && el) {
      try { el.releasePointerCapture(pointerId); } catch { /* */ }
    }
    const from = fromIndex;
    const to = ghostIndex.value;
    activeKey.value = null;
    ghostIndex.value = -1;
    popOut.value = null;
    pointerId = null;
    fromIndex = -1;
    tileRects = [];
    dragging = false;
    el = null;

    if (commit && from >= 0 && to >= 0 && from !== to) {
      const arr = [...opts.items.value];
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      void Promise.resolve(opts.onReorder(arr));
    }
  }

  function measureTiles(container: HTMLElement) {
    const tiles = container.querySelectorAll<HTMLElement>('[data-drag-key]');
    tileRects = Array.from(tiles).map((t) => t.getBoundingClientRect());
  }

  function nearestIndex(x: number, y: number): number {
    if (!tileRects.length) return -1;
    let best = 0;
    let bestDist = Infinity;
    tileRects.forEach((r, i) => {
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const d = (cx - x) ** 2 + (cy - y) ** 2;
      if (d < bestDist) { bestDist = d; best = i; }
    });
    return best;
  }

  function onPointerDown(e: PointerEvent, key: string, container: HTMLElement, imgSrc?: string | null) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (saving.value) return;
    const items = opts.items.value;
    fromIndex = items.findIndex((it) => opts.getKey(it) === key);
    if (fromIndex < 0) return;

    el = e.currentTarget as HTMLElement;
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    measureTiles(container);

    clearHold();
    holdTimer = window.setTimeout(() => {
      dragging = true;
      activeKey.value = key;
      ghostIndex.value = fromIndex;
      const rect = el!.getBoundingClientRect();
      popOut.value = {
        x: e.clientX - rect.width / 2,
        y: e.clientY - rect.height / 2,
        w: rect.width,
        h: rect.height,
        src: imgSrc ?? null,
      };
      try { el!.setPointerCapture(pointerId!); } catch { /* */ }
    }, holdDelay);
  }

  function onPointerMove(e: PointerEvent) {
    if (pointerId != null && e.pointerId !== pointerId) return;
    if (!dragging) {
      // cancel hold if moved too far before activate
      if (holdTimer != null && (Math.abs(e.clientX - startX) > 8 || Math.abs(e.clientY - startY) > 8)) {
        clearHold();
      }
      return;
    }
    e.preventDefault();
    if (popOut.value) {
      popOut.value = {
        ...popOut.value,
        x: e.clientX - popOut.value.w / 2,
        y: e.clientY - popOut.value.h / 2,
      };
    }
    ghostIndex.value = nearestIndex(e.clientX, e.clientY);
  }

  function onPointerUp(e: PointerEvent) {
    if (pointerId != null && e.pointerId !== pointerId) return;
    if (!dragging) {
      clearHold();
      pointerId = null;
      return;
    }
    endDrag(true);
  }

  function onPointerCancel() {
    endDrag(false);
  }

  function onKeyEscape() {
    if (dragging) endDrag(false);
  }

  return {
    activeKey,
    ghostIndex,
    popOut,
    saving,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onKeyEscape,
  };
}
