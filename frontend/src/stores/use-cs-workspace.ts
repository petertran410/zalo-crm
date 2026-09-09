import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useWorkScope } from '@/composables/use-work-scope';

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

const STORAGE_KEY = 'cskh.active_sales_target.v1';

export const useCsWorkspaceStore = defineStore('csWorkspace', () => {
  const activeSalesTarget = ref<DelegatedSalesTarget | null>(null);

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
    setSalesTarget,
    clearSalesTarget,
  };
});
