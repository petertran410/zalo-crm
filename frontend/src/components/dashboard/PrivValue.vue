<template>
  <span style="display: inline-flex; align-items: baseline">
    <span>{{ split?.public ?? 0 }}</span>
    <span v-if="(split?.private ?? 0) > 0" class="dh-priv" :title="`${split!.private} thuộc nick riêng tư`">
      <Lock :size="11" :stroke-width="2.2" />{{ split!.private }}
    </span>
  </span>
</template>

<script setup lang="ts">
import { Lock } from 'lucide-vue-next';
import type { PrivacySplit } from '@/composables/use-dashboard-action-hub';

// Renders the public count plainly and the private-nick count behind a lock. The private
// number is a workload count only — message content for those nicks never leaves the server.
defineProps<{ split?: PrivacySplit }>();
</script>
