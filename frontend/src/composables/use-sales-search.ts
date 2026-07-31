/**
 * use-sales-search — singleton composable để đồng bộ search query
 * giữa SalesLayout topbar và SalesChatView conv list.
 *
 * Module-level ref → không dùng Pinia, không shared với ChatView thông thường.
 * Reset về '' khi user navigate ra khỏi Sales Workspace.
 */
import { ref } from 'vue';

const salesSearchQuery = ref('');

export function useSalesSearch() {
  return { query: salesSearchQuery };
}
