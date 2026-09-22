/**
 * ckg-types.ts — Customer Knowledge Graph (CKG) & Smart Customer Radar Type Definitions
 *
 * Định nghĩa toàn bộ Enums, Data Contracts, Subgraph Interfaces và API Payloads
 * phục vụ Ingestion Pipeline, Graph Traversal, Confidence Scoring và Radar Widget.
 */

// ── 1. CkgEntityType Enum ──────────────────────────────────────────────────

export enum CkgEntityType {
  CONTACT = 'CONTACT',             // Khách hàng CRM / Zalo contact
  GROUP = 'GROUP',                 // Nhóm Zalo cộng đồng
  PRODUCT = 'PRODUCT',             // Sản phẩm F&B / Nguyên liệu / SKU
  PERSONA = 'PERSONA',             // Cụm chân dung khách hàng định danh
  CONVERSATION = 'CONVERSATION',   // Luồng hội thoại chat Zalo
  TOPIC = 'TOPIC',                 // Chủ đề / Từ khóa quan tâm (trà sữa, workshop, mứt, topping, etc.)
  WORKSHOP = 'WORKSHOP',           // Buổi Workshop đào tạo / Chuyển giao công nghệ F&B
}

// ── 2. CkgRelationType Enum ────────────────────────────────────────────────

export enum CkgRelationType {
  IN_GROUP = 'IN_GROUP',                     // (CONTACT) -[IN_GROUP]-> (GROUP)
  PURCHASED = 'PURCHASED',                   // (CONTACT) -[PURCHASED]-> (PRODUCT)
  LOOKALIKE_TO = 'LOOKALIKE_TO',             // (CONTACT) -[LOOKALIKE_TO]-> (CONTACT/PERSONA)
  BELONGS_TO = 'BELONGS_TO',                 // (CONTACT) -[BELONGS_TO]-> (PERSONA)
  INTERESTED_IN = 'INTERESTED_IN',           // (CONTACT) -[INTERESTED_IN]-> (PRODUCT/TOPIC)
  CHATTED_WITH = 'CHATTED_WITH',             // (CONTACT) -[CHATTED_WITH]-> (CONVERSATION)
  ATTENDED_WORKSHOP = 'ATTENDED_WORKSHOP',   // (CONTACT) -[ATTENDED_WORKSHOP]-> (WORKSHOP)
  INQUIRED_WORKSHOP = 'INQUIRED_WORKSHOP',   // (CONTACT) -[INQUIRED_WORKSHOP]-> (WORKSHOP)
}

// ── 3. ConfidenceTier Enum ─────────────────────────────────────────────────

export enum ConfidenceTier {
  PRELIMINARY = 'PRELIMINARY',     // Sơ bộ (50% - 65%), hiển thị Amber (vàng hổ phách)
  CONSOLIDATED = 'CONSOLIDATED',   // Củng cố (85% - 95%), hiển thị Emerald (xanh lá)
}

// ── 4. PersonaCluster Enum ─────────────────────────────────────────────────

export enum PersonaCluster {
  FNB_WORKSHOP_STUDENT = 'FNB_WORKSHOP_STUDENT',   // Học viên Workshop / Khởi nghiệp mở quán F&B
  FNB_SHOP_OWNER = 'FNB_SHOP_OWNER',               // Chủ quán Trà sữa / Cafe / Đồ ăn vặt
  WHOLESALE_DISTRIBUTOR = 'WHOLESALE_DISTRIBUTOR', // Đại lý phân phối / Nhập sỉ thùng lớn
  HOME_CAFE_RETAIL = 'HOME_CAFE_RETAIL',           // Khách tự pha chế tại nhà / Gia đình
  TRIAL_EXPLORER = 'TRIAL_EXPLORER',               // Khách mới tiếp cận / Chuộng gói mẫu thử
}

// ── 5. Persona Centroid Metadata ───────────────────────────────────────────

export interface IPersonaClusterMetadata {
  id: PersonaCluster;
  label: string;
  clusterBadge: string;
  description: string;
  defaultNeeds: string[];
  suggestedVoucher: string;
  recommendedProducts: string[];
  associatedTags: string[];
}

