<template>
  <span
    v-if="pending"
    class="dh-skel dh-skel--line"
    :style="{ display: 'inline-block', width: width + 'px' }"
    aria-hidden="true"
  ></span>
  <slot v-else />
</template>

<script setup lang="ts">
// Wraps any dashboard number so it shows a skeleton instead of a placeholder 0 while its
// section is still loading. Rendering 0 first made counts visibly jump (139 → 0 → 139).
withDefaults(defineProps<{ pending?: boolean; width?: number }>(), { pending: false, width: 46 });
</script>
