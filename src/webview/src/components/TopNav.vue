<script setup lang="ts">
import { ref } from 'vue';
import { postMessage } from '../vscode';

defineProps<{
  canGoPrev: boolean;
  canGoNext: boolean;
}>();

const dropdownOpen = ref(false);

function navigate(direction: 'prev' | 'next') {
  postMessage('navigate', { direction });
}

function refresh() {
  postMessage('refresh');
  dropdownOpen.value = false;
}

function copyArticle() {
  postMessage('copyArticle');
  dropdownOpen.value = false;
}

function toggleDropdown() {
  dropdownOpen.value = !dropdownOpen.value;
}

function closeDropdown() {
  dropdownOpen.value = false;
}
</script>

<template>
  <div class="top-nav">
    <div class="nav-title">DeepWiki (Beta)</div>
    <div class="nav-actions">
      <button 
        class="nav-btn" 
        :class="{ disabled: !canGoPrev }"
        :disabled="!canGoPrev"
        @click="navigate('prev')"
        title="上一条"
      >
        <span class="arrow">←</span>
      </button>
      <button 
        class="nav-btn" 
        :class="{ disabled: !canGoNext }"
        :disabled="!canGoNext"
        @click="navigate('next')"
        title="下一条"
      >
        <span class="arrow">→</span>
      </button>
      <div class="dropdown" v-click-outside="closeDropdown">
        <button class="nav-btn" @click="toggleDropdown" title="更多操作">
          <span class="dots">⋮</span>
        </button>
        <div class="dropdown-menu" v-show="dropdownOpen">
          <div class="dropdown-item" @click="refresh">
            <span class="icon">↻</span>
            <span>Refresh</span>
          </div>
          <div class="dropdown-item" @click="copyArticle">
            <span class="icon">⎘</span>
            <span>Copy Article</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.top-nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 12px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--border-color, #3e3e42);
}

.nav-title {
  font-size: 13px;
  color: var(--muted-color, #858585);
  font-weight: 400;
}

.nav-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.nav-btn {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--muted-color, #858585);
  cursor: pointer;
  font-size: 14px;
  transition: all 0.15s ease;
}

.nav-btn:hover:not(.disabled) {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-color, #cccccc);
}

.nav-btn.disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.arrow {
  font-size: 16px;
}

.dots {
  font-size: 18px;
  line-height: 1;
}

.dropdown {
  position: relative;
}

.dropdown-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  background: var(--card-bg, #252526);
  border: 1px solid var(--border-color, #3e3e42);
  border-radius: 6px;
  min-width: 140px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  z-index: 100;
  overflow: hidden;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--text-color, #cccccc);
  cursor: pointer;
  transition: background 0.15s ease;
}

.dropdown-item:hover {
  background: rgba(255, 255, 255, 0.08);
}

.dropdown-item .icon {
  font-size: 14px;
  opacity: 0.8;
}
</style>

