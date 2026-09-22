/**
 * ckg-confidence.spec.ts — Comprehensive Test Suite for Progressive Confidence Engine (Milestone 3 §R3)
 *
 * Kiểm chứng:
 * 1. Công thức phân tầng lũy tiến (Progressive Confidence Formula):
 *    - Điểm chạm sơ bộ / cold-start: 50% - 65% (PRELIMINARY, Amber).
 *    - Điểm chạm củng cố (POS order >= 1, edge weight >= 1.5): 85% - 95% (CONSOLIDATED, Emerald).
 * 2. Tính đơn điệu nghiêm ngặt (Strict Monotonicity) và bất biến chặn khoảng [0.50, 0.95].
 * 3. Động cơ điều chế thích ứng alpha (Adaptive Epistemic Weighting: 0.80 -> 0.60 -> 0.35 -> 0.15).
 * 4. Bảng chu kỳ bán rã nhận biết tín hiệu (Adaptive Half-Life Matrix: 14d, 30d, 60d, 90d).
 * 5. Phương trình suy giảm thời gian liên tục C(t) = 0.50 + (C_0 - 0.50) * 2^(-Delta_t / T_1/2).
 * 6. Chống suy giảm xuống dưới ngưỡng tiên nghiệm uninformative 0.50 (50%).
 * 7. Benchmark hiệu năng RAM (< 0.05ms).
 */

import { describe, it, expect } from 'vitest';
import {
  CkgConfidenceEngine,
  ckgConfidenceEngine,
  computeAdaptiveAlpha,
  computeGraphEvidenceScore,
  computeSaturationFactor,
  computeCoherenceModulator,
  computeInstantConfidence,
  determineSignalDecayClass,
  applyTimeDecay,
  CONFIDENCE_CONSTANTS,
} from '../src/modules/ckg/ckg-confidence-engine.js';
import {
  ckgConfidenceEngine as engineFromBarrel,
  CkgConfidenceEngine as EngineClassFromBarrel,
} from '../src/modules/ckg/progressive-confidence-engine.js';
import {
  ConfidenceTier,
  PersonaCluster,
  type ICkgEvidenceSubgraph,
} from '../src/modules/ckg/ckg-types.js';

