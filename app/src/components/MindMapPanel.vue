<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useMindMap } from '../composables/useMindMap'
import type { TocEntry } from '../composables/useToc'

const props = defineProps<{
  markdown: string
  tocEntries: TocEntry[]
  visible: boolean
  fullscreen: boolean
  docTitle: string
}>()

const emit = defineEmits<{
  'edit-heading': [pos: number, newText: string]
  'add-heading': [afterPos: number, level: number, text: string]
  'delete-heading': [pos: number]
  'jump': [pos: number]
  'toggle-fullscreen': []
  'close': []
}>()

// ── Refs ──
const svgRef = ref<SVGSVGElement | null>(null)
const panelRef = ref<HTMLDivElement | null>(null)
const isEditing = ref(false)
const editInput = ref<HTMLInputElement | null>(null)
const editPos = ref<number | null>(null)
const editText = ref('')
const editRect = ref({ x: 0, y: 0, width: 200 })

// Context menu state
const contextMenu = ref<{
  visible: boolean
  x: number
  y: number
  pos: number
  level: number
  text: string
}>({ visible: false, x: 0, y: 0, pos: 0, level: 0, text: '' })

// ── MindMap instance ──
const { init, buildTree, render, fit, destroy, findNodeAtEvent } = useMindMap()

let resizeObserver: ResizeObserver | null = null
let updateTimer: ReturnType<typeof setTimeout> | null = null

// ── Initialization ──
onMounted(() => {
  if (svgRef.value) {
    init(svgRef.value)
    rebuildAndRender(true)
    setupEventDelegation()

    resizeObserver = new ResizeObserver(() => fit())
    if (panelRef.value) {
      resizeObserver.observe(panelRef.value)
    }
  }
  window.addEventListener('keydown', handleGlobalKeydown)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('keydown', handleGlobalKeydown)
  if (updateTimer) clearTimeout(updateTimer)
  destroy()
})

function rebuildAndRender(shouldFit = false) {
  const tree = buildTree(props.tocEntries, props.docTitle)
  render(tree, shouldFit)
}

// ── Watch for content changes ──
watch(
  [() => props.tocEntries, () => props.docTitle],
  () => {
    if (updateTimer) clearTimeout(updateTimer)
    updateTimer = setTimeout(() => rebuildAndRender(), 100)
  },
  { deep: true },
)

watch(() => props.visible, (v) => {
  if (v) nextTick(() => {
    rebuildAndRender(true)
  })
})

watch(() => props.fullscreen, () => {
  nextTick(() => setTimeout(fit, 120))
})

// ── Event delegation ──
function setupEventDelegation() {
  const svg = svgRef.value
  if (!svg) return

  let lastClickTime = 0
  let lastClickEl: SVGGElement | null = null
  const DBLCLICK_MS = 220
  let singleClickTimer: ReturnType<typeof setTimeout> | null = null

  svg.addEventListener('click', (e) => {
    if (isEditing.value) return

    const hit = findNodeAtEvent(e.target as Element)
    if (!hit) return

    const now = Date.now()

    if (lastClickEl === hit.el && now - lastClickTime < DBLCLICK_MS) {
      if (singleClickTimer) { clearTimeout(singleClickTimer); singleClickTimer = null }
      lastClickTime = 0
      lastClickEl = null

      if (hit.data.data.pos >= 0) {
        startInlineEdit(hit.data.data.pos, hit.data.data.text, hit.el)
      }
      return
    }

    lastClickTime = now
    lastClickEl = hit.el

    const savedEl = hit.el
    const savedData = hit.data
    if (singleClickTimer) clearTimeout(singleClickTimer)
    singleClickTimer = setTimeout(() => {
      singleClickTimer = null
      if (savedData.data.pos >= 0) {
        emit('jump', savedData.data.pos)
      }
    }, DBLCLICK_MS)
  })

  svg.addEventListener('contextmenu', (e) => {
    const hit = findNodeAtEvent(e.target as Element)
    if (!hit || hit.data.data.pos < 0) return

    e.preventDefault()
    e.stopPropagation()
    showContextMenu(e as MouseEvent, hit.data.data.pos, hit.data.data.level, hit.data.data.text)
  })
}

// ── Inline editing ──
function startInlineEdit(pos: number, text: string, nodeEl: SVGGElement) {
  const rect = nodeEl.getBoundingClientRect()
  const panelRect = panelRef.value?.getBoundingClientRect()
  if (!panelRect) return

  editPos.value = pos
  editText.value = text
  editRect.value = {
    x: rect.left - panelRect.left + rect.width / 2 - 110,
    y: rect.top - panelRect.top + rect.height / 2 - 17,
    width: Math.max(220, rect.width + 40),
  }
  isEditing.value = true

  nextTick(() => {
    editInput.value?.focus()
    editInput.value?.select()
  })
}

