<template>
  <main class="customer-page">
    <RouterLink :to="backTo" class="back"><ArrowLeft :size="18" />Quay lại</RouterLink>
    <CustomerWorkspacePanel :key="String(route.params.id)" :contact-id="String(route.params.id)" full-page />
  </main>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { ArrowLeft } from 'lucide-vue-next';
import CustomerWorkspacePanel from '@/components/contacts/CustomerWorkspacePanel.vue';
const route = useRoute();
const backTo = computed(() => typeof route.query.from === 'string' && /^\/(?:sales-chat|cs-chat|chat|customers)(?:\/|\?|$)/.test(route.query.from) ? route.query.from : '/customers');
</script>
<style scoped>
.customer-page{padding:20px;background:#f4f7f5;height:100%;min-height:0;overflow:auto}.back{display:flex;align-items:center;gap:8px;max-width:1100px;margin:0 auto 16px;color:#246550;text-decoration:none;font-size:13px}@media(max-width:600px){.customer-page{padding:8px;height:calc(100dvh - 120px)}}
</style>
