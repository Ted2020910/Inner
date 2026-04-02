import { ref, shallowRef, onMounted, onBeforeUnmount, type Ref, type ShallowRef } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { open as openDialog } from '@tauri-apps/plugin-dialog'

// ── 常量 ─────────────────────────────────────────────────────────────────────

const WORKSPACE_NAME_DEFAULT = 'Inner'

// ── 类型定义 ─────────────────────────────────────────────────────────────────

export interface FileInfo {
  name: string
  content: string
  lastModified: number
}

interface FileMeta {
  name: string
  lastModified: number
}

export interface WorkspaceActionResult {
  ok: boolean
  cancelled?: boolean
  message?: string
  workspaceName?: string
}

export interface FileSystemControls {
  currentFile: ShallowRef<FileInfo | null>
  files: Ref<FileInfo[]>
  isDirty: Ref<boolean>
  isSaving: Ref<boolean>
  isConnected: Ref<boolean>
  workspaceKind: Ref<'tauri'>
  workspaceName: Ref<string>
  supportsDirectoryPicker: boolean
  openFile: (name?: string) => Promise<void>
  readFileByName: (name: string) => Promise<FileInfo | null>
  saveFile: (contentSnapshot?: string) => Promise<boolean>
  newFile: (name?: string, content?: string) => Promise<void>
  renameFile: (from: string, to: string) => Promise<boolean>
  deleteFile: (name: string) => Promise<void>
  chooseDirectory: () => Promise<WorkspaceActionResult>
  useServerWorkspace: () => Promise<WorkspaceActionResult>
  markDirty: () => void
  getContent: () => string
  refreshFileList: () => Promise<void>
  searchFiles: (query: string) => Promise<FileInfo[]>
}

// ── 工具函数 ─────────────────────────────────────────────────────────────────

function normalizeFileName(name: string) {
  return name.replace(/\\/g, '/')
}

function getDefaultMarkdownContent(name: string) {
  const fileName = normalizeFileName(name).split('/').filter(Boolean).pop() ?? name
  const title = fileName.replace(/\.md$/i, '')
  return `# ${title}\n\n`
}

function getLastFileStorageKey(workspaceName: string) {
  return `inner:lastFile:tauri:${workspaceName}`
}

// ── Composable ────────────────────────────────────────────────────────────────