export const PERSONA_CLUSTERS_METADATA: Record<PersonaCluster, IPersonaClusterMetadata> = {
  [PersonaCluster.FNB_WORKSHOP_STUDENT]: {
    id: PersonaCluster.FNB_WORKSHOP_STUDENT,
    label: 'Học viên Workshop & Khởi nghiệp F&B',
    clusterBadge: 'Học viên WS',
    description: 'Khách hàng quan tâm các khóa đào tạo thực chiến, giáo trình công thức chuẩn quán, kỹ thuật pha chế và chuyển giao món hot-trend.',
    defaultNeeds: ['Lịch Workshop pha chế gần nhất', 'Giáo trình & bảng công thức chuẩn vị', 'Chính sách giữ vé ưu đãi Early Bird', 'Combo nguyên liệu thực hành sau buổi học'],
    suggestedVoucher: 'WS_EARLY_BIRD_15',
    recommendedProducts: [
      'TTL - Hồng Trà 500gr/gói (Teatreelife)',
      'Gấu Lermao - Trân châu vị TRÀ OLONG NHÀI 500gr',
      'Bột mochi sữa LABOONG 800gr',
    ],
    associatedTags: ['auto:workshop', 'auto:khoi_nghiep_fnb', 'auto:hoc_vien_ws'],
  },
  [PersonaCluster.FNB_SHOP_OWNER]: {
    id: PersonaCluster.FNB_SHOP_OWNER,
    label: 'Chủ quán Trà sữa / Cafe / Đồ ăn vặt',
    clusterBadge: 'Chủ quán',
    description: 'Chủ cửa hàng đồ uống hoặc ăn vặt đang vận hành, nhập nguyên liệu định kỳ theo thùng: hồng trà, trân châu, mứt sinh tố, bột sữa và thiết bị quầy bar.',
    defaultNeeds: ['Bảng giá sỉ nguyên liệu theo thùng', 'Công thức tính cost ly dưới 5.000đ', 'Date mới & nguồn cung ổn định', 'Hóa đơn VAT và hỗ trợ giao chành xe'],
    suggestedVoucher: 'FNB_SI_10',
    recommendedProducts: [
      'TTL - Hồng Trà 500gr/gói (25 Gói / Thùng)',
      'TTL - Mứt Ổi Hồng 1.36kg/hộp (6 Hộp / Thùng)',
      'Bột mochi sữa LABOONG 800gr (20 gói/thùng)',
      'Bột Sữa Chua LABOONG 800gr',
    ],
    associatedTags: ['auto:chu_quan', 'auto:mua_si_fnb', 'auto:chu_quan_tra_sua'],
  },
  [PersonaCluster.WHOLESALE_DISTRIBUTOR]: {
    id: PersonaCluster.WHOLESALE_DISTRIBUTOR,
    label: 'Đại lý phân phối & Nhập sỉ lớn theo tấn/pallet',
    clusterBadge: 'Đại lý sỉ',
    description: 'Đại lý nguyên liệu pha chế tỉnh hoặc chuỗi cửa hàng lớn, nhập khối lượng lớn (tấn/pallet) kèm máy móc thiết bị (bếp chiên, nồi nấu trân châu).',
    defaultNeeds: ['Chính sách chiết khấu bậc thang theo doanh số', 'Hợp đồng đại lý cấp 1', 'Bảo hành thiết bị máy móc', 'Hỗ trợ mẫu thử và tem nhãn độc quyền'],
    suggestedVoucher: 'NPP_VIP_LEVEL1',
    recommendedProducts: [
      'Đường Daesang 25kg',
      'Bột Sữa Wings Premium 1kg (12 gói/thùng)',
      'Bếp chiên đơn & Thiết bị quầy bar',
    ],
    associatedTags: ['auto:dai_ly_si', 'auto:npp_fnb', 'auto:nhap_pallet'],
  },
  [PersonaCluster.HOME_CAFE_RETAIL]: {
    id: PersonaCluster.HOME_CAFE_RETAIL,
    label: 'Khách tự pha chế tại nhà & Đồ uống gia đình',
    clusterBadge: 'Pha tại nhà',
    description: 'Khách hàng cá nhân tự làm trà sữa, trà trái cây giải khát cho gia đình hoặc văn phòng, ưu tiên mua lẻ 1-2 gói, túi zip tiện bảo quản tủ lạnh.',
    defaultNeeds: ['Công thức tự pha 3 bước đơn giản', 'Gói nhỏ túi zip tiện cất tủ lạnh', 'Chính sách Freeship đơn nhỏ'],
    suggestedVoucher: 'FREESHIP_HOME_20K',
    recommendedProducts: [
      'TTL - Mứt Ổi Hồng 1.36kg',
      'TTL - Trân châu nhân thanh mai 500g',
      'Bột Sữa Chua LABOONG 800gr',
    ],
    associatedTags: ['auto:pha_tai_nha', 'auto:khach_le_fnb'],
  },
  [PersonaCluster.TRIAL_EXPLORER]: {
    id: PersonaCluster.TRIAL_EXPLORER,
    label: 'Khách mới tìm hiểu & Khảo sát menu',
    clusterBadge: 'Dùng thử',
    description: 'Khách hàng mới tiếp cận Hi Sweetie, đang khảo sát vị trà và giá thành, chuộng gói mẫu thử 100g để kiểm chứng chất lượng vị trà trước khi nhập lớn.',
    defaultNeeds: ['Mẫu thử 100g các dòng trà bán chạy', 'Bảng menu và công thức mẫu', 'Tư vấn vị trà hợp gu địa phương'],
    suggestedVoucher: 'SAMPLE_FREE_100G',
    recommendedProducts: [
      'Mẫu Thử 100gr - PH - Trà Long Tỉnh Chi Xuân',
      'Mẫu Thử 100gr - PH - Hồng trà Sài Gòn',
      'Gấu Lermao - Mứt Nho Xanh 1kg',
    ],
    associatedTags: ['auto:dung_thu', 'auto:khach_moi_fnb'],
  },
};

