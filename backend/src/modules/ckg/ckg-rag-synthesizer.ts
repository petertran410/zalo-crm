/**
 * ckg-rag-synthesizer.ts — LLM Graph RAG Synthesizer & 24h Radar Cache Engine (Milestone 3 §R3)
 *
 * Nhiệm vụ cốt lõi:
 * 1. Tuần tự hóa cấu trúc đồ thị 2-hop (Evidence Subgraph) & Centroid Lookalike thành Graph RAG context (<1.200 tokens).
 * 2. Gọi Google Gemini 3.6 Flash để sinh đầu ra JSON có cấu trúc (headline, talkingPoints, voucher, risk, NBA).
 * 3. Bộ dệt dự phòng mẫu chuyên sâu (Zero-Failure Resilient Fallback Engine) dựa trên PERSONA_CLUSTERS_METADATA cho 5 persona.
 * 4. Lưu bền vững hồ sơ chân dung vào PostgreSQL (inferred_customer_profiles) với cache TTL 24 giờ.
 * 5. Truy xuất nhanh <10ms từ cache và hỗ trợ invalidation tự động khi có touchpoint mới.
 */

import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { config } from '../../config/index.js';
import {
  PersonaCluster,
  PERSONA_CLUSTERS_METADATA,
  ConfidenceTier,
  type ICkgEvidenceSubgraph,
  type IHybridLookalikeEvaluation,
  type IConfidenceInfo,
  type IConfidenceScoreResult,
  type IPersonaInfo,
  type INextBestAction,
  type ICustomerRadarResponse,
  type ISynthesizerInput,
  type IRadarStructuredOutput,
  type ISynthesizedProfileResult,
} from './ckg-types.js';

// ── 1. Bộ Mẫu Luật Dự Phòng (Zero-Failure Resilient Fallback Templates) ────────

export interface IFallbackPersonaTemplate {
  headline: string;
  summaryLines: [string, string, string];
  talkingPoints: [string, string, string];
  voucherCode: string;
  voucherRationale: string;
  churnRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  priceSensitivity: 'LOW' | 'MEDIUM' | 'HIGH';
  riskNotes: string;
  actionType: string;
  actionTitle: string;
  scriptTemplate: string;
  suggestedProducts: string[];
  predictedNeeds: string[];
}

