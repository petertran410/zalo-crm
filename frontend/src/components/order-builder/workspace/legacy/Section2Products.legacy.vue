<template>
  <div class="s2-products">
    <!-- ═══ 2-COLUMN GRID: 60% SEARCH, HERO & PROMOS (LEFT) + 40% CART (RIGHT) ═══ -->
    <div class="s2-top-grid">
      <!-- CỘT TRÁI (60%): TÌM KIẾM, HỒ SƠ SẢN PHẨM HERO & KHUYẾN MÃI -->
      <div class="s2-top-left">
        <!-- PRODUCT SEARCH & AUTOCOMPLETE DROPDOWN -->
        <div class="s2-search-zone">
          <div class="s2-search-bar">
            <Search :size="14" class="s2-search-bar__icon" />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Tìm sản phẩm (Tên, mã SP...)"
              class="s2-search-bar__input"
              @input="onSearchInput"
              @focus="isSearchDropdownOpen = true"
            />
            <button
              v-if="searchQuery"
              class="s2-search-clear-btn"
              title="Xóa tìm kiếm"
              @click="clearSearch"
            >
              <X :size="13" />
            </button>
          </div>

          <!-- Price Book selector inline -->
          <div class="s2-pricebook">
            <Tag :size="13" class="s2-pricebook__icon" />
            <span class="s2-pricebook__label">Bảng giá:</span>
            <select
              :value="selectedPriceBookId || 'standard'"
              class="s2-pricebook__select"
              @change="$emit('select-price-book', ($event.target as HTMLSelectElement).value)"
            >
              <option v-for="pb in PRICE_BOOKS" :key="pb.id" :value="pb.id">
                {{ pb.name }} {{ pb.discountPercent ? `(-${pb.discountPercent}%)` : '' }}
              </option>
            </select>
          </div>

          <!-- Search Dropdown Results (Bung rộng 100% chiều ngang s2-search-zone) -->
          <div
            v-if="isSearchDropdownOpen && searchQuery.trim()"
            class="s2-search-dropdown"
          >
            <div v-if="productsLoading" class="s2-dropdown-state">
              <Loader2 :size="16" class="s2-spin" />
              <span>Đang tìm kiếm sản phẩm...</span>
            </div>
            <div v-else-if="matchingProducts.length === 0" class="s2-dropdown-state">
              <ShoppingBag :size="18" />
              <span>Không tìm thấy sản phẩm "{{ searchQuery }}".</span>
            </div>
            <template v-else>
              <div
                v-for="prod in matchingProducts"
                :key="prod.id"
                class="s2-search-dropdown-item"
                @click="selectProductForDetail(prod)"
              >
                <div
                  v-if="prod.imageUrl && !failedImgMap[prod.id]"
                  class="s2-search-item__img-wrap"
                >
                  <img :src="prod.imageUrl" :alt="prod.name" class="s2-search-item__img" @error="handleTileImgError($event, prod)" />
                </div>
                <div
                  v-else
                  class="s2-search-item__color"
                  :style="{ background: getProductColor(prod.categoryName) }"
                >
                  {{ (prod.code || '').substring(0, 3) }}
                </div>
                <div class="s2-search-item__info">
                  <h5 class="s2-search-item__name">{{ prod.name }}</h5>
                  <div class="s2-search-item__meta">
                    <span class="s2-search-item__code">SKU: {{ prod.code }}</span>
                    <span class="s2-search-item__price">{{ formatVND(getEffectiveProductPrice(prod.basePrice, selectedPriceBookId)) }}</span>
                  </div>
                </div>
                <span class="s2-search-item__select-btn">Xem chi tiết ▶</span>
              </div>
            </template>
          </div>
        </div>

        <!-- HERO PRODUCT DETAIL SHOWCASE PANEL -->
        <div class="s2-hero-showcase">
          <!-- State A: Empty State (chưa chọn SP) -->
          <div v-if="!selectedDetailProduct" class="s2-hero-empty">
            <div class="s2-hero-empty__icon">
              <Search :size="24" :stroke-width="2.5" />
            </div>
            <h3 class="s2-hero-empty__title">Tìm kiếm & Chọn sản phẩm</h3>
            <p class="s2-hero-empty__desc">
              Gõ tên hoặc mã SP vào ô trên để xem chi tiết & thêm sản phẩm vào giỏ.
            </p>
          </div>

          <!-- State B: Active Product Detail Showcase -->
          <div v-else class="s2-hero-card">
            <!-- Banner Header Card -->
            <div
              class="s2-hero-card__banner"
              :style="{ background: `linear-gradient(135deg, ${getProductColor(selectedDetailProduct.categoryName)} 0%, #0f172a 100%)` }"
            >
              <div class="s2-hero-card__banner-left">
                <img
                  v-if="selectedDetailProduct.imageUrl && !failedImgMap[selectedDetailProduct.id]"
                  :src="selectedDetailProduct.imageUrl"
                  :alt="selectedDetailProduct.name"
                  class="s2-hero-card__img"
                  @error="handleTileImgError($event, selectedDetailProduct)"
                />
                <div v-else class="s2-hero-card__badge-initial">
                  {{ (selectedDetailProduct.code || 'SP').substring(0, 3) }}
                </div>

                <div class="s2-hero-card__title-wrap">
                  <span class="s2-hero-card__sku">SKU: {{ selectedDetailProduct.code }}</span>
                  <h3 class="s2-hero-card__name">{{ selectedDetailProduct.name }}</h3>
                </div>
              </div>

              <button
                class="s2-hero-card__close-btn"
                title="Đóng chi tiết"
                @click="selectedDetailProduct = null"
              >
                <X :size="16" />
              </button>
            </div>

            <!-- Body Metrics & Information -->
            <div class="s2-hero-card__body">
              <div class="s2-hero-metrics-grid">
                <div class="s2-hero-metric-box">
                  <span class="s2-hero-metric-box__label">Giá niêm yết</span>
                  <div class="s2-hero-metric-box__val s2-hero-metric-box__val--price">
                    {{ formatVND(getEffectiveProductPrice(selectedDetailProduct.basePrice, selectedPriceBookId)) }}
                    <s v-if="selectedPriceBookId && selectedPriceBookId !== 'standard' && selectedPriceBookId !== 'pos_sync'" class="s2-strikethrough-sm">
                      {{ formatVND(selectedDetailProduct.basePrice) }}
                    </s>
                  </div>
                </div>

                <div class="s2-hero-metric-box">
                  <span class="s2-hero-metric-box__label">Tồn kho chi nhánh</span>
                  <div class="s2-hero-metric-box__val">
                    <div v-if="inventoryState.loading" class="s2-inv-skeleton"></div>
                    <span
                      v-else
                      :class="['s2-inv-badge', inventoryBadge.cls]"
                      :title="inventoryState.data?.lastSyncedAt ? `Cập nhật: ${fmtDate(inventoryState.data.lastSyncedAt)}` : ''"
                    >
                      {{ inventoryBadge.label }}
                    </span>
                  </div>
                </div>

                <div class="s2-hero-metric-box">
                  <span class="s2-hero-metric-box__label">Kho xuất</span>
                  <select
                    :value="selectedBranchId || (branches?.[0]?.id ?? 1)"
                    class="s2-hero-branch-select"
                    @change="$emit('select-branch', Number(($event.target as HTMLSelectElement).value))"
                  >
                    <option
                      v-for="b in ((branches && branches.length > 0) ? branches : defaultBranches)"
                      :key="b.id"
                      :value="b.id"
                    >
                      {{ b.name }} (Tồn: {{ getBranchStock(selectedDetailProduct, b.id) }})
                    </option>
                  </select>
                </div>
              </div>

              <!-- Price History Accordion -->
              <div class="s2-price-history">
                <button
                  class="s2-price-history__toggle"
                  @click="showPriceHistory = !showPriceHistory"
                >
                  <CalendarClock :size="13" />
                  <span>📅 Giá mua gần nhất</span>
                  <span v-if="priceHistoryState.loading" class="s2-ph-loading-dot"></span>
                  <component :is="showPriceHistory ? ChevronUp : ChevronDown" :size="13" class="s2-ph-chevron" />
                </button>

                <div v-if="showPriceHistory" class="s2-price-history__body">
                  <div v-if="priceHistoryState.loading" class="s2-ph-skeleton-wrap">
                    <div v-for="i in 3" :key="i" class="s2-ph-skeleton-row"></div>
                  </div>
                  <div v-else-if="priceHistoryState.data.length === 0" class="s2-ph-empty">
                    <span>📭 Chưa từng mua SP này</span>
                  </div>
                  <table v-else class="s2-ph-table">
                    <thead>
                      <tr>
                        <th>Ngày</th>
                        <th>Mã đơn</th>
                        <th>SL</th>
                        <th>Đơn giá</th>
                        <th>Chi nhánh</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(item, idx) in priceHistoryState.data" :key="idx" :class="{ 's2-ph-row--gift': item.isGift }">
                        <td>{{ fmtDate(item.orderDate) }}</td>
                        <td class="s2-ph-code">{{ item.orderCode }}</td>
                        <td>{{ item.quantity }}</td>
                        <td>
                          <span v-if="item.isGift" class="s2-ph-gift-tag">🎁 Quà tặng</span>
                          <strong v-else class="s2-ph-price">{{ formatVND(item.unitPrice) }}</strong>
                        </td>
                        <td class="s2-ph-branch">{{ item.branchName ?? '—' }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- Product Inputs -->
              <div class="s2-hero-inputs-row">
                <div class="s2-hero-input-group">
                  <span class="s2-hero-input-label">💰 Đơn giá:</span>
                  <input
                    v-model.number="editedPriceToAdd"
                    type="number"
                    min="0"
                    class="s2-hero-input-field"
                    @input="onEditedPriceInput"
                  />
                </div>

                <div class="s2-hero-input-group">
                  <span class="s2-hero-input-label">🏷️ Chiết khấu:</span>
                  <div class="s2-discount-box">
                    <input
                      v-model.number="discountValueToAdd"
                      type="number"
                      min="0"
                      placeholder="0"
                      class="s2-discount-box__input"
                    />
                    <div class="s2-discount-box__unit-toggle">
                      <button
                        type="button"
                        class="s2-discount-box__unit-btn"
                        :class="{ 's2-discount-box__unit-btn--active': discountTypeToAdd === 'amount' }"
                        @click="discountTypeToAdd = 'amount'"
                      >
                        VNĐ
                      </button>
                      <button
                        type="button"
                        class="s2-discount-box__unit-btn"
                        :class="{ 's2-discount-box__unit-btn--active': discountTypeToAdd === 'percent' }"
                        @click="discountTypeToAdd = 'percent'"
                      >
                        %
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div class="s2-hero-inputs-row">
                <div class="s2-hero-input-group">
                  <span class="s2-hero-input-label">📦 Trạng thái:</span>
                  <select v-model="conditionToAdd" class="s2-hero-input-field">
                    <option value="normal">Bình thường</option>
                    <option value="damaged">Bục rách</option>
                    <option value="near_expiry">Cận date</option>
                  </select>
                </div>

                <div class="s2-hero-input-group">
                  <span class="s2-hero-input-label">📝 Ghi chú:</span>
                  <input
                    v-model="productNoteToAdd"
                    type="text"
                    placeholder="VD: Ít đường, Giao nguyên đai..."
                    class="s2-hero-input-field"
                  />
                </div>
              </div>

              <!-- Action Footer inside Hero Card -->
              <div class="s2-hero-action-bar">
                <div class="s2-hero-qty-group">
                  <span class="s2-hero-qty-label">Số lượng:</span>
                  <div class="s2-hero-qty-controls">
                    <button
                      type="button"
                      class="s2-hero-qty-btn"
                      title="Giảm số lượng"
                      @click="quantityToAdd = Math.max(1, quantityToAdd - 1)"
                    >
                      <Minus :size="12" :stroke-width="2.5" />
                    </button>
                    <input
                      type="number"
                      v-model.number="quantityToAdd"
                      min="1"
                      class="s2-hero-qty-input"
                    />
                    <button
                      type="button"
                      class="s2-hero-qty-btn"
                      title="Tăng số lượng"
                      @click="quantityToAdd++"
                    >
                      <Plus :size="12" :stroke-width="2.5" />
                    </button>
                  </div>
                </div>

                <button
                  class="s2-hero-add-btn"
                  :class="{ 's2-hero-add-btn--disabled': isOutOfStock }"
                  :disabled="isOutOfStock"
                  :title="isOutOfStock ? 'Sản phẩm đã hết hàng tại chi nhánh này' : ''"
                  @click="handleAddDetailProductToCart"
                >
                  <PackageX v-if="isOutOfStock" :size="16" :stroke-width="3" />
                  <Plus v-else-if="editingCartItemId === null" :size="16" :stroke-width="3" />
                  <Check v-else :size="16" :stroke-width="3" />
                  <span v-if="isOutOfStock">Hết hàng</span>
                  <span v-else-if="editingCartItemId === null">Thêm vào đơn hàng ({{ formatVND(calculateHeroItemTotal()) }})</span>
                  <span v-else>Cập nhật sản phẩm ({{ formatVND(calculateHeroItemTotal()) }})</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- KHUYẾN MÃI & ƯU ĐÃI -->
        <div class="s2-promo">
          <div class="s2-promo__header">
            <Tag :size="14" class="s2-promo__header-icon" />
            <span class="s2-promo__header-title">Khuyến mãi</span>

            <!-- Tabs Mở khóa / Khóa -->
            <div class="s2-promo-tabs">
              <button
                type="button"
                class="s2-promo-tab"
                :class="{ 's2-promo-tab--active': promoTab === 'unlocked' }"
                @click="promoTab = 'unlocked'"
              >
                <Unlock :size="11" />
                <span>Mở khóa ({{ unlockedPromos.length }})</span>
              </button>
              <button
                type="button"
                class="s2-promo-tab"
                :class="{ 's2-promo-tab--active': promoTab === 'locked' }"
                @click="promoTab = 'locked'"
              >
                <Lock :size="11" />
                <span>Khóa ({{ lockedPromos.length }})</span>
              </button>
            </div>
          </div>

          <!-- Tab Mở khóa nhưng trống (Chưa đủ điều kiện) -->
          <div v-if="promoTab === 'unlocked' && unlockedPromos.length === 0" class="s2-promo-empty-unlocked">
            <div class="s2-promo-empty-unlocked__content">
              <span>💡 Chưa có khuyến mãi đủ điều kiện mở khóa.</span>
              <button type="button" class="s2-promo-view-locked-btn" @click="promoTab = 'locked'">
                <Lock :size="12" />
                <span>Xem điều kiện mở khóa ({{ lockedPromos.length }})</span>
              </button>
            </div>
          </div>

          <!-- Danh sách khuyến mãi (theo tab đang chọn) -->
          <div v-else class="s2-promo__list">
            <div
              v-for="promo in displayedPromos"
              :key="promo.id"
              class="s2-promo-card"
              :class="{
                's2-promo-card--applied': isApplied(promo.id),
                's2-promo-card--eligible': isEligible(promo) && !isApplied(promo.id),
                's2-promo-card--disabled': !isEligible(promo) && !isApplied(promo.id),
              }"
              :style="{ '--promo-color': promo.color, '--promo-bg': promo.colorBg }"
              @click="handlePromoClick(promo)"
            >
              <div
                class="s2-promo-card__bar"
                :style="{ background: (isEligible(promo) || isApplied(promo.id)) ? promo.color : '#cbd5e1' }"
              />
              <div class="s2-promo-card__body">
                <div class="s2-promo-card__top">
                  <span
                    class="s2-promo-card__badge"
                    :style="(isEligible(promo) || isApplied(promo.id))
                      ? { background: promo.colorBg, color: promo.color, borderColor: promo.color + '33' }
                      : { background: '#f1f5f9', color: '#94a3b8', borderColor: '#e2e8f0' }"
                  >
                    {{ promo.badge }} {{ promo.tag }}
                  </span>
                  <span v-if="isApplied(promo.id)" class="s2-promo-card__applied">
                    <Check :size="10" /> Đã dùng
                  </span>
                  <span v-else-if="isEligible(promo)" class="s2-promo-card__add-btn" :style="{ color: promo.color }">
                    ▶ Áp dụng
                  </span>
                  <span v-else class="s2-promo-card__locked">🔒 Chưa đủ</span>
                </div>
                <h4 class="s2-promo-card__name" :class="{ 's2-promo-card__name--dim': !isEligible(promo) && !isApplied(promo.id) }">
                  {{ promo.name }}
                </h4>
                <div class="s2-promo-card__info">
                  <div class="s2-promo-card__row"><span class="s2-promo-card__label">ĐK:</span> {{ promo.conditionText }}</div>
                  <div class="s2-promo-card__row s2-promo-card__row--reward" :class="{ 's2-promo-card__row--dim': !isEligible(promo) && !isApplied(promo.id) }">
                    <span class="s2-promo-card__label">Thưởng:</span> {{ promo.rewardText }}
                  </div>
                </div>
                <!-- Progress bar -->
                <div v-if="!isEligible(promo) && !isApplied(promo.id)" class="s2-promo-card__progress">
                  <div class="s2-promo-card__progress-track">
                    <div
                      class="s2-promo-card__progress-fill"
                      :style="{ width: promoProgressPct(promo) + '%', background: promo.color }"
                    />
                  </div>
                  <span class="s2-promo-card__progress-text">{{ formatProgress(promo) }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Coming Soon: Sản phẩm bán chạy theo mùa -->
          <div class="s2-coming-soon">
            <Sparkles :size="14" class="s2-coming-soon__icon" />
            <span class="s2-coming-soon__text">Sản phẩm bán chạy nhất theo mùa</span>
            <span class="s2-coming-soon__badge">Tính năng này sắp ra mắt</span>
          </div>
        </div>
      </div>

      <!-- CỘT PHẢI (40%): GIỎ HÀNG SẢN PHẨM ĐÃ CHỌN -->
      <div class="s2-cart">
        <div class="s2-cart__header">
          <ShoppingBag :size="15" class="s2-cart__header-icon" />
          <span class="s2-cart__header-title">Giỏ hàng đã chọn ({{ realCartItems.length }})</span>
          <span class="s2-cart__header-total">{{ formatVND(totalBeforeDiscount) }}</span>
        </div>

        <!-- State A: Giỏ hàng trống -->
        <div v-if="realCartItems.length === 0" class="s2-cart__empty-state">
          <ShoppingBag :size="24" class="s2-cart__empty-icon" />
          <span>Giỏ hàng đang trống. Tìm kiếm & thêm sản phẩm từ cột bên trái để tạo đơn.</span>
        </div>

        <!-- State B: Danh sách sản phẩm trong giỏ hàng -->
        <template v-else>
          <div class="s2-cart__body">
            <div class="s2-cart__table">
              <div class="s2-cart__table-head">
                <span class="s2-col s2-col--name">Tên sản phẩm</span>
                <span class="s2-col s2-col--qty">SL</span>
                <span class="s2-col s2-col--total">Thành tiền</span>
                <span class="s2-col s2-col--action"></span>
              </div>

              <transition-group name="s2-cart-row">
                <div
                  v-for="item in realCartItems"
                  :key="item.product.id"
                  class="s2-cart__row"
                  :class="{
                    's2-cart__row--gift': item.isGift,
                    's2-cart__row--editing': editingCartItemId === item.product.id,
                  }"
                  :title="item.isGift ? '' : 'Nhấp để chỉnh sửa'"
                  @click="!item.isGift && selectCartItemForEdit(item)"
                >
                  <div class="s2-col s2-col--name">
                    <div class="s2-cart__product-color" :style="{ background: getProductColor(item.product.categoryName) }">
                      {{ (item.product.code || '').substring(0, 2) }}
                    </div>
                    <div class="s2-cart__product-name-wrap">
                      <span class="s2-cart__product-name" :title="item.product.name">{{ item.product.name }}</span>
                      <span v-if="item.isGift" class="s2-cart__gift-badge">🎁 Quà tặng</span>
                      <div class="s2-cart__product-meta">
                        <span class="s2-cart__sku-mini">{{ item.product.code }}</span>
                        <span v-if="item.discount" class="s2-cart__discount-mini">-{{ formatVND(item.discount) }}</span>
                        <span v-if="item.note" class="s2-cart__note-mini" :title="item.note">📝 {{ item.note }}</span>
                      </div>
                    </div>
                  </div>

                  <span class="s2-col s2-col--qty s2-mono s2-text-bold">x{{ item.quantity }}</span>

                  <span class="s2-col s2-col--total s2-mono s2-text-bold">
                    {{ item.isGift ? 'Miễn phí' : formatVND(Math.max(0, getEffectiveProductPrice(item.product.basePrice, selectedPriceBookId) * item.quantity - (item.discount || 0))) }}
                  </span>

                  <div class="s2-col s2-col--action">
                    <button v-if="!item.isGift" class="s2-remove-btn" title="Xóa khỏi giỏ hàng" @click.stop="$emit('remove-product', cartItems.indexOf(item))">
                      <Trash2 :size="13" />
                    </button>
                  </div>
                </div>
              </transition-group>
            </div>
          </div>

          <div class="s2-cart__footer">
            <!-- Order discount -->
            <div class="s2-cart__order-discount">
              <span class="s2-cart__order-discount-label">Giảm giá tổng đơn:</span>
              <div class="s2-discount-wrap">
                <span class="s2-discount-minus">-</span>
                <input
                  type="number"
                  :value="orderDiscountValue || ''"
                  placeholder="0"
                  min="0"
                  class="s2-discount-input s2-discount-input--wide"
                  @input="onOrderDiscountInput(Number(($event.target as HTMLInputElement).value) || 0)"
                />
                <select
                  :value="orderDiscountType || 'amount'"
                  class="s2-discount-type-select-inline"
                  @change="$emit('update-order-discount-type', ($event.target as HTMLSelectElement).value)"
                >
                  <option value="amount">đ</option>
                  <option value="percent">%</option>
                </select>
              </div>
            </div>

            <!-- Subtotal -->
            <div class="s2-cart__subtotal">
              <span>Tổng tạm tính:</span>
              <span class="s2-cart__subtotal-amount">{{ formatVND(grandTotal) }}</span>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import {
  Search, ShoppingBag, Tag, Plus, Minus, Trash2, Check,
  Loader2, Sparkles, X, CalendarClock, ChevronDown, ChevronUp,
  PackageCheck, PackageX, AlertTriangle, HelpCircle, Lock, Unlock,
} from 'lucide-vue-next';
import type { POSProduct, CartItem, POSBranch, PromotionProgram } from '../types';
import {
  formatVND, PRICE_BOOKS, getEffectiveProductPrice,
  MOCK_PROMOTIONS, evaluatePromoCondition, promoConditionProgress,
} from '../types';
import { usePagination } from '@/composables/use-pagination';
import { useProductInventory } from '@/composables/use-product-inventory';
import { usePriceHistory } from '@/composables/use-price-history';

