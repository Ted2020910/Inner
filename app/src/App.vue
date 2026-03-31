<script setup lang="ts">
import { ref, watch, computed, onBeforeUnmount, onMounted, defineAsyncComponent } from 'vue'
import ShaderCanvas from './components/ShaderCanvas.vue'
import TopBar from './components/TopBar.vue'
import BrandMark from './components/BrandMark.vue'
import { useFileSystem } from './composables/useFileSystem'
import { useAudio } from './composables/useAudio'
import { DEFAULT_SCENE_ID, SCENES, type SceneId } from './composables/useShader'
import type { FontChoice } from './components/FontSelector.vue'

const Editor = defineAsyncComponent(() => import('./components/Editor.vue'))
const FileSidebar = defineAsyncComponent(() => import('./components/FileSidebar.vue'))
const VibeMixer = defineAsyncComponent(() => import('./components/VibeMixer.vue'))
const ZenTimer = defineAsyncComponent(() => import('./components/ZenTimer.vue'))
const FontSelector = defineAsyncComponent(() => import('./components/FontSelector.vue'))
const ThemeToggle = defineAsyncComponent(() => import('./components/ThemeToggle.vue'))

const AUTO_SAVE_IDLE_MS = 10000

type EditorHandle = {
  getMarkdown: () => string
  setMarkdown: (content: string) => Promise<void>
  burnAndClear: () => Promise<void>
  transitionTo: (content: string) => Promise<void>
}

// ── File system ──
const {
  currentFile,
  files,
  isDirty,
  isSaving,
  saveFile,
  newFile,
  openFile,
  readFileByName,
  renameFile,
  deleteFile,
  chooseDirectory,
  markDirty,
  supportsDirectoryPicker,
  useServerWorkspace,
  workspaceKind,
  workspaceName,
  refreshFileList,
} = useFileSystem()

function buildDateStamp(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function getTodayJournalName() {
  return `${buildDateStamp()}.md`
}

function getTodayJournalTemplate() {
  const title = buildDateStamp()
  return `# ${title}\n\n`
}

function getNextUntitledName() {
  const existing = new Set(files.value.map((file) => file.name))
  if (!existing.has('untitled.md')) return 'untitled.md'

  let index = 2
  while (existing.has(`untitled-${index}.md`)) {
    index += 1
  }

  return `untitled-${index}.md`
}

function readStoredScene(): SceneId {
  const stored = localStorage.getItem('inner:scene')
  return SCENES.some((scene) => scene.id === stored) ? (stored as SceneId) : DEFAULT_SCENE_ID
}

// ── Scene (looping ambient backdrops) ──
const currentScene = ref<SceneId>(readStoredScene())

// ── Audio ──
const audio = useAudio(currentScene)

// ── Shader control refs ──
const shaderRef = ref<InstanceType<typeof ShaderCanvas> | null>(null)
const sceneIntensity = ref(0.5)
const blurAmount = ref(0.5)

// ── Font ──
const fontChoice = ref<FontChoice>(
  (localStorage.getItem('inner:font') as FontChoice) || 'sans'
)

const fontFamilyMap: Record<FontChoice, string> = {
  sans: "'Inter', system-ui, sans-serif",
  serif: "'Noto Serif SC', Georgia, serif",
  mono: "'JetBrains Mono', 'Fira Code', monospace",
}

const editorFontFamily = computed(() => fontFamilyMap[fontChoice.value])

watch(fontChoice, (v) => {
  localStorage.setItem('inner:font', v)
})

watch(currentScene, (value) => {
  localStorage.setItem('inner:scene', value)
})

// ── Editor content ──
const editorRef = ref<EditorHandle | null>(null)
const isFilePanelOpen = ref(false)
const pendingFileTransition = ref(false)
const deleteTarget = ref<string | null>(null)
const isDeletingFile = ref(false)
const isBurningCurrentFile = ref(false)
const deletePreview = ref('')
const isDeletePreviewLoading = ref(false)
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null

function clearAutoSaveTimer() {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer)
    autoSaveTimer = null
  }
}

