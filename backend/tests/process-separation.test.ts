/**
 * process-separation.test.ts — Verification & stress test for M1_1 Process Separation.
 * Empirically tests:
 * 1. Absence of heavy queue workers in app.ts (GroupScanWorker, ListEnrichmentWorker).
 * 2. Presence and registration of all 15 lightweight cron jobs in app.ts.
 * 3. Dedicated worker entrypoint src/worker.ts configuration & script registrations in package.json.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const APP_TS_PATH = path.resolve(__dirname, '../src/app.ts');
const WORKER_TS_PATH = path.resolve(__dirname, '../src/worker.ts');
const PACKAGE_JSON_PATH = path.resolve(__dirname, '../package.json');

describe('M1_1 Process Separation Verification', () => {
  const appContent = fs.readFileSync(APP_TS_PATH, 'utf-8');
  const workerContent = fs.readFileSync(WORKER_TS_PATH, 'utf-8');
  const pkgContent = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf-8'));

  describe('Task 1: Heavy Workers Exclusion from app.ts', () => {
    it('app.ts must NOT import startGroupScanWorker or stopGroupScanWorker', () => {
      expect(appContent).not.toContain('startGroupScanWorker');
      expect(appContent).not.toContain('stopGroupScanWorker');
    });

    it('app.ts must NOT import startListEnrichmentWorker or stopListEnrichmentWorker', () => {
      expect(appContent).not.toContain('startListEnrichmentWorker');
      expect(appContent).not.toContain('stopListEnrichmentWorker');
    });

    it('app.ts must NOT instantiate heavy background queue workers', () => {
      expect(appContent).not.toMatch(/GroupScanWorker/i);
      expect(appContent).not.toMatch(/ListEnrichmentWorker/i);
    });
  });

  describe('Task 2: Worker Entrypoint src/worker.ts Integrity', () => {
    it('src/worker.ts must exist', () => {
      expect(fs.existsSync(WORKER_TS_PATH)).toBe(true);
    });

    it('src/worker.ts must import and call heavy workers', () => {
      expect(workerContent).toContain('startGroupScanWorker');
      expect(workerContent).toContain('stopGroupScanWorker');
      expect(workerContent).toContain('startListEnrichmentWorker');
      expect(workerContent).toContain('stopListEnrichmentWorker');
    });

    it('src/worker.ts must register shutdown signals (SIGINT, SIGTERM)', () => {
      expect(workerContent).toContain('SIGINT');
      expect(workerContent).toContain('SIGTERM');
      expect(workerContent).toContain('closeBullMQRedis');
      expect(workerContent).toContain('prisma.$disconnect');
    });

    it('package.json must contain worker scripts', () => {
      expect(pkgContent.scripts).toHaveProperty('dev:worker');
      expect(pkgContent.scripts).toHaveProperty('start:worker');
      expect(pkgContent.scripts).toHaveProperty('worker');
      expect(pkgContent.scripts['dev:worker']).toBe('tsx watch src/worker.ts');
      expect(pkgContent.scripts['start:worker']).toBe('node dist/worker.js');
      expect(pkgContent.scripts['worker']).toBe('node dist/worker.js');
    });
  });

  describe('Task 3: 15 Lightweight Cron Jobs Registration in app.ts', () => {
    const requiredCrons = [
      'startPosInventoryAuditCron',
      'startPosSummaryReportCron',
      'startPosWebhookRetryJob',
      'startAppointmentReminder',
      'startFriendSyncCron',
      'startInteractionCron',
      'startEngagementCron',
      'startContactProfileSyncCron',
      'startMediaTrashGcCron',
      'startStatusLogCheckpointCron',
      'startScoringScheduler',
      'startAutoTagsAggregateCron',
      'startGroupInfoSyncCron',
      'startLabelsBackgroundSync',
      'startPresenceCron',
    ];

    requiredCrons.forEach((cronName) => {
      it(`app.ts must import or declare ${cronName}`, () => {
        expect(appContent).toContain(cronName);
      });

      it(`app.ts must execute/call ${cronName}()`, () => {
        // Regex matches function invocation, e.g. startAppointmentReminder(
        const callRegex = new RegExp(`\\b${cronName}\\s*\\(`, 'g');
        expect(appContent).toMatch(callRegex);
      });
    });

    it('exactly all 15 lightweight cron jobs are registered and accounted for', () => {
      const foundCrons = requiredCrons.filter((cronName) => {
        const callRegex = new RegExp(`\\b${cronName}\\s*\\(`, 'g');
        return callRegex.test(appContent);
      });
      expect(foundCrons.length).toBe(15);
    });
  });
});
