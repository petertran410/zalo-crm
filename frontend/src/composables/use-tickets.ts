/**
 * use-tickets.ts — Ticket (KH complaint/request V1, 2026-07-09): composable CRUD + helpers.
 *
 * Pattern theo use-tasks.ts: interface + state + API calls tại đây, view/component
 * gọi composable, KHÔNG qua Pinia store.
 *
 * Lifecycle: open → in_progress → resolved (TERMINAL, không reopen — status đổi qua
 * PATCH /:id/status riêng, KHÔNG qua updateTicket).
 */
import { ref, reactive } from 'vue';
import { api } from '@/api/index';

export type TicketStatus = 'open' | 'in_progress' | 'resolved';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type ComplaintCategory = 'refund' | 'return' | 'quality' | 'shipping' | 'other';

export interface TicketUserLite {
  id: string;
  fullName: string | null;
  email?: string;
  avatarUrl?: string | null;
}

export interface TicketContactLite {
  id: string;
  fullName: string | null;
  phone: string | null;
  avatarUrl?: string | null;
}

export interface Ticket {
  id: string;
  title: string;
  summary: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: ComplaintCategory | null;
  assigneeUserId: string;
  assignee?: TicketUserLite | null;
  createdBy?: TicketUserLite | null;
  resolvedBy?: TicketUserLite | null;
  resolvedAt: string | null;
  contactId: string | null;
  contact?: TicketContactLite | null;
  conversationId: string | null;
  aiGenerated: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TicketFilters {
  view: 'mine' | 'all';
  /** 'active' = chưa resolved (open+in_progress, khớp default union của BE khi bỏ status param) */
  status: 'active' | TicketStatus | 'all';
  priority: TicketPriority | '';
  assigneeUserId: string;
}

export interface TicketPayload {
  title: string;
  summary: string;
  priority?: TicketPriority;
  category?: ComplaintCategory | null;
  assigneeUserId?: string;
  contactId?: string | null;
  conversationId?: string | null;
  aiGenerated?: boolean;
}

export const PRIORITY_META: Record<TicketPriority, { label: string; color: string; bg: string }> = {
  low:    { label: 'Thấp',   color: '#475569', bg: '#f1f5f9' },
  normal: { label: 'Bình thường', color: '#1d4ed8', bg: '#dbeafe' },
  high:   { label: 'Cao',    color: '#9a3412', bg: '#ffedd5' },
  urgent: { label: 'Khẩn',   color: '#991b1b', bg: '#fee2e2' },
};

/** Phân loại khiếu nại — enum FE-owned, BE chỉ lưu string tự do (≤50 ký tự). */
export const COMPLAINT_CATEGORY_META: Record<ComplaintCategory, { label: string }> = {
  refund:   { label: 'Hoàn tiền' },
  return:   { label: 'Trả hàng' },
  quality:  { label: 'Chất lượng SP' },
  shipping: { label: 'Giao hàng chậm/lỗi' },
  other:    { label: 'Khác' },
};

export const STATUS_META: Record<TicketStatus, { label: string; color: string; bg: string }> = {
  open:        { label: 'Mở',        color: '#1d4ed8', bg: '#dbeafe' },
  in_progress: { label: 'Đang xử lý', color: '#9a3412', bg: '#ffedd5' },
  resolved:    { label: 'Đã xử lý',  color: '#166534', bg: '#dcfce7' },
};

export function useTickets() {
  const tickets = ref<Ticket[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const saving = ref(false);

  const filters = reactive<TicketFilters>({
    view: 'mine',
    status: 'active',
    priority: '',
    assigneeUserId: '',
  });

  async function fetchTickets(page = 1, limit = 100): Promise<void> {
    loading.value = true;
    try {
      const res = await api.get('/tickets', {
        params: {
          view: filters.view,
          // 'active' → bỏ status param, để BE tự áp union mặc định open+in_progress
          status: filters.status === 'active' ? undefined : filters.status,
          priority: filters.priority || undefined,
          assigneeUserId: filters.view === 'all' && filters.assigneeUserId ? filters.assigneeUserId : undefined,
          page,
          limit,
        },
      });
      tickets.value = res.data.tickets ?? [];
      total.value = res.data.total ?? tickets.value.length;
    } catch (err) {
      console.error('[tickets] fetch error', err);
    } finally {
      loading.value = false;
    }
  }

  /** List ticket của 1 KH (panel chat) — trả trực tiếp, không đụng state list chính. */
  async function fetchContactTickets(contactId: string): Promise<Ticket[]> {
    try {
      const res = await api.get(`/contacts/${contactId}/tickets`);
      return res.data.tickets ?? [];
    } catch (err) {
      console.error('[tickets] contact fetch error', err);
      return [];
    }
  }

  async function createTicket(payload: TicketPayload): Promise<Ticket | null> {
    saving.value = true;
    try {
      const res = await api.post('/tickets', payload);
      return res.data.ticket;
    } catch (err) {
      console.error('[tickets] create error', err);
      throw err;
    } finally {
      saving.value = false;
    }
  }

  async function updateTicket(id: string, payload: Partial<TicketPayload>): Promise<Ticket | null> {
    saving.value = true;
    try {
      const res = await api.put(`/tickets/${id}`, payload);
      const idx = tickets.value.findIndex(t => t.id === id);
      if (idx !== -1) tickets.value[idx] = res.data.ticket;
      return res.data.ticket;
    } catch (err) {
      console.error('[tickets] update error', err);
      throw err;
    } finally {
      saving.value = false;
    }
  }

  async function changeStatus(id: string, status: TicketStatus): Promise<Ticket | null> {
    try {
      const res = await api.patch(`/tickets/${id}/status`, { status });
      const idx = tickets.value.findIndex(t => t.id === id);
      if (idx !== -1) tickets.value[idx] = res.data.ticket;
      return res.data.ticket;
    } catch (err) {
      console.error('[tickets] status change error', err);
      throw err;
    }
  }

  async function deleteTicket(id: string): Promise<boolean> {
    try {
      await api.delete(`/tickets/${id}`);
      const before = tickets.value.length;
      tickets.value = tickets.value.filter(t => t.id !== id);
      if (tickets.value.length < before) total.value = Math.max(0, total.value - 1);
      return true;
    } catch (err) {
      console.error('[tickets] delete error', err);
      throw err;
    }
  }

  /** AI draft (draft-then-confirm, KHÔNG lưu) từ hội thoại — trả null nếu AI lỗi/tắt. */
  async function draftFromConversation(conversationId: string): Promise<{ title: string; summary: string } | null> {
    try {
      const res = await api.post(`/conversations/${conversationId}/ticket-draft`);
      if (res.data.warning) console.warn('[tickets] draft warning:', res.data.warning);
      return res.data.draft ?? null;
    } catch (err) {
      console.error('[tickets] draft error', err);
      return null;
    }
  }

  return {
    tickets, total, loading, saving, filters,
    fetchTickets, fetchContactTickets, createTicket, updateTicket, changeStatus, deleteTicket, draftFromConversation,
  };
}