const props = defineProps<{
  cartItems: CartItem[];
  defaultBranches: POSBranch[];
  branches?: POSBranch[];
  selectedBranchId?: number | null;
  posCustomerId: number;
  selectedPriceBookId?: string;
  orderDiscountValue?: number;
  orderDiscountType?: 'amount' | 'percent';
  totalBeforeDiscount: number;
  grandTotal: number;
  appliedPromoIds: string[];
  branches?: POSBranch[];
  selectedBranchId?: number | null;
  posCustomerId?: number | null;
}>();

const emit = defineEmits<{
  'add-product': [product: POSProduct, opts?: { quantity?: number; discount?: number; note?: string }];
  'update-cart-item': [productId: number, opts: { quantity: number; discount: number; note: string; conditionType: string; discountType: string; discountValue: number }];
  'update-quantity': [productId: number, quantity: number];
  'update-product-note': [index: number, note: string];
  'remove-product': [indexOrId: number];
  'update-product-discount': [productId: number, discount: number];
  'update-order-discount': [discount: number];
  'update-order-discount-type': [type: string];
  'select-price-book': [priceBookId: string];
  'select-branch': [branchId: number];
  'apply-promotion': [promo: PromotionProgram];
  'remove-promotion': [promoId: string];
}>();

const defaultBranches: POSBranch[] = [
  { id: 1, name: 'Chi nhánh HCM (Kho chính)' },
  { id: 2, name: 'Chi nhánh Hà Nội' },
  { id: 3, name: 'Chi nhánh Đà Nẵng' },
];

