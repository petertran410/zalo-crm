<template>
  <!-- 2026-06-09 (anh báo menu bar kẹt): v-model để đóng chủ động khi click thông báo
       → điều hướng. Trước đây close-on-content-click=false + không đóng trong handleClick
       làm menu (z-index 2000) kẹt mở phủ nav, nuốt click. -->
  <v-menu v-model="bellMenu" offset-y :close-on-content-click="false" max-width="380">
    <template #activator="{ props: menuProps }">
      <v-btn icon variant="text" v-bind="menuProps" class="mr-1">
        <v-badge
          :content="notifications.length"
          :model-value="notifications.length > 0"
          color="error"
          overlap
        >
          <v-icon>mdi-bell-outline</v-icon>
        </v-badge>
      </v-btn>
    </template>
    <v-card style="max-height: 400px; overflow-y: auto;">
      <v-card-title class="text-body-1 font-weight-bold pa-3">Thông báo</v-card-title>
      <v-divider />
      <v-list density="compact" v-if="notifications.length > 0">
        <v-list-item
          v-for="n in notifications"
          :key="n.id"
          @click="handleClick(n)"
          class="py-2"
        >
          <template #prepend>
            <v-icon
              :color="n.type === 'error' ? 'red' : n.type === 'warning' ? 'orange' : 'blue'"
              size="20"
            >
              {{ n.type === 'error' ? 'mdi-alert-circle' : n.type === 'warning' ? 'mdi-alert' : 'mdi-information' }}
            </v-icon>
          </template>
          <v-list-item-title class="text-body-2">{{ n.title }}</v-list-item-title>
          <v-list-item-subtitle class="text-caption">{{ n.detail }}</v-list-item-subtitle>
        </v-list-item>
      </v-list>
      <div v-else class="pa-4 text-center text-caption text-grey">Không có thông báo</div>
    </v-card>
  </v-menu>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/api/index';

interface Notification {
  id: string;
  type: string;
  title: string;
  detail: string;
  priority: string;
}

const notifications = ref<Notification[]>([]);
const router = useRouter();
const bellMenu = ref(false); // 2026-06-09 — điều khiển đóng menu chủ động
let interval: ReturnType<typeof setInterval>;

// Âm thanh cảnh báo (2026-07-08, anh chốt "audio cue cho mọi loại thông báo") —
// phát file /sounds/notify.mp3 (đặt trong frontend/public/sounds/, Vite serve nguyên
// trạng nên không cần import). key() gộp id+title+detail: nếu 1 công việc leo tầng
// cảnh báo (vd <24h → <6h) thì detail đổi chữ → vẫn coi là "mới" và kêu lại dù id task
// giữ nguyên. Bỏ qua ping ở lần fetch ĐẦU TIÊN (mount) — tránh kêu ngay khi mở app chỉ
// vì đã có sẵn thông báo từ trước.
let knownKeys = new Set<string>();
let isFirstFetch = true;
const pingAudio = new Audio('/sounds/notify.mp3');

function playPing() {
  // .play() trả Promise reject nếu bị chặn autoplay (chưa có tương tác user) — bắt
  // để tránh unhandled rejection, im lặng bỏ qua.
  pingAudio.currentTime = 0;
  pingAudio.play().catch(() => {});
}

function notificationKey(n: Notification): string {
  return `${n.id}::${n.title}::${n.detail}`;
}

async function fetchNotifications() {
  try {
    const res = await api.get('/notifications');
    const list: Notification[] = res.data.notifications || [];
    if (!isFirstFetch) {
      const hasNewOrChanged = list.some((n) => !knownKeys.has(notificationKey(n)));
      if (hasNewOrChanged) playPing();
    }
    isFirstFetch = false;
    knownKeys = new Set(list.map(notificationKey));
    notifications.value = list;
  } catch {
    // silently ignore fetch errors
  }
}

function handleClick(n: Notification) {
  bellMenu.value = false; // đóng menu TRƯỚC khi điều hướng → tránh overlay kẹt phủ nav
  if (n.id === 'unreplied') router.push('/chat');
  else if (n.id.startsWith('apt-')) router.push('/appointments');
  else if (n.id.startsWith('zalo-')) router.push('/zalo-accounts');
  else if (n.id === 'tmr-apts') router.push('/appointments');
  else if (n.id === 'tasks-overdue' || n.id.startsWith('task-')) router.push('/tasks');
}

onMounted(() => {
  fetchNotifications();
  interval = setInterval(fetchNotifications, 60000);
});

onUnmounted(() => clearInterval(interval));
</script>
