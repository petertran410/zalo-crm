/**
 * ckg-rag-synthesizer.spec.ts — Test Suite for LLM Graph RAG Synthesizer & 24h Cache (Milestone 3 §R3)
 *
 * Kiểm chứng:
 * 1. Đóng gói ngữ cảnh Graph RAG Prompt (<1.200 tokens) tích hợp 2-hop subgraph, centroid lookalike, POS.
 * 2. Bộ phân giải JSON phòng vệ (parseLlmStructuredJson): hỗ trợ Markdown fence (```json ... ```), raw JSON và regex fallback.
 * 3. Động cơ dự phòng luật mẫu (Zero-Failure Resilient Fallback Engine) cho 5 cụm Persona kinh điển.
 * 4. Thay thế biến động {{name}}, {{voucher}}, {{products}} trong kịch bản NBA.
 * 5. Tích hợp Gemini native fetch (Mocked) và tự động kích hoạt Fallback khi lỗi/quá tải.
 * 6. Vòng đời cache 24h (validUntil = NOW() + 24h) và cơ chế lưu vết PostgreSQL (inferred_customer_profiles).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CkgRagSynthesizer,
  ckgRagSynthesizer,
  buildCkgRagPrompt,
  parseLlmStructuredJson,
  RESILIENT_FALLBACK_TEMPLATES,
} from '../src/modules/ckg/ckg-rag-synthesizer.js';
import {
  ckgRagSynthesizer as synthesizerFromBarrel,
  CkgRagSynthesizer as SynthesizerClassFromBarrel,
} from '../src/modules/ckg/llm-graph-rag-synthesizer.js';
import {
  PersonaCluster,
  ConfidenceTier,
  type ISynthesizerInput,
  type ICkgEvidenceSubgraph,
} from '../src/modules/ckg/ckg-types.js';
import { prisma } from '../src/shared/database/prisma-client.js';

describe('CKG LLM Graph RAG Synthesizer Tests (Milestone 3 §R3)', () => {
  const sampleEvidenceSubgraph: ICkgEvidenceSubgraph = {
    nodes: [
      { id: 'n1', type: 'CONTACT', label: 'Nguyễn Thị Lan' },
      { id: 'n2', type: 'GROUP', label: 'Hội Sỉ Mỹ Phẩm Miền Bắc' },
      { id: 'n3', type: 'PRODUCT', label: 'Serum B5 Phục Hồi 100ml' },
    ],
    edges: [
      { source: 'n1', target: 'n2', relation: 'IN_GROUP', weight: 1.5 },
      { source: 'n1', target: 'n3', relation: 'PURCHASED', weight: 1.8 },
    ],
    metrics: {
      sharedGroupsCount: 2,
      totalOrdersCount: 2,
      homophilyNeighborsCount: 14,
    },
  };

  const sampleInput: ISynthesizerInput = {
    orgId: 'org-test-123',
    contactId: 'contact-test-456',
    contact: {
      fullName: 'Nguyễn Thị Lan',
      crmName: 'Lan Spa Skincare',
      phone: '0987123456',
      source: 'Zalo Group',
      tags: ['chu_spa', 'quan_tam_b5'],
    },
    evidenceSubgraph: sampleEvidenceSubgraph,
    lookalikeEval: {
      topPersonaId: PersonaCluster.WHOLESALE_BUYER,
      topPersonaLabel: 'Chủ shop sỉ mỹ phẩm / Salon Spa',
      clusterBadge: 'Sỉ lớn',
      vectorSimilarity: 0.8842,
      graphEvidenceScore: 0.85,
      hybridScore: 0.86,
      confidenceScore: 0.92,
      confidencePercentage: 92,
      confidenceTier: ConfidenceTier.CONSOLIDATED,
      color: 'emerald',
      allMatches: [],
    },
    confidence: {
      score: 0.92,
      percentage: 92,
      tier: ConfidenceTier.CONSOLIDATED,
      color: 'emerald',
    },
    orderHistory: {
      totalOrders: 2,
      totalSpent: 3_450_000,
      recentItems: ['Serum B5 Phục Hồi 100ml'],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Graph RAG Context Serialization (buildCkgRagPrompt)', () => {
    it('should build concise prompt strictly under token budget (< 1,200 tokens / ~5,000 chars)', () => {
      const prompt = buildCkgRagPrompt(sampleInput);

      expect(prompt.length).toBeLessThan(5000); // 1 token ~ 3-4 chars in Vietnamese/English
      expect(prompt).toContain('Nguyễn Thị Lan');
      expect(prompt).toContain('Chủ shop sỉ mỹ phẩm / Salon Spa (WHOLESALE_BUYER)');
      expect(prompt).toContain('Hội Sỉ Mỹ Phẩm Miền Bắc');
      expect(prompt).toContain('Serum B5 Phục Hồi 100ml');
      expect(prompt).toContain('3.450.000 đ');
      expect(prompt).toContain('"headline"');
      expect(prompt).toContain('"talkingPoints"');
      expect(prompt).toContain('"nextBestAction"');
    });

    it('should handle defensive defaults when contact has empty metadata or no orders', () => {
      const emptyInput: ISynthesizerInput = {
        orgId: 'org-1',
        contactId: 'c-1',
        contact: {},
        evidenceSubgraph: {
          nodes: [],
          edges: [],
          metrics: { sharedGroupsCount: 0, totalOrdersCount: 0, homophilyNeighborsCount: 0 },
        },
        lookalikeEval: {
          topPersonaId: PersonaCluster.TRIAL_EXPLORER,
          topPersonaLabel: 'Khách hàng mới chuộng set mini',
          clusterBadge: 'Dùng thử',
          vectorSimilarity: 0.50,
          graphEvidenceScore: 0.40,
          hybridScore: 0.45,
          confidenceScore: 0.55,
          confidencePercentage: 55,
          confidenceTier: ConfidenceTier.PRELIMINARY,
          color: 'amber',
          allMatches: [],
        },
        confidence: {
          score: 0.55,
          percentage: 55,
          tier: ConfidenceTier.PRELIMINARY,
          color: 'amber',
        },
      };

      const prompt = buildCkgRagPrompt(emptyInput);
      expect(prompt).toContain('Khách hàng');
      expect(prompt).toContain('Chưa có');
      expect(prompt).toContain('Chưa ghi nhận nhóm Zalo trực tiếp');
      expect(prompt).toContain('Chưa có đơn hàng POS đã thanh toán');
    });
  });

  describe('2. Defensive JSON Parser (parseLlmStructuredJson)', () => {
    const validJsonObj = {
      headline: 'Chủ tiệm spa tiềm năng cao tại Hà Nội tìm kiếm nguồn hàng serum B5.',
      synthesizedSummary: '- Khách là chủ cơ sở làm đẹp.\n- Nhập 2 đơn mẫu B5.\n- Khớp cao với mạng lưới sỉ.',
      talkingPoints: [
        'Hỏi thăm hiệu quả đợt mẫu đã nhận.',
        'Giới thiệu chính sách chiết khấu bậc thang.',
        'Tặng voucher SI_VIP_10 đơn đầu tiên.',
      ],
      voucherRecommendation: {
        code: 'SI_VIP_10',
        rationale: 'Chiết khấu thêm 10% cho đơn từ 5 triệu.',
      },
      riskAssessment: {
        churnRisk: 'LOW',
        priceSensitivity: 'MEDIUM',
        notes: 'Quan tâm giấy tờ công bố và nguồn hàng ổn định.',
      },
      nextBestAction: {
        actionType: 'SEND_ZALO_PROPOSAL',
        title: 'Gửi bảng chiết khấu đại lý bậc thang',
        scriptText: 'Em chào chị Lan ạ! Em gửi chị bảng giá sỉ...',
        suggestedProducts: ['Serum B5 Phục Hồi 100ml'],
        suggestedVoucher: 'SI_VIP_10',
      },
      predictedNeeds: ['Bảng giá sỉ tháng 9', 'Chính sách chiết khấu'],
    };

    it('should parse clean JSON directly', () => {
      const parsed = parseLlmStructuredJson(JSON.stringify(validJsonObj));
      expect(parsed).not.toBeNull();
      expect(parsed?.headline).toBe(validJsonObj.headline);
      expect(parsed?.talkingPoints.length).toBe(3);
      expect(parsed?.voucherRecommendation.code).toBe('SI_VIP_10');
    });

    it('should parse JSON wrapped in Markdown ```json ... ``` code fence', () => {
      const wrapped = `Dưới đây là kết quả phân tích chân dung:\n\`\`\`json\n${JSON.stringify(validJsonObj, null, 2)}\n\`\`\``;
      const parsed = parseLlmStructuredJson(wrapped);
      expect(parsed).not.toBeNull();
      expect(parsed?.headline).toBe(validJsonObj.headline);
    });

    it('should parse JSON with conversational preamble using regex fallback', () => {
      const withPreamble = `Xin chào! Tôi đã phân tích đồ thị tri thức của khách hàng. Đây là kết quả:
${JSON.stringify(validJsonObj)}
Chúc bạn một ngày làm việc hiệu quả!`;
      const parsed = parseLlmStructuredJson(withPreamble);
      expect(parsed).not.toBeNull();
      expect(parsed?.nextBestAction.actionType).toBe('SEND_ZALO_PROPOSAL');
    });

    it('should return null for malformed or incomplete JSON', () => {
      expect(parseLlmStructuredJson('Not a JSON string at all')).toBeNull();
      expect(parseLlmStructuredJson('{"headline": "Only headline"}')).toBeNull();
      expect(parseLlmStructuredJson('')).toBeNull();
    });
  });

  describe('3. Zero-Failure Resilient Fallback Engine', () => {
    it('should support all 5 canonical persona clusters with complete template metadata', () => {
      const clusters = Object.values(PersonaCluster);
      expect(clusters.length).toBe(5);

      for (const cluster of clusters) {
        const template = RESILIENT_FALLBACK_TEMPLATES[cluster];
        expect(template).toBeDefined();
        expect(template.headline).toBeTruthy();
        expect(template.summaryLines.length).toBe(3);
        expect(template.talkingPoints.length).toBe(3);
        expect(template.voucherCode).toBeTruthy();
        expect(template.suggestedProducts.length).toBeGreaterThanOrEqual(1);
        expect(template.scriptTemplate).toContain('{{name}}');
      }
    });

    it('should correctly interpolate dynamic variables {{name}}, {{voucher}}, {{products}}', () => {
      const synthesizer = new CkgRagSynthesizer();
      const fallback = synthesizer.generateFallbackProfile(PersonaCluster.WHOLESALE_BUYER, sampleInput);

      expect(fallback.headline).toContain('Khách hàng đối tác sỉ / chủ Spa');
      expect(fallback.talkingPoints.length).toBe(3);
      expect(fallback.voucherRecommendation.code).toBe('SI_VIP_10');
      expect(fallback.nextBestAction.scriptText).toContain('Nguyễn Thị Lan');
      expect(fallback.nextBestAction.scriptText).toContain('SI_VIP_10');
      expect(fallback.nextBestAction.scriptText).not.toContain('{{name}}');
      expect(fallback.nextBestAction.scriptText).not.toContain('{{voucher}}');
    });

    it('should produce professional Vietnamese copy adhering to typography standards', () => {
      const synthesizer = new CkgRagSynthesizer();
      for (const cluster of Object.values(PersonaCluster)) {
        const fallback = synthesizer.generateFallbackProfile(cluster, sampleInput);
        expect(fallback.headline).not.toMatch(/\s[a-zA-Z0-9]$/); // no orphan single character at end
        expect(fallback.talkingPoints[0].length).toBeGreaterThan(10);
        expect(fallback.nextBestAction.title).toBeTruthy();
      }
    });
  });

  describe('4. Full Synthesis Flow & Persistence Handling', () => {
    it('should use Resilient Fallback Engine when Gemini API is unconfigured (empty key)', async () => {
      // Create synthesizer without API key
      const synthesizer = new CkgRagSynthesizer();
      // Mock persistProfile to avoid real DB calls in this test
      const persistSpy = vi.spyOn(synthesizer, 'persistProfile').mockResolvedValue();

      const result = await synthesizer.synthesizeCustomerProfile(sampleInput);

      expect(result.source).toBe('FALLBACK_RULE_ENGINE');
      expect(result.contactId).toBe(sampleInput.contactId);
      expect(result.persona.id).toBe(PersonaCluster.WHOLESALE_BUYER);
      expect(result.persona.summary).toContain('Khách hàng tham gia các nhóm Zalo sỉ');
      expect(result.nextBestAction.suggestedVoucher).toBe('SI_VIP_10');
      expect(result.cached).toBe(false);

      // Verify validUntil is roughly 24 hours in future
      const validUntilMs = new Date(result.validUntil).getTime();
      const nowMs = Date.now();
      const diffHours = (validUntilMs - nowMs) / (1000 * 60 * 60);
      expect(diffHours).toBeGreaterThan(23.9);
      expect(diffHours).toBeLessThan(24.1);

      expect(persistSpy).toHaveBeenCalledOnce();
    });

    it('should handle simulated Gemini API error gracefully and fall back to template', async () => {
      const synthesizer = new CkgRagSynthesizer();
      vi.spyOn(synthesizer as any, 'callGeminiApi').mockRejectedValue(new Error('503 Service Unavailable'));
      vi.spyOn(synthesizer, 'persistProfile').mockResolvedValue();

      const result = await synthesizer.synthesizeCustomerProfile(sampleInput);

      expect(result.source).toBe('FALLBACK_RULE_ENGINE');
      expect(result.persona.label).toContain('Chủ shop sỉ mỹ phẩm');
    });

    it('should parse and adopt Gemini output when API returns valid response', async () => {
      const synthesizer = new CkgRagSynthesizer();
      (synthesizer as any).apiKey = 'mock-key';

      const mockLlmJson = JSON.stringify({
        headline: 'Chủ tiệm spa cao cấp tại Hà Nội.',
        synthesizedSummary: '- Tóm tắt 1.\n- Tóm tắt 2.\n- Tóm tắt 3.',
        talkingPoints: ['Point 1', 'Point 2', 'Point 3'],
        voucherRecommendation: { code: 'SI_VIP_10', rationale: 'Test rationale' },
        riskAssessment: { churnRisk: 'LOW', priceSensitivity: 'LOW', notes: 'Test note' },
        nextBestAction: {
          actionType: 'SEND_ZALO_PROPOSAL',
          title: 'Gửi kịch bản spa',
          scriptText: 'Dạ em chào chị Lan...',
          suggestedProducts: ['Serum B5'],
          suggestedVoucher: 'SI_VIP_10',
        },
        predictedNeeds: ['Need 1'],
      });

      vi.spyOn(synthesizer as any, 'callGeminiApi').mockResolvedValue(mockLlmJson);
      vi.spyOn(synthesizer, 'persistProfile').mockResolvedValue();

      const result = await synthesizer.synthesizeCustomerProfile(sampleInput);

      expect(result.source).toBe('GEMINI_AI');
      expect(result.persona.summary).toBe('- Tóm tắt 1.\n- Tóm tắt 2.\n- Tóm tắt 3.');
      expect(result.nextBestAction.scriptText).toBe('Dạ em chào chị Lan...');
    });
  });

  describe('5. Barrel Re-export Contract', () => {
    it('should correctly re-export through llm-graph-rag-synthesizer barrel', () => {
      expect(synthesizerFromBarrel).toBeDefined();
      expect(SynthesizerClassFromBarrel).toBeDefined();
      expect(synthesizerFromBarrel).toBeInstanceOf(SynthesizerClassFromBarrel);
    });
  });
});