/**
 * Lấy tồn kho theo chi nhánh.
 * Ưu tiên dùng data thực từ inventoryState (pos_branch_inventory).
 * Fallback về "..." khi đang load, hoặc "—" khi không có dữ liệu.
 */
function getBranchStock(product: POSProduct, branchId: number): number | string {
  // Nếu đang load → hiện "..."
  if (inventoryState.value.loading) return '...';

  const inv = inventoryState.value.data;

  // Có data với danh sách từng chi nhánh (trường hợp query tổng tất cả chi nhánh)
  if (inv?.branches && inv.branches.length > 0) {
    const branch = inv.branches.find((b: any) => b.branchId === branchId);
    if (branch) return branch.available ?? branch.onHand ?? 0;
  }

  // Có data cho đúng chi nhánh đang chọn
  if (inv && inv.branchId === branchId) {
    return inv.available ?? inv.onHand ?? 0;
  }

  // Không có data → hiện "—"
  return '—';
}


// ─── Inventory & Price History ────────────────────────────────────────────────
const { inventoryState, fetchInventory } = useProductInventory();
const { priceHistoryState, fetchPriceHistory } = usePriceHistory();
const showPriceHistory = ref(true);

/** Label + class badge tồn kho — hiển thị tổng số lượng sản phẩm ở 3 chi nhánh */
const inventoryBadge = computed(() => {
  const inv = inventoryState.value.data;
  if (inventoryState.value.loading) return { label: 'Đang tải...', cls: 's2-inv-badge--loading', icon: 'loading' };
  if (!inv || inv.status === 'Unknown' || inv.onHand === null) {
    return { label: 'Chưa có dữ liệu', cls: 's2-inv-badge--unknown', icon: 'unknown' };
  }

  const total = inv.available ?? inv.onHand ?? 0;
  const status = inv.status ?? (total <= 0 ? 'OutOfStock' : 'InStock');

  if (status === 'OutOfStock' || total <= 0) return { label: `🔴 Hết hàng (${total})`, cls: 's2-inv-badge--out', icon: 'out' };
  if (status === 'LowStock') return { label: `🟡 Sắp hết (${total})`, cls: 's2-inv-badge--low', icon: 'low' };
  return { label: `🟢 Còn hàng (${total})`, cls: 's2-inv-badge--in', icon: 'in' };
});

