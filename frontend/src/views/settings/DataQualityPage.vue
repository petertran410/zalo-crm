<template>
  <!-- Cài đặt › Chất lượng dữ liệu (2026-07-29).
       Gom công cụ dò-gộp trùng vốn nằm trong menu "Công cụ" của ContactsView cũ.
       Lưu ý quan trọng: cron đêm CHỈ chấm điểm lead, KHÔNG tự dò trùng
       (đã tắt sau sự cố gộp sai 51 contact — xem duplicate-detector.ts).
       ⇒ Nút "Quét lại ngay" dưới đây là CÁCH DUY NHẤT để dò trùng chạy. -->
  <div class="dq-page">
    <header class="dq-head">
      <h1>Chất lượng dữ liệu</h1>
      <p>Dò và gộp khách hàng bị trùng, ghép khách con vào khách cha.</p>
    </header>

    <div class="dq-warn">
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M10 3.5 17.5 17H2.5z" /><path d="M10 8.5v3.5M10 14.2v.3" /></svg>
      <div>
        <b>Dò trùng không chạy tự động.</b>
        Cron hằng đêm chỉ chấm điểm lead. Việc dò-gộp trùng đã được tắt khỏi lịch tự động
        sau khi gộp sai hàng loạt, và chỉ chạy khi bấm <b>Quét lại ngay</b> bên dưới.
      </div>
    </div>

    <div class="dq-cards">
      <section class="dq-card">
        <div class="dq-card-h">
          <h2>Khách trùng lặp</h2>
          <span v-if="duplicateTotal > 0" class="dq-badge">{{ duplicateTotal }}</span>
        </div>
        <p>
          Nhóm bản ghi mà hệ thống nghi là cùng một người nhưng <em>không</em> tự gộp
          — thường do trùng số điện thoại nhưng khác Zalo globalId. Cần người xem rồi chốt.
        </p>
        <button class="dq-btn primary" @click="showDuplicates = true">
          Mở danh sách rà soát
        </button>
      </section>

      <section class="dq-card">
        <div class="dq-card-h">
          <h2>Gợi ý gộp khách cha</h2>
          <span v-if="candidateCount > 0" class="dq-badge">{{ candidateCount }}</span>
        </div>
        <p>
          Các bản ghi trùng tên + số điện thoại nhưng <em>khác</em> Zalo identity — cùng một
          người dùng nhiều Zalo. Ghép cha–con để giữ dữ liệu từng identity mà vẫn gộp hiển thị.
        </p>
        <button class="dq-btn" @click="showCandidates = true">
          Xem gợi ý
        </button>
      </section>

      <section class="dq-card">
        <div class="dq-card-h"><h2>Quét lại ngay</h2></div>
        <p>
          Chạy lại toàn bộ dò trùng + chấm điểm lead. Nên bấm sau khi import danh sách lớn.
          Chính sách hiện tại chỉ tự gộp theo globalId và số điện thoại.
        </p>
        <button class="dq-btn" :disabled="running" @click="onRunDetector">
          {{ running ? 'Đang quét…' : 'Quét lại ngay' }}
        </button>
        <div v-if="lastRun" class="dq-last">{{ lastRun }}</div>
      </section>
    </div>

    <DuplicateReviewDialog v-model="showDuplicates" @merged="refreshCounts" />
    <ParentCandidateDialog v-model="showCandidates" @resolved="refreshCounts" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '@/api/index';
import { useContactIntelligence } from '@/composables/use-contacts';
import { useToast } from '@/composables/use-toast';
import DuplicateReviewDialog from '@/components/contacts/DuplicateReviewDialog.vue';
import ParentCandidateDialog from '@/components/contacts/ParentCandidateDialog.vue';

const toast = useToast();
const { duplicateTotal, fetchDuplicateGroups } = useContactIntelligence();

const showDuplicates = ref(false);
const showCandidates = ref(false);
const candidateCount = ref(0);
const running = ref(false);
const lastRun = ref<string | null>(null);

async function refreshCounts() {
  try {
    await fetchDuplicateGroups(1, 1);
  } catch (err) {
    console.error('[DataQuality] duplicate count failed:', err);
  }
  try {
    const res = await api.get<{ candidates: unknown[] }>('/contacts/parent-candidates');
    candidateCount.value = res.data?.candidates?.length ?? 0;
  } catch (err) {
    console.error('[DataQuality] candidate count failed:', err);
  }
}

async function onRunDetector() {
  running.value = true;
  try {
    const res = await api.post<{ candidates?: number; duplicateGroups?: number }>('/admin/run-detector');
    const d = res.data?.duplicateGroups ?? 0;
    const c = res.data?.candidates ?? 0;
    lastRun.value = `Lần quét gần nhất: ${d} nhóm trùng, ${c} gợi ý cha–con.`;
    showToastLike(`Quét xong — ${d} nhóm trùng, ${c} gợi ý`);
    await refreshCounts();
  } catch (err) {
    console.error('[DataQuality] run-detector failed:', err);
    toast.error('Không chạy được quét lại');
  } finally {
    running.value = false;
  }
}
function showToastLike(msg: string) {
  toast.success(msg);
}

onMounted(refreshCounts);
</script>

<style scoped>
.dq-page { padding: 24px 28px 40px; max-width: 1100px; }
.dq-head h1 { margin: 0; font-size: 22px; font-weight: 800; color: var(--ink); }
.dq-head p { margin: 6px 0 0; font-size: 13.5px; color: var(--ink-2); }

.dq-warn {
  margin-top: 18px; padding: 14px 16px; border-radius: 12px;
  background: var(--warning-soft, #fff7e6); border: 1px solid var(--warning, #d97706);
  display: flex; gap: 12px; align-items: flex-start;
  font-size: 13px; line-height: 1.6; color: var(--ink);
}
.dq-warn svg { width: 18px; height: 18px; flex: none; margin-top: 2px; color: var(--warning, #d97706); }

.dq-cards {
  margin-top: 20px; display: grid; gap: 14px;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
}
.dq-card {
  padding: 18px; border-radius: 14px;
  background: var(--surface); border: 1px solid var(--line);
  display: flex; flex-direction: column; gap: 10px;
}
.dq-card-h { display: flex; align-items: center; gap: 9px; }
.dq-card-h h2 { margin: 0; font-size: 15px; font-weight: 700; color: var(--ink); }
.dq-badge {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 20px; height: 20px; padding: 0 6px; border-radius: 10px;
  background: var(--brand); color: #fff; font-size: 11.5px; font-weight: 800;
}
.dq-card p { margin: 0; font-size: 13px; line-height: 1.6; color: var(--ink-2); flex: 1; }
.dq-btn {
  align-self: flex-start; height: 36px; padding: 0 16px;
  border: 1px solid var(--line); border-radius: 8px;
  background: var(--surface); color: var(--ink);
  font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
}
.dq-btn:hover:not(:disabled) { background: var(--surface-3); }
.dq-btn.primary { background: var(--brand); border-color: var(--brand); color: #fff; }
.dq-btn:disabled { opacity: .6; cursor: not-allowed; }
.dq-last { font-size: 12px; color: var(--ink-3); }
</style>
