<template>
  <div class="customer-radar-widget">
    <!-- ═══════════ HEADER BLOCK ═══════════ -->
    <div class="radar-header d-flex align-center justify-space-between" @click="toggleCollapse">
      <div class="d-flex align-center gap-2">
        <div class="radar-pulsing-icon">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 12a4 4 0 0 1 4 4" />
            <path d="M12 12a7 7 0 0 1 7 7" />
            <circle cx="12" cy="12" r="1" fill="currentColor" />
          </svg>
        </div>
        <div>
          <h3 class="radar-title text-balance whitespace-nowrap">
            Smart Customer Radar
          </h3>
        </div>
      </div>

      <div class="d-flex align-center gap-1">
        <!-- Quick Action: Refresh -->
        <button
          type="button"
          class="radar-icon-btn"
          title="Tái phân tích lại đồ thị tri thức (bỏ qua cache 24h)"
          :disabled="isLoading || isRefreshing"
          @click.stop="handleRefresh"
        >
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            :class="{ 'spin-anim': isRefreshing }"
          >
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
          </svg>
        </button>

        <!-- Toggle Collapse Accordion -->
        <button
          type="button"
          class="radar-icon-btn"
          :title="isCollapsed ? 'Mở rộng' : 'Thu gọn'"
          @click.stop="toggleCollapse"
        >
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            :class="{ 'rotate-180': !isCollapsed }"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>
    </div>

    <!-- ═══════════ LOADING & ERROR STATES ═══════════ -->
    <div v-if="isLoading && !radarData" class="radar-loading-body py-4 text-center">
      <div class="radar-loader-spinner mb-2"></div>
      <p class="text-caption text-medium-emphasis text-pretty" style="hyphens: none;">
        Đang đối chiếu đồ thị CKG & phân tích chân dung...
      </p>
    </div>

    <div v-else-if="error && !radarData" class="radar-error-body py-3 px-3">
      <div class="text-caption text-error mb-2 text-pretty" style="hyphens: none;">
        {{ error }}
      </div>
      <button type="button" class="btn-retry-radar whitespace-nowrap" @click="loadRadar(true)">
        Thử lại
      </button>
    </div>

    <!-- ═══════════ MAIN CONTENT BODY ═══════════ -->
    <div v-else-if="radarData" v-show="!isCollapsed" class="radar-content-body">
      <!-- 1. Persona Cluster Badge & Headline -->
      <div class="persona-section mb-3">
        <div class="d-flex align-center justify-space-between gap-1 mb-1">
          <span
            class="persona-badge whitespace-nowrap"
            :class="`cluster-${radarData.persona.id.toLowerCase()}`"
          >
            <span class="persona-icon mr-1">{{ getPersonaIcon(radarData.persona.id) }}</span>
            <span class="persona-badge-text">{{ radarData.persona.clusterBadge || radarData.persona.label }}</span>
          </span>

          <!-- Progressive Confidence Badge -->
          <span
            class="confidence-badge whitespace-nowrap"
            :class="isConsolidated ? 'conf-emerald' : 'conf-amber'"
            :title="`Độ tin cậy: ${confidencePercentage}% (${isConsolidated ? 'Củng cố' : 'Sơ bộ'})`"
          >
            <span class="conf-pulse-dot" :class="{ 'pulse-active': !isConsolidated }"></span>
            <span class="conf-text">
              {{ isConsolidated ? 'Củng cố' : 'Sơ bộ' }}:
              <strong class="tabular-nums">{{ confidencePercentage }}&nbsp;%</strong>
            </span>
          </span>
        </div>

        <h4 class="persona-headline text-balance">
          {{ radarData.persona.headline || radarData.persona.label }}
        </h4>

        <p class="persona-summary text-pretty" style="hyphens: none;">
          {{ radarData.persona.summary }}
        </p>

        <!-- Progressive Confidence Meter (Progress Bar) -->
        <div class="confidence-meter-track mt-2 mb-1">
          <div
            class="confidence-meter-bar"
            :class="isConsolidated ? 'bar-emerald' : 'bar-amber'"
            :style="{ width: `${confidencePercentage}%` }"
          ></div>
        </div>

        <!-- Time Decay Indicator (if decayed) -->
        <div
          v-if="radarData.confidence.decayStatus?.isDecayed"
          class="time-decay-indicator d-flex align-center gap-1 mt-1"
        >
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span class="whitespace-nowrap text-caption" style="hyphens: none;">
            {{ radarData.confidence.decayStatus.daysSinceLastEvent }} ngày chưa tương tác (đang suy giảm theo thời gian)
          </span>
        </div>
      </div>

      <!-- 2. Next Best Action (NBA) Box & Quick Insert -->
      <div v-if="radarData.nextBestAction" class="nba-card mb-3">
        <div class="d-flex align-center justify-space-between mb-1">
          <span class="nba-tag whitespace-nowrap">
            🎯 {{ radarData.nextBestAction.title || 'Kịch bản Next Best Action' }}
          </span>
          <button
            type="button"
            class="btn-insert-pill whitespace-nowrap"
            title="Chèn kịch bản vào khung chat Zalo"
            @click="handleInsertScript(radarData.nextBestAction.scriptText)"
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
            <span>Chèn vào chat</span>
          </button>
        </div>

        <p class="nba-script-text text-pretty" style="hyphens: none;">
          {{ radarData.nextBestAction.scriptText }}
        </p>

        <!-- Suggested Voucher (if present) -->
        <div
          v-if="radarData.nextBestAction.suggestedVoucher"
          class="voucher-block d-flex align-center justify-space-between gap-2 mt-2"
        >
          <div class="d-flex align-center gap-1.5 overflow-hidden">
            <span class="voucher-ticket whitespace-nowrap font-mono">
              🎟️ {{ radarData.nextBestAction.suggestedVoucher }}
            </span>
            <span
              v-if="radarData.nextBestAction.voucherRationale"
              class="voucher-rationale text-caption text-truncate text-pretty"
              :title="radarData.nextBestAction.voucherRationale"
              style="hyphens: none;"
            >
              {{ radarData.nextBestAction.voucherRationale }}
            </span>
          </div>
          <button
            type="button"
            class="btn-voucher-insert whitespace-nowrap"
            title="Chèn mã voucher vào chat"
            @click="handleInsertVoucher(radarData.nextBestAction.suggestedVoucher!)"
          >
            Dùng mã
          </button>
        </div>

        <!-- Recommended Product Chips (if present) -->
        <div
          v-if="radarData.nextBestAction.suggestedProducts?.length"
          class="recommended-products mt-2"
        >
          <div class="rec-label text-caption font-weight-medium whitespace-nowrap mb-1">
            Sản phẩm đề xuất:
          </div>
          <div class="product-chips-wrap d-flex flex-wrap gap-1">
            <button
              v-for="product in radarData.nextBestAction.suggestedProducts"
              :key="product"
              type="button"
              class="product-chip whitespace-nowrap"
              title="Bấm để chèn tên sản phẩm vào khung chat"
              @click="handleInsertProduct(product)"
            >
              🏷️ {{ product }}
            </button>
          </div>
        </div>
      </div>

      <!-- 3. Actionable Talking Points (3 Điểm Chạm Tư Vấn) -->
      <div v-if="talkingPoints.length" class="talking-points-section mb-3">
        <div class="section-title text-caption font-weight-bold mb-1.5 text-balance">
          3 Điểm tư vấn trọng tâm:
        </div>
        <div class="talking-points-list d-flex flex-column gap-1.5">
          <div
            v-for="(point, idx) in talkingPoints"
            :key="idx"
            class="talking-point-item d-flex align-start gap-2"
          >
            <span class="point-num whitespace-nowrap">{{ idx + 1 }}</span>
            <div class="point-text flex-grow-1 text-pretty" style="hyphens: none;">
              {{ point }}
            </div>
            <div class="point-actions d-flex align-center gap-1">
              <button
                type="button"
                class="btn-point-icon"
                title="Chèn vào khung chat"
                @click="handleInsertScript(point)"
              >
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
              <button
                type="button"
                class="btn-point-icon"
                title="Sao chép nội dung"
                @click="handleCopyText(point)"
              >
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 4. Evidence Subgraph Section (Bằng chứng đồ thị quan hệ) -->
      <div v-if="radarData.evidenceSubgraph" class="evidence-subgraph-section mb-3">
        <div class="evidence-header d-flex align-center justify-space-between mb-1.5">
          <div class="evidence-title text-caption font-weight-bold text-balance">
            🕸️ Bằng chứng đồ thị quan hệ:
          </div>
        </div>

        <!-- Metrics Summary Cards/Chips -->
        <div class="evidence-metrics-row d-flex flex-wrap gap-1.5 mb-1.5">
          <div class="evidence-metric-chip whitespace-nowrap">
            <span class="metric-label">Nhóm chung:&nbsp;</span>
            <strong class="metric-val tabular-nums">{{ radarData.evidenceSubgraph?.metrics?.sharedGroupsCount || 0 }}</strong>
          </div>
          <div class="evidence-metric-chip whitespace-nowrap">
            <span class="metric-label">Đơn hàng:&nbsp;</span>
            <strong class="metric-val tabular-nums">{{ radarData.evidenceSubgraph?.metrics?.totalOrdersCount || 0 }}</strong>
          </div>
          <div class="evidence-metric-chip whitespace-nowrap">
            <span class="metric-label">Khách tương đồng:&nbsp;</span>
            <strong class="metric-val tabular-nums">{{ radarData.evidenceSubgraph?.metrics?.homophilyNeighborsCount || 0 }}</strong>
          </div>
        </div>

        <!-- Supporting Evidence Nodes/Chips -->
        <div
          v-if="radarData.evidenceSubgraph?.nodes?.length"
          class="evidence-nodes-wrap d-flex flex-wrap gap-1 mb-1.5"
        >
          <span
            v-for="node in radarData.evidenceSubgraph.nodes"
            :key="node.id"
            class="evidence-node-chip whitespace-nowrap"
            :title="`${node.type}: ${node.label}`"
          >
            {{ getNodeIcon(node.type) }}&nbsp;{{ node.label }}
          </span>
        </div>

        <!-- Rationale Explanation Text -->
        <p class="evidence-rationale text-caption text-pretty" style="hyphens: none;">
          {{ evidenceRationale }}
        </p>
      </div>

      <!-- 5. Human Feedback Loop UI (3 Nút Phản Hồi) -->
      <div class="feedback-loop-bar pt-2 border-t">
        <div class="feedback-label text-caption text-medium-emphasis mb-1.5 text-balance">
          Phản hồi độ chính xác (Human-in-the-loop):
        </div>
        <div class="feedback-buttons-row d-flex align-center gap-1.5">
          <!-- Button 1: CONFIRM 👍 -->
          <button
            type="button"
            class="btn-feedback btn-confirm flex-grow-1 whitespace-nowrap"
            :class="{ 'btn-active': feedbackStatus === 'CONFIRMED' }"
            :disabled="isSubmittingFeedback"
            title="Xác nhận chân dung đúng, nâng độ tin cậy lên 95%"
            @click="handleConfirm"
          >
            <span class="mr-1">👍</span>
            <span class="whitespace-nowrap">Xác nhận đúng</span>
          </button>

          <!-- Button 2: OVERRIDE ✏️ -->
          <button
            type="button"
            class="btn-feedback btn-override flex-grow-1 whitespace-nowrap"
            :class="{ 'btn-active': feedbackStatus === 'OVERRIDDEN' }"
            :disabled="isSubmittingFeedback"
            title="Điều chỉnh sang 1 trong 5 cụm chân dung khác"
            @click="openOverrideDialog"
          >
            <span class="mr-1">✏️</span>
            <span class="whitespace-nowrap">Điều chỉnh</span>
          </button>

          <!-- Button 3: REJECT 👎 -->
          <button
            type="button"
            class="btn-feedback btn-reject whitespace-nowrap"
            :class="{ 'btn-active': feedbackStatus === 'REJECTED' }"
            :disabled="isSubmittingFeedback"
            title="Đánh dấu chân dung chưa đúng, giảm trọng số"
            @click="handleReject"
          >
            <span class="mr-1">👎</span>
            <span class="whitespace-nowrap">Chưa đúng</span>
          </button>
        </div>
      </div>
    </div>

    <!-- ═══════════ MODAL OVERRIDE CHÂN DUNG ═══════════ -->
    <RadarFeedbackDialog
      v-model="isOverrideDialogOpen"
      :current-cluster="radarData?.persona.id"
      :is-submitting="isSubmittingFeedback"
      @submit="handleOverrideSubmit"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useCustomerRadar } from '@/composables/use-customer-radar';
