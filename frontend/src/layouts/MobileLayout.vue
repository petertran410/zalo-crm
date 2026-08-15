<template>
  <v-app>
    <OfflineIndicator />

    <!-- Slim mobile app bar -->
    <v-app-bar density="compact" flat>
      <!-- Cùng brand lockup với DefaultLayout: logo theo hồ sơ tổ chức, không phải
           mark riêng. Trước đây chỗ này hardcode gradient xanh + mdi-robot nên máy hẹp
           hiện logo khác hẳn desktop. -->
      <RouterLink to="/" class="ml-brand ml-3" :title="`${brandName} CRM`">
        <span class="ml-bbox"><img :src="brandLogo" :alt="brandName" @error="onLogoError" /></span>
      </RouterLink>

      <v-spacer />

      <NotificationBell />
      <v-btn icon size="small" variant="text" @click="toggleTheme">
        <v-icon size="20">{{ isDark ? 'mdi-weather-sunny' : 'mdi-weather-night' }}</v-icon>
      </v-btn>
      <v-btn icon size="small" variant="text" @click="logout">
        <v-icon size="20">mdi-logout</v-icon>
      </v-btn>
    </v-app-bar>

    <!-- Main content with padding for bottom nav -->
    <v-main>
      <div style="padding-bottom: 72px;">
        <slot />
      </div>
    </v-main>

    <BottomNav />
  </v-app>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useTheme } from 'vuetify';
import { useAuthStore } from '@/stores/auth';
import { useRouter } from 'vue-router';
import NotificationBell from '@/components/NotificationBell.vue';
import BottomNav from '@/components/BottomNav.vue';
import OfflineIndicator from '@/components/OfflineIndicator.vue';
import { fetchPublicBranding } from '@/api/public-branding';

const theme = useTheme();
const authStore = useAuthStore();
const router = useRouter();
const isDark = ref(localStorage.getItem('theme') !== 'light');

// Giống DefaultLayout: logo/tên lấy từ hồ sơ tổ chức, fallback về monogram mặc định.
const DEFAULT_LOGO = '/brand/hs-monogram.png';
const brandLogo = ref(DEFAULT_LOGO);
const brandName = ref('Hi-CRM');
function onLogoError() {
  if (brandLogo.value !== DEFAULT_LOGO) brandLogo.value = DEFAULT_LOGO;
}

onMounted(() => {
  theme.change(isDark.value ? 'dark' : 'light');

  fetchPublicBranding()
    .then((b) => {
      if (!b) return;
      brandLogo.value = b.logoUrl || DEFAULT_LOGO;
      brandName.value = b.name || 'Hi-CRM';
    })
    .catch(() => {});
});

function toggleTheme() {
  isDark.value = !isDark.value;
  theme.change(isDark.value ? 'dark' : 'light');
  localStorage.setItem('theme', isDark.value ? 'dark' : 'light');
}

function logout() {
  authStore.logout();
  router.push('/login');
}
</script>

<style scoped>
/* Khớp .hs-bbox trong nav-shell.css — style đó bị khoá dưới .smax-topnav nên
   MobileLayout không dùng lại được, phải lặp giá trị. Sửa một bên thì sửa cả hai. */
.ml-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  text-decoration: none;
  color: inherit;
}
.ml-bbox {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: linear-gradient(135deg, var(--nav-accent, #635bff) 0%, var(--nav-accent-dim, #4f46e5) 100%);
  box-shadow: 0 2px 8px rgba(99, 91, 255, 0.4);
}
.ml-bbox img {
  display: block;
  width: 20px;
  height: auto;
}
</style>
