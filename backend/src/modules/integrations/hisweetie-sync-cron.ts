/**
 * hisweetie-sync-cron.ts — Pull khách hàng POS (Hisweetie) → Contact (Khách Hàng).
 *
 * Không dùng webhook (goal 3 — anh chốt 2026-07-15): webhook receiver cần public
 * endpoint luôn sẵn sàng + xử lý retry/dedup + signature verify, rủi ro drift khi
 * server down lúc POS bắn event. Poll rẻ hơn nhiều so với độ phức tạp đó.
 *
 * ── Chỉ sync KH CÒN HOẠT ĐỘNG và CÓ TƯƠNG TÁC THẬT ────────────────────────
 * Hai tầng lọc:
 *   1. Còn hoạt động — không gửi `includeInactive` nên POS tự loại bản ghi đã
 *      ngừng hoạt động ở server (PUBLIC-API.md mục 3); isPosCustomerActive() là
 *      lớp phòng thủ phía CRM.
 *   2. Có tương tác thật — isEngagedCustomer() (hisweetie-customer-mapper.ts —
 *      xem file đó để biết vì sao 4 tín hiệu, không phải isActive):
 *      50.446 KH POS → 6.125 KH engaged.
 * POS KHÔNG lọc server-side theo mấy field tương tác này → phải kéo hết 101 page
 * rồi lọc client-side. Chấp nhận được: đọc 50k/đêm nhưng chỉ ghi ~6k.
 *
 * ── Rate limit (verify live) ────────────────────────────────────────────────
 * POS bắn `rate_limit_exceeded` khi paging liên tục — scan thật chết ở ~30.500
 * record. BẮT BUỘC throttle giữa page + backoff luỹ thừa khi bị chặn.
 *
 * Match key: posCustomerId trước (KH đã link), fallback phoneNormalized (dedup với
 * KH đã có từ Zalo/sale nhập tay). Không thấy → tạo Contact mới, source='POS'.
 * LƯU Ý: chỉ 3.140/6.125 KH engaged có SĐT → ~2.985 KH không dedup được, luôn tạo
 * mới. posCustomerId chặn trùng khi chạy lại, nhưng nếu sau đó KH nhắn Zalo thì sẽ
 * ra 2 Contact (chưa xử lý — cần merge tay hoặc mở rộng match key).
 *
 * Chính sách merge (anh chốt): CHỈ điền field đang TRỐNG. Không bao giờ ghi đè
 * fullName/notes/tags/... mà sale đã nhập tay — POS chỉ bổ sung, không đè CRM.
 */
import cron from 'node-cron';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { normalizePhone } from '../../shared/utils/phone.js';
import { getHisweetiePublicApiClient, isPublicApiSyncEnabled } from './hisweetie-public-api-client.js';
import { asItemArray } from './hisweetie-mcp-routes.js';
import { extractCustomer, isEngagedCustomer, isPosCustomerActive } from './hisweetie-customer-mapper.js';

// 01:00 VN — trước interaction-cron (02:00) / engagement (02:30) / contact-profile-sync
// (03:00) / media-trash-gc (03:30), không tranh tài nguyên DB cùng lúc.
const CRON_SCHEDULE = '0 1 * * *';
// Public API hiện giới hạn pageSize tối đa 100; dùng cùng kích thước cho MCP để
// checkpoint `currentItem` luôn tăng đúng, không bỏ qua bản ghi khi đổi transport.
const PAGE_SIZE = 100;
// 700ms verify đủ thoát rate limit khi scan hết 101 page. 300ms cũ → chết ở ~30.5k.
const PAGE_THROTTLE_MS = 700;
const MAX_RETRY = 6;
const MAX_PAGES = 400; // chặn vòng lặp vô hạn nếu POS trả pagination lỗi
const TOUCH_CHUNK = 1000; // chunk cho updateMany posSyncedAt