/** True khi hết hàng tại chi nhánh đang chọn (chặn thêm vào giỏ) */
const isOutOfStock = computed(() => {
  const inv = inventoryState.value.data;
  if (!inv) return false;
  if (props.selectedBranchId && inv.branches && inv.branches.length > 0) {
    const b = inv.branches.find((item: any) => item.branchId === props.selectedBranchId);
    if (b) return (b.available ?? b.onHand ?? 0) <= 0;
  }
  return (inv.available ?? inv.onHand ?? 0) <= 0;
});



/** Định dạng ngày đẹp */
function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ─── Paginated Product Fetching ───────────────────────────────────────────────
const {
  items: rawItems,
  loading: productsLoading,
  loadPage,
  search: searchProducts,
} = usePagination<any>({
  endpoint: '/pos/products',
  defaultLimit: 20,
  defaultSortBy: 'code',
  defaultSortOrder: 'asc',
});

// Map raw API items to POSProduct shape
const matchingProducts = computed<POSProduct[]>(() =>
  (rawItems.value || []).map((p: any) => ({
    id: p.posId ?? p.id,
    code: p.code || '',
    name: p.name || '',
    categoryName: p.categoryName || '',
    basePrice: p.basePrice || 0,
    unit: p.unit || '',
    onHand: p.onHand,
    imageUrl: p.images?.[0]?.image || p.imageUrl || undefined,
  }))
);

onMounted(() => {
  loadPage();
});

// ─── Autocomplete Search & Hero State ────────────────────────────────────────
const searchQuery = ref('');
const isSearchDropdownOpen = ref(false);
const selectedDetailProduct = ref<POSProduct | null>(null);
const editingCartItemId = ref<number | null>(null); // null = thêm mới, productId = đang sửa
const quantityToAdd = ref(1);
const editedPriceToAdd = ref(0);
const discountValueToAdd = ref(0);
const discountTypeToAdd = ref<'amount'|'percent'>('amount');
const conditionToAdd = ref<'normal'|'damaged'|'near_expiry'>('normal');
const productNoteToAdd = ref('');

let searchTimer: ReturnType<typeof setTimeout> | null = null;

function onSearchInput() {
  isSearchDropdownOpen.value = true;
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    searchProducts(searchQuery.value);
  }, 300);
}

function clearSearch() {
  searchQuery.value = '';
  isSearchDropdownOpen.value = false;
}

function getActualDiscountAmount(): number {
  if (!selectedDetailProduct.value) return 0;
  const unitPrice = getEffectiveProductPrice(selectedDetailProduct.value.basePrice, props.selectedPriceBookId);
  if (discountTypeToAdd.value === 'percent') {
    return Math.floor(unitPrice * (discountValueToAdd.value / 100));
  }
  return discountValueToAdd.value;
}

function onEditedPriceInput() {
  if (!selectedDetailProduct.value) return;
  const unitPrice = getEffectiveProductPrice(selectedDetailProduct.value.basePrice, props.selectedPriceBookId);
  const diff = unitPrice - (editedPriceToAdd.value || 0);
  if (diff > 0) {
    discountTypeToAdd.value = 'amount';
    discountValueToAdd.value = diff;
  } else {
    discountValueToAdd.value = 0;
  }
}

function calculateHeroItemTotal(): number {
  if (!selectedDetailProduct.value) return 0;
  const unitPrice = getEffectiveProductPrice(selectedDetailProduct.value.basePrice, props.selectedPriceBookId);
  const qty = Math.max(1, quantityToAdd.value);
  const discountAmount = getActualDiscountAmount();
  return Math.max(0, (unitPrice * qty) - (discountAmount * qty));
}

async function selectProductForDetail(product: POSProduct) {
  selectedDetailProduct.value = product;
  editingCartItemId.value = null; // thêm mới
  const unitPrice = getEffectiveProductPrice(product.basePrice, props.selectedPriceBookId);
  editedPriceToAdd.value = unitPrice;
  quantityToAdd.value = 1;
  discountValueToAdd.value = 0;
  discountTypeToAdd.value = 'amount';
  conditionToAdd.value = 'normal';
  productNoteToAdd.value = '';
  showPriceHistory.value = true;
  isSearchDropdownOpen.value = false;

  await Promise.all([
    fetchInventory(product.id, null),
    fetchPriceHistory(props.posCustomerId, product.id),
  ]);
}

