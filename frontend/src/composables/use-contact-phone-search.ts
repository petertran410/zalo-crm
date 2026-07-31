/**
 * use-contact-phone-search.ts — Tìm KH POS theo SĐT để LIÊN KẾT vào CRM (2026-07-31).
 *
 * Anh chốt: 2 chỗ "thêm khách" (modal ở PeopleView và AddCustomerQuickDialog dùng
 * trong chat compose) không tạo KH trắng nữa. Sale gõ SĐT → hiện KH bên POS khớp
 * số đó → bắt buộc chọn 1 KH rồi mới đi tiếp.
 *
 * KH đã là khách bên POS (linked=true) hiện nhãn "đã có", làm mờ và KHÔNG bấm
 * được — liên kết lại chỉ tạo bản ghi trùng.
 *
 * Backend gộp 2 nguồn: PosCustomer khớp SĐT (chưa liên kết → bấm được) và Contact
 * ĐÃ gắn posCustomerId khớp SĐT (luôn "đã có"). Phải có nhánh thứ hai vì record
 * POS hay thiếu SĐT — sale điền vào Contact sau — nếu chỉ dò POS thì KH đó trông
 * như chưa tồn tại.
 *
 * Danh bạ Zalo/Facebook sync về mà chưa có ở POS KHÔNG tính là "đã có" — phần lớn
 * chưa mua gì nên không phải KH; tính vào thì sale không thêm được ai.
 */
import { ref } from 'vue';
import { api } from '@/api/index';

export interface PosLinkCandidate {
  /** null khi dòng này đến từ Contact đã có mà không gắn record POS nào. */
  posCustomerId: number | null;
  code: string | null;
  name: string;
  phone: string | null;
  /** true = KH đã nằm trong tab Khách hàng → FE làm mờ, không cho chọn. */
  linked: boolean;
  /** Contact đang giữ liên kết (chỉ có khi linked=true). */
  contactId: string | null;
}

/** Khoá render ổn định — 1 KH có thể đến từ POS hoặc từ Contact đã có. */
export function candidateKey(c: PosLinkCandidate): string {
  return c.contactId ? `c:${c.contactId}` : `p:${c.posCustomerId}`;
}

/** Dưới 3 chữ số thì SĐT nào cũng khớp — chờ gõ đủ rồi mới gọi API. */
const MIN_DIGITS = 3;
const DEBOUNCE_MS = 300;

/** Tên hiển thị của 1 KH POS. */
export function candidateDisplayName(c: PosLinkCandidate): string {
  return c.name || c.phone || c.code || '—';
}

export function useContactPhoneSearch() {
  const results = ref<PosLinkCandidate[]>([]);
  const searching = ref(false);
  /** Đã chạy xong ít nhất 1 lần cho SĐT hiện tại — phân biệt "chưa tìm" vs "tìm rồi mà rỗng". */
  const searched = ref(false);
  const error = ref<string | null>(null);

  let timer: ReturnType<typeof setTimeout> | undefined;
  // Chống race: gõ nhanh → nhiều request bay song song, chỉ nhận kết quả lần mới nhất.
  let seq = 0;

  function reset() {
    clearTimeout(timer);
    seq++;
    results.value = [];
    searching.value = false;
    searched.value = false;
    error.value = null;
  }

  function search(raw: string) {
    clearTimeout(timer);
    const digits = (raw || '').replace(/\D/g, '');
    if (digits.length < MIN_DIGITS) {
      seq++;
      results.value = [];
      searching.value = false;
      searched.value = false;
      error.value = null;
      return;
    }
    const mine = ++seq;
    searching.value = true;
    error.value = null;
    timer = setTimeout(async () => {
      try {
        const res = await api.get('/contacts/pos-link-candidates', {
          params: { phone: raw.trim() },
        });
        if (mine !== seq) return;
        results.value = res.data?.candidates ?? [];
        searched.value = true;
      } catch (err) {
        if (mine !== seq) return;
        console.error('[contact-phone-search] tìm KH POS theo SĐT lỗi:', err);
        error.value = 'Không tìm được khách hàng — thử lại';
        results.value = [];
        searched.value = true;
      } finally {
        if (mine === seq) searching.value = false;
      }
    }, DEBOUNCE_MS);
  }

  return { results, searching, searched, error, search, reset };
}