let cronRunning = false;
let cronTask: ReturnType<typeof cron.schedule> | null = null;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export function startHisweetieSyncCron(): void {
  if (cronTask) {
    logger.info('[hisweetie-sync] Already started, skipping');
    return;
  }
  cronTask = cron.schedule(CRON_SCHEDULE, async () => {
    if (cronRunning) {
      logger.warn('[hisweetie-sync] Previous cycle still running, skip tick');
      return;
    }
    cronRunning = true;
    const startedAt = Date.now();
    try {
      await runCycle();
    } catch (err) {
      logger.error('[hisweetie-sync] Cycle error:', err);
    } finally {
      cronRunning = false;
      logger.info(`[hisweetie-sync] Cycle done in ${Date.now() - startedAt}ms`);
    }
  }, { timezone: 'Asia/Ho_Chi_Minh' });
  logger.info(`[hisweetie-sync] Started, schedule="${CRON_SCHEDULE}" (Asia/Ho_Chi_Minh)`);
}

export function stopHisweetieSyncCron(): void {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
    logger.info('[hisweetie-sync] Stopped');
  }
}

/** customers.list + backoff luỹ thừa khi POS bắn rate_limit_exceeded. */
async function listWithRetry(
  args: Record<string, unknown>,
  attempt = 0,
): Promise<unknown> {
  try {
    return await getHisweetiePublicApiClient().listCustomers(args as any);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const rateLimited = msg.includes('rate_limit') || msg.includes('429');
    if (!rateLimited || attempt >= MAX_RETRY) throw err;
    const wait = 2000 * 2 ** attempt;
    logger.warn(`[hisweetie-sync] rate limited, backoff ${wait}ms (attempt ${attempt + 1}/${MAX_RETRY})`);
    await sleep(wait);
    return listWithRetry(args, attempt + 1);
  }
}

interface ExistingContact {
  id: string;
  posCustomerId: number | null;
  posCustomerCode: string | null;
  phoneNormalized: string | null;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  addressLine: string | null;
}