/** Mở Hero để sửa một item đã có trong giỏ hàng */
async function selectCartItemForEdit(item: CartItem) {
  selectedDetailProduct.value = item.product;
  editingCartItemId.value = item.product.id;
  const unitPrice = getEffectiveProductPrice(item.product.basePrice, props.selectedPriceBookId);
  quantityToAdd.value = item.quantity;
  discountValueToAdd.value = (item as any).discountValue ?? (item.discount ? item.discount / Math.max(1, item.quantity) : 0);
  discountTypeToAdd.value = (item as any).discountType ?? 'amount';
  editedPriceToAdd.value = unitPrice - (discountTypeToAdd.value === 'amount' ? discountValueToAdd.value : 0);
  conditionToAdd.value = (item as any).conditionType ?? 'normal';
  // Extract note without condition prefix
  let rawNote = item.note || '';
  rawNote = rawNote.replace(/^\[Hàng bục rách\]\s*/,'').replace(/^\[Hàng cận date\]\s*/,'');
  productNoteToAdd.value = rawNote;
  showPriceHistory.value = false;
  isSearchDropdownOpen.value = false;

  await Promise.all([
    fetchInventory(item.product.id, null),
    fetchPriceHistory(props.posCustomerId, item.product.id),
  ]);
}

function handleAddDetailProductToCart() {
  if (!selectedDetailProduct.value) return;
  const prod = selectedDetailProduct.value;
  const qty = Math.max(1, quantityToAdd.value);

  let finalNote = productNoteToAdd.value.trim();
  if (conditionToAdd.value === 'damaged') finalNote = `[Hàng bục rách] ${finalNote}`.trim();
  else if (conditionToAdd.value === 'near_expiry') finalNote = `[Hàng cận date] ${finalNote}`.trim();

  const discountAmount = getActualDiscountAmount();

  if (editingCartItemId.value !== null) {
    // Chế độ sửa: phát update-cart-item để THAY THẾ item
    emit('update-cart-item', editingCartItemId.value, {
      quantity: qty,
      discount: discountAmount * qty,
      note: finalNote,
      conditionType: conditionToAdd.value,
      discountType: discountTypeToAdd.value,
      discountValue: discountValueToAdd.value,
    });
  } else {
    // Chế độ thêm mới
    emit('add-product', prod, {
      quantity: qty,
      discount: discountAmount * qty,
      note: finalNote,
      conditionType: conditionToAdd.value,
      discountType: discountTypeToAdd.value,
      discountValue: discountValueToAdd.value,
    });
  }

  // Reset
  searchQuery.value = '';
  selectedDetailProduct.value = null;
  editingCartItemId.value = null;
  quantityToAdd.value = 1;
  discountValueToAdd.value = 0;
  discountTypeToAdd.value = 'amount';
  conditionToAdd.value = 'normal';
  productNoteToAdd.value = '';
  isSearchDropdownOpen.value = false;
}

// ─── Cart ─────────────────────────────────────────────────────────────────────
const realCartItems = computed(() => props.cartItems.filter(c => !c.isGift));

function onProductDiscountInput(productId: number, val: number, maxDiscount: number) {
  const discount = Math.min(Math.max(0, val), maxDiscount);
  emit('update-product-discount', productId, discount);
}

function onQuantityInput(productId: number, valStr: string) {
  const val = parseInt(valStr, 10);
  if (!isNaN(val) && val >= 1) {
    emit('update-quantity', productId, val);
  }
}

function onQuantityBlur(productId: number, valStr: string) {
  const val = parseInt(valStr, 10);
  if (isNaN(val) || val < 1) {
    emit('update-quantity', productId, 1);
  }
}

function onOrderDiscountInput(val: number) {
  const discount = Math.min(Math.max(0, val), props.totalBeforeDiscount);
  emit('update-order-discount', discount);
}

// ─── Promotions ───────────────────────────────────────────────────────────────
const promotions = MOCK_PROMOTIONS;
const promoTab = ref<'unlocked' | 'locked'>('unlocked');

function isEligible(promo: PromotionProgram): boolean {
  return evaluatePromoCondition(promo.condition, props.cartItems, props.totalBeforeDiscount);
}

function isApplied(promoId: string): boolean {
  return props.appliedPromoIds.includes(promoId);
}

const unlockedPromos = computed(() =>
  promotions.filter(p => isEligible(p) || isApplied(p.id))
);

const lockedPromos = computed(() =>
  promotions.filter(p => !isEligible(p) && !isApplied(p.id))
);

const displayedPromos = computed(() => {
  if (promoTab.value === 'unlocked') {
    return unlockedPromos.value;
  }
  return lockedPromos.value;
});

function promoProgressPct(promo: PromotionProgram): number {
  const { current, required } = promoConditionProgress(promo.condition, props.cartItems, props.totalBeforeDiscount);
  return required > 0 ? Math.min(100, (current / required) * 100) : 0;
}

function formatProgress(promo: PromotionProgram): string {
  const { current, required } = promoConditionProgress(promo.condition, props.cartItems, props.totalBeforeDiscount);
  if (promo.condition.type === 'min_order_amount') {
    return `${formatVND(current)} / ${formatVND(required)}`;
  }
  return `Còn thiếu ${required - current} sản phẩm`;
}

function handlePromoClick(promo: PromotionProgram) {
  if (isApplied(promo.id)) {
    emit('remove-promotion', promo.id);
  } else if (isEligible(promo)) {
    emit('apply-promotion', promo);
  }
}

// ─── Color palette ────────────────────────────────────────────────────────────
const CATEGORY_COLORS: Record<string, string> = {};
const COLOR_PALETTE = [
  '#f59e0b', '#6366f1', '#ef4444', '#ec4899', '#0ea5e9',
  '#10b981', '#8b5cf6', '#f97316', '#14b8a6', '#64748b',
];
let colorIdx = 0;
function getProductColor(category?: string): string {
  const cat = category || 'default';
  if (!CATEGORY_COLORS[cat]) {
    CATEGORY_COLORS[cat] = COLOR_PALETTE[colorIdx % COLOR_PALETTE.length];
    colorIdx++;
  }
  return CATEGORY_COLORS[cat];
}

// ─── Product Image Error Handling ─────────────────────────────────────
const failedImgMap = reactive<Record<string, boolean>>({});

function handleTileImgError(e: Event, product: any) {
  const target = e.target as HTMLImageElement;
  if (product.originalImageUrl && target.src !== product.originalImageUrl) {
    target.src = product.originalImageUrl;
  } else {
    failedImgMap[product.id] = true;
  }
}
</script>

<style scoped>
.s2-products {
  padding-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ─── 2-Column Grid Layout (60% Search, Hero & Promos Left / 40% Cart Right) ─── */
.s2-top-grid {
  display: grid;
  grid-template-columns: minmax(0, 6fr) minmax(0, 4fr);
  gap: 16px;
  align-items: stretch;
}

.s2-top-left {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  height: 100%;
}

.s2-top-right {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

@media (max-width: 900px) {
  .s2-top-grid {
    grid-template-columns: 1fr;
    align-items: start;
  }
}

/* ─── Search Zone & Dropdown ─── */
.s2-search-zone {
  display: flex;
  gap: 10px;
  align-items: center;
  position: relative;
}

.s2-search-bar {
  flex: 1;
  position: relative;
}

.s2-search-bar__icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: #94a3b8;
}

.s2-search-bar__input {
  width: 100%;
  padding: 8px 32px 8px 32px;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  font-size: 12.5px;
  background: #ffffff;
  outline: none;
  transition: all 0.15s;
  box-sizing: border-box;
}

.s2-search-bar__input:focus {
  border-color: #0068FF;
  box-shadow: 0 0 0 3px rgba(0, 104, 255, 0.1);
}

.s2-search-clear-btn {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  background: #f1f5f9;
  border: none;
  border-radius: 50%;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  cursor: pointer;
}

/* Autocomplete Dropdown Panel (Bung rộng bằng đúng 100% chiều ngang s2-search-zone) */
.s2-search-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  width: 100%;
  box-sizing: border-box;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.18);
  max-height: 320px;
  overflow-y: auto;
  z-index: 1000;
  padding: 6px;
}

