import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useWorkScope } from '@/composables/use-work-scope';
import { api } from '@/api/index';

export interface DelegatedSalesAccount {
  id: string;
  displayName?: string;
  avatarUrl?: string | null;
  isOnline?: boolean;
}

export interface DelegatedSalesTarget {
  id: string; // sales user id
  fullName: string;
  avatarUrl?: string | null;
  zaloAccounts: DelegatedSalesAccount[];
}

export interface SalesCardData {
  salesUser: {
    id: string;
    fullName: string;
    avatarUrl?: string | null;
    email?: string;
  };
  zaloAccounts: Array<{
    id: string;
    displayName: string;
    avatarUrl?: string | null;
    isOnline: boolean;
  }>;
  totalGroups: number;
  pendingMessages: number;
  unreadMessages: number;
  status: 'online' | 'offline';
}

const STORAGE_KEY = 'cskh.active_sales_target.v1';

export const useCsWorkspaceStore = defineStore('csWorkspace', () => {
  const activeSalesTarget = ref<DelegatedSalesTarget | null>(null);
  const delegatedSalesList = ref<SalesCardData[]>([]);
  const loadingDelegated = ref(false);
  const hasFetchedDelegated = ref(false);

  // Khôi phục từ sessionStorage khi F5
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) {
      activeSalesTarget.value = JSON.parse(saved);
    }
  } catch {
    // Bỏ qua lỗi parse
  }

  const isDelegatedMode = computed(() => activeSalesTarget.value !== null);

  const activeSalesAccountIds = computed(() => {
    if (!activeSalesTarget.value) return [];
    return activeSalesTarget.value.zaloAccounts.map((a) => a.id);
  });

  async function fetchDelegatedSales(force = false) {
    if (hasFetchedDelegated.value && !force) return;
    loadingDelegated.value = true;
    try {
      const res = await api.get<{ cskh: any; sales: SalesCardData[] }>('/cs/delegated-sales');
      if (res.data?.sales) {
        delegatedSalesList.value = res.data.sales;
        hasFetchedDelegated.value = true;
      }
    } catch (err) {
      console.error('Failed to fetch delegated sales list:', err);
    } finally {
      loadingDelegated.value = false;
    }
  }

  function setSalesTarget(sales: DelegatedSalesTarget) {
    activeSalesTarget.value = sales;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(sales));
    } catch {
      // Storage đầy hoặc bị chặn
    }

    const accountIds = sales.zaloAccounts.map((a) => a.id);
    if (accountIds.length > 0) {
      const workScope = useWorkScope();
      workScope.setScope(accountIds);
    }
  }

  function clearSalesTarget(cskhOwnedAccountIds: string[] = []) {
    activeSalesTarget.value = null;
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage error
    }

    const workScope = useWorkScope();
    // Scope về nick của chính CSKH nếu có, ngược lại reset scope về []
    workScope.setScope(cskhOwnedAccountIds);
  }

  return {
    activeSalesTarget,
    isDelegatedMode,
    activeSalesAccountIds,
    delegatedSalesList,
    loadingDelegated,
    fetchDelegatedSales,
    setSalesTarget,
    clearSalesTarget,
  };
});
