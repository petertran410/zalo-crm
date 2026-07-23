<template>
  <!--
    WorkspaceSwitcher.vue — Admin/Manager toggle giữa các Workspace
    ─────────────────────────────────────────────────────────────────
    Hiển thị nút dropdown nhỏ trên TopBar cho phép Admin/Manager chuyển
    góc nhìn giữa các Workspace (vd: Admin bấm xem giao diện Sales).
    Không render gì nếu workspace hiện tại là 'sales' — Sales bị khóa cứng.
  -->
  <template v-if="!isSalesWorkspace">
    <v-menu v-model="menu" :close-on-content-click="true" location="bottom end">
      <template #activator="{ props: act }">
        <button class="ws-switch-trigger" v-bind="act" title="Chuyển đổi Workspace">
          <v-icon :icon="activeWs.icon" size="16" />
          <span class="ws-switch-label">{{ activeWs.name }}</span>
          <span class="ws-switch-caret">▾</span>
        </button>
      </template>

      <v-list density="compact" min-width="220" class="ws-switch-list">
        <v-list-subheader>Chuyển đổi giao diện</v-list-subheader>

        <v-list-item
          v-for="ws in allWorkspaces"
          :key="ws.id"
          :prepend-icon="ws.icon"
          :title="ws.name"
          :subtitle="ws.description"
          :active="ws.id === activeWs.id"
          @click="onSwitch(ws.id)"
        />

        <template v-if="workspaceStore.isSimulationMode">
          <v-divider />
          <v-list-item
            prepend-icon="mdi-arrow-left"
            title="Quay về giao diện gốc"
            @click="workspaceStore.exitSimulation()"
          />
        </template>
      </v-list>
    </v-menu>
  </template>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useWorkspaceStore } from '@/workspaces/resolver';
import type { WorkspaceId } from '@/workspaces/types';

const workspaceStore = useWorkspaceStore();
const router = useRouter();
const menu = ref(false);

const activeWs = computed(() => workspaceStore.activeConfig);
const allWorkspaces = computed(() => workspaceStore.allWorkspaces);

/**
 * Sales workspace bị khóa cứng — không được phép switch workspace.
 * Guard này nằm ngay tại component nên hiệu lực tuyệt đối,
 * dù layout nào mount component này cũng không thể hiển thị với Sales.
 */
const isSalesWorkspace = computed(() => workspaceStore.activeWorkspaceId === 'sales');

function onSwitch(targetId: WorkspaceId) {
  if (targetId === workspaceStore.activeWorkspaceId) return;
  // Double-check: Sales không bao giờ được switch
  if (isSalesWorkspace.value) return;
  workspaceStore.switchWorkspace(targetId);
  // Navigate to the new workspace's default route
  const target = workspaceStore.activeConfig;
  router.push(target.defaultRoute);
}
</script>

<style scoped>
.ws-switch-trigger {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 0 10px;
  height: 32px; border-radius: 7px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.9);
  font-size: 12px; font-weight: 600;
  cursor: pointer;
  transition: background .14s, border-color .14s;
  font-family: inherit;
}
.ws-switch-trigger:hover {
  background: rgba(255, 255, 255, 0.14);
  border-color: rgba(255, 255, 255, 0.22);
}
.ws-switch-label { white-space: nowrap; }
.ws-switch-caret { font-size: 9px; opacity: 0.6; }

.ws-switch-list :deep(.v-list-item__prepend > .v-icon) {
  margin-inline-end: 12px;
}
</style>
