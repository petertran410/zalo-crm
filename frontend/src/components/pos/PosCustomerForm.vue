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
            :disabled="submitting || detailsLoading"
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
            :error="phoneDuplicate"
            :disabled="submitting || detailsLoading"
            hide-details="auto"
          />
          <v-alert
            v-if="phoneDuplicate"
            type="warning"
            variant="tonal"
            density="compact"
            class="mb-3 text-caption"
          >
            {{ duplicateMessage }}
            <div v-if="existingPosCustomer" class="mt-1">
              POS {{ existingPosCustomer.code || `#${existingPosCustomer.id}` }} · {{ existingPosCustomer.name }}.
              {{ duplicateLinkedHere ? 'Tài khoản này đã liên kết với liên hệ hiện tại. Hãy dùng “Cập nhật thông tin POS”.' : 'Dùng “Tìm & liên kết POS” để gắn tài khoản này.' }}
            </div>
          </v-alert>

          <v-text-field
            v-model="form.email"
            label="Email"
            placeholder="Nhập địa chỉ email"
            type="email"
            variant="outlined"
            density="comfortable"
            class="mb-3"
            :error-messages="errors.email"
            :disabled="submitting || detailsLoading"
            hide-details="auto"
          />

          <v-autocomplete
            v-model="form.cityCode"
            :items="provinces"
            item-title="name"
            item-value="code"
            label="Tỉnh/Thành phố"
            placeholder="Chọn tỉnh/thành phố"
            variant="outlined"
            density="comfortable"
            class="mb-3"
            :loading="locationsLoading"
            :disabled="submitting || detailsLoading || locationsLoading"
            hide-details="auto"
            clearable
          />
          <v-autocomplete
            v-model="form.wardCode"
            :items="availableCommunes"
            item-title="name"
            item-value="code"
            label="Phường/Xã"
            placeholder="Chọn phường/xã"
            variant="outlined"
            density="comfortable"
            class="mb-3"
            :disabled="submitting || detailsLoading || !form.cityCode || locationsLoading"
            hide-details="auto"
            clearable
          />
          <v-text-field
            v-model="form.address"
            :label="isEdit ? 'Địa chỉ chi tiết' : 'Địa chỉ chi tiết *'"
            placeholder="Nhập địa chỉ chi tiết"
            variant="outlined"
            density="comfortable"
            class="mb-3"
            :error-messages="errors.address"
            :disabled="submitting || detailsLoading"
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
          :loading="submitting || checkingPhone"
          :disabled="phoneDuplicate || locationsLoading || detailsLoading"
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
import { ref, reactive, watch, computed, shallowRef } from 'vue';
import { api } from '@/api/index';
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
    addresses?: Array<{
      address?: string;
      newCityCode?: string;
      newCityName?: string;
      newWardCode?: string;
      newWardName?: string;
      isDefault?: boolean;
    }>;
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
const duplicateMessage = 'Số điện thoại đã được liên kết với một tài khoản POS';
const phoneDuplicate = ref(false);
const checkingPhone = ref(false);
const existingPosCustomer = ref<{ id: number; code: string | null; name: string } | null>(null);
const duplicateLinkedHere = ref(false);
const lastCheckedPhone = ref<string | null>(null);
const locationsLoading = ref(false);
const detailsLoading = ref(false);
const provinces = shallowRef<Array<{ code: string; name: string }>>([]);
const communes = shallowRef<Array<{ code: string; name: string; provinceCode: string }>>([]);
const availableCommunes = computed(() => communes.value.filter((item) => item.provinceCode === form.cityCode));
let phoneTimer: ReturnType<typeof setTimeout> | undefined;
let phoneRequestId = 0;
let dialogRequestId = 0;

const { executeCommand } = usePosCommands();
const toast = useToast();

const form = reactive({
  name: '',
  phone: '',
  email: '',
  address: '',
  cityCode: null as string | null,
  wardCode: null as string | null,
});
let originalAddress = { address: '', cityCode: null as string | null, wardCode: null as string | null };
let originalPosLocation: { newCityCode?: string; newCityName?: string; newWardName?: string } | null = null;

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

async function loadLocations() {
  if (provinces.value.length && communes.value.length) return;
  locationsLoading.value = true;
  try {
    const [provinceData, communeData] = await Promise.all([
      import('@/data/new-province-location.json'),
      import('@/data/new-commune-location.json'),
    ]);
    provinces.value = provinceData.provinces.map(({ code, name }) => ({ code, name: name.replace(/\s+/g, ' ').trim() }));
    communes.value = communeData.communes.map(({ code, name, provinceCode }) => ({ code, name: name.replace(/\s+/g, ' ').trim(), provinceCode }));
  } finally {
    locationsLoading.value = false;
  }
}

async function fillAddress(requestId: number) {
  detailsLoading.value = isEdit.value;
  try {
    await loadLocations();
    if (requestId !== dialogRequestId) return;
    let addresses = props.customerData?.addresses;
    if (isEdit.value && !addresses?.length) {
      const response = await api.get(`/pos/customers/${props.customerData!.id}`);
      if (requestId !== dialogRequestId) return;
      const customer = response.data?.data || response.data;
      addresses = customer?.addresses;
      form.name = customer?.name || form.name;
      form.phone = customer?.phone || customer?.contactNumber || form.phone;
      form.email = customer?.email || form.email;
      form.address = customer?.address || form.address;
    }
    const address = addresses?.find((item) => item.isDefault) || addresses?.[0];
    if (address) {
      originalPosLocation = address;
      const province = provinces.value.find((item) => item.code === address.newCityCode)
        || provinces.value.find((item) => item.name === address.newCityName?.replace(/\s+/g, ' ').trim());
      form.cityCode = province?.code || null;
      const ward = communes.value.find((item) => item.provinceCode === form.cityCode
        && (item.code === address.newWardCode || item.name === address.newWardName?.replace(/\s+/g, ' ').trim()));
      form.wardCode = ward?.code || null;
      form.address = address.address || '';
    }
    originalAddress = { address: form.address, cityCode: form.cityCode, wardCode: form.wardCode };
  } catch {
    if (requestId === dialogRequestId) submitError.value = 'Không tải được địa chỉ POS. Vui lòng mở lại biểu mẫu.';
  } finally {
    if (requestId === dialogRequestId) detailsLoading.value = false;
  }
}

