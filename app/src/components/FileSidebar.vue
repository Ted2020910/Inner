<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { FileInfo } from '../composables/useFileSystem'

type TreeRow =
  | { kind: 'directory'; path: string; label: string; depth: number }
  | { kind: 'file'; path: string; label: string; depth: number; file: FileInfo }

const props = defineProps<{
  files: FileInfo[]
  currentFileName: string | null
  workspaceName: string
  workspaceKind: 'server' | 'directory'
  visible: boolean
}>()

const emit = defineEmits<{
  open: [name: string]
  newJournal: []
  newUntitled: []
  rename: [from: string, to: string]
  delete: [name: string]
  refresh: []
  close: []
}>()

const editingPath = ref<string | null>(null)
const renameDraft = ref('')
const renameInputRef = ref<HTMLInputElement | null>(null)

function buildTreeRows(files: FileInfo[]): TreeRow[] {
  const rows: TreeRow[] = []
  const seenDirectories = new Set<string>()
  const sortedFiles = [...files].sort((a, b) => a.name.localeCompare(b.name))

  for (const file of sortedFiles) {
    const segments = file.name.split('/').filter(Boolean)

    if (segments.length > 1) {
      let currentPath = ''

      for (let i = 0; i < segments.length - 1; i += 1) {
        currentPath = currentPath ? `${currentPath}/${segments[i]}` : segments[i]
        if (seenDirectories.has(currentPath)) continue

        seenDirectories.add(currentPath)
        rows.push({
          kind: 'directory',
          path: currentPath,
          label: segments[i],
          depth: i,
        })
      }
    }

    rows.push({
      kind: 'file',
      path: file.name,
      label: segments[segments.length - 1] ?? file.name,
      depth: Math.max(0, segments.length - 1),
      file,
    })
  }

  return rows
}

const rows = computed(() => buildTreeRows(props.files))

async function beginRename(path: string) {
  const segments = path.split('/')
  renameDraft.value = segments[segments.length - 1] ?? path
  editingPath.value = path
  await nextTick()
  renameInputRef.value?.focus()
  renameInputRef.value?.select()
}

function cancelRename() {
  editingPath.value = null
  renameDraft.value = ''
}

function commitRename(path: string) {
  const draft = renameDraft.value.trim()
  if (!draft) {
    cancelRename()
    return
  }

  const parts = path.split('/').filter(Boolean)
  parts.pop()
  const nextPath = parts.length > 0 ? `${parts.join('/')}/${draft}` : draft

  cancelRename()
  emit('rename', path, nextPath)
}

watch(() => props.visible, (visible) => {
  if (!visible) cancelRename()
})
</script>

<template>
  <transition name="sidebar-slide">
    <aside v-if="props.visible" class="file-sidebar">
      <div class="sidebar-header">
        <div class="sidebar-copy">
          <span class="sidebar-title">文件</span>
          <span class="sidebar-subtitle">
            {{ props.workspaceKind === 'directory' ? '文件夹' : '内置工作区' }} · {{ props.workspaceName }}
          </span>
        </div>

        <div class="sidebar-actions">
          <button class="sidebar-btn" title="Refresh" aria-label="Refresh" @click="$emit('refresh')">↻</button>
          <button class="sidebar-btn" title="Close" aria-label="Close" @click="$emit('close')">×</button>
        </div>
      </div>

      <div class="sidebar-create-row">
        <button class="create-btn create-btn-journal" @click="$emit('newJournal')">新建日记</button>
        <button class="create-btn create-btn-untitled" @click="$emit('newUntitled')">新建文件</button>
      </div>

      <div class="sidebar-tree">
        <div v-if="rows.length === 0" class="sidebar-empty">暂无 Markdown 文件</div>

        <template v-for="row in rows" :key="`${row.kind}:${row.path}`">
          <div
            v-if="row.kind === 'directory'"
            class="tree-row directory"
            :style="{ '--depth': row.depth }"
          >
            <span class="tree-icon">▾</span>
            <span class="tree-label">{{ row.label }}</span>
          </div>

          <div
            v-else-if="editingPath === row.path"
            class="tree-row file active editing"
            :style="{ '--depth': row.depth }"
          >
            <span class="tree-main">
              <span class="tree-icon">•</span>
              <input
                ref="renameInputRef"
                v-model="renameDraft"
                class="tree-rename-input"
                @keydown.enter.prevent="commitRename(row.path)"
                @keydown.esc.prevent="cancelRename"
                @blur="commitRename(row.path)"
              >
            </span>
          </div>

          <button
            v-else
            class="tree-row file"
            :class="{ active: row.path === props.currentFileName }"
            :style="{ '--depth': row.depth }"
            @click="$emit('open', row.path)"
            @dblclick.stop="beginRename(row.path)"
          >
            <span class="tree-main">
              <span class="tree-icon">•</span>
              <span class="tree-label">{{ row.label }}</span>
            </span>
            <span class="tree-actions">
              <span class="tree-action-btn danger" title="Delete" @click.stop="$emit('delete', row.path)">×</span>
            </span>
          </button>
        </template>
      </div>
    </aside>
  </transition>
