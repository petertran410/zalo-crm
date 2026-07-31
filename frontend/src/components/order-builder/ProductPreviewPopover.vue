<template>
  <teleport to="body">
    <transition name="popover-fade">
      <div
        v-if="visible && product && position"
        class="ob-product-popover"
        :style="popoverStyle"
        @mouseenter="$emit('keep-open')"
        @mouseleave="$emit('close')"
      >
        <div class="ob-popover__inner">
          <!-- Header Image / Badge -->
          <div class="ob-popover__hero">
            <div class="ob-popover__img-wrap">
              <img
                v-if="product.imageUrl && !imgError"
                :src="product.imageUrl"
                :alt="product.name"
                class="ob-popover__img"
                @error="handleImgError"
              />
              <div
                v-else
                class="ob-popover__placeholder-img"
                :style="{ background: categoryColor }"
              >
                <span>{{ (product.code || 'SP').substring(0, 3) }}</span>
              </div>
            </div>

            <div class="ob-popover__badges">
              <span class="ob-popover__category-badge" :style="{ background: categoryColor }">
                {{ product.categoryName || 'Sản phẩm' }}
              </span>
              <span class="ob-popover__sku-badge">
                SKU: {{ product.code || 'N/A' }}
              </span>
            </div>
          </div>

          <!-- Body Details -->
          <div class="ob-popover__body">
            <h3 class="ob-popover__title">{{ product.name }}</h3>

            <!-- Price & Stock section -->
            <div class="ob-popover__grid">
              <div class="ob-popover__stat-card">
                <span class="ob-popover__stat-label">Giá niêm yết</span>
                <span class="ob-popover__stat-value ob-popover__stat-value--price">
                  {{ formatVND(product.basePrice) }}
                </span>
              </div>

              <div class="ob-popover__stat-card">
                <span class="ob-popover__stat-label">Tồn kho khả dụng</span>
                <span
                  class="ob-popover__stat-value"
                  :class="{
                    'ob-text-green': (product.onHand ?? 0) > 10,
                    'ob-text-amber': (product.onHand ?? 0) > 0 && (product.onHand ?? 0) <= 10,
                    'ob-text-red': (product.onHand ?? 0) <= 0
                  }"
                >
                  {{ product.onHand !== undefined ? product.onHand : '—' }} {{ product.unit || 'đơn vị' }}
                </span>
              </div>
            </div>

            <!-- Specs / Extra info -->
            <div class="ob-popover__specs">
              <div class="ob-popover__spec-item">
                <span class="ob-popover__spec-label">Đơn vị tính:</span>
                <span class="ob-popover__spec-val">{{ product.unit || 'Cái/Hộp' }}</span>
              </div>
              <div class="ob-popover__spec-item">
                <span class="ob-popover__spec-label">Trạng thái kho:</span>
                <span
                  class="ob-popover__status-pill"
                  :class="(product.onHand ?? 0) > 0 ? 'ob-status-pill--success' : 'ob-status-pill--danger'"
                >
                  {{ (product.onHand ?? 0) > 0 ? '🟢 Sẵn hàng giao' : '🔴 Hết hàng kho' }}
                </span>
              </div>
            </div>

            <!-- Short description -->
            <div class="ob-popover__desc">
              <span class="ob-popover__desc-title">💡 Thông tin thêm:</span>
              <p>
                Sản phẩm chính hãng, hỗ trợ áp dụng các chương trình khuyến mãi theo số lượng hoặc giá trị đơn hàng.
              </p>
            </div>
          </div>

          <!-- Footer hint -->
          <div class="ob-popover__footer">
            <span>Nhấp vào thẻ sản phẩm để thêm vào đơn hàng</span>
          </div>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { POSProduct } from './types';
import { formatVND } from './types';

const props = defineProps<{
  product: POSProduct | null;
  targetRect: DOMRect | null;
  visible: boolean;
  categoryColor?: string;
}>();

defineEmits<{
  'keep-open': [];
  'close': [];
}>();

const imgError = ref(false);
const handleImgError = (e: Event) => {
  const target = e.target as HTMLImageElement;
  if (props.product?.originalImageUrl && target.src !== props.product.originalImageUrl) {
    target.src = props.product.originalImageUrl;
  } else {
    imgError.value = true;
  }
};

watch(() => props.product, () => {
  imgError.value = false;
});

const categoryColor = computed(() => props.categoryColor || '#0068FF');

