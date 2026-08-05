import { ref } from "vue";
import { api } from "@/api/index";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PriceHistoryItem {
  orderCode: string;
  orderDate: string | null;
  branchName: string | null;
  productName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  totalPrice: number;
  isGift: boolean;
}

export interface PriceHistoryState {
  loading: boolean;
  data: PriceHistoryItem[];
  error: string | null;
}

// ── Cache (session-level) ─────────────────────────────────────────────────────
// Cache theo cặp (posCustomerId, posProductId) — hết hiệu lực khi đổi khách hoặc sản phẩm

const cache = new Map<string, PriceHistoryItem[]>();

function getCacheKey(posCustomerId: number, posProductId: number): string {
  return `${posCustomerId}-${posProductId}`;
}

// ── Composable ────────────────────────────────────────────────────────────────

export function usePriceHistory() {
  const priceHistoryState = ref<PriceHistoryState>({
    loading: false,
    data: [],
    error: null,
  });

  /**
   * Fetch lịch sử giá mua của khách hàng cho một sản phẩm cụ thể.
   * Sử dụng cache session (không có TTL — reset khi đổi khách/sản phẩm).
   */
  async function fetchPriceHistory(
    posCustomerId: number | null | undefined,
    posProductId: number | null | undefined,
    limit = 5
  ): Promise<PriceHistoryItem[]> {
    if (!posCustomerId || !posProductId) {
      priceHistoryState.value = { loading: false, data: [], error: null };
      return [];
    }

    const key = getCacheKey(posCustomerId, posProductId);
    const cached = cache.get(key);
    if (cached) {
      priceHistoryState.value = { loading: false, data: cached, error: null };
      return cached;
    }

    priceHistoryState.value = { loading: true, data: [], error: null };
    try {
      const res = await api.get("/pos/orders/price-history", {
        params: { posCustomerId, posProductId, limit },
      });
      const data: PriceHistoryItem[] = res.data?.data ?? [];

      cache.set(key, data);
      priceHistoryState.value = { loading: false, data, error: null };
      return data;
    } catch (err: any) {
      const errorMsg = err?.response?.data?.error || err?.message || "Không thể tải lịch sử giá";
      priceHistoryState.value = { loading: false, data: [], error: errorMsg };
      return [];
    }
  }

  /** Xoá cache lịch sử giá — gọi khi đơn hàng mới được tạo thành công */
  function invalidatePriceHistory(posCustomerId: number, posProductId: number): void {
    cache.delete(getCacheKey(posCustomerId, posProductId));
  }

  return {
    priceHistoryState,
    fetchPriceHistory,
    invalidatePriceHistory,
  };
}
