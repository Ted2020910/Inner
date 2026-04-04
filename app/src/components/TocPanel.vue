<script setup lang="ts">
import type { TocEntry } from '../composables/useToc'

const props = defineProps<{
  entries: TocEntry[]
  visible: boolean
}>()

const emit = defineEmits<{
  jump: [pos: number]
  close: []
}>()

function indentForLevel(level: number) {
  return `${(level - 1) * 12}px`
}

function levelColor(level: number) {
  const colors = ['#7dd3fc', '#a78bfa', '#34d399', '#fbbf24', '#f87171', '#fb923c']
  return colors[(level - 1) % colors.length]
}
</script>

<template>
  <transition name="toc-slide">
    <div v-if="visible" class="toc-panel" role="navigation" aria-label="Table of contents">
      <div class="toc-header">
        <span class="toc-title">目录</span>
        <button class="toc-close" aria-label="Close table of contents" @click="emit('close')">×</button>
      </div>

      <div class="toc-body">
        <p v-if="!entries.length" class="toc-empty">暂无标题</p>
        <ul v-else class="toc-list">
          <li
            v-for="(entry, i) in entries"
            :key="i"
            class="toc-item"
            :style="{ paddingLeft: indentForLevel(entry.level) }"
          >
            <button
              class="toc-entry"
              :style="{ '--entry-color': levelColor(entry.level) }"
              :title="entry.text"
              @click="emit('jump', entry.pos)"
            >
              <span class="toc-marker" :style="{ color: levelColor(entry.level) }">
                {{ 'H' + entry.level }}
              </span>
              <span class="toc-text">{{ entry.text }}</span>
            </button>
          </li>
        </ul>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.toc-panel {
  position: fixed;
  top: 54px;
  right: 18px;
  z-index: calc(var(--z-editor, 20) + 2);
  width: 220px;
  max-height: calc(100vh - 90px);
  display: flex;
  flex-direction: column;
  background: color-mix(in srgb, var(--color-surface-solid, #0f172a) 94%, transparent);
  border: 1px solid var(--color-border-muted, rgba(148,163,184,0.12));
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.36);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  overflow: hidden;
}

.toc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px 8px;
  border-bottom: 1px solid var(--color-border-muted, rgba(148,163,184,0.08));
  flex: none;
}

.toc-title {
  color: var(--color-text-muted, #4c566a);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.toc-close {
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--color-text-secondary, #94a3b8);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}

.toc-close:hover {
  background: color-mix(in srgb, var(--color-border-muted, rgba(148,163,184,0.12)) 60%, transparent);
  color: var(--color-text-heading, #f1f5f9);
}

.toc-body {
  flex: 1;
  overflow-y: auto;
  padding: 6px 4px 8px;
  scrollbar-width: thin;
  scrollbar-color: rgba(148,163,184,0.2) transparent;
}

.toc-empty {
  margin: 12px 10px;
  color: var(--color-text-muted, #4c566a);
  font-size: 12px;
}

.toc-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.toc-item {
  margin: 0;
}

.toc-entry {
  display: flex;
  align-items: baseline;
  gap: 6px;
  width: 100%;
  padding: 4px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s;
}

.toc-entry:hover {
  background: color-mix(in srgb, var(--entry-color, #7dd3fc) 8%, transparent);
}

.toc-marker {
  flex: none;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.04em;
  opacity: 0.8;
  font-family: var(--font-mono, monospace);
}

.toc-text {
  color: var(--color-text-secondary, #94a3b8);
  font-size: 12px;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toc-entry:hover .toc-text {
  color: var(--color-text-heading, #f1f5f9);
}

/* Slide-in from right */
.toc-slide-enter-active,
.toc-slide-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.toc-slide-enter-from,
.toc-slide-leave-to {
  opacity: 0;
  transform: translateX(12px);
}
</style>
