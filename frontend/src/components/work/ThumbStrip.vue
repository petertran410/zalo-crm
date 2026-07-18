<!--
  ThumbStrip — first N attachment thumbs + +N overflow. Click opens manage emit.
-->
<template>
  <div v-if="items.length" class="ts" @click.stop="$emit('open')">
    <div
      v-for="(a, i) in visible" :key="a.id || a.mediaAssetId || i"
      class="ts-tile"
      :title="a.mediaAsset?.name || a.name"
    >
      <img v-if="thumb(a)" :src="thumb(a)!" alt="" />
      <span v-else class="ts-ph">{{ kindLabel(a) }}</span>
    </div>
    <span v-if="overflow > 0" class="ts-more">+{{ overflow }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { WorkAttachment } from '@/composables/work-attachment-types';

const props = defineProps<{
  items: Array<WorkAttachment | any>;
  max?: number;
}>();
defineEmits<{ (e: 'open'): void }>();

const maxN = computed(() => props.max ?? 4);
const visible = computed(() => (props.items || []).slice(0, maxN.value));
const overflow = computed(() => Math.max(0, (props.items || []).length - maxN.value));

function thumb(a: any): string | null {
  return a?.variantBlob?.url || a?.variantUrl || a?.mediaAsset?.thumbnailUrl || a?.mediaAsset?.url
    || a?.thumbnailUrl || a?.url || null;
}
function kindLabel(a: any): string {
  const k = a?.mediaAsset?.kind || a?.kind || 'file';
  return k === 'video' ? '▶' : k === 'image' ? '🖼' : 'F';
}
</script>

<style scoped>
.ts {
  display: inline-flex; align-items: center; gap: 4px; margin-top: 4px;
  cursor: pointer;
}
.ts-tile {
  width: 28px; height: 28px; border-radius: 6px; overflow: hidden;
  background: #e5e7eb; border: 1px solid #e5e7eb; flex-shrink: 0;
}
.ts-tile img { width: 100%; height: 100%; object-fit: cover; display: block; }
.ts-ph {
  width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 700; color: #64748b;
}
.ts-more {
  font-size: 11px; font-weight: 600; color: #64748b;
  background: #f1f5f9; border-radius: 999px; padding: 2px 7px;
}
</style>
