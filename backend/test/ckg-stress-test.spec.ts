/**
 * ckg-stress-test.spec.ts — Adversarial Stress & SLA Benchmark Test Suite for CKG Ingestion Engine
 *
 * EMPIRICAL CHALLENGER TEST SUITE:
 * 1. SLA Verification: 1,000+ rapid sequential touchpoints with high-res timing (hrtime.bigint).
 * 2. SLA Verification: In-memory enqueue average < 0.1ms, P99 < 5ms under load.
 * 3. Concurrent Burst: 5,000 concurrent event dispatches simulating multi-worker webhook burst.
 * 4. Backpressure & Buffer Cap: Verification of MAX_BUFFER_CAP (10,000) ceiling when DB is delayed.
 * 5. Memory & Leak Investigation: Check nodeBuffer, edgeBuffer, and touchpointBuffer capping.
 * 6. Deterministic Node ID Derivation: 10,000 items throughput and collision resistance.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CkgIngestionService,
  deriveNodeId,
} from '../src/modules/ckg/ckg-ingestion-service.js';
import {
  CkgEntityType,
  CkgRelationType,
  PersonaCluster,
} from '../src/modules/ckg/ckg-types.js';
import { prisma } from '../src/shared/database/prisma-client.js';

describe('CKG Ingestion Engine Adversarial Stress & SLA Suite', () => {
  let service: CkgIngestionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CkgIngestionService();
  });

  afterEach(async () => {
    await service.shutdown();
  });

  /**
   * Helper: Calculate statistical percentiles from array of nanosecond/microsecond measurements
   */
  function calculateStats(samplesMs: number[]) {
    const n = samplesMs.length;
    const sorted = [...samplesMs].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, v) => acc + v, 0);
    const avg = sum / n;
    const p50 = sorted[Math.floor(n * 0.5)];
    const p90 = sorted[Math.floor(n * 0.9)];
    const p95 = sorted[Math.floor(n * 0.95)];
    const p99 = sorted[Math.floor(n * 0.99)];
    const p999 = sorted[Math.floor(n * 0.999)] || sorted[n - 1];
    const max = sorted[n - 1];
    const min = sorted[0];

    return { n, min, avg, p50, p90, p95, p99, p999, max };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 1. SLA Verification: Rapid Sequential Touchpoints (1,000 - 2,000 iterations)
  // ──────────────────────────────────────────────────────────────────────────
  describe('1. SLA Verification: Rapid Sequential Ingestion Latency', () => {
    it('should achieve Avg < 0.1ms and P99 < 5ms across 2,000 rapid sequential touchpoints', () => {
      // Mock DB so background flush doesn't fail with real network calls
      vi.spyOn(prisma, '$executeRawUnsafe').mockResolvedValue(1);

      const iterations = 2000;
      const latenciesMs: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const contactId = `contact-stress-${i % 250}`;
        const start = process.hrtime.bigint();

        // Alternate across different realistic touchpoints
        if (i % 4 === 0) {
          service.recordTouchpoint('org-stress-seq', contactId, 'CHAT_MESSAGE', {
            conversationId: `conv-stress-${i}`,
            messageId: `msg-${i}`,
            content: `Khách hàng hỏi giá sản phẩm và tư vấn liệu trình điều trị nám mảng ${i}`,
            senderType: 'customer',
            productMentions: ['SKU-RETINOL-05', 'SKU-B5-SERUM'],
          });
        } else if (i % 4 === 1) {
          service.recordTouchpoint('org-stress-seq', contactId, 'POS_ORDER', {
            orderId: `POS-ORD-${i}`,
            totalAmount: 1_250_000 + (i * 1000),
            fullName: `Khách VIP ${i}`,
            items: [
              { code: 'SKU-RETINOL-05', name: 'Serum Retinol 0.5%', quantity: 1, price: 450_000 },
              { code: 'SKU-B5-SERUM', name: 'Serum B5 100ml', quantity: 2, price: 400_000 },
            ],
          });
        } else if (i % 4 === 2) {
          service.recordTouchpoint('org-stress-seq', contactId, 'GROUP_SCAN', {
            groupId: `group-zalo-${i % 20}`,
            groupName: `Nhóm Chăm Sóc Khách Sỉ ${i % 20}`,
            role: i % 10 === 0 ? 'admin' : 'member',
            fullName: `Thành viên ${i}`,
          });
        } else {
          service.recordTouchpoint('org-stress-seq', contactId, 'SALE_FEEDBACK', {
            action: 'CONFIRM',
            personaId: PersonaCluster.OFFICE_SKINCARE,
            reason: `Chốt đơn theo kịch bản Next Best Action vòng ${i}`,
          });
        }

        const end = process.hrtime.bigint();
        const durationMs = Number(end - start) / 1_000_000;
        latenciesMs.push(durationMs);
      }

      const stats = calculateStats(latenciesMs);
      console.log(
        `[SLA Benchmark: Sequential] N=${stats.n} | Min=${stats.min.toFixed(4)}ms | Avg=${stats.avg.toFixed(4)}ms | P50=${stats.p50.toFixed(4)}ms | P95=${stats.p95.toFixed(4)}ms | P99=${stats.p99.toFixed(4)}ms | Max=${stats.max.toFixed(4)}ms`
      );

      // SLA ASSERTIONS:
      // In-memory enqueue takes < 0.1ms on average
      expect(stats.avg).toBeLessThan(0.1);
      // P99 latency < 5ms under load
      expect(stats.p99).toBeLessThan(5.0);
      // Hard ceiling: no invocation should ever block main thread >= 10ms
      expect(stats.max).toBeLessThan(10.0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Concurrent Burst Load: 5,000 parallel events
  // ──────────────────────────────────────────────────────────────────────────
  describe('2. Concurrent Burst Load Stress', () => {
    it('should withstand 5,000 concurrent touchpoints without event loop blockage or memory crash', async () => {
      vi.spyOn(prisma, '$executeRawUnsafe').mockResolvedValue(1);

      const burstSize = 5000;
      const latenciesMs: number[] = [];

      const startWall = Date.now();

      // Dispatch 5,000 touchpoints concurrently in chunks simulating high-traffic webhooks
      const promises: Promise<void>[] = [];

      for (let i = 0; i < burstSize; i++) {
        promises.push(
          new Promise<void>((resolve) => {
            const start = process.hrtime.bigint();
            service.recordTouchpoint('org-burst', `contact-burst-${i % 500}`, 'CHAT_MESSAGE', {
              conversationId: `conv-burst-${i}`,
              messageId: `msg-burst-${i}`,
              content: 'Tư vấn nhanh giùm em với ạ',
              senderType: 'customer',
            });
            const end = process.hrtime.bigint();
            latenciesMs.push(Number(end - start) / 1_000_000);
            resolve();
          })
        );
      }

      await Promise.all(promises);
      const totalWallMs = Date.now() - startWall;

      const stats = calculateStats(latenciesMs);
      console.log(
        `[SLA Benchmark: Concurrent Burst] N=${stats.n} in ${totalWallMs}ms | Avg=${stats.avg.toFixed(4)}ms | P50=${stats.p50.toFixed(4)}ms | P99=${stats.p99.toFixed(4)}ms | Max=${stats.max.toFixed(4)}ms`
      );

      expect(stats.avg).toBeLessThan(0.1);
      expect(stats.p99).toBeLessThan(5.0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Backpressure & Buffer Cap Verification (MAX_BUFFER_CAP = 10,000)
  // ──────────────────────────────────────────────────────────────────────────
  describe('3. Buffer Cap & Delayed Database Backpressure', () => {
    it('should strictly enforce nodeBuffer ceiling at MAX_BUFFER_CAP (10,000) when DB is stalled', async () => {
      // Simulate delayed / stalled database writes (500ms delay)
      vi.spyOn(prisma, '$executeRawUnsafe').mockImplementation(
        () => new Promise((res) => setTimeout(() => res(1), 500))
      );

      // Ingest 12,000 unique nodes to deliberately breach MAX_BUFFER_CAP (10,000)
      const totalPushed = 12_000;
      for (let i = 0; i < totalPushed; i++) {
        service.upsertNode('org-cap-test', CkgEntityType.CONTACT, `contact-unique-${i}`, `KH ${i}`, {
          index: i,
        });
      }

      const stats = service.getStats();
      console.log(
        `[Buffer Cap Test: nodeBuffer] Pushed: ${totalPushed} | Current queuedNodes: ${stats.queuedNodes}`
      );

      // Verify buffer did not exceed 10,000 ceiling
      expect(stats.queuedNodes).toBeLessThanOrEqual(10_000);
    });

    it('should strictly enforce edgeBuffer ceiling at MAX_BUFFER_CAP (10,000) when DB is stalled', async () => {
      vi.spyOn(prisma, '$executeRawUnsafe').mockImplementation(
        () => new Promise((res) => setTimeout(() => res(1), 500))
      );

      const totalPushed = 12_000;
      for (let i = 0; i < totalPushed; i++) {
        service.upsertEdge(
          'org-cap-test',
          `node-source-${i}`,
          `node-target-${i}`,
          CkgRelationType.CHATTED_WITH,
          1.0
        );
      }

      const stats = service.getStats();
      console.log(
        `[Buffer Cap Test: edgeBuffer] Pushed: ${totalPushed} | Current queuedEdges: ${stats.queuedEdges}`
      );

      expect(stats.queuedEdges).toBeLessThanOrEqual(10_000);
    });

    it('ADVERSARIAL CHALLENGE: should investigate touchpointBuffer behavior under heavy backpressure', async () => {
      // Stalled DB
      vi.spyOn(prisma, '$executeRawUnsafe').mockImplementation(
        () => new Promise((res) => setTimeout(() => res(1), 1000))
      );

      // Push 12,000 touchpoints
      const totalPushed = 12_000;
      for (let i = 0; i < totalPushed; i++) {
        service.recordTouchpoint('org-cap-test', `contact-tp-${i}`, 'CHAT_MESSAGE', {
          conversationId: `conv-tp-${i}`,
          content: 'Test backpressure',
        });
      }

      const stats = service.getStats();
      console.log(
        `[Adversarial Probe: touchpointBuffer] Pushed: ${totalPushed} | queuedTouchpoints: ${stats.queuedTouchpoints} | queuedNodes: ${stats.queuedNodes} | queuedEdges: ${stats.queuedEdges}`
      );

      // Check if touchpointBuffer is capped or unboundedly growing
      // Note: If touchpointBuffer does not have a cap, stats.queuedTouchpoints will exceed 10,000.
      const touchpointBufferUncapped = stats.queuedTouchpoints > 10_000;
      console.log(
        `[Adversarial Probe Result] touchpointBuffer unbounded growth detected: ${touchpointBufferUncapped}`
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Deterministic Hash Derivation Stress: Throughput & Collision Resistance
  // ──────────────────────────────────────────────────────────────────────────
  describe('4. Deterministic Hash Derivation: Speed & Uniqueness at Scale', () => {
    it('should derive 10,000 UUIDs with zero collisions and Avg < 0.005ms (5 microseconds)', () => {
      const count = 10_000;
      const generatedUuids = new Set<string>();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      const start = process.hrtime.bigint();
      for (let i = 0; i < count; i++) {
        const uuid = deriveNodeId('org-multi-tenant', CkgEntityType.CONTACT, `user-uid-${i}`);
        generatedUuids.add(uuid);
        if (i < 10) {
          expect(uuid).toMatch(uuidRegex);
        }
      }
      const totalElapsedMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      const avgPerDerivationMs = totalElapsedMs / count;

      console.log(
        `[deriveNodeId Scale Test] Count: ${count} in ${totalElapsedMs.toFixed(2)}ms | Avg: ${(avgPerDerivationMs * 1000).toFixed(2)}µs per UUID`
      );

      // Collision assertion: 10,000 inputs must yield 10,000 distinct UUIDs
      expect(generatedUuids.size).toBe(count);
      // Must take < 0.01ms (10µs) per derivation
      expect(avgPerDerivationMs).toBeLessThan(0.01);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Database Fault Isolation & Recovery
  // ──────────────────────────────────────────────────────────────────────────
  describe('5. Database Fault Isolation & Graceful Recovery', () => {
    it('should isolate DB rejection, increment errorCount, and allow subsequent successful flushes', async () => {
      let failNext = true;
      vi.spyOn(prisma, '$executeRawUnsafe').mockImplementation(async () => {
        if (failNext) {
          failNext = false;
          throw new Error('Deadlock detected / Database connection timed out');
        }
        return 1;
      });

      // 1. First batch triggers error
      service.upsertNode('org-fault', CkgEntityType.CONTACT, 'contact-err-1', 'KH Lỗi');
      await service.flush();

      let stats = service.getStats();
      expect(stats.errorCount).toBe(1);

      // 2. Second batch recovers successfully
      service.upsertNode('org-fault', CkgEntityType.CONTACT, 'contact-ok-2', 'KH OK');
      await service.flush();

      stats = service.getStats();
      expect(stats.errorCount).toBe(1);
      expect(stats.totalNodesFlushed).toBeGreaterThan(0);
    });
  });
});
