/**
 * use-privacy-visibility — helper client-side để decide blur cho UI khi
 * server không kịp redact (vd realtime socket message arrive trước context).
 *
 * [GỐC] Anh chốt 2026-05-22:
 *   - Nick privacyMode='main' + viewer KHÔNG phải owner + chưa unlock PIN → blur 75%
 *   - Áp dụng MỌI giao diện hiển thị tin của nick: ConversationList (cột 2),
 *     MessageThread (cột 3), Search results, Contact detail, etc.
 *
 * [DISABLED 2026-07-22] Anh chốt: Hệ thống nội bộ, toàn bộ nhân viên đều
 * biết thông tin KH → TẮT LÀM MỜ hoàn toàn. Giữ logic gốc trong comment để
 * mở lại khi cần trong tương lai.
 */
import { computed } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { usePrivacyStore } from '@/stores/privacy';

interface ConvLike {
  zaloAccount?: {
    privacyMode?: string;
    ownerUserId?: string | null;
  } | null;
  redacted?: boolean;
}

export function usePrivacyVisibility() {
  const auth = useAuthStore();
  const privacyStore = usePrivacyStore();

  const currentUserId = computed(() => auth.user?.id ?? null);
  const isUnlocked = computed(() => privacyStore.isUnlocked);

  /**
   * shouldBlurConv — DISABLED.
   * Luôn trả false: không bao giờ làm mờ hội thoại.
   *
   * === LOGIC GỐC (giữ để tái kích hoạt nếu cần) ===
   * function shouldBlurConv(conv: ConvLike | null | undefined): boolean {
   *   // EAGER access: Vue cần track isUnlocked + currentUserId trên MỌI invocation
   *   const unlocked = isUnlocked.value;
   *   const myId = currentUserId.value;
   *   if (!conv) return false;
   *   if (conv.redacted === true) return true;
   *   const acc = conv.zaloAccount;
   *   if (!acc) return false;
   *   if (acc.privacyMode !== 'main') return false;
   *   // Owner + unlocked → see full
   *   if (acc.ownerUserId === myId && unlocked) return false;
   *   // Owner but locked → still blur
   *   if (acc.ownerUserId === myId) return true;
   *   // Non-owner → always blur on main nick
   *   return true;
   * }
   * ===================================================
   */
  function shouldBlurConv(_conv: ConvLike | null | undefined): boolean {
    void isUnlocked.value; void currentUserId.value; // track deps để không bị purge
    return false;
  }

  /**
   * isOwnerOfPrivateNick — DISABLED.
   * Luôn trả true: coi như luôn là chính chủ, hiện tên Zalo thật.
   *
   * === LOGIC GỐC (giữ để tái kích hoạt nếu cần) ===
   * function isOwnerOfPrivateNick(conv: ConvLike | null | undefined): boolean {
   *   const myId = currentUserId.value;
   *   if (!conv || !myId) return false;
   *   const acc = conv.zaloAccount;
   *   if (!acc || acc.privacyMode !== 'main') return false;
   *   return acc.ownerUserId === myId;
   * }
   * ===================================================
   */
  function isOwnerOfPrivateNick(_conv: ConvLike | null | undefined): boolean {
    return true;
  }

  /**
   * canSendInConv — DISABLED.
   * Luôn trả true: không bao giờ chặn composer vì lý do privacy nội bộ.
   *
   * === LOGIC GỐC (giữ để tái kích hoạt nếu cần) ===
   * function canSendInConv(conv: ConvLike | null | undefined): boolean {
   *   if (!conv) return false;
   *   const acc = conv.zaloAccount;
   *   if (!acc) return true;
   *   if (acc.privacyMode !== 'main') return true;
   *   return acc.ownerUserId === currentUserId.value;
   * }
   * ===================================================
   */
  function canSendInConv(_conv: ConvLike | null | undefined): boolean {
    return true;
  }

  /**
   * shouldBlurMessage — DISABLED.
   * Luôn trả false: không bao giờ làm mờ bubble tin nhắn.
   *
   * === LOGIC GỐC (giữ để tái kích hoạt nếu cần) ===
   * function shouldBlurMessage(msg, conv): boolean {
   *   const unlocked = isUnlocked.value;
   *   if (!msg) return false;
   *   if (msg.redacted === true && !unlocked) return true;
   *   if (msg.redacted === true && unlocked) return shouldBlurConv(conv);
   *   return shouldBlurConv(conv);
   * }
   * ===================================================
   */
  function shouldBlurMessage(
    _msg: { redacted?: boolean } | null | undefined,
    _conv: ConvLike | null | undefined,
  ): boolean {
    return false;
  }

  return { shouldBlurConv, canSendInConv, shouldBlurMessage, isOwnerOfPrivateNick };
}
