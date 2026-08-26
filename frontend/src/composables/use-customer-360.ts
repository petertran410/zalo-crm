import { ref, watch } from 'vue';
import { api } from '@/api';

export type Customer360 = {
  contact: {
    id: string;
    viewerRole: 'primary' | 'collaborator' | 'admin';
  };
  access: {
    assignedUser: { id: string; fullName: string | null; email: string | null } | null;
    collaborators: Array<{ role: string; user: { id: string; fullName: string | null; email: string | null } }>;
  };
  commerce: {
    posLink: { posCustomerId: number | null; posCustomerCode: string | null; posSyncedAt: string | null };
    orders: {
      items: Array<{ id: string; code: string; finalAmount: number; orderDate: string; status: string }>;
      total: number;
      lifetimeValue: number;
      latestOrder: { id: string; code: string; finalAmount: number; orderDate: string; status: string } | null;
    };
    purchasedProducts: {
      items: Array<{
        key: string;
        productName: string;
        quantity: number;
        orderCount: number;
        grossRevenue: number;
        lastPurchasedAt: string;
      }>;
      scannedOrders: number;
      truncated: boolean;
    };
    debt: {
      totalDebt: number;
      currentDebt: number;
      overdueDebt: number;
      dueDate: string | null;
      status: string;
      invoices: Array<{ id: string; invoiceCode: string; remainingDebt: number; dueDate: string | null }>;
      lastSyncedAt: string | null;
    };
  };
  /** Phân loại khách theo Phương án C: liên kết POS → nhóm POS; chưa → crmStatus. */
  profile: {
    linkedToPos: boolean;
    segment: string | null;
    organization: string | null;
    taxCode: string | null;
    isOrganization: boolean | null;
    posSaleCode: string | null;
    posSaleUser: { id: string; fullName: string | null; email: string | null } | null;
    crmStatus: string | null;
  };
  /** Tín hiệu hành trình — tính từ dữ liệu đơn hàng, không ai nhập tay. */
  journey: {
    firstOrderAt: string | null;
    lastOrderAt: string | null;
    tenureDays: number | null;
    totalOrders: number;
    avgOrderValue: number;
    monthlyTrend: Array<{ month: string; orders: number; revenue: number }>;
    churnedProducts: Array<{
      productName: string;
      quantity: number;
      orderCount: number;
      lastPurchasedAt: string;
      quietDays: number;
    }>;
    newProducts: Array<{ productName: string; firstPurchasedAt: string; orderCount: number }>;
    debtAging: Array<{ bucket: string; invoices: number; debt: number }>;
    thresholds: { quietDays: number; newProductDays: number };
  };
  service: {
    appointments: Array<{ id: string; title: string | null; appointmentDate: string; status: string; type: string | null }>;
    notes: Array<{ id: string; body: string; createdAt: string }>;
    tasks: Array<{ id: string; title: string; status: string; dueAt: string | null }>;
    tickets: Array<{ id: string; title: string; status: string; priority: string; updatedAt: string }>;
    recentTimeline: Array<{
      type: 'appointment' | 'note' | 'task' | 'ticket' | 'order';
      id: string;
      occurredAt: string;
      title: string;
      status: string | null;
      detail: string | number | null;
    }>;
  };
};

/** Fetches the contact-scoped Customer 360 read model for the chat sidebar. */
export function useCustomer360(getContactId: () => string | null) {
  const customer360 = ref<Customer360 | null>(null);
  const customer360Loading = ref(false);
  const customer360Error = ref(false);
  let requestId = 0;

  async function fetchCustomer360() {
    const contactId = getContactId();
    const currentRequest = ++requestId;
    customer360.value = null;
    customer360Error.value = false;
    if (!contactId) return;

    customer360Loading.value = true;
    try {
      const { data } = await api.get<Customer360>(`/contacts/${contactId}/customer-360`, {
        params: { limit: 10 },
      });
      if (currentRequest === requestId && getContactId() === contactId) customer360.value = data;
    } catch (error) {
      // A 404 is deliberately indistinguishable from an inaccessible contact.
      if (currentRequest === requestId) customer360Error.value = true;
      console.error('fetchCustomer360 failed:', error);
    } finally {
      if (currentRequest === requestId) customer360Loading.value = false;
    }
  }

  watch(getContactId, () => { void fetchCustomer360(); }, { immediate: true });

  return { customer360, customer360Loading, customer360Error, fetchCustomer360 };
}