const position = computed(() => {
  if (!props.targetRect) return null;

  const rect = props.targetRect;
  const popoverWidth = 320;
  const popoverHeight = 360;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let left = rect.right + 12; // Mặc định bên phải card
  let top = rect.top;

  // Nếu bị tràn lề phải viewport, chuyển sang bên trái card
  if (left + popoverWidth > viewportWidth - 16) {
    left = rect.left - popoverWidth - 12;
  }

  // Nếu vẫn bị tràn lề trái (màn nhỏ), căn chỉnh vào giữa
  if (left < 16) {
    left = Math.max(16, rect.left);
  }

  // Điều chỉnh vertical để không bị đè khỏi bottom viewport
  if (top + popoverHeight > viewportHeight - 16) {
    top = Math.max(16, viewportHeight - popoverHeight - 16);
  }

  return { left, top };
});

const popoverStyle = computed(() => {
  if (!position.value) return {};
  return {
    left: `${position.value.left}px`,
    top: `${position.value.top}px`,
  };
});
</script>

<style scoped>
.ob-product-popover {
  position: fixed;
  z-index: 99999;
  width: 320px;
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 16px 40px -8px rgba(15, 23, 42, 0.18), 0 0 0 1px rgba(226, 232, 240, 0.8);
  overflow: hidden;
  pointer-events: auto;
  font-family: inherit;
  backdrop-filter: blur(10px);
}

.ob-popover__inner {
  width: 100%;
}

/* ─── Hero Image Section ─── */
.ob-popover__hero {
  position: relative;
  width: 100%;
  height: 140px;
  background: linear-gradient(135deg, #f8fafc 0%, #edf2f7 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-bottom: 1px solid #f1f5f9;
}
.ob-popover__img-wrap {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ob-popover__img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  padding: 8px;
  transition: transform 0.3s ease;
}
.ob-product-popover:hover .ob-popover__img {
  transform: scale(1.05);
}
.ob-popover__placeholder-img {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-size: 28px;
  font-weight: 800;
  letter-spacing: 1px;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
}

.ob-popover__badges {
  position: absolute;
  top: 10px;
  left: 10px;
  right: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
}
.ob-popover__category-badge {
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 6px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
  white-space: nowrap;
}
.ob-popover__sku-badge {
  background: rgba(15, 23, 42, 0.75);
  color: #f8fafc;
  font-size: 10px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 6px;
  backdrop-filter: blur(4px);
}

/* ─── Body Details ─── */
.ob-popover__body {
  padding: 14px 16px;
}
.ob-popover__title {
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 12px;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.ob-popover__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 12px;
}
.ob-popover__stat-card {
  background: #f8fafc;
  border: 1px solid #f1f5f9;
  border-radius: 10px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ob-popover__stat-label {
  font-size: 10px;
  color: #64748b;
  font-weight: 500;
}
.ob-popover__stat-value {
  font-size: 12px;
  font-weight: 700;
  color: #1e293b;
}
.ob-popover__stat-value--price {
  color: #0068FF;
  font-size: 13px;
}

.ob-popover__specs {
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 8px 12px;
  margin-bottom: 12px;
}
.ob-popover__spec-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
}
.ob-popover__spec-label {
  color: #64748b;
  font-weight: 500;
}
.ob-popover__spec-val {
  color: #1e293b;
  font-weight: 600;
}

.ob-popover__status-pill {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 12px;
}
.ob-status-pill--success {
  background: #dcfce7;
  color: #15803d;
}
.ob-status-pill--danger {
  background: #fee2e2;
  color: #b91c1c;
}

.ob-popover__desc {
  background: #f1f5f9;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 11px;
  color: #475569;
  line-height: 1.45;
}
.ob-popover__desc-title {
  font-weight: 700;
  color: #334155;
  display: block;
  margin-bottom: 2px;
}
.ob-popover__desc p {
  margin: 0;
}

/* ─── Footer ─── */
.ob-popover__footer {
  background: #f8fafc;
  border-top: 1px solid #f1f5f9;
  padding: 8px 16px;
  text-align: center;
  font-size: 10px;
  color: #94a3b8;
  font-weight: 500;
}

/* ─── Utility classes ─── */
.ob-text-green { color: #16a34a !important; }
.ob-text-amber { color: #d97706 !important; }
.ob-text-red { color: #dc2626 !important; }

/* ─── Outer Popover Fade (Khi mo / dong) ─── */
.popover-fade-enter-active,
.popover-fade-leave-active {
  transition: opacity 0.15s ease-out, transform 0.15s ease-out;
}
.popover-fade-enter-from,
.popover-fade-leave-to {
  opacity: 0;
  transform: scale(0.96) translateY(4px);
}
</style>
