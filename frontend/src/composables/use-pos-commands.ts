import { ref } from 'vue';
import { api } from '@/api/index';

export function usePosCommands() {
  const loading = ref(false);
  const error = ref<string | null>(null);
  const success = ref(false);

  async function executeCommand<T = any>(commandName: string, payload: any): Promise<T | null> {
    loading.value = true;
    error.value = null;
    success.value = false;

    try {
      let res;
      if (commandName === 'CreateCustomer') {
        res = await api.post('/pos/customers', payload);
      } else if (commandName === 'UpdateCustomer') {
        res = await api.put(`/pos/customers/${payload.posCustomerId}`, payload);
      } else {
        throw new Error(`Command ${commandName} is not supported on frontend usePosCommands`);
      }

      success.value = true;
      return res.data;
    } catch (err: any) {
      const data = err.response?.data;
      const msg = data?.message || data?.error || err.message || 'Lỗi không xác định';
      error.value = msg;
      if (data) {
        return data;
      }
      return null;
    } finally {
      loading.value = false;
    }
  }

  async function getLinkStatus(contactId: string) {
    try {
      const res = await api.get(`/pos/contacts/${contactId}/status`);
      return res.data;
    } catch (err) {
      console.error('[usePosCommands] getLinkStatus failed:', err);
      return null;
    }
  }

  async function linkContactToPos(contactId: string, posCustomerId: number, posCustomerCode?: string) {
    loading.value = true;
    error.value = null;
    try {
      const res = await api.post(`/pos/contacts/${contactId}/link`, { posCustomerId, posCustomerCode });
      return res.data;
    } catch (err: any) {
      error.value = err.response?.data?.error || 'Không thể liên kết';
      return null;
    } finally {
      loading.value = false;
    }
  }

  return {
    loading,
    error,
    success,
    executeCommand,
    getLinkStatus,
    linkContactToPos,
  };
}
