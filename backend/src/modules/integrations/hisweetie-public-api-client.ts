import { config } from '../../config/index.js';
import { logger } from '../../shared/utils/logger.js';

export type PublicApiListResponse<T> = {
  total?: number;
  pageSize?: number;
  currentItem?: number;
  data?: T[];
  /**
   * Mốc thời gian CỦA MÁY CHỦ POS lúc trả kết quả (ISO 8601).
   * Doc mục 4 yêu cầu dùng chính giá trị này cho `lastModifiedFrom` lần sau —
   * lấy giờ máy CRM sẽ lệch đồng hồ giữa hai bên và bỏ sót bản ghi.
   */
  timestamp?: string;
};

type TokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
};

export type PublicApiListParams = {
  page?: number;
  limit?: number;
  fromDate?: string;
  toDate?: string;
  status?: string;
  includeInactive?: boolean;
  lastModifiedFrom?: string;
  branchIds?: string;
  currentItem?: number;
  pageSize?: number;
  search?: string;
  include?: string;
};

/** Shape ghi khách hàng — đúng ví dụ PUBLIC-API.md §6 (POS từ chối trường lạ). */
export type PublicApiCustomerWrite = {
  name: string;
  contactNumber: string;
  addresses?: Array<{
    address: string;
    newCityCode?: string;
    newCityName?: string;
    newWardName?: string;
    isDefault?: boolean;
  }>;
};

/** Shape tạo đơn — đúng ví dụ PUBLIC-API.md §6 "Tạo đơn hàng". */
export type PublicApiOrderWrite = {
  branchId: number;
  customerId: number;
  items: Array<{
    productId: number;
    quantity: number;
    unitPrice: number;
  }>;
};

/** Ném ra khi POS trả 429 — để tầng gọi nhận biết và chờ đúng cách. */
export class PublicApiRateLimitError extends Error {
  constructor(public readonly retryAfterMs: number) {
    // Giữ chuỗi 'rate_limit_exceeded' vì pos-sync-service dò lỗi theo message.
    super(`rate_limit_exceeded: POS Public API trả 429, chờ ${Math.round(retryAfterMs / 1000)}s`);
    this.name = 'PublicApiRateLimitError';
  }
}

/**
 * Ném ra khi không chạm được máy chủ POS sau khi đã thử lại hết lượt.
 * Tách riêng khỏi lỗi nghiệp vụ để UI hiển thị thông điệp dễ hiểu, và để
 * người vận hành biết đây là sự cố kết nối chứ không phải dữ liệu sai.
 */
export class PublicApiUnreachableError extends Error {
  constructor(public readonly path: string, public readonly attempts: number, cause?: unknown) {
    super(`pos_unreachable: Không kết nối được máy chủ POS (${path}) sau ${attempts} lần thử`);
    this.name = 'PublicApiUnreachableError';
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

/** Số lần thử tối đa cho mỗi request khi gặp lỗi tầng vận chuyển. */
const MAX_NETWORK_RETRIES = 5;
/** Backoff 1s → 2s → 4s → 8s: phủ được một lần restart của POS backend. */
const NETWORK_RETRY_BASE_MS = 1000;

/**
 * Lỗi tầng vận chuyển (POS chưa kịp lên, đứt mạng, DNS trượt) — thử lại được.
 * `fetch` của undici gói lỗi thật vào `cause`, nên phải soi cả tầng dưới.
 * KHÔNG gộp 4xx/5xx vào đây: lỗi nghiệp vụ thì thử lại chỉ tốn hạn mức.
 */
const RETRYABLE_NETWORK_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'EPIPE',
  'ENOTFOUND',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

export function isRetryableNetworkError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: string }).code;
  if (code && RETRYABLE_NETWORK_CODES.has(code)) return true;
  // AggregateError của undici gom lỗi từng địa chỉ IP vào `errors`.
  const errors = (err as { errors?: unknown[] }).errors;
  if (Array.isArray(errors) && errors.some((e) => isRetryableNetworkError(e))) return true;
  const cause = (err as { cause?: unknown }).cause;
  if (cause && isRetryableNetworkError(cause)) return true;
  // undici ném TypeError('fetch failed') và giấu nguyên nhân thật ở cause.
  return err instanceof TypeError && /fetch failed|network|socket/i.test(err.message);
}

