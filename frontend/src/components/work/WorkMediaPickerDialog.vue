<!--
  WorkMediaPickerDialog — gallery media CỦA HỘI THOẠI ZALO (giống panel Media trong app Zalo).
  Không lấy từ kho Media CRM. Multi-select → Confirm → emit pick (sourceMessageId).
-->
<template>
  <Teleport to="body">
    <div v-if="modelValue" class="wmp-overlay" @click.self="close">
      <div class="wmp-box" role="dialog" aria-label="Chọn media từ hội thoại">
        <header class="wmp-head">
          <div>
            <b>Media hội thoại</b>
            <div class="wmp-sub">Ảnh / video / tệp đã gửi trong chat này</div>
          </div>
          <button type="button" class="wmp-x" @click="close"><v-icon size="18">mdi-close</v-icon></button>
        </header>

        <div class="wmp-tabs">
          <button
            v-for="t in TABS" :key="t.key" type="button" class="wmp-tab"
            :class="{ on: kind === t.key }" @click="setKind(t.key)"
          >{{ t.label }}</button>
        </div>

        <div class="wmp-body">
          <div v-if="!conversationId" class="wmp-empty">Không xác định được hội thoại</div>
          <div v-else-if="loading" class="wmp-empty">Đang tải…</div>
          <div v-else-if="!items.length" class="wmp-empty">
            Chưa có {{ kindLabel }} nào trong hội thoại này
          </div>
          <div v-else class="wmp-grid">
            <button
              v-for="a in items" :key="a.messageId" type="button" class="wmp-cell"
              :class="{ picked: picked.has(a.messageId) }"
              @click="toggle(a)"
            >
              <img
                v-if="a.kind === 'image' && (a.thumbnailUrl || a.url)"
                :src="a.thumbnailUrl || a.url || ''"
                alt=""
                loading="lazy"
              />
              <span v-else-if="a.kind === 'video'" class="wmp-ph video">
                <v-icon size="22">mdi-play-circle-outline</v-icon>
              </span>
              <span v-else class="wmp-ph">FILE</span>
              <span class="wmp-name">{{ a.name }}</span>
              <span v-if="picked.has(a.messageId)" class="wmp-check">{{ pickIndex(a.messageId) }}</span>
            </button>
          </div>

          <div v-if="!loading && total > items.length" class="wmp-pager">
            <button type="button" class="btn secondary" :disabled="page <= 1 || loading" @click="goPage(-1)">‹ Trước</button>
            <span class="wmp-pgnum">{{ page }} · {{ total }}</span>
            <button type="button" class="btn secondary" :disabled="page * pageSize >= total || loading" @click="goPage(1)">Sau ›</button>
          </div>
        </div>

        <footer class="wmp-foot">
          <span class="wmp-count">Đã chọn {{ picked.size }}</span>
          <button type="button" class="btn secondary" @click="close">Huỷ</button>
          <button type="button" class="btn primary" :disabled="!picked.size" @click="confirm">Xác nhận</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { api } from '@/api/index';
import type { ConversationMediaItem, WorkAttachLocal, WorkMediaKind } from '@/composables/work-attachment-types';

const props = defineProps<{
  modelValue: boolean;
  /** Bắt buộc — gallery media của hội thoại Zalo đang mở */
  conversationId: string | null;
  max?: number;
}>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'pick', items: WorkAttachLocal[]): void;
}>();

const TABS: { key: WorkMediaKind; label: string }[] = [
  { key: 'image', label: 'Ảnh' },
  { key: 'video', label: 'Video' },
  { key: 'file', label: 'Tệp' },
];

const kind = ref<WorkMediaKind>('image');
const items = ref<ConversationMediaItem[]>([]);
const loading = ref(false);
const picked = ref<Map<string, ConversationMediaItem>>(new Map());
const page = ref(1);
const total = ref(0);
const pageSize = 60;
const max = () => props.max ?? 12;
const kindLabel = computed(() => ({ image: 'ảnh', video: 'video', file: 'tệp' }[kind.value]));

function close() { emit('update:modelValue', false); }
function setKind(k: WorkMediaKind) {
  kind.value = k;
  page.value = 1;
  reload();
}
function goPage(delta: number) {
  const next = page.value + delta;
  if (next < 1) return;
  page.value = next;
  reload();
}