function scheduleAutoSave() {
  clearAutoSaveTimer()
  autoSaveTimer = setTimeout(() => {
    void handleSave()
  }, AUTO_SAVE_IDLE_MS)
}

function handleSceneChange(value: SceneId) {
  currentScene.value = value
}

function handleToggleFiles() {
  isFilePanelOpen.value = !isFilePanelOpen.value
}

function buildDeletePreview(content: string) {
  const preview = content
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 6)
    .join('\n')

  return preview || '文件内容为空。'
}

function confirmDiscardUnsavedChanges() {
  if (!isDirty.value) return true
  return window.confirm('当前有未保存内容。确定表示放弃这些修改并继续。')
}

watch(
  [currentFile, editorRef],
  async ([file, editor], [previousFile]) => {
    clearAutoSaveTimer()
    if (!editor) return

    const nextContent = file?.content ?? ''
    const previousContent = previousFile?.content ?? ''
    const didSwitchFile = Boolean(previousFile?.name && file?.name && previousFile.name !== file.name)
    const didContentChange = previousContent !== nextContent

    if (!didSwitchFile && !didContentChange && previousFile?.name === file?.name) {
      pendingFileTransition.value = false
      return
    }

    if (pendingFileTransition.value && didSwitchFile) {
      await editor.transitionTo(nextContent)
      pendingFileTransition.value = false
      return
    }

    await editor.setMarkdown(nextContent)
    pendingFileTransition.value = false
  },
  { immediate: true },
)

watch(deleteTarget, async (name) => {
  deletePreview.value = ''
  isDeletePreviewLoading.value = false

  if (!name) return

  if (name === currentFile.value?.name) {
    deletePreview.value = buildDeletePreview(editorRef.value?.getMarkdown() ?? currentFile.value.content)
    return
  }

  isDeletePreviewLoading.value = true

  try {
    const file = await readFileByName(name)
    deletePreview.value = buildDeletePreview(file?.content ?? '')
  } finally {
    isDeletePreviewLoading.value = false
  }
})

// ── Vibe Mixer → Shader sync ──
watch(
  [sceneIntensity, shaderRef],
  ([value, shader]) => {
    shader?.setIntensity(value)
  },
  { immediate: true },
)

watch(
  [blurAmount, shaderRef],
  ([value, shader]) => {
    shader?.setBlurAmount(value)
  },
  { immediate: true },
)

function handleKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    void handleSave()
  }
}

async function prepareForNewFile() {
  if (!confirmDiscardUnsavedChanges()) return false
  clearAutoSaveTimer()
  return true
}

async function handleNewJournal() {
  const target = getTodayJournalName()
  const existing = files.value.find((file) => file.name === target)

  if (existing) {
    await handleOpenRequested(target)
    return
  }

  const okToCreate = await prepareForNewFile()
  if (!okToCreate) return
  await newFile(target, getTodayJournalTemplate())
  isFilePanelOpen.value = false
}

async function handleNewUntitled() {
  const okToCreate = await prepareForNewFile()
  if (!okToCreate) return
  await newFile(getNextUntitledName())
  isFilePanelOpen.value = false
}

async function handleOpenRequested(name: string) {
  if (name === currentFile.value?.name) return
  if (!confirmDiscardUnsavedChanges()) return
  clearAutoSaveTimer()
  await openFile(name)
  isFilePanelOpen.value = false
}

async function handleRenameRequested(from: string, to: string) {
  if (!confirmDiscardUnsavedChanges()) return
  clearAutoSaveTimer()
  const ok = await renameFile(from, to)
  if (!ok) {
    window.alert('重命名失败。')
  }
}

function handleDeleteRequested(name: string) {
  deleteTarget.value = name
}

function closeDeleteDialog() {
  if (isDeletingFile.value) return
  deleteTarget.value = null
  deletePreview.value = ''
}