import RadarFeedbackDialog from './RadarFeedbackDialog.vue';
import { useToast } from '@/composables/use-toast';

const props = defineProps<{
  contactId: string;
  contactName?: string;
}>();

const emit = defineEmits<{
  (e: 'insert-suggestion', text: string): void;
}>();

const toast = useToast();
const isCollapsed = ref(false);
const isOverrideDialogOpen = ref(false);

const {
  radarData,
  isLoading,
  isRefreshing,
  isSubmittingFeedback,
  error,
  feedbackStatus,
  loadRadar,
  confirmPersona,
  rejectPersona,
  overridePersona,
  insertScriptToChat,
} = useCustomerRadar(() => props.contactId);

// ── Computed Properties ─────────────────────────────────────────────────────

const confidencePercentage = computed(() => {
  return radarData.value?.confidence.percentage || 0;
});

const isConsolidated = computed(() => {
  if (!radarData.value) return false;
  return (
    radarData.value.confidence.tier === 'CONSOLIDATED' ||
    radarData.value.confidence.score >= 0.8 ||
    radarData.value.confidence.percentage >= 80
  );
});

const talkingPoints = computed<string[]>(() => {
  if (!radarData.value) return [];
  const points = radarData.value.persona.talkingPoints;
  if (Array.isArray(points) && points.length > 0) {
    return points.slice(0, 3);
  }
  const needs = radarData.value.persona.predictedNeeds;
  if (Array.isArray(needs) && needs.length > 0) {
    return needs.slice(0, 3).map((n) => `Khách hàng đang quan tâm nhu cầu: ${n}`);
  }
  return [];
});