export const RESILIENT_FALLBACK_TEMPLATES: Record<PersonaCluster, IFallbackPersonaTemplate> = {
  [PersonaCluster.FNB_WORKSHOP_STUDENT]: {
    headline: 'Khách hàng quan tâm Workshop pha chế thực chiến & tìm hiểu công thức mở quán F&B.',
    summaryLines: [
      '- Tương tác tìm hiểu các khóa đào tạo, Workshop chuyển giao công nghệ đồ uống hoặc hỏi lịch học pha chế.',
      '- Thường mua thử một số nguyên liệu cơ bản (hồng trà, trân châu, bột mochi, mứt) để tự thực hành test vị.',
      '- Tiềm năng trở thành khách hàng sỉ trung thành lâu dài khi chính thức mở quán hoặc kinh doanh online.',
    ],
    talkingPoints: [
      'Chào hỏi niềm nở, chia sẻ thông tin chi tiết về các buổi Workshop pha chế gần nhất tại VP hoặc tỉnh.',
      'Giới thiệu các món hot-trend đang chuyển giao: Trà sữa mochi kéo sợi, Trà ổi hồng thanh mai, Trà sữa nướng.',
      'Gửi tặng ưu đãi Early Bird giữ vé Workshop hoặc combo nguyên liệu thực hành sau buổi học.',
    ],
    voucherCode: 'WS_EARLY_BIRD_15',
    voucherRationale: 'Ưu đãi 15% học phí Workshop hoặc trợ giá combo nguyên liệu thực hành đầu tiên.',
    churnRisk: 'LOW',
    priceSensitivity: 'MEDIUM',
    riskNotes: 'Cần phản hồi nhanh về thời gian/địa điểm workshop, cung cấp giáo trình rõ ràng để tạo niềm tin.',
    actionType: 'SEND_ZALO_PROPOSAL',
    actionTitle: 'Gửi lịch Workshop pha chế mới nhất & ưu đãi Early Bird',
    scriptTemplate:
      'Dạ em chào {{name}} ạ! Em thấy mình đang quan tâm đến chương trình Workshop đào tạo pha chế của Hi Sweetie. Hiện bên em sắp diễn ra buổi Workshop chuyên đề công thức hot-trend chuẩn quán (Trà sữa Mochi, Trân châu ô long nhài & Trà trái cây mứt tươi). Em gửi {{name}} lịch học chi tiết và tặng mã ưu đãi WS_EARLY_BIRD_15 để giữ chỗ sớm nhé ạ!',
    suggestedProducts: [
      'TTL - Hồng Trà 500gr/gói (Teatreelife)',
      'Gấu Lermao - Trân châu vị TRÀ OLONG NHÀI 500gr',
      'Bột mochi sữa LABOONG 800gr',
    ],
    predictedNeeds: ['Lịch Workshop gần nhất', 'Giáo trình công thức chuẩn quán', 'Combo nguyên liệu thực hành sau workshop'],
  },

  [PersonaCluster.FNB_SHOP_OWNER]: {
    headline: 'Chủ quán Trà sữa / Cafe / Ăn vặt vận hành thực tế, nhập sỉ định kỳ theo thùng.',
    summaryLines: [
      '- Đã có lịch sử đặt đơn POS hoặc trao đổi về menu, giá sỉ theo thùng các dòng cốt trà, trân châu, mứt sinh tố.',
      '- Ưu tiên hàng date mới, vị trà đậm đà chuẩn vị Đài Loan, chi phí cost ly tối ưu dưới 5.000đ.',
      '- Tần suất nhập hàng lặp lại cao, có nhu cầu gửi chành xe và xuất hóa đơn VAT minh bạch.',
    ],
    talkingPoints: [
      'Trao đổi chuyên nghiệp theo góc nhìn chủ quán, báo giá sỉ theo thùng cạnh tranh nhất thị trường.',
      'Gợi ý các dòng nguyên liệu best-seller: Cốt Hồng Trà TTL, Trân Châu Ô Long Lermao, Bột mochi/sữa chua Laboong.',
      'Tặng mã voucher sỉ FNB_SI_10 cho đơn nhập bổ sung menu tháng này.',
    ],
    voucherCode: 'FNB_SI_10',
    voucherRationale: 'Chiết khấu thêm 10% cho đơn sỉ thùng, bảo toàn biên độ lợi nhuận kinh doanh quán.',
    churnRisk: 'LOW',
    priceSensitivity: 'MEDIUM',
    riskNotes: 'Cần đảm bảo nguồn cung hàng ổn định, tránh đứt hàng các dòng cốt trà chủ lực.',
    actionType: 'SEND_ZALO_PROPOSAL',
    actionTitle: 'Gửi bảng giá sỉ thùng F&B & công thức cost ly tối ưu',
    scriptTemplate:
      'Dạ em chào {{name}} ạ! Bên em vừa cập nhật bảng giá sỉ nguyên liệu pha chế tháng này với mức chiết khấu cực tốt cho chủ quán theo thùng. Đặc biệt các dòng Hồng Trà Teatreelife và Trân châu Ô Long Lermao đang có date mới tinh và hỗ trợ giao chành xe nhanh chóng. Em gửi {{name}} bảng giá và tặng mã FNB_SI_10 cho đơn đợt này nhé ạ!',
    suggestedProducts: [
      'TTL - Hồng Trà 500gr/gói (25 Gói / Thùng)',
      'TTL - Mứt Ổi Hồng 1.36kg/hộp (6 Hộp / Thùng)',
      'Bột mochi sữa LABOONG 800gr (20 gói/thùng)',
      'Bột Sữa Chua LABOONG 800gr',
    ],
    predictedNeeds: ['Bảng giá sỉ nguyên liệu theo thùng', 'Công thức cost ly dưới 5.000đ', 'Date mới & hỗ trợ chành xe'],
  },

  [PersonaCluster.WHOLESALE_DISTRIBUTOR]: {
    headline: 'Đại lý phân phối & Nhập sỉ lớn theo tấn/pallet kèm thiết bị máy móc F&B.',
    summaryLines: [
      '- Khách hàng là đại lý nguyên liệu tỉnh hoặc chuỗi cửa hàng, quan tâm đơn hàng khối lượng lớn và thiết bị quầy bar.',
      '- Cần chính sách chiết khấu bậc thang theo doanh số, hợp đồng cung ứng dài hạn và bảo hành thiết bị.',
      '- Có khả năng phân phối lại nguyên liệu cho mạng lưới quán nhỏ tại địa phương.',
    ],
    talkingPoints: [
      'Chào hỏi trang trọng, gửi chính sách hợp đồng đại lý cấp 1 và chiết khấu bậc thang.',
      'Giới thiệu nguồn hàng số lượng lớn (Đường bao Daesang 25kg, Bột sữa Wings, Bếp chiên, Nồi nấu trân châu).',
      'Mời trao đổi trực tiếp với Quản lý kinh doanh để thống nhất chính sách độc quyền khu vực.',
    ],
    voucherCode: 'NPP_VIP_LEVEL1',
    voucherRationale: 'Chiết khấu bậc thang theo hợp đồng khung đại lý cấp 1.',
    churnRisk: 'LOW',
    priceSensitivity: 'HIGH',
    riskNotes: 'Rất nhạy cảm về biên độ chiết khấu và sự cạnh tranh vùng, cần chính sách bảo hộ đại lý.',
    actionType: 'SEND_ZALO_PROPOSAL',
    actionTitle: 'Gửi chính sách hợp tác phân phối NPP & chiết khấu bậc thang',
    scriptTemplate:
      'Dạ em chào {{name}} ạ! Em nhận thấy bên mình đang tìm hiểu nguồn cung ứng nguyên liệu và thiết bị pha chế khối lượng lớn cho đại lý. Hiện Hi Sweetie đang mở rộng chính sách đại lý cấp 1 với mức chiết khấu bậc thang hấp dẫn và hỗ trợ bảo hành thiết bị chính hãng. Em xin phép gửi chính sách phân phối để mình tham khảo nhé ạ!',
    suggestedProducts: ['Đường Daesang 25kg', 'Bột Sữa Wings Premium 1kg (12 gói/thùng)', 'Bếp chiên đơn & Thiết bị quầy bar'],
    predictedNeeds: ['Chính sách chiết khấu bậc thang theo doanh số', 'Hợp đồng đại lý cấp 1', 'Bảo hành thiết bị máy móc'],
  },

  [PersonaCluster.HOME_CAFE_RETAIL]: {
    headline: 'Khách tự pha chế tại nhà & yêu thích tự làm đồ uống giải khát cho gia đình.',
    summaryLines: [
      '- Khách mua lẻ 1-2 gói nhỏ, hỏi cách pha đơn giản, decor đồ uống sinh động cho gia đình.',
      '- Chuộng các sản phẩm tiện dụng, định lượng bằng muỗng/thìa, túi zip dễ bảo quản ngăn mát tủ lạnh.',
      '- Quan tâm chính sách phí vận chuyển linh hoạt và giao hàng nhanh.',
    ],
    talkingPoints: [
      'Tư vấn nhiệt tình, gửi công thức tự pha 3 bước chuẩn vị quán ngay tại nhà.',
      'Gợi ý các set nguyên liệu dễ làm: Trà trái cây Mứt ổi hồng, Trân châu thanh mai giòn dai, Bột sữa chua Laboong.',
      'Gửi tặng mã FREESHIP_HOME_20K để hỗ trợ phí vận chuyển đơn lẻ.',
    ],
    voucherCode: 'FREESHIP_HOME_20K',
    voucherRationale: 'Hỗ trợ 20.000 đ phí vận chuyển cho đơn lẻ từ 199.000 đ.',
    churnRisk: 'MEDIUM',
    priceSensitivity: 'LOW',
    riskNotes: 'Cần hướng dẫn công thức thật chi tiết, nếu pha không ngon lần đầu khách dễ bỏ cuộc.',
    actionType: 'SEND_DISCOUNT',
    actionTitle: 'Gửi công thức tự pha tại nhà kèm voucher Freeship',
    scriptTemplate:
      'Em chào {{name}} ạ! Tự tay pha trà sữa hoặc trà trái cây tươi mát tại nhà cho người thân vừa ngon vừa yên tâm vệ sinh. Bên em có sẵn công thức 3 bước cực kỳ dễ làm từ Mứt Ổi Hồng và Trân châu thanh mai giòn thơm. Em gửi tặng {{name}} mã FREESHIP_HOME_20K để mình nhận nguyên liệu về trổ tài nhé ạ!',
    suggestedProducts: ['TTL - Mứt Ổi Hồng 1.36kg', 'TTL - Trân châu nhân thanh mai 500g', 'Bột Sữa Chua LABOONG 800gr'],
    predictedNeeds: ['Công thức tự pha 3 bước đơn giản', 'Gói nhỏ túi zip tiện bảo quản', 'Freeship đơn nhỏ'],
  },

  [PersonaCluster.TRIAL_EXPLORER]: {
    headline: 'Khách hàng mới tiếp cận Hi Sweetie, đang khảo sát vị trà và chuộng mẫu thử 100g.',
    summaryLines: [
      '- Khách hàng mới tương tác hoặc lần đầu hỏi giá, chưa chốt đơn hàng giá trị lớn.',
      '- Có tâm lý muốn thử vị trà thực tế (độ đậm, hương thơm, hậu vị) trước khi quyết định nhập số lượng lớn.',
      '- Rất phù hợp với chương trình tặng gói mẫu thử test vị 100g chuyên nghiệp.',
    ],
    talkingPoints: [
      'Chào hỏi cởi mở, giới thiệu Top 3 dòng trà bán chạy nhất của Hi Sweetie.',
      'Đề xuất trải nghiệm gói mẫu thử 100g: Mẫu thử Trà Long Tỉnh Chi Xuân, Mẫu thử Hồng trà Sài Gòn.',
      'Tặng voucher SAMPLE_FREE_100G để khách nhận mẫu thử miễn phí kiểm tra chất lượng.',
    ],
    voucherCode: 'SAMPLE_FREE_100G',
    voucherRationale: 'Tặng mẫu thử 100g test vị trà miễn phí, gỡ bỏ rào cản e ngại chất lượng.',
    churnRisk: 'HIGH',
    priceSensitivity: 'MEDIUM',
    riskNotes: 'Cần tư vấn chuẩn gu để khách có trải nghiệm thử vị tốt nhất ngay lần đầu tiên.',
    actionType: 'SEND_DISCOUNT',
    actionTitle: 'Gửi danh mục Best-seller & tặng gói mẫu thử 100g',
    scriptTemplate:
      'Dạ em chào {{name}} ạ! Để mình an tâm về hương thơm và độ đậm của vị trà trước khi chọn cho quán, Hi Sweetie xin gửi tặng {{name}} gói Mẫu thử 100g (Trà Long Tỉnh hoặc Hồng Trà Sài Gòn) hoàn toàn miễn phí kèm mã SAMPLE_FREE_100G. Em gửi {{name}} hướng dẫn ủ trà test vị chuẩn nhé ạ!',
    suggestedProducts: [
      'Mẫu Thử 100gr - PH - Trà Long Tỉnh Chi Xuân',
      'Mẫu Thử 100gr - PH - Hồng trà Sài Gòn',
      'Gấu Lermao - Mứt Nho Xanh 1kg',
    ],
    predictedNeeds: ['Mẫu thử 100g các dòng trà bán chạy', 'Bảng menu và công thức mẫu', 'Tư vấn vị trà hợp gu địa phương'],
  },
};

