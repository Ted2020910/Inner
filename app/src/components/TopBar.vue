<script setup lang="ts">
import { ref, computed } from 'vue'
import { SCENES, type SceneId } from '../composables/useShader'

const props = defineProps<{
  scene: SceneId
  workspaceKind: 'server' | 'directory' | 'tauri'
  workspaceName: string
  supportsDirectoryPicker: boolean
  isFilePanelOpen: boolean
}>()

const emit = defineEmits<{
  'update:scene': [value: SceneId]
  'toggleFiles': []
  'pickFolder': []
  'useServerWorkspace': []
}>()

const isHovered = ref(false)
const currentIndex = computed(() => SCENES.findIndex((s) => s.id === props.scene))

function sceneAt(offset: number) {
  const idx = (currentIndex.value + offset + SCENES.length) % SCENES.length
  return SCENES[idx]
}

const slideDir = ref<1 | -1>(1)

let wheelLock = false
function handleWheel(e: WheelEvent) {
  e.preventDefault()
  if (wheelLock) return
  wheelLock = true
  setTimeout(() => { wheelLock = false }, 200)

  const dir = e.deltaY > 0 ? 1 : -1
  slideDir.value = dir
  const nextIdx = (currentIndex.value + dir + SCENES.length) % SCENES.length
  emit('update:scene', SCENES[nextIdx].id)
}

function show() {
  isHovered.value = true
}

defineExpose({
  show,
})
</script>

<template>
  <div
    class="topbar-trigger"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <transition name="fade">
      <div v-show="isHovered" class="topbar">
        <div class="topbar-left">
          <button
            class="topbar-btn"
            :class="{ active: props.isFilePanelOpen }"
            @click="$emit('toggleFiles')"
            title="Toggle file list (Ctrl/Cmd+B)"
            aria-label="Toggle file list"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M3 5h18" />
              <path d="M3 12h18" />
              <path d="M3 19h18" />
            </svg>
          </button>
          <button
            class="topbar-btn"
            @click="$emit('pickFolder')"
            title="Choose folder workspace"
            aria-label="Choose folder workspace"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </button>
          <button
            v-if="props.workspaceKind !== 'server'"
            class="topbar-btn"
            @click="$emit('useServerWorkspace')"
            title="Use built-in workspace"
            aria-label="Use built-in workspace"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="4" y="4" width="16" height="16" rx="2" />
              <path d="M9 4v16" />
              <path d="M4 9h16" />
            </svg>
          </button>
          <div class="file-meta">
            <span class="workspace-name">
              {{ props.workspaceKind === 'server' ? 'Built-in' : 'Folder' }} / {{ props.workspaceName }}
            </span>
          </div>
        </div>

        <div class="topbar-center" aria-label="Brand">
          <span class="wordmark">INEER</span>
        </div>

        <div class="topbar-right">
          <div
            class="drum"
            @wheel.prevent="handleWheel"
            aria-label="Scene selector"
          >
            <div class="drum-groove" />
            <div class="drum-viewport">
              <transition
                :name="slideDir > 0 ? 'drum-up' : 'drum-down'"
                mode="out-in"
              >
                <div class="drum-slots" :key="props.scene">
                  <span class="drum-item drum-item--far">{{ sceneAt(-1).label }}</span>
                  <span class="drum-item drum-item--center">{{ sceneAt(0).label }}</span>
                  <span class="drum-item drum-item--far">{{ sceneAt(1).label }}</span>
                </div>
              </transition>
            </div>
          </div>
          <slot name="right" />
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.topbar-trigger {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 50px;
  z-index: var(--z-topbar);
}

.topbar {
  position: absolute;
  top: 8px;
  left: 12px;
  right: 12px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: var(--topbar-bg);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  border: 1px solid var(--topbar-border);
  border-radius: var(--radius-lg);
  box-shadow:
    var(--topbar-shadow),
    var(--topbar-shadow-inset);
  user-select: none;
}

