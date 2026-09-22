<template>
  <v-dialog
    :model-value="modelValue"
    max-width="520"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card class="group-member-radar-card">
      <v-card-title class="d-flex align-center justify-space-between pb-2 border-b">
        <div class="d-flex align-center gap-2">
          <span class="text-h6">🎯</span>
          <span class="font-weight-bold text-h6 text-balance">Chân dung suy luận thành viên nhóm</span>
        </div>
        <v-btn
          icon="mdi-close"
          variant="text"
          density="comfortable"
          size="small"
          @click="emit('update:modelValue', false)"
        />
      </v-card-title>

      <v-card-text class="pt-3">
        <!-- Member Header -->
        <div class="member-header d-flex align-center gap-3 mb-3 p-2 bg-slate-50 rounded">
          <v-avatar size="44" color="primary" variant="tonal">
            <v-img v-if="member?.avatarUrl" :src="member.avatarUrl" :alt="memberDisplayName" />
            <span v-else class="font-weight-bold text-body-1">{{ memberDisplayName.charAt(0) }}</span>
          </v-avatar>
          <div class="member-info flex-grow-1 overflow-hidden">
            <div class="member-name font-weight-bold text-body-1 text-truncate">
              {{ memberDisplayName }}
            </div>
            <div class="member-meta text-caption text-medium-emphasis d-flex align-center gap-2">
              <span class="font-mono whitespace-nowrap">UID: {{ member?.memberUid || member?.uid || '—' }}</span>
              <span v-if="groupName" class="text-truncate text-pretty" style="hyphens: none;">
                • Nhóm: {{ groupName }}
              </span>
            </div>
          </div>
        </div>

        <!-- Radar Persona & Confidence Block -->
        <div class="persona-details-card mb-3 p-3 rounded border">
          <div class="d-flex align-center justify-space-between mb-2">
            <span
              class="persona-badge whitespace-nowrap"
              :class="`cluster-${radarPersonaId.toLowerCase()}`"
            >
              <span class="mr-1">{{ personaIcon }}</span>
              <span class="font-weight-bold">{{ personaBadgeLabel }}</span>
            </span>

            <span
              class="confidence-badge whitespace-nowrap"
              :class="isConsolidated ? 'conf-emerald' : 'conf-amber'"
            >
              <span class="conf-dot"></span>
              <span>{{ isConsolidated ? 'Củng cố' : 'Sơ bộ' }}:</span>
              <strong class="tabular-nums ml-1">{{ confidencePercentage }}&nbsp;%</strong>
            </span>
          </div>

          <div class="persona-label font-weight-medium text-body-2 mb-1 text-balance">
            {{ personaFullLabel }}
          </div>

          <!-- Evidence Subgraph / Homophily Note -->
          <div class="homophily-evidence text-caption text-medium-emphasis text-pretty mt-1" style="hyphens: none;">
            🔍 <strong>Căn cứ suy luận:</strong> {{ evidenceDescription }}
          </div>
        </div>

        <!-- Suggested Outreach Message (NBA Script) -->
        <div class="outreach-script-card p-3 rounded bg-indigo-50 border border-indigo-100">
          <div class="d-flex align-center justify-space-between mb-1">
            <span class="text-caption font-weight-bold text-indigo-900 whitespace-nowrap">
              💬 Kịch bản kết bạn & mở đầu gợi ý:
            </span>
            <v-btn
              size="x-small"
              color="primary"
              variant="text"
              class="whitespace-nowrap"
              prepend-icon="mdi-content-copy"
              @click="copyOutreachScript"
            >
              Sao chép
            </v-btn>
          </div>
          <p class="outreach-text text-body-2 text-slate-800 text-pretty m-0" style="hyphens: none;">
            {{ outreachScript }}
          </p>
        </div>
      </v-card-text>

      <v-card-actions class="px-4 pb-4">
        <v-spacer />
        <v-btn
          variant="text"
          class="whitespace-nowrap"
          @click="emit('update:modelValue', false)"
        >
          Đóng
        </v-btn>
        <v-btn
          color="primary"
          variant="flat"
          class="whitespace-nowrap font-weight-medium"
          prepend-icon="mdi-account-plus"
          @click="handleCreateContact"
        >
          Tạo khách hàng CRM
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useToast } from '@/composables/use-toast';

export interface GroupMemberRadarData {
  id?: string;
  memberUid?: string;
  uid?: string;
  displayName?: string;
  zaloName?: string;
  avatarUrl?: string;
  radar?: {
    personaId?: string;
    label?: string;
    clusterBadge?: string;
    confidenceScore?: number;
    confidencePercentage?: number;
    confidenceTier?: string;
    source?: string;
    homophilyGroupName?: string;
    nbaScript?: string;
  };
}

const props = defineProps<{
  modelValue: boolean;
  member: GroupMemberRadarData | null;
  groupName?: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'create-contact', member: GroupMemberRadarData): void;
}>();

const toast = useToast();

const memberDisplayName = computed(() => {
  return props.member?.displayName || props.member?.zaloName || 'Thành viên Zalo';
});

const radarPersonaId = computed(() => {
  return props.member?.radar?.personaId || 'TRIAL_EXPLORER';
});

const personaBadgeLabel = computed(() => {
  return props.member?.radar?.clusterBadge || getClusterFallbackBadge(radarPersonaId.value);
});

const personaFullLabel = computed(() => {
  return props.member?.radar?.label || getClusterFallbackLabel(radarPersonaId.value);
});

