export interface CustomerWorkspace {
  contact: { id: string; name: string; phone: string | null; avatarUrl: string | null };
  workspace: { segment: string; potential: string; potentialNotes: string | null; careStatus: string; accountantUserId: string | null } | null;
  assignedUser: { id: string; fullName: string } | null;
  accountant: { id: string; fullName: string } | null;
  accounts: Array<{ posId: number; name: string; code: string | null; phone: string | null; address: string | null }>;
  debt: { amount: number | null; state: string; updatedAt: string | null };
  purchase: { state: string; validInvoiceCount: number };
  orders: Array<{ id: string; code: string; posCustomerId: number; status: string; orderStatus: string; finalAmount: number; orderDate: string }>;
  invoices: Array<{ id: string; invoiceCode: string; posCustomerId: number; status: string; totalAmount: number; invoiceDate: string }>;
  tasks: Array<{ id: string; title: string; status: string; dueAt: string | null }>;
  notes: Array<{ id: string; body: string; createdAt: string; posCustomerId: number | null; author: { fullName: string } }>;
  appointments: Array<{ id: string; title: string; appointmentDate: string }>;
  interests: Array<{ id: string; productName: string; notes: string | null; posCustomerId: number | null; status: string }>;
  conversations: Array<{ id: string; groupName: string | null; dissolvedAt: string | null; deletedAt: string | null; lastMessageAt: string | null }>;
  meta: { draftWritesEnabled: boolean; customerWritesEnabled?: boolean; invoicesMayBeTruncated: boolean };
}