const evidenceRationale = computed(() => {
  const subgraph = radarData.value?.evidenceSubgraph;
  if (!subgraph) return 'Chưa có thông tin đồ thị quan hệ.';
  const metrics = subgraph.metrics;
  const groups = metrics?.sharedGroupsCount || 0;
  const orders = metrics?.totalOrdersCount || 0;
  const neighbors = metrics?.homophilyNeighborsCount || 0;

  if (groups > 0 || orders > 0 || neighbors > 0) {
    const parts: string[] = [];
    if (groups > 0) parts.push(`${groups} nhóm chung`);
    if (orders > 0) parts.push(`${orders} đơn hàng`);
    if (neighbors > 0) parts.push(`${neighbors} khách hàng tương đồng`);
    return `Suy luận chân dung dựa trên phân tích đồ thị quan hệ: ${parts.join(', ')}.`;
  }
  return 'Chưa có đủ liên kết đồ thị trực tiếp; chân dung được ước lượng sơ bộ từ tương tác ban đầu.';
});

// ── Helpers & Action Handlers ───────────────────────────────────────────────

function getNodeIcon(type?: string): string {
  switch (String(type).toUpperCase()) {
    case 'GROUP':
      return '👥';
    case 'ORDER':
      return '📦';
    case 'PERSONA':
      return '🎯';
    case 'WORKSHOP':
      return '🎓';
    case 'INTEREST':
      return '💡';
    case 'CONTACT':
      return '👤';
    default:
      return '🔗';
  }
}