// ── 2. Bộ Tuần Tự Hóa Ngữ Cảnh Graph RAG Context Serializer ──────────────────

/**
 * Tuần tự hóa cấu trúc khách hàng, đồ thị 2-hop, centroid lookalike thành văn bản ngắn gọn (<1.200 tokens).
 */
export function buildCkgRagPrompt(input: ISynthesizerInput): string {
  const { contact, evidenceSubgraph, lookalikeEval, confidence, orderHistory } = input;
  const metrics = evidenceSubgraph.metrics || {
    sharedGroupsCount: 0,
    totalOrdersCount: 0,
    homophilyNeighborsCount: 0,
  };

  const displayName = contact.fullName || contact.crmName || contact.zaloName || 'Khách hàng';
  const phoneStr = contact.phone ? `${contact.phone.slice(0, 4)}***${contact.phone.slice(-3)}` : 'Chưa có';
  const tagsStr = contact.tags && contact.tags.length > 0 ? contact.tags.join(', ') : 'Không có';

  // 1. Phân tích cạnh quan hệ 1-hop
  const groupEdges = evidenceSubgraph.edges.filter((e) => e.relation === 'IN_GROUP');
  const purchaseEdges = evidenceSubgraph.edges.filter((e) => e.relation === 'PURCHASED');
  const interestEdges = evidenceSubgraph.edges.filter((e) => e.relation === 'INTERESTED_IN');
  const workshopEdges = evidenceSubgraph.edges.filter(
    (e) => e.relation === 'ATTENDED_WORKSHOP' || e.relation === 'INQUIRED_WORKSHOP'
  );

  const groupsText =
    groupEdges.length > 0
      ? groupEdges.map((e) => `  + [IN_GROUP] Target: ${e.target} (Trọng số: ${e.weight})`).join('\n')
      : '  + Chưa ghi nhận nhóm Zalo trực tiếp';

  const purchaseText =
    purchaseEdges.length > 0
      ? purchaseEdges.map((e) => `  + [PURCHASED] Sản phẩm: ${e.target} (Trọng số: ${e.weight})`).join('\n')
      : '  + Chưa có đơn hàng POS đã thanh toán';

  const interestText =
    interestEdges.length > 0
      ? interestEdges.map((e) => `  + [INTERESTED_IN] Nhu cầu: ${e.target} (Trọng số: ${e.weight})`).join('\n')
      : '  + Chưa ghi nhận từ khóa quan tâm cụ thể';

  const workshopText =
    workshopEdges.length > 0
      ? workshopEdges.map((e) => `  + [${e.relation}] Buổi học/Sự kiện: ${e.target}`).join('\n')
      : '  + Chưa ghi nhận tham gia workshop cụ thể';

  // 2. Lịch sử đơn hàng POS
  const orderCount = orderHistory?.totalOrders ?? metrics.totalOrdersCount ?? 0;
  const totalSpent = orderHistory?.totalSpent ?? 0;
  const spentFormatted = new Intl.NumberFormat('vi-VN').format(totalSpent) + ' đ';

  return `
Bạn là Chuyên gia Cố vấn Kinh doanh & Chiến lược Đồ uống F&B cấp cao (Senior F&B Sales & Workshop Strategist) của thương hiệu Hi Sweetie.
Hi Sweetie là thương hiệu chuyên cung cấp:
1. Nguyên liệu pha chế Trà sữa, Trà trái cây, Topping, Bột làm bánh (Hồng trà Teatreelife, Trân châu Lermao, Mứt Boduo, Bột mochi/sữa chua Laboong, Siro...).
2. Thiết bị máy móc quầy bar (Bếp chiên, Nồi nấu trân châu, Máy ép ly...).
3. Đào tạo Workshop thực chiến và Chuyển giao công nghệ công thức đồ uống chuẩn vị toàn quốc.

Dựa trên cấu trúc Đồ thị Tri thức Khách hàng (Customer Knowledge Graph - CKG) và thông tin tiếp xúc dưới đây, hãy tổng hợp bản tóm tắt chân dung 360° sắc nét và kịch bản tư vấn chốt đơn Next Best Action (NBA) cho nhân viên Sale Zalo.

QUY TẮC LỌC NHIỄU QUAN TRỌNG:
- Bỏ qua các đoạn tin nhắn trao đổi kỹ thuật phần mềm (console error, file docx báo cáo thực tập, trò chuyện trường học).
- Tập trung vào nhu cầu F&B: Học viên Workshop, Chủ quán mở quán/nhập sỉ, Khách tự pha tại nhà hoặc Khách dùng thử mẫu trà.

======================================================================
[THÔNG TIN ĐỊNH DANH & TIẾP CẬN KHÁCH HÀNG]
- Tên khách hàng: ${displayName}
- SĐT: ${phoneStr}
- Nguồn tiếp cận: ${contact.source || 'Zalo CRM'}
- Thẻ CRM hiện tại: [${tagsStr}]

[ĐỊNH VỊ PERSONA KHÔNG GIAN VECTOR (CENTROID LOOKALIKE)]
- Phân khúc dự đoán: ${lookalikeEval.topPersonaLabel} (${lookalikeEval.topPersonaId})
- Huy hiệu: ${lookalikeEval.clusterBadge} | Độ tương đồng Cosine: ${lookalikeEval.vectorSimilarity}
- Phân tầng tin cậy: ${confidence.tier} (${confidence.percentage}%, Màu: ${confidence.color})

[BẰNG CHỨNG ĐỒ THỊ 2-HOP (EVIDENCE SUBGRAPH & WORKSHOP)]
- Hoạt động Workshop & Khóa đào tạo:
${workshopText}
- Quan hệ nhóm Zalo (1-hop):
${groupsText}
- Quan hệ sản phẩm & Đơn hàng đã mua (1-hop):
${purchaseText}
- Mối quan tâm hội thoại (1-hop):
${interestText}
- Mạng lưới lân cận đồng sở thích (2-hop Homophily Metrics):
  + Số nhóm Zalo chung: ${metrics.sharedGroupsCount} nhóm
  + Số khách hàng lân cận cùng mạng lưới: ${metrics.homophilyNeighborsCount} khách
  + Tổng đơn hàng ghi nhận trong đồ thị: ${metrics.totalOrdersCount} đơn

[LỊCH SỬ GIAO DỊCH POS THỰC TẾ]
- Tổng số đơn: ${orderCount} đơn | Tổng chi tiêu: ${spentFormatted}
======================================================================

YÊU CẦU ĐẦU RA BẮT BUỘC:
Trả về duy nhất 1 đối tượng JSON (không thêm markdown thừa thãi, không giải thích ngoài JSON) với cấu trúc nghiêm ngặt:
{
  "headline": "<Chân dung 1 dòng xúc tích dưới 20 từ, nêu bật bối cảnh và nhu cầu cốt lõi>",
  "synthesizedSummary": "<Bản tóm tắt 3 dòng sắc nét về nhu cầu, thói quen và tiềm năng của khách, mỗi dòng bắt đầu bằng dấu gạch đầu dòng '- '>",
  "talkingPoints": [
    "<Gợi ý 1: Cách mở đầu hội thoại tự nhiên, đồng cảm>",
    "<Gợi ý 2: Cách điều hướng vào sản phẩm chủ lực phù hợp>",
    "<Gợi ý 3: Đòn bẩy khuyến mãi/voucher để chốt đơn>"
  ],
  "voucherRecommendation": {
    "code": "<Mã voucher gợi ý, ví dụ SI_VIP_10, OFFICE_50K, MOM_CARE_10, GENZ_GLOW_20K, MINI_FREESHIP>",
    "rationale": "<Lý giải kinh tế / biên lợi nhuận ngắn gọn cho voucher này>"
  },
  "riskAssessment": {
    "churnRisk": "LOW" | "MEDIUM" | "HIGH",
    "priceSensitivity": "LOW" | "MEDIUM" | "HIGH",
    "notes": "<1 câu ngắn về rủi ro rời bỏ hoặc lưu ý về tính cách của khách>"
  },
  "nextBestAction": {
    "actionType": "SEND_ZALO_PROPOSAL" | "SEND_DISCOUNT" | "INVITE_VIP_GROUP",
    "title": "<Tiêu đề hành động ngắn gọn cho nút bấm trên màn hình>",
    "scriptText": "<Kịch bản tin nhắn chat mẫu xưng hô tự nhiên Em - Chị/Anh theo tên khách hàng ${displayName}, tích hợp sản phẩm và mã voucher, sẵn sàng để Sale 1-click gửi vào Zalo>",
    "suggestedProducts": ["<Sản phẩm 1>", "<Sản phẩm 2>"],
    "suggestedVoucher": "<Mã voucher giống trường code>"
  },
  "predictedNeeds": [
    "<Nhu cầu dự đoán 1>",
    "<Nhu cầu dự đoán 2>",
    "<Nhu cầu dự đoán 3>"
  ]
}
`.trim();
}

