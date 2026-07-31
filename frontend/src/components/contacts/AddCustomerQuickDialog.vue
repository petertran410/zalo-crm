<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    max-width="480"
    persistent
    transition="dialog-bottom-transition"
  >
    <v-card class="acqd-card" elevation="24">
      <!-- Header -->
      <header class="acqd-head">
        <h2 class="acqd-title">＋ Thêm khách hàng</h2>
        <v-btn icon variant="text" size="small" @click="close" :aria-label="'Đóng'">
          <v-icon size="20">mdi-close</v-icon>
        </v-btn>
      </header>

      <!-- Body — 2026-07-31: bỏ ô Họ tên + tạo KH mới. SĐT giờ là ô TÌM KIẾM,
           bắt buộc chọn 1 KH đã có trong danh sách kết quả mới đi tiếp được. -->
      <div class="acqd-body">
        <div class="acqd-field">
          <label class="acqd-label" for="acqd-phone">
            Số điện thoại
            <span class="acqd-required">*</span>
          </label>
          <input
            id="acqd-phone"
            v-model.trim="form.phone"
            ref="phoneInputRef"
            type="tel"
            class="acqd-input acqd-input--phone"
            placeholder="0936 668 266 hoặc 84936668266"
            autocomplete="tel"
            :disabled="loading"
            @input="onPhoneInput"
          />
          <div v-if="!searched && !searching" class="acqd-hint">
            Gõ SĐT để tìm khách bên POS (0xxx / 84xxx / +84xxx)
          </div>
          <div v-if="searchError" class="acqd-msg acqd-msg--error">
            🔴 {{ searchError }}
          </div>
        </div>

        <!-- Kết quả tìm — KH đã có trong CRM bị làm mờ, chỉ chọn được KH chưa liên kết -->
        <div class="acqd-results">
          <div v-if="searching" class="acqd-hint">Đang tìm…</div>
          <div v-else-if="searched && !results.length" class="acqd-msg acqd-msg--warning">
            🟡 Không có KH POS nào khớp SĐT này.
          </div>
          <button
            v-for="c in results" :key="candidateKey(c)"
            type="button"
            class="acqd-result"
            :class="{ 'is-picked': picked && candidateKey(picked) === candidateKey(c), 'is-linked': c.linked }"
            :disabled="c.linked || loading"
            :title="c.linked ? 'Khách này đã có trong tab Khách hàng' : ''"
            @click="picked = c"
          >
            <span class="acqd-result-nm">{{ candidateDisplayName(c) }}</span>
            <span class="acqd-result-meta">
              <span class="acqd-result-ph">{{ c.phone || '—' }}</span>
              <!-- đã có = KH bên POS (xám). chưa mua = contact Zalo/FB, chọn được -->
              <span v-if="c.linked" class="acqd-result-tag">đã có</span>
              <span v-else-if="c.contactId" class="acqd-result-tag">chưa mua</span>
            </span>
          </button>
        </div>

        <!-- KH mới tinh từ Zalo/Facebook — chưa có ở POS lẫn CRM. Chỉ mở khi không
             có dòng "đã có" nào, để không tạo trùng KH sẵn có. -->
        <div v-if="canCreate" class="acqd-new">
          <div class="acqd-new-t">Không thấy khách? Tạo mới với SĐT này.</div>
          <label class="acqd-label" for="acqd-name">
            Họ tên
            <span class="acqd-required">*</span>
          </label>
          <input
            id="acqd-name"
            v-model.trim="createName"
            type="text"
            class="acqd-input"
            placeholder="Vd: Nguyễn Văn A"
            autocomplete="name"
            :disabled="loading"
            @input="picked = null"
            @keydown.enter.prevent="onSubmit"
          />
        </div>
      </div>

      <!-- Footer hint -->
      <div class="acqd-footer-hint">
        💡 Thông tin chi tiết (email, địa chỉ, tag, sale phụ trách...) sửa được ở trang Khách hàng.
      </div>

      <!-- Actions -->
      <div class="acqd-actions">
        <button
          type="button"
          class="acqd-btn acqd-btn--secondary"
          @click="close"
          :disabled="loading"
        >
          Hủy
        </button>
        <button
          type="button"
          class="acqd-btn acqd-btn--primary"
          :disabled="primaryDisabled"
          @click="onSubmit"
        >
          <span v-if="loading" class="acqd-spinner" />
          {{ primaryLabel }}
        </button>
      </div>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from '@/composables/use-toast';