.s2-dropdown-state {
  padding: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 12.5px;
  color: #64748b;
}

.s2-search-dropdown-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.s2-search-dropdown-item:hover {
  background: #eff6ff;
}

.s2-search-item__color {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.s2-search-item__img-wrap {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
}

.s2-search-item__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.s2-search-item__info {
  flex: 1;
  min-width: 0;
}

.s2-search-item__name {
  font-size: 13px;
  font-weight: 700;
  color: #0f172a;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.s2-search-item__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11.5px;
  color: #64748b;
  margin-top: 2px;
}

.s2-search-item__code {
  font-weight: 600;
  color: #3b82f6;
  background: #eff6ff;
  padding: 1px 6px;
  border-radius: 4px;
}

.s2-search-item__price {
  font-weight: 700;
  color: #059669;
}

.s2-search-item__stock {
  font-weight: 500;
  color: #64748b;
}

.s2-search-item__select-btn {
  font-size: 11.5px;
  font-weight: 700;
  color: #0068FF;
  padding: 4px 10px;
  background: #eff6ff;
  border-radius: 6px;
  white-space: nowrap;
}

/* ─── Price Book ─── */
.s2-pricebook {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 5px 10px;
  flex-shrink: 0;
}
.s2-pricebook__icon { color: #0068FF; flex-shrink: 0; }
.s2-pricebook__label { font-size: 11px; font-weight: 700; color: #64748b; white-space: nowrap; }
.s2-pricebook__select { border: none; background: transparent; font-size: 11.5px; font-weight: 700; color: #1e293b; outline: none; cursor: pointer; }

/* ═══ HERO PRODUCT DETAIL SHOWCASE PANEL ═══ */
.s2-hero-showcase {
  margin: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}

/* State A: Empty State */
.s2-hero-empty {
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  border: 2px dashed #cbd5e1;
  border-radius: 12px;
  padding: 36px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 10px;
  flex: 1;
  height: 100%;
  min-height: 440px;
  box-sizing: border-box;
}

.s2-hero-empty__icon {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: #e0f2fe;
  color: #0284c7;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(2, 132, 199, 0.15);
}

.s2-hero-empty__title {
  font-size: 15px;
  font-weight: 800;
  color: #0f172a;
  margin: 0;
}

.s2-hero-empty__desc {
  font-size: 12.5px;
  color: #64748b;
  max-width: 440px;
  margin: 0;
  line-height: 1.5;
}

/* State B: Active Hero Card */
.s2-hero-card {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  flex: 1;
  height: 100%;
  box-sizing: border-box;
}

.s2-hero-card__banner {
  padding: 20px 24px;
  position: relative;
  color: #ffffff;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.s2-hero-card__banner-left {
  display: flex;
  gap: 16px;
  align-items: center;
}

.s2-hero-card__badge-initial {
  width: 60px;
  height: 60px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.2);
  border: 2px solid rgba(255, 255, 255, 0.4);
  color: #ffffff;
  font-size: 22px;
  font-weight: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  flex-shrink: 0;
}

.s2-hero-card__img {
  width: 60px;
  height: 60px;
  border-radius: 14px;
  object-fit: cover;
  border: 2px solid rgba(255, 255, 255, 0.4);
  flex-shrink: 0;
}

.s2-hero-card__title-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.s2-hero-card__sku {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.5px;
  background: rgba(0, 0, 0, 0.3);
  color: #ffffff;
  padding: 2px 8px;
  border-radius: 6px;
  align-self: flex-start;
  text-transform: uppercase;
}

.s2-hero-card__name {
  font-size: 17px;
  font-weight: 800;
  line-height: 1.3;
  margin: 0;
  color: #ffffff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.s2-hero-card__close-btn {
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.35);
  color: #ffffff;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}

.s2-hero-card__close-btn:hover {
  background: rgba(255, 255, 255, 0.35);
  transform: scale(1.05);
}

/* Hero Body Grid */
.s2-hero-card__body {
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.s2-hero-metrics-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.s2-hero-metric-box {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.s2-hero-metric-box__label {
  font-size: 11.5px;
  font-weight: 600;
  color: #64748b;
}

.s2-hero-metric-box__val {
  font-size: 15px;
  font-weight: 800;
  color: #0f172a;
}

.s2-hero-metric-box__val--price {
  color: #0068FF;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}

.s2-hero-metric-box__val--stock {
  color: #059669;
}

.s2-strikethrough-sm {
  font-size: 11px;
  color: #94a3b8;
  font-weight: 500;
  margin-left: 4px;
}

.s2-stock-chip {
  font-size: 12px;
  font-weight: 700;
}

.s2-stock-chip--in { color: #16a34a; }
.s2-stock-chip--out { color: #dc2626; }

.s2-hero-branch-select {
  border: 1px solid #cbd5e1;
  background: #ffffff;
  border-radius: 6px;
  padding: 4px 6px;
  font-size: 12px;
  font-weight: 700;
  color: #0f172a;
  outline: none;
  cursor: pointer;
  width: 100%;
  margin-top: 2px;
}

.s2-hero-branch-select:focus {
  border-color: #0068FF;
  box-shadow: 0 0 0 2px rgba(0, 104, 255, 0.1);
}

/* Hero Inputs Row */
.s2-discount-input-wrap {
  display: flex;
  align-items: center;
  gap: 4px;
}
.s2-discount-type-select {
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 8px 6px;
  font-size: 13px;
  background: white;
  outline: none;
  cursor: pointer;
}
.s2-discount-type-select-inline {
  border: none;
  background: transparent;
  color: #64748b;
  font-weight: 700;
  cursor: pointer;
  outline: none;
  padding: 0 4px;
}
.s2-hero-inputs-row {
  display: flex;
  gap: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 8px 14px;
}

.s2-hero-input-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.s2-hero-input-label {
  font-size: 12px;
  font-weight: 700;
  color: #475569;
  white-space: nowrap;
}

.s2-hero-input-field {
  flex: 1;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 12px;
  font-weight: 600;
  color: #0f172a;
  outline: none;
}

.s2-hero-input-field:focus {
  border-color: #0068FF;
  box-shadow: 0 0 0 2px rgba(0, 104, 255, 0.1);
}

/* ─── Integrated Discount Input Box + Unit Toggle ─── */
.s2-discount-box {
  display: flex;
  align-items: center;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  border-radius: 6px;
  padding: 2px 2px 2px 8px;
  flex: 1;
  min-width: 0;
  transition: all 0.15s ease;
}

.s2-discount-box:focus-within {
  border-color: #0068FF;
  box-shadow: 0 0 0 2px rgba(0, 104, 255, 0.1);
}

.s2-discount-box__input {
  flex: 1;
  border: none;
  background: transparent;
  padding: 2px 4px 2px 0;
  font-size: 12px;
  font-weight: 700;
  color: #0f172a;
  outline: none;
  width: 100%;
  min-width: 0;
}

.s2-discount-box__unit-toggle {
  display: flex;
  align-items: center;
  gap: 2px;
  background: #f1f5f9;
  padding: 2px;
  border-radius: 5px;
  flex-shrink: 0;
}

.s2-discount-box__unit-btn {
  border: none;
  background: transparent;
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
  line-height: 1;
}

.s2-discount-box__unit-btn:hover {
  color: #1e293b;
}

.s2-discount-box__unit-btn--active {
  background: #0068FF;
  color: #ffffff !important;
  box-shadow: 0 1px 2px rgba(0, 104, 255, 0.25);
}

.s2-hero-input-field::placeholder {
  color: #94a3b8;
  font-style: italic;
  font-weight: 400;
}

/* Action Footer inside Hero Card */
.s2-hero-action-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-top: 14px;
  border-top: 1px solid #e2e8f0;
}

.s2-hero-qty-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.s2-hero-qty-label {
  font-size: 13px;
  font-weight: 700;
  color: #334155;
}

.s2-hero-qty-controls {
  display: flex;
  align-items: center;
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 2px;
}

.s2-hero-qty-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: #ffffff;
  border-radius: 8px;
  color: #334155;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
  transition: all 0.15s;
}

.s2-hero-qty-btn:hover {
  background: #0068FF;
  color: #ffffff;
}

.s2-hero-qty-input {
  width: 48px;
  height: 32px;
  border: none;
  background: transparent;
  text-align: center;
  font-size: 14px;
  font-weight: 800;
  color: #0f172a;
  outline: none;
}

.s2-hero-add-btn {
  flex: 1;
  height: 42px;
  background: #0068FF;
  color: #ffffff;
  border: none;
  border-radius: 10px;
  font-size: 13.5px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(0, 104, 255, 0.25);
  transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}

.s2-hero-add-btn:hover:not(:disabled) {
  background: #0056d2;
  box-shadow: 0 6px 18px rgba(0, 104, 255, 0.35);
  transform: translateY(-1px);
}

.s2-hero-add-btn:active:not(:disabled) {
  transform: scale(0.98);
  box-shadow: 0 2px 8px rgba(0, 104, 255, 0.2);
}

/* Disabled state khi OutOfStock */
.s2-hero-add-btn--disabled,
.s2-hero-add-btn:disabled {
  background: #94a3b8;
  cursor: not-allowed;
  box-shadow: none;
  transform: none;
}

/* ─── Inventory Badge (Desaturated Pastels) ─── */
.s2-inv-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 20px;
  font-variant-numeric: tabular-nums;
}

.s2-inv-badge--in {
  color: #346538;
  background: #EDF3EC;
  border: 1px solid #D1E7DD;
}

.s2-inv-badge--low {
  color: #956400;
  background: #FBF3DB;
  border: 1px solid #F7E6B5;
}

.s2-inv-badge--out {
  color: #9F2F2D;
  background: #FDEBEC;
  border: 1px solid #F9C8C7;
}

.s2-inv-badge--unknown {
  color: #787774;
  background: #F7F6F3;
  border: 1px solid #EAEAEA;
}

.s2-inv-badge--loading {
  color: #94a3b8;
  background: #f1f5f9;
  animation: s2-pulse 1s infinite;
}

.s2-inv-skeleton {
  width: 100px;
  height: 22px;
  border-radius: 20px;
  background: linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%);
  background-size: 200% 100%;
  animation: s2-shimmer 1.2s infinite;
}

@keyframes s2-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

@keyframes s2-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* ─── Price History Accordion ─── */
.s2-price-history {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
}

.s2-price-history__toggle {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: #f8fafc;
  border: none;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  color: #334155;
  text-align: left;
  transition: background 0.15s;
}

.s2-price-history__toggle:hover {
  background: #f1f5f9;
}

.s2-ph-chevron {
  margin-left: auto;
  color: #94a3b8;
  flex-shrink: 0;
}

.s2-ph-loading-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #0068FF;
  animation: s2-pulse 0.8s infinite;
}

.s2-price-history__body {
  padding: 10px 12px;
  background: #ffffff;
  border-top: 1px solid #e2e8f0;
  animation: s2-slide-down 0.2s ease;
}

@keyframes s2-slide-down {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* Skeleton loading cho lịch sử giá */
.s2-ph-skeleton-wrap {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.s2-ph-skeleton-row {
  height: 20px;
  border-radius: 4px;
  background: linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%);
  background-size: 200% 100%;
  animation: s2-shimmer 1.2s infinite;
}

/* Empty state */
.s2-ph-empty {
  font-size: 12px;
  color: #94a3b8;
  text-align: center;
  padding: 8px 0;
}

/* Table lịch sử giá */
.s2-ph-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11.5px;
}

.s2-ph-table th {
  text-align: left;
  font-size: 10.5px;
  font-weight: 700;
  color: #94a3b8;
  padding: 3px 6px;
  border-bottom: 1px solid #f1f5f9;
  white-space: nowrap;
}

.s2-ph-table td {
  padding: 5px 6px;
  color: #334155;
  border-bottom: 1px solid #f8fafc;
  vertical-align: middle;
}

.s2-ph-table tr:last-child td {
  border-bottom: none;
}

.s2-ph-row--gift td {
  background: #fefce8;
  color: #92400e;
}

.s2-ph-code {
  font-weight: 700;
  color: #0068FF;
  font-size: 11px;
}

.s2-ph-price {
  font-weight: 800;
  color: #059669;
}

.s2-ph-branch {
  color: #64748b;
  font-size: 10.5px;
}

.s2-ph-gift-tag {
  font-size: 11px;
  font-weight: 700;
  color: #b45309;
  background: #fef9c3;
  padding: 1px 6px;
  border-radius: 10px;
}

/* ─── Cart Column (Phủ full chiều cao thả xuống tràn hết khung) ─── */
.s2-cart {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  height: 100%;
  box-sizing: border-box;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.03);
}

.s2-cart__body {
  flex: 1;
  overflow-y: auto;
  min-height: 120px;
  padding-right: 4px;
}

.s2-cart__footer {
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px solid #f1f5f9;
}

.s2-cart__empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 20px 16px;
  color: #94a3b8;
  font-size: 12.5px;
  font-weight: 500;
  text-align: center;
}

.s2-cart__empty-icon {
  color: #cbd5e1;
}

/* Smooth row animation */
.s2-cart-row-enter-active,
.s2-cart-row-leave-active {
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.s2-cart-row-enter-from {
  opacity: 0;
  transform: translateY(-6px);
}
.s2-cart-row-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

.s2-cart__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f1f5f9;
}
.s2-cart__header-icon { color: #0068FF; }
.s2-cart__header-title { font-size: 13.5px; font-weight: 800; color: #0f172a; }
.s2-cart__header-total {
  margin-left: auto;
  font-size: 15px;
  font-weight: 900;
  color: #0068FF;
  font-family: 'Geist Mono', 'SF Mono', 'JetBrains Mono', ui-monospace, monospace;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}

.s2-cart__table { display: flex; flex-direction: column; gap: 0; }

.s2-cart__table-head {
  display: flex;
  align-items: center;
  padding: 8px 10px;
  font-size: 11px;
  font-weight: 700;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-bottom: 1px solid #f1f5f9;
}

.s2-cart__row {
  display: flex;
  align-items: center;
  padding: 10px 10px;
  background: transparent;
  border: none;
  border-bottom: 1px solid #f1f5f9;
  border-radius: 0;
  font-size: 12.5px;
  transition: background 0.15s ease;
  cursor: pointer;
}
.s2-cart__row:last-child {
  border-bottom: none;
}
.s2-cart__row:hover {
  background: #f0f7ff;
}
.s2-cart__row--gift {
  background: #f0fdf4;
  cursor: default;
}
.s2-cart__row--editing {
  background: #eff6ff !important;
  box-shadow: inset 3px 0 0 #0068FF;
}

.s2-col { display: flex; align-items: center; }
.s2-col--name { flex: 1; gap: 8px; min-width: 0; }
.s2-col--qty {
  width: 38px;
  justify-content: center;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  color: #334155;
}
.s2-col--total {
  width: 100px;
  justify-content: flex-end;
  font-variant-numeric: tabular-nums;
  font-family: 'Geist Mono', 'SF Mono', ui-monospace, monospace;
  font-weight: 800;
  color: #0068FF;
}
.s2-col--action { width: 34px; justify-content: flex-end; }

/* Inline Quantity Controls inside Cart Row */
.s2-cart__qty-ctrl {
  display: flex;
  align-items: center;
  gap: 2px;
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 2px;
}

.s2-cart__qty-btn {
  width: 20px;
  height: 20px;
  border: none;
  background: #ffffff;
  border-radius: 4px;
  color: #475569;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  transition: all 0.15s ease;
}

.s2-cart__qty-btn:hover {
  background: #0068FF;
  color: #ffffff;
}

.s2-cart__qty-input {
  width: 32px;
  height: 20px;
  border: none;
  background: transparent;
  text-align: center;
  font-size: 12px;
  font-weight: 800;
  color: #0f172a;
  outline: none;
}

.s2-cart__product-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 2px;
}
.s2-cart__sku-mini {
  font-size: 10px;
  font-weight: 700;
  color: #3b82f6;
  background: #eff6ff;
  padding: 1px 5px;
  border-radius: 3px;
  white-space: nowrap;
}
.s2-cart__discount-mini {
  font-size: 10px;
  font-weight: 700;
  color: #dc2626;
}
.s2-cart__note-mini {
  font-size: 10px;
  color: #16a34a;
  font-style: italic;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 120px;
}

.s2-cart__product-color {
  width: 26px; height: 26px; border-radius: 6px; color: #fff;
  font-size: 10px; font-weight: 800; display: flex; align-items: center;
  justify-content: center; flex-shrink: 0;
}
.s2-cart__product-name-wrap { display: flex; flex-direction: column; min-width: 0; flex: 1; gap: 0; }
.s2-cart__product-name { font-size: 12.5px; font-weight: 700; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.s2-cart__gift-badge { font-size: 10px; color: #16a34a; font-weight: 700; }

.s2-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
.s2-text-bold { font-weight: 800; color: #0f172a; }
.s2-strikethrough { font-size: 10.5px; color: #94a3b8; margin-right: 4px; }
.s2-text-muted { color: #cbd5e1; }

.s2-qty-controls { display: flex; align-items: center; gap: 2px; }
.s2-qty-btn {
  width: 20px; height: 20px; border: 1px solid #cbd5e1; background: #fff;
  border-radius: 4px; display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: #475569;
}
.s2-qty-btn:hover { background: #e2e8f0; }
.s2-qty-input {
  width: 32px; height: 20px; border: 1px solid #cbd5e1; border-radius: 4px;
  text-align: center; font-size: 11px; font-weight: 700; outline: none;
}

.s2-discount-wrap { display: flex; align-items: center; gap: 2px; }
.s2-discount-minus { font-size: 11px; color: #94a3b8; }
.s2-discount-input {
  width: 54px; height: 20px; border: 1px solid #cbd5e1; border-radius: 4px;
  padding: 0 4px; font-size: 11px; outline: none; text-align: right;
}
.s2-discount-input--wide { width: 80px; }
.s2-discount-unit { font-size: 10px; color: #94a3b8; }

.s2-remove-btn {
  border: none; background: transparent; color: #ef4444; cursor: pointer;
  padding: 4px; border-radius: 4px; transition: background 0.15s;
}
.s2-remove-btn:hover { background: #fee2e2; }

.s2-cart__order-discount {
  display: flex; align-items: center; justify-content: flex-end; gap: 8px;
  padding-top: 8px; border-top: 1px solid #f1f5f9; font-size: 12px; font-weight: 700; color: #475569;
}

.s2-cart__subtotal {
  display: flex; align-items: center; justify-content: flex-end; gap: 12px;
  font-size: 13px; font-weight: 800; color: #1e293b;
}
.s2-cart__subtotal-amount { font-size: 16px; color: #0068FF; }

/* ─── Promotions (Fit Content Height) ─── */
.s2-promo {
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: #ffffff;
  border: 1px solid #f1f5f9;
  border-radius: 12px;
  padding: 14px;
  box-sizing: border-box;
}

.s2-promo__header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-bottom: 8px;
  border-bottom: 1px solid #f1f5f9;
}
.s2-promo__header-icon { color: #f59e0b; }
.s2-promo__header-title { font-size: 13px; font-weight: 800; color: #0f172a; }

.s2-promo-tabs {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 3px;
  background: #f1f5f9;
  padding: 3px;
  border-radius: 8px;
}

.s2-promo-tab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border: none;
  background: transparent;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
  cursor: pointer;
  transition: all 0.15s ease;
}

.s2-promo-tab:hover {
  color: #1e293b;
}

.s2-promo-tab--active {
  background: #ffffff;
  color: #0068FF;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.s2-promo-empty-unlocked {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 22px 14px;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  border-radius: 10px;
  margin: 6px 0;
}

.s2-promo-empty-unlocked__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  text-align: center;
}

.s2-promo-view-locked-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #2563eb;
  border-radius: 6px;
  font-size: 11.5px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
}

.s2-promo-view-locked-btn:hover {
  background: #dbeafe;
  border-color: #93c5fd;
}

.s2-promo__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 380px;
  overflow-y: auto;
  padding-right: 4px;
}

/* Custom Sleek Scrollbar for Promo List */
.s2-promo__list::-webkit-scrollbar {
  width: 4px;
}
.s2-promo__list::-webkit-scrollbar-track {
  background: #f1f5f9;
  border-radius: 4px;
}
.s2-promo__list::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
}
.s2-promo__list::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}

.s2-promo-card {
  display: flex;
  background: #ffffff;
  border: 1px solid #f1f5f9;
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
  position: relative;
}
.s2-promo-card:hover {
  border-color: #cbd5e1;
  transform: translateY(-1px);
}
.s2-promo-card:active {
  transform: scale(0.98);
}
.s2-promo-card:hover { border-color: var(--promo-color, #0068FF); box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
.s2-promo-card--applied { border-color: #10b981; background: #f0fdf4; }
.s2-promo-card--disabled { opacity: 0.7; cursor: default; }

.s2-promo-card__bar { width: 5px; flex-shrink: 0; }
.s2-promo-card__body { flex: 1; padding: 10px 12px; display: flex; flex-direction: column; gap: 4px; }

.s2-promo-card__top { display: flex; align-items: center; justify-content: space-between; }
.s2-promo-card__badge { font-size: 10.5px; font-weight: 800; padding: 2px 6px; border-radius: 4px; border: 1px solid transparent; }
.s2-promo-card__applied { font-size: 11px; font-weight: 800; color: #16a34a; display: flex; align-items: center; gap: 2px; }
.s2-promo-card__add-btn { font-size: 11px; font-weight: 800; }
.s2-promo-card__locked { font-size: 10.5px; color: #94a3b8; }

.s2-promo-card__name { font-size: 12.5px; font-weight: 800; color: #1e293b; margin: 2px 0 0; }
.s2-promo-card__name--dim { color: #64748b; }

.s2-promo-card__info { font-size: 11px; color: #475569; display: flex; flex-direction: column; gap: 2px; }
.s2-promo-card__row--reward { font-weight: 700; color: #0068FF; }
.s2-promo-card__row--dim { color: #94a3b8; }
.s2-promo-card__label { color: #94a3b8; font-weight: 600; }

.s2-promo-card__progress { margin-top: 4px; display: flex; align-items: center; gap: 8px; }
.s2-promo-card__progress-track { flex: 1; height: 4px; background: #e2e8f0; border-radius: 2px; overflow: hidden; }
.s2-promo-card__progress-fill { height: 100%; border-radius: 2px; transition: width 0.3s ease; }
.s2-promo-card__progress-text { font-size: 10px; color: #64748b; font-weight: 600; white-space: nowrap; }

.s2-coming-soon {
  display: flex; align-items: center; gap: 8px; background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  border: 1px dashed #cbd5e1; border-radius: 10px; padding: 10px 14px; margin-top: 4px;
}
.s2-coming-soon__icon { color: #8b5cf6; }
.s2-coming-soon__text { font-size: 12px; font-weight: 700; color: #475569; }
.s2-coming-soon__badge { margin-left: auto; font-size: 10.5px; font-weight: 700; color: #7c3aed; background: #f3e8ff; padding: 2px 8px; border-radius: 12px; }

.s2-spin { animation: s2-spin 1s linear infinite; }
@keyframes s2-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
</style>
