<template>
  <div class="ob-accordion">
    <div
      v-for="(section, idx) in sections"
      :key="section.id"
      class="ob-accordion__section"
      :class="{
        'ob-accordion__section--open': section.id === activeSection,
        'ob-accordion__section--collapsed': section.id !== activeSection && completedSections.includes(section.id),
        'ob-accordion__section--locked': isLocked(section.id),
        'ob-accordion__section--upcoming': !isLocked(section.id) && section.id !== activeSection && !completedSections.includes(section.id),
      }"
    >
      <!-- Section Header (Always visible) -->
      <div
        class="ob-accordion__header"
        :class="{ 'ob-accordion__header--clickable': !isLocked(section.id) && section.id !== activeSection }"
        @click="handleHeaderClick(section.id)"
      >
        <div class="ob-accordion__header-left">
          <!-- Step indicator -->
          <div
            class="ob-accordion__step"
            :class="{
              'ob-accordion__step--active': section.id === activeSection,
              'ob-accordion__step--done': completedSections.includes(section.id) && section.id !== activeSection,
              'ob-accordion__step--locked': isLocked(section.id),
            }"
          >
            <template v-if="completedSections.includes(section.id) && section.id !== activeSection">
              <Check :size="14" :stroke-width="2.5" />
            </template>
            <template v-else-if="isLocked(section.id)">
              <Lock :size="12" :stroke-width="2.5" />
            </template>
            <template v-else>
              {{ idx + 1 }}
            </template>
          </div>

          <!-- Section title + icon -->
          <div class="ob-accordion__title-group">
            <component :is="section.icon" :size="16" class="ob-accordion__icon" />
            <h3 class="ob-accordion__title">{{ section.title }}</h3>
          </div>
        </div>

        <div class="ob-accordion__header-right">
          <!-- Summary text (when collapsed & completed) -->
          <span
            v-if="completedSections.includes(section.id) && section.id !== activeSection && section.summary"
            class="ob-accordion__summary"
          >
            {{ section.summary }}
          </span>

          <!-- Lock hint -->
          <span v-if="isLocked(section.id)" class="ob-accordion__lock-hint">
            {{ section.lockReason || 'Hoàn thành bước trước' }}
          </span>

          <!-- Edit button (for completed sections) -->
          <button
            v-if="completedSections.includes(section.id) && section.id !== activeSection && !isLocked(section.id)"
            class="ob-accordion__edit-btn"
            @click.stop="$emit('open-section', section.id)"
          >
            <Pencil :size="12" :stroke-width="2" />
            <span>Chỉnh sửa</span>
          </button>

          <!-- Chevron indicator -->
          <ChevronDown
            :size="16"
            class="ob-accordion__chevron"
            :class="{ 'ob-accordion__chevron--open': section.id === activeSection }"
          />
        </div>
      </div>

      <!-- Section Content (Only when active) -->
      <transition name="ob-section-expand">
        <div v-if="section.id === activeSection" class="ob-accordion__content">
          <slot :name="section.id" />

          <!-- Next button -->
          <div class="ob-accordion__footer">
            <button
              v-if="section.showNext !== false"
              class="ob-accordion__next-btn"
              :disabled="section.nextDisabled"
              :class="{ 'ob-accordion__next-btn--disabled': section.nextDisabled }"
              @click="$emit('next-section')"
            >
              <span>{{ section.nextLabel || 'Tiếp theo' }}</span>
              <ArrowRight :size="14" :stroke-width="2.5" />
            </button>
          </div>
        </div>
      </transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Check, Lock, Pencil, ChevronDown, ArrowRight } from 'lucide-vue-next';
import type { Component } from 'vue';

export interface AccordionSection {
  id: string;
  title: string;
  icon: Component;
  summary?: string;
  lockReason?: string;
  nextLabel?: string;
  nextDisabled?: boolean;
  showNext?: boolean;
}

const props = defineProps<{
  sections: AccordionSection[];
  activeSection: string;
  completedSections: string[];
  lockedSections: string[];
}>();

const emit = defineEmits<{
  'open-section': [sectionId: string];
  'next-section': [];
}>();

function isLocked(sectionId: string): boolean {
  return props.lockedSections.includes(sectionId);
}

function handleHeaderClick(sectionId: string) {
  if (isLocked(sectionId)) return;
  if (sectionId === props.activeSection) return;
  emit('open-section', sectionId);
}
</script>