function getPersonaIcon(personaId?: string): string {
  switch (String(personaId).toUpperCase()) {
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
}

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value;
}

function handleRefresh() {
  void loadRadar(true);
}

function handleInsertScript(text: string) {
  if (!text) return;
  emit('insert-suggestion', text);
  insertScriptToChat(text);
}

function handleInsertVoucher(voucherCode: string) {
  const text = `Em xin phép gửi tặng mình mã ưu đãi ${voucherCode} để áp dụng cho đơn hàng này ạ!`;
  emit('insert-suggestion', text);
  insertScriptToChat(text, `Đã chèn mã ưu đãi ${voucherCode} vào khung chat!`);
}

function handleInsertProduct(productName: string) {
  const text = `Dạ sản phẩm ${productName} bên em rất phù hợp với nhu cầu của mình ạ.`;
  emit('insert-suggestion', text);
  insertScriptToChat(text);
}

function handleCopyText(text: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
  }
  toast.success('Đã sao chép nội dung vào khay nhớ tạm!');
}

async function handleConfirm() {
  await confirmPersona();
}

async function handleReject() {
  await rejectPersona();
}

function openOverrideDialog() {
  isOverrideDialogOpen.value = true;
}

async function handleOverrideSubmit(targetCluster: string, note?: string) {
  const success = await overridePersona(targetCluster, note);
  if (success) {
    isOverrideDialogOpen.value = false;
  }
}
</script>

<style scoped>
.customer-radar-widget {
  border-radius: 12px;
  border: 1px solid rgba(99, 102, 241, 0.25);
  background: linear-gradient(
    135deg,
    rgba(245, 247, 255, 0.95) 0%,
    rgba(250, 245, 255, 0.9) 50%,
    rgba(255, 250, 250, 0.85) 100%
  );
  padding: 12px;
  margin-bottom: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  font-family: inherit;
  transition: all 0.2s ease;
}

