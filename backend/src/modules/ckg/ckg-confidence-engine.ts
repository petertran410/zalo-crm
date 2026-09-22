/**
 * ckg-confidence-engine.ts — Progressive Confidence Engine & Half-Life Decay Engine (Milestone 3 §R3)
 *
 * Triển khai:
 * 1. Công thức tính độ tin cậy lũy tiến (Progressive Confidence Formula):
 *    - Điểm sơ bộ (1 điểm chạm / khách mới / cold-start): 50% - 65% (PRELIMINARY, Amber).
 *    - Điểm củng cố (đơn hàng POS N_order >= 1, xác nhận Sale W_feedback >= 1.5): 85% - 95% (CONSOLIDATED, Emerald).
 * 2. Động cơ dung hợp thích ứng đa tín hiệu (Adaptive Epistemic Weighting alpha):
 *    - S_hybrid = alpha * S_vector + (1 - alpha) * S_graph.
 *    - alpha thích ứng từ 0.80 (cold start) xuống 0.35 (giao dịch thực tế) và 0.15 (con người xác nhận).
 * 3. Mô hình bão hòa tiệm cận phi tuyến (Nonlinear Asymptotic Saturation sigma):
 *    - sigma(N_touch, N_order, V_spent) = 1 - exp(-[(N_touch-1)/3.5 + N_order/1.0 + min(1, V_spent/5tr)/2.0]).
 * 4. Mô hình suy giảm bán rã nhận biết tín hiệu (Signal-Aware Half-Life Time Decay Model):
 *    - C(t) = 0.50 + (C_0 - 0.50) * 2^(-Delta_t / T_half).
 *    - T_half in {14d, 30d, 60d, 90d} tương ứng với độ bền vững của từng nhóm tín hiệu.
 *    - Chống suy giảm xuống dưới ngưỡng uninformative prior 0.50 (50%).
 */

import {
  ConfidenceTier,
  PersonaCluster,
  type ICkgEvidenceSubgraph,
  type IConfidenceEngineInput,
  type IConfidenceScoreResult,
  type IConfidenceComponents,
  type ITimeDecayMetadata,
  type SignalDecayClass,
} from './ckg-types.js';

// ── 1. Hằng Số Định Chuẩn Toán Học (Calibrated Mathematical Constants) ─────────

export const CONFIDENCE_CONSTANTS = {
  BASE_PRIOR: 0.50,             // Sàn xác suất tiên nghiệm uninformative (50%)
  MAX_CONFIDENCE: 0.95,         // Trần xác suất nhận thức khiêm tốn (95%)
  PRELIM_MAX_CAP: 0.65,         // Trần tối đa cho khách hàng 1 điểm chạm (65%)
  CONSOLIDATED_THRESHOLD: 0.85, // Ngưỡng chuyển sang phân tầng CONSOLIDATED (85%)
  
  // Trọng số S_graph mặc định
  WEIGHT_PRODUCT: 0.55,
  WEIGHT_GROUP: 0.30,
  WEIGHT_INTERACTION: 0.15,

  // Thời hằng bão hòa (tau)
  TAU_TOUCH: 3.5,
  TAU_ORDER: 1.0,
  TAU_VALUE: 2.0,
  MAX_VALUE_SCALE: 5_000_000,   // 5 triệu VND chuẩn hóa

  // Chu kỳ bán rã theo lớp tín hiệu (ngày)
  HALF_LIFE_HUMAN: 90,          // Xác nhận của Sale
  HALF_LIFE_TRANSACTION: 60,    // Đơn hàng POS
  HALF_LIFE_MULTI_TOUCH: 30,    // Đa điểm chạm nhóm/chat
  HALF_LIFE_COLD_START: 14,     // Điểm chạm đơn lẻ / mới
};

// ── 2. Các Hàm Tính Toán Thành Phần Độc Lập (Pure Helper Functions) ───────────

/**
 * Tính trọng số thích ứng alpha giữa Vector Semantic và Đồ thị CKG.
 */
