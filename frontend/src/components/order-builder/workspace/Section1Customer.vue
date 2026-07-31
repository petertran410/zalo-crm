<template>
  <div class="s1-customer">
    <!-- Customer Info Card (Read-only display) -->
    <div class="s1-card">
      <div class="s1-card__main">
        <!-- Avatar -->
        <div class="s1-avatar">
          <span class="s1-avatar__letter">{{ (customer.name || '?')[0] }}</span>
        </div>

        <!-- Info -->
        <div class="s1-info">
          <h4 class="s1-info__name">{{ customer.name }}</h4>
          <div class="s1-info__details">
            <span v-if="customer.phone" class="s1-info__chip s1-info__chip--phone">
              📞 {{ customer.phone }}
            </span>
            <span v-if="customer.posCustomerCode" class="s1-info__chip s1-info__chip--pos">
              🏷️ {{ customer.posCustomerCode }}
            </span>
          </div>
          <p v-if="customer.address" class="s1-info__address">
            📍 {{ customer.address }}
          </p>
        </div>
      </div>

      <!-- Status indicator -->
      <div class="s1-status">
        <span class="s1-status__dot" />
        <span class="s1-status__text">Khách hàng đã liên kết POS</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CustomerInfo } from '../types';

defineProps<{
  customer: CustomerInfo;
}>();
</script>

<style scoped>
.s1-customer {
  padding-top: 12px;
}

/* ─── Card ─── */
.s1-card {
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.s1-card__main {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}

/* ─── Avatar ─── */
.s1-avatar {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: linear-gradient(135deg, #0068FF, #3b82f6);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 3px 10px rgba(0, 104, 255, 0.25);
}
.s1-avatar__letter {
  font-size: 20px;
  font-weight: 800;
  color: #fff;
  text-transform: uppercase;
}

/* ─── Info ─── */
.s1-info {
  flex: 1;
  min-width: 0;
}
.s1-info__name {
  font-size: 16px;
  font-weight: 800;
  color: #1e293b;
  margin: 0 0 6px;
  line-height: 1.3;
}
.s1-info__details {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 4px;
}
.s1-info__chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11.5px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 20px;
  white-space: nowrap;
}
.s1-info__chip--phone {
  background: #eff6ff;
  color: #1d4ed8;
  border: 1px solid #bfdbfe;
}
.s1-info__chip--pos {
  background: #f0fdf4;
  color: #15803d;
  border: 1px solid #bbf7d0;
}
.s1-info__address {
  font-size: 12px;
  color: #64748b;
  margin: 4px 0 0;
  line-height: 1.5;
}

/* ─── Status ─── */
.s1-status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-top: 10px;
  border-top: 1px solid #e2e8f0;
}
.s1-status__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #22c55e;
  flex-shrink: 0;
  box-shadow: 0 0 6px rgba(34, 197, 94, 0.4);
}
.s1-status__text {
  font-size: 11px;
  font-weight: 600;
  color: #16a34a;
}
</style>
