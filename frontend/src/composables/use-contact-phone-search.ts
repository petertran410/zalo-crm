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
  /**
   * false = Contact này nằm ngoài phạm vi contact-scope của sale đang đăng nhập.
   * Danh sách cố ý dò org-wide để không tạo trùng, nhưng mở hồ sơ thì vẫn bị
   * assertContactVisible chặn → FE phải nói rõ thay vì cho bấm rồi 403.
   */
  accessible: boolean;
}

/** Khoá render ổn định — 1 KH có thể đến từ POS hoặc từ Contact đã có. */
export function candidateKey(c: PosLinkCandidate): string {
  return c.contactId ? `c:${c.contactId}` : `p:${c.posCustomerId}`;
}

/**
 * 2026-07-31: nâng 3 → 6 chữ số. Backend dò bằng `contains` (LIKE '%…%') nên
 * KHÔNG dùng được index phone; 3 chữ số quét toàn bộ ~25k dòng PosCustomer mỗi
 * lần gõ và trả về rất nhiều KH không liên quan. 6 chữ số vẫn cho phép tìm theo
 * đuôi số (thói quen của sale) mà thu hẹp đáng kể.
 */
const MIN_DIGITS = 6;
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
  /** Backend cắt ở 10 dòng mỗi nhánh — báo để sale biết còn KH khác chưa hiện. */
  const truncated = ref(false);

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
    truncated.value = false;
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
      truncated.value = false;
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
        truncated.value = res.data?.truncated === true;
        searched.value = true;
      } catch (err) {
        if (mine !== seq) return;
        console.error('[contact-phone-search] tìm KH POS theo SĐT lỗi:', err);
        error.value = 'Không kiểm tra được — thử lại trước khi tạo mới';
        results.value = [];
        truncated.value = false;
        // KHÔNG set searched=true khi lỗi: searched là tín hiệu "đã kiểm tra
        // xong, chắc chắn không có ai khớp" và nó mở khoá nút Tạo khách mới.
        // Lỗi mạng nghĩa là CHƯA kiểm tra được → giữ khoá, tránh tạo trùng.
        searched.value = false;
      } finally {
        if (mine === seq) searching.value = false;
      }
    }, DEBOUNCE_MS);
  }

  return { results, searching, searched, error, truncated, search, reset };
}
