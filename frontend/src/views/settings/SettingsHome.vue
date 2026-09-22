<template>
  <section class="settings-home">
    <header class="settings-home__intro">
      <div>
        <p class="settings-home__eyebrow">TRUNG TÂM CÀI ĐẶT</p>
        <h1>Thiết lập không gian làm việc</h1>
        <p class="settings-home__description">
          Chọn một danh mục để quản lý tài khoản, dữ liệu khách hàng, kết nối và vận hành hệ thống.
        </p>
      </div>
      <RouterLink v-if="accountItem" :to="accountItem.route" class="settings-home__account-link">
        <v-icon icon="mdi-account-circle-outline" size="18" />
        Tài khoản của tôi
        <v-icon icon="mdi-arrow-right" size="16" />
      </RouterLink>
    </header>

    <div class="settings-home__section-head">
      <div>
        <h2>Danh mục cài đặt</h2>
        <p>{{ totalItems }} tuỳ chọn bạn có quyền truy cập</p>
      </div>
    </div>

    <div class="settings-home__grid">
      <article v-for="group in visibleGroups" :key="group.id" class="settings-card">
        <div class="settings-card__head">
          <span class="settings-card__icon"><v-icon :icon="group.icon" size="22" /></span>
          <div>
            <h3>{{ group.label }}</h3>
            <p>{{ group.description }}</p>
          </div>
        </div>

        <nav class="settings-card__links" :aria-label="group.label">
          <RouterLink
            v-for="item in group.items.slice(0, 4)"
            :key="item.route"
            :to="item.route"
            class="settings-card__link"
          >
            <v-icon :icon="item.icon" size="17" />
            <span>{{ item.label }}</span>
            <v-icon class="settings-card__arrow" icon="mdi-chevron-right" size="17" />
          </RouterLink>
        </nav>

        <RouterLink
          v-if="group.items.length > 4"
          :to="group.items[0].route"
          class="settings-card__more"
        >
          Xem tất cả {{ group.items.length }} mục
          <v-icon icon="mdi-arrow-right" size="15" />
        </RouterLink>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useSettingsNav } from '@/composables/use-settings-nav';

const { visibleGroups } = useSettingsNav();

const totalItems = computed(() => visibleGroups.value.reduce((count, group) => count + group.items.length, 0));
const accountItem = computed(() => visibleGroups.value.find((group) => group.id === 'personal')?.items[0]);
</script>

<style scoped>
.settings-home {
  width: min(1120px, 100%);
  margin: 0 auto;
  padding: 8px 0 28px;
}

.settings-home__intro {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding: 8px 0 28px;
}
.settings-home__eyebrow {
  margin: 0 0 8px;
  color: var(--app-accent);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.09em;
}
.settings-home h1,
.settings-home h2,
.settings-home h3,
.settings-home p { margin-top: 0; }
.settings-home h1 {
  margin-bottom: 10px;
  color: var(--app-text-primary);
  font-size: 26px;
  font-weight: 750;
  letter-spacing: -0.035em;
}
.settings-home__description {
  max-width: 620px;
  margin-bottom: 0;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.55;
}
.settings-home__account-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  min-height: var(--app-control-h-lg);
  padding: 0 12px;
  border: 1px solid var(--app-border-default);
  border-radius: var(--app-radius-md);
  background: var(--app-surface-panel);
  color: var(--app-text-primary);
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  box-shadow: var(--app-shadow-sm);
}
.settings-home__account-link:hover {
  border-color: var(--app-accent);
  color: var(--app-accent);
}
.settings-home__section-head {
  display: flex;
  align-items: end;
  justify-content: space-between;
  margin-bottom: 14px;
}
.settings-home__section-head h2 {
  margin-bottom: 4px;
  color: var(--app-text-primary);
  font-size: 16px;
  font-weight: 700;
}
.settings-home__section-head p {
  margin-bottom: 0;
  color: var(--app-text-muted);
  font-size: 12px;
}
.settings-home__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.settings-card {
  display: flex;
  flex-direction: column;
  min-height: 242px;
  border: 1px solid var(--app-border-subtle);
  border-radius: var(--app-radius-lg);
  background: var(--app-surface-panel);
  box-shadow: var(--app-shadow-sm);
  overflow: hidden;
}
.settings-card__head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 18px 18px 14px;
}
.settings-card__icon {
  display: inline-grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 10px;
  background: var(--app-accent-soft);
  color: var(--app-accent);
}
.settings-card h3 {
  margin-bottom: 4px;
  color: var(--app-text-primary);
  font-size: 14px;
  font-weight: 700;
}
.settings-card__head p {
  margin-bottom: 0;
  color: var(--app-text-secondary);
  font-size: 12px;
  line-height: 1.45;
}
.settings-card__links {
  display: grid;
  border-top: 1px solid var(--app-border-subtle);
}
.settings-card__link {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 36px;
  padding: 0 18px;
  border-bottom: 1px solid var(--app-border-subtle);
  color: var(--app-text-secondary);
  font-size: 12.5px;
  text-decoration: none;
}
.settings-card__link:hover { background: var(--app-surface-hover); color: var(--app-accent); }
.settings-card__link span { flex: 1; }
.settings-card__arrow { color: var(--app-text-muted); }
.settings-card__more {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-top: auto;
  min-height: 39px;
  padding: 0 18px;
  color: var(--app-accent);
  font-size: 12px;
  font-weight: 650;
  text-decoration: none;
}
.settings-card__more:hover { background: var(--app-accent-soft); }

@media (max-width: 720px) {
  .settings-home { padding-top: 0; }
  .settings-home__intro { flex-direction: column; gap: 16px; padding-bottom: 22px; }
  .settings-home h1 { font-size: 23px; }
  .settings-home__grid { grid-template-columns: 1fr; }
  .settings-card { min-height: 0; }
}
</style>
