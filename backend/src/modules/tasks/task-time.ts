/**
 * task-time.ts — Helper thời gian thuần cho Công việc (Task V1, 2026-07-07).
 *
 * Org dùng múi giờ offset CỐ ĐỊNH (Organization.timezone, vd "+07:00" — không DST).
 * Mốc "hôm nay" của due date phải tính theo múi giờ ORG, không phải server:
 * server UTC 19:00 ngày 6/7 = VN 02:00 ngày 7/7 → task hạn 7/7 là "hôm nay", chưa quá hạn.
 *
 * Pure function — không import prisma/logger để unit-test được (convention backend/tests).
 * Cùng công thức với appointment-digest.ts (parseOffsetMinutes/startOfTodayOrgMs).
 */

/** Offset phút từ chuỗi tz "+07:00". Sai định dạng → 420 (+07:00 VN). */
export function parseOffsetMinutes(tz: string): number {
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(tz || '');
  if (!m) return 420;
  return (m[1] === '-' ? -1 : 1) * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10));
}

/** Mốc 00:00 HÔM NAY theo múi giờ org, trả về Date (UTC instant) — biên dưới của "đến hạn hôm nay". */
export function startOfTodayOrgUtc(tz: string, nowMs: number = Date.now()): Date {
  const offsetMin = parseOffsetMinutes(tz);
  const local = new Date(nowMs + offsetMin * 60_000);
  const startWallUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 0, 0, 0);
  return new Date(startWallUtc - offsetMin * 60_000);
}
