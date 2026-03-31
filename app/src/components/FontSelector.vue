<script setup lang="ts">
import { ref, computed } from 'vue'

export type FontChoice = 'sans' | 'serif' | 'mono'

const props = defineProps<{
  modelValue: FontChoice
}>()

const emit = defineEmits<{
  'update:modelValue': [value: FontChoice]
}>()

const isOpen = ref(false)

const fonts: { key: FontChoice; label: string; family: string; preview: string }[] = [
  { key: 'sans', label: 'Sans', family: "'Inter', system-ui, sans-serif", preview: 'Aa' },
  { key: 'serif', label: 'Serif', family: "'Noto Serif SC', Georgia, serif", preview: 'Aa' },
  { key: 'mono', label: 'Mono', family: "'JetBrains Mono', monospace", preview: 'Aa' },
]

const currentFont = computed(() => fonts.find((f) => f.key === props.modelValue))

function select(key: FontChoice) {
  emit('update:modelValue', key)
  isOpen.value = false
}
</script>

<template>
  <div class="font-selector">
    <button
      class="font-trigger"
      @click="isOpen = !isOpen"
      :title="`Font: ${currentFont?.label}`"
      :aria-expanded="isOpen"
      aria-label="Select font"
    >
      <span class="font-preview" :style="{ fontFamily: currentFont?.family }">
        {{ currentFont?.preview }}
      </span>
    </button>

    <transition name="dropdown">
      <div v-show="isOpen" class="font-dropdown">
        <button
          v-for="font in fonts"
          :key="font.key"
          class="font-option"
          :class="{ active: font.key === modelValue }"
          :style="{ fontFamily: font.family }"
          @click="select(font.key)"
        >
          <span class="font-option-preview">{{ font.preview }}</span>
          <span class="font-option-label">{{ font.label }}</span>
        </button>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.font-selector {
  position: relative;
}

.font-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--topbar-btn-color);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-base);
}

.font-trigger:hover {
  color: var(--color-text-heading);
  background: var(--topbar-btn-hover-bg);
}

.font-preview {
  font-size: 13px;
  font-weight: 500;
}

.font-dropdown {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-top: 6px;
  background: var(--glass-bg-panel);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  padding: 4px;
  min-width: 100px;
  box-shadow: var(--shadow-dropdown);
}

.font-option {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 10px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.font-option:hover {
  background: var(--color-hover-bg);
  color: var(--color-text-primary);
}

.font-option.active {
  color: var(--color-accent);
}

.font-option-preview {
  font-size: 14px;
  width: 22px;
  text-align: center;
}

.font-option-label {
  font-size: 11px;
  font-family: var(--font-sans);
}

.dropdown-enter-active {
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.dropdown-leave-active {
  transition: all var(--transition-fast) ease-in;
}
.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-4px) scale(0.95);
}
</style>
