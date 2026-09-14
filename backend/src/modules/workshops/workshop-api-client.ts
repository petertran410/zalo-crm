import { randomUUID } from 'crypto';
import { config } from '../../config/index.js';
import { logger } from '../../shared/utils/logger.js';

export interface ExternalWorkshopItem {
  id: string;
  slug: string;
  title?: string;
  name?: string;
  description?: string;
  location?: string;
  starts_at?: string;
  startsAt?: string;
  ends_at?: string;
  endsAt?: string;
  capacity?: number;
  status?: string;
  banner_url?: string;
  bannerUrl?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface ExternalGuestItem {
  id: string;
  workshop_id?: string;
  workshopId?: string;
  full_name?: string;
  fullName?: string;
  name?: string;
  phone: string;
  email?: string;
  party_size?: number;
  partySize?: number;
  status?: string;
  checkin_qr_code?: string;
  checkinQrCode?: string;
  qr_code?: string;
  registered_at?: string;
  registeredAt?: string;
  checked_in_at?: string;
  checkedInAt?: string;
  source?: string;
  notes?: string;
  [key: string]: unknown;
}

export interface ExternalCheckinLogItem {
  id: string;
  workshop_id: string;
  guest_id: string;
  scanned_at: string;
  method?: string;
  checked_in_by?: string;
  [key: string]: unknown;
}

export interface ExternalRegistrationFormItem {
  token: string;
  workshop_id: string;
  title?: string;
  description?: string;
  fields?: unknown[];
  is_active?: boolean;
  [key: string]: unknown;
}

export interface ExternalApiResponse<T> {
  data: T;
  meta: {
    page?: number;
    per_page?: number;
    total?: number;
    total_pages?: number;
  } | null;
  error: {
    code: string;
    message: string;
    details?: unknown;
  } | null;
}

export interface RateLimitState {
  limit: number | null;
  remaining: number | null;
  reset: number | null;
}

export class WorkshopApiClient {
  private rateLimit: RateLimitState = {
    limit: null,
    remaining: null,
    reset: null,
  };

  /**
   * Chuẩn hóa Base Path luôn đúng quy định: /api/public/v1
   */
  private get baseUrl(): string {
    let url = (config.workshopApiBaseUrl || '').trim().replace(/\/+$/, '');
    if (url && !url.includes('/api/public/v1')) {
      url = `${url}/api/public/v1`;
    }
    return url;
  }

  private get apiKey(): string {
    return (config.workshopApiKey || '').trim();
  }

  /** Kiểm tra hệ thống đã điền đủ thông tin URL và Key hay chưa */
  public isConfigured(): boolean {
    return Boolean(this.baseUrl && this.apiKey);
  }

  /** Trả về thông tin trạng thái kết nối và quota rate limit */
  public getStatus() {
    const configured = this.isConfigured();
    let keyHint = '';
    if (this.apiKey) {
      keyHint = this.apiKey.length > 8 ? `${this.apiKey.slice(0, 7)}...${this.apiKey.slice(-4)}` : '***';
    }

    const docs = configured ? {
      swagger: `${this.baseUrl}/docs`,
      redoc: `${this.baseUrl}/redoc`,
      openapi: `${this.baseUrl}/openapi.json`,
    } : null;

    return {
      configured,
      baseUrl: this.baseUrl || null,
      keyHint: keyHint || null,
      rateLimit: this.rateLimit,
      docs,
    };
  }