async function confirmDeleteFile() {
  if (!deleteTarget.value) return

  clearAutoSaveTimer()
  pendingFileTransition.value = deleteTarget.value === currentFile.value?.name
  isDeletingFile.value = true

  try {
    await deleteFile(deleteTarget.value)
  } finally {
    isDeletingFile.value = false
    deleteTarget.value = null
  }
}

async function handleBurnCurrentFile() {
  if (!currentFile.value || !editorRef.value || isBurningCurrentFile.value) return

  const content = editorRef.value.getMarkdown()
  if (!content.trim()) return

  clearAutoSaveTimer()
  isBurningCurrentFile.value = true

  try {
    await editorRef.value.burnAndClear()
    markDirty()
    await saveFile('')
  } finally {
    isBurningCurrentFile.value = false
  }
}

async function handleSave() {
  clearAutoSaveTimer()
  const snapshot = editorRef.value?.getMarkdown()
  if (snapshot === undefined) return
  await saveFile(snapshot)
}

async function handlePickFolder() {
  if (!confirmDiscardUnsavedChanges()) return
  clearAutoSaveTimer()
  await chooseDirectory()
}

async function handleUseServerWorkspace() {
  if (!confirmDiscardUnsavedChanges()) return
  clearAutoSaveTimer()
  await useServerWorkspace()
}

function handleEditorDirty() {
  markDirty()
  scheduleAutoSave()
}

function toggleAudio() {
  if (audio.isPlaying.value) {
    audio.stop()
  } else {
    audio.start()
  }
}

// ── Blur amount → CSS variable ──
const glassBlur = computed(() => `${12 + blurAmount.value * 24}px`)

onBeforeUnmount(() => {
  clearAutoSaveTimer()
  window.removeEventListener('beforeunload', handleBeforeUnload)
})

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (!isDirty.value) return
  event.preventDefault()
  event.returnValue = ''
}

onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload)
})
</script>