async function reload() {
  if (!props.conversationId) {
    items.value = [];
    total.value = 0;
    return;
  }
  loading.value = true;
  try {
    const res = await api.get(`/conversations/${props.conversationId}/media`, {
      params: { kind: kind.value, page: page.value, limit: pageSize },
    });
    items.value = res.data.items ?? [];
    total.value = res.data.total ?? items.value.length;
  } catch {
    items.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

function toggle(a: ConversationMediaItem) {
  const next = new Map(picked.value);
  if (next.has(a.messageId)) next.delete(a.messageId);
  else {
    if (next.size >= max()) return;
    next.set(a.messageId, a);
  }
  picked.value = next;
}

function pickIndex(id: string): string {
  return String([...picked.value.keys()].indexOf(id) + 1);
}

function confirm() {
  const list: WorkAttachLocal[] = [...picked.value.values()].map((a) => ({
    key: a.messageId,
    mediaAssetId: '', // chưa có trong kho — BE save-from-chat qua sourceMessageId
    name: a.name,
    kind: a.kind,
    thumbnailUrl: a.thumbnailUrl,
    url: a.url,
    sizeBytes: null,
    variantBlobId: null,
    variantUrl: null,
    sourceMessageId: a.messageId,
  }));
  emit('pick', list);
  close();
}

watch(() => props.modelValue, (open) => {
  if (!open) return;
  picked.value = new Map();
  kind.value = 'image';
  page.value = 1;
  reload();
});

watch(() => props.conversationId, () => {
  if (props.modelValue) reload();
});
</script>

<style scoped>
.wmp-overlay {
  position: fixed; inset: 0; z-index: 120;
  background: rgba(24, 29, 38, 0.55); backdrop-filter: blur(3px);
  display: flex; align-items: center; justify-content: center; padding: 16px;
}
.wmp-box {
  width: 520px; max-width: 100%; max-height: 90vh;
  background: #fff; border-radius: 14px;
  box-shadow: 0 24px 60px rgba(0,0,0,.32);
  display: flex; flex-direction: column; overflow: hidden;
}
.wmp-head {
  display: flex; align-items: flex-start; justify-content: space-between;
  padding: 12px 16px; border-bottom: 1px solid #e5e7eb;
}
.wmp-sub { font-size: 11.5px; color: #94a3b8; margin-top: 2px; font-weight: 400; }
.wmp-x { border: none; background: transparent; cursor: pointer; color: #6b7280; width: 32px; height: 32px; border-radius: 8px; }
.wmp-tabs { display: flex; gap: 4px; padding: 8px 12px; border-bottom: 1px solid #e5e7eb; }
.wmp-tab {
  flex: 1; border: none; background: #f1f5f9; border-radius: 8px; padding: 8px;
  font-size: 12.5px; font-weight: 600; cursor: pointer; color: #64748b;
}
.wmp-tab.on { background: #dbeafe; color: #1d4ed8; }
.wmp-body { flex: 1; overflow-y: auto; padding: 8px 12px 12px; min-height: 220px; }
.wmp-empty { text-align: center; color: #94a3b8; font-size: 13px; padding: 36px 12px; line-height: 1.45; }
.wmp-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.wmp-cell {
  position: relative; aspect-ratio: 1; border-radius: 10px; overflow: hidden;
  border: 2px solid transparent; background: #e4e9f0; padding: 0; cursor: pointer;
}
.wmp-cell.picked { border-color: #2563eb; box-shadow: 0 0 0 2px #dbeafe; }
.wmp-cell img { width: 100%; height: 100%; object-fit: cover; display: block; }
.wmp-ph {
  width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; color: #64748b;
}
.wmp-ph.video { color: #1d4ed8; }
.wmp-name {
  position: absolute; left: 0; right: 0; bottom: 0; font-size: 10px; color: #fff;
  background: linear-gradient(transparent, rgba(0,0,0,.7)); padding: 10px 4px 4px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.wmp-check {
  position: absolute; top: 4px; left: 4px; width: 20px; height: 20px; border-radius: 999px;
  background: #2563eb; color: #fff; font-size: 11px; font-weight: 800;
  display: flex; align-items: center; justify-content: center;
}
.wmp-pager {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  padding: 10px 0 2px;
}
.wmp-pgnum { font-size: 11.5px; color: #94a3b8; }
.wmp-foot {
  display: flex; align-items: center; gap: 8px; padding: 10px 14px;
  border-top: 1px solid #e5e7eb; background: #f8fafc;
}
.wmp-count { flex: 1; font-size: 12px; color: #64748b; }
.btn {
  padding: 7px 14px; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer;
  border: 1px solid #e5e7eb; background: #fff; color: #374151;
}
.btn.primary { background: #2563eb; border-color: #2563eb; color: #fff; }
.btn.primary:disabled, .btn.secondary:disabled { opacity: .5; cursor: not-allowed; }
</style>