  private getHeaders(idempotencyKey?: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey,
    };
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }
    return headers;
  }

  /**
   * Gọi API công khai của Workshop với xử lý Rate Limit (429 Retry-After) và Envelope chuẩn
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    idempotencyKey?: string,
    retries = 1,
  ): Promise<ExternalApiResponse<T>> {
    if (!this.isConfigured()) {
      throw new Error('Chưa cấu hình WORKSHOP_API_BASE_URL hoặc WORKSHOP_API_KEY trong backend/.env');
    }

    const cleanPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${this.baseUrl}${cleanPath}`;

    const headers = {
      ...this.getHeaders(idempotencyKey),
      ...(options.headers as Record<string, string> || {}),
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      // Đọc và lưu Rate-limit headers từ phản hồi máy chủ
      const limitHeader = response.headers.get('x-ratelimit-limit');
      const remainingHeader = response.headers.get('x-ratelimit-remaining');
      const resetHeader = response.headers.get('x-ratelimit-reset');

      if (limitHeader) this.rateLimit.limit = parseInt(limitHeader, 10) || null;
      if (remainingHeader) this.rateLimit.remaining = parseInt(remainingHeader, 10) || null;
      if (resetHeader) this.rateLimit.reset = parseInt(resetHeader, 10) || null;

      // Xử lý khi gặp HTTP 429 Too Many Requests (Rate limit 120 req/min)
      if (response.status === 429 && retries > 0) {
        const retryAfterHeader = response.headers.get('retry-after');
        const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) || 2 : 2;
        logger.warn(`[workshop-api-client] Rate limit exceeded (429), chờ ${retryAfterSec}s rồi thử lại...`);
        await new Promise((resolve) => setTimeout(resolve, retryAfterSec * 1000));
        return this.request<T>(endpoint, options, idempotencyKey, retries - 1);
      }

      const json = await response.json() as ExternalApiResponse<T>;

      if (!response.ok) {
        let errorMsg = `HTTP ${response.status}: ${response.statusText}`;
        if (json?.error) {
          const errObj = json.error;
          const code = errObj.code ? `[${errObj.code}] ` : '';
          const details = errObj.details ? ` (${typeof errObj.details === 'object' ? JSON.stringify(errObj.details) : String(errObj.details)})` : '';
          errorMsg = `${code}${errObj.message || ''}${details}`;
        }
        logger.error(`[workshop-api-client] API error ${cleanPath}:`, json?.error || errorMsg);
        throw new Error(errorMsg);
      }

      return json;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[workshop-api-client] Request failed (${url}):`, msg);
      throw err;
    }
  }

  /** Kiểm tra kết nối tới server Workshop */
  public async testConnection(): Promise<{ ok: boolean; message?: string }> {
    if (!this.isConfigured()) {
      return { ok: false, message: 'Chưa cấu hình WORKSHOP_API_BASE_URL hoặc WORKSHOP_API_KEY' };
    }
    try {
      const res = await this.request<ExternalWorkshopItem[]>('/workshops?page=1&per_page=1');
      if (res.error) {
        return { ok: false, message: res.error.message };
      }
      return { ok: true, message: 'Kết nối thành công tới Workshop Public API' };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'Không kết nối được server Workshop' };
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 12 Endpoints Chuẩn theo public-api (2).md
  // ══════════════════════════════════════════════════════════════════════════

  /** 1. GET /workshops — Danh sách workshop (per_page tối đa 100) */
  public async fetchWorkshops(params?: { page?: number; per_page?: number }): Promise<ExternalApiResponse<ExternalWorkshopItem[]>> {
    const page = Math.max(1, params?.page ?? 1);
    const perPage = Math.min(Math.max(1, params?.per_page ?? 100), 100);
    return this.request<ExternalWorkshopItem[]>(`/workshops?page=${page}&per_page=${perPage}`);
  }

  /** 2. GET /workshops/{id-or-slug} — Chi tiết 1 workshop */
  public async fetchWorkshop(idOrSlug: string): Promise<ExternalApiResponse<ExternalWorkshopItem>> {
    return this.request<ExternalWorkshopItem>(`/workshops/${encodeURIComponent(idOrSlug)}`);
  }

  /** 3. GET /workshops/{slug}/landing — Dữ liệu landing page của workshop */
  public async fetchWorkshopLanding(slug: string): Promise<ExternalApiResponse<unknown>> {
    return this.request<unknown>(`/workshops/${encodeURIComponent(slug)}/landing`);
  }

  /** 4. GET /workshops/{workshop_id}/guests — Danh sách khách mời của workshop (per_page tối đa 100) */
  public async fetchWorkshopGuests(workshopIdOrSlug: string, params?: { page?: number; per_page?: number }): Promise<ExternalApiResponse<ExternalGuestItem[]>> {
    const page = Math.max(1, params?.page ?? 1);
    const perPage = Math.min(Math.max(1, params?.per_page ?? 100), 100);
    return this.request<ExternalGuestItem[]>(`/workshops/${encodeURIComponent(workshopIdOrSlug)}/guests?page=${page}&per_page=${perPage}`);
  }

  /** 5. POST /workshops/{workshop_id}/guests/self-register — Khách tự đăng ký (yêu cầu Idempotency-Key) */
  public async selfRegisterGuest(workshopId: string, data: Record<string, unknown>, idempotencyKey?: string): Promise<ExternalApiResponse<ExternalGuestItem>> {
    const finalIdempotencyKey = idempotencyKey || `reg-${randomUUID()}`;
    return this.request<ExternalGuestItem>(
      `/workshops/${encodeURIComponent(workshopId)}/guests/self-register`,
      { method: 'POST', body: JSON.stringify(data) },
      finalIdempotencyKey,
    );
  }

  /** 6. GET /guests/lookup — Tra cứu khách mời (theo SĐT, email...) */
  public async lookupGuests(query: Record<string, string | number>): Promise<ExternalApiResponse<ExternalGuestItem[]>> {
    const searchParams = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      searchParams.set(k, String(v));
    }
    return this.request<ExternalGuestItem[]>(`/guests/lookup?${searchParams.toString()}`);
  }

  /** 7. GET /guests/{guest_id} — Chi tiết khách mời */
  public async fetchGuest(guestId: string): Promise<ExternalApiResponse<ExternalGuestItem>> {
    return this.request<ExternalGuestItem>(`/guests/${encodeURIComponent(guestId)}`);
  }

  /** 8. GET /guests/{guest_id}/qr — Lấy dữ liệu mã QR của khách mời */
  public async fetchGuestQr(guestId: string): Promise<ExternalApiResponse<{ qr_code?: string; qr_url?: string; [key: string]: unknown }>> {
    return this.request<{ qr_code?: string; qr_url?: string }>(`/guests/${encodeURIComponent(guestId)}/qr`);
  }

  /** 9. POST /checkins — Thực hiện check-in (yêu cầu Idempotency-Key) */
  public async performCheckin(data: { qr_code?: string; guest_id?: string; workshop_id?: string; [key: string]: unknown }, idempotencyKey?: string): Promise<ExternalApiResponse<unknown>> {
    const finalIdempotencyKey = idempotencyKey || `checkin-${randomUUID()}`;
    return this.request<unknown>(
      '/checkins',
      { method: 'POST', body: JSON.stringify(data) },
      finalIdempotencyKey,
    );
  }

  /** 10. GET /checkins/logs — Xem nhật ký check-in (yêu cầu workshop_id, per_page tối đa 100) */
  public async fetchCheckinLogs(params?: { workshop_id?: string; page?: number; per_page?: number }): Promise<ExternalApiResponse<ExternalCheckinLogItem[]>> {
    const page = Math.max(1, params?.page ?? 1);
    const perPage = Math.min(Math.max(1, params?.per_page ?? 100), 100);
    const query = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
    });
    if (params?.workshop_id) {
      query.set('workshop_id', params.workshop_id);
    }
    return this.request<ExternalCheckinLogItem[]>(`/checkins/logs?${query.toString()}`);
  }

  /** 11. GET /registration-forms/{token} — Lấy cấu hình form đăng ký */
  public async fetchRegistrationForm(token: string): Promise<ExternalApiResponse<ExternalRegistrationFormItem>> {
    return this.request<ExternalRegistrationFormItem>(`/registration-forms/${encodeURIComponent(token)}`);
  }

  /** 12. POST /registration-forms/{token}/submissions — Gửi form đăng ký (yêu cầu Idempotency-Key) */
  public async submitRegistrationForm(token: string, data: Record<string, unknown>, idempotencyKey?: string): Promise<ExternalApiResponse<unknown>> {
    const finalIdempotencyKey = idempotencyKey || `sub-${randomUUID()}`;
    return this.request<unknown>(
      `/registration-forms/${encodeURIComponent(token)}/submissions`,
      { method: 'POST', body: JSON.stringify(data) },
      finalIdempotencyKey,
    );
  }
}

export const workshopApiClient = new WorkshopApiClient();