export function computeAdaptiveAlpha(args: {
  humanFeedbackEdgeWeight?: number;
  orderCount?: number;
  touchpointCount?: number;
}): number {
  const { humanFeedbackEdgeWeight = 1.0, orderCount = 0, touchpointCount = 1 } = args;

  if (humanFeedbackEdgeWeight >= 1.5) {
    return 0.15; // 85% dựa vào bảo chứng của nhân viên Sale
  }
  if (orderCount >= 1 || touchpointCount >= 4) {
    return 0.35; // 65% dựa vào bằng chứng giao dịch & đồ thị thực tế
  }
  if (touchpointCount >= 2) {
    return 0.60; // 60% vector, 40% đồ thị
  }
  return 0.80; // Cold-start: 80% định hướng bởi không gian vector
}

/**
 * Tính điểm bằng chứng đồ thị S_graph từ subgraph 2-hop.
 */
export function computeGraphEvidenceScore(args: {
  subgraph: ICkgEvidenceSubgraph;
  orderCount?: number;
  touchpointCount?: number;
  targetPersonaId?: PersonaCluster;
}): number {
  const { subgraph, orderCount = 0, touchpointCount = 1, targetPersonaId } = args;
  const metrics = subgraph.metrics || {
    sharedGroupsCount: 0,
    totalOrdersCount: 0,
    homophilyNeighborsCount: 0,
  };

  const effectiveOrderCount = Math.max(orderCount, metrics.totalOrdersCount || 0);

  // 1. S_product: Đánh giá bằng chứng sản phẩm & đơn hàng
  let sProduct = 0.40; // Tiên nghiệm trung tính
  if (effectiveOrderCount > 0) {
    sProduct = Math.min(1.0, 0.50 + 0.25 * effectiveOrderCount);
  }

  // 2. S_group: Đánh giá quan hệ nhóm & homophily lân cận
  const sharedGroups = metrics.sharedGroupsCount || 0;
  const neighbors = metrics.homophilyNeighborsCount || 0;
  let sGroup = 0.30;
  if (sharedGroups > 0) {
    sGroup = Math.min(1.0, 0.50 + 0.15 * Math.min(3, sharedGroups) + 0.05 * Math.min(6, neighbors));
  }

  // 3. S_interaction: Đánh giá tần suất tương tác
  const sInteraction = Math.min(1.0, 0.40 + 0.10 * Math.min(6, touchpointCount));

  const sGraph =
    CONFIDENCE_CONSTANTS.WEIGHT_PRODUCT * sProduct +
    CONFIDENCE_CONSTANTS.WEIGHT_GROUP * sGroup +
    CONFIDENCE_CONSTANTS.WEIGHT_INTERACTION * sInteraction;

  return Math.max(0.0, Math.min(1.0, Number(sGraph.toFixed(4))));
}

/**
 * Tính hệ số bão hòa tiệm cận phi tuyến sigma(N_touch, N_order, V_spent) in [0.0, 1.0].
 */
export function computeSaturationFactor(args: {
  touchpointCount?: number;
  orderCount?: number;
  totalSpent?: number;
}): number {
  const { touchpointCount = 1, orderCount = 0, totalSpent = 0 } = args;

  const touchTerm = Math.max(0, touchpointCount - 1) / CONFIDENCE_CONSTANTS.TAU_TOUCH;
  const orderTerm = orderCount / CONFIDENCE_CONSTANTS.TAU_ORDER;
  const valueRatio = Math.min(1.0, Math.max(0, totalSpent) / CONFIDENCE_CONSTANTS.MAX_VALUE_SCALE);
  const valueTerm = valueRatio / CONFIDENCE_CONSTANTS.TAU_VALUE;

  const exponent = touchTerm + orderTerm + valueTerm;
  const sigma = 1.0 - Math.exp(-exponent);

  return Math.max(0.0, Math.min(1.0, Number(sigma.toFixed(4))));
}

/**
 * Tính hệ số điều chế gắn kết phân cụm psi(S_hybrid, Delta_S_rank).
 */
