<script setup lang="ts">
</script>

<template>
  <div class="loading-container">
    <div class="loading-spinner"></div>
    <div class="loading-text">正在加载 DeepWiki 内容...</div>
  </div>
</template>

<style scoped>
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: var(--muted-color, #858585);
}

.loading-spinner {
  width: 36px;
  height: 36px;
  border: 3px solid var(--border-color, #3e3e42);
  border-top-color: var(--accent-purple, #a772d0);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.loading-text {
  font-size: 13px;
}
</style>

