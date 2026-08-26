<template>
  <div v-if="open" class="cuwz-overlay" @click.self="tryClose">
    <div class="cuwz-modal">
      <header class="cuwz-header">
        <h2>
          <span v-if="step === 1">➕ Thêm nhân viên</span>
          <span v-else>✅ Tạo thành công</span>
        </h2>
        <button class="cuwz-close" @click="tryClose" :disabled="creating">×</button>
      </header>

      <div class="cuwz-stepper">
        <span :class="['step', { active: step === 1 }]">1. Thông tin</span>
        <span :class="['step', { active: step === 2 }]">2. Hoàn tất</span>
      </div>

      <div v-if="step === 1" class="cuwz-body">
        <div class="cuwz-field">
          <label>Họ và tên đầy đủ <span class="req">*</span></label>
          <input v-model="form.fullName" type="text" placeholder="VD: Nguyễn Văn A" />
        </div>

        <div class="cuwz-field">
          <label>Email đăng nhập <span class="req">*</span></label>
          <input v-model="form.email" type="email" placeholder="VD: nguyenvana@congty.com" />
          <div class="cuwz-hint">Nhân viên dùng email + mật khẩu để đăng nhập CRM. Không cần tài khoản Zalo.</div>
        </div>

        <div class="cuwz-field">
          <label>Mật khẩu tạm <span class="req">*</span></label>
          <div class="cuwz-pw-row">
            <input v-model="form.password" type="text" placeholder="Tối thiểu 6 ký tự" />
            <button type="button" class="btn-copy" @click="generatePassword">🎲 Tạo ngẫu nhiên</button>
          </div>
          <div class="cuwz-hint">Mật khẩu do tổ chức quản lý. Khi cần thay đổi, owner/admin sẽ đặt lại.</div>
        </div>

        <div class="cuwz-field">
          <label>Số điện thoại (tuỳ chọn)</label>
          <input v-model="form.phone" type="tel" placeholder="Bỏ trống nếu không cần" />
        </div>

        <div class="cuwz-row">
          <div class="cuwz-field flex1">
            <label>Phòng ban</label>
            <select v-model="form.departmentId">
              <option value="">— Chưa gán —</option>
              <option v-for="d in flatDepts" :key="d.id" :value="d.id">
                {{ '— '.repeat(d._depth) }}{{ d.name }}
              </option>
            </select>
          </div>

          <div class="cuwz-field flex1">
            <label>Nhóm quyền</label>
            <select v-model="form.permissionGroupId">
              <option value="">— Chưa gán —</option>
              <option v-for="g in flatGroups" :key="g.id" :value="g.id">
                {{ '— '.repeat(g._depth) }}{{ g.name }}
              </option>
            </select>
          </div>
        </div>

        <div v-if="createError" class="cuwz-alert error">{{ createError }}</div>
        <div v-else-if="validationError" class="cuwz-alert warning">{{ validationError }}</div>

        <footer class="cuwz-footer">
          <button class="btn-secondary" :disabled="creating" @click="tryClose">Huỷ</button>
          <button class="btn-primary" :disabled="!canCreate || creating" @click="onCreate">
            <span v-if="creating">⏳ Đang tạo...</span>
            <span v-else>✅ Tạo nhân viên</span>
          </button>
        </footer>
      </div>

      <div v-else-if="step === 2 && createResult" class="cuwz-body">
        <div class="cuwz-success-banner">
          <div class="cuwz-success-icon">✅</div>
          <div>
            <div class="cuwz-success-title">Đã tạo {{ createResult.fullName }}</div>
            <div class="cuwz-success-sub">Gửi thông tin đăng nhập bên dưới cho nhân viên.</div>
          </div>
        </div>

        <div class="cuwz-creds">
          <h4>Thông tin đăng nhập (copy gửi cho nhân viên)</h4>
          <textarea
            class="cuwz-cred-textarea"
            :value="credentialsText"
            readonly
            rows="6"
            @focus="($event.target as HTMLTextAreaElement).select()"
          ></textarea>
          <button class="btn-copy-all" @click="copy(credentialsText)">
            {{ copiedAll ? '✅ Đã copy' : '📋 Copy toàn bộ' }}
          </button>
          <div class="cuwz-cred-note">Mật khẩu do tổ chức quản lý; nhân viên không thể tự đổi mật khẩu.</div>
        </div>

        <footer class="cuwz-footer">
          <button class="btn-primary" @click="finish">Đóng + xem danh sách</button>
        </footer>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { api } from '@/api/index';

