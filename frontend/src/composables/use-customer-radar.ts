/**
 * use-customer-radar.ts — Smart Customer Radar Composable (Milestone 4 §R4)
 *
 * Quản lý trạng thái phản ứng, nạp dữ liệu từ API, optimistic update,
 * phản hồi human-in-the-loop và tích hợp chèn kịch bản vào khung chat Zalo.
 */
import { ref, watch, unref, type Ref } from 'vue';
import {
  fetchContactRadar,
  submitRadarFeedback,
  type ICustomerRadarData,
  type IRadarFeedbackRequest,
} from '@/api/radar';
import { useToast } from '@/composables/use-toast';

export type ContactIdSource =
  | string
  | null
  | undefined
  | Ref<string | null | undefined>
  | (() => string | null | undefined);

export function useCustomerRadar(contactIdSource: ContactIdSource) {
  const toast = useToast();

  const radarData = ref<ICustomerRadarData | null>(null);
  const isLoading = ref(false);
  const isRefreshing = ref(false);
  const isSubmittingFeedback = ref(false);
  const error = ref<string | null>(null);
  const feedbackStatus = ref<'NONE' | 'CONFIRMED' | 'REJECTED' | 'OVERRIDDEN'>('NONE');

  let requestId = 0;

  function resolveContactId(): string | null {
    if (typeof contactIdSource === 'function') {
      const val = contactIdSource();
      return val ? String(val) : null;
    }
    const val = unref(contactIdSource);
    return val ? String(val) : null;
  }

  /**
   * Nạp dữ liệu Radar cho khách hàng.
   */
  async function loadRadar(forceRefresh: boolean = false): Promise<void> {
    const contactId = resolveContactId();
    const currentRequest = ++requestId;

    if (!contactId) {
      radarData.value = null;
      error.value = null;
      isLoading.value = false;
      isRefreshing.value = false;
      return;
    }

    if (forceRefresh) {
      isRefreshing.value = true;
    } else {
      isLoading.value = true;
    }
    error.value = null;

    try {
      const data = await fetchContactRadar(contactId, forceRefresh);
      if (currentRequest === requestId && resolveContactId() === contactId) {
        radarData.value = data;
        feedbackStatus.value = 'NONE';
      }
    } catch (err: any) {
      if (currentRequest === requestId) {
        error.value = err?.response?.data?.error || err.message || 'Không thể tải Radar khách hàng';
      }
    } finally {
      if (currentRequest === requestId) {
        isLoading.value = false;
        isRefreshing.value = false;
      }
    }
  }

  /**
   * Gửi phản hồi feedback tùy chỉnh.
   */
  async function sendFeedback(feedback: IRadarFeedbackRequest): Promise<boolean> {
    const contactId = resolveContactId();
    if (!contactId) return false;

    isSubmittingFeedback.value = true;
    try {
      const res = await submitRadarFeedback(contactId, feedback);
      if (res.data) {
        radarData.value = res.data;
      } else {
        await loadRadar(true);
      }
      toast.success(res.message || 'Đã ghi nhận phản hồi và cập nhật trọng số tri thức!');
      return true;
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err.message || 'Không thể gửi phản hồi, vui lòng thử lại');
      return false;
    } finally {
      isSubmittingFeedback.value = false;
    }
  }

  /**
   * 1. Xác nhận đúng chân dung (CONFIRM) - Optimistic update lên 95% Emerald
   */
  async function confirmPersona(): Promise<boolean> {
    const contactId = resolveContactId();
    if (!contactId || !radarData.value) return false;

    // Lưu lại trạng thái trước khi optimistic update để rollback nếu lỗi
    const prevConfidence = { ...radarData.value.confidence };
    radarData.value.confidence.percentage = 95;
    radarData.value.confidence.score = 0.95;
    radarData.value.confidence.tier = 'CONSOLIDATED';
    radarData.value.confidence.color = 'emerald';
    feedbackStatus.value = 'CONFIRMED';

    isSubmittingFeedback.value = true;
    try {
      const res = await submitRadarFeedback(contactId, {
        action: 'CONFIRM',
        confirmedPersonaId: radarData.value.persona.id,
      });
      if (res.data) {
        radarData.value = res.data;
      }
      toast.success('Đã xác nhận chân dung! Trọng số đồ thị tri thức đã được củng cố.');
      return true;
    } catch (err: any) {
      if (radarData.value) {
        radarData.value.confidence = prevConfidence;
      }
      feedbackStatus.value = 'NONE';
      toast.error(err?.response?.data?.error || err.message || 'Không thể gửi xác nhận');
      return false;
    } finally {
      isSubmittingFeedback.value = false;
    }
  }

  /**
   * 2. Bác bỏ chân dung chưa đúng (REJECT)
   */
  async function rejectPersona(reason?: string): Promise<boolean> {
    const contactId = resolveContactId();
    if (!contactId || !radarData.value) return false;

    isSubmittingFeedback.value = true;
    feedbackStatus.value = 'REJECTED';
    try {
      const res = await submitRadarFeedback(contactId, {
        action: 'REJECT',
        reason,
        note: reason,
      });
      if (res.data) {
        radarData.value = res.data;
      }
      toast.info('Đã ghi nhận phản hồi chưa đúng để điều chỉnh mô hình suy luận.');
      return true;
    } catch (err: any) {
      feedbackStatus.value = 'NONE';
      toast.error(err?.response?.data?.error || err.message || 'Không thể gửi phản hồi');
      return false;
    } finally {
      isSubmittingFeedback.value = false;
    }
  }

  /**
   * 3. Điều chỉnh sang cụm Persona khác (OVERRIDE)
   */
  async function overridePersona(targetCluster: string, note?: string): Promise<boolean> {
    const contactId = resolveContactId();
    if (!contactId || !radarData.value) return false;

    isSubmittingFeedback.value = true;
    feedbackStatus.value = 'OVERRIDDEN';
    try {
      const res = await submitRadarFeedback(contactId, {
        action: 'OVERRIDE',
        targetCluster,
        note,
      });
      if (res.data) {
        radarData.value = res.data;
      }
      toast.success('Đã điều chỉnh chân dung thành công! Đồ thị đã tái tổng hợp tức thời.');
      return true;
    } catch (err: any) {
      feedbackStatus.value = 'NONE';
      toast.error(err?.response?.data?.error || err.message || 'Không thể điều chỉnh chân dung');
      return false;
    } finally {
      isSubmittingFeedback.value = false;
    }
  }

  /**
   * 4. Chèn kịch bản tư vấn hoặc nội dung vào khung chat Zalo (1-Click Insertion)
   */
  function insertScriptToChat(scriptText: string, customMessage?: string): void {
    if (!scriptText) return;

    // Dispatch global CustomEvent để MessageThread.vue bắt được
    window.dispatchEvent(
      new CustomEvent('chat:insert-suggestion', {
        detail: { text: scriptText },
      })
    );

    // Sao chép clipboard dự phòng
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(scriptText).catch(() => {});
    }

    toast.success(customMessage || 'Đã chèn nội dung vào khung soạn thảo tin nhắn!');
  }

  // Tự động watch contactId
  watch(
    resolveContactId,
    (newId, oldId) => {
      if (newId !== oldId) {
        void loadRadar();
      }
    },
    { immediate: true }
  );

  return {
    // State
    radarData,
    data: radarData,
    isLoading,
    loading: isLoading,
    isRefreshing,
    refreshing: isRefreshing,
    isSubmittingFeedback,
    submitting: isSubmittingFeedback,
    error,
    feedbackStatus,

    // Methods
    loadRadar,
    sendFeedback,
    confirmPersona,
    rejectPersona,
    overridePersona,
    insertScriptToChat,
    insertToChat: insertScriptToChat,
  };
}
