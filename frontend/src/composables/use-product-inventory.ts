import { ref } from "vue";
import { api } from "@/api/index";

// ── Types ─────────────────────────────────────────────────────────────────────

export type InventoryStatus = "InStock" | "LowStock" | "OutOfStock" | "Unknown";

export interface ProductInventoryData {
  posProductId: number;
  branchId: number | null;
  branchName: string | null;
  onHand: number | null;
  available: number | null;
  reserved: number | null;
  minStockLevel: number | null;
  status: InventoryStatus;
  lastSyncedAt: string | null;
}

export interface InventoryState {
  loading: boolean;
  data: ProductInventoryData | null;
  error: string | null;
}

// ── Cache (session-level, TTL = 2 phút) ─────────────────────────────────────

const CACHE_TTL_MS = 2 * 60 * 1000; // 2 phút
const cache = new Map<string, { data: ProductInventoryData; expiresAt: number }>();

function getCacheKey(productId: number, branchId?: number | null): string {
  return `${productId}-${branchId ?? "all"}`;
}

function getFromCache(productId: number, branchId?: number | null): ProductInventoryData | null {
  const key = getCacheKey(productId, branchId);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setToCache(productId: number, branchId: number | null | undefined, data: ProductInventoryData): void {
  const key = getCacheKey(productId, branchId);
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ── Composable ────────────────────────────────────────────────────────────────

export function useProductInventory() {
  const inventoryState = ref<InventoryState>({
    loading: false,
    data: null,
    error: null,
  });

  /**
   * Fetch tồn kho sản phẩm từ CRM DB nội bộ.
   * - Nếu có branchId → lấy tồn kho chi nhánh cụ thể
   * - Nếu không có branchId → lấy tổng tất cả chi nhánh
   * Dùng cache 2 phút để tránh gọi API nhiều lần.
   */
  async function fetchInventory(productId: number, branchId?: number | null): Promise<ProductInventoryData | null> {
    const cached = getFromCache(productId, branchId);
    if (cached) {
      inventoryState.value = { loading: false, data: cached, error: null };
      return cached;
    }

    inventoryState.value = { loading: true, data: null, error: null };
    try {
      const params: Record<string, any> = { productId };
      if (branchId) params.branchId = branchId;

      const res = await api.get("/pos/inventory/product", { params });
      const data: ProductInventoryData = res.data?.data ?? {
        posProductId: productId,
        branchId: branchId ?? null,
        branchName: null,
        onHand: null,
        available: null,
        reserved: null,
        minStockLevel: null,
        status: "Unknown" as InventoryStatus,
        lastSyncedAt: null,
      };

      setToCache(productId, branchId, data);
      inventoryState.value = { loading: false, data, error: null };
      return data;
    } catch (err: any) {
      const errorMsg = err?.response?.data?.error || err?.message || "Không thể tải tồn kho";
      inventoryState.value = { loading: false, data: null, error: errorMsg };
      return null;
    }
  }

  /** Xoá cache của 1 sản phẩm (dùng sau khi đơn được tạo thành công) */
  function invalidateCache(productId: number, branchId?: number | null): void {
    cache.delete(getCacheKey(productId, branchId));
  }

  return {
    inventoryState,
    fetchInventory,
    invalidateCache,
  };
}
