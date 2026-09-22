/**
 * Pure helper utilities for appointment UI — color palette, formatting, time math.
 * Separate from use-appointments.ts (stateful composable) to keep that file lean
 * and so SFCs can import these without pulling the composable into every render path.
 */
import type { Appointment } from './use-appointments';
import { APPOINTMENT_TYPE_OPTIONS, APPOINTMENT_STATUS_OPTIONS } from './use-appointments';
import { orgDayKey, orgWallClockToUtc, getOrgParts } from './use-org-timezone';

// Re-export so component imports stay short
export { APPOINTMENT_TYPE_OPTIONS, APPOINTMENT_STATUS_OPTIONS };

/**
 * Extended appointment fields that the backend may or may not populate yet.
 * UI degrades gracefully when absent.
 *
 * Lưu ý tên cột: BE (schema Appointment) dùng assignedUserId / assignedUser — KHÔNG
 * phải assignedToId. Giữ alias assignedToId/assignedTo (legacy) phòng nơi khác đọc,
 * nhưng appointmentOwnerId/Name ưu tiên tên cột THẬT (assignedUserId/assignedUser).
 */
export interface AppointmentExtras {
  assignedUserId?: string | null;
  assignedUser?: { id: string; fullName: string | null } | null;
  // Legacy aliases (giữ tương thích, không phải tên cột DB)
  assignedToId?: string | null;
  assignedTo?: { id: string; fullName: string | null; email: string } | null;
  durationMin?: number | null;
}

export type AppointmentEx = Appointment & AppointmentExtras;

/**
 * Palette sale — 4 màu đầu lấy nguyên từ design "Rail" (1A, 2026-08-01); 4 màu sau nối dài
 * cùng tông jewel-muted để org > 4 sale vẫn phân biệt được, không rơi về màu trùng.
 */
const SALE_PALETTE = [
  { bg: '#5b4be6', soft: '#eeecfd' },
  { bg: '#8b45c4', soft: '#f3e9fa' },
  { bg: '#3c6fd1', soft: '#e6eefb' },
  { bg: '#6e6b8a', soft: '#eeedf3' },
  { bg: '#0e9f6e', soft: '#e0f5ee' },
  { bg: '#c2810c', soft: '#fdf6e7' },
  { bg: '#c73f6b', soft: '#fbe9ef' },
  { bg: '#2a8a95', soft: '#e2f3f5' },
];

export function saleColor(userId: string | null | undefined): { bg: string; soft: string } {
  if (!userId) return { bg: '#64748b', soft: '#f1f5f9' };
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return SALE_PALETTE[h % SALE_PALETTE.length];
}

export function appointmentOwnerId(a: AppointmentEx): string | null {
  // Ưu tiên tên cột THẬT (assignedUserId), fallback alias legacy + statusChangedBy.
  return a.assignedUserId || a.assignedUser?.id || a.assignedToId || a.statusChangedBy?.id || null;
}

export function appointmentOwnerName(a: AppointmentEx): string {
  return (
    a.assignedUser?.fullName ||
    a.assignedTo?.fullName ||
    a.statusChangedBy?.fullName ||
    a.statusChangedBy?.email ||
    'Chưa gán'
  );
}

export function typeIcon(type: string): string {
  switch (type) {
    case 'call':      return '📞';
    case 'message':   return '💬';
    case 'meeting':   return '🤝';
    case 'follow_up': return '👁';
    // Legacy values (pre-2026-05-21 migration) — fallback an toàn
    case 'consultation': return '💬';
    case 'new_visit':    return '🤝';
    case 'reminder':     return '👁';
    case 'tai_kham':     return '👁';
    default: return '📌';
  }
}

export function typeLabel(type: string): string {
  return APPOINTMENT_TYPE_OPTIONS.find(o => o.value === type)?.text ?? type;
}

export function statusLabel(status: string): string {
  return APPOINTMENT_STATUS_OPTIONS.find(o => o.value === status)?.text ?? status;
}

/**
 * AI parse result từ ghi chú → fill các trường tạo lịch hẹn (AppointmentEditor).
 * Sản sinh bởi cascade backend `parseAppointmentFromText`:
 *   Step 1: parseAppointmentRuleBased (regex tiếng Việt: "thứ X", "mai", "ghé", ...)
 *   Step 2: AI provider (Gemini default) với prompt phân tích structured JSON
 *   Fallback: nếu AI fail (quota/429) → trả rule-based result (nếu confidence ≥ 0.5)
 * Field nào null → editor giữ default (date/time → roundToNextSlot now).
 */
