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
const TocPanel = defineAsyncComponent(() => import('./components/TocPanel.vue'))
const MindMapPanel = defineAsyncComponent(() => import('./components/MindMapPanel.vue'))

const AUTO_SAVE_IDLE_MS = 10000
const SIDEBAR_OPEN_STORAGE_KEY = 'inner:sidebar-open'
const SIDEBAR_SEARCH_STORAGE_KEY = 'inner:sidebar-search'
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'inner:sidebar-collapsed'
const DRAFT_STORAGE_PREFIX = 'inner:draft'

import type { TocEntry } from './composables/useToc'

type EditorHandle = {
  getMarkdown: () => string
  setMarkdown: (content: string) => Promise<void>
  burnAndClear: () => Promise<void>
  transitionTo: (content: string) => Promise<void>
  scrollToPos: (pos: number) => void
  replaceHeadingText: (pos: number, newText: string) => void
  insertHeading: (afterPos: number, level: number, text: string) => void
  deleteHeading: (pos: number) => void
}

type TopBarHandle = {
  show: () => void
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
  searchFiles,
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

function getFileTitleFromName(name: string) {
  const segments = name.replace(/\\/g, '/').split('/').filter(Boolean)
  const fileName = segments[segments.length - 1] ?? name
  return fileName.replace(/\.md$/i, '')
}

function buildInitialFileContent(name: string) {
  const title = getFileTitleFromName(name)
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
const topBarRef = ref<TopBarHandle | null>(null)
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
}, { deep: true })

// ── Editor content ──
const editorRef = ref<EditorHandle | null>(null)
const tocEntries = ref<TocEntry[]>([])
const isTocOpen = ref(false)
const isMindMapOpen = ref(false)
const isMindMapFullscreen = ref(false)
const currentMarkdown = ref('')
const isFilePanelOpen = ref(localStorage.getItem(SIDEBAR_OPEN_STORAGE_KEY) === '1')
const pendingFileTransition = ref(false)
const deleteTarget = ref<string | null>(null)
const isDeletingFile = ref(false)
const isBurningCurrentFile = ref(false)
const deletePreview = ref('')
const isDeletePreviewLoading = ref(false)
const searchQuery = ref(localStorage.getItem(SIDEBAR_SEARCH_STORAGE_KEY) ?? '')
const searchResults = ref<typeof files.value>([])
const isSearching = ref(false)
const collapsedDirectories = ref<string[]>(JSON.parse(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) ?? '[]'))
const saveState = ref<'idle' | 'saved'>('idle')
const notice = ref<{ tone: 'info' | 'success' | 'error'; title: string; message: string } | null>(null)
let searchTimer: ReturnType<typeof setTimeout> | null = null
let titleSyncTimer: ReturnType<typeof setTimeout> | null = null
let isSyncingFileName = false
let saveStateTimer: ReturnType<typeof setTimeout> | null = null
let noticeTimer: ReturnType<typeof setTimeout> | null = null
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null

watch(isFilePanelOpen, (value) => {
  localStorage.setItem(SIDEBAR_OPEN_STORAGE_KEY, value ? '1' : '0')
})

watch(searchQuery, (value) => {
  localStorage.setItem(SIDEBAR_SEARCH_STORAGE_KEY, value)
})

watch(collapsedDirectories, (value) => {
  localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, JSON.stringify(value))
}, { deep: true })

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

function revealTopBar() {
  topBarRef.value?.show()
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

    // Don't restore content while a burn is in progress — the burn already
    // cleared the editor and the draft was pre-cleared before the animation.
    if (isBurningCurrentFile.value) return

    const draftContent = file?.name ? readStoredDraft(file.name) : null
    const nextContent = draftContent ?? file?.content ?? ''
    const previousContent = previousFile?.content ?? ''
    const didSwitchFile = Boolean(previousFile?.name && file?.name && previousFile.name !== file.name)
    const didContentChange = previousContent !== nextContent
    const isExternalUpdate = !didSwitchFile && didContentChange && previousFile?.name === file?.name
    const didRenameOnly = Boolean(
      previousFile?.name
      && file?.name
      && previousFile.name !== file.name
      && previousFile.content === file.content
      && previousFile.lastModified === file.lastModified,
    )

    if (!didSwitchFile && !didContentChange && previousFile?.name === file?.name) {
      pendingFileTransition.value = false
      return
    }

    if (didRenameOnly) {
      pendingFileTransition.value = false
      return
    }

    if (pendingFileTransition.value && didSwitchFile) {
      await editor.transitionTo(nextContent)
      currentMarkdown.value = nextContent
      pendingFileTransition.value = false
      return
    }

    // External file change: preserve cursor/scroll position (incremental update)
    if (isExternalUpdate && editor.updateContent) {
      editor.updateContent(nextContent)
      currentMarkdown.value = nextContent
      pendingFileTransition.value = false
      return
    }

    // Normal file switch: full content reload (recreates editor)
    await editor.setMarkdown(nextContent)
    currentMarkdown.value = nextContent
    if (file?.name && draftContent !== null) {
      markDirty()
    }
    pendingFileTransition.value = false
  },
  { immediate: true },
)