function confirmEdit() {
  if (!isEditing.value) return
  const pos = editPos.value
  const text = editText.value.trim()
  isEditing.value = false
  editPos.value = null
  editText.value = ''
  if (pos !== null && text) {
    emit('edit-heading', pos, text)
  }
}

function cancelEdit() {
  isEditing.value = false
  editPos.value = null
  editText.value = ''
}

function handleEditKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') { e.preventDefault(); confirmEdit() }
  else if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
}

function handleEditBlur() {
  setTimeout(() => { if (isEditing.value) confirmEdit() }, 50)
}

// ── Context menu ──
function showContextMenu(e: MouseEvent, pos: number, level: number, text: string) {
  const panelRect = panelRef.value?.getBoundingClientRect()
  if (!panelRect) return
  contextMenu.value = {
    visible: true,
    x: e.clientX - panelRect.left,
    y: e.clientY - panelRect.top,
    pos, level, text,
  }
}

function hideContextMenu() { contextMenu.value.visible = false }

function handleAddChild() {
  const { pos, level } = contextMenu.value
  emit('add-heading', pos, Math.min(level + 1, 6), 'New heading')
  hideContextMenu()
}

function handleAddSibling() {
  const { pos, level } = contextMenu.value
  emit('add-heading', pos, level, 'New heading')
  hideContextMenu()
}

function handleDeleteNode() {
  emit('delete-heading', contextMenu.value.pos)
  hideContextMenu()
}

// ── Global keyboard ──
function handleGlobalKeydown(e: KeyboardEvent) {
  if (!props.visible) return
  if (e.key === 'Escape') {
    if (isEditing.value) { cancelEdit(); e.stopPropagation() }
    else if (contextMenu.value.visible) { hideContextMenu(); e.stopPropagation() }
    else if (props.fullscreen) { emit('toggle-fullscreen'); e.stopPropagation() }
  }
}

function handlePanelClick() {
  if (contextMenu.value.visible) hideContextMenu()
}
</script>

<template>
  <div
    ref="panelRef"
    class="mindmap-panel"
    :class="{ 'mindmap-fullscreen': fullscreen }"
    @click="handlePanelClick"
  >
    <div class="mindmap-toolbar">
      <span class="mindmap-title">Mind Map</span>
      <div class="mindmap-toolbar-actions">
        <button class="mindmap-tool-btn" title="Fit to view" @click.stop="fit()">Fit</button>
        <button
          class="mindmap-tool-btn"
          :class="{ active: fullscreen }"
          :title="fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'"
          @click.stop="$emit('toggle-fullscreen')"
        >{{ fullscreen ? 'Exit FS' : 'Full' }}</button>
        <button class="mindmap-tool-btn close" title="Close" @click.stop="$emit('close')">&times;</button>
      </div>
    </div>

    <svg ref="svgRef" class="mindmap-svg" />

    <div v-if="!tocEntries.length" class="mindmap-empty">
      <p>No headings found.</p>
      <p class="mindmap-empty-hint">Add headings (# H1, ## H2, ...) to build the mind map.</p>
    </div>

    <div v-if="isEditing" class="mindmap-edit-overlay" @click.self="cancelEdit">
      <input
        ref="editInput"
        v-model="editText"
        class="mindmap-edit-input"
        :style="{ left: editRect.x + 'px', top: editRect.y + 'px', width: editRect.width + 'px' }"
        @keydown="handleEditKeydown"
        @blur="handleEditBlur"
        placeholder="Enter heading text..."
      />
    </div>

    <Transition name="ctx-fade">
      <div
        v-if="contextMenu.visible"
        class="mindmap-ctx-menu"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
      >
        <button class="ctx-item" @click="handleAddChild"><span class="ctx-icon">+</span> Add child</button>
        <button class="ctx-item" @click="handleAddSibling"><span class="ctx-icon">+</span> Add sibling</button>
        <div class="ctx-divider" />
        <button class="ctx-item danger" @click="handleDeleteNode"><span class="ctx-icon">&times;</span> Delete</button>
      </div>
    </Transition>

    <Transition name="hint-fade">
      <div v-if="fullscreen" class="fullscreen-hint">
        Press <kbd>Esc</kbd> to exit fullscreen &middot; Double-click node to edit
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.mindmap-panel {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 100%;
  background: var(--color-surface-solid);
  backdrop-filter: blur(var(--glass-blur, 24px));
  -webkit-backdrop-filter: blur(var(--glass-blur, 24px));
  border: 1px solid var(--color-border-muted);
  border-radius: var(--radius-3xl);
  overflow: hidden;
  box-shadow: var(--shadow-editor);
  display: flex;
  flex-direction: column;
  outline: none;
  animation: mmPanelEnter 0.4s ease both;
}

.mindmap-panel.mindmap-fullscreen {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  border-radius: 0;
  animation: mmFullscreenEnter 0.3s ease both;
}

.mindmap-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid var(--color-border-muted);
  flex-shrink: 0;
}