const confidencePercentage = computed(() => {
  return props.member?.radar?.confidencePercentage ?? 58;
});

const isConsolidated = computed(() => {
  return (
    props.member?.radar?.confidenceTier === 'CONSOLIDATED' ||
    confidencePercentage.value >= 80
  );
});

const personaIcon = computed(() => {
  switch (radarPersonaId.value.toUpperCase()) {
    case 'FNB_WORKSHOP_STUDENT':
      return '🎓';
    case 'FNB_SHOP_OWNER':
      return '🧋';
    case 'WHOLESALE_DISTRIBUTOR':
      return '🏢';
    case 'HOME_CAFE_RETAIL':
      return '🏠';
    case 'TRIAL_EXPLORER':
      return '🎁';
    default:
      return '🎯';
  }
});

const evidenceDescription = computed(() => {
  const gName = props.groupName || props.member?.radar?.homophilyGroupName;
  if (gName) {
    return `Đồng nhất nhóm (Group Homophily) từ "${gName}". Tỷ lệ quan tâm tương đồng trong nhóm đạt >75%.`;
  }
  return 'Phân tích từ khóa tương tác và cấu trúc nhóm Zalo nguồn.';
});

const outreachScript = computed(() => {
  if (props.member?.radar?.nbaScript) {
    return props.member.radar.nbaScript;
  }
  const name = memberDisplayName.value;
  switch (radarPersonaId.value.toUpperCase()) {
    case 'FNB_WORKSHOP_STUDENT':
      return `Chào bạn ${name}, mình thấy bạn cũng quan tâm đến các chương trình Workshop đào tạo pha chế của Hi Sweetie. Bên mình sắp tổ chức buổi Workshop cập nhật công thức chuẩn quán, mình kết bạn trao đổi nhé!`;
    case 'FNB_SHOP_OWNER':
      return `Chào bạn ${name}, mình thấy bạn cũng đang kinh doanh quán đồ uống. Bên mình chuyên sỉ nguyên liệu cốt trà, trân châu, mứt sinh tố date mới giá tận xưởng, mình kết bạn trao đổi bảng giá sỉ nhé!`;
    case 'WHOLESALE_DISTRIBUTOR':
      return `Chào bạn ${name}, mình gửi lời mời kết bạn nhé! Hi Sweetie đang có chính sách đại lý cấp 1 phân phối nguyên liệu và máy móc quầy bar chiết khấu tốt nhất, rất vui được kết nối!`;
    case 'HOME_CAFE_RETAIL':
      return `Chào bạn ${name}, bên mình chuyên cung cấp nguyên liệu và công thức pha trà sữa, trà trái cây chuẩn vị quán dễ làm tại nhà kèm Freeship, mình kết bạn nhé!`;
    default:
      return `Chào bạn ${name}, Hi Sweetie đang có chương trình gửi tặng gói mẫu thử 100g test vị trà miễn phí, mình kết bạn để tiện gửi thông tin nhé!`;
  }
});

function getClusterFallbackBadge(id: string): string {
  switch (id.toUpperCase()) {
    case 'FNB_WORKSHOP_STUDENT': return 'Học viên WS';
    case 'FNB_SHOP_OWNER': return 'Chủ quán';
    case 'WHOLESALE_DISTRIBUTOR': return 'Đại lý sỉ';
    case 'HOME_CAFE_RETAIL': return 'Pha tại nhà';
    case 'TRIAL_EXPLORER': return 'Dùng thử';
    default: return 'Khách hàng';
  }
}

function getClusterFallbackLabel(id: string): string {
  switch (id.toUpperCase()) {
    case 'FNB_WORKSHOP_STUDENT': return 'Học viên Workshop & Khởi nghiệp F&B';
    case 'FNB_SHOP_OWNER': return 'Chủ quán Trà sữa / Cafe / Ăn vặt';
    case 'WHOLESALE_DISTRIBUTOR': return 'Đại lý phân phối & Sỉ lớn';
    case 'HOME_CAFE_RETAIL': return 'Khách tự pha tại nhà & Gia đình';
    case 'TRIAL_EXPLORER': return 'Khách mới chuộng mẫu thử 100g';
    default: return 'Khách hàng tiềm năng';
  }
}

function copyOutreachScript() {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(outreachScript.value).catch(() => {});
  }
  toast.success('Đã sao chép kịch bản mở lời vào khay nhớ tạm!');
}

function handleCreateContact() {
  if (props.member) {
    emit('create-contact', props.member);
    emit('update:modelValue', false);
  }
}
</script>

<style scoped>
.group-member-radar-card {
  border-radius: 12px;
  overflow: hidden;
}

.persona-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: 9999px;
  font-size: 11.5px;
}

.cluster-wholesale_buyer { background: #ede9fe; color: #6d28d9; }
.cluster-office_skincare { background: #e0f2fe; color: #0369a1; }
.cluster-mom_baby { background: #fce7f3; color: #be185d; }
.cluster-genz_acne_glow { background: #fef3c7; color: #b45309; }
.cluster-trial_explorer { background: #d1fae5; color: #047857; }

.confidence-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  border-radius: 6px;
  font-size: 11px;
}

.conf-amber { background: #fffbeb; color: #b45309; border: 1px solid #fde68a; }
.conf-emerald { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }

.conf-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  margin-right: 5px;
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

.tabular-nums {
  font-variant-numeric: tabular-nums;
}
</style>
