<!--
  WorkImageAnnotator — canvas annotate (pen/arrow/rect/text). Default color red.
  Apply → POST /media/:id/annotate with base64 → emit applied { blobId, url }.
-->
<template>
  <Teleport to="body">
    <div v-if="modelValue" class="wia-overlay" @click.self="close">
      <div class="wia-box">
        <header class="wia-head">
          <b>Annotate ảnh</b>
          <button type="button" class="wia-x" @click="close"><v-icon size="18">mdi-close</v-icon></button>
        </header>

        <div class="wia-tools">
          <button v-for="t in TOOLS" :key="t.key" type="button" class="tool" :class="{ on: tool === t.key }" @click="tool = t.key" :title="t.label">
            <v-icon size="16">{{ t.icon }}</v-icon>
          </button>
          <span class="sep" />
          <button
            v-for="c in COLORS" :key="c" type="button" class="swatch"
            :class="{ on: color === c }" :style="{ background: c }" @click="color = c"
          />
          <input type="color" v-model="color" class="color-input" title="Màu tuỳ chọn" />
          <span class="sep" />
          <select v-model.number="strokeW" class="w-sel">
            <option :value="2">Mảnh</option>
            <option :value="4">Vừa</option>
            <option :value="8">Đậm</option>
          </select>
          <button type="button" class="tool" title="Hoàn tác" @click="undo" :disabled="!strokes.length"><v-icon size="16">mdi-undo</v-icon></button>
          <button type="button" class="tool" title="Làm lại" @click="redo" :disabled="!redoStack.length"><v-icon size="16">mdi-redo</v-icon></button>
          <button type="button" class="tool" title="Xoá hết" @click="clear"><v-icon size="16">mdi-delete-outline</v-icon></button>
        </div>

        <div class="wia-canvas-wrap" ref="wrapRef">
          <canvas
            ref="canvasRef"
            @pointerdown="onDown"
            @pointermove="onMove"
            @pointerup="onUp"
            @pointercancel="onUp"
          />
        </div>

        <footer class="wia-foot">
          <button type="button" class="btn secondary" @click="close">Huỷ</button>
          <button type="button" class="btn primary" :disabled="saving || !strokes.length" @click="apply">
            {{ saving ? 'Đang lưu…' : 'Áp dụng' }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { api } from '@/api/index';

type Tool = 'pen' | 'arrow' | 'rect' | 'text';
type Stroke =
  | { type: 'pen'; color: string; width: number; points: Array<{ x: number; y: number }> }
  | { type: 'arrow'; color: string; width: number; x1: number; y1: number; x2: number; y2: number }
  | { type: 'rect'; color: string; width: number; x: number; y: number; w: number; h: number }
  | { type: 'text'; color: string; width: number; x: number; y: number; text: string; fontSize: number };

const props = defineProps<{
  modelValue: boolean;
  mediaAssetId: string;
  imageUrl: string;
}>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'applied', payload: { blobId: string; url: string }): void;
}>();

const TOOLS: { key: Tool; label: string; icon: string }[] = [
  { key: 'pen', label: 'Bút', icon: 'mdi-pencil' },
  { key: 'arrow', label: 'Mũi tên', icon: 'mdi-arrow-top-right' },
  { key: 'rect', label: 'Hình chữ nhật', icon: 'mdi-rectangle-outline' },
  { key: 'text', label: 'Chữ', icon: 'mdi-format-text' },
];
const COLORS = ['#dc2626', '#2563eb', '#16a34a', '#ca8a04', '#000000', '#ffffff'];

const tool = ref<Tool>('pen');
const color = ref('#dc2626');
const strokeW = ref(4);
const strokes = ref<Stroke[]>([]);
const redoStack = ref<Stroke[]>([]);
const saving = ref(false);
const canvasRef = ref<HTMLCanvasElement | null>(null);
const wrapRef = ref<HTMLElement | null>(null);

let img: HTMLImageElement | null = null;
let drawing = false;
let cur: Stroke | null = null;
let scale = 1;

function close() { emit('update:modelValue', false); }

function undo() {
  const s = strokes.value.pop();
  if (s) redoStack.value.push(s);
  redraw();
}
function redo() {
  const s = redoStack.value.pop();
  if (s) strokes.value.push(s);
  redraw();
}
function clear() {
  strokes.value = [];
  redoStack.value = [];
  redraw();
}

function canvasPoint(e: PointerEvent): { x: number; y: number } {
  const c = canvasRef.value!;
  const r = c.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) / r.width) * c.width,
    y: ((e.clientY - r.top) / r.height) * c.height,
  };
}

function onDown(e: PointerEvent) {
  const c = canvasRef.value;
  if (!c) return;
  c.setPointerCapture(e.pointerId);
  const p = canvasPoint(e);
  drawing = true;
  redoStack.value = [];
  if (tool.value === 'pen') {
    cur = { type: 'pen', color: color.value, width: strokeW.value, points: [p] };
  } else if (tool.value === 'arrow') {
    cur = { type: 'arrow', color: color.value, width: strokeW.value, x1: p.x, y1: p.y, x2: p.x, y2: p.y };
  } else if (tool.value === 'rect') {
    cur = { type: 'rect', color: color.value, width: strokeW.value, x: p.x, y: p.y, w: 0, h: 0 };
  } else {
    const text = window.prompt('Nhập chữ:') || '';
    if (text.trim()) {
      strokes.value.push({
        type: 'text', color: color.value, width: strokeW.value,
        x: p.x, y: p.y, text: text.trim(), fontSize: 18 + strokeW.value * 2,
      });
      redraw();
    }
    drawing = false;
    cur = null;
  }
}