/**
 * Trích xuất và parse an toàn chuỗi JSON trả về từ Google Gemini.
 */
export function parseLlmStructuredJson(rawText: string): IRadarStructuredOutput | null {
  if (!rawText || typeof rawText !== 'string') return null;

  let cleaned = rawText.trim();

  // Bóc tách Markdown Code Fences (```json ... ``` hoặc ``` ... ```)
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    cleaned = codeBlockMatch[1].trim();
  }

  // Regex fallback tìm khối JSON { ... }
  const jsonObjectMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonObjectMatch) {
    cleaned = jsonObjectMatch[0].trim();
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (
      parsed &&
      typeof parsed.headline === 'string' &&
      typeof parsed.synthesizedSummary === 'string' &&
      Array.isArray(parsed.talkingPoints) &&
      parsed.talkingPoints.length >= 3 &&
      parsed.nextBestAction &&
      typeof parsed.nextBestAction.scriptText === 'string'
    ) {
      return {
        headline: parsed.headline,
        synthesizedSummary: parsed.synthesizedSummary,
        talkingPoints: parsed.talkingPoints.slice(0, 3) as [string, string, string],
        voucherRecommendation: {
          code: parsed.voucherRecommendation?.code || 'MINI_FREESHIP',
          rationale: parsed.voucherRecommendation?.rationale || 'Ưu đãi khuyến khích khách hàng trải nghiệm.',
        },
        riskAssessment: {
          churnRisk: ['LOW', 'MEDIUM', 'HIGH'].includes(parsed.riskAssessment?.churnRisk)
            ? parsed.riskAssessment.churnRisk
            : 'MEDIUM',
          priceSensitivity: ['LOW', 'MEDIUM', 'HIGH'].includes(parsed.riskAssessment?.priceSensitivity)
            ? parsed.riskAssessment.priceSensitivity
            : 'MEDIUM',
          notes: parsed.riskAssessment?.notes || 'Cần chăm sóc đều đặn và giải đáp thắc mắc kịp thời.',
        },
        nextBestAction: {
          actionType: parsed.nextBestAction.actionType || 'SEND_DISCOUNT',
          title: parsed.nextBestAction.title || 'Gửi tin nhắn tư vấn và ưu đãi',
          scriptText: parsed.nextBestAction.scriptText,
          suggestedProducts: Array.isArray(parsed.nextBestAction.suggestedProducts)
            ? parsed.nextBestAction.suggestedProducts
            : [],
          suggestedVoucher: parsed.nextBestAction.suggestedVoucher || parsed.voucherRecommendation?.code || '',
        },
        predictedNeeds: Array.isArray(parsed.predictedNeeds) ? parsed.predictedNeeds : [],
      };
    }
  } catch (err) {
    logger.warn('[CkgRagSynthesizer] Failed to parse JSON from LLM output:', err);
  }

  return null;
}