<template>
  <div class="app" @keydown="handleKeydown">
    <!-- Layer 0: WebGL Shader Background -->
    <ShaderCanvas ref="shaderRef" :scene="currentScene" />

    <!-- Brand Mark — always visible top-left -->
    <BrandMark />

    <FileSidebar
      :files="files"
      :current-file-name="currentFile?.name ?? null"
      :workspace-kind="workspaceKind"
      :workspace-name="workspaceName"
      :visible="isFilePanelOpen"
      @open="handleOpenRequested"
      @new-journal="handleNewJournal"
      @new-untitled="handleNewUntitled"
      @rename="handleRenameRequested"
      @delete="handleDeleteRequested"
      @refresh="refreshFileList"
      @close="isFilePanelOpen = false"
    />

    <!-- Layer 1: Top Bar -->
    <TopBar
      :scene="currentScene"
      :workspace-kind="workspaceKind"
      :workspace-name="workspaceName"
      :supports-directory-picker="supportsDirectoryPicker"
      :is-file-panel-open="isFilePanelOpen"
      @update:scene="handleSceneChange"
      @toggle-files="handleToggleFiles"
      @pick-folder="handlePickFolder"
      @use-server-workspace="handleUseServerWorkspace"
    >
      <template #right>
        <ThemeToggle />
        <FontSelector v-model="fontChoice" />
      </template>
    </TopBar>

    <!-- Layer 2: Frosted Glass Editor -->
    <div class="editor-container">
      <div class="editor-glass" :style="{ '--glass-blur': glassBlur, '--editor-font': editorFontFamily }">
        <div class="editor-actions">
          <transition name="indicator-fade">
            <span v-if="isDirty" class="unsaved-dot" title="Unsaved changes" />
          </transition>
          <button
            class="editor-burn-btn"
            :disabled="isBurningCurrentFile || !currentFile"
            @click="handleBurnCurrentFile"
            title="阅后即焚"
            aria-label="Burn current file"
          >
            {{ isBurningCurrentFile ? 'Burning...' : 'Burn' }}
          </button>
          <button
            class="editor-save-btn"
            :class="{ dirty: isDirty }"
            :disabled="isSaving || isBurningCurrentFile || !isDirty"
            @click="handleSave"
            title="Save (Ctrl+S)"
            aria-label="Save"
          >
            {{ isSaving ? 'Saving...' : 'Save' }}
          </button>
        </div>

        <Editor
          ref="editorRef"
          @dirty="handleEditorDirty"
        />
      </div>
    </div>

    <!-- Layer 3: Vibe Mixer (bottom-right) -->
    <VibeMixer
      :rain-amount="sceneIntensity"
      :blur-amount="blurAmount"
      :scene-label="audio.sceneLabel.value"
      :master-volume="audio.masterVolume.value"
      :primary-label="audio.primaryLabel.value"
      :primary-volume="audio.primaryVolume.value"
      :texture-label="audio.textureLabel.value"
      :texture-volume="audio.textureVolume.value"
      :has-music="audio.hasMusic.value"
      :music-label="audio.musicLabel.value"
      :music-volume="audio.musicVolume.value"
      :is-audio-playing="audio.isPlaying.value"
      @update:rain-amount="sceneIntensity = $event"
      @update:blur-amount="blurAmount = $event"
      @update:master-volume="audio.setMasterVolume($event)"
      @update:primary-volume="audio.setPrimaryVolume($event)"
      @update:texture-volume="audio.setTextureVolume($event)"
      @update:music-volume="audio.setMusicVolume($event)"
      @toggle-audio="toggleAudio"
    />

    <!-- Layer 4: Zen Timer (bottom-left) -->
    <ZenTimer :left-offset="isFilePanelOpen ? 246 : 20" />

    <transition name="dialog-fade">
      <div
        v-if="deleteTarget"
        class="dialog-backdrop"
        @click.self="closeDeleteDialog"
      >
        <div class="dialog-card">
          <span class="dialog-kicker">Delete File</span>
          <h3 class="dialog-title">删除这个文件？</h3>
          <p class="dialog-copy">
            <strong>{{ deleteTarget }}</strong> 会被永久删除。
            <span v-if="deleteTarget === currentFile?.name && isDirty">当前未保存的修改也会一起丢失。</span>
          </p>
          <div class="dialog-preview">
            <span class="dialog-preview-label">Preview</span>
            <pre class="dialog-preview-body">{{ isDeletePreviewLoading ? 'Loading preview...' : deletePreview }}</pre>
          </div>
          <div class="dialog-actions">
            <button class="dialog-btn" :disabled="isDeletingFile" @click="closeDeleteDialog">取消</button>
            <button class="dialog-btn danger" :disabled="isDeletingFile" @click="confirmDeleteFile">
              {{ isDeletingFile ? 'Deleting...' : 'Delete' }}
            </button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.app {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

/* Editor container — centered floating glass panel */
.editor-container {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-editor);
  padding: 60px 40px 40px;
  pointer-events: none;
}

.editor-glass {
  position: relative;
  width: 100%;
  max-width: clamp(360px, 90vw, 800px);
  height: 100%;
  background: var(--color-surface-solid);
  backdrop-filter: blur(var(--glass-blur, 24px));
  -webkit-backdrop-filter: blur(var(--glass-blur, 24px));
  border: 1px solid var(--color-border-muted);
  border-radius: var(--radius-3xl);
  overflow: hidden;
  pointer-events: auto;
  box-shadow: var(--shadow-editor);
  will-change: transform, opacity;
  animation: editorEnter 0.6s ease both;
  animation-delay: 0.2s;
}

/* Pass font family to editor via CSS variable */
.editor-glass :deep(.milkdown-editor .ProseMirror) {
  font-family: var(--editor-font, var(--font-sans));
}

/* Editor actions */
.editor-actions {
  position: absolute;
  top: 12px;
  right: 16px;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 10px;
}

.unsaved-dot {
  display: block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-warning);
  box-shadow: 0 0 8px var(--color-warning-glow);
}