export function computeCoherenceModulator(
  hybridScore: number,
  vectorSimilarity: number,
  secondVectorSimilarity?: number
): { psi: number; rankMargin: number } {
  const rankMargin =
    secondVectorSimilarity !== undefined
      ? Math.max(0.0, vectorSimilarity - secondVectorSimilarity)
      : 0.15; // Giả định biên lành mạnh nếu không có second sim

  const marginFactor = Math.min(1.0, rankMargin / 0.20);
  const psi = hybridScore * (0.70 + 0.30 * marginFactor);

  return {
    psi: Math.max(0.0, Math.min(1.0, Number(psi.toFixed(4)))),
    rankMargin: Number(rankMargin.toFixed(4)),
  };
}

/**
 * Tính điểm tin cậy tức thời (Instant Confidence C_instant) trước khi áp dụng suy giảm thời gian.
 */
export function computeInstantConfidence(input: IConfidenceEngineInput): {
  instantScore: number;
  components: IConfidenceComponents;
} {
  const {
    vectorSimilarity,
    secondVectorSimilarity,
    graphEvidenceSubgraph,
    orderCount = 0,
    totalSpent = 0,
    touchpointCount = 1,
    humanFeedbackEdgeWeight = 1.0,
    targetPersonaId,
  } = input;

  const sVector = Math.max(0.0, Math.min(1.0, vectorSimilarity));
  const sGraph = computeGraphEvidenceScore({
    subgraph: graphEvidenceSubgraph,
    orderCount,
    touchpointCount,
    targetPersonaId,
  });

  const alpha = computeAdaptiveAlpha({
    humanFeedbackEdgeWeight,
    orderCount,
    touchpointCount,
  });

  const sHybrid = Math.max(0.0, Math.min(1.0, alpha * sVector + (1.0 - alpha) * sGraph));
  const sigma = computeSaturationFactor({ touchpointCount, orderCount, totalSpent });
  const { psi, rankMargin } = computeCoherenceModulator(sHybrid, sVector, secondVectorSimilarity);

  let instantScore: number;
  let preliminaryComponent: number;
  let evidenceComponent: number;

  // ── Nhánh 1: Nhân viên Sale xác nhận bằng chứng đồ thị (Human-in-the-loop) ─────
  if (humanFeedbackEdgeWeight >= 1.5) {
    const feedbackBoost = Math.min(1.0, (humanFeedbackEdgeWeight - 1.5) / 0.30);
    instantScore = 0.85 + 0.10 * Math.min(1.0, 0.60 * feedbackBoost + 0.40 * sHybrid);
    preliminaryComponent = 0.15 * sHybrid;
    evidenceComponent = instantScore - CONFIDENCE_CONSTANTS.BASE_PRIOR - preliminaryComponent;
  } else {
    // ── Nhánh 2: Thuật toán dung hợp tiến bộ đa tín hiệu ────────────────────────
    preliminaryComponent = 0.15 * sHybrid;
    evidenceComponent = 0.30 * sigma * psi;
    instantScore = CONFIDENCE_CONSTANTS.BASE_PRIOR + preliminaryComponent + evidenceComponent;

    // Bảo chứng Giao dịch: Có đơn hàng thực tế và độ khớp cao -> nhảy vọt CONSOLIDATED
    if (orderCount >= 5) {
      const repeatOrderBoost = 0.90 + 0.05 * Math.min(1.0, (orderCount - 5) / 10);
      instantScore = Math.max(instantScore, repeatOrderBoost);
    } else if (orderCount >= 1 && sHybrid >= 0.70) {
      const orderBoost = 0.85 + 0.10 * Math.min(1.0, (sHybrid - 0.70) / 0.25);
      instantScore = Math.max(instantScore, orderBoost);
    }

    // Bảo chứng Cold-start: Khách 1 điểm chạm, chưa có đơn hàng -> chặn trần 65%
    if (touchpointCount <= 1 && orderCount === 0) {
      if (sVector <= 0 && touchpointCount === 0) {
        instantScore = CONFIDENCE_CONSTANTS.BASE_PRIOR;
        preliminaryComponent = 0;
        evidenceComponent = 0;
      } else {
        instantScore = Math.min(CONFIDENCE_CONSTANTS.PRELIM_MAX_CAP, Math.max(CONFIDENCE_CONSTANTS.BASE_PRIOR, instantScore));
      }
    }
  }

  // Clamping toàn cục: [0.50, 0.95]
  instantScore = Math.min(
    CONFIDENCE_CONSTANTS.MAX_CONFIDENCE,
    Math.max(CONFIDENCE_CONSTANTS.BASE_PRIOR, Number(instantScore.toFixed(4)))
  );

  const components: IConfidenceComponents = {
    basePrior: CONFIDENCE_CONSTANTS.BASE_PRIOR,
    preliminaryComponent: Number(preliminaryComponent.toFixed(4)),
    saturationFactor: sigma,
    coherenceFactor: psi,
    evidenceComponent: Number(evidenceComponent.toFixed(4)),
    instantScore,
    alpha: Number(alpha.toFixed(2)),
    hybridScore: Number(sHybrid.toFixed(4)),
    graphEvidenceScore: sGraph,
    vectorSimilarity: Number(sVector.toFixed(4)),
    rankSeparationMargin: rankMargin,
  };

  return { instantScore, components };
}