interface DeptNode {
  id: string;
  name: string;
  _depth: number;
}
interface GroupNode {
  id: string;
  name: string;
  _depth: number;
}

interface Props {
  open: boolean;
  departments: DeptNode[];
  permissionGroups: GroupNode[];
}
const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void;
  (e: 'created'): void;
}>();

interface CreatedUser {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  role: string;
}

const step = ref<1 | 2>(1);
const form = reactive({
  fullName: '',
  email: '',
  password: '',
  phone: '',
  departmentId: '',
  permissionGroupId: '',
});
const creating = ref(false);
const createError = ref('');
const createResult = ref<CreatedUser | null>(null);

const flatDepts = computed(() => props.departments || []);
const flatGroups = computed(() => props.permissionGroups || []);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;

// Thông báo lý do cụ thể để admin biết vì sao chưa bấm được "Tạo nhân viên".
const validationError = computed(() => {
  if (form.fullName.trim().length === 0) return 'Vui lòng nhập họ và tên.';
  if (!EMAIL_RE.test(form.email.trim())) return 'Email đăng nhập không hợp lệ.';
  if (form.password.length < MIN_PASSWORD_LENGTH) {
    return `Mật khẩu tối thiểu ${MIN_PASSWORD_LENGTH} ký tự.`;
  }
  return '';
});

const canCreate = computed(() => validationError.value === '');

function generatePassword() {
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const all = lower + upper + digits;
  const bytes = new Uint32Array(12);
  crypto.getRandomValues(bytes);
  const chars = [
    lower[bytes[0] % lower.length],
    upper[bytes[1] % upper.length],
    digits[bytes[2] % digits.length],
  ];
  for (let i = 3; i < bytes.length; i += 1) chars.push(all[bytes[i] % all.length]);
  form.password = chars.join('');
}

async function onCreate() {
  if (!canCreate.value) return;
  creating.value = true;
  createError.value = '';
  try {
    const { data } = await api.post('/users', {
      fullName: form.fullName.trim(),
      email: form.email.trim().toLowerCase(),
      password: form.password,
      phone: form.phone.trim() || null,
      departmentId: form.departmentId || null,
      permissionGroupId: form.permissionGroupId || null,
      role: 'member',
    });
    createResult.value = data as CreatedUser;
    step.value = 2;
  } catch (err: any) {
    createError.value = err?.response?.data?.error || 'Tạo nhân viên thất bại';
  } finally {
    creating.value = false;
  }
}

function tryClose() {
  if (creating.value) return;
  emit('update:open', false);
}

function finish() {
  emit('created');
  emit('update:open', false);
}

const loginUrl = window.location.origin + '/login';
const credentialsText = computed(() => {
  const r = createResult.value;
  if (!r) return '';
  const lines = [`Tài khoản CRM — ${r.fullName}`, ''];
  if (r.email) lines.push(`Email đăng nhập: ${r.email}`);
  if (r.phone) lines.push(`SĐT: ${r.phone}`);
  lines.push(`Mật khẩu tạm: ${form.password}`);
  lines.push(`Link đăng nhập: ${loginUrl}`);
  lines.push('');
  lines.push('Lưu ý: Mật khẩu do tổ chức quản lý; khi cần thay đổi hãy liên hệ quản trị viên.');
  return lines.join('\n');
});

const copiedAll = ref(false);
function copy(text: string) {
  if (navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(text).catch(() => copyFallback(text));
  } else {
    copyFallback(text);
  }
  copiedAll.value = true;
  window.setTimeout(() => { copiedAll.value = false; }, 2000);
}

function copyFallback(text: string) {
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      step.value = 1;
      form.fullName = '';
      form.email = '';
      form.password = '';
      form.phone = '';
      form.departmentId = '';
      form.permissionGroupId = '';
      createError.value = '';
      createResult.value = null;
    }
  },
);
</script>

