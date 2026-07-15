import { ref, reactive } from 'vue';
import { api } from '@/api/index';

export interface UsePaginationOptions {
  endpoint: string;
  defaultLimit?: number;
  defaultSortBy?: string;
  defaultSortOrder?: 'asc' | 'desc';
}

export function usePagination<T>(options: UsePaginationOptions) {
  const items = ref<T[]>([]);
  const loading = ref(false);
  const cursorHistory = ref<string[]>([]);
  const nextCursor = ref<string | null>(null);
  const hasNext = ref(false);
  const hasPrev = ref(false);

  const state = reactive({
    limit: options.defaultLimit || 20,
    cursor: undefined as string | undefined,
    keyword: '',
    sortBy: options.defaultSortBy || 'createdAt',
    sortOrder: options.defaultSortOrder || 'desc',
  });

  async function loadPage() {
    loading.value = true;
    try {
      const res = await api.get(options.endpoint, {
        params: {
          limit: state.limit,
          cursor: state.cursor,
          keyword: state.keyword || undefined,
          sortBy: state.sortBy,
          sortOrder: state.sortOrder,
        },
      });
      items.value = res.data.items || [];
      nextCursor.value = res.data.nextCursor;
      hasNext.value = res.data.hasNext;
      hasPrev.value = cursorHistory.value.length > 0 || !!state.cursor;
    } catch (err) {
      console.error(`Failed to load page for ${options.endpoint}`, err);
    } finally {
      loading.value = false;
    }
  }

  function nextPage() {
    if (hasNext.value && nextCursor.value) {
      if (state.cursor) {
        cursorHistory.value.push(state.cursor);
      } else {
        cursorHistory.value.push(''); // placeholder for first page
      }
      state.cursor = nextCursor.value;
      loadPage();
    }
  }

  function prevPage() {
    if (cursorHistory.value.length > 0) {
      const prev = cursorHistory.value.pop();
      state.cursor = prev ? prev : undefined;
      loadPage();
    } else if (state.cursor) {
      state.cursor = undefined;
      loadPage();
    }
  }

  function reset() {
    state.cursor = undefined;
    cursorHistory.value = [];
    loadPage();
  }

  function search(keyword: string) {
    state.keyword = keyword;
    reset();
  }

  function sort(sortBy: string, order?: 'asc' | 'desc') {
    state.sortBy = sortBy;
    state.sortOrder = order || (state.sortOrder === 'asc' ? 'desc' : 'asc');
    reset();
  }

  return {
    items,
    loading,
    hasNext,
    hasPrev,
    state,
    loadPage,
    nextPage,
    prevPage,
    reset,
    search,
    sort,
  };
}