// ── 6. Node & Edge Data Contracts ──────────────────────────────────────────

export interface ICkgNodeProperties {
  phone?: string;
  phoneNormalized?: string;
  zaloUid?: string;
  zaloName?: string;
  orderCount?: number;
  totalSpent?: number;
  lastTouchpoint?: string;
  lastTouchpointAt?: string;
  touchpointCount?: number;
  groupRole?: string;
  memberCount?: number;
  category?: string;
  price?: number;
  [key: string]: unknown;
}

export interface ICkgNode {
  id: string;                      // UUID định danh đỉnh (PostgreSQL primary key)
  orgId: string;                   // Tenant scoping
  entityType: CkgEntityType | string;
  entityId: string;                // ID thực thể nguồn (contactId, groupId, SKU, personaCode)
  label: string;                   // Tên hiển thị
  properties: ICkgNodeProperties;
  embedding?: number[] | null;     // 768-dim float vector
  createdAt: Date;
  updatedAt: Date;
}

export interface ICkgNodeInput {
  orgId: string;
  entityType: CkgEntityType | string;
  entityId: string;
  label: string;
  properties?: Record<string, unknown>;
  embedding?: number[];
}

export interface ICkgEdgeProperties {
  orderId?: string;
  amount?: number;
  messageId?: string;
  conversationId?: string;
  firstSeenAt?: string;
  lastSeenAt?: string;
  setExactWeight?: boolean;        // Khi true: ghi đè trực tiếp trọng số thay vì cộng dồn lũy tiến
  feedbackReason?: string;
  [key: string]: unknown;
}

export interface ICkgEdge {
  id: string;                      // UUID định danh cạnh
  orgId: string;
  sourceNodeId: string;            // Foreign key -> graph_nodes(id)
  targetNodeId: string;            // Foreign key -> graph_nodes(id)
  relationType: CkgRelationType | string;
  weight: number;                  // 0.0 -> 2.0
  properties: ICkgEdgeProperties;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICkgEdgeInput {
  orgId: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationType: CkgRelationType | string;
  weight?: number;
  properties?: Record<string, unknown>;
}

// ── 7. Touchpoint Events Contracts ─────────────────────────────────────────

export type TouchpointType =
  | 'CONTACT_CREATE'
  | 'CONTACT_UPDATE'
  | 'GROUP_JOIN'
  | 'GROUP_SCAN'
  | 'POS_ORDER'
  | 'POS_BILLING_DRAFT'
  | 'CHAT_MESSAGE'
  | 'SALE_FEEDBACK';

export interface ITouchpointPayloadItem {
  code?: string;
  productCode?: string;
  name?: string;
  productName?: string;
  quantity?: number;
  unitPrice?: number;
  price?: number;
}

export interface ITouchpointPayload {
  // Contact update fields
  fullName?: string;
  phone?: string;
  source?: string;
  tags?: string[];

  // Group fields
  groupId?: string;
  groupName?: string;
  role?: string;

  // Order & Billing draft fields
  orderId?: string;
  draftId?: string;
  totalAmount?: number;
  items?: ITouchpointPayloadItem[];

  // Message fields
  conversationId?: string;
  messageId?: string;
  content?: string;
  senderType?: 'customer' | 'staff';
  productMentions?: string[];

  // Feedback fields
  action?: 'CONFIRM' | 'EDIT' | 'REJECT' | 'OVERRIDE';
  personaId?: string;
  reason?: string;
  edgeId?: string;

