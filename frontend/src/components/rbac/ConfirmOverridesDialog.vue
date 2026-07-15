<template>
  <v-dialog :model-value="modelValue" max-width="480" persistent>
    <v-card>
      <v-card-title class="text-h6">Xác nhận lưu phân quyền lẻ</v-card-title>
      <v-card-text>
        <div class="mb-3 text-body-2">
          Áp dụng cho <strong>{{ userName }}</strong>:
        </div>

        <div v-if="diff.added.length > 0" class="mb-2">
          <v-chip color="success" size="small" class="mr-1">+ {{ diff.added.length }}</v-chip>
          <span class="text-body-2">
            <strong>Cấp thêm:</strong> {{ diff.added.join(', ') }}
          </span>
        </div>

        <div v-if="diff.removed.length > 0" class="mb-2">
          <v-chip color="error" size="small" class="mr-1">− {{ diff.removed.length }}</v-chip>
          <span class="text-body-2">
            <strong>Thu hồi:</strong> {{ diff.removed.join(', ') }}
          </span>
        </div>

        <div class="text-caption text-grey mt-3">
          Tổng: {{ diff.totalBefore }} → {{ diff.totalAfter }} quyền lẻ
        </div>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="$emit('cancel')">Hủy</v-btn>
        <v-btn color="primary" :loading="loading" @click="$emit('confirm')">
          Xác nhận lưu
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import type { DiffSummary } from '@/composables/use-grants-diff';

defineProps<{
  modelValue: boolean;
  userName: string;
  diff: DiffSummary;
  loading: boolean;
}>();
defineEmits<{
  'update:modelValue': [v: boolean];
  confirm: [];
  cancel: [];
}>();
</script>