.topbar-left,
.topbar-center,
.topbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.topbar-left {
  flex: 1 1 auto;
}

.topbar-center {
  flex: 0 1 auto;
  justify-content: center;
  padding: 0 16px;
}

.topbar-right {
  flex: 1 1 auto;
  justify-content: flex-end;
}

.wordmark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.42em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--color-text-heading) 78%, var(--color-text-muted));
  text-shadow: var(--topbar-text-shadow);
  white-space: nowrap;
  opacity: 0.92;
}

.topbar-btn {
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

.topbar-btn:hover {
  color: var(--color-text-heading);
  background: var(--topbar-btn-hover-bg);
}

.topbar-btn.active {
  color: var(--color-text-heading);
  background: color-mix(in srgb, var(--color-accent) 12%, transparent);
}

.topbar-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.file-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.workspace-name {
  font-size: 10px;
  color: var(--wheel-counter-color);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drum {
  position: relative;
  width: 160px;
  height: 30px;
  flex-shrink: 0;
  cursor: ns-resize;
  border-radius: var(--radius-md);
  background:
    linear-gradient(180deg,
      rgba(0, 0, 0, 0.25) 0%,
      rgba(0, 0, 0, 0.06) 30%,
      transparent 50%,
      rgba(0, 0, 0, 0.06) 70%,
      rgba(0, 0, 0, 0.25) 100%
    );
  box-shadow:
    inset 0 1px 3px rgba(0, 0, 0, 0.35),
    inset 0 -1px 3px rgba(0, 0, 0, 0.25),
    0 1px 0 rgba(255, 255, 255, 0.04);
}

.drum-groove {
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
  border-radius: var(--radius-md);
  mask-image: linear-gradient(180deg,
    transparent 0%,
    black 25%,
    black 75%,
    transparent 100%
  );
  -webkit-mask-image: linear-gradient(180deg,
    transparent 0%,
    black 25%,
    black 75%,
    transparent 100%
  );
}

.drum-viewport {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: var(--radius-md);
  z-index: 1;
}

.drum-slots {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 30px;
  gap: 0;
}

.drum-item {
  display: block;
  white-space: nowrap;
  text-align: center;
  font-family: var(--font-sans);
  letter-spacing: 0.05em;
  line-height: 10px;
  transition: color 0.15s ease;
}

.drum-item--center {
  font-size: 11px;
  font-weight: 400;
  color: var(--color-text-heading);
  text-shadow: var(--topbar-text-shadow);
}

.drum-item--far {
  font-size: 8px;
  font-weight: 300;
  color: var(--color-text-dim);
  transform: scaleY(0.85);
}

.drum-up-enter-active {
  transition: all 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}

.drum-up-leave-active {
  transition: all 0.18s cubic-bezier(0.4, 0, 1, 1);
}

.drum-up-enter-from {
  opacity: 0;
  transform: translateY(14px) rotateX(-35deg);
}

.drum-up-leave-to {
  opacity: 0;
  transform: translateY(-14px) rotateX(35deg);
}

.drum-down-enter-active {
  transition: all 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}

.drum-down-leave-active {
  transition: all 0.18s cubic-bezier(0.4, 0, 1, 1);
}

.drum-down-enter-from {
  opacity: 0;
  transform: translateY(-14px) rotateX(35deg);
}

.drum-down-leave-to {
  opacity: 0;
  transform: translateY(14px) rotateX(-35deg);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--transition-slow);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (max-width: 768px) {
  .topbar {
    left: 8px;
    right: 8px;
    padding: 0 10px;
  }

  .topbar-center {
    padding: 0 10px;
  }

  .wordmark {
    font-size: 10px;
    letter-spacing: 0.28em;
  }

  .drum {
    width: 120px;
  }

  .workspace-name {
    max-width: 120px;
  }
}
</style>