watch(files, () => {
  if (!searchQuery.value.trim()) return
  handleSearch(searchQuery.value)
}, { deep: true })

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

function handleGlobalKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    void handleSave()
    return
  }

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
    e.preventDefault()
    revealTopBar()
    handleToggleFiles()
  }
}

function clearSearchTimer() {
  if (searchTimer) {
    clearTimeout(searchTimer)
    searchTimer = null
  }
}

function clearTitleSyncTimer() {
  if (titleSyncTimer) {
    clearTimeout(titleSyncTimer)
    titleSyncTimer = null
  }
}

function clearSaveStateTimer() {
  if (saveStateTimer) {
    clearTimeout(saveStateTimer)
    saveStateTimer = null
  }
}

function clearNoticeTimer() {
  if (noticeTimer) {
    clearTimeout(noticeTimer)
    noticeTimer = null
  }
}

function getDraftStorageKey(fileName: string) {
  return `${DRAFT_STORAGE_PREFIX}:${workspaceKind.value}:${workspaceName.value}:${fileName}`
}

function readStoredDraft(fileName: string) {
  return localStorage.getItem(getDraftStorageKey(fileName))
}

function writeStoredDraft(fileName: string, content: string) {
  localStorage.setItem(getDraftStorageKey(fileName), content)
}

function clearStoredDraft(fileName: string) {
  localStorage.removeItem(getDraftStorageKey(fileName))
}

function showSavedState() {
  saveState.value = 'saved'
  clearSaveStateTimer()
  saveStateTimer = setTimeout(() => {
    saveState.value = 'idle'
  }, 1200)
}

function showNotice(
  tone: 'info' | 'success' | 'error',
  title: string,
  message: string,
  duration = 2600,
) {
  notice.value = { tone, title, message }
  clearNoticeTimer()
  if (duration <= 0) return
  noticeTimer = setTimeout(() => {
    notice.value = null
  }, duration)
}