<style scoped>
.cuwz-overlay {
  position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); z-index: 1000;
  display: flex; align-items: center; justify-content: center; padding: 20px;
}
.cuwz-modal {
  background: var(--cream, #fffaf2); border-radius: 14px; width: 100%; max-width: 560px;
  max-height: 90vh; display: flex; flex-direction: column; overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
}
.cuwz-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 22px; border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}
.cuwz-header h2 { margin: 0; font-size: 18px; font-weight: 600; }
.cuwz-close {
  border: 0; background: transparent; font-size: 24px; cursor: pointer;
  width: 32px; height: 32px; line-height: 1; border-radius: 6px;
}
.cuwz-close:hover:not(:disabled) { background: rgba(0, 0, 0, 0.06); }
.cuwz-stepper {
  display: flex; gap: 8px; padding: 12px 22px; font-size: 13px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05); color: #888;
}
.cuwz-stepper .step.active { color: #2d6cdf; font-weight: 600; }
.cuwz-body { padding: 20px 22px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; }
.cuwz-field { display: flex; flex-direction: column; gap: 6px; }
.cuwz-field label { font-size: 13px; font-weight: 500; color: #444; }
.cuwz-field .req { color: #d9534f; }
.cuwz-field input,
.cuwz-field select {
  font: inherit; padding: 9px 11px; border: 1px solid #cfcfcf; border-radius: 7px;
  background: white;
}
.cuwz-field input:focus,
.cuwz-field select:focus { outline: 2px solid #2d6cdf55; border-color: #2d6cdf; }
.cuwz-hint { font-size: 12px; color: #888; }
.cuwz-row { display: flex; gap: 12px; }
.cuwz-pw-row { display: flex; gap: 8px; align-items: center; }
.cuwz-pw-row input { flex: 1; }
.flex1 { flex: 1; }
.cuwz-footer {
  display: flex; gap: 10px; justify-content: flex-end; padding-top: 14px;
  border-top: 1px solid rgba(0, 0, 0, 0.06); margin-top: auto;
}
.btn-primary {
  background: #2d6cdf; color: white; border: 0; padding: 9px 16px;
  border-radius: 7px; font: inherit; font-weight: 500; cursor: pointer;
}
.btn-primary:disabled { background: #aac4ec; cursor: not-allowed; }
.btn-secondary {
  background: transparent; color: #555; border: 1px solid #cfcfcf;
  padding: 9px 16px; border-radius: 7px; font: inherit; cursor: pointer;
}
.cuwz-alert {
  padding: 9px 12px; border-radius: 7px; font-size: 13px;
  border-left: 3px solid;
}
.cuwz-alert.error { background: #fdecea; color: #b71c1c; border-color: #d9534f; }
.cuwz-alert.warning { background: #fff8e1; color: #6d4c00; border-color: #fbc02d; }
.cuwz-success-banner {
  display: flex; gap: 14px; padding: 14px;
  background: #e6f4ea; border-radius: 10px;
}
.cuwz-success-icon { font-size: 30px; }
.cuwz-success-title { font-size: 17px; font-weight: 600; color: #1e6e2c; }
.cuwz-success-sub { font-size: 13px; color: #555; margin-top: 2px; }
.cuwz-creds {
  padding: 14px; background: rgba(0, 0, 0, 0.03); border-radius: 9px;
}
.cuwz-creds h4 { margin: 0 0 10px 0; font-size: 14px; }
.btn-copy {
  border: 1px solid #cfcfcf; background: white; padding: 8px 12px;
  border-radius: 7px; font-size: 12px; cursor: pointer; white-space: nowrap;
}
.btn-copy:hover { background: #f5f5f5; }
.cuwz-cred-note { font-size: 12px; color: #888; margin-top: 6px; }
.cuwz-cred-textarea {
  width: 100%; box-sizing: border-box; font-family: var(--mono, monospace);
  font-size: 12.5px; line-height: 1.6; background: white; border: 1px solid #ddd;
  border-radius: 7px; padding: 10px 12px; color: #1f2937; resize: vertical;
}
.cuwz-cred-textarea:focus { outline: none; border-color: var(--brand, #1786be); }
.btn-copy-all {
  margin-top: 8px; border: none; background: var(--brand, #1786be); color: white;
  padding: 8px 16px; border-radius: 7px; font-size: 13px; font-weight: 600; cursor: pointer;
}
.btn-copy-all:hover { filter: brightness(0.95); }
</style>
