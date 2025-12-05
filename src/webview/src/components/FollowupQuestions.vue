<script setup lang="ts">
import { postMessage } from '../vscode';

defineProps<{
  questions: string[];
}>();

function copyFollowup(question: string) {
  postMessage('copyFollowup', { question });
}
</script>

<template>
  <div class="followup-section">
    <h3 class="followup-title">Follow-up Questions</h3>
    <div class="followup-list">
      <div 
        v-for="(question, index) in questions" 
        :key="index"
        class="question-card"
        @click="copyFollowup(question)"
        :title="'点击复制: ' + question"
      >
        {{ question }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.followup-section {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color, #3e3e42);
}

.followup-title {
  font-size: 14px;
  color: var(--muted-color, #a0a0a0);
  margin-bottom: 12px;
  font-weight: 500;
}

.followup-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.question-card {
  background-color: var(--card-bg, #252526);
  padding: 12px 16px;
  border-radius: 6px;
  font-size: 14px;
  color: #d4d4d4;
  cursor: pointer;
  transition: all 0.15s ease;
  border: 1px solid transparent;
}

.question-card:hover {
  background-color: #2f2f31;
  border-color: rgba(167, 114, 208, 0.3);
}

.question-card:active {
  transform: scale(0.99);
}
</style>