export interface AiPrefill {
  date?: string | null;       // YYYY-MM-DD
  time?: string | null;       // HH:MM
  type?: string | null;       // call/message/meeting/follow_up
  location?: string | null;
  title?: string | null;      // = summary AI sinh
  notes?: string | null;      // = note body gốc (tham chiếu)
}

/**
 * Resolve avatar URL từ contact: ưu tiên Contact.avatarUrl (manual upload), fallback
 * sang Friend.zaloAvatarUrl của friend hoạt động gần nhất (per-nick Zalo profile pic).
 * KH import từ Zalo thường có Contact.avatarUrl=null vì avatar lưu per-nick ở Friend.
 */
export function resolveContactAvatar(contact: any): string | null {
  if (!contact) return null;
  if (contact.avatarUrl) return contact.avatarUrl;
  const friends = contact.friends || [];
  for (const f of friends) {
    if (f?.zaloAvatarUrl) return f.zaloAvatarUrl;
  }
  return null;
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * FIX 2026-06-09 (Anh báo "auto 7h"): appointmentDate lưu NGÀY (timestamp 00:00 UTC),
 * giờ THẬT nằm ở appointmentTime ("HH:mm" wall-clock org). Bản cũ chỉ `new Date(appointmentDate)`
 * → bỏ giờ → mọi event dán cứng 07:00 (midnight UTC +7 ở giờ VN). Giờ GHÉP ngày (org-local
 * day của appointmentDate) + appointmentTime → UTC instant đúng. Fallback: appointmentTime
 * rỗng → giữ giờ nhúng trong appointmentDate (data cũ vài dòng có giờ trong cột date).
 */
export function appointmentStart(a: AppointmentEx): Date {
  const dayKey = orgDayKey(a.appointmentDate);
  const t = (a.appointmentTime || '').trim();
  if (dayKey && t) {
    const combined = orgWallClockToUtc(dayKey, t);
    if (combined) return combined;
  }
  return new Date(a.appointmentDate);
}

export function appointmentEnd(a: AppointmentEx): Date {
  const start = appointmentStart(a);
  const dur = a.durationMin ?? 30;
  return new Date(start.getTime() + dur * 60_000);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Revamp "Rail" 2026-08-01 — logic dưới đây trước nằm rải rác trong
 * AppointmentsListView (countConflicts/rowUrgency) và ChatAppointments
 * (effectiveStatus). Kéo lên helper để week view / agenda / popover dùng CHUNG
 * một nguồn sự thật — trước đây week view chỉ đọc status thô nên lịch quá giờ
 * mà cron chưa flip thì hiện như bình thường.
 * ──────────────────────────────────────────────────────────────────────────── */

export type AppointmentStatus = 'scheduled' | 'overdue' | 'completed' | 'cancelled' | 'no_show';

/**
 * Status "thật" để tô màu: `scheduled` mà đã qua giờ hẹn → coi như `overdue`
 * ngay, không đợi cron đêm flip. Các status chốt tay giữ nguyên.
 */
export function effectiveStatus(a: AppointmentEx, now: number = Date.now()): string {
  if (a.status === 'scheduled' && appointmentStart(a).getTime() < now) return 'overdue';
  return a.status;
}

export interface StatusTone {
  bar: string;    // dải màu trái
  bg: string;     // nền card
  text: string;   // chữ chính
  sub: string;    // chữ phụ / meta
  muted: boolean; // đã đóng (completed/cancelled) → giảm nhấn
  strike: boolean;
}

/**
 * Bảng màu theo status (design 1A). Trả về `var(--rl-tone-*)` chứ KHÔNG phải hex —
 * token thật khai ở `appointments-rail.css`, nên đổi theme là mọi chỗ đổi theo.
 * Chỉ cần component nằm trong `.rail-scope` (kể cả popover teleport ra body).
 *
 * `ownerColor` là ngoại lệ duy nhất còn là màu thật: lịch còn "sống" lấy dải trái
 * theo màu sale (`saleColor`) để nhìn ra ai phụ trách.
 */
export function statusTone(status: string, ownerColor: string): StatusTone {
  switch (status) {
    case 'overdue':
      return {
        bar: 'var(--rl-tone-overdue-bar)', bg: 'var(--rl-tone-overdue-bg)',
        text: 'var(--rl-tone-overdue-text)', sub: 'var(--rl-tone-overdue-sub)',
        muted: false, strike: false,
      };
    case 'completed':
      return {
        bar: 'var(--rl-tone-done-bar)', bg: 'var(--rl-tone-done-bg)',
        text: 'var(--rl-tone-done-text)', sub: 'var(--rl-tone-done-sub)',
        muted: true, strike: false,
      };
    case 'cancelled':
      return {
        bar: 'var(--rl-tone-cancelled-bar)', bg: 'var(--rl-tone-cancelled-bg)',
        text: 'var(--rl-tone-cancelled-text)', sub: 'var(--rl-tone-cancelled-sub)',
        muted: true, strike: true,
      };
    case 'no_show':
      return {
        bar: 'var(--rl-tone-noshow-bar)', bg: 'var(--rl-tone-noshow-bg)',
        text: 'var(--rl-tone-noshow-text)', sub: 'var(--rl-tone-noshow-sub)',
        muted: false, strike: false,
      };
    default:
      return {
        bar: ownerColor, bg: 'var(--rl-tone-live-bg)',
        text: 'var(--rl-tone-live-text)', sub: 'var(--rl-tone-live-sub)',
        muted: false, strike: false,
      };
  }
}

/* ── Định dạng giờ (2026-08-04) ──────────────────────────────────────────────
 * Trước đây mỗi component tự có `fmtMin` kiểu `Math.floor(m/60)`, không quấn qua
 * nửa đêm → lịch dài 1440 phút ("1 ngày" là lựa chọn hợp lệ trong editor) hiện
 * thành "14:45–38:45". Gom về đây, quấn 24h và ghi rõ sang ngày hôm sau.
 */

/** Phút → "HH:mm", quấn về trong ngày (2325 → "14:45"). */
export function fmtClock(minutes: number): string {
  const w = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return String(Math.floor(w / 60)).padStart(2, '0') + ':' + String(w % 60).padStart(2, '0');
}

/** Số ngày lịch tràn sang (0 = trong ngày). */
export function spillDays(startMin: number, durationMin: number): number {
  return Math.floor((startMin + durationMin) / 1440);
}

/**
 * Khoảng giờ hiển thị. Tràn ngày thì gắn hậu tố thay vì in giờ > 24.
 *   fmtRange(885, 60)   → "14:45–15:45"
 *   fmtRange(885, 1440) → "14:45–14:45 +1 ngày"
 */
export function fmtRange(startMin: number, durationMin: number, compact = false): string {
  const spill = spillDays(startMin, durationMin);
  const base = `${fmtClock(startMin)}–${fmtClock(startMin + durationMin)}`;
  if (spill <= 0) return base;
  return base + (compact ? ` +${spill}` : ` +${spill} ngày`);
}

/** Thời lượng đọc được: 45 → "45 phút", 60 → "1 giờ", 1440 → "1 ngày". */
export function fmtDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m === 0) return '0 phút';
  if (m % 1440 === 0) return `${m / 1440} ngày`;
  if (m < 60) return `${m} phút`;
  if (m % 60 === 0) return `${m / 60} giờ`;
  return `${Math.floor(m / 60)} giờ ${m % 60} phút`;
}