function closeNotice() {
  clearNoticeTimer()
  notice.value = null
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
  const name = getNextUntitledName()
  await newFile(name, buildInitialFileContent(name))
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
  const draft = readStoredDraft(from)
  const ok = await renameFile(from, to)
  if (!ok) {
    window.alert('Rename failed.')
    return
  }

  if (draft !== null) {
    const target = to.endsWith('.md') ? to : `${to}.md`
    writeStoredDraft(target, draft)
    clearStoredDraft(from)
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

  const target = deleteTarget.value
  clearAutoSaveTimer()
  pendingFileTransition.value = target === currentFile.value?.name
  isDeletingFile.value = true

  try {
    await deleteFile(target)
    clearStoredDraft(target)
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

  // Clear the draft BEFORE the animation + save so that the watch callback
  // triggered by saveFile() doesn't find a stale draft and restore old content.
  const fileName = currentFile.value.name
  clearStoredDraft(fileName)

  try {
    await editorRef.value.burnAndClear()
    currentMarkdown.value = ''
    tocEntries.value = []
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
  const ok = await saveFile(snapshot)
  if (ok) {
    if (currentFile.value) {
      clearStoredDraft(currentFile.value.name)
    }
    showSavedState()
  }
}

function extractPrimaryHeading(markdown: string) {
  const match = markdown.match(/^#\s+(.+?)\s*$/m)
  return match?.[1]?.trim() ?? ''
}

function sanitizeFileStem(value: string) {
  return value
    .replace(/[<>:"|?*]/g, '')
    .replace(/[\\/]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.$/, '')
}

function buildSiblingFileName(fileName: string, stem: string) {
  const segments = fileName.replace(/\\/g, '/').split('/').filter(Boolean)
  segments[segments.length - 1] = `${stem}.md`
  return segments.join('/')
}

function ensureUniqueFileName(targetName: string, currentName: string) {
  if (!files.value.some((file) => file.name === targetName && file.name !== currentName)) {
    return targetName
  }

  const stem = getFileTitleFromName(targetName)
  let index = 2
  let candidate = buildSiblingFileName(currentName, `${stem}-${index}`)

  while (files.value.some((file) => file.name === candidate && file.name !== currentName)) {
    index += 1
    candidate = buildSiblingFileName(currentName, `${stem}-${index}`)
  }

  return candidate
}

async function syncFileNameWithHeading(markdown: string) {
  const activeFile = currentFile.value
  if (!activeFile || isSyncingFileName) return

  const heading = sanitizeFileStem(extractPrimaryHeading(markdown))
  if (!heading) return

  const currentStem = getFileTitleFromName(activeFile.name)
  if (heading === currentStem) return

  const nextName = ensureUniqueFileName(buildSiblingFileName(activeFile.name, heading), activeFile.name)
  if (nextName === activeFile.name) return

  isSyncingFileName = true
  try {
    await renameFile(activeFile.name, nextName)
  } finally {
    isSyncingFileName = false
  }
}

function scheduleTitleSync() {
  clearTitleSyncTimer()
  titleSyncTimer = setTimeout(async () => {
    const snapshot = editorRef.value?.getMarkdown()
    if (!snapshot) return
    await syncFileNameWithHeading(snapshot)
  }, 450)
}

function handleSearch(query: string) {
  searchQuery.value = query
  clearSearchTimer()

  const normalized = query.trim()
  if (!normalized) {
    isSearching.value = false
    searchResults.value = []
    return
  }

  isSearching.value = true
  searchTimer = setTimeout(async () => {
    searchResults.value = await searchFiles(normalized)
    isSearching.value = false
  }, 200)
}

function handleToggleDirectory(path: string) {
  collapsedDirectories.value = collapsedDirectories.value.includes(path)
    ? collapsedDirectories.value.filter((entry) => entry !== path)
    : [...collapsedDirectories.value, path]
}

async function handlePickFolder() {
  if (!confirmDiscardUnsavedChanges()) return
  clearAutoSaveTimer()
  const result = await chooseDirectory()
  if (result.cancelled) return
  if (result.ok) {
    showNotice('success', 'Folder Opened', `Workspace switched to ${result.workspaceName ?? 'folder'}.`)
    return
  }
  showNotice('error', 'Open Folder Failed', result.message ?? 'Failed to open the selected folder.')
}

async function handleUseServerWorkspace() {
  if (!confirmDiscardUnsavedChanges()) return
  clearAutoSaveTimer()
  const result = await useServerWorkspace()
  if (result.ok) {
    showNotice('info', 'Workspace Changed', `Using ${result.workspaceName ?? 'built-in workspace'}.`)
  }
}

function handleEditorDirty() {
  markDirty()
  if (currentFile.value) {
    const snapshot = editorRef.value?.getMarkdown()
    if (snapshot !== undefined) {
      writeStoredDraft(currentFile.value.name, snapshot)
      currentMarkdown.value = snapshot
    }
  }
  scheduleAutoSave()
  scheduleTitleSync()
}

function handleTocUpdate(entries: TocEntry[]) {
  tocEntries.value = entries
}

function handleTocJump(pos: number) {
  editorRef.value?.scrollToPos(pos)
}

// ── MindMap event handlers ──
function handleMindMapEditHeading(pos: number, newText: string) {
  editorRef.value?.replaceHeadingText(pos, newText)
  // currentMarkdown will update via handleEditorDirty which fires from Editor's emit('dirty')
}

function handleMindMapAddHeading(afterPos: number, level: number, text: string) {
  editorRef.value?.insertHeading(afterPos, level, text)
}

function handleMindMapDeleteHeading(pos: number) {
  editorRef.value?.deleteHeading(pos)
}

function syncCurrentMarkdown() {
  const snapshot = editorRef.value?.getMarkdown()
  if (snapshot !== undefined) {
    currentMarkdown.value = snapshot
  }
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
  clearSearchTimer()
  clearTitleSyncTimer()
  clearSaveStateTimer()
  clearNoticeTimer()
  window.removeEventListener('keydown', handleGlobalKeydown)
  window.removeEventListener('beforeunload', handleBeforeUnload)
})

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (currentFile.value) {
    const snapshot = editorRef.value?.getMarkdown()
    if (snapshot !== undefined && isDirty.value) {
      writeStoredDraft(currentFile.value.name, snapshot)
    }
  }

  if (!isDirty.value) return
  event.preventDefault()
  event.returnValue = ''
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown)
  window.addEventListener('beforeunload', handleBeforeUnload)
  if (searchQuery.value.trim()) {
    handleSearch(searchQuery.value)
  }
})
</script>

<template>
  <div class="app">
    <!-- Layer 0: WebGL Shader Background -->
    <ShaderCanvas ref="shaderRef" :scene="currentScene" />

    <!-- Brand Mark — always visible top-left -->
    <BrandMark />

    <FileSidebar
      :files="files"
      :search-query="searchQuery"
      :search-results="searchResults"
      :is-searching="isSearching"
      :collapsed-directories="collapsedDirectories"
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
      @search="handleSearch"
      @toggle-directory="handleToggleDirectory"
    />

    <!-- Layer 1: Top Bar (hidden during mindmap fullscreen) -->
    <div :style="isMindMapFullscreen ? 'pointer-events: none; opacity: 0;' : ''">
    <TopBar
      ref="topBarRef"
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
    </div>

    <!-- Layer 2: Frosted Glass Editor -->
    <div class="editor-container" :class="{ 'split-mode': isMindMapOpen && !isMindMapFullscreen }">
      <div class="editor-glass" :style="{ '--glass-blur': glassBlur, '--editor-font': editorFontFamily }">
        <div class="editor-actions">
          <transition name="indicator-fade">
            <span v-if="isDirty" class="unsaved-dot" title="Unsaved changes" />
          </transition>
          <button
            class="editor-toc-btn"
            :class="{ active: isTocOpen }"
            :disabled="!currentFile"
            @click="isTocOpen = !isTocOpen"
            title="目录 (TOC)"
            aria-label="Toggle table of contents"
          >
            TOC
          </button>
          <button
            class="editor-mindmap-btn"
            :class="{ active: isMindMapOpen }"
            :disabled="!currentFile"
            @click="isMindMapOpen = !isMindMapOpen"
            title="思维导图"
            aria-label="Toggle mind map"
          >
            Map
          </button>
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
            :class="{ dirty: isDirty, saved: saveState === 'saved' && !isDirty }"
            :disabled="isSaving || isBurningCurrentFile || !currentFile"
            @click="handleSave"
            title="Save (Ctrl+S)"
            aria-label="Save"
          >
            {{ isSaving ? 'Saving...' : saveState === 'saved' ? 'Saved' : 'Save' }}
          </button>
        </div>

        <Editor
          ref="editorRef"
          @dirty="handleEditorDirty"
          @toc-update="handleTocUpdate"
        />
      </div>

      <!-- MindMap Panel (split-mode right pane) -->
      <MindMapPanel
        v-if="isMindMapOpen"
        :markdown="currentMarkdown"
        :toc-entries="tocEntries"
        :visible="isMindMapOpen"
        :fullscreen="isMindMapFullscreen"
        :doc-title="currentFile?.name ? getFileTitleFromName(currentFile.name) : 'Document'"
        @edit-heading="handleMindMapEditHeading"
        @add-heading="handleMindMapAddHeading"
        @delete-heading="handleMindMapDeleteHeading"
        @jump="handleTocJump"
        @toggle-fullscreen="isMindMapFullscreen = !isMindMapFullscreen"
        @close="isMindMapOpen = false; isMindMapFullscreen = false"
      />
    </div>

    <!-- TOC Panel -->
    <TocPanel
      :entries="tocEntries"
      :visible="isTocOpen"
      @jump="handleTocJump"
      @close="isTocOpen = false"
    />

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

    <transition name="notice-fade">
      <div
        v-if="notice"
        class="notice-card"
        :class="`notice-card--${notice.tone}`"
        role="status"
        aria-live="polite"
      >
        <div class="notice-copy">
          <span class="notice-title">{{ notice.title }}</span>
          <p class="notice-message">{{ notice.message }}</p>
        </div>
        <button class="notice-close" aria-label="Dismiss notice" @click="closeNotice">×</button>
      </div>
    </transition>

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
.editor-glass :deep(.cm-editor-host .cm-scroller) {
  font-family: var(--editor-font, var(--font-sans));
}

/* ── Split mode: editor + mind map side by side ── */
.editor-container.split-mode {
  align-items: stretch;
  justify-content: stretch;
  gap: 16px;
  padding: 60px 24px 24px;
}

.editor-container.split-mode .editor-glass {
  max-width: none;
  flex: 1;
  min-width: 0;
}

/* MindMapPanel inherits pointer-events from its own styles */
.editor-container.split-mode > :deep(.mindmap-panel) {
  pointer-events: auto;
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

.editor-save-btn.saved {
  border-color: color-mix(in srgb, var(--color-accent) 48%, var(--color-border-muted));
  color: var(--color-text-heading);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-accent) 12%, transparent);
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

.editor-toc-btn {
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

.editor-toc-btn.active {
  border-color: color-mix(in srgb, var(--color-accent) 60%, var(--color-border-muted));
  color: var(--color-text-heading);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-accent) 16%, transparent);
}

.editor-toc-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--topbar-btn-hover-bg) 75%, var(--color-surface-solid));
  transform: translateY(-1px);
}

