/**
 * zalo-pending-send-queue.ts — Flush tin nhắn 'pending' (soạn lúc nick mất kết nối
 * Zalo) khi zca-js session kết nối lại (2026-07-27).
 *
 * Bối cảnh: trước fix này, POST /conversations/:id/messages trả 400 cứng "Zalo
 * account not connected" khi zaloPool không có instance sống cho nick đó — tin
 * nhắn KHÔNG được lưu, sale phải tự gõ lại. chat-routes.ts nay LƯU NGAY tin dạng
 * 'pending' (metadata.sendStatus='pending' + metadata.pendingPayload) thay vì 400.
 * Module này chịu trách nhiệm GỬI THẬT các tin đó khi nick kết nối lại.
 *
 * Trigger: zalo-pool.ts gọi enqueuePendingFlush(accountId) tại đúng 2 chỗ đang gọi
 * syncHistoryOnConnect(accountId) — connectAccount() (QR login) và reconnect path.
 * Cùng model với backfill tin ĐẾN: bounded, throttle, fire-and-forget.
 *
 * Idempotency: jobId = `flush:${accountId}` — nhiều lần reconnect dồn dập (mạng
 * chập chờn) chỉ giữ 1 job chờ/chạy, KHÔNG chồng job. Trong 1 lần flush, mỗi tin
 * được gửi rồi CẬP NHẬT NGAY (sendStatus rời khỏi 'pending') trước khi xử lý tin
 * kế — nếu job throw giữa chừng (lỗi hệ thống) và BullMQ retry, các tin đã gửi
 * thành công sẽ KHÔNG bị query lại (đã hết 'pending') → an toàn để retry cả job.
 *
 * Thứ tự + rate limit: gửi TUẦN TỰ theo sentAt tăng dần (đúng thứ tự sale đã soạn),
 * throttle 700ms giữa các lần gửi (cùng ngưỡng CLAUDE.md mandate cho mọi Zalo call
 * dồn dập), tôn trọng zaloRateLimiter — chạm giới hạn thì dừng vòng lặp (không hard
 * fail cả job) và tự enqueue lại 1 job trễ 5 phút để tiếp tục phần còn lại.
 */
import { Queue, Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import type { Server } from 'socket.io';
import { logger } from '../../shared/utils/logger.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { zaloPool } from './zalo-pool.js';
import { zaloRateLimiter } from './zalo-rate-limiter.js';
import { getIo } from '../../shared/event-buffer.js';
import { applyContactAggregateFromMessage, applyFriendAggregate } from '../contacts/contact-aggregate.js';

const QUEUE_NAME = 'zalo-pending-send';
const THROTTLE_MS = 700; // cùng ngưỡng CLAUDE.md cho Zalo call dồn dập (~700ms/page)
const RATE_LIMIT_RETRY_DELAY_MS = 5 * 60_000;

interface PendingFlushJob {
  accountId: string;
}

let queue: Queue<PendingFlushJob> | null = null;
let worker: Worker<PendingFlushJob> | null = null;
let redisConn: Redis | null = null;

function getConn(): Redis | null {
  if (redisConn) return redisConn;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  redisConn = new Redis(url, { maxRetriesPerRequest: null, lazyConnect: false });
  return redisConn;
}

function getQueue(): Queue<PendingFlushJob> | null {
  if (queue) return queue;
  const conn = getConn();
  if (!conn) {
    logger.warn('[zalo-pending-send] REDIS_URL not set, queue disabled');
    return null;
  }
  queue = new Queue<PendingFlushJob>(QUEUE_NAME, { connection: conn });
  return queue;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Gọi khi nick kết nối/kết nối lại (zalo-pool.ts), hoặc như safety-net ngay sau khi lưu 1 tin 'pending'. */
export async function enqueuePendingFlush(accountId: string, opts?: { delayMs?: number }): Promise<void> {
  const q = getQueue();
  if (!q) {
    logger.warn(`[zalo-pending-send] enqueue skipped (no Redis) accountId=${accountId}`);
    return;
  }
  const jobId = `flush:${accountId}`;
  const existing = await q.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    // Job đang delayed/waiting/active → đã có 1 lần flush sắp/đang chạy, không cần thêm.
    if (state === 'delayed' || state === 'waiting' || state === 'active') return;
  }
  await q.add(
    'flush',
    { accountId },
    {
      jobId,
      delay: opts?.delayMs ?? 0,
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 100 },
      attempts: 5,
      backoff: { type: 'exponential', delay: 3000 },
    },
  );
}