/**
 * Xác định chu kỳ bán rã thích ứng (Adaptive Half-Life T_1/2) theo lớp tín hiệu.
 */
export function determineSignalDecayClass(args: {
  humanFeedbackEdgeWeight?: number;
  orderCount?: number;
  totalSpent?: number;
  touchpointCount?: number;
}): { halfLifeDays: number; signalClass: SignalDecayClass } {
  const {
    humanFeedbackEdgeWeight = 1.0,
    orderCount = 0,
    totalSpent = 0,
    touchpointCount = 1,
  } = args;

  if (humanFeedbackEdgeWeight >= 1.5) {
    return { halfLifeDays: CONFIDENCE_CONSTANTS.HALF_LIFE_HUMAN, signalClass: 'HUMAN_CONFIRMED' };
  }
  if (orderCount >= 3 || totalSpent >= 5_000_000) {
    return { halfLifeDays: 180, signalClass: 'TRANSACTIONAL' };
  }
  if (orderCount >= 1 || totalSpent >= 1_000_000) {
    return { halfLifeDays: CONFIDENCE_CONSTANTS.HALF_LIFE_TRANSACTION, signalClass: 'TRANSACTIONAL' };
  }
  if (touchpointCount >= 3) {
    return { halfLifeDays: CONFIDENCE_CONSTANTS.HALF_LIFE_MULTI_TOUCH, signalClass: 'MULTI_TOUCH' };
  }
  return { halfLifeDays: CONFIDENCE_CONSTANTS.HALF_LIFE_COLD_START, signalClass: 'WEAK_COLD_START' };
}

/**
 * Áp dụng mô hình bán rã thời gian: C(t) = C_prior + (C_0 - C_prior) * 2^(-Delta_t / T_1/2).
 */
