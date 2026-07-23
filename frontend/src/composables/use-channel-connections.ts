import { ref, computed } from 'vue';
import { api } from '@/api/index';

export interface ChannelAccount {
  id: string;
  zaloUid: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  phone: string | null;
  status: string;
  liveStatus: string;
  ownerUserId: string;
  createdAt: string;
  canManage: boolean;
  isOwnedByMe: boolean;
  owner?: {
    id: string;
    fullName: string | null;
    email: string;
    avatarUrl: string | null;
    departmentMember?: {
      deptRole: string;
      department: {
        id: string;
        name: string;
      };
    };
  };
}

export interface ChannelGroup {
  deptId: string | null;
  deptName: string;
  accounts: ChannelAccount[];
}

export function useChannelConnections() {
  const groups = ref<ChannelGroup[]>([]);
  const accounts = ref<ChannelAccount[]>([]);
  const loading = ref(false);
  const lastFetch = ref<Date | null>(null);

  async function fetchAll() {
    loading.value = true;
    try {
      const { data } = await api.get<{ groups: ChannelGroup[]; accounts: ChannelAccount[] }>('/zalo-accounts', {
        params: { groupByDept: 'true' }
      });
      groups.value = data.groups ?? [];
      accounts.value = data.accounts ?? [];
      lastFetch.value = new Date();
    } catch (err) {
      console.error('[useChannelConnections] fetch failed', err);
    } finally {
      loading.value = false;
    }
  }

  const totalChannels = computed(() => accounts.value.length);
  const connectedCount = computed(() =>
    accounts.value.filter((a) => a.liveStatus === 'connected').length
  );
  const errorCount = computed(() =>
    accounts.value.filter((a) => a.status === 'error' || a.liveStatus === 'disconnected').length
  );

  return {
    groups,
    accounts,
    loading,
    lastFetch,
    fetchAll,
    totalChannels,
    connectedCount,
    errorCount,
  };
}