:global(.dark) .customer-radar-widget {
  background: linear-gradient(
    135deg,
    rgba(15, 23, 42, 0.95) 0%,
    rgba(30, 27, 75, 0.4) 50%,
    rgba(15, 23, 42, 0.95) 100%
  );
  border-color: rgba(99, 102, 241, 0.35);
}

.radar-header {
  cursor: pointer;
  user-select: none;
}

.radar-pulsing-icon {
  color: #6366f1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.radar-title {
  font-size: 13px;
  font-weight: 700;
  color: #1e293b;
  margin: 0;
  line-height: 1.3;
}

:global(.dark) .radar-title {
  color: #f1f5f9;
}

.radar-icon-btn {
  background: transparent;
  border: none;
  padding: 4px;
  border-radius: 6px;
  color: #64748b;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.radar-icon-btn:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.06);
  color: #1e293b;
}

.persona-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.cluster-wholesale_buyer {
  background: #ede9fe;
  color: #6d28d9;
}
.cluster-office_skincare {
  background: #e0f2fe;
  color: #0369a1;
}
.cluster-mom_baby {
  background: #fce7f3;
  color: #be185d;
}
.cluster-genz_acne_glow {
  background: #fef3c7;
  color: #b45309;
}
.cluster-trial_explorer {
  background: #d1fae5;
  color: #047857;
}

.confidence-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 7px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  border: 1px solid transparent;
}

.conf-amber {
  background: #fffbeb;
  color: #b45309;
  border-color: #fde68a;
}
:global(.dark) .conf-amber {
  background: rgba(120, 53, 15, 0.3);
  color: #fcd34d;
  border-color: #78350f;
}

.conf-emerald {
  background: #ecfdf5;
  color: #047857;
  border-color: #a7f3d0;
}
:global(.dark) .conf-emerald {
  background: rgba(6, 78, 59, 0.3);
  color: #6ee7b7;
  border-color: #064e3b;
}

.conf-pulse-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.pulse-active {
  animation: pulse-ring 2s infinite ease-in-out;
}

@keyframes pulse-ring {
  0% { opacity: 0.4; transform: scale(0.9); }
  50% { opacity: 1; transform: scale(1.2); }
  100% { opacity: 0.4; transform: scale(0.9); }
}

.persona-headline {
  font-size: 12.5px;
  font-weight: 600;
  color: #334155;
  margin: 4px 0 2px 0;
  line-height: 1.35;
}

:global(.dark) .persona-headline {
  color: #e2e8f0;
}

.persona-summary {
  font-size: 11.5px;
  color: #64748b;
  margin: 0;
  line-height: 1.45;
  text-align: left;
}

:global(.dark) .persona-summary {
  color: #94a3b8;
}

.confidence-meter-track {
  height: 5px;
  background: rgba(0, 0, 0, 0.08);
  border-radius: 9999px;
  overflow: hidden;
}

:global(.dark) .confidence-meter-track {
  background: rgba(255, 255, 255, 0.1);
}

.confidence-meter-bar {
  height: 100%;
  border-radius: 9999px;
  transition: width 0.4s ease-out;
}

.bar-amber {
  background: #f59e0b;
}

.bar-emerald {
  background: #10b981;
}

.time-decay-indicator {
  font-size: 10.5px;
  color: #d97706;
}

/* ── NBA Card ── */
.nba-card {
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(99, 102, 241, 0.2);
  border-radius: 8px;
  padding: 8px 10px;
}

:global(.dark) .nba-card {
  background: rgba(30, 41, 59, 0.7);
  border-color: rgba(99, 102, 241, 0.3);
}

.nba-tag {
  font-size: 11px;
  font-weight: 700;
  color: #4f46e5;
}

:global(.dark) .nba-tag {
  color: #818cf8;
}

.btn-insert-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #4f46e5;
  color: #ffffff;
  border: none;
  border-radius: 9999px;
  padding: 2px 8px;
  font-size: 10.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-insert-pill:hover {
  background: #4338ca;
}

.nba-script-text {
  font-size: 11.5px;
  color: #334155;
  margin: 4px 0 0 0;
  line-height: 1.45;
  text-align: left;
}

:global(.dark) .nba-script-text {
  color: #cbd5e1;
}

.voucher-block {
  background: rgba(147, 51, 234, 0.05);
  border: 1px dashed rgba(147, 51, 234, 0.3);
  border-radius: 6px;
  padding: 4px 8px;
}

.voucher-ticket {
  font-size: 11px;
  font-weight: 700;
  color: #7e22ce;
}