import { api } from '@/api/index';
import { useContactPhoneSearch, candidateDisplayName, candidateKey, type PosLinkCandidate } from '@/composables/use-contact-phone-search';

interface Props {
  modelValue: boolean;
  /** Nguồn lead khi tạo KH mới — 'quick_add' | 'chat_compose_lookup_miss' | ... */
  leadSource?: string;
  /** Pre-fill SĐT — dùng từ NewMessageDialog khi lookup Zalo miss (sale đã gõ SĐT) */
  defaultPhone?: string;
  /** M53.3 2026-05-30: Dialog tự navigate /chat/:convId sau khi tạo virtual conv.
   *  Default true (ContactsView FAB). Set false khi parent tự xử lý emit `created`
   *  (vd NewMessageDialog đang ở /chat, không cần dialog navigate gây race). */
  autoOpenVirtualChat?: boolean;
}
const props = withDefaults(defineProps<Props>(), {
  leadSource: 'quick_add',
  defaultPhone: '',
  autoOpenVirtualChat: true,
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'created', contact: { id: string; fullName: string | null; phone: string | null }): void;
}>();

const router = useRouter();
const toast = useToast();

const form = ref({ phone: '' });
const loading = ref(false);
const picked = ref<PosLinkCandidate | null>(null);
const {
  results,
  searching,
  searched,
  error: searchError,
  search: runSearch,
  reset: resetSearch,
} = useContactPhoneSearch();

const phoneInputRef = ref<HTMLInputElement | null>(null);

// ── Tạo KH mới (Zalo/Facebook, chưa có ở POS) ───────────────────────────────
// 2026-07-31: đây chính là entry point "Zalo lookup miss" — KH vừa nhắn thường
// chưa có record POS nào. Cho tạo mới, nhưng CHẶN khi SĐT đã thuộc một Contact
// đang có (dòng linked) vì đó mới là case trùng.
const createName = ref('');
// Chặn tạo mới khi SĐT đã thuộc BẤT KỲ Contact nào — kể cả contact Zalo chưa
// phải KH POS: người đó không "mới", đã có dòng chọn được ở danh sách trên.
const hasExistingContact = computed(() => results.value.some((c) => c.contactId !== null));
const phoneDigits = computed(() => form.value.phone.replace(/\D/g, ''));
const canCreate = computed(() =>
  searched.value
  && !searching.value
  && !hasExistingContact.value
  && phoneDigits.value.length >= 9,
);
const primaryDisabled = computed(() => {
  if (loading.value) return true;
  if (picked.value) return false;
  return !(canCreate.value && createName.value.trim());
});
const primaryLabel = computed(() => {
  if (loading.value) return 'Đang lưu...';
  if (!picked.value) return '＋ Tạo khách mới';
  // Contact Zalo đã có trong CRM thì chỉ mở chat với KH đó, không "liên kết" gì.
  return picked.value.posCustomerId == null ? '💬 Mở chat' : '🔗 Liên kết';
});

watch(() => props.modelValue, async (open) => {
  if (open) {
    form.value = { phone: props.defaultPhone || '' };
    picked.value = null;
    createName.value = '';
    resetSearch();
    // defaultPhone có sẵn (NewMessageDialog lookup miss) → tìm luôn, sale khỏi gõ lại.
    if (form.value.phone) runSearch(form.value.phone);
    await nextTick();
    phoneInputRef.value?.focus();
  }
});

function onPhoneInput() {
  // Đổi SĐT thì bỏ lựa chọn cũ — tránh liên kết nhầm KH của lần gõ trước.
  picked.value = null;
  runSearch(form.value.phone);
}

function close() {
  if (loading.value) return;
  emit('update:modelValue', false);
}

