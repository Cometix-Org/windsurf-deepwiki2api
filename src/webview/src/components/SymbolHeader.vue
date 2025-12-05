<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  title: string;
  symbolKindName: string;
  symbolKind: number;
}>();

// Symbol Kind 到 Codicon 类名的映射
const codiconMap: Record<number, string> = {
  0: 'symbol-file',      // File
  1: 'symbol-module',    // Module
  2: 'symbol-namespace', // Namespace
  3: 'symbol-package',   // Package
  4: 'symbol-class',     // Class
  5: 'symbol-method',    // Method
  6: 'symbol-property',  // Property
  7: 'symbol-field',     // Field
  8: 'symbol-constructor', // Constructor
  9: 'symbol-enum',      // Enum
  10: 'symbol-interface', // Interface
  11: 'symbol-function', // Function
  12: 'symbol-variable', // Variable
  13: 'symbol-constant', // Constant
  14: 'symbol-string',   // String
  15: 'symbol-number',   // Number
  16: 'symbol-boolean',  // Boolean
  17: 'symbol-array',    // Array
  18: 'symbol-object',   // Object
  19: 'symbol-key',      // Key
  20: 'symbol-null',     // Null
  21: 'symbol-enum-member', // EnumMember
  22: 'symbol-struct',   // Struct
  23: 'symbol-event',    // Event
  24: 'symbol-operator', // Operator
  25: 'symbol-type-parameter' // TypeParameter
};

const codicon = computed(() => codiconMap[props.symbolKind] || 'symbol-misc');

// 将 DEEP_WIKI_SYMBOL_TYPE_XXX 映射回可读的名称
const symbolKindDisplayName = computed(() => {
  const name = props.symbolKindName;
  if (!name) {
    return '';
  }
  // 处理 DEEP_WIKI_SYMBOL_TYPE_XXX 格式
  const match = name.match(/^DEEP_WIKI_SYMBOL_TYPE_(\w+)$/i);
  if (match) {
    return match[1].toLowerCase();
  }
  // 其他格式直接返回小写
  return name.toLowerCase();
});

const displayTitle = computed(() => {
  if (symbolKindDisplayName.value) {
    return `${props.title} (${symbolKindDisplayName.value})`;
  }
  return props.title;
});
</script>

<template>
  <div class="symbol-header">
    <div class="symbol-icon">
      <span :class="['codicon', 'codicon-' + codicon]" aria-hidden="true"></span>
    </div>
    <h1 class="symbol-title" :title="displayTitle">{{ displayTitle }}</h1>
  </div>
</template>

<style scoped>
.symbol-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
}

.symbol-icon {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: linear-gradient(135deg, rgba(167, 114, 208, 0.2) 0%, rgba(167, 114, 208, 0.1) 100%);
  color: var(--accent-purple, #a772d0);
  flex-shrink: 0;
}

.symbol-icon .codicon {
  font-size: 16px;
  line-height: 1;
}

.symbol-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--header-color, #e1e1e1);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
</style>