.editor-toc-btn:disabled {
  opacity: 0.5;
  cursor: default;
  transform: none;
}

.editor-mindmap-btn {
  height: 32px;
  padding: 0 12px;
  border: 1px solid color-mix(in srgb, #a78bfa 40%, var(--color-border-muted));
  border-radius: 999px;
  background: color-mix(in srgb, rgba(167, 139, 250, 0.1) 72%, var(--color-surface-solid));
  color: #c4b5fd;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all var(--transition-base);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.editor-mindmap-btn.active {
  border-color: color-mix(in srgb, #a78bfa 60%, var(--color-border-muted));
  color: var(--color-text-heading);
  box-shadow: 0 0 0 1px color-mix(in srgb, #a78bfa 20%, transparent);
}

.editor-mindmap-btn:hover:not(:disabled) {
  background: color-mix(in srgb, rgba(167, 139, 250, 0.18) 80%, var(--color-surface-solid));
  color: var(--color-text-heading);
  transform: translateY(-1px);
}

.editor-mindmap-btn:disabled {
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

.notice-card {
  position: fixed;
  top: 58px;
  right: 18px;
  z-index: calc(var(--z-editor) + 5);
  width: min(320px, calc(100vw - 24px));
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 14px 12px;
  border: 1px solid color-mix(in srgb, var(--color-border-muted) 82%, transparent);
  border-radius: 18px;
  background: color-mix(in srgb, var(--color-surface-solid) 94%, transparent);
  box-shadow: var(--shadow-editor);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.notice-card--success {
  border-color: color-mix(in srgb, #34d399 44%, var(--color-border-muted));
}

.notice-card--error {
  border-color: color-mix(in srgb, #fb7185 44%, var(--color-border-muted));
}

.notice-card--info {
  border-color: color-mix(in srgb, var(--color-accent) 38%, var(--color-border-muted));
}

.notice-copy {
  min-width: 0;
}

.notice-title {
  display: inline-block;
  color: var(--color-text-heading);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.notice-message {
  margin: 6px 0 0;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.55;
}

.notice-close {
  flex: none;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
}

.notice-close:hover {
  background: color-mix(in srgb, var(--topbar-btn-hover-bg) 80%, transparent);
  color: var(--color-text-heading);
}

.notice-fade-enter-active,
.notice-fade-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.notice-fade-enter-from,
.notice-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
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

  .notice-card {
    top: 52px;
    right: 12px;
    left: 12px;
    width: auto;
  }

  .editor-glass {
    border-radius: var(--radius-xl);
  }

  /* On small screens, split mode stacks vertically */
  .editor-container.split-mode {
    flex-direction: column;
    padding: 50px 12px 12px;
    gap: 12px;
  }
}
</style>
