<template>
  <div class="global-search">
    <Search class="global-search-icon" :size="17" :stroke-width="1.9" aria-hidden="true" />
    <input
      v-model="query"
      class="global-search-input"
      type="search"
      placeholder="Tìm kiếm..."
      aria-label="Tìm kiếm toàn hệ thống"
      @input="onInput"
    />
    <button
      v-if="query"
      type="button"
      class="global-search-clear"
      aria-label="Xóa tìm kiếm"
      @click="clearSearch"
    >
      <X :size="15" :stroke-width="2" />
    </button>
    <v-menu
      v-model="showResults"
      activator="parent"
      :close-on-content-click="true"
      max-width="380"
      offset-y
    >
      <v-card v-if="hasResults" style="max-height: 400px; overflow-y: auto;">
        <!-- Contacts -->
        <template v-if="results.contacts.length">
          <v-list-subheader>Khách hàng</v-list-subheader>
          <v-list-item
            v-for="c in results.contacts"
            :key="c.id"
            @click="goTo('/contacts', c.id)"
            density="compact"
          >
            <template #prepend><v-icon size="18" color="primary">mdi-account</v-icon></template>
            <v-list-item-title>{{ c.fullName || c.phone }}</v-list-item-title>
            <v-list-item-subtitle v-if="c.diseaseName">{{ c.diseaseName }}</v-list-item-subtitle>
          </v-list-item>
        </template>
        <!-- Messages -->
        <template v-if="results.messages.length">
          <v-divider />
          <v-list-subheader>Tin nhắn</v-list-subheader>
          <v-list-item
            v-for="m in results.messages"
            :key="m.id"
            @click="goTo('/chat', m.conversation?.id)"
            density="compact"
          >
            <template #prepend><v-icon size="18" color="info">mdi-chat</v-icon></template>
            <v-list-item-title class="text-truncate" style="max-width: 300px;">
              {{ truncate(m.content, 60) }}
            </v-list-item-title>
            <v-list-item-subtitle>{{ m.senderName }} · {{ formatDate(m.sentAt) }}</v-list-item-subtitle>
          </v-list-item>
        </template>
        <!-- Appointments -->
        <template v-if="results.appointments.length">
          <v-divider />
          <v-list-subheader>Lịch hẹn</v-list-subheader>
          <v-list-item
            v-for="a in results.appointments"
            :key="a.id"
            @click="goTo('/appointments')"
            density="compact"
          >
            <template #prepend><v-icon size="18" color="warning">mdi-calendar</v-icon></template>
            <v-list-item-title>{{ a.contact?.fullName }} · {{ formatDate(a.appointmentDate) }}</v-list-item-title>
            <v-list-item-subtitle>{{ a.notes }}</v-list-item-subtitle>
          </v-list-item>
        </template>
      </v-card>
      <v-card
        v-else-if="query && !loading"
        class="pa-4 text-center text-caption text-grey"
      >
        Không tìm thấy kết quả
      </v-card>
    </v-menu>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { Search, X } from 'lucide-vue-next';
import { api } from '@/api/index';
import { getOrgParts } from '@/composables/use-org-timezone';

interface ContactResult {
  id: string;
  fullName: string | null;
  phone: string | null;
  diseaseCode: string | null;
  diseaseName: string | null;
}

interface MessageResult {
  id: string;
  content: string | null;
  senderName: string | null;
  sentAt: string;
  conversation?: { id: string; contact?: { fullName: string | null } } | null;
}

interface AppointmentResult {
  id: string;
  appointmentDate: string;
  appointmentTime: string | null;
  notes: string | null;
  contact?: { fullName: string | null } | null;
}

interface SearchResults {
  contacts: ContactResult[];
  messages: MessageResult[];
  appointments: AppointmentResult[];
}

const query = ref('');
const loading = ref(false);
const showResults = ref(false);
const results = ref<SearchResults>({ contacts: [], messages: [], appointments: [] });
const router = useRouter();

const hasResults = computed(
  () => results.value.contacts.length + results.value.messages.length + results.value.appointments.length > 0
);

let timeout: ReturnType<typeof setTimeout>;

function debouncedSearch(val: string | null) {
  clearTimeout(timeout);
  if (!val || val.length < 2) {
    showResults.value = false;
    return;
  }
  timeout = setTimeout(async () => {
    loading.value = true;
    try {
      const res = await api.get('/search', { params: { q: val } });
      results.value = res.data;
      showResults.value = true;
    } catch {
      // silently ignore search errors
    } finally {
      loading.value = false;
    }
  }, 300);
}

function onInput(event: Event) {
  debouncedSearch((event.target as HTMLInputElement).value);
}

function clearSearch() {
  query.value = '';
  showResults.value = false;
  clearTimeout(timeout);
}

function goTo(path: string, _id?: string) {
  showResults.value = false;
  query.value = '';
  router.push(path);
}

function truncate(s: string | null, len: number): string {
  return s && s.length > len ? s.slice(0, len) + '...' : s || '';
}

function formatDate(d: string): string {
  const p = getOrgParts(d);
  if (!p) return '';
  return `${String(p.day).padStart(2, '0')}/${String(p.month).padStart(2, '0')}`;
}
</script>

<style scoped>
/* Native input on purpose: Vuetify solo-filled always paints theme.surface,
   which produced the large white block in the dark app header. */
.global-search {
  width: 100%;
  min-width: 0;
  height: 34px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border: 1px solid rgba(255, 255, 255, .10);
  border-radius: 9px;
  background: rgba(255, 255, 255, .08);
  color: var(--shell-ink-2, #a8b0c0);
  transition: background .14s ease, border-color .14s ease, box-shadow .14s ease;
}
.global-search:hover { background: rgba(255, 255, 255, .11); }
.global-search:focus-within {
  background: rgba(255, 255, 255, .12);
  border-color: color-mix(in srgb, var(--nav-accent, #0068ff) 70%, transparent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--nav-accent, #0068ff) 28%, transparent);
}
.global-search-icon { flex: none; color: inherit; }
.global-search-input {
  min-width: 0;
  flex: 1;
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--shell-ink, #f2f4f8);
  font: inherit;
  font-size: 12.5px;
}
.global-search-input::placeholder { color: var(--shell-ink-2, #a8b0c0); }
.global-search-input::-webkit-search-cancel-button { display: none; }
.global-search-clear {
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  flex: none;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: inherit;
}
.global-search-clear:hover { color: var(--shell-ink, #f2f4f8); background: rgba(255,255,255,.10); }
</style>