/**
 * 2026-07-31 — Hai đường: kéo KH POS đã chọn về CRM, hoặc tạo KH mới tinh
 * (Zalo/Facebook, chưa có ở POS). Giữ nguyên contract cũ với parent: emit
 * 'created' kèm Contact, và khi autoOpenVirtualChat=true thì tự mở virtual chat
 * như flow M53.1 trước đây.
 */
async function onSubmit() {
  if (loading.value || primaryDisabled.value) return;
  const c = picked.value;
  loading.value = true;
  try {
    let contact: { id: string; fullName: string | null; phone: string | null };
    if (c?.contactId && c.posCustomerId == null) {
      // Contact Zalo/Facebook đã có sẵn trong CRM → dùng thẳng, không tạo/liên kết.
      contact = { id: c.contactId, fullName: c.name, phone: c.phone };
    } else {
      try {
        // Có KH POS được chọn → kéo về CRM. Không thì tạo KH mới từ SĐT + họ tên.
        const res = c
          ? await api.post('/contacts/link-pos', { posCustomerId: c.posCustomerId })
          : await api.post('/contacts/quick-create', {
              fullName: createName.value.trim(),
              phone: form.value.phone.trim(),
              leadSource: props.leadSource,
            });
        contact = res.data?.contact;
        if (!contact?.id) throw new Error('backend trả về contact rỗng');
      } catch (err: any) {
        const msg = err?.response?.data?.message || err?.response?.data?.error;
        toast.error(msg || (c ? 'Không liên kết được khách hàng' : 'Không tạo được khách hàng'));
        return;
      }
    }

    emit('created', { id: contact.id, fullName: contact.fullName, phone: contact.phone });

    // autoOpenVirtualChat=false (NewMessageDialog): parent tự chain virtual-conv
    // + emit opened — dialog không navigate để tránh race 2 lần POST.
    if (!props.autoOpenVirtualChat) {
      toast.success(c ? `Đã chọn KH "${candidateDisplayName(c)}"` : 'Đã tạo khách mới');
      emit('update:modelValue', false);
      return;
    }

    try {
      const vcRes = await api.post(`/contacts/${contact.id}/virtual-conversation`, {});
      const conversationId = vcRes.data?.conversationId;
      emit('update:modelValue', false);
      if (conversationId) {
        await router.push(`/chat/${conversationId}`);
      }
    } catch (vcErr: any) {
      // Tạo virtual conv fail (vd chưa kết nối nick Zalo) → vẫn coi là liên kết xong,
      // không block flow. Sale mở chat nội bộ ở trang Khách hàng sau.
      const vcMsg = vcErr?.response?.data?.message;
      toast.warning(vcMsg || 'Đã liên kết KH. Mở chat nội bộ ở trang Khách hàng khi cần.', 4000);
      emit('update:modelValue', false);
    }
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
/* Token palette giữ với mockup HTML chốt 2026-05-28 */
.acqd-card {
  border-radius: 12px !important;
  overflow: hidden;
  background: #ffffff;
}

.acqd-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 14px;
  border-bottom: 1px solid #dddddd;
}
.acqd-title {
  font-size: 17px;
  font-weight: 500;
  color: #181d26;
  letter-spacing: -0.01em;
  margin: 0;
}

.acqd-body {
  padding: 18px 24px 20px;
}

.acqd-field { margin-bottom: 16px; }
.acqd-field:last-child { margin-bottom: 0; }

.acqd-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12.5px;
  font-weight: 500;
  color: #181d26;
  margin-bottom: 6px;
}
.acqd-required { color: #aa2d00; }

.acqd-input {
  width: 100%;
  height: 38px;
  padding: 0 12px;
  border: 1px solid #dddddd;
  border-radius: 7px;
  font-size: 14px;
  font-family: inherit;
  color: #181d26;
  background: #ffffff;
  transition: border-color 0.15s, box-shadow 0.15s;
  box-sizing: border-box;
}
.acqd-input:focus {
  outline: none;
  border-color: #181d26;
  box-shadow: 0 0 0 3px rgba(15, 23, 42, 0.08);
}
.acqd-input:disabled {
  background: #f8fafc;
  cursor: not-allowed;
}
.acqd-input.has-error { border-color: #b91c1c; }
.acqd-input.has-warning { border-color: #d97706; }
.acqd-input--phone {
  font-family: 'JetBrains Mono', 'SF Mono', Menlo, monospace;
  font-size: 13.5px;
  letter-spacing: 0.02em;
}

.acqd-hint {
  margin-top: 5px;
  font-size: 11.5px;
  color: #41454d;
  line-height: 1.4;
}

.acqd-msg {
  margin-top: 5px;
  font-size: 11.5px;
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
  line-height: 1.4;
}
.acqd-msg--error { color: #b91c1c; }
.acqd-msg--warning { color: #d97706; }

/* Danh sách KH khớp SĐT — bấm để chọn KH cần liên kết (2026-07-31) */
.acqd-results {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 232px;
  overflow-y: auto;
}
.acqd-result {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #dddddd;
  border-radius: 8px;
  background: #ffffff;
  font-family: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.acqd-result:hover:not(:disabled) { border-color: #1b61c9; }
.acqd-result:disabled { cursor: not-allowed; }
.acqd-result.is-picked { border-color: #1b61c9; background: #eef4fd; }
/* is-linked = đã có Contact trong CRM → mờ, không chọn được */
.acqd-result.is-linked { opacity: 0.5; }
.acqd-result-nm {
  font-weight: 500;
  color: #181d26;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.acqd-result-meta {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
}
.acqd-result-ph {
  font-size: 12px;
  color: #41454d;
  font-variant-numeric: tabular-nums;
}
.acqd-result-tag {
  padding: 2px 8px;
  border-radius: 999px;
  background: #f0f1f3;
  font-size: 11px;
  font-weight: 500;
  color: #41454d;
  white-space: nowrap;
}

/* Tạo KH mới khi không tìm thấy ai khớp (2026-07-31) */
.acqd-new {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed #dddddd;
}
.acqd-new-t {
  margin-bottom: 8px;
  font-size: 11.5px;
  color: #41454d;
}

.acqd-link {
  margin-left: 4px;
  color: #1b61c9;
  text-decoration: underline;
  cursor: pointer;
  font-weight: 500;
}

.acqd-footer-hint {
  font-size: 11px;
  color: #41454d;
  background: #f8fafc;
  border-top: 1px solid #dddddd;
  padding: 10px 24px;
  line-height: 1.4;
}

.acqd-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 14px 24px;
  border-top: 1px solid #dddddd;
}

.acqd-btn {
  height: 38px;
  padding: 0 16px;
  border-radius: 7px;
  font-size: 13.5px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s, color 0.15s, transform 0.1s;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid transparent;
}
.acqd-btn--primary {
  background: #181d26;
  color: #ffffff;
  border-color: #181d26;
}
.acqd-btn--primary:hover:not(:disabled) { background: #0d1218; }
.acqd-btn--primary:active:not(:disabled) { transform: translateY(1px); }
.acqd-btn--primary:disabled {
  background: #e0e2e6;
  color: #41454d;
  border-color: #e0e2e6;
  cursor: not-allowed;
}
.acqd-btn--secondary {
  background: #ffffff;
  color: #181d26;
  border-color: #dddddd;
}
.acqd-btn--secondary:hover:not(:disabled) { background: #f8fafc; }
.acqd-btn--secondary:disabled { cursor: not-allowed; opacity: 0.6; }

.acqd-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: acqd-spin 0.6s linear infinite;
}
@keyframes acqd-spin {
  to { transform: rotate(360deg); }
}

/* FHD 1920 */
@media (min-width: 1920px) {
  .acqd-head { padding: 22px 28px 16px; }
  .acqd-body { padding: 20px 28px 22px; }
  .acqd-actions { padding: 16px 28px; }
  .acqd-footer-hint { padding: 12px 28px; }
  .acqd-title { font-size: 18px; }
}
/* 2K 2560 */
@media (min-width: 2560px) {
  .acqd-title { font-size: 20px; }
  .acqd-input { height: 42px; font-size: 15px; }
  .acqd-btn { height: 42px; font-size: 14.5px; }
}
</style>