.voucher-rationale {
  font-size: 10.5px;
  color: #6b7280;
}

.btn-voucher-insert {
  background: #7e22ce;
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
}

.btn-voucher-insert:hover {
  background: #6b21a8;
}

.rec-label {
  font-size: 10.5px;
  color: #64748b;
}

.product-chip {
  display: inline-flex;
  align-items: center;
  background: rgba(0, 0, 0, 0.04);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 6px;
  padding: 2px 6px;
  font-size: 10.5px;
  color: #334155;
  cursor: pointer;
  transition: all 0.15s;
}

:global(.dark) .product-chip {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.1);
  color: #e2e8f0;
}

.product-chip:hover {
  background: rgba(99, 102, 241, 0.1);
  border-color: #6366f1;
  color: #4f46e5;
}

/* ── Talking Points ── */
.talking-point-item {
  background: rgba(255, 255, 255, 0.6);
  border-radius: 6px;
  padding: 4px 6px;
}

:global(.dark) .talking-point-item {
  background: rgba(30, 41, 59, 0.4);
}

.point-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #e2e8f0;
  color: #475569;
  font-size: 10px;
  font-weight: 700;
  flex-shrink: 0;
  margin-top: 1px;
}

:global(.dark) .point-num {
  background: #334155;
  color: #cbd5e1;
}

.point-text {
  font-size: 11px;
  color: #334155;
  line-height: 1.4;
  text-align: left;
}

:global(.dark) .point-text {
  color: #cbd5e1;
}

.btn-point-icon {
  background: transparent;
  border: none;
  padding: 2px;
  border-radius: 4px;
  color: #64748b;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
}

.btn-point-icon:hover {
  color: #4f46e5;
  background: rgba(99, 102, 241, 0.1);
}

/* ── Evidence Subgraph Section ── */
.evidence-subgraph-section {
  background: rgba(248, 250, 252, 0.8);
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px 10px;
}

:global(.dark) .evidence-subgraph-section {
  background: rgba(30, 41, 59, 0.4);
  border-color: #334155;
}

.evidence-title {
  color: #334155;
  font-size: 11.5px;
}

:global(.dark) .evidence-title {
  color: #cbd5e1;
}

.evidence-metric-chip {
  display: inline-flex;
  align-items: center;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 2px 7px;
  font-size: 11px;
  color: #475569;
}

:global(.dark) .evidence-metric-chip {
  background: rgba(51, 65, 85, 0.4);
  border-color: #475569;
  color: #cbd5e1;
}

.evidence-metric-chip .metric-val {
  color: #0f172a;
  font-weight: 700;
}

:global(.dark) .evidence-metric-chip .metric-val {
  color: #f8fafc;
}

.evidence-node-chip {
  display: inline-flex;
  align-items: center;
  background: #ede9fe;
  color: #5b21b6;
  border: 1px solid #ddd6fe;
  border-radius: 6px;
  padding: 1px 6px;
  font-size: 10.5px;
  font-weight: 500;
}

:global(.dark) .evidence-node-chip {
  background: rgba(109, 40, 217, 0.2);
  color: #c4b5fd;
  border-color: #5b21b6;
}

.evidence-rationale {
  font-size: 11px;
  color: #64748b;
  margin: 0;
  line-height: 1.4;
  text-align: left;
}

:global(.dark) .evidence-rationale {
  color: #94a3b8;
}

/* ── Feedback Buttons ── */
.btn-feedback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 5px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid transparent;
}

.btn-confirm {
  background: #ecfdf5;
  color: #047857;
  border-color: #a7f3d0;
}
.btn-confirm:hover:not(:disabled) {
  background: #d1fae5;
}
.btn-confirm.btn-active {
  background: #059669;
  color: #fff;
}

.btn-override {
  background: #eff6ff;
  color: #1d4ed8;
  border-color: #bfdbfe;
}
.btn-override:hover:not(:disabled) {
  background: #dbeafe;
}
.btn-override.btn-active {
  background: #2563eb;
  color: #fff;
}

.btn-reject {
  background: #fff1f2;
  color: #be123c;
  border-color: #fecdd3;
}
.btn-reject:hover:not(:disabled) {
  background: #ffe4e6;
}
.btn-reject.btn-active {
  background: #e11d48;
  color: #fff;
}

.btn-feedback:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.radar-loader-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(99, 102, 241, 0.2);
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.spin-anim {
  animation: spin 0.8s linear infinite;
}

.rotate-180 {
  transform: rotate(180deg);
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