// ── 3. Lớp Dịch Vụ Graph RAG Synthesizer ──────────────────────────────────────

export class CkgRagSynthesizer {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor() {
    this.baseUrl = config.geminiBaseUrl || 'https://generativelanguage.googleapis.com';
    this.apiKey = config.geminiApiKey || '';
    this.model = config.geminiModel || 'gemini-3.6-flash';
  }

  /**
   * Tổng hợp chân dung khách hàng 360° và kịch bản NBA.
   * Ưu tiên gọi Gemini Flash, tự động chuyển sang Fallback Rule Engine nếu lỗi hoặc thiếu key.
   */
  public async synthesizeCustomerProfile(input: ISynthesizerInput): Promise<ISynthesizedProfileResult> {
    const { contactId, lookalikeEval, confidence, evidenceSubgraph } = input;
    const personaCluster = lookalikeEval.topPersonaId || PersonaCluster.TRIAL_EXPLORER;

    let structuredOutput: IRadarStructuredOutput | null = null;
    let source: 'GEMINI_AI' | 'FALLBACK_RULE_ENGINE' = 'FALLBACK_RULE_ENGINE';

    // 1. Kiểm tra điều kiện gọi Gemini AI
    if (this.apiKey) {
      try {
        const prompt = buildCkgRagPrompt(input);
        const rawResponse = await this.callGeminiApi(prompt);
        structuredOutput = parseLlmStructuredJson(rawResponse);
        if (structuredOutput) {
          source = 'GEMINI_AI';
        }
      } catch (err) {
        logger.warn(`[CkgRagSynthesizer] Gemini call failed for contact ${contactId}, engaging resilient fallback:`, err);
      }
    }

    // 2. Kích hoạt Resilient Fallback nếu Gemini không khả dụng hoặc parse thất bại
    if (!structuredOutput) {
      structuredOutput = this.generateFallbackProfile(personaCluster, input);
      source = 'FALLBACK_RULE_ENGINE';
    }

    // 3. Chuẩn hóa thành đối tượng phản hồi hoàn chỉnh
    const validUntilDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const personaInfo: IPersonaInfo = {
      id: personaCluster,
      label: lookalikeEval.topPersonaLabel || PERSONA_CLUSTERS_METADATA[personaCluster]?.label || personaCluster,
      clusterBadge: lookalikeEval.clusterBadge || PERSONA_CLUSTERS_METADATA[personaCluster]?.clusterBadge || '',
      headline: structuredOutput.headline,
      summary: structuredOutput.synthesizedSummary,
      predictedNeeds: structuredOutput.predictedNeeds,
    };

    const nextBestAction: INextBestAction = {
      actionType: structuredOutput.nextBestAction.actionType,
      title: structuredOutput.nextBestAction.title,
      scriptText: structuredOutput.nextBestAction.scriptText,
      suggestedProducts: structuredOutput.nextBestAction.suggestedProducts,
      suggestedVoucher: structuredOutput.nextBestAction.suggestedVoucher,
    };

    const confidenceInfo: IConfidenceInfo = {
      score: confidence.score,
      percentage: confidence.percentage,
      tier: confidence.tier as ConfidenceTier,
      color: confidence.color,
    };

    const result: ISynthesizedProfileResult = {
      contactId,
      persona: personaInfo,
      confidence: confidenceInfo,
      evidenceSubgraph,
      nextBestAction,
      cached: false,
      validUntil: validUntilDate.toISOString(),
      source,
    };

    // 4. Lưu bền vững vào cơ sở dữ liệu (PostgreSQL inferred_customer_profiles)
    await this.persistProfile(input.orgId, contactId, result, structuredOutput);

    return result;
  }

