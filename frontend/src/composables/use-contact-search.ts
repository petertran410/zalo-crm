/**
 * use-contact-search.ts — 2026-08-04
 *
 * Tìm + chọn khách hàng cho các form lịch hẹn. Tách ra từ AppointmentEditor để
 * AppointmentQuickCreate (tạo nhanh trên lưới) dùng CHUNG một hành vi: cùng độ
 * trễ debounce, cùng cách resolve avatar, cùng dạng dữ liệu rút gọn.
 *
 * Trước đây toàn bộ khối này nằm inline trong editor; nhân bản sang form thứ hai
 * là chắc chắn lệch nhau theo thời gian.
 */
import { ref, type Ref } from 'vue';
import { api } from '@/api/index';

export interface ContactLite {
  id: string;
  fullName: string | null;
  phone: string | null;
  zaloUid?: string | null;
  /** Tên gợi nhớ (Contact.zaloUsername hoặc displayName từ Friend). Search được. */
  zaloUsername?: string | null;
  avatarUrl?: string | null;
}

/** SĐT chuẩn VN để hiển thị: 84xxx / +84xxx → 0xxx (bỏ khoảng trắng, dấu). */
export function formatPhoneVN(p?: string | null): string {
  if (!p) return '';
  let s = String(p).replace(/[\s.()-]/g, '');
  if (s.startsWith('+84')) s = '0' + s.slice(3);
  else if (s.startsWith('0084')) s = '0' + s.slice(4);
  else if (s.startsWith('84') && s.length >= 10 && s.length <= 12) s = '0' + s.slice(2);
  return s;
}

/**
 * Avatar thật:
 *   1. Contact.avatarUrl (upload tay, hiếm)
 *   2. Friend.zaloAvatarUrl đầu tiên (ảnh Zalo per-nick, phổ biến)
 *   3. null → fallback initials
 */
export function resolveAvatarUrl(c: any): string | null {
  if (c?.avatarUrl) return c.avatarUrl;
  const friends = c?.friends || [];
  for (const f of friends) {
    if (f?.zaloAvatarUrl) return f.zaloAvatarUrl;
  }
  return null;
}

export function toContactLite(c: any): ContactLite {
  return {
    id: c.id,
    fullName: c.fullName ?? null,
    phone: c.phone ?? null,
    zaloUid: c.zaloUid ?? null,
    zaloUsername: c.zaloUsername || c.aggregateZaloUsername || null,
    avatarUrl: resolveAvatarUrl(c),
  };
}

/** Màu nền avatar khi KH không có ảnh — hash theo id để luôn ổn định. */
const CONTACT_PALETTE = ['#aa2d00', '#0a2e0e', '#d9a441', '#fcab79', '#a8d8c4', '#1b61c9'];
export function contactColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return CONTACT_PALETTE[h % CONTACT_PALETTE.length];
}

const DEBOUNCE_MS = 220;

export function useContactSearch(selected: Ref<ContactLite | null>) {
  const query = ref('');
  const suggestions = ref<ContactLite[]>([]);
  const searching = ref(false);
  let handle: number | null = null;

  function search(): void {
    if (handle) window.clearTimeout(handle);
    const q = query.value.trim();
    if (!q) {
      suggestions.value = [];
      searching.value = false;
      return;
    }
    searching.value = true;
    handle = window.setTimeout(async () => {
      try {
        const res = await api.get('/contacts', { params: { search: q, limit: 8 } });
        const raw = (res.data.contacts ?? res.data ?? []).slice(0, 8);
        suggestions.value = raw.map(toContactLite);
      } catch (err) {
        console.error('[contact-search] failed', err);
        suggestions.value = [];
      } finally {
        searching.value = false;
      }
    }, DEBOUNCE_MS);
  }

  function reset(): void {
    if (handle) window.clearTimeout(handle);
    query.value = '';
    suggestions.value = [];
    searching.value = false;
  }

  /**
   * Bổ sung avatar khi form chỉ được truyền {id, fullName} (mở từ chat/timeline).
   * Chỉ vá nếu người dùng CHƯA chọn KH khác trong lúc đợi request.
   */
  async function enrichAvatar(contactId: string): Promise<void> {
    try {
      const res = await api.get(`/contacts/${contactId}`);
      const enriched = toContactLite(res.data);
      if (selected.value?.id === contactId && enriched.avatarUrl) {
        selected.value = { ...selected.value, avatarUrl: enriched.avatarUrl };
      }
    } catch (err) {
      console.warn('[contact-search] avatar enrich failed', err);
    }
  }

  /** Mode sửa mà object lịch thiếu `contact` (bản rút gọn từ chat/list) → nạp theo id. */
  async function loadById(contactId: string): Promise<void> {
    try {
      const res = await api.get(`/contacts/${contactId}`);
      selected.value = toContactLite(res.data);
    } catch (err) {
      console.warn('[contact-search] load by id failed', err);
    }
  }

  /** Ảnh lỗi → bỏ avatarUrl để rơi về initials. */
  function onAvatarError(): void {
    if (selected.value?.avatarUrl) {
      selected.value = { ...selected.value, avatarUrl: null };
    }
  }

  return { query, suggestions, searching, search, reset, enrichAvatar, loadById, onAvatarError };
}
