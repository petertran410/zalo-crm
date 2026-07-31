<!--
  AttachmentManagerPopover — manage attachments after create:
  up/down reorder, annotate (image), remove.
-->
<template>
  <Teleport to="body">
    <div v-if="modelValue" class="amp-overlay" @click.self="close">
      <div class="amp-box">
        <header class="amp-head">
          <b>Tệp đính kèm ({{ local.length }})</b>
          <button type="button" class="amp-x" @click="close"><v-icon size="18">mdi-close</v-icon></button>
        </header>
        <div class="amp-body">
          <div v-if="!local.length" class="amp-empty">Chưa có tệp đính kèm</div>
          <div v-for="(a, i) in local" :key="a.attachmentId || a.mediaAssetId" class="amp-row">
            <div class="amp-thumb">
              <img v-if="displayUrl(a)" :src="displayUrl(a)!" alt="" />
              <span v-else class="amp-ph">{{ a.kind === 'video' ? '▶' : 'F' }}</span>
            </div>
            <div class="amp-info">
              <div class="amp-name">{{ a.name }}</div>
              <div class="amp-meta">{{ a.kind }}{{ a.variantBlobId ? ' · đã annotate' : '' }}</div>
            </div>
            <div class="amp-actions">
              <button type="button" class="ic" :disabled="i === 0 || busy" title="Lên" @click="move(i, -1)">
                <v-icon size="16">mdi-arrow-up</v-icon>
              </button>
              <button type="button" class="ic" :disabled="i === local.length - 1 || busy" title="Xuống" @click="move(i, 1)">
                <v-icon size="16">mdi-arrow-down</v-icon>
              </button>
              <button
                v-if="a.kind === 'image'" type="button" class="ic" :disabled="busy"
                title="Annotate" @click="openAnnotate(a)"
              ><v-icon size="16">mdi-pencil</v-icon></button>
              <button type="button" class="ic danger" :disabled="busy" title="Xoá" @click="remove(a)">
                <v-icon size="16">mdi-close</v-icon>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <WorkImageAnnotator
      v-model="showAnnotate"
      :media-asset-id="annotateTarget?.mediaAssetId || ''"
      :image-url="annotateTarget ? (displayUrl(annotateTarget) || '') : ''"
      @applied="onAnnotated"
    />
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useToast } from '@/composables/use-toast';
import { useConfirm } from '@/composables/use-confirm';
import { attachmentToLocal, displayAttachUrl, type WorkAttachment, type WorkAttachLocal } from '@/composables/work-attachment-types';
import { useTickets } from '@/composables/use-tickets';
import { useTasks } from '@/composables/use-tasks';
import WorkImageAnnotator from '@/components/work/WorkImageAnnotator.vue';

const props = defineProps<{
  modelValue: boolean;
  workKind: 'task' | 'complaint';
  workItemId: string;
  attachments: WorkAttachment[];
}>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'changed', attachments: WorkAttachment[]): void;
}>();

const toast = useToast();
const { confirm } = useConfirm();
const {
  removeTicketAttachment, reorderTicketAttachments, updateTicketAttachment, fetchTicketAttachments,
} = useTickets();
const {
  removeTaskAttachment, reorderTaskAttachments, updateTaskAttachment, fetchTaskAttachments,
} = useTasks();

const local = ref<WorkAttachLocal[]>([]);
const busy = ref(false);
const showAnnotate = ref(false);
const annotateTarget = ref<WorkAttachLocal | null>(null);

function close() { emit('update:modelValue', false); }
function displayUrl(a: WorkAttachLocal) { return displayAttachUrl(a); }

watch(() => [props.modelValue, props.attachments] as const, ([open]) => {
  if (!open) return;
  local.value = (props.attachments || []).map(attachmentToLocal);
});

async function persistOrder() {
  const ids = local.value.map((a) => a.attachmentId!).filter(Boolean);
  if (ids.length !== local.value.length) return;
  busy.value = true;
  try {
    const next = props.workKind === 'complaint'
      ? await reorderTicketAttachments(props.workItemId, ids)
      : await reorderTaskAttachments(props.workItemId, ids);
    local.value = next.map(attachmentToLocal);
    emit('changed', next);
  } catch (err: any) {
    toast.push(err?.response?.data?.error || 'Không sắp xếp được', 'error');
    await reload();
  } finally {
    busy.value = false;
  }
}

function move(i: number, delta: number) {
  const j = i + delta;
  if (j < 0 || j >= local.value.length) return;
  const arr = [...local.value];
  const [m] = arr.splice(i, 1);
  arr.splice(j, 0, m);
  local.value = arr;
  void persistOrder();
}

