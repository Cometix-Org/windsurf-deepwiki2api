<script setup lang="ts">
import LoadingSpinner from './LoadingSpinner.vue';

defineProps<{
  isLoading: boolean;
}>();
</script>

<template>
  <div class="content-area">
    <LoadingSpinner v-if="isLoading" />
    <div v-else class="article-content">
      <slot></slot>
    </div>
  </div>
</template>

<style scoped>
.content-area {
  min-height: 100px;
}

/* 文章内容样式 */
.article-content {
  line-height: 1.7;
}
</style>
