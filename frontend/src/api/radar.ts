/**
 * radar.ts — Smart Customer Radar & Feedback Loop Frontend API Client (Milestone 4 §R4)
 *
 * Provides client-side access to:
 * - GET  /api/v1/contacts/:id/radar
 * - POST /api/v1/contacts/:id/radar/feedback
 */
import { api } from './index';

// ── 1. Persona & Confidence Types ───────────────────────────────────────────

export type PersonaClusterId =
  | 'FNB_WORKSHOP_STUDENT'
  | 'FNB_SHOP_OWNER'
  | 'WHOLESALE_DISTRIBUTOR'
  | 'HOME_CAFE_RETAIL'
  | 'TRIAL_EXPLORER';

export type ConfidenceTier = 'PRELIMINARY' | 'CONSOLIDATED';

export type ConfidenceColor = 'amber' | 'emerald';

export type FeedbackAction = 'CONFIRM' | 'REJECT' | 'OVERRIDE' | 'EDIT';

// ── 2. Radar Domain Sub-Interfaces ──────────────────────────────────────────

export interface IRadarContactMetadata {
  fullName: string;
  phone: string | null;
  source: string | null;
  status: string | null;
  posCustomerId: number | null;
}

export interface IRadarPersona {
  id: PersonaClusterId | string;
  label: string;
  clusterBadge: string;
  headline?: string;
  summary: string;
  predictedNeeds: string[];
  talkingPoints?: string[];
}

export interface IRadarConfidenceDecayStatus {
  isDecayed: boolean;
  originalScore: number;
  daysSinceLastEvent: number;
}

export interface IRadarConfidence {
  score: number;        // Range: 0.50 - 0.95
  percentage: number;   // Range: 50 - 95
  tier: ConfidenceTier;
  color: ConfidenceColor;
  decayStatus?: IRadarConfidenceDecayStatus;
}

export interface IRadarEvidenceNode {
  id: string;
  type: string;
  label: string;
  properties?: Record<string, unknown>;
}

export interface IRadarEvidenceEdge {
  source: string;
  target: string;
  relation: string;
  weight: number;
  properties?: Record<string, unknown>;
}

export interface IRadarEvidenceMetrics {
  sharedGroupsCount: number;
  totalOrdersCount: number;
  homophilyNeighborsCount: number;
  touchpointCount?: number;
}

export interface IRadarEvidenceSubgraph {
  nodes: IRadarEvidenceNode[];
  edges: IRadarEvidenceEdge[];
  metrics: IRadarEvidenceMetrics;
}

export interface IRadarNextBestAction {
  actionType: string;
  title: string;
  scriptText: string;
  suggestedProducts: string[];
  suggestedVoucher?: string;
  voucherRationale?: string;
  riskAssessment?: string;
}

// ── 3. Radar API Response Contracts ─────────────────────────────────────────

export interface ICustomerRadarData {
  contactId: string;
  contactMetadata?: IRadarContactMetadata;
  persona: IRadarPersona;
  confidence: IRadarConfidence;
  evidenceSubgraph: IRadarEvidenceSubgraph;
  nextBestAction: IRadarNextBestAction;
  cached: boolean;
  validUntil: string;
}

export interface ICustomerRadarApiResponse {
  success: boolean;
  data: ICustomerRadarData;
  error?: string;
}

// ── 4. Feedback Request & Response Contracts ────────────────────────────────

export interface IRadarFeedbackRequest {
  action: FeedbackAction;
  confirmedPersonaId?: PersonaClusterId | string;
  targetCluster?: PersonaClusterId | string;
  reason?: string;
  note?: string;
}

export interface IRadarFeedbackResponse {
  success: boolean;
  message: string;
  updatedConfidence: number;
  data?: ICustomerRadarData;
  error?: string;
}

// ── 5. Exported API Client Methods ──────────────────────────────────────────

/**
 * Lấy chân dung khách hàng Smart Customer Radar.
 *
 * @param contactId ID của Contact trong hệ thống CRM
 * @param forceRefresh Ép buộc vô hiệu hóa cache 24h và chạy lại pipeline phân tích CKG
 * @returns Promise chứa dữ liệu ICustomerRadarData
 */
export async function fetchContactRadar(
  contactId: string,
  forceRefresh: boolean = false
): Promise<ICustomerRadarData> {
  if (!contactId) {
    throw new Error('[radarApi] contactId is required to fetch Customer Radar');
  }

  const { data } = await api.get<ICustomerRadarApiResponse>(
    `/contacts/${encodeURIComponent(contactId)}/radar`,
    {
      params: forceRefresh ? { forceRefresh: 'true' } : undefined,
    }
  );

  if (!data || !data.success || !data.data) {
    throw new Error(data?.error || 'Failed to retrieve Customer Radar data');
  }

  return data.data;
}

/** Alias for fetchContactRadar */
export const fetchCustomerRadar = fetchContactRadar;

/**
 * Gửi phản hồi Human-in-the-loop từ Sale (Xác nhận, Bác bỏ hoặc Thay đổi Persona).
 *
 * @param contactId ID của Contact
 * @param feedback Payload phản hồi chứa hành động và lý do
 * @returns Promise chứa kết quả cập nhật và dữ liệu Radar mới sau khi tái tổng hợp
 */
export async function submitRadarFeedback(
  contactId: string,
  feedback: IRadarFeedbackRequest
): Promise<IRadarFeedbackResponse> {
  if (!contactId) {
    throw new Error('[radarApi] contactId is required to submit feedback');
  }

  const { data } = await api.post<IRadarFeedbackResponse>(
    `/contacts/${encodeURIComponent(contactId)}/radar/feedback`,
    feedback
  );

  if (!data || !data.success) {
    throw new Error(data?.error || 'Failed to submit Customer Radar feedback');
  }

  return data;
}