describe('CKG Progressive Confidence Engine Tests (Milestone 3 §R3)', () => {
  const emptySubgraph: ICkgEvidenceSubgraph = {
    nodes: [{ id: 'n1', type: 'CONTACT', label: 'Test Contact' }],
    edges: [],
    metrics: { sharedGroupsCount: 0, totalOrdersCount: 0, homophilyNeighborsCount: 0 },
  };

  const richSubgraph: ICkgEvidenceSubgraph = {
    nodes: [
      { id: 'n1', type: 'CONTACT', label: 'Test Contact' },
      { id: 'n2', type: 'GROUP', label: 'Hội Spa Sỉ' },
      { id: 'n3', type: 'PRODUCT', label: 'Serum B5 100ml' },
    ],
    edges: [
      { source: 'n1', target: 'n2', relation: 'IN_GROUP', weight: 1.5 },
      { source: 'n1', target: 'n3', relation: 'PURCHASED', weight: 1.8 },
    ],
    metrics: { sharedGroupsCount: 3, totalOrdersCount: 2, homophilyNeighborsCount: 8 },
  };

  describe('1. Pure Mathematical Components', () => {
    it('should compute adaptive alpha shifting correctly across data volume', () => {
      // Cold-start (1 touchpoint, 0 orders) -> 0.80
      expect(computeAdaptiveAlpha({ touchpointCount: 1, orderCount: 0 })).toBe(0.80);

      // Low touchpoints (2-3 touchpoints, 0 orders) -> 0.60
      expect(computeAdaptiveAlpha({ touchpointCount: 2, orderCount: 0 })).toBe(0.60);
      expect(computeAdaptiveAlpha({ touchpointCount: 3, orderCount: 0 })).toBe(0.60);

      // Transactional proof (orderCount >= 1) -> 0.35
      expect(computeAdaptiveAlpha({ touchpointCount: 1, orderCount: 1 })).toBe(0.35);

      // High touchpoints (touchpointCount >= 4) -> 0.35
      expect(computeAdaptiveAlpha({ touchpointCount: 5, orderCount: 0 })).toBe(0.35);

      // Human feedback confirmation (edge weight >= 1.5) -> 0.15
      expect(computeAdaptiveAlpha({ humanFeedbackEdgeWeight: 1.8, touchpointCount: 1 })).toBe(0.15);
    });

    it('should compute graph evidence score bounded in [0.0, 1.0]', () => {
      const scoreEmpty = computeGraphEvidenceScore({ subgraph: emptySubgraph });
      expect(scoreEmpty).toBeGreaterThanOrEqual(0.0);
      expect(scoreEmpty).toBeLessThanOrEqual(1.0);

      const scoreRich = computeGraphEvidenceScore({ subgraph: richSubgraph, orderCount: 2, touchpointCount: 4 });
      expect(scoreRich).toBeGreaterThan(scoreEmpty);
      expect(scoreRich).toBeLessThanOrEqual(1.0);
    });

    it('should compute saturation factor sigma as a concave exponential recovery in [0.0, 1.0]', () => {
      // Cold start: 1 touchpoint, 0 orders, 0 spent -> sigma = 0
      const sigmaZero = computeSaturationFactor({ touchpointCount: 1, orderCount: 0, totalSpent: 0 });
      expect(sigmaZero).toBe(0.0);

      // Multi-touchpoint growth
      const sigmaMultiTouch = computeSaturationFactor({ touchpointCount: 5, orderCount: 0, totalSpent: 0 });
      expect(sigmaMultiTouch).toBeGreaterThan(0.5);
      expect(sigmaMultiTouch).toBeLessThan(1.0);

      // POS order arrival: instant high saturation
      const sigmaOrder = computeSaturationFactor({ touchpointCount: 1, orderCount: 1, totalSpent: 2_000_000 });
      expect(sigmaOrder).toBeGreaterThan(0.6);
      expect(sigmaOrder).toBeLessThan(1.0);
    });

    it('should compute coherence modulator rewarding unambiguous rank separation', () => {
      const hybrid = 0.8;
      const clearSeparation = computeCoherenceModulator(hybrid, 0.85, 0.50); // margin = 0.35 >= 0.20
      const ambiguousSeparation = computeCoherenceModulator(hybrid, 0.85, 0.83); // margin = 0.02 < 0.20

      expect(clearSeparation.psi).toBeGreaterThan(ambiguousSeparation.psi);
      expect(clearSeparation.rankMargin).toBe(0.35);
      expect(ambiguousSeparation.rankMargin).toBe(0.02);
    });
  });

  describe('2. Progressive Confidence Formula & Tier Guarantees', () => {
    it('should guarantee Weak signals (1 touchpoint / cold start) land in 50% - 65% (PRELIMINARY, Amber)', () => {
      // Test across multiple cold-start similarities
      for (const sim of [0.45, 0.55, 0.65, 0.85]) {
        const res = ckgConfidenceEngine.evaluateConfidence({
          vectorSimilarity: sim,
          graphEvidenceSubgraph: emptySubgraph,
          orderCount: 0,
          touchpointCount: 1,
        });

        expect(res.score).toBeGreaterThanOrEqual(0.50);
        expect(res.score).toBeLessThanOrEqual(0.65);
        expect(res.percentage).toBeGreaterThanOrEqual(50);
        expect(res.percentage).toBeLessThanOrEqual(65);
        expect(res.tier).toBe(ConfidenceTier.PRELIMINARY);
        expect(res.color).toBe('amber');
      }
    });

    it('should guarantee Strong signals (POS order N_order >= 1, hybrid >= 0.75) jump to 85% - 95% (CONSOLIDATED, Emerald)', () => {
      const res = ckgConfidenceEngine.evaluateConfidence({
        vectorSimilarity: 0.85,
        secondVectorSimilarity: 0.60,
        graphEvidenceSubgraph: richSubgraph,
        orderCount: 2,
        totalSpent: 3_500_000,
        touchpointCount: 4,
      });

      expect(res.score).toBeGreaterThanOrEqual(0.85);
      expect(res.score).toBeLessThanOrEqual(0.95);
      expect(res.percentage).toBeGreaterThanOrEqual(85);
      expect(res.percentage).toBeLessThanOrEqual(95);
      expect(res.tier).toBe(ConfidenceTier.CONSOLIDATED);
      expect(res.color).toBe('emerald');
    });

    it('should guarantee Human feedback confirmation (edge weight >= 1.5) achieves 85% - 95% (CONSOLIDATED, Emerald)', () => {
      const res = ckgConfidenceEngine.evaluateConfidence({
        vectorSimilarity: 0.75,
        graphEvidenceSubgraph: emptySubgraph,
        humanFeedbackEdgeWeight: 1.8,
      });

      expect(res.score).toBeGreaterThanOrEqual(0.88);
      expect(res.score).toBeLessThanOrEqual(0.95);
      expect(res.percentage).toBeGreaterThanOrEqual(88);
      expect(res.percentage).toBeLessThanOrEqual(95);
      expect(res.tier).toBe(ConfidenceTier.CONSOLIDATED);
      expect(res.color).toBe('emerald');
    });

    it('should strictly obey range invariance: 0.50 <= C <= 0.95 under all inputs', () => {
      // Extremely low input
      const lowRes = ckgConfidenceEngine.evaluateConfidence({
        vectorSimilarity: 0.0,
        graphEvidenceSubgraph: emptySubgraph,
        orderCount: 0,
        touchpointCount: 0,
      });
      expect(lowRes.score).toBe(0.50);
      expect(lowRes.percentage).toBe(50);

      // Extremely high input
      const highRes = ckgConfidenceEngine.evaluateConfidence({
        vectorSimilarity: 1.0,
        graphEvidenceSubgraph: richSubgraph,
        orderCount: 100,
        totalSpent: 500_000_000,
        touchpointCount: 50,
        humanFeedbackEdgeWeight: 2.0,
      });
      expect(highRes.score).toBe(0.95);
      expect(highRes.percentage).toBe(95);
    });

    it('should demonstrate strict monotonicity: increasing order count never decreases confidence', () => {
      const scores: number[] = [];
      for (let orders = 0; orders <= 5; orders++) {
        const res = ckgConfidenceEngine.evaluateConfidence({
          vectorSimilarity: 0.70,
          graphEvidenceSubgraph: emptySubgraph,
          orderCount: orders,
          touchpointCount: 2 + orders,
        });
        scores.push(res.score);
      }

      for (let i = 1; i < scores.length; i++) {
        expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]);
      }
    });
  });

  describe('3. Signal-Aware Adaptive Half-Life & Time Decay Model', () => {
    it('should map signal classes to correct adaptive half-lives', () => {
      // Human confirmed -> 90 days
      expect(determineSignalDecayClass({ humanFeedbackEdgeWeight: 1.8 })).toEqual({
        halfLifeDays: 90,
        signalClass: 'HUMAN_CONFIRMED',
      });

      // Transactional (orders >= 1 or spent >= 1M) -> 60 days
      expect(determineSignalDecayClass({ orderCount: 1 })).toEqual({
        halfLifeDays: 60,
        signalClass: 'TRANSACTIONAL',
      });
      expect(determineSignalDecayClass({ totalSpent: 1_200_000 })).toEqual({
        halfLifeDays: 60,
        signalClass: 'TRANSACTIONAL',
      });

      // Multi-touchpoint (touchpointCount >= 3) -> 30 days
      expect(determineSignalDecayClass({ touchpointCount: 3 })).toEqual({
        halfLifeDays: 30,
        signalClass: 'MULTI_TOUCH',
      });

      // Weak/cold-start -> 14 days
      expect(determineSignalDecayClass({ touchpointCount: 1 })).toEqual({
        halfLifeDays: 14,
        signalClass: 'WEAK_COLD_START',
      });
    });

    it('should decay exactly halfway to base prior 0.50 at Delta_t = T_1/2', () => {
      const instantScore = 0.90;
      const halfLifeDays = 60;
      const refDate = new Date('2026-09-16T12:00:00Z');
      const lastEventAt = new Date(refDate.getTime() - 60 * 24 * 60 * 60 * 1000); // exactly 60 days ago

      const decay = applyTimeDecay({
        instantScore,
        lastEventAt,
        halfLifeDays,
        signalClass: 'TRANSACTIONAL',
        referenceDate: refDate,
      });

      // C(60) = 0.50 + (0.90 - 0.50) * 2^(-60/60) = 0.50 + 0.40 * 0.5 = 0.70
      expect(decay.elapsedDays).toBe(60);
      expect(decay.decayFactor).toBe(0.5);
      expect(decay.finalScore).toBeCloseTo(0.70, 2);
      expect(decay.isDecayed).toBe(true);
    });

    it('should decay to 25% of excess at Delta_t = 2 * T_1/2', () => {
      const instantScore = 0.90;
      const halfLifeDays = 30;
      const refDate = new Date('2026-09-16T12:00:00Z');
      const lastEventAt = new Date(refDate.getTime() - 60 * 24 * 60 * 60 * 1000); // 2 half-lives

      const decay = applyTimeDecay({
        instantScore,
        lastEventAt,
        halfLifeDays,
        signalClass: 'MULTI_TOUCH',
        referenceDate: refDate,
      });

      // C(60) = 0.50 + (0.90 - 0.50) * 2^(-2) = 0.50 + 0.40 * 0.25 = 0.60
      expect(decay.decayFactor).toBe(0.25);
      expect(decay.finalScore).toBeCloseTo(0.60, 2);
    });

    it('should never decay below uninformative baseline 0.50 even after 1000 days', () => {
      const instantScore = 0.95;
      const halfLifeDays = 14;
      const refDate = new Date('2026-09-16T12:00:00Z');
      const lastEventAt = new Date(refDate.getTime() - 1000 * 24 * 60 * 60 * 1000); // 1000 days ago

      const decay = applyTimeDecay({
        instantScore,
        lastEventAt,
        halfLifeDays,
        signalClass: 'WEAK_COLD_START',
        referenceDate: refDate,
      });

      expect(decay.finalScore).toBeGreaterThanOrEqual(0.50);
      expect(decay.finalScore).toBeCloseTo(0.50, 1);
    });

    it('should not decay when Delta_t = 0 (same day event)', () => {
      const instantScore = 0.92;
      const refDate = new Date('2026-09-16T12:00:00Z');

      const decay = applyTimeDecay({
        instantScore,
        lastEventAt: refDate,
        halfLifeDays: 60,
        signalClass: 'TRANSACTIONAL',
        referenceDate: refDate,
      });

      expect(decay.elapsedDays).toBe(0);
      expect(decay.decayFactor).toBe(1.0);
      expect(decay.finalScore).toBe(instantScore);
      expect(decay.isDecayed).toBe(false);
    });

    it('should be robust against future dates (clock skew, elapsed < 0)', () => {
      const instantScore = 0.88;
      const refDate = new Date('2026-09-16T12:00:00Z');
      const futureDate = new Date('2026-09-20T12:00:00Z'); // 4 days in future

      const decay = applyTimeDecay({
        instantScore,
        lastEventAt: futureDate,
        halfLifeDays: 60,
        signalClass: 'TRANSACTIONAL',
        referenceDate: refDate,
      });

      expect(decay.elapsedDays).toBe(0);
      expect(decay.decayFactor).toBe(1.0);
      expect(decay.finalScore).toBe(instantScore);
    });
  });

  describe('4. In-Memory Performance Benchmark', () => {
    it('should evaluate confidence in < 0.05ms per call in memory', () => {
      const iterations = 5000;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        ckgConfidenceEngine.evaluateConfidence({
          vectorSimilarity: 0.82,
          secondVectorSimilarity: 0.61,
          graphEvidenceSubgraph: richSubgraph,
          orderCount: 2,
          totalSpent: 2_500_000,
          touchpointCount: 4,
          lastEventAt: '2026-09-01T00:00:00Z',
        });
      }

      const totalMs = performance.now() - start;
      const avgMs = totalMs / iterations;

      expect(avgMs).toBeLessThan(0.05); // Sub-0.05ms latency SLA
    });
  });

  describe('5. Barrel Re-export Contract', () => {
    it('should correctly re-export through progressive-confidence-engine barrel', () => {
      expect(engineFromBarrel).toBeDefined();
      expect(EngineClassFromBarrel).toBeDefined();
      expect(engineFromBarrel).toBeInstanceOf(EngineClassFromBarrel);
    });
  });
});