async function runCycle(opts: { maxPages?: number } = {}): Promise<void> {
  const maxPages = opts.maxPages ?? MAX_PAGES;
  if (!isPublicApiSyncEnabled()) {
    logger.info('[hisweetie-sync] POS sync transport is not configured, skip cycle');
    return;
  }
  logger.info('[hisweetie-sync] Using Public API transport');

  // Deployment hiện tại single-org (verify 2026-07-15). Nếu sau này multi-org,
  // cần map POS customer → org qua branchId hoặc field riêng — hiện chưa có.
  const org = await prisma.organization.findFirst({ select: { id: true } });
  if (!org) {
    logger.warn('[hisweetie-sync] No organization found, skip cycle');
    return;
  }

  // Nạp sẵn Contact vào RAM thay vì findFirst mỗi record: ~6k KH × 1 query = 6k
  // round-trip/đêm là lãng phí. 1 select gọn hơn nhiều, và cho phép dedup KH mới
  // tạo trong CÙNG cycle (2 record POS trùng SĐT → chỉ 1 Contact).
  const existingRows = await prisma.contact.findMany({
    where: { orgId: org.id },
    select: {
      id: true, posCustomerId: true, posCustomerCode: true, phoneNormalized: true,
      fullName: true, phone: true, email: true, addressLine: true,
    },
  });
  const byPosId = new Map<number, ExistingContact>();
  const byPhone = new Map<string, ExistingContact>();
  for (const r of existingRows) {
    if (r.posCustomerId != null) byPosId.set(r.posCustomerId, r);
    if (r.phoneNormalized) byPhone.set(r.phoneNormalized, r);
  }
  logger.info(`[hisweetie-sync] Loaded ${existingRows.length} existing contact(s) into match index`);

  const seenPosIds = new Set<number>();
  const touchIds: string[] = []; // KH không đổi gì → gom lại updateMany 1 lần
  let currentItem = 0;
  let pages = 0;
  let fetched = 0;
  let engaged = 0;
  let created = 0;
  let updated = 0;
  let skippedNoId = 0;

  for (;;) {
    const raw = await listWithRetry({ currentItem, pageSize: PAGE_SIZE });
    const items = asItemArray(raw);
    pages++;
    if (!items.length) break;
    fetched += items.length;

    for (const item of items) {
      const c = extractCustomer(item);
      if (c.posCustomerId == null) { skippedNoId++; continue; }
      // POS trả trùng record giữa các page (verify: total=50.448 nhưng chỉ lấy được
      // 50.444 id duy nhất) → chặn xử lý 2 lần.
      if (seenPosIds.has(c.posCustomerId)) continue;
      seenPosIds.add(c.posCustomerId);

      if (!isPosCustomerActive(item)) continue;
      if (!isEngagedCustomer(item)) continue;
      engaged++;

      const phoneNormalized = normalizePhone(c.phone);
      const existing = byPosId.get(c.posCustomerId)
        ?? (phoneNormalized ? byPhone.get(phoneNormalized) : undefined);

      if (!existing) {
        const row = await prisma.contact.create({
          data: {
            orgId: org.id,
            source: 'POS',
            posCustomerId: c.posCustomerId,
            posCustomerCode: c.posCustomerCode,
            posSyncedAt: new Date(),
            fullName: c.name,
            phone: c.phone,
            phoneNormalized,
            email: c.email,
            addressLine: c.address,
          },
          select: {
            id: true, posCustomerId: true, posCustomerCode: true, phoneNormalized: true,
            fullName: true, phone: true, email: true, addressLine: true,
          },
        });
        byPosId.set(c.posCustomerId, row);
        if (phoneNormalized) byPhone.set(phoneNormalized, row);
        created++;
        continue;
      }

      // Chỉ điền field đang TRỐNG — không đè dữ liệu sale đã nhập tay.
      const patch: Record<string, unknown> = {};
      if (existing.posCustomerId == null) patch.posCustomerId = c.posCustomerId;
      if (existing.posCustomerCode == null && c.posCustomerCode) patch.posCustomerCode = c.posCustomerCode;
      if (!existing.fullName && c.name) patch.fullName = c.name;
      if (!existing.phone && c.phone) { patch.phone = c.phone; patch.phoneNormalized = phoneNormalized; }
      if (!existing.email && c.email) patch.email = c.email;
      if (!existing.addressLine && c.address) patch.addressLine = c.address;

      if (Object.keys(patch).length) {
        patch.posSyncedAt = new Date();
        await prisma.contact.update({ where: { id: existing.id }, data: patch });
        // Cập nhật index trong RAM để record POS sau không ghi đè nhầm.
        Object.assign(existing, patch);
        if (existing.posCustomerId != null) byPosId.set(existing.posCustomerId, existing);
        updated++;
      } else {
        // KHÔNG update lẻ từng KH chỉ để chạm posSyncedAt (~6k write thừa/đêm) —
        // gom updateMany theo chunk ở cuối cycle.
        touchIds.push(existing.id);
      }
    }

    if (items.length < PAGE_SIZE) break;
    if (pages >= maxPages) {
      logger.warn(`[hisweetie-sync] Hit maxPages=${maxPages}, stopping early`);
      break;
    }
    currentItem += PAGE_SIZE;
    await sleep(PAGE_THROTTLE_MS);
  }

  // posSyncedAt cho KH không đổi: gom thành vài updateMany thay vì ~6k update lẻ.
  const touchedAt = new Date();
  for (let i = 0; i < touchIds.length; i += TOUCH_CHUNK) {
    const chunk = touchIds.slice(i, i + TOUCH_CHUNK);
    await prisma.contact.updateMany({ where: { id: { in: chunk } }, data: { posSyncedAt: touchedAt } });
  }

  logger.info(
    `[hisweetie-sync] Cycle stats: pages=${pages} fetched=${fetched} engaged=${engaged} `
    + `created=${created} updated=${updated} touched=${touchIds.length} skippedNoId=${skippedNoId}`,
  );
}

/**
 * Export cho manual trigger (script/route thủ công) — chạy 1 cycle ngay.
 * `maxPages` để chạy thử giới hạn (vd 2 page = 1000 KH POS) trước khi mở full.
 */
export async function runHisweetieSyncNow(opts: { maxPages?: number } = {}): Promise<void> {
  return runCycle(opts);
}
