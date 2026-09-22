/**
 * Composable for appointment (lịch hẹn) management:
 * - List with filters (date range, status, contact)
 * - CRUD operations
 * - Today / upcoming shortcuts
 */
import { ref, reactive } from 'vue';
import { api } from '@/api/index';

export interface Appointment {
  id: string;
  contactId: string;
  contact?: { id: string; fullName: string | null; phone: string | null; avatarUrl?: string | null; zaloUid?: string | null };
  appointmentDate: string;
  appointmentTime: string;
  // 2026-05-21 "Nhắc hẹn" fields
  title?: string | null;
  durationMin?: number;
  location?: string | null;
  type: string;
  status: string;
  notes: string | null;
  createdAt: string;
  // Phase A: phân biệt nguồn + link sang Zalo conversation
  source: 'manual' | 'zalo';
  externalRef: string | null;
  zaloMessageId: string | null;
  emoji: string | null;
  conversationId: string | null; // resolve từ backend join với Message.conversation
  // Audit: ai đổi status cuối + lúc nào (cron auto-flip không set)
  statusChangedAt: string | null;
  statusChangedBy: { id: string; fullName: string | null; email: string } | null;
  // Người phụ trách lịch hẹn (BE trả qua APPOINTMENT_INCLUDE). Dùng cho màu/filter theo sale.
  assignedUserId?: string | null;
  assignedUser?: { id: string; fullName: string | null } | null;
  // Alias cũ — code AppointmentEditor dùng assignedTo?.id (merge từ stash khi giải
  // conflict 2026-06-11, giữ để không vỡ component). durationMin đã khai báo ở trên.
  assignedToId?: string | null;
  assignedTo?: { id: string; fullName: string | null; email: string } | null;
}

export interface AppointmentFilters {
  from: string;
  to: string;
  status: string;
  contactId: string;
  source: 'all' | 'manual' | 'zalo'; // filter chip
}

// 5 trạng thái: 'scheduled' (chưa đến giờ) → cron auto-flip → 'overdue' khi quá hạn.
// Sale mark thủ công sang completed/cancelled/no_show.
export const APPOINTMENT_STATUS_OPTIONS = [
  { text: 'Đã lên lịch', value: 'scheduled' },
  { text: 'Quá hạn', value: 'overdue' },
  { text: 'Hoàn thành', value: 'completed' },
  { text: 'Đã huỷ', value: 'cancelled' },
  { text: 'Vắng mặt', value: 'no_show' },
];

// 2026-05-21 chốt: 4 loại nhắc hẹn cho domain BĐS (rename từ healthcare).
// Migration data cũ trong appointments table:
//   reminder / tai_kham → follow_up (catchall "Theo dõi")
//   new_visit           → meeting (Gặp mặt)
//   consultation        → call (Gọi điện)
//   other               → follow_up
export const APPOINTMENT_TYPE_OPTIONS = [
  { text: 'Gọi điện', value: 'call' },
  { text: 'Nhắn tin', value: 'message' },
  { text: 'Gặp mặt', value: 'meeting' },
  { text: 'Theo dõi', value: 'follow_up' },
];

/**
 * 2026-08-01 (revamp "Rail"): khối helper trùng lặp ở đây đã XOÁ — bản dùng thật
 * nằm ở `appointment-helpers.ts`. Bản cũ trong file này là bản chưa vá:
 * `appointmentStart` bỏ qua `appointmentTime` (bug "auto 7h", đã fix ở helpers)
 * và `typeIcon` chỉ map type legacy nên trả 📌 cho call/message/meeting.
 * Không nơi nào import chúng — giữ lại chỉ tạo bẫy cho lần sửa sau.
 * Cùng lượt: bỏ fetchToday/fetchUpcoming/create/update/deleteAppointment +
 * sourceCounts vì không có call site nào (editor tự gọi api.post/api.put).
 */

/**
 * Trần số lịch tải 1 lần. Khung xem là 1 tuần nên 500 dư sức cho org bận
 * (~70 lịch/ngày); vượt ngưỡng thì view hiện cảnh báo cắt bớt thay vì im lặng.
 */
export const PAGE_LIMIT = 500;

export function useAppointments() {
  const appointments = ref<Appointment[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const saving = ref(false);
  // 2026-08-01: trước đây lỗi fetch chỉ console.error → UI đứng im ở trạng thái
  // rỗng, sale tưởng "tuần này không có lịch". Giữ lại để view render banner lỗi.
  const error = ref('');

  const filters = reactive<AppointmentFilters>({
    from: '',
    to: '',
    status: '',
    contactId: '',
    source: 'all',
  });

  async function fetchAppointments() {
    loading.value = true;
    error.value = '';
    try {
      const res = await api.get('/appointments', {
        params: {
          dateFrom: filters.from || undefined,
          dateTo: filters.to || undefined,
          status: filters.status || undefined,
          contactId: filters.contactId || undefined,
          source: filters.source === 'all' ? undefined : filters.source,
          // BẮT BUỘC gửi limit: BE mặc định 50 (appointment-routes.ts). Trước đây
          // FE không gửi → tuần nào >50 lịch là bị cắt âm thầm, và vì BE sort
          // appointmentDate DESC nên ngày ĐẦU tuần bị rụng trước. Lịch trông như
          // trống mà không có dấu hiệu gì.
          limit: PAGE_LIMIT,
        },
      });
      appointments.value = res.data.appointments ?? res.data;
      total.value = res.data.total ?? appointments.value.length;
    } catch (err: any) {
      console.error('Failed to fetch appointments:', err);
      error.value = err?.response?.data?.message || 'Không tải được lịch hẹn. Thử lại sau.';
    } finally {
      loading.value = false;
    }
  }

  // Đổi status qua PATCH endpoint dedicate → backend tự set statusChangedByUserId/At
  async function changeStatus(id: string, status: 'completed' | 'cancelled' | 'no_show' | 'scheduled' | 'overdue'): Promise<boolean> {
    saving.value = true;
    error.value = '';
    try {
      const res = await api.patch(`/appointments/${id}/status`, { status });
      const idx = appointments.value.findIndex(a => a.id === id);
      if (idx !== -1) appointments.value[idx] = { ...appointments.value[idx], ...res.data };
      return true;
    } catch (err: any) {
      console.error('Failed to change status:', err);
      error.value = err?.response?.data?.message || 'Không đổi được trạng thái lịch hẹn.';
      return false;
    } finally {
      saving.value = false;
    }
  }

  async function markComplete(id: string): Promise<boolean> {
    return changeStatus(id, 'completed');
  }

  async function cancelAppointment(id: string): Promise<boolean> {
    return changeStatus(id, 'cancelled');
  }

  async function markNoShow(id: string): Promise<boolean> {
    return changeStatus(id, 'no_show');
  }

  return {
    appointments, total, loading, saving, error,
    filters,
    fetchAppointments,
    markComplete, cancelAppointment, markNoShow, changeStatus,
  };
}
