/**
 * use-appointment-badge.ts — 2026-08-04
 *
 * Số lịch hẹn CÒN MỞ trong hôm nay, để gắn badge lên tab "Lịch hẹn" ở thanh nav.
 * Công cụ dùng hằng ngày thì cái sale cần biết ngay khi mở app là "hôm nay còn
 * mấy cái", chứ không phải bấm vào tab mới thấy.
 *
 * Dùng lại `GET /appointments/today` — endpoint này có sẵn ở BE và được ghi trong
 * tài liệu API công khai, nhưng từ lúc dọn code (2026-08-01) không còn chỗ nào gọi.
 *
 * State là module-level (singleton): nav render 1 lần cho cả app, không cần mỗi
 * component giữ bản sao riêng.
 */
import { ref } from 'vue';
import { api } from '@/api/index';

const REFRESH_MS = 5 * 60_000;
const OPEN_STATUSES = new Set(['scheduled', 'overdue']);

const todayCount = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;
let inflight = false;

async function refresh(): Promise<void> {
  if (inflight) return;
  inflight = true;
  try {
    const res = await api.get('/appointments/today');
    const list = res.data?.appointments ?? res.data ?? [];
    todayCount.value = Array.isArray(list)
      ? list.filter((a: { status?: string }) => OPEN_STATUSES.has(a?.status ?? '')).length
      : 0;
  } catch {
    // Badge là phụ trợ — hỏng thì im lặng, không chen banner lỗi lên nav.
    todayCount.value = 0;
  } finally {
    inflight = false;
  }
}

export function useAppointmentBadge() {
  if (!timer) {
    void refresh();
    timer = setInterval(() => { void refresh(); }, REFRESH_MS);
  }
  return { todayCount, refreshAppointmentBadge: refresh };
}