export function applyTimeDecay(args: {
  instantScore: number;
  lastEventAt?: Date | string | null;
  halfLifeDays: number;
  signalClass: SignalDecayClass;
  referenceDate?: Date;
}): ITimeDecayMetadata {
  const { instantScore, lastEventAt, halfLifeDays, signalClass, referenceDate } = args;

  const now = referenceDate || new Date();
  const eventDate = lastEventAt ? new Date(lastEventAt) : now;

  // Tính số ngày trôi qua (clamp không âm chống clock-skew)
  const elapsedMs = Math.max(0, now.getTime() - eventDate.getTime());
  const elapsedDays = Number((elapsedMs / (1000 * 60 * 60 * 24)).toFixed(2));

  // decayFactor = 2^(-Delta_t / T_half)
  const decayFactor = Math.pow(2, -elapsedDays / halfLifeDays);

  // Suy giảm hướng về tiên nghiệm 0.50
  const cPrior = CONFIDENCE_CONSTANTS.BASE_PRIOR;
  const rawDecayed = cPrior + (instantScore - cPrior) * decayFactor;

  // Clamping an toàn trong [0.50, 0.95]
  const finalScore = Math.min(
    CONFIDENCE_CONSTANTS.MAX_CONFIDENCE,
    Math.max(cPrior, Number(rawDecayed.toFixed(4)))
  );

  const isDecayed = elapsedDays > 1.0 && instantScore - finalScore >= 0.01;

  return {
    lastEventAt: eventDate.toISOString(),
    evaluatedAt: now.toISOString(),
    elapsedDays,
    halfLifeDays,
    signalClass,
    decayFactor: Number(decayFactor.toFixed(4)),
    isDecayed,
    rawDecayedScore: Number(rawDecayed.toFixed(4)),
    finalScore,
  };
}

// ── 3. Lớp Dịch Vụ Chính (Progressive Confidence Engine Service) ───────────────

export class CkgConfidenceEngine {
  /**
   * Đánh giá toàn diện độ tin cậy lũy tiến và suy giảm thời gian cho khách hàng.
   *
   * @param input Dữ liệu đầu vào gồm vector sim, subgraph 2-hop, đơn hàng và thời gian
   * @returns Kết quả độ tin cậy đầy đủ (score, percentage, tier, color, components, decay)
   */
  public evaluateConfidence(input: IConfidenceEngineInput): IConfidenceScoreResult {
    // 1. Tính độ tin cậy tức thời C_instant
    const { instantScore, components } = computeInstantConfidence(input);

    // 2. Xác định chu kỳ bán rã thích ứng T_1/2
    const { halfLifeDays, signalClass } = determineSignalDecayClass({
      humanFeedbackEdgeWeight: input.humanFeedbackEdgeWeight,
      orderCount: input.orderCount,
      totalSpent: input.totalSpent,
      touchpointCount: input.touchpointCount,
    });

    // 3. Áp dụng suy giảm thời gian theo lastEventAt
    const timeDecay = applyTimeDecay({
      instantScore,
      lastEventAt: input.lastEventAt,
      halfLifeDays,
      signalClass,
      referenceDate: input.referenceDate,
    });

    const finalScore = timeDecay.finalScore;
    const roundedScore = Number(finalScore.toFixed(2));
    const percentage = Math.round(roundedScore * 100);

    const isConsolidated = roundedScore >= CONFIDENCE_CONSTANTS.CONSOLIDATED_THRESHOLD;
    const tier = isConsolidated ? ConfidenceTier.CONSOLIDATED : ConfidenceTier.PRELIMINARY;
    const color = isConsolidated ? 'emerald' : 'amber';

    return {
      score: roundedScore,
      percentage,
      tier,
      color,
      components,
      timeDecay,
    };
  }

  /**
   * Tính nhanh độ tin cậy tức thời không tính suy giảm (dùng cho preview hoặc benchmark).
   */
  public evaluateInstantConfidence(input: IConfidenceEngineInput): {
    score: number;
    percentage: number;
    tier: ConfidenceTier;
    color: 'amber' | 'emerald';
    components: IConfidenceComponents;
  } {
    const { instantScore, components } = computeInstantConfidence(input);
    const roundedScore = Number(instantScore.toFixed(2));
    const percentage = Math.round(roundedScore * 100);
    const isConsolidated = roundedScore >= CONFIDENCE_CONSTANTS.CONSOLIDATED_THRESHOLD;

    return {
      score: roundedScore,
      percentage,
      tier: isConsolidated ? ConfidenceTier.CONSOLIDATED : ConfidenceTier.PRELIMINARY,
      color: isConsolidated ? 'emerald' : 'amber',
      components,
    };
  }
}

// Singleton Instance phục vụ toàn bộ ứng dụng
export const ckgConfidenceEngine = new CkgConfidenceEngine();