/**
 * Client REST cho POS Public API.
 *
 * POS giới hạn 5000 request/giờ cho mỗi client OAuth. Toàn bộ luồng đồng bộ của
 * CRM (khách hàng, hàng hoá, đơn, hoá đơn, tồn kho, cron, worker) dùng CHUNG một
 * client này, nên hàng đợi + giãn nhịp phải đặt ở đây thì mới kiểm soát được
 * tổng số request. Đặt ở từng chỗ gọi sẽ vỡ ngay khi hai luồng chạy song song.
 */
export class HisweetiePublicApiClient {
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;
  /** Hàng đợi tuần tự: mọi request nối đuôi nhau, không bắn song song. */
  private queue: Promise<unknown> = Promise.resolve();
  private lastRequestAt = 0;

  constructor(
    baseUrl = config.hisweetiePublicApiUrl,
    private readonly clientId = config.hisweetiePublicApiClientId,
    private readonly clientSecret = config.hisweetiePublicApiClientSecret,
    /** 5000 req/giờ ≈ 1 req/720ms. Để 800ms cho có biên an toàn. */
    private readonly minIntervalMs = config.hisweetiePublicApiMinIntervalMs,
  ) {
    this.baseUrl = normalizePublicApiBaseUrl(baseUrl);
  }

  private readonly baseUrl: string;

  isConfigured(): boolean {
    return Boolean(this.baseUrl && this.clientId && this.clientSecret);
  }