async function remove(a: WorkAttachLocal) {
  if (!a.attachmentId) return;
  const ok = await confirm({
    title: 'Xoá tệp đính kèm?',
    message: `"${a.name}" sẽ bị gỡ khỏi công việc (không xoá khỏi kho Media).`,
    tone: 'danger',
  });
  if (!ok) return;
  busy.value = true;
  try {
    if (props.workKind === 'complaint') await removeTicketAttachment(props.workItemId, a.attachmentId);
    else await removeTaskAttachment(props.workItemId, a.attachmentId);
    local.value = local.value.filter((x) => x.attachmentId !== a.attachmentId);
    emit('changed', local.value.map((x) => ({
      id: x.attachmentId!,
      mediaAssetId: x.mediaAssetId,
      sourceMessageId: x.sourceMessageId ?? null,
      position: 0,
      variantBlobId: x.variantBlobId,
      createdAt: '',
      mediaAsset: {
        id: x.mediaAssetId, kind: x.kind, name: x.name,
        thumbnailUrl: x.thumbnailUrl, url: x.url, sizeBytes: x.sizeBytes,
      },
      variantBlob: x.variantBlobId && x.variantUrl
        ? { id: x.variantBlobId, url: x.variantUrl, width: null, height: null, sizeBytes: 0 }
        : null,
    })));
  } catch (err: any) {
    toast.push(err?.response?.data?.error || 'Không xoá được', 'error');
  } finally {
    busy.value = false;
  }
}

function openAnnotate(a: WorkAttachLocal) {
  annotateTarget.value = a;
  showAnnotate.value = true;
}

async function onAnnotated(payload: { blobId: string; url: string }) {
  const a = annotateTarget.value;
  if (!a?.attachmentId) return;
  busy.value = true;
  try {
    const updated = props.workKind === 'complaint'
      ? await updateTicketAttachment(props.workItemId, a.attachmentId, { variantBlobId: payload.blobId })
      : await updateTaskAttachment(props.workItemId, a.attachmentId, { variantBlobId: payload.blobId });
    if (updated) {
      const idx = local.value.findIndex((x) => x.attachmentId === a.attachmentId);
      if (idx >= 0) local.value[idx] = attachmentToLocal(updated);
      emit('changed', local.value.map((x, i) => ({
        ...(props.attachments[i] || {} as WorkAttachment),
        ...attachmentToLocal(x) as any,
      })) as any);
    }
    await reload();
  } catch (err: any) {
    toast.push(err?.response?.data?.error || 'Không cập nhật annotate', 'error');
  } finally {
    busy.value = false;
  }
}

async function reload() {
  try {
    const list = props.workKind === 'complaint'
      ? await fetchTicketAttachments(props.workItemId)
      : await fetchTaskAttachments(props.workItemId);
    local.value = list.map(attachmentToLocal);
    emit('changed', list);
  } catch { /* */ }
}
</script>

<style scoped>
.amp-overlay {
  position: fixed; inset: 0; z-index: 115;
  background: rgba(24, 29, 38, 0.45);
  display: flex; align-items: center; justify-content: center; padding: 16px;
}
.amp-box {
  width: 440px; max-width: 100%; max-height: 80vh; background: #fff;
  border-radius: 14px; overflow: hidden; display: flex; flex-direction: column;
  box-shadow: 0 20px 50px rgba(0,0,0,.28);
}
.amp-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px; border-bottom: 1px solid #e5e7eb;
}
.amp-x { border: none; background: transparent; cursor: pointer; color: #6b7280; }
.amp-body { flex: 1; overflow-y: auto; padding: 8px; }
.amp-empty { text-align: center; color: #94a3b8; padding: 28px; font-size: 13px; }
.amp-row {
  display: flex; align-items: center; gap: 10px;
  padding: 8px; border-radius: 10px; border: 1px solid #e5e7eb; margin-bottom: 6px;
}
.amp-thumb {
  width: 44px; height: 44px; border-radius: 8px; overflow: hidden; background: #e5e7eb; flex-shrink: 0;
}
.amp-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.amp-ph { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: #64748b; }
.amp-info { flex: 1; min-width: 0; }
.amp-name { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.amp-meta { font-size: 11px; color: #94a3b8; }
.amp-actions { display: flex; gap: 2px; }
.ic {
  width: 28px; height: 28px; border: none; border-radius: 6px; background: transparent;
  cursor: pointer; color: #64748b; display: inline-flex; align-items: center; justify-content: center;
}
.ic:hover { background: #f1f5f9; }
.ic:disabled { opacity: .35; cursor: not-allowed; }
.ic.danger:hover { background: #fee2e2; color: #dc2626; }
</style>