interface PendingPayload {
  content: string;
  styles: Array<{ st: string; start: number; len: number }> | null;
  mentions: Array<{ uid: string; pos: number; len: number }> | null;
  quote: Record<string, unknown> | null;
}

/**
 * Gửi thật toàn bộ tin 'pending' của 1 tài khoản Zalo, theo đúng thứ tự soạn.
 * Tách khỏi handleFlush() để test/gọi trực tiếp không cần BullMQ (cùng convention
 * pushContactToPos trong hisweetie-push-queue.ts).
 */
export async function flushPendingSends(accountId: string): Promise<{ sent: number; failed: number; deferred: number }> {
  const result = { sent: 0, failed: 0, deferred: 0 };
  const instance = zaloPool.getInstance(accountId);
  if (!instance?.api) {
    logger.debug(`[zalo-pending-send] accountId=${accountId} vẫn chưa kết nối — bỏ qua lượt flush này`);
    return result;
  }

  const pendingMessages = await prisma.message.findMany({
    where: {
      conversation: { zaloAccountId: accountId },
      metadata: { path: ['sendStatus'], equals: 'pending' },
    },
    orderBy: { sentAt: 'asc' },
    include: {
      conversation: { include: { zaloAccount: true } },
      repliedBy: { select: { id: true, fullName: true, email: true } },
    },
  });
  if (pendingMessages.length === 0) return result;

  logger.info(`[zalo-pending-send] accountId=${accountId} flushing ${pendingMessages.length} pending message(s)`);
  const io = getIo();

  for (let i = 0; i < pendingMessages.length; i++) {
    const message = pendingMessages[i];
    const conv = message.conversation;
    if (!conv.zaloAccountId || !conv.zaloAccount) continue; // guard lý thuyết — pending chỉ tạo trên conv Zalo

    const limits = await zaloRateLimiter.checkLimits(conv.zaloAccountId);
    if (!limits.allowed) {
      logger.warn(`[zalo-pending-send] accountId=${accountId} chạm rate limit giữa chừng (${limits.reason}) — dừng, hẹn lại sau ${RATE_LIMIT_RETRY_DELAY_MS / 60000} phút`);
      result.deferred = pendingMessages.length - i;
      void enqueuePendingFlush(accountId, { delayMs: RATE_LIMIT_RETRY_DELAY_MS }).catch((err) =>
        logger.warn('[zalo-pending-send] re-enqueue after rate-limit failed:', err),
      );
      break;
    }

    const meta = (message.metadata ?? {}) as { sender?: unknown; pendingPayload?: PendingPayload };
    const payload = meta.pendingPayload;
    if (!payload) {
      // Dữ liệu hỏng (không nên xảy ra) — đánh failed để không kẹt vô hạn trong hàng đợi.
      await markFailed(message.id, 'Thiếu dữ liệu gửi (pendingPayload trống)', null, meta.sender);
      result.failed++;
      continue;
    }

    const threadId = conv.externalThreadId || '';
    const threadType = conv.threadType === 'group' ? 1 : 0;
    const sendPayload: Record<string, unknown> = { msg: payload.content };
    if (Array.isArray(payload.styles) && payload.styles.length > 0) sendPayload.styles = payload.styles;
    if (Array.isArray(payload.mentions) && payload.mentions.length > 0 && threadType === 1) sendPayload.mentions = payload.mentions;
    if (payload.quote) sendPayload.quote = payload.quote;

    zaloRateLimiter.recordSend(conv.zaloAccountId);

    let zaloMsgId = '';
    let sendFail: { reason: string; code: string | null } | null = null;
    try {
      const sendResult = await instance.api.sendMessage(sendPayload, threadId, threadType);
      const sr = sendResult as unknown as { message?: { msgId?: number | string } | null; attachment?: Array<{ msgId?: number | string }> };
      const rawId = sr?.message?.msgId ?? sr?.attachment?.[0]?.msgId ?? '';
      zaloMsgId = String(rawId || '');
      if (!zaloMsgId) {
        logger.warn(`[zalo-pending-send] sendMessage không trả msgId messageId=${message.id} shape=${JSON.stringify(sendResult).slice(0, 200)}`);
      }
    } catch (sendErr) {
      const se = sendErr as { name?: string; message?: string };
      const raw = String(se?.message || '');
      const isZaloBusiness =
        se?.name === 'ZaloApiError' || se?.name === 'ZcaApiError' ||
        /ZaloApiError|ZcaApiError/.test(String(se?.name || '')) ||
        /chặn không nhận tin|người lạ|chưa thể gửi tin|không muốn nhận tin|Không thể nhận tin nhắn|Tham số không hợp lệ|\[zalo:\d+\]/i.test(raw);
      if (!isZaloBusiness) {
        // Lỗi hệ thống thật (mất kết nối giữa chừng, timeout...) — throw để BullMQ retry
        // CẢ job sau. Tin này + các tin còn lại vẫn 'pending', KHÔNG mất.
        throw sendErr;
      }
      const codeMatch = raw.match(/\[zalo:(\d+)\]/);
      const reason =
        raw.replace(/^sendMessage failed:\s*/i, '').replace(/\s*\[zalo:\d+\]\s*$/i, '').trim() ||
        'Zalo từ chối gửi tin này';
      sendFail = { reason, code: codeMatch ? codeMatch[1] : null };
    }

    if (sendFail) {
      await markFailed(message.id, sendFail.reason, sendFail.code, meta.sender);
      result.failed++;
    } else {
      const zaloMsgIdNum = zaloMsgId && /^\d+$/.test(zaloMsgId) ? BigInt(zaloMsgId) : null;
      const updated = await prisma.message.update({
        where: { id: message.id },
        data: {
          zaloMsgId: zaloMsgId || null,
          zaloMsgIdNum,
          metadata: { ...(meta.sender ? { sender: meta.sender } : {}) },
        },
      });
      result.sent++;

      void applyContactAggregateFromMessage({
        conversationId: conv.id,
        message: { id: message.id, content: message.content, contentType: message.contentType, sentAt: message.sentAt, senderType: 'self' as const },
        outboundUserId: message.repliedByUserId,
      });
      void applyFriendAggregate({
        conversationId: conv.id,
        message: { id: message.id, content: message.content, contentType: message.contentType, sentAt: message.sentAt, senderType: 'self' as const },
        outboundUserId: message.repliedByUserId,
      });

      if (io) {
        // CLAUDE.md: never io.emit bare — scope theo room org. Payload nhẹ (không lặp
        // content) vì FE chỉ cần patch zaloMsgId/metadata lên bubble đã render sẵn.
        io.to(`org:${conv.orgId}`).emit('chat:message-status', {
          messageId: message.id,
          conversationId: conv.id,
          zaloMsgId: updated.zaloMsgId,
          zaloMsgIdNum: updated.zaloMsgIdNum?.toString() ?? null,
          metadata: updated.metadata,
        });
      }
    }

    if (i < pendingMessages.length - 1) await sleep(THROTTLE_MS);
  }

  logger.info(`[zalo-pending-send] accountId=${accountId} flush done: sent=${result.sent} failed=${result.failed} deferred=${result.deferred}`);
  return result;
}

