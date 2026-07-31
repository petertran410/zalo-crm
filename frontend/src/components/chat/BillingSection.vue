<!--
  BillingSection.vue — Hoá đơn từ chat (goal 4).
  Chỉ hiện khi KH đã liên kết POS. 2026-07-18: composer inline → modal riêng
  (BillingDraftEditor, giống pattern WorkItemEditor) + nút "Gửi POS" từng draft
  (cầu CRM → POS SANDBOX đã mở, gửi là hành động chủ động của sale).
-->
<template>
  <section class="bill-section">
    <header class="bill-head">
      <span class="bill-title">🧾 Hoá đơn từ chat</span>
      <button class="bill-new" type="button" @click="editorOpen = true">+ Tạo hoá đơn</button>
    </header>

    <!-- Trạng thái cầu POS -->
    <div v-if="!dispatchEnabled" class="bill-gate" title="Backend chưa bật cờ HISWEETIE_BILLING_DISPATCH">
      ⓘ Hoá đơn lưu nháp trong CRM — <b>chưa bật gửi POS</b>.
    </div>
    <div v-else class="bill-gate on" title="Draft gửi sang POS sandbox khi bấm Gửi POS">
      ⓘ Bấm <b>Gửi POS</b> trên từng nháp để đẩy sang POS (sandbox).
    </div>

    <!-- Danh sách nháp -->
    <div v-if="drafts.length" class="bill-drafts">
      <div v-for="d in drafts" :key="d.id" class="bill-draft">
        <div class="bill-draft-top">
          <span class="bill-draft-total">{{ fmt(Number(d.totalAmount)) }}₫</span>
          <span class="bill-draft-status" :class="'st-' + d.status">{{ statusLabel(d.status) }}</span>
        </div>
        <div class="bill-draft-meta">
          {{ (d.items?.length || 0) }} SP · {{ shortDate(d.createdAt) }}
          <span v-if="d.createdBy?.fullName"> · {{ d.createdBy.fullName }}</span>
          <span v-if="d.posOrderId != null"> · Đơn POS #{{ d.posOrderId }}</span>
        </div>
        <div v-if="d.paidAmount" class="bill-draft-meta">Đã trả trước: {{ fmt(Number(d.paidAmount)) }}₫</div>
        <div v-if="d.status === 'failed' && d.dispatchError" class="bill-draft-err" :title="d.dispatchError">
          Lỗi gửi: {{ d.dispatchError.slice(0, 120) }}
        </div>
        <div v-if="dispatchEnabled && (d.status === 'draft' || d.status === 'failed')" class="bill-draft-actions">
          <button class="bill-send" type="button" :disabled="sendingId === d.id" @click="sendToPos(d)">
            {{ sendingId === d.id ? 'Đang gửi…' : (d.status === 'failed' ? 'Gửi lại POS' : 'Gửi POS') }}
          </button>
        </div>
      </div>
    </div>
    <p v-else class="bill-none">Chưa có hoá đơn nào.</p>

    <BillingDraftEditor
      v-model="editorOpen"
      :contact-id="props.contactId"
      :pos-customer-id="props.posCustomerId"
      :contact-name="props.contactName"
      @created="loadDrafts"
    />
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { useToast } from '@/composables/use-toast';
import { useConfirm } from '@/composables/use-confirm';
import {
  fetchBillingDrafts, dispatchBillingDraft,
  type BillingDraft,
} from '@/api/pos-billing';
import BillingDraftEditor from '@/components/chat/BillingDraftEditor.vue';

const props = defineProps<{ contactId: string; posCustomerId: number; contactName?: string | null }>();
const toast = useToast();
const { confirm } = useConfirm();

const editorOpen = ref(false);
const drafts = ref<BillingDraft[]>([]);
const dispatchEnabled = ref(false);
const sendingId = ref<string | null>(null);

function fmt(n: number): string { return (n || 0).toLocaleString('vi-VN'); }
function statusLabel(s: string): string {
  return { draft: 'Nháp', pending_dispatch: 'Đang gửi', sent: 'Đã gửi POS', failed: 'Lỗi gửi' }[s] || s;
}
function shortDate(iso: string): string { return new Date(iso).toLocaleDateString('vi-VN'); }