  [key: string]: unknown;
}

export interface ITouchpointJob {
  orgId: string;
  contactId: string;
  touchpointType: TouchpointType;
  payload: ITouchpointPayload;
  timestamp: string;
}

// ── 8. Evidence Subgraph & Radar Response Contracts ────────────────────────

export interface ICkgSubgraphNode {
  id: string;
  type: string;
  label: string;
  properties?: Record<string, unknown>;
}

export interface ICkgSubgraphEdge {
  id?: string;
  source: string;
  target: string;
  relation: string;
  weight: number;
  properties?: Record<string, unknown>;
}

export interface ICkgSubgraphMetrics {
  sharedGroupsCount: number;
  totalOrdersCount: number;
  homophilyNeighborsCount: number;
}

export interface ICkgEvidenceSubgraph {
  nodes: ICkgSubgraphNode[];
  edges: ICkgSubgraphEdge[];
  metrics: ICkgSubgraphMetrics;
}

export interface IPersonaInfo {
  id: string;
  label: string;
  clusterBadge: string;
  headline?: string;
  summary: string;
  predictedNeeds: string[];
}

export interface IConfidenceInfo {
  score: number;                   // 0.00 -> 1.00
  percentage: number;              // 0 -> 100
  tier: ConfidenceTier;            // PRELIMINARY (50-65%) | CONSOLIDATED (85-95%)
  color: 'amber' | 'emerald';
}

export interface INextBestAction {
  actionType: string;              // 'SEND_ZALO_PROPOSAL' | 'SEND_DISCOUNT' | 'INVITE_VIP_GROUP'
  title: string;
  scriptText: string;
  suggestedProducts: string[];
  suggestedVoucher?: string;
}

export interface ICustomerRadarResponse {
  contactId: string;
  persona: IPersonaInfo;
  confidence: IConfidenceInfo;
  evidenceSubgraph: ICkgEvidenceSubgraph;
  nextBestAction: INextBestAction;
  cached: boolean;
  validUntil: string;
}

// ── 9. Human Feedback Contracts ────────────────────────────────────────────

export interface IRadarFeedbackInput {
  action: 'CONFIRM' | 'EDIT';
  confirmedPersonaId: string;
  reason?: string;
}

export interface IRadarFeedbackResponse {
  success: boolean;
  message: string;
  updatedConfidence: number;
}

// ── 10. Batch Operations & Ingestion Metrics ───────────────────────────────

export interface IBatchUpsertResult {
  insertedOrUpdated: number;
  durationMs: number;
  error?: string;
}

export interface ICkgIngestionStats {
  queuedNodes: number;
  queuedEdges: number;
  queuedTouchpoints: number;
  totalNodesFlushed: number;
  totalEdgesFlushed: number;
  totalTouchpointsProcessed: number;
  droppedNodes: number;
  droppedEdges: number;
  droppedTouchpoints: number;
  errorCount: number;
  lastFlushAt: Date | null;
  avgFlushDurationMs: number;
}

export interface IPersonaSeedResult {
  seededCount: number;
  orgCount: number;
  durationMs: number;
  clustersSeeded: string[];
}

// ── 11. Traversal & Lookalike Contracts (Milestone 2) ────────────────────────

export interface ITraversalOptions {
  minWeight?: number;        // Default: 0.5
  maxNodes?: number;         // Default: 50
  maxEdges?: number;         // Default: 100
}

export interface IVectorMatch {
  personaId: PersonaCluster;
  label: string;
  clusterBadge: string;
  cosineSimilarity: number;
  rank: number;
}

export interface IHybridLookalikeEvaluation {
  topPersonaId: PersonaCluster;
  topPersonaLabel: string;
  clusterBadge: string;
  vectorSimilarity: number;
  graphEvidenceScore: number;
  hybridScore: number;
  confidenceScore: number;
  confidencePercentage: number;
  confidenceTier: ConfidenceTier;
  color: 'amber' | 'emerald';
  allMatches: IVectorMatch[];
}

// ── 12. Progressive Confidence & Half-Life Time Decay Contracts (Milestone 3) ─

export type SignalDecayClass =
  | 'HUMAN_CONFIRMED'
  | 'TRANSACTIONAL'
  | 'MULTI_TOUCH'
  | 'WEAK_COLD_START';

export interface IConfidenceComponents {
  basePrior: number;              // 0.50
  preliminaryComponent: number;   // 0.0 - 0.15 (0.15 * S_hybrid)
  saturationFactor: number;       // sigma in [0.0, 1.0]
  coherenceFactor: number;        // psi in [0.0, 1.0]
  evidenceComponent: number;      // 0.0 - 0.30 (0.30 * sigma * psi)
  instantScore: number;           // Trước suy giảm [0.50, 0.95]
  alpha: number;                  // Trọng số thích ứng [0.15 - 0.80]
  hybridScore: number;            // S_hybrid [0.0, 1.0]
  graphEvidenceScore: number;     // S_graph [0.0, 1.0]
  vectorSimilarity: number;       // S_vector [0.0, 1.0]
  rankSeparationMargin: number;   // Delta S_rank
}

export interface ITimeDecayMetadata {
  lastEventAt: Date | string;
  evaluatedAt: Date | string;
  elapsedDays: number;
  halfLifeDays: number;           // 14d, 30d, 60d, 90d
  signalClass: SignalDecayClass;
  decayFactor: number;            // 2^(-dt / T_1/2)
  isDecayed: boolean;
  rawDecayedScore: number;
  finalScore: number;             // [0.50, 0.95]
}

export interface IConfidenceScoreResult {
  score: number;                   // 0.50 -> 0.95
  percentage: number;              // 50 -> 95
  tier: ConfidenceTier;            // PRELIMINARY (50-65%) | CONSOLIDATED (85-95%)
  color: 'amber' | 'emerald';
  components: IConfidenceComponents;
  timeDecay: ITimeDecayMetadata;
}

export interface IConfidenceEngineInput {
  vectorSimilarity: number;
  secondVectorSimilarity?: number;
  graphEvidenceSubgraph: ICkgEvidenceSubgraph;
  orderCount?: number;
  totalSpent?: number;
  touchpointCount?: number;
  humanFeedbackEdgeWeight?: number;
  lastEventAt?: Date | string | null;
  targetPersonaId?: PersonaCluster;
  referenceDate?: Date;
}

// ── 13. LLM Graph RAG Synthesizer Contracts (Milestone 3) ─────────────────────

export interface IVoucherRecommendation {
  code: string;
  rationale: string;
}

export interface IRiskAssessment {
  churnRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  priceSensitivity: 'LOW' | 'MEDIUM' | 'HIGH';
  notes: string;
}

export interface IRadarStructuredOutput {
  headline: string;
  synthesizedSummary: string;
  talkingPoints: [string, string, string] | string[];
  voucherRecommendation: IVoucherRecommendation;
  riskAssessment: IRiskAssessment;
  nextBestAction: {
    actionType: string;
    title: string;
    scriptText: string;
    suggestedProducts: string[];
    suggestedVoucher: string;
  };
  predictedNeeds: string[];
}

export interface ISynthesizerInput {
  orgId: string;
  contactId: string;
  contact: {
    fullName?: string | null;
    crmName?: string | null;
    zaloName?: string | null;
    phone?: string | null;
    source?: string | null;
    tags?: string[] | null;
    status?: string | null;
    posCustomerId?: number | null;
  };
  evidenceSubgraph: ICkgEvidenceSubgraph;
  lookalikeEval: IHybridLookalikeEvaluation;
  confidence: IConfidenceScoreResult | IConfidenceInfo;
  orderHistory?: {
    totalOrders: number;
    totalSpent: number;
    recentItems?: string[];
  };
  forceRefresh?: boolean;
}

export interface ISynthesizedProfileResult extends ICustomerRadarResponse {
  source: 'GEMINI_AI' | 'FALLBACK_RULE_ENGINE';
}

// ── 14. Radar API Payloads & Human Feedback Extended (Milestone 3) ────────────

export interface IRadarFeedbackRequest {
  action: 'CONFIRM' | 'REJECT' | 'OVERRIDE' | 'EDIT';
  targetCluster?: string;
  note?: string;
  confirmedPersonaId?: string;
  reason?: string;
}

export interface ICustomerRadarApiResponse {
  success: true;
  data: {
    contactId: string;
    contactMetadata: {
      fullName: string;
      phone: string | null;
      source: string | null;
      status: string | null;
      posCustomerId: number | null;
    };
    persona: {
      id: string;
      label: string;
      clusterBadge: string;
      headline?: string;
      summary: string;
      predictedNeeds: string[];
      talkingPoints?: string[];
    };
    confidence: {
      score: number;
      percentage: number;
      tier: ConfidenceTier | 'PRELIMINARY' | 'CONSOLIDATED';
      color: 'amber' | 'emerald';
      decayStatus?: {
        isDecayed: boolean;
        originalScore: number;
        daysSinceLastEvent: number;
      };
    };
    evidenceSubgraph: ICkgEvidenceSubgraph;
    nextBestAction: {
      actionType: string;
      title: string;
      scriptText: string;
      suggestedProducts: string[];
      suggestedVoucher?: string;
      voucherRationale?: string;
      riskAssessment?: string;
    };
    cached: boolean;
    validUntil: string;
  };
}