  async getToken(): Promise<TokenResponse> {
    this.assertConfigured();
    const response = await this.fetchWithNetworkRetry(
      `${API_PREFIX}/oauth/token`,
      () => fetch(`${this.baseUrl}${API_PREFIX}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.clientId,
          client_secret: this.clientSecret,
        }),
      }),
    );
    return this.parseResponse<TokenResponse>(response);
  }

  listCustomers(params: PublicApiListParams = {}) {
    return this.list('customers', params);
  }

  listProducts(params: PublicApiListParams = {}) {
    return this.list('products', params);
  }

  listOrders(params: PublicApiListParams = {}) {
    return this.list('orders', params);
  }

  listInvoices(params: PublicApiListParams = {}) {
    return this.list('invoices', params);
  }

  listBranches(params: PublicApiListParams = {}) {
    return this.list('branches', params);
  }

  listInventories(params: PublicApiListParams = {}) {
    return this.list('inventories', params);
  }

  /** Tìm khách theo tên/mã/điện thoại — thay cho customers.search của MCP. */
  searchCustomers(keyword: string, pageSize = 20) {
    return this.list('customers', { search: keyword, pageSize });
  }

  getCustomer(id: number) {
    return this.request<Record<string, unknown>>(`/customers/${id}`);
  }

  /* ── Ghi dữ liệu (doc §6, §7) ─────────────────────────────────────────────
   * POS bật kiểm tra nghiêm ngặt: gửi thừa trường không có trong đặc tả → 400.
   * Vì repo không có public-api.openapi.yaml, payload chỉ gửi ĐÚNG các trường
   * xuất hiện trong ví dụ của PUBLIC-API.md §6 — không thêm field "cho chắc".
   * Mọi thao tác ghi đều bắt buộc Idempotency-Key (UUID) — retry cùng khoá POS
   * trả lại kết quả cũ thay vì tạo bản ghi trùng.
   */

  /** POST /customers — trả 201. Payload: {name, contactNumber, addresses?}. */
  createCustomer(payload: PublicApiCustomerWrite, idempotencyKey: string) {
    return this.write<Record<string, unknown>>('POST', '/customers', payload, idempotencyKey);
  }

  /** PUT /customers/{id} — trả 200. Cùng shape với create. */
  updateCustomer(id: number, payload: PublicApiCustomerWrite, idempotencyKey: string) {
    return this.write<Record<string, unknown>>('PUT', `/customers/${id}`, payload, idempotencyKey);
  }

  /**
   * DELETE /customers/{id} — KHÔNG xoá cứng, chỉ đặt isActive=false (doc §6).
   * An toàn khi gọi lại nên KHÔNG cần Idempotency-Key (doc §7).
   */
  deactivateCustomer(id: number) {
    return this.write<Record<string, unknown>>('DELETE', `/customers/${id}`, undefined, '');
  }

  /** POST /orders — trả 201. Payload tối thiểu: {branchId, customerId, items}. */
  createOrder(payload: PublicApiOrderWrite, idempotencyKey: string) {
    return this.write<Record<string, unknown>>('POST', '/orders', payload, idempotencyKey);
  }

  /** PUT /orders/{id}/cancel — trả 200. cancelPayments: huỷ kèm phiếu thu. */
  cancelOrder(id: number, idempotencyKey: string, cancelPayments = false) {
    return this.write<Record<string, unknown>>('PUT', `/orders/${id}/cancel`, { cancelPayments }, idempotencyKey);
  }

  /**
   * Quy đổi tham số kiểu MCP (`page`/`limit`/`fromDate`) sang kiểu Public API
   * (`currentItem`/`pageSize`/`lastModifiedFrom`) để các hàm đồng bộ sẵn có gọi
   * được mà không phải viết lại vòng phân trang.
   */
  private list(resource: string, params: PublicApiListParams) {
    const pageSize = params.pageSize ?? params.limit ?? 100;
    const currentItem = params.currentItem
      ?? (params.page && params.page > 0 ? (params.page - 1) * pageSize : 0);

    const query = new URLSearchParams();
    query.set('currentItem', String(currentItem));
    query.set('pageSize', String(Math.min(pageSize, 100)));
    if (params.search) query.set('search', params.search);
    // KHÔNG gửi `includeInactive` = POS mặc định false = chỉ trả bản ghi CÒN
    // HOẠT ĐỘNG (doc mục 3). Chỉ gửi khi caller thật sự cần cả bản ghi đã ngừng.
    if (params.includeInactive) query.set('includeInactive', 'true');
    const lastModifiedFrom = params.lastModifiedFrom ?? params.fromDate;
    if (lastModifiedFrom) query.set('lastModifiedFrom', lastModifiedFrom);
    if (params.toDate) query.set('lastModifiedTo', params.toDate);
    if (params.status) query.set('status', params.status);
    if (params.branchIds) query.set('branchIds', params.branchIds);
    if (params.include) query.set('include', params.include);

    return this.request<PublicApiListResponse<Record<string, unknown>>>(
      `/${resource}?${query.toString()}`,
    );
  }

  /** Xếp hàng + giãn nhịp: đây là chốt chặn duy nhất trước khi chạm POS. */
  private request<T>(path: string): Promise<T> {
    const run = this.queue.then(
      () => this.executeThrottled<T>(path),
      () => this.executeThrottled<T>(path),
    );
    // Nuốt lỗi ở nhánh hàng đợi để một request hỏng không kéo sập các request sau.
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Ghi dữ liệu qua cùng hàng đợi giãn nhịp — retry 401/429 giống request(). */
  private write<T>(method: 'POST' | 'PUT' | 'DELETE', path: string, body: unknown, idempotencyKey: string): Promise<T> {
    const run = this.queue.then(
      () => this.executeThrottled<T>(path, true, method, body, idempotencyKey),
      () => this.executeThrottled<T>(path, true, method, body, idempotencyKey),
    );
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async executeThrottled<T>(
    path: string,
    retryOn401 = true,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<T> {
    const waitMs = this.lastRequestAt + this.minIntervalMs - Date.now();
    if (waitMs > 0) await sleep(waitMs);
    this.lastRequestAt = Date.now();

    const token = await this.getAccessToken();
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

    const response = await this.fetchWithNetworkRetry(
      path,
      () => fetch(`${this.baseUrl}${API_PREFIX}${path}`, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      }),
    );

    if (response.status === 401 && retryOn401) {
      // Token hết hạn hoặc bị xoay vòng → lấy token mới rồi thử đúng một lần.
      this.accessToken = null;
      this.tokenExpiresAt = 0;
      return this.executeThrottled<T>(path, false);
    }

    if (response.status === 429) {
      const retryAfterMs = parseRetryAfter(response.headers.get('retry-after')) ?? 60_000;
      logger.warn(`[hisweetie-public-api] 429 cho ${path}, chờ ${Math.round(retryAfterMs / 1000)}s`);
      // Chặn luôn hàng đợi: các request kế tiếp cũng phải chờ hết cửa sổ phạt.
      this.lastRequestAt = Date.now() + retryAfterMs;
      throw new PublicApiRateLimitError(retryAfterMs);
    }

    return this.parseResponse<T>(response);
  }

  /**
   * Thử lại khi POS chưa chạm tới được (restart, đứt mạng thoáng qua).
   * Đặt ở đây vì đây là điểm duy nhất mọi luồng đồng bộ đi qua — vá từng vòng
   * lặp phân trang sẽ sót và lệch nhau.
   *
   * Chỉ thử lại lỗi TẦNG VẬN CHUYỂN. Lỗi HTTP (4xx/5xx) trả về nguyên vẹn cho
   * `parseResponse` xử lý: retry lỗi nghiệp vụ chỉ tốn hạn mức 5000 req/giờ.
   */
  private async fetchWithNetworkRetry(
    path: string,
    doFetch: () => Promise<Response>,
  ): Promise<Response> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= MAX_NETWORK_RETRIES; attempt++) {
      try {
        return await doFetch();
      } catch (err) {
        lastErr = err;
        if (!isRetryableNetworkError(err)) throw err;
        if (attempt === MAX_NETWORK_RETRIES) break;

        const waitMs = NETWORK_RETRY_BASE_MS * 2 ** (attempt - 1);
        logger.warn(
          `[hisweetie-public-api] Không nối được POS cho ${path} `
          + `(lần ${attempt}/${MAX_NETWORK_RETRIES}), thử lại sau ${waitMs / 1000}s`,
        );
        await sleep(waitMs);
        // Giữ nhịp chung: lần thử lại cũng tính vào hạn mức của POS.
        this.lastRequestAt = Date.now();
      }
    }
    throw new PublicApiUnreachableError(path, MAX_NETWORK_RETRIES, lastErr);
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) return this.accessToken;
    const token = await this.getToken();
    if (!token.access_token || typeof token.access_token !== 'string') {
      throw new Error('Hisweetie Public API trả token không hợp lệ');
    }
    this.accessToken = token.access_token;
    this.tokenExpiresAt = Date.now() + Math.max(30, (token.expires_in ?? 300) - 30) * 1000;
    return this.accessToken;
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new Error(
        'Hisweetie Public API chưa cấu hình. Đặt HISWEETIE_PUBLIC_API_URL, HISWEETIE_PUBLIC_API_CLIENT_ID và HISWEETIE_PUBLIC_API_CLIENT_SECRET.',
      );
    }
  }

  private async parseResponse<T>(response: Response): Promise<T> {
    const text = await response.text();
    let body: unknown;
    try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }
    if (!response.ok) {
      const detail = typeof body === 'object' && body !== null ? JSON.stringify(body) : String(body ?? '');
      throw new Error(`Hisweetie Public API ${response.status}: ${detail}`);
    }
    return body as T;
  }
}

/** Mọi endpoint public của POS đều nằm dưới tiền tố này, kể cả /oauth/token. */
const API_PREFIX = '/api/public/v1';

/**
 * Chấp nhận cả origin trần lẫn URL đã kèm sẵn /api/public/v1, tránh tạo ra
 * đường dẫn lặp kiểu /api/public/v1/api/public/v1/customers.
 */
function normalizePublicApiBaseUrl(value: string): string {
  return value.replace(/\/+$/, '').replace(/\/api\/public\/v1$/i, '');
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** `Retry-After` có thể là số giây hoặc HTTP-date. */
function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(1000, seconds * 1000);
  const date = Date.parse(value);
  if (Number.isNaN(date)) return null;
  return Math.max(1000, date - Date.now());
}

let singleton: HisweetiePublicApiClient | null = null;

export function getHisweetiePublicApiClient(): HisweetiePublicApiClient {
  if (!singleton) singleton = new HisweetiePublicApiClient();
  return singleton;
}

export function resetHisweetiePublicApiClient(): void {
  singleton = null;
}

/** Bật đường REST khi đã chọn transport và có đủ cấu hình. */
export function isPublicApiSyncEnabled(): boolean {
  return (
    config.hisweetieSyncTransport === 'public_api'
    && getHisweetiePublicApiClient().isConfigured()
  );
}
