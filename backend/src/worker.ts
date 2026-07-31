/**
 * Standalone process entrypoint for background workers.
 * Runs heavy queue workers and background processing jobs independently of the HTTP server process.
 */

import { logger } from './shared/utils/logger.js';
import { prisma } from './shared/database/prisma-client.js';
import { getBullMQRedis, closeBullMQRedis } from './shared/queue/redis-connection.js';
import { startGroupScanWorker, stopGroupScanWorker } from './modules/zalo/group-scan-queue.js';
import { startListEnrichmentWorker, stopListEnrichmentWorker } from './modules/lists/list-enrichment-service.js';

type ExtensionBundle = {
  registerExtensionEarly?: (app: any) => Promise<void>;
  registerExtensionRoutes?: (app: any) => Promise<void>;
  startExtensionJobs?: (app?: any, io?: any) => Promise<void>;
  stopExtensionJobs?: () => Promise<void>;
};

let extensionBundle: ExtensionBundle | null | undefined;
async function loadExtension(): Promise<ExtensionBundle | null> {
  if (extensionBundle !== undefined) return extensionBundle;
  const spec: string = './_ee/index.js';
  try {
    extensionBundle = (await import(spec)) as ExtensionBundle;
    logger.info('[worker] Extension edition — _ee bundle loaded');
  } catch {
    extensionBundle = null;
    logger.info('[worker] Community edition — _ee bundle absent');
  }
  return extensionBundle;
}

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`[worker shutdown] Received ${signal} — stopping active queue workers and closing connections...`);

  const forceTimer = setTimeout(() => {
    logger.warn('[worker shutdown] Timed out waiting for graceful shutdown after 10s, forcing exit');
    process.exit(1);
  }, 10_000);
  forceTimer.unref();

  try {
    // 1. Stop heavy background queue workers
    await stopGroupScanWorker().catch((err) =>
      logger.warn('[worker shutdown] stopGroupScanWorker error:', err),
    );

    try {
      stopListEnrichmentWorker();
    } catch (err) {
      logger.warn('[worker shutdown] stopListEnrichmentWorker error:', err);
    }

    // 2. Stop extension jobs if present
    const ee = await loadExtension();
    if (ee?.stopExtensionJobs) {
      await ee.stopExtensionJobs().catch((err) =>
        logger.warn('[worker shutdown] stopExtensionJobs error:', err),
      );
    }

    // 3. Close BullMQ Redis shared connection
    await closeBullMQRedis().catch((err) =>
      logger.warn('[worker shutdown] closeBullMQRedis error:', err),
    );

    // 4. Disconnect Prisma DB client
    await prisma.$disconnect().catch((err) =>
      logger.warn('[worker shutdown] prisma.$disconnect error:', err),
    );

    logger.info('[worker shutdown] Graceful shutdown complete.');
  } finally {
    clearTimeout(forceTimer);
    process.exit(0);
  }
}

async function bootstrap() {
  logger.info('[worker] Starting standalone background worker process...');

  // Reuse existing connection configuration for BullMQ Redis
  getBullMQRedis();

  // Initialize heavy background workers
  startGroupScanWorker();
  startListEnrichmentWorker();

  // Open-core extension jobs if present
  const ee = await loadExtension();
  if (ee?.startExtensionJobs) {
    await ee.startExtensionJobs();
  }

  logger.info('[worker] Background worker process started successfully.');

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

process.on('uncaughtException', (err) => {
  logger.error('[worker] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
  logger.error('[worker] Unhandled Rejection:', reason);
});

bootstrap().catch((err) => {
  logger.error('[worker] Failed to start background worker process:', err);
  process.exit(1);
});