/** Phút-trong-ngày theo org TZ (0–1439). Dùng để đặt top trong lưới tuần. */
export function appointmentMinutes(a: AppointmentEx): number {
  const p = getOrgParts(appointmentStart(a));
  if (!p) return 0;
  return p.hour * 60 + p.minute;
}

/** Lịch đã đóng thì không tính là "đụng giờ" nữa. */
function blocksTime(a: AppointmentEx): boolean {
  return a.status !== 'cancelled' && a.status !== 'completed' && a.status !== 'no_show';
}

/**
 * Cache mốc thời gian theo ĐỐI TƯỢNG lịch.
 * `appointmentStart` phải parse ngày rồi ghép giờ wall-clock mỗi lần gọi; trong
 * vòng dò trùng giờ nó bị gọi hàng chục nghìn lần cho cùng một nhúm object.
 * WeakMap nên refetch (object mới) là cache tự rụng, không phải invalidate tay.
 */
const startMsCache = new WeakMap<object, number>();

export function startMs(a: AppointmentEx): number {
  let v = startMsCache.get(a);
  if (v === undefined) {
    v = appointmentStart(a).getTime();
    startMsCache.set(a, v);
  }
  return v;
}
export function endMs(a: AppointmentEx): number {
  return startMs(a) + (a.durationMin ?? 30) * 60_000;
}