async function markFailed(messageId: string, reason: string, code: string | null, sender: unknown): Promise<void> {
  const updated = await prisma.message.update({
    where: { id: messageId },
    data: {
      metadata: {
        ...(sender ? { sender } : {}),
        sendStatus: 'failed',
        failReason: reason,
        failCode: code,
        failedAt: new Date().toISOString(),
      },
    },
    include: { conversation: { select: { orgId: true } } },
  });
  const io = getIo();
  if (io) {
    io.to(`org:${updated.conversation.orgId}`).emit('chat:message-status', {
      messageId: updated.id,
      conversationId: updated.conversationId,
      zaloMsgId: updated.zaloMsgId,
      zaloMsgIdNum: updated.zaloMsgIdNum?.toString() ?? null,
      metadata: updated.metadata,
    });
  }
}

async function handleFlush(job: Job<PendingFlushJob>): Promise<void> {
  await flushPendingSends(job.data.accountId);
}

export function startPendingSendWorker(): Worker<PendingFlushJob> | null {
  if (worker) return worker;
  const conn = getConn();
  if (!conn) {
    logger.warn('[zalo-pending-send] worker not started (no Redis)');
    return null;
  }
  worker = new Worker<PendingFlushJob>(QUEUE_NAME, handleFlush, { connection: conn, concurrency: 3 });
  worker.on('completed', (job) => logger.debug(`[zalo-pending-send] completed ${job.id}`));
  worker.on('failed', (job, err) => logger.error(`[zalo-pending-send] failed ${job?.id}: ${err?.message}`));
  return worker;
}