async function loadDrafts() {
  try {
    const res = await fetchBillingDrafts(props.contactId);
    drafts.value = res.drafts;
    dispatchEnabled.value = res.dispatchEnabled;
  } catch { /* im lặng — không chặn UI */ }
}

async function sendToPos(d: BillingDraft) {
  const ok = await confirm({
    title: 'Gửi hoá đơn sang POS?',
    message: `Đơn ${fmt(Number(d.totalAmount))}₫ (${d.items?.length || 0} SP) sẽ được tạo bên POS sandbox. Tiếp tục?`,
  });
  if (!ok) return;
  sendingId.value = d.id;
  try {
    const res = await dispatchBillingDraft(d.id);
    toast.success(res.posOrderId != null
      ? `Đã gửi POS — đơn #${res.posOrderId}`
      : 'Đã gửi POS thành công');
  } catch (e: unknown) {
    const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
    toast.error(msg || 'Không gửi được sang POS');
  } finally {
    sendingId.value = null;
    await loadDrafts();
  }
}

// MessageThread (tạo hoá đơn từ tin nhắn) là component anh em — nghe window event
// 'billing:draft-created' để list bên panel tự refresh không cần đóng/mở lại.
function onExternalDraftCreated() { void loadDrafts(); }

onMounted(() => {
  void loadDrafts();
  window.addEventListener('billing:draft-created', onExternalDraftCreated);
});
onBeforeUnmount(() => {
  window.removeEventListener('billing:draft-created', onExternalDraftCreated);
});
// Đổi KH đang mở → tải lại danh sách draft của KH mới.
watch(() => props.contactId, loadDrafts);
</script>

<style scoped>
.bill-section { border-top: 1px solid var(--smax-grey-200, #e5e7eb); padding: 12px 0; }
.bill-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.bill-title { font-weight: 600; font-size: 13px; }
.bill-new { border: 1px solid var(--smax-primary, #2563eb); color: var(--smax-primary, #2563eb); background: transparent; border-radius: 6px; padding: 3px 10px; font-size: 12px; cursor: pointer; }
.bill-new:hover { background: var(--smax-primary-soft, rgba(37,99,235,0.08)); }
.bill-gate { background: rgba(255,145,0,0.10); color: var(--warning, #b45309); border-radius: 6px; padding: 6px 9px; font-size: 11.5px; margin-bottom: 10px; }
.bill-gate.on { background: rgba(0,200,83,0.10); color: #047857; }
.bill-drafts { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
.bill-draft { border: 1px solid var(--smax-grey-200, #e5e7eb); border-radius: 6px; padding: 7px 9px; }
.bill-draft-top { display: flex; justify-content: space-between; align-items: center; }
.bill-draft-total { font-weight: 600; font-variant-numeric: tabular-nums; }
.bill-draft-status { font-size: 10.5px; padding: 1px 7px; border-radius: 9px; background: var(--smax-grey-100, #f3f4f6); color: var(--smax-grey-600, #4b5563); }
.bill-draft-status.st-sent { background: rgba(0,200,83,0.12); color: #059669; }
.bill-draft-status.st-failed { background: rgba(239,68,68,0.12); color: #b91c1c; }
.bill-draft-status.st-pending_dispatch { background: rgba(245,158,11,0.14); color: #b45309; }
.bill-draft-meta { font-size: 11px; color: var(--smax-grey-500, #6b7280); margin-top: 2px; }
.bill-draft-err { font-size: 11px; color: #b91c1c; margin-top: 3px; }
.bill-draft-actions { margin-top: 6px; display: flex; justify-content: flex-end; }
.bill-send {
  border: 1px solid #059669; color: #059669; background: transparent;
  border-radius: 6px; padding: 3px 12px; font-size: 11.5px; font-weight: 600; cursor: pointer;
}
.bill-send:hover { background: rgba(5,150,105,0.08); }
.bill-send:disabled { opacity: 0.55; cursor: not-allowed; }
.bill-none { font-size: 11.5px; color: var(--smax-grey-500, #6b7280); }
</style>