export function useFileSystem(): FileSystemControls {
  const currentFile = shallowRef<FileInfo | null>(null)
  const files = ref<FileInfo[]>([])
  const isDirty = ref(false)
  const isSaving = ref(false)
  const isConnected = ref(false)
  const workspaceKind = ref<'tauri'>('tauri')
  const workspaceName = ref(WORKSPACE_NAME_DEFAULT)

  // Tauri 环境下无需浏览器 showDirectoryPicker（改用原生对话框）
  const supportsDirectoryPicker = false

  // 存储 Tauri 事件监听器的清理函数
  const unlisteners: UnlistenFn[] = []

  // ── 获取最后打开的文件 key ──────────────────────────────────────────────────

  function getStorageKey() {
    return getLastFileStorageKey(workspaceName.value)
  }

  // ── 文件列表工具 ────────────────────────────────────────────────────────────

  function updateFileTimestamp(name: string, lastModified: number) {
    const index = files.value.findIndex((f) => f.name === name)
    if (index >= 0) {
      files.value[index] = { ...files.value[index], lastModified }
    }
  }

  // ── Tauri 命令封装 ──────────────────────────────────────────────────────────

  async function tauriListFiles(): Promise<FileMeta[]> {
    try {
      return await invoke<FileMeta[]>('list_files')
    } catch {
      return []
    }
  }

  async function tauriReadFile(name: string): Promise<FileInfo | null> {
    try {
      return await invoke<FileInfo>('read_file', { name })
    } catch {
      return null
    }
  }

  async function tauriWriteFile(name: string, content: string): Promise<boolean> {
    try {
      await invoke('write_file', { name, content })
      return true
    } catch {
      return false
    }
  }

  async function tauriDeleteFile(name: string): Promise<boolean> {
    try {
      await invoke('delete_file', { name })
      return true
    } catch {
      return false
    }
  }

  async function tauriRenameFile(from: string, to: string): Promise<boolean> {
    try {
      await invoke('rename_file', { from, to })
      return true
    } catch {
      return false
    }
  }

  async function tauriSearchFiles(query: string): Promise<FileInfo[]> {
    try {
      return await invoke<FileInfo[]>('search_files', { query })
    } catch {
      return []
    }
  }

  // ── 文件监听（替代 WebSocket） ──────────────────────────────────────────────

  async function registerWatcher() {
    const onCreate = await listen<{ name: string; content: string; lastModified: number }>(
      'fs:created',
      ({ payload }) => {
        const exists = files.value.find((f) => f.name === payload.name)
        if (!exists) {
          files.value.unshift({
            name: payload.name,
            content: payload.content,
            lastModified: payload.lastModified,
          })
        }
      },
    )

    const onChange = await listen<{ name: string; content: string; lastModified: number }>(
      'fs:changed',
      ({ payload }) => {
        const index = files.value.findIndex((f) => f.name === payload.name)
        if (index >= 0) {
          files.value[index] = {
            ...files.value[index],
            content: payload.content,
            lastModified: payload.lastModified,
          }
        }
        if (currentFile.value?.name === payload.name) {
          currentFile.value = {
            ...currentFile.value,
            content: payload.content,
            lastModified: payload.lastModified,
          }
          isDirty.value = false
        }
      },
    )

    const onDelete = await listen<{ name: string }>('fs:deleted', async ({ payload }) => {
      files.value = files.value.filter((f) => f.name !== payload.name)
      if (currentFile.value?.name === payload.name) {
        if (files.value.length > 0) {
          await openFile(files.value[0].name)
        } else {
          currentFile.value = null
        }
      }
    })

    // 目录被切换时重新加载文件列表
    const onDirChanged = await listen<string>('fs:dir-changed', async (event) => {
      workspaceName.value = event.payload.split('/').pop() ?? WORKSPACE_NAME_DEFAULT
      await refreshFileList()
      await restoreLastFileOrDefault()
    })

    unlisteners.push(onCreate, onChange, onDelete, onDirChanged)
    isConnected.value = true
  }

  // ── 核心操作 ────────────────────────────────────────────────────────────────

  async function refreshFileList() {
    const metas = await tauriListFiles()
    // 保持 files 的结构与 FileInfo 一致（content 暂为空，按需读取）
    files.value = metas.map((m) => ({ name: m.name, content: '', lastModified: m.lastModified }))
  }

  async function searchFiles(query: string) {
    const normalizedQuery = query.trim()
    if (!normalizedQuery) return []
    return tauriSearchFiles(normalizedQuery)
  }

  async function openFile(name?: string) {
    if (!name) {
      if (files.value.length > 0) {
        name = files.value[0].name
      } else {
        await newFile()
        return
      }
    }

    const file = await tauriReadFile(name)
    if (!file) return

    currentFile.value = file
    isDirty.value = false
    localStorage.setItem(getStorageKey(), name)
  }

  async function readFileByName(name: string): Promise<FileInfo | null> {
    return tauriReadFile(name)
  }

  async function saveFile(contentSnapshot?: string): Promise<boolean> {
    if (!currentFile.value || isSaving.value) return false

    const fileName = currentFile.value.name
    const snapshot = contentSnapshot ?? currentFile.value.content
    isSaving.value = true

    const ok = await tauriWriteFile(fileName, snapshot)

    isSaving.value = false
    if (!ok) return false

    const now = Date.now()
    updateFileTimestamp(fileName, now)

    if (currentFile.value?.name === fileName) {
      currentFile.value = { ...currentFile.value, content: snapshot, lastModified: now }
    }
    isDirty.value = false
    return true
  }

  async function newFile(name?: string, content?: string) {
    if (!name) {
      const date = new Date()
      name = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}.md`
    }
    if (!name.endsWith('.md')) name += '.md'

    const nextContent = content ?? getDefaultMarkdownContent(name)
    const ok = await tauriWriteFile(name, nextContent)
    if (!ok) return

    currentFile.value = { name, content: nextContent, lastModified: Date.now() }
    isDirty.value = false
    await refreshFileList()
    localStorage.setItem(getStorageKey(), name)
  }

  async function renameFile(from: string, to: string): Promise<boolean> {
    const source = normalizeFileName(from).trim()
    let target = normalizeFileName(to).trim()

    if (!source || !target) return false
    if (!target.endsWith('.md')) target += '.md'
    if (source === target) return true

    const ok = await tauriRenameFile(source, target)
    if (!ok) return false

    await refreshFileList()

    if (currentFile.value?.name === source) {
      currentFile.value = { ...currentFile.value, name: target }
      localStorage.setItem(getStorageKey(), target)
    }
    return true
  }

  async function deleteFile(name: string) {
    const wasCurrent = currentFile.value?.name === name
    const ok = await tauriDeleteFile(name)
    if (!ok) return

    await refreshFileList()

    if (!wasCurrent) return

    if (files.value.length > 0) {
      await openFile(files.value[0].name)
    } else {
      currentFile.value = null
      isDirty.value = false
    }
  }

  async function restoreLastFileOrDefault() {
    const lastFile = localStorage.getItem(getStorageKey())
    if (lastFile && files.value.find((f) => f.name === lastFile)) {
      await openFile(lastFile)
      return
    }
    if (files.value.length > 0) {
      await openFile(files.value[0].name)
      return
    }
    await newFile()
  }

  // ── 工作空间切换 ────────────────────────────────────────────────────────────

  /**
   * 让用户通过原生对话框选择文件夹，并通知 Rust 切换数据目录。
   * 原接口名称保留，以保持与 App.vue 调用侧的兼容性。
   */
  async function chooseDirectory(): Promise<WorkspaceActionResult> {
    try {
      const selected = await openDialog({ directory: true, multiple: false, title: '选择笔记文件夹' })
      if (!selected) return { ok: false, cancelled: true }

      const path = typeof selected === 'string' ? selected : selected[0]
      const newName: string = await invoke('set_data_dir', { path })

      workspaceName.value = newName.split(/[/\\]/).pop() ?? newName
      await refreshFileList()
      await restoreLastFileOrDefault()

      return { ok: true, workspaceName: workspaceName.value }
    } catch (error) {
      console.error('[Inner] Failed to choose directory', error)
      return { ok: false, message: '选择文件夹失败' }
    }
  }

  /**
   * 切回默认数据目录（App 自身的 app_data_dir/data）。
   * 原接口名称保留。
   */
  async function useServerWorkspace(): Promise<WorkspaceActionResult> {
    try {
      const defaultDir: string = await invoke('get_data_dir')
      workspaceName.value = WORKSPACE_NAME_DEFAULT
      await invoke('set_data_dir', { path: defaultDir })
      await refreshFileList()
      await restoreLastFileOrDefault()
      return { ok: true, workspaceName: WORKSPACE_NAME_DEFAULT }
    } catch (error) {
      console.error('[Inner] Failed to restore default workspace', error)
      return { ok: false, message: '切换工作空间失败' }
    }
  }

  // ── 标记脏状态 ──────────────────────────────────────────────────────────────

  function markDirty() {
    if (!currentFile.value) return
    isDirty.value = true
  }

  function getContent() {
    return currentFile.value?.content ?? ''
  }

  // ── 生命周期 ────────────────────────────────────────────────────────────────

  onMounted(async () => {
    await registerWatcher()
    await refreshFileList()
    await restoreLastFileOrDefault()
  })

  onBeforeUnmount(() => {
    unlisteners.forEach((fn) => fn())
    unlisteners.length = 0
    isConnected.value = false
  })

  return {
    currentFile,
    files,
    isDirty,
    isSaving,
    isConnected,
    workspaceKind,
    workspaceName,
    supportsDirectoryPicker,
    openFile,
    readFileByName,
    saveFile,
    newFile,
    renameFile,
    deleteFile,
    chooseDirectory,
    useServerWorkspace,
    markDirty,
    getContent,
    refreshFileList,
    searchFiles,
  }
}
