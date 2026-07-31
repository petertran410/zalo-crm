import { prisma } from '../shared/database/prisma-client.js';
import { logger } from '../shared/utils/logger.js';
import { processPosWebhookLog } from '../controllers/pos-webhook.controller.js';

let retryIntervalTimer: NodeJS.Timeout | null = null;
let isSweeping = false;

/**
 * Runs one sweep pass over pos_webhook_logs table:
 * Finds records with status='PENDING' and attempts < 3, sorted by createdAt ASC.
 */
export async function runPosWebhookRetrySweep(): Promise<number> {
  if (isSweeping) {
    logger.debug('[pos-webhook-retry-job] Previous sweep cycle still in progress. Skipping...');
    return 0;
  }

  isSweeping = true;
  let processedCount = 0;

  try {
    const pendingLogs = await prisma.posWebhookLog.findMany({
      where: {
        status: 'PENDING',
        attempts: { lt: 3 },
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    if (pendingLogs.length === 0) {
      isSweeping = false;
      return 0;
    }

    logger.info(`[pos-webhook-retry-job] Found ${pendingLogs.length} pending webhook(s) to retry.`);

    for (const log of pendingLogs) {
      try {
        const success = await processPosWebhookLog(log.id);
        if (success) {
          processedCount++;
        }
      } catch (err: any) {
        logger.error(`[pos-webhook-retry-job] Error processing retry for log ${log.id}:`, err);
      }
    }
  } catch (err: any) {
    logger.error('[pos-webhook-retry-job] Exception in retry sweep cycle:', err);
  } finally {
    isSweeping = false;
  }

  return processedCount;
}

/**
 * Starts periodic background sweeper job.
 */
export function startPosWebhookRetryJob(intervalMs = 60000): void {
  if (retryIntervalTimer) {
    clearInterval(retryIntervalTimer);
  }

  logger.info(`[pos-webhook-retry-job] Starting background retry sweeper job (Interval: ${intervalMs / 1000}s)`);

  // Initial delayed sweep
  setTimeout(() => {
    runPosWebhookRetrySweep().catch((err) => {
      logger.error('[pos-webhook-retry-job] Initial sweep failed:', err);
    });
  }, 10000);

  retryIntervalTimer = setInterval(() => {
    runPosWebhookRetrySweep().catch((err) => {
      logger.error('[pos-webhook-retry-job] Scheduled sweep failed:', err);
    });
  }, intervalMs);
}

/**
 * Stops background retry sweeper job.
 */
export function stopPosWebhookRetryJob(): void {
  if (retryIntervalTimer) {
    clearInterval(retryIntervalTimer);
    retryIntervalTimer = null;
    logger.info('[pos-webhook-retry-job] Background retry sweeper job stopped.');
  }
}
