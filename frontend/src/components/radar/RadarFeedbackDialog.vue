<template>
  <v-dialog
    :model-value="modelValue"
    max-width="540"
    persistent
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card class="radar-feedback-card">
      <v-card-title class="radar-feedback-title d-flex align-center justify-space-between pb-2">
        <div class="d-flex align-center gap-2">
          <span class="text-h6">✏️</span>
          <span class="font-weight-bold text-h6 text-balance">Điều chỉnh chân dung khách hàng</span>
        </div>
        <v-btn
          icon="mdi-close"
          variant="text"
          density="comfortable"
          size="small"
          :disabled="isSubmitting"
          @click="onCancel"
        />
      </v-card-title>

      <v-card-text class="pt-2">
        <p class="text-body-2 text-medium-emphasis mb-3 text-pretty" style="hyphens: none;">
          Chọn 1 trong 5 cụm chân dung định danh phù hợp nhất với thông tin thực tế. Hệ thống sẽ củng cố trọng số liên kết đồ thị và kích hoạt lại kịch bản tư vấn tương ứng.
        </p>

        <!-- 5 Persona Clusters Options -->
        <div class="persona-options-grid mb-4">
          <div
            v-for="cluster in PERSONA_CLUSTERS"
            :key="cluster.id"
            class="persona-option-card"
            :class="{
              selected: selectedCluster === cluster.id,
              current: currentCluster === cluster.id
            }"
            @click="selectedCluster = cluster.id"
          >
            <div class="d-flex align-center justify-space-between mb-1">
              <span class="persona-chip-badge whitespace-nowrap" :class="`badge-${cluster.id.toLowerCase()}`">
                <span class="mr-1">{{ cluster.icon }}</span>
                <span>{{ cluster.badge }}</span>
              </span>
              <span v-if="currentCluster === cluster.id" class="current-tag whitespace-nowrap">
                Hiện tại
              </span>
            </div>
            <div class="persona-label font-weight-medium text-body-2 text-balance">
              {{ cluster.label }}
            </div>
            <div class="persona-desc text-caption text-medium-emphasis text-pretty" style="hyphens: none;">
              {{ cluster.desc }}
            </div>
          </div>
        </div>

        <!-- Note / Reason Input -->
        <div class="feedback-note-section">
          <label class="d-block text-caption font-weight-medium mb-1 text-balance">
            Lý do điều chỉnh (tuỳ chọn):
          </label>
          <v-textarea
            v-model="feedbackNote"
            variant="outlined"
            rows="2"
            auto-grow
            density="compact"
            maxlength="300"
            counter
            placeholder="Ví dụ: Khách vừa hỏi nhập sỉ số lượng 50 hộp..."
            hide-details="auto"
          />
        </div>
      </v-card-text>

      <v-card-actions class="px-4 pb-4">
        <v-spacer />
        <v-btn
          variant="text"
          class="whitespace-nowrap"
          :disabled="isSubmitting"
          @click="onCancel"
        >
          Hủy bỏ
        </v-btn>
        <v-btn
          color="primary"
          variant="flat"
          class="whitespace-nowrap font-weight-medium"
          :loading="isSubmitting"
          :disabled="!selectedCluster || isSubmitting"
          @click="onSubmit"
        >
          Lưu điều chỉnh
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import type { PersonaClusterId } from '@/api/radar';

export interface PersonaClusterOption {
  id: PersonaClusterId;
  badge: string;
  label: string;
  desc: string;
  icon: string;
}

const PERSONA_CLUSTERS: PersonaClusterOption[] = [
  {
    id: 'FNB_WORKSHOP_STUDENT',
    badge: 'Học viên WS',
    label: 'Học viên Workshop & Khởi nghiệp F&B',
    desc: 'Quan tâm khóa học pha chế thực chiến, công thức chuẩn vị, chuyển giao món hot-trend',
    icon: '🎓',
  },
  {
    id: 'FNB_SHOP_OWNER',
    badge: 'Chủ quán',
    label: 'Chủ quán Trà sữa / Cafe / Ăn vặt',
    desc: 'Chủ quán nhập sỉ thùng định kỳ: trà, trân châu, mứt, bột sữa và thiết bị quầy bar',
    icon: '🧋',
  },
  {
    id: 'WHOLESALE_DISTRIBUTOR',
    badge: 'Đại lý sỉ',
    label: 'Đại lý phân phối & Sỉ lớn tấn/pallet',
    desc: 'Đại lý phân phối tỉnh, nhập khối lượng lớn kèm thiết bị máy móc',
    icon: '🏢',
  },
  {
    id: 'HOME_CAFE_RETAIL',
    badge: 'Pha tại nhà',
    label: 'Khách tự pha tại nhà & Gia đình',
    desc: 'Khách mua lẻ tự làm đồ uống cho gia đình, chuộng công thức dễ làm & Freeship',
    icon: '🏠',
  },
  {
    id: 'TRIAL_EXPLORER',
    badge: 'Dùng thử',
    label: 'Khách mới chuộng mẫu thử 100g',
    desc: 'Khách mới tiếp cận thương hiệu, chuộng gói mẫu thử test vị trà trước khi nhập lớn',
    icon: '🎁',
  },
];

const props = defineProps<{
  modelValue: boolean;
  currentCluster?: string;
  isSubmitting?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'submit', targetCluster: string, note?: string): void;
}>();

const selectedCluster = ref<string>(props.currentCluster || 'FNB_SHOP_OWNER');
const feedbackNote = ref<string>('');

watch(
  () => props.modelValue,
  (isOpen) => {
    if (isOpen) {
      selectedCluster.value = props.currentCluster || 'FNB_SHOP_OWNER';
      feedbackNote.value = '';
    }
  }
);

function onCancel() {
  emit('update:modelValue', false);
}

function onSubmit() {
  if (!selectedCluster.value) return;
  emit('submit', selectedCluster.value, feedbackNote.value.trim() || undefined);
}
</script>

<style scoped>
.radar-feedback-card {
  border-radius: 12px;
  overflow: hidden;
}

.persona-options-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

.persona-option-card {
  border: 1.5px solid rgba(0, 0, 0, 0.08);
  border-radius: 8px;
  padding: 10px 12px;
  cursor: pointer;
  transition: all 0.15s ease-in-out;
  background: var(--v-theme-surface, #fff);
}

.persona-option-card:hover {
  border-color: rgba(99, 102, 241, 0.4);
  background: rgba(99, 102, 241, 0.02);
}

.persona-option-card.selected {
  border-color: #6366f1;
  background: rgba(99, 102, 241, 0.06);
  box-shadow: 0 0 0 1px #6366f1;
}

.persona-chip-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.badge-wholesale_buyer {
  background: #ede9fe;
  color: #6d28d9;
}
.badge-office_skincare {
  background: #e0f2fe;
  color: #0369a1;
}
.badge-mom_baby {
  background: #fce7f3;
  color: #be185d;
}
.badge-genz_acne_glow {
  background: #fef3c7;
  color: #b45309;
}
.badge-trial_explorer {
  background: #d1fae5;
  color: #047857;
}

.current-tag {
  font-size: 11px;
  color: #6b7280;
  background: #f3f4f6;
  padding: 1px 6px;
  border-radius: 4px;
}

.whitespace-nowrap {
  white-space: nowrap !important;
}

.text-balance {
  text-wrap: balance;
}

.text-pretty {
  text-wrap: pretty;
}
</style>