.mindmap-title {
  color: var(--color-text-muted);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-weight: 500;
}

.mindmap-toolbar-actions { display: flex; align-items: center; gap: 6px; }

.mindmap-tool-btn {
  height: 28px;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--color-border-muted) 80%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-surface-solid) 82%, transparent);
  color: var(--color-text-secondary);
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all var(--transition-base);
}

.mindmap-tool-btn:hover {
  background: color-mix(in srgb, var(--topbar-btn-hover-bg, rgba(148,163,184,0.1)) 75%, var(--color-surface-solid));
  color: var(--color-text-heading);
  transform: translateY(-1px);
}

.mindmap-tool-btn.active {
  border-color: color-mix(in srgb, var(--color-accent) 60%, var(--color-border-muted));
  color: var(--color-text-heading);
}

.mindmap-tool-btn.close { font-size: 16px; padding: 0 6px; line-height: 1; }

.mindmap-svg { flex: 1; width: 100%; min-height: 0; }

.mindmap-empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  color: var(--color-text-muted);
  font-size: 14px;
  gap: 4px;
}

.mindmap-empty-hint { font-size: 12px; color: var(--color-text-dim); }

.mindmap-edit-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  background: rgba(0, 0, 0, 0.15);
}

.mindmap-edit-input {
  position: absolute;
  height: 34px;
  padding: 4px 12px;
  border: 2px solid var(--color-accent);
  border-radius: var(--radius-md);
  background: var(--color-surface-panel, rgba(12, 18, 32, 0.9));
  color: var(--color-text-heading);
  font-size: 14px;
  font-family: var(--font-sans);
  outline: none;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4), 0 0 0 1px var(--color-accent);
  z-index: 21;
}

.mindmap-ctx-menu {
  position: absolute;
  z-index: 30;
  min-width: 160px;
  padding: 6px 0;
  border: 1px solid var(--color-border-muted);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--color-surface-solid) 96%, transparent);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow: var(--shadow-dropdown);
}

.ctx-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 14px;
  border: none;
  background: transparent;
  color: var(--color-text-primary);
  font-size: 13px;
  cursor: pointer;
  text-align: left;
  transition: background var(--transition-fast);
}

.ctx-item:hover { background: var(--color-hover-bg); }
.ctx-item.danger { color: #fb7185; }
.ctx-item.danger:hover { background: rgba(244, 63, 94, 0.1); }
.ctx-icon { width: 16px; text-align: center; font-weight: 600; }
.ctx-divider { height: 1px; margin: 4px 10px; background: var(--color-border-muted); }

.fullscreen-hint {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  padding: 6px 16px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.7);
  backdrop-filter: blur(8px);
  color: var(--color-text-secondary);
  font-size: 12px;
  pointer-events: none;
  white-space: nowrap;
  animation: hintFadeOut 3s ease 2s forwards;
}

.fullscreen-hint kbd {
  display: inline-block;
  padding: 1px 6px;
  margin: 0 2px;
  border: 1px solid var(--color-border-muted);
  border-radius: 4px;
  background: rgba(30, 41, 59, 0.6);
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-text-heading);
}

.ctx-fade-enter-active, .ctx-fade-leave-active { transition: opacity 0.12s ease, transform 0.12s ease; }
.ctx-fade-enter-from, .ctx-fade-leave-to { opacity: 0; transform: scale(0.96); }

.hint-fade-enter-active { transition: opacity 0.3s ease; }
.hint-fade-leave-active { transition: opacity 0.2s ease; }
.hint-fade-enter-from, .hint-fade-leave-to { opacity: 0; }

@keyframes mmPanelEnter { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
@keyframes mmFullscreenEnter { from { opacity: 0; } to { opacity: 1; } }
@keyframes hintFadeOut { to { opacity: 0; } }
</style>