<style scoped>
.ob-accordion {
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* ─── Section Container ─── */
.ob-accordion__section {
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: #ffffff;
  margin-bottom: 14px;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
}
.ob-accordion__section--open {
  border: 1.5px solid #0068FF;
  box-shadow: 0 8px 24px rgba(0, 104, 255, 0.12);
}
.ob-accordion__section--open .ob-accordion__header {
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}
.ob-accordion__section--collapsed {
  border-color: #e2e8f0;
  background: #ffffff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}
.ob-accordion__section--locked {
  opacity: 0.6;
  cursor: not-allowed;
  border-color: #f1f5f9;
  background: #fafbfc;
}
.ob-accordion__section--upcoming {
  border-color: #e2e8f0;
  background: #ffffff;
}

/* ─── Header ─── */
.ob-accordion__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  gap: 12px;
  user-select: none;
  min-height: 52px;
}
.ob-accordion__header--clickable {
  cursor: pointer;
}
.ob-accordion__header--clickable:hover {
  background: rgba(0, 104, 255, 0.03);
}

.ob-accordion__header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.ob-accordion__header-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

/* ─── Step Indicator ─── */
.ob-accordion__step {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11.5px;
  font-weight: 800;
  flex-shrink: 0;
  transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
  background: #F7F6F3;
  color: #787774;
  border: 1px solid #EAEAEA;
}
.ob-accordion__step--active {
  background: #0068FF;
  color: #fff;
  border-color: #0068FF;
  box-shadow: 0 2px 8px rgba(0, 104, 255, 0.25);
}
.ob-accordion__step--done {
  background: #EDF3EC;
  color: #346538;
  border-color: #D1E7DD;
}
.ob-accordion__step--locked {
  background: #F7F6F3;
  color: #cbd5e1;
  border-color: #EAEAEA;
}

/* ─── Title ─── */
.ob-accordion__title-group {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ob-accordion__icon {
  color: #787774;
  flex-shrink: 0;
}
.ob-accordion__section--open .ob-accordion__icon {
  color: #0068FF;
}
.ob-accordion__section--collapsed .ob-accordion__icon {
  color: #346538;
}
.ob-accordion__title {
  font-size: 13.5px;
  font-weight: 800;
  color: #111111;
  margin: 0;
  white-space: nowrap;
}
.ob-accordion__section--locked .ob-accordion__title {
  color: #94a3b8;
}

/* ─── Summary ─── */
.ob-accordion__summary {
  font-size: 12px;
  font-weight: 600;
  color: #475569;
  background: #ffffff;
  border: 1px solid #EAEAEA;
  padding: 3px 10px;
  border-radius: 20px;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ─── Lock hint ─── */
.ob-accordion__lock-hint {
  font-size: 11px;
  color: #94a3b8;
  font-style: italic;
}

/* ─── Edit button ─── */
.ob-accordion__edit-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 8px;
  border: 1px solid #D1E7DD;
  background: #EDF3EC;
  color: #346538;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}
.ob-accordion__edit-btn:hover {
  background: #dcfce7;
}
.ob-accordion__edit-btn:active {
  transform: scale(0.96);
}
.ob-accordion__edit-btn:hover {
  background: #dcfce7;
  border-color: #86efac;
  box-shadow: 0 2px 6px rgba(22, 163, 106, 0.12);
}

/* ─── Chevron ─── */
.ob-accordion__chevron {
  color: #94a3b8;
  transition: transform 0.3s ease;
  flex-shrink: 0;
}
.ob-accordion__chevron--open {
  transform: rotate(180deg);
  color: #0068FF;
}

/* ─── Content ─── */
.ob-accordion__content {
  padding: 0 18px 18px;
  border-top: 1px solid #f1f5f9;
}

/* ─── Footer / Next Button ─── */
.ob-accordion__footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 16px;
  margin-top: 16px;
  border-top: 1px solid #f1f5f9;
}
.ob-accordion__next-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 22px;
  border-radius: 10px;
  border: none;
  background: #0068FF;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 2px 8px rgba(0, 104, 255, 0.2);
}
.ob-accordion__next-btn:hover {
  background: #0055d4;
  box-shadow: 0 4px 14px rgba(0, 104, 255, 0.3);
  transform: translateY(-1px);
}
.ob-accordion__next-btn--disabled {
  background: #e2e8f0;
  color: #94a3b8;
  cursor: not-allowed;
  box-shadow: none;
}
.ob-accordion__next-btn--disabled:hover {
  transform: none;
  box-shadow: none;
}

/* ─── Transition ─── */
.ob-section-expand-enter-active {
  animation: ob-section-slide-in 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}
.ob-section-expand-leave-active {
  animation: ob-section-slide-out 0.25s ease;
}
@keyframes ob-section-slide-in {
  from {
    opacity: 0;
    max-height: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    max-height: 2000px;
    transform: translateY(0);
  }
}
@keyframes ob-section-slide-out {
  from {
    opacity: 1;
    max-height: 2000px;
  }
  to {
    opacity: 0;
    max-height: 0;
  }
}
</style>