  /**
   * Gọi REST API Google Gemini 3.6 Flash bằng native fetch và AbortSignal timeout 8s.
   */
  private async callGeminiApi(prompt: string): Promise<string> {
    const url = `${this.baseUrl}/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
        },
      }),
      signal: AbortSignal.timeout(8000), // Timeout an toàn 8 giây
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Gemini API responded with status ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as any;
    const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      throw new Error('Gemini API response did not contain text content');
    }

    return candidateText;
  }

  /**
   * Sinh hồ sơ dự phòng theo luật mẫu (Zero-Failure Resilient Fallback Engine)
   */
  public generateFallbackProfile(
    personaCluster: PersonaCluster,
    input: ISynthesizerInput
  ): IRadarStructuredOutput {
    const template = RESILIENT_FALLBACK_TEMPLATES[personaCluster] || RESILIENT_FALLBACK_TEMPLATES[PersonaCluster.TRIAL_EXPLORER];
    const customerName =
      input.contact.fullName || input.contact.crmName || input.contact.zaloName || 'mình';

    // Thay thế biến động {{name}}, {{products}}, {{voucher}}
    const script = template.scriptTemplate
      .replace(/\{\{name\}\}/g, customerName)
      .replace(/\{\{voucher\}\}/g, template.voucherCode)
      .replace(/\{\{products\}\}/g, template.suggestedProducts.join(', '));

    return {
      headline: template.headline,
      synthesizedSummary: template.summaryLines.join('\n'),
      talkingPoints: [...template.talkingPoints] as [string, string, string],
      voucherRecommendation: {
        code: template.voucherCode,
        rationale: template.voucherRationale,
      },
      riskAssessment: {
        churnRisk: template.churnRisk,
        priceSensitivity: template.priceSensitivity,
        notes: template.riskNotes,
      },
      nextBestAction: {
        actionType: template.actionType,
        title: template.actionTitle,
        scriptText: script,
        suggestedProducts: [...template.suggestedProducts],
        suggestedVoucher: template.voucherCode,
      },
      predictedNeeds: [...template.predictedNeeds],
    };
  }

  /**
   * Lưu hồ sơ đã tổng hợp vào bảng inferred_customer_profiles với valid_until = NOW() + 24h.
   * Hỗ trợ Dual-mode: Prisma Client hoặc Raw SQL Upsert.
   */
  public async persistProfile(
    orgId: string,
    contactId: string,
    result: ISynthesizedProfileResult,
    structuredOutput: IRadarStructuredOutput
  ): Promise<void> {
    const validUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const summary = structuredOutput.synthesizedSummary;
    const evidenceJson = JSON.stringify(result.evidenceSubgraph);
    const nextBestActionJson = JSON.stringify({
      ...result.nextBestAction,
      headline: structuredOutput.headline,
      talkingPoints: structuredOutput.talkingPoints,
      voucherRecommendation: structuredOutput.voucherRecommendation,
      riskAssessment: structuredOutput.riskAssessment,
    });

    try {
      // 1. Thử ghi qua Prisma Client nếu model đã được generate
      if ((prisma as any).inferredCustomerProfile?.upsert) {
        await (prisma as any).inferredCustomerProfile.upsert({
          where: { contactId },
          create: {
            orgId,
            contactId,
            personaId: result.persona.id,
            personaLabel: result.persona.label,
            confidenceScore: result.confidence.score,
            evidenceSubgraph: result.evidenceSubgraph as any,
            nextBestAction: JSON.parse(nextBestActionJson),
            synthesizedSummary: summary,
            validUntil,
            lastEventAt: new Date(),
          },
          update: {
            orgId,
            personaId: result.persona.id,
            personaLabel: result.persona.label,
            confidenceScore: result.confidence.score,
            evidenceSubgraph: result.evidenceSubgraph as any,
            nextBestAction: JSON.parse(nextBestActionJson),
            synthesizedSummary: summary,
            validUntil,
            updatedAt: new Date(),
          },
        });
        return;
      }
    } catch (prismaErr) {
      logger.debug('[CkgRagSynthesizer] Prisma upsert failed, using raw SQL upsert:', prismaErr);
    }

    // 2. Fallback Raw SQL Upsert an toàn tuyệt đối
    try {
      await prisma.$executeRawUnsafe(
        `
        INSERT INTO inferred_customer_profiles (
          id, org_id, contact_id, persona_id, persona_label,
          confidence_score, evidence_subgraph, next_best_action,
          synthesized_summary, valid_until, last_event_at, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, NOW(), NOW(), NOW()
        )
        ON CONFLICT (contact_id) DO UPDATE SET
          org_id = EXCLUDED.org_id,
          persona_id = EXCLUDED.persona_id,
          persona_label = EXCLUDED.persona_label,
          confidence_score = EXCLUDED.confidence_score,
          evidence_subgraph = EXCLUDED.evidence_subgraph,
          next_best_action = EXCLUDED.next_best_action,
          synthesized_summary = EXCLUDED.synthesized_summary,
          valid_until = EXCLUDED.valid_until,
          updated_at = NOW();
        `,
        orgId,
        contactId,
        result.persona.id,
        result.persona.label,
        result.confidence.score,
        evidenceJson,
        nextBestActionJson,
        summary,
        validUntil
      );
    } catch (sqlErr) {
      logger.error('[CkgRagSynthesizer] Raw SQL persistence error for inferred_customer_profiles:', sqlErr);
    }
  }

  /**
   * Đọc hồ sơ cache từ DB (<10ms SLA). Trả về null nếu hết hạn (valid_until <= NOW()) hoặc chưa có.
   */
  public async getCachedProfile(
    orgId: string,
    contactId: string
  ): Promise<ICustomerRadarResponse | null> {
    try {
      // 1. Thử qua Prisma Client
      if ((prisma as any).inferredCustomerProfile?.findUnique) {
        const row = await (prisma as any).inferredCustomerProfile.findUnique({
          where: { contactId },
        });
        if (row && row.orgId === orgId && new Date(row.validUntil).getTime() > Date.now()) {
          return this.mapDbRowToRadarResponse(row);
        }
      }
    } catch {
      // Fallback to raw SQL below
    }

    // 2. Raw SQL check
    try {
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `
        SELECT id, org_id, contact_id, persona_id, persona_label,
               confidence_score, evidence_subgraph, next_best_action,
               synthesized_summary, valid_until
        FROM inferred_customer_profiles
        WHERE contact_id = $1 AND org_id = $2 AND valid_until > NOW()
        LIMIT 1;
        `,
        contactId,
        orgId
      );

      if (rows && rows.length > 0) {
        return this.mapDbRowToRadarResponse(rows[0]);
      }
    } catch (sqlErr) {
      logger.warn('[CkgRagSynthesizer] Failed to read cached profile from DB:', sqlErr);
    }

    return null;
  }

  /**
   * Ánh xạ từ dòng DB sang ICustomerRadarResponse.
   */
  private mapDbRowToRadarResponse(row: any): ICustomerRadarResponse {
    const personaCluster = (row.personaId || row.persona_id || PersonaCluster.TRIAL_EXPLORER) as PersonaCluster;
    const meta = PERSONA_CLUSTERS_METADATA[personaCluster];

    const score = Number(row.confidenceScore ?? row.confidence_score ?? 0.50);
    const isConsolidated = score >= 0.85;

    let evidenceSubgraph = row.evidenceSubgraph || row.evidence_subgraph || {};
    if (typeof evidenceSubgraph === 'string') {
      try {
        evidenceSubgraph = JSON.parse(evidenceSubgraph);
      } catch {
        evidenceSubgraph = { nodes: [], edges: [], metrics: { sharedGroupsCount: 0, totalOrdersCount: 0, homophilyNeighborsCount: 0 } };
      }
    }

    let nextBestAction = row.nextBestAction || row.next_best_action || {};
    if (typeof nextBestAction === 'string') {
      try {
        nextBestAction = JSON.parse(nextBestAction);
      } catch {
        nextBestAction = {};
      }
    }

    return {
      contactId: row.contactId || row.contact_id,
      persona: {
        id: personaCluster,
        label: row.personaLabel || row.persona_label || meta?.label || personaCluster,
        clusterBadge: meta?.clusterBadge || '',
        headline: nextBestAction?.headline || meta?.description || '',
        summary: row.synthesizedSummary || row.synthesized_summary || meta?.description || '',
        predictedNeeds: meta?.defaultNeeds || [],
      },
      confidence: {
        score,
        percentage: Math.round(score * 100),
        tier: isConsolidated ? ConfidenceTier.CONSOLIDATED : ConfidenceTier.PRELIMINARY,
        color: isConsolidated ? 'emerald' : 'amber',
      },
      evidenceSubgraph: {
        nodes: evidenceSubgraph.nodes || [],
        edges: evidenceSubgraph.edges || [],
        metrics: evidenceSubgraph.metrics || { sharedGroupsCount: 0, totalOrdersCount: 0, homophilyNeighborsCount: 0 },
      },
      nextBestAction: {
        actionType: nextBestAction.actionType || 'SEND_DISCOUNT',
        title: nextBestAction.title || 'Gửi kịch bản ưu đãi Zalo',
        scriptText: nextBestAction.scriptText || '',
        suggestedProducts: nextBestAction.suggestedProducts || meta?.recommendedProducts || [],
        suggestedVoucher: nextBestAction.suggestedVoucher || meta?.suggestedVoucher || '',
      },
      cached: true,
      validUntil: new Date(row.validUntil || row.valid_until).toISOString(),
    };
  }
}

// Singleton Instance phục vụ toàn bộ ứng dụng
export const ckgRagSynthesizer = new CkgRagSynthesizer();
