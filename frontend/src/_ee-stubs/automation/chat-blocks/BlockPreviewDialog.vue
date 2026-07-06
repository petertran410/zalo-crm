<!-- Community stub — automation block preview (open-core). Renders nothing. -->
<template>
  <span />
</template>

<script setup lang="ts">
import type { Block } from '@ee/automation/api/types';
defineProps<{
  visible: boolean;
  block: Block;
  contactName?: string;
  nickName?: string;
  previewOnly?: boolean;
}>();
defineEmits<{
  send: [blockId: string];
  close: [];
}>();
</script>