.editor-save-btn {
  height: 32px;
  padding: 0 12px;
  border: 1px solid color-mix(in srgb, var(--color-border-muted) 80%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-surface-solid) 82%, transparent);
  color: var(--color-text-secondary);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all var(--transition-base);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.editor-save-btn.dirty {
  border-color: color-mix(in srgb, var(--color-warning) 60%, var(--color-border-muted));
  color: var(--color-text-heading);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-warning) 14%, transparent);
}

.editor-save-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--topbar-btn-hover-bg) 75%, var(--color-surface-solid));
  transform: translateY(-1px);
}

.editor-save-btn:disabled {
  opacity: 0.5;
  cursor: default;
  transform: none;
}

.editor-burn-btn {
  height: 32px;
  padding: 0 12px;
  border: 1px solid color-mix(in srgb, #f97316 52%, var(--color-border-muted));
  border-radius: 999px;
  background: color-mix(in srgb, rgba(249, 115, 22, 0.12) 72%, var(--color-surface-solid));
  color: #fdba74;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all var(--transition-base);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.editor-burn-btn:hover:not(:disabled) {
  background: color-mix(in srgb, rgba(249, 115, 22, 0.2) 80%, var(--color-surface-solid));
  color: #fed7aa;
  transform: translateY(-1px);
}

.editor-burn-btn:disabled {
  opacity: 0.5;
  cursor: default;
  transform: none;
}

.indicator-fade-enter-active,
.indicator-fade-leave-active {
  transition: opacity 0.3s ease;
}
.indicator-fade-enter-from,
.indicator-fade-leave-to {
  opacity: 0;
}

.dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: calc(var(--z-editor) + 6);
  display: grid;
  place-items: center;
  background: rgba(2, 6, 23, 0.42);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.dialog-card {
  width: min(420px, calc(100vw - 32px));
  padding: 22px 22px 18px;
  border: 1px solid color-mix(in srgb, var(--color-border-muted) 80%, transparent);
  border-radius: 22px;
  background: color-mix(in srgb, var(--color-surface-solid) 92%, transparent);
  box-shadow: var(--shadow-editor);
}

.dialog-kicker {
  display: inline-block;
  margin-bottom: 8px;
  color: var(--color-text-muted);
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.dialog-title {
  margin: 0;
  color: var(--color-text-heading);
  font-size: 22px;
  font-weight: 400;
}

.dialog-copy {
  margin: 12px 0 0;
  color: var(--color-text-secondary);
  line-height: 1.6;
}

.dialog-copy strong {
  color: var(--color-text-primary);
  word-break: break-word;
}

.dialog-preview {
  margin-top: 16px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--color-border-muted) 78%, transparent);
  border-radius: 16px;
  background: color-mix(in srgb, rgba(15, 23, 42, 0.34) 82%, transparent);
}

.dialog-preview-label {
  display: inline-block;
  margin-bottom: 8px;
  color: var(--color-text-muted);
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.dialog-preview-body {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--color-text-primary);
  font-size: 12px;
  line-height: 1.6;
  font-family: var(--font-mono);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}

.dialog-btn {
  min-width: 92px;
  height: 36px;
  padding: 0 14px;
  border: 1px solid var(--color-border-muted);
  border-radius: 999px;
  background: transparent;
  color: var(--color-text-primary);
  cursor: pointer;
}

.dialog-btn.danger {
  border-color: color-mix(in srgb, #fb7185 58%, var(--color-border-muted));
  color: #fecdd3;
  background: color-mix(in srgb, rgba(244, 63, 94, 0.14) 72%, transparent);
}

.dialog-btn:disabled {
  opacity: 0.55;
  cursor: default;
}

.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity 0.18s ease;
}

.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;
}

@keyframes editorEnter {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 768px) {
  .editor-container {
    padding: 50px 12px 204px;
  }
  .editor-glass {
    border-radius: var(--radius-xl);
  }
}
</style>
