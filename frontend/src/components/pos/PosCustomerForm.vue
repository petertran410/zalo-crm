<template>
  <v-dialog v-model="dialog" max-width="500px" persistent>
    <v-card class="pos-customer-card rounded-lg shadow-xl border">
      <v-card-title class="d-flex justify-space-between align-center px-6 py-4 border-b">
        <span class="text-h6 font-weight-bold slate-dark">
          {{ isEdit ? 'Cập nhật Khách hàng POS' : 'Tạo Khách hàng POS mới' }}
        </span>
        <v-btn icon variant="text" size="small" @click="close" :disabled="submitting">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-card-text class="px-6 py-4">
        <!-- Error Alert -->
        <v-alert
          v-if="submitError"
          type="error"
          variant="tonal"
          density="compact"
          class="mb-4 text-caption"
          closable
          @click:close="submitError = null"
        >
          {{ submitError }}
        </v-alert>

        <v-form ref="formRef" @submit.prevent="submit">
          <v-text-field
            v-model="form.name"
            label="Họ tên *"
            placeholder="Nhập tên khách hàng"
            variant="outlined"
            density="comfortable"
            class="mb-3"
            :error-messages="errors.name"
            :disabled="submitting"
            hide-details="auto"
          />

          <v-text-field
            v-model="form.phone"
            label="Số điện thoại *"
            placeholder="Nhập số điện thoại (ví dụ: 0987654321)"
            variant="outlined"
            density="comfortable"
            class="mb-3"
            :error-messages="errors.phone"
            :disabled="submitting"
            hide-details="auto"
          />

          <v-text-field
            v-model="form.email"
            label="Email"
            placeholder="Nhập địa chỉ email"
            type="email"
            variant="outlined"
            density="comfortable"
            class="mb-3"
            :error-messages="errors.email"
            :disabled="submitting"
            hide-details="auto"
          />

          <v-textarea
            v-model="form.address"
            label="Địa chỉ"
            placeholder="Nhập địa chỉ chi tiết"
            variant="outlined"
            density="comfortable"
            rows="2"
            class="mb-3"
            :error-messages="errors.address"
            :disabled="submitting"
            hide-details="auto"
          />
        </v-form>
      </v-card-text>

      <v-card-actions class="px-6 py-4 border-t d-flex justify-end gap-2 bg-grey-lighten-5">
        <v-btn
          variant="outlined"
          color="grey-darken-1"
          @click="close"
          :disabled="submitting"
          class="text-none px-4 rounded-md"
        >
          Hủy bỏ
        </v-btn>
        <v-btn
          color="primary"
          @click="submit"
          :loading="submitting"
          class="text-none px-4 rounded-md shadow-sm"
          style="background-color: #0284c7; color: white;"
        >
          {{ isEdit ? 'Cập nhật' : 'Tạo mới' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, watch, computed } from 'vue';
import { usePosCommands } from '@/composables/use-pos-commands';
import { useToast } from '@/composables/use-toast';

const props = defineProps<{
  modelValue: boolean;
  contactId?: string | null;
  customerData?: {
    id?: number;
    code?: string;
    name?: string;
    phone?: string;
    email?: string;
    address?: string;
  } | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [val: boolean];
  'success': [customer: any];
}>();

const dialog = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
});

const isEdit = computed(() => !!props.customerData?.id);
const submitting = ref(false);
const submitError = ref<string | null>(null);

const { executeCommand } = usePosCommands();
const toast = useToast();

const form = reactive({
  name: '',
  phone: '',
  email: '',
  address: '',
});

const errors = reactive({
  name: '',
  phone: '',
  email: '',
  address: '',
});

function resetErrors() {
  errors.name = '';
  errors.phone = '';
  errors.email = '';
  errors.address = '';
}

// Theo dõi dữ liệu đầu vào để điền form
watch(
  () => props.modelValue,
  (isOpen) => {
    if (isOpen) {
      resetErrors();
      submitError.value = null;
      if (props.customerData) {
        form.name = props.customerData.name || '';
        form.phone = props.customerData.phone || '';
        form.email = props.customerData.email || '';
        form.address = props.customerData.address || '';
      } else {
        form.name = '';
        form.phone = '';
        form.email = '';
        form.address = '';
      }
    }
  }
);

function close() {
  dialog.value = false;
}

async function submit() {
  resetErrors();
  submitError.value = null;

  // Client-side basic check before submit
  let hasClientError = false;
  if (!form.name.trim()) {
    errors.name = 'Họ tên không được để trống';
    hasClientError = true;
  }
  if (!form.phone.trim()) {
    errors.phone = 'Số điện thoại không được để trống';
    hasClientError = true;
  }

  if (hasClientError) return;

  submitting.value = true;
  try {
    const commandName = isEdit.value ? 'UpdateCustomer' : 'CreateCustomer';
    const payload: any = {
      contactId: props.contactId,
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || undefined,
      address: form.address.trim() || undefined,
    };

    if (isEdit.value && props.customerData?.id) {
      payload.posCustomerId = props.customerData.id;
    }

    const result = await executeCommand(commandName, payload);

    if (result && result.success) {
      toast.success(isEdit.value ? 'Cập nhật khách hàng thành công!' : 'Tạo khách hàng POS thành công!');
      emit('success', result.data);
      close();
    } else {
      submitError.value = result?.message || 'Có lỗi xảy ra khi gửi dữ liệu sang POS';
      if (result?.errors) {
        Object.assign(errors, result.errors);
      }
    }
  } catch (err: any) {
    submitError.value = err.message || 'Lỗi kết nối mạng';
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.pos-customer-card {
  background: white;
  border-color: #e2e8f0 !important;
}
.slate-dark {
  color: #1e293b;
}
.gap-2 {
  gap: 8px;
}
.border-b {
  border-bottom: 1px solid #e2e8f0;
}
.border-t {
  border-top: 1px solid #e2e8f0;
}
</style>