watch(
  () => props.modelValue,
  (isOpen) => {
    dialogRequestId++;
    phoneRequestId++;
    clearTimeout(phoneTimer);
    checkingPhone.value = false;
    if (isOpen) {
      resetErrors();
      submitError.value = null;
      phoneDuplicate.value = false;
      existingPosCustomer.value = null;
      duplicateLinkedHere.value = false;
      lastCheckedPhone.value = null;
      form.cityCode = null;
      form.wardCode = null;
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
      originalAddress = { address: form.address, cityCode: null, wardCode: null };
      originalPosLocation = null;
      void fillAddress(dialogRequestId);
    }
  }
);

watch(() => form.cityCode, () => {
  if (!availableCommunes.value.some((item) => item.code === form.wardCode)) form.wardCode = null;
});

function normalizedPhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (/^0[35789]\d{8}$/.test(digits)) return `84${digits.slice(1)}`;
  if (/^84[35789]\d{8}$/.test(digits)) return digits;
  return null;
}

async function checkPhone() {
  const phone = form.phone.trim();
  const normalized = normalizedPhone(phone);
  if (!normalized) return true;
  if (lastCheckedPhone.value === normalized) return !phoneDuplicate.value;
  const requestId = ++phoneRequestId;
  checkingPhone.value = true;
  try {
    const response = await api.get('/pos/customers/check-phone', {
      params: { phone, contactId: props.contactId, ...(isEdit.value ? { excludePosId: props.customerData?.id } : {}) },
    });
    if (requestId !== phoneRequestId) return false;
    phoneDuplicate.value = !!response.data.exists;
    existingPosCustomer.value = response.data.customer || null;
    duplicateLinkedHere.value = !!response.data.linkedToContact;
    lastCheckedPhone.value = normalized;
    return !phoneDuplicate.value;
  } catch {
    if (requestId === phoneRequestId) submitError.value = 'Không thể kiểm tra số điện thoại POS. Vui lòng thử lại.';
    return false;
  } finally {
    if (requestId === phoneRequestId) checkingPhone.value = false;
  }
}

watch(() => form.phone, () => {
  clearTimeout(phoneTimer);
  phoneRequestId++;
  phoneDuplicate.value = false;
  existingPosCustomer.value = null;
  duplicateLinkedHere.value = false;
  lastCheckedPhone.value = null;
  checkingPhone.value = false;
  if (submitError.value === 'Không thể kiểm tra số điện thoại POS. Vui lòng thử lại.') submitError.value = null;
  if (dialog.value && normalizedPhone(form.phone)) phoneTimer = setTimeout(() => { void checkPhone(); }, 450);
});

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
  if (!isEdit.value && !form.address.trim()) {
    errors.address = 'Địa chỉ chi tiết không được để trống';
    hasClientError = true;
  }

  if (hasClientError) return;
  clearTimeout(phoneTimer);
  if (!(await checkPhone())) return;
  if (form.wardCode && !form.cityCode) return;

  submitting.value = true;
  try {
    const commandName = isEdit.value ? 'UpdateCustomer' : 'CreateCustomer';
    const payload: any = {
      contactId: props.contactId,
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || undefined,
    };

    const addressChanged = !isEdit.value
      || form.address !== originalAddress.address
      || form.cityCode !== originalAddress.cityCode
      || form.wardCode !== originalAddress.wardCode;
    if (addressChanged) {
      const province = provinces.value.find((item) => item.code === form.cityCode);
      const commune = communes.value.find((item) => item.code === form.wardCode && item.provinceCode === form.cityCode);
      const keepCity = form.cityCode === originalAddress.cityCode;
      const keepWard = keepCity && form.wardCode === originalAddress.wardCode;
      payload.address = form.address.trim();
      payload.cityCode = province?.code || (keepCity ? originalPosLocation?.newCityCode : '') || '';
      payload.cityName = province?.name || (keepCity ? originalPosLocation?.newCityName : '') || '';
      payload.wardName = commune?.name || (keepWard ? originalPosLocation?.newWardName : '') || '';
    }

    if (isEdit.value && props.customerData?.id) {
      payload.posCustomerId = props.customerData.id;
    }

    const result = await executeCommand(commandName, payload);

    if (result && result.success) {
      toast.success(isEdit.value ? 'Cập nhật khách hàng thành công!' : 'Tạo khách hàng POS thành công!');
      emit('success', result.data);
      close();
    } else {
      if (result?.errors) {
        Object.assign(errors, result.errors);
      }
      if (result?.errors?.phone === duplicateMessage || result?.message === duplicateMessage) {
        phoneDuplicate.value = true;
        errors.phone = '';
      } else {
        submitError.value = result?.message || 'Có lỗi xảy ra khi gửi dữ liệu sang POS';
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