function onMove(e: PointerEvent) {
  if (!drawing || !cur) return;
  const p = canvasPoint(e);
  if (cur.type === 'pen') cur.points.push(p);
  else if (cur.type === 'arrow') { cur.x2 = p.x; cur.y2 = p.y; }
  else if (cur.type === 'rect') { cur.w = p.x - cur.x; cur.h = p.y - cur.y; }
  redraw(cur);
}

function onUp() {
  if (!drawing) return;
  drawing = false;
  if (cur) strokes.value.push(cur);
  cur = null;
  redraw();
}

function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = s.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (s.type === 'pen') {
    if (s.points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(s.points[0].x, s.points[0].y);
    for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
    ctx.stroke();
  } else if (s.type === 'arrow') {
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
    const ang = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
    const head = 12 + s.width;
    ctx.beginPath();
    ctx.moveTo(s.x2, s.y2);
    ctx.lineTo(s.x2 - head * Math.cos(ang - 0.4), s.y2 - head * Math.sin(ang - 0.4));
    ctx.lineTo(s.x2 - head * Math.cos(ang + 0.4), s.y2 - head * Math.sin(ang + 0.4));
    ctx.closePath();
    ctx.fill();
  } else if (s.type === 'rect') {
    ctx.strokeRect(s.x, s.y, s.w, s.h);
  } else if (s.type === 'text') {
    ctx.font = `bold ${s.fontSize}px sans-serif`;
    ctx.fillText(s.text, s.x, s.y);
  }
}

function redraw(preview?: Stroke | null) {
  const c = canvasRef.value;
  if (!c || !img) return;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  for (const s of strokes.value) drawStroke(ctx, s);
  if (preview) drawStroke(ctx, preview);
}

async function setup() {
  await nextTick();
  const c = canvasRef.value;
  const wrap = wrapRef.value;
  if (!c || !wrap) return;
  img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const maxW = Math.min(wrap.clientWidth - 8, 900);
    const maxH = Math.min(window.innerHeight * 0.55, 600);
    scale = Math.min(maxW / img!.naturalWidth, maxH / img!.naturalHeight, 1);
    c.width = Math.round(img!.naturalWidth * scale);
    c.height = Math.round(img!.naturalHeight * scale);
    c.style.width = c.width + 'px';
    c.style.height = c.height + 'px';
    strokes.value = [];
    redoStack.value = [];
    redraw();
  };
  img.src = props.imageUrl;
}

async function apply() {
  const c = canvasRef.value;
  if (!c || !props.mediaAssetId) return;
  saving.value = true;
  try {
    // Export at canvas size (already scaled). Send PNG base64.
    const dataUrl = c.toDataURL('image/png');
    const res = await api.post(`/media/${props.mediaAssetId}/annotate`, { imageBase64: dataUrl });
    emit('applied', { blobId: res.data.blobId, url: res.data.url });
    close();
  } catch (err: any) {
    console.error('[annotate]', err);
    alert(err?.response?.data?.error || 'Không lưu được annotate');
  } finally {
    saving.value = false;
  }
}

watch(() => props.modelValue, (open) => {
  if (open) setup();
});
</script>

<style scoped>
.wia-overlay {
  position: fixed; inset: 0; z-index: 130;
  background: rgba(24, 29, 38, 0.6); backdrop-filter: blur(3px);
  display: flex; align-items: center; justify-content: center; padding: 12px;
}
.wia-box {
  width: min(960px, 100%); max-height: 94vh; background: #fff; border-radius: 14px;
  display: flex; flex-direction: column; overflow: hidden;
  box-shadow: 0 24px 60px rgba(0,0,0,.35);
}
.wia-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px; border-bottom: 1px solid #e5e7eb;
}
.wia-x { border: none; background: transparent; cursor: pointer; color: #6b7280; }
.wia-tools {
  display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
  padding: 8px 12px; border-bottom: 1px solid #e5e7eb; background: #f8fafc;
}
.tool {
  width: 32px; height: 32px; border: 1px solid #e5e7eb; border-radius: 8px;
  background: #fff; cursor: pointer; color: #374151;
  display: inline-flex; align-items: center; justify-content: center;
}
.tool.on { background: #dbeafe; border-color: #2563eb; color: #1d4ed8; }
.tool:disabled { opacity: .4; cursor: not-allowed; }
.sep { width: 1px; height: 22px; background: #e5e7eb; margin: 0 4px; }
.swatch {
  width: 22px; height: 22px; border-radius: 999px; border: 2px solid transparent;
  cursor: pointer; padding: 0;
}
.swatch.on { border-color: #1a1d24; box-shadow: 0 0 0 1px #fff inset; }
.color-input { width: 28px; height: 28px; border: none; padding: 0; background: transparent; cursor: pointer; }
.w-sel { height: 30px; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 12px; }
.wia-canvas-wrap {
  flex: 1; overflow: auto; display: flex; align-items: center; justify-content: center;
  padding: 12px; background: #111827; min-height: 240px;
}
canvas {
  touch-action: none; cursor: crosshair; background: #000;
  border-radius: 4px; max-width: 100%;
}
.wia-foot {
  display: flex; justify-content: flex-end; gap: 8px; padding: 10px 14px;
  border-top: 1px solid #e5e7eb; background: #f8fafc;
}
.btn {
  padding: 7px 14px; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer;
  border: 1px solid #e5e7eb; background: #fff; color: #374151;
}
.btn.primary { background: #2563eb; border-color: #2563eb; color: #fff; }
.btn.primary:disabled { opacity: .5; cursor: not-allowed; }
</style>
