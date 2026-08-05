/**
 * hisweetie-push-queue.ts — Debounce CRM edit → POS customer update (goal 2, anh
 * chốt 2026-07-15).
 *
 * Vì sao debounce thay vì gọi POS ngay mỗi lần PUT /contacts/:id: sale có thể sửa
 * nhiều field liên tiếp trong vài giây (đổi SĐT rồi sửa địa chỉ ngay sau) — gọi
 * POS ngay mỗi field là N request thừa, tốn tải gateway. BullMQ delayed job keyed
 * theo contactId: mỗi lần edit mới XOÁ job đang chờ (nếu còn) rồi tạo lại delay
 * 2000ms → chỉ 1 POS call sau khi sale NGỪNG sửa 2s, luôn mang state mới nhất.
 *
 * Idempotency: sinh 1 UUID lúc enqueue, giữ nguyên qua các lần BullMQ retry (worker
 * đọc lại DB tại thời điểm chạy nên state luôn tươi — key chỉ chống double-apply
 * do retry của CÙNG 1 lần chạy, không phải chống 2 lần edit khác nhau).
 */
import { randomUUID } from 'node:crypto';
import { Queue, Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { logger } from '../../shared/utils/logger.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { config } from '../../config/index.js';
import { getHisweetieClient, isHisweetieMcpConfigured } from './hisweetie-mcp-client.js';
import { buildPosCustomerPatch } from './hisweetie-customer-patch.js';
import { assertSandboxForPosWrite } from './hisweetie-sandbox-guard.js';

const QUEUE_NAME = 'hisweetie-customer-push';
const DEBOUNCE_MS = 2000;

interface HisweetiePushJob {
  contactId: string;
  idempotencyKey: `${string}-${string}-${string}-${string}-${string}`;
}

let queue: Queue<HisweetiePushJob> | null = null;
let worker: Worker<HisweetiePushJob> | null = null;
let redisConn: Redis | null = null;

function getConn(): Redis | null {
  if (redisConn) return redisConn;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  redisConn = new Redis(url, { maxRetriesPerRequest: null, lazyConnect: false });
  return redisConn;
}

function getQueue(): Queue<HisweetiePushJob> | null {
  if (queue) return queue;
  const conn = getConn();
  if (!conn) {
    logger.warn('[hisweetie-push] REDIS_URL not set, queue disabled');
    return null;
  }
  queue = new Queue<HisweetiePushJob>(QUEUE_NAME, { connection: conn });
  return queue;
}

/** Gọi sau khi PUT /contacts/:id ghi DB thành công + contact đã link POS. */
export async function scheduleHisweetiePush(contactId: string): Promise<void> {
  if (!isHisweetieMcpConfigured()) return;
  const q = getQueue();
  if (!q) {
    logger.warn(`[hisweetie-push] enqueue skipped (no Redis) contactId=${contactId}`);
    return;
  }
  const jobId = `pos-push:${contactId}`;
  // Xoá job đang chờ (chưa active) để reset debounce window — edit mới nhất thắng.
  const pending = await q.getJob(jobId);
  if (pending) {
    const state = await pending.getState();
    if (state === 'delayed' || state === 'waiting') {
      await pending.remove();
    }
  }
  await q.add(
    'push',
    { contactId, idempotencyKey: randomUUID() as HisweetiePushJob['idempotencyKey'] },
    {
      jobId,
      delay: DEBOUNCE_MS,
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 100 },
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    },
  );
}

/**
 * Đẩy 1 Contact → POS. Tách khỏi handlePush() để chạy/kiểm chứng được KHÔNG cần
 * BullMQ (queue chỉ lo debounce + retry; phần rủi ro thật là payload POS chấp nhận
 * hay không). Trả kết quả để caller log/test.
 */
export async function pushContactToPos(
  contactId: string,
  idempotencyKey: HisweetiePushJob['idempotencyKey'],
): Promise<{ pushed: boolean; reason?: string; posCustomerId?: number }> {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { id: true, posCustomerId: true, fullName: true, crmName: true, phone: true, email: true },
  });
  if (!contact) return { pushed: false, reason: 'contact_not_found' };
  // KH bị unlink/xoá sau khi enqueue — bỏ qua, KHÔNG tạo mới bên POS.
  if (!contact.posCustomerId) return { pushed: false, reason: 'not_linked_to_pos' };

  const patch = buildPosCustomerPatch(contact);
  if (!patch) return { pushed: false, reason: 'nothing_to_push', posCustomerId: contact.posCustomerId };

  // Chốt sandbox 2026-07-18 — mọi POS write phải qua guard (chưa có quyền ghi production).
  assertSandboxForPosWrite(config.hisweetieMcpUrl, 'customers.update');
  await getHisweetieClient().customers.update(contact.posCustomerId, patch, idempotencyKey);
  logger.info(`[hisweetie-push] Pushed contact ${contactId} → POS customer ${contact.posCustomerId}`);
  return { pushed: true, posCustomerId: contact.posCustomerId };
}

async function handlePush(job: Job<HisweetiePushJob>): Promise<void> {
  const { contactId, idempotencyKey } = job.data;
  await pushContactToPos(contactId, idempotencyKey);
}

export function startHisweetiePushWorker(): Worker<HisweetiePushJob> | null {
  if (worker) return worker;
  const conn = getConn();
  if (!conn) {
    logger.warn('[hisweetie-push] worker not started (no Redis)');
    return null;
  }
  worker = new Worker<HisweetiePushJob>(QUEUE_NAME, handlePush, { connection: conn, concurrency: 2 });
  worker.on('completed', (job) => logger.debug(`[hisweetie-push] completed ${job.id}`));
  worker.on('failed', (job, err) => logger.error(`[hisweetie-push] failed ${job?.id}: ${err?.message}`));
  return worker;
}

export async function stopHisweetiePushQueue(): Promise<void> {
  await worker?.close();
  await queue?.close();
  worker = null;
  queue = null;
  redisConn?.disconnect();
  redisConn = null;
}
