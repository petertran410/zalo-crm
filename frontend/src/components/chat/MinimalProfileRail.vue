<template>
  <aside class="minimal-profile-rail" aria-label="Chuyển nhanh nhân viên">
    <div class="minimal-profile-heading">Nhân viên</div>

    <div v-if="loading && profiles.length === 0" class="minimal-profile-loading" aria-label="Đang tải nhân viên">
      <span />
      <span />
      <span />
    </div>

    <div v-else-if="profiles.length === 0" class="minimal-profile-empty">
      Chưa có hồ sơ khác
    </div>

    <div v-else class="minimal-profile-list">
      <button
        v-for="profile in profiles"
        :key="profile.salesUser.id"
        type="button"
        class="minimal-profile-item"
        :class="{ 'is-active': activeProfileId === profile.salesUser.id }"
        :title="profileTitle(profile)"
        :aria-label="`Chuyển sang hộp thư của ${profile.salesUser.fullName}`"
        :aria-pressed="activeProfileId === profile.salesUser.id"
        @click="$emit('select', profile)"
      >
        <span class="minimal-profile-avatar">
          <Avatar
            :src="profile.salesUser.avatarUrl"
            :name="profile.salesUser.fullName"
            :size="40"
            :platform="null"
          />
          <span
            class="minimal-profile-status"
            :class="isOnline(profile) ? 'is-online' : 'is-offline'"
          />
        </span>
        <span class="minimal-profile-name">{{ shortName(profile.salesUser.fullName) }}</span>
        <span v-if="profile.unreadMessages > 0" class="minimal-profile-unread">
          {{ profile.unreadMessages > 99 ? '99+' : profile.unreadMessages }}
        </span>
      </button>
    </div>
  </aside>
</template>

<script setup lang="ts">
import Avatar from '@/components/ui/Avatar.vue';
import type { SalesCardData } from '@/stores/use-cs-workspace';

defineProps<{
  profiles: SalesCardData[];
  activeProfileId: string | null;
  loading: boolean;
}>();

defineEmits<{
  (event: 'select', profile: SalesCardData): void;
}>();

function isOnline(profile: SalesCardData): boolean {
  return profile.status === 'online' || profile.zaloAccounts.some((account) => account.isOnline);
}

function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return parts.at(-1) || fullName;
}

function profileTitle(profile: SalesCardData): string {
  const count = profile.zaloAccounts.length;
  return `${profile.salesUser.fullName} · ${count} kênh`;
}
</script>

<style scoped>
.minimal-profile-rail {
  display: flex;
  min-height: 0;
  flex-direction: column;
  align-items: center;
  overflow: hidden;
  padding: 12px 5px 8px;
  border: 1px solid #e5ecf5;
  border-radius: 14px;
  background: #fff;
}

.minimal-profile-heading {
  flex: none;
  margin-bottom: 10px;
  color: #75869d;
  font-size: 9px;
  font-weight: 650;
  letter-spacing: .04em;
  text-transform: uppercase;
}

.minimal-profile-list {
  display: flex;
  width: 100%;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-width: thin;
}

.minimal-profile-item {
  position: relative;
  display: flex;
  width: 58px;
  flex: none;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 7px 3px 6px;
  border: 0;
  border-radius: 11px;
  background: transparent;
  color: #62748e;
  cursor: pointer;
}

.minimal-profile-item:hover,
.minimal-profile-item.is-active {
  background: #eaf2ff;
  color: #2164ef;
}

.minimal-profile-avatar {
  position: relative;
  display: inline-flex;
  padding: 2px;
  border: 2px solid transparent;
  border-radius: 50%;
}

.minimal-profile-item.is-active .minimal-profile-avatar {
  border-color: #2164ef;
}

.minimal-profile-status {
  position: absolute;
  right: 0;
  bottom: 1px;
  width: 9px;
  height: 9px;
  border: 2px solid #fff;
  border-radius: 50%;
}

.minimal-profile-status.is-online { background: #16a36f; }
.minimal-profile-status.is-offline { background: #9ba9ba; }

.minimal-profile-name {
  width: 100%;
  overflow: hidden;
  font-size: 10px;
  font-weight: 550;
  line-height: 1.2;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.minimal-profile-unread {
  position: absolute;
  top: 3px;
  right: 1px;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border: 2px solid #fff;
  border-radius: 999px;
  background: #d92d20;
  color: #fff;
  font-size: 8px;
  font-weight: 700;
  line-height: 13px;
  text-align: center;
}

.minimal-profile-loading {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.minimal-profile-loading span {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #edf2f8;
  animation: minimal-profile-pulse 1.2s ease-in-out infinite;
}

.minimal-profile-loading span:nth-child(2) { animation-delay: .15s; }
.minimal-profile-loading span:nth-child(3) { animation-delay: .3s; }

.minimal-profile-empty {
  margin: auto 0;
  color: #8a99ac;
  font-size: 9px;
  line-height: 1.4;
  text-align: center;
}

@keyframes minimal-profile-pulse {
  50% { opacity: .45; }
}
</style>