</template>

<style scoped>
.file-sidebar {
  position: fixed;
  top: 58px;
  left: 18px;
  bottom: 18px;
  width: 212px;
  z-index: calc(var(--z-editor) + 2);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--color-border-muted) 84%, transparent);
  border-radius: 24px;
  background: color-mix(in srgb, var(--color-surface-solid) 90%, transparent);
  box-shadow: var(--shadow-editor);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.sidebar-slide-enter-active,
.sidebar-slide-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}

.sidebar-slide-enter-from,
.sidebar-slide-leave-to {
  opacity: 0;
  transform: translateX(-12px);
}

.sidebar-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.sidebar-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.sidebar-title {
  color: var(--color-text-heading);
  font-size: 11px;
  letter-spacing: 0.08em;
  font-weight: 600;
}

.sidebar-subtitle {
  color: color-mix(in srgb, var(--color-text-secondary) 92%, white 8%);
  font-size: 10px;
  line-height: 1.4;
  word-break: break-word;
}

.sidebar-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.sidebar-btn {
  width: 24px;
  height: 24px;
  border: 1px solid var(--color-border-muted);
  border-radius: 999px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: 11px;
}

.sidebar-tree {
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sidebar-create-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.create-btn {
  min-height: 28px;
  border-radius: 10px;
  border: 1px solid var(--color-border-muted);
  background: color-mix(in srgb, var(--color-surface-solid) 92%, transparent);
  color: color-mix(in srgb, var(--color-text-primary) 96%, white 4%);
  font-size: 10px;
  letter-spacing: 0.02em;
  cursor: pointer;
  padding: 0 6px;
  font-weight: 600;
}

.create-btn-journal {
  border-color: color-mix(in srgb, var(--color-accent) 38%, var(--color-border-muted));
}

.create-btn-untitled {
  border-color: color-mix(in srgb, var(--color-warning) 38%, var(--color-border-muted));
}

.create-btn:hover {
  background: color-mix(in srgb, var(--topbar-btn-hover-bg) 80%, transparent);
}

.sidebar-empty {
  padding: 12px 8px;
  color: color-mix(in srgb, var(--color-text-secondary) 90%, white 10%);
  font-size: 11px;
}

.tree-row {
  --row-indent: calc(var(--depth) * 18px);
}

.tree-row.directory {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 22px;
  padding: 0 6px 0 calc(6px + var(--row-indent));
  color: color-mix(in srgb, var(--color-text-secondary) 88%, white 12%);
  font-size: 10px;
  letter-spacing: 0.04em;
  font-weight: 600;
}

.tree-row.file {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  min-height: 28px;
  padding: 0 6px 0 calc(6px + var(--row-indent));
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: color-mix(in srgb, var(--color-text-primary) 98%, white 2%);
  cursor: pointer;
  text-align: left;
  font-size: 12px;
  font-weight: 500;
}

.tree-row.file:hover {
  background: color-mix(in srgb, var(--topbar-btn-hover-bg) 92%, rgba(255, 255, 255, 0.04));
  border-color: color-mix(in srgb, var(--color-border-muted) 80%, transparent);
}

.tree-row.file.active {
  background: color-mix(in srgb, var(--color-accent) 18%, transparent);
  border-color: color-mix(in srgb, var(--color-accent) 52%, var(--color-border-muted));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-accent) 18%, transparent);
}

.tree-row.file.editing {
  cursor: default;
}

.tree-main,
.tree-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.tree-main {
  flex: 1;
}

.tree-icon {
  flex: none;
  color: color-mix(in srgb, var(--color-text-secondary) 80%, white 20%);
}

.tree-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  color: inherit;
}

.tree-rename-input {
  width: 100%;
  min-width: 0;
  border: 1px solid color-mix(in srgb, var(--color-accent) 35%, var(--color-border-muted));
  border-radius: 7px;
  background: color-mix(in srgb, var(--color-surface-solid) 90%, transparent);
  color: var(--color-text-primary);
  padding: 4px 6px;
  font: inherit;
  outline: none;
}

.tree-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  color: color-mix(in srgb, var(--color-text-secondary) 88%, white 12%);
  font-size: 10px;
}

.tree-action-btn:hover {
  background: color-mix(in srgb, var(--topbar-btn-hover-bg) 80%, transparent);
}

.tree-action-btn.danger:hover {
  color: #fda4af;
}

@media (max-width: 900px) {
  .file-sidebar {
    top: 58px;
    left: 12px;
    right: 12px;
    bottom: 110px;
    width: auto;
  }
}
</style>
