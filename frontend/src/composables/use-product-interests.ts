/**
 * use-product-interests.ts
 *
 * Composable quản lý dữ liệu sản phẩm đang quan tâm bóc tách từ chat Zalo:
 * - Lấy danh sách sản phẩm
 * - Kích hoạt quét AI từ chat
 * - Cập nhật trạng thái / thông tin sản phẩm
 * - Xóa sản phẩm kèm ghi chú giải trình của Sales
 */
import { ref, computed } from 'vue';
import { api } from '@/api/index';
import { useToast } from '@/composables/use-toast';

export interface RelatedProductPreviewItem {
  posId: number;
  code: string;
  name: string;
  basePrice: number | null;
  imageUrl: string | null;
  initials: string;
  totalAvailable: number;
}

export interface PosBranchStockItem {
  branchId: number;
  branchName: string;
  onHand: number;
  available: number;
  status: string;
}

export interface PosDetailedProductItem {
  posId: number;
  code: string;
  name: string;
  basePrice: number | null;
  imageUrl: string | null;
  initials: string;
  totalAvailable: number;
  totalOnHand: number;
  status: string;
  branches: PosBranchStockItem[];
}

export interface ProductInterestItem {
  id: string;
  orgId?: string | null;
  contactId: string;
  customerName?: string | null;
  scannedByUserId?: string | null;
  scannedByName?: string | null;
  productName: string;
  intent?: string | null;
  notes?: string | null;
  status: string; // 'inquiring' | 'quoted' | 'converted' | 'deleted'
  isDeleted: boolean;
  salesDeleteNote?: string | null;
  relatedProductsPreview?: RelatedProductPreviewItem[];
  hasMoreRelated?: boolean;
  scannedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface LastScanInfo {
  scannedAt: string;
  scannedByName?: string | null;
  scannedByUserId?: string | null;
}

export function useProductInterests(getContactId: () => string | null | undefined) {
  const toast = useToast();
  const items = ref<ProductInterestItem[]>([]);
  const lastScanInfo = ref<LastScanInfo | null>(null);
  const loading = ref(false);
  const scanning = ref(false);
  const saving = ref(false);

  const count = computed(() => items.value.length);

  async function fetchInterests() {
    const contactId = getContactId();
    if (!contactId) {
      items.value = [];
      lastScanInfo.value = null;
      return;
    }

    loading.value = true;
    try {
      const { data } = await api.get(`/contacts/${contactId}/product-interests`);
      items.value = data.items || [];
      lastScanInfo.value = data.lastScanInfo || null;
    } catch (err: any) {
      console.error('[useProductInterests] Fetch error:', err);
      items.value = [];
      lastScanInfo.value = null;
    } finally {
      loading.value = false;
    }
  }

  async function scanInterests() {
    const contactId = getContactId();
    if (!contactId) return null;

    scanning.value = true;
    try {
      const { data } = await api.post(`/contacts/${contactId}/product-interests/scan`, {}, { timeout: 60000 });
      if (data.data) {
        items.value = data.data.items || [];
        lastScanInfo.value = data.data.lastScanInfo || null;
      }
      if (Array.isArray(data.scannedMessageIds)) {
        window.dispatchEvent(
          new CustomEvent('chat:ai-scanned', {
            detail: {
              contactId,
              scannedMessageIds: data.scannedMessageIds,
            },
          })
        );
      }
      if (data.success) {
        toast.success(data.message || 'Quét nhu cầu từ chat thành công!');
      } else {
        toast.info(data.message || 'Không tìm thấy sản phẩm nào trong chat.');
      }
      return data;
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Lỗi khi kết nối với Gemini AI để phân tích.';
      toast.error(msg);
      throw err;
    } finally {
      scanning.value = false;
    }
  }

  async function updateInterest(interestId: string, payload: Partial<ProductInterestItem>) {
    const contactId = getContactId();
    if (!contactId) return null;

    saving.value = true;
    try {
      const { data } = await api.patch(`/contacts/${contactId}/product-interests/${interestId}`, payload);
      if (data.success && data.item) {
        const idx = items.value.findIndex((i) => i.id === interestId);
        if (idx !== -1) {
          items.value[idx] = { ...items.value[idx], ...data.item };
        }
        toast.success('Cập nhật thông tin sản phẩm thành công.');
      }
      return data.item;
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Không thể cập nhật sản phẩm.';
      toast.error(msg);
      throw err;
    } finally {
      saving.value = false;
    }
  }

  async function deleteInterest(interestId: string, salesDeleteNote: string) {
    const contactId = getContactId();
    if (!contactId) return false;

    if (!salesDeleteNote || !salesDeleteNote.trim()) {
      toast.error('Vui lòng nhập lý do xóa để lưu lại lịch sử kiểm toán.');
      return false;
    }

    saving.value = true;
    try {
      const { data } = await api.delete(`/contacts/${contactId}/product-interests/${interestId}`, {
        data: { salesDeleteNote: salesDeleteNote.trim() },
      });
      if (data.success) {
        items.value = items.value.filter((i) => i.id !== interestId);
        toast.success('Đã xóa sản phẩm khỏi danh sách quan tâm.');
        return true;
      }
      return false;
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Không thể xóa sản phẩm.';
      toast.error(msg);
      throw err;
    } finally {
      saving.value = false;
    }
  }

  async function checkPosInventory(keyword: string): Promise<PosDetailedProductItem[]> {
    if (!keyword || !keyword.trim()) return [];
    try {
      const { data } = await api.get('/contacts/product-interests/check-inventory', {
        params: { keyword: keyword.trim(), limit: 15 },
      });
      return data.items || [];
    } catch (err: any) {
      console.error('[useProductInterests] Check POS inventory error:', err);
      return [];
    }
  }

  return {
    items,
    lastScanInfo,
    loading,
    scanning,
    saving,
    count,
    fetchInterests,
    scanInterests,
    updateInterest,
    deleteInterest,
    checkPosInventory,
  };
}