/**
 * Lịch của CÙNG sale phụ trách bị chồng giờ với `target`.
 * Chồng giờ theo nửa khoảng [start, end) — 14:00–14:30 và 14:30–15:00 KHÔNG trùng.
 * Dùng cho 1 lịch lẻ (popover); dò cả danh sách thì dùng `buildConflictMap`.
 */
export function overlapsOf(target: AppointmentEx, all: AppointmentEx[]): AppointmentEx[] {
  if (!blocksTime(target)) return [];
  const owner = appointmentOwnerId(target);
  const s = startMs(target);
  const e = endMs(target);
  return all.filter((o) => {
    if (o.id === target.id || !blocksTime(o)) return false;
    if (appointmentOwnerId(o) !== owner) return false;
    return startMs(o) < e && endMs(o) > s;
  });
}

/**
 * Bản đồ trùng giờ cho CẢ danh sách, tính 1 lần: id lịch → các lịch đụng nó.
 *
 * Thay cho gọi `overlapsOf` trong vòng lặp (O(n²) — đo 112ms ở n=400). Ở đây gom
 * theo sale, sort theo giờ bắt đầu rồi quét tuyến tính: O(n log n + số cặp trùng).
 */
export function buildConflictMap(all: AppointmentEx[]): Map<string, AppointmentEx[]> {
  const out = new Map<string, AppointmentEx[]>();
  const byOwner = new Map<string, AppointmentEx[]>();

  for (const a of all) {
    if (!blocksTime(a)) continue;
    const key = appointmentOwnerId(a) ?? '__unassigned__';
    const list = byOwner.get(key);
    if (list) list.push(a);
    else byOwner.set(key, [a]);
  }

  const add = (a: AppointmentEx, b: AppointmentEx) => {
    const cur = out.get(a.id);
    if (cur) cur.push(b);
    else out.set(a.id, [b]);
  };

  for (const list of byOwner.values()) {
    list.sort((x, y) => startMs(x) - startMs(y));
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      const aEnd = endMs(a);
      // Đã sort theo start → gặp lịch bắt đầu sau khi `a` kết thúc là dừng hẳn.
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (startMs(b) >= aEnd) break;
        add(a, b);
        add(b, a);
      }
    }
  }
  return out;
}

/**
 * Người phụ trách THẬT SỰ — chỉ đọc cột assigned*, KHÔNG fallback sang
 * `statusChangedBy` như `appointmentOwnerId`.
 *
 * Phân biệt quan trọng: `appointmentOwnerId` dùng để TÔ MÀU nên fallback sang
 * người đổi status cuối cho đỡ trống; nếu lấy nó đi kiểm tra quyền thì một sale
 * chỉ cần bấm "Hoàn thành" một lần là thành "chủ" lịch của người khác.
 */
export function appointmentAssigneeId(a: AppointmentEx): string | null {
  return a.assignedUserId || a.assignedUser?.id || a.assignedToId || null;
}

/**
 * Quyền sửa/xoá lịch (anh chốt 2026-08-04): ngoài owner/admin, sale chỉ thao tác
 * trên lịch của chính mình — kể cả lịch sinh từ reminder Zalo, vì loại đó nay được
 * gán cho chủ nick nhận reminder. Lịch chưa gán ai (dữ liệu cũ) → chỉ owner/admin.
 * Đây chỉ là lớp che UI — chốt chặn thật nằm ở `appointment-routes.ts`.
 */
export function canMutateAppointment(
  a: AppointmentEx,
  userId: string | null,
  isAdmin: boolean,
): boolean {
  if (isAdmin) return true;
  const owner = appointmentAssigneeId(a);
  return !!owner && owner === userId;
}

/**
 * Số lịch trong `items` bị chồng giờ. `map` phải dựng từ TOÀN BỘ pool đã tải,
 * không phải từ tập đã lọc — nếu không, bật filter là cảnh báo trùng giờ biến mất.
 */
export function countConflicts(items: AppointmentEx[], map: Map<string, AppointmentEx[]>): number {
  let n = 0;
  for (const a of items) if (map.has(a.id)) n++;
  return n;
}
