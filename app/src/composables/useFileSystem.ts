import { ref, shallowRef, onMounted, onBeforeUnmount, type Ref, type ShallowRef } from 'vue'

const API_BASE = '/api'
const WS_PATH = '/ws'
const HANDLE_DB_NAME = 'inner-workspace'
const HANDLE_STORE_NAME = 'handles'
const HANDLE_KEY = 'directory-workspace'
const SERVER_WORKSPACE_NAME = 'Inner/data'

type WorkspaceKind = 'server' | 'directory'
type DirectoryPermissionMode = 'read' | 'readwrite'

interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>
}

export interface FileInfo {
  name: string
  content: string
  lastModified: number
}

export interface FileSystemControls {
  currentFile: ShallowRef<FileInfo | null>
  files: Ref<FileInfo[]>
  isDirty: Ref<boolean>
  isSaving: Ref<boolean>
  isConnected: Ref<boolean>
  workspaceKind: Ref<WorkspaceKind>
  workspaceName: Ref<string>
  supportsDirectoryPicker: boolean
  openFile: (name?: string) => Promise<void>
  readFileByName: (name: string) => Promise<FileInfo | null>
  saveFile: (contentSnapshot?: string) => Promise<boolean>
  newFile: (name?: string, content?: string) => Promise<void>
  renameFile: (from: string, to: string) => Promise<boolean>
  deleteFile: (name: string) => Promise<void>
  chooseDirectory: () => Promise<void>
  useServerWorkspace: () => Promise<void>
  markDirty: () => void
  getContent: () => string
  refreshFileList: () => Promise<void>
}

function normalizeFileName(name: string) {
  return name.replace(/\\/g, '/')
}

function getLastFileStorageKeyFor(workspaceType: WorkspaceKind, workspaceLabel: string) {
  return `inner:lastFile:${workspaceType}:${workspaceLabel}`
}

function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HANDLE_DB_NAME, 1)
    request.onerror = () => reject(request.error)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(HANDLE_STORE_NAME)) {
        request.result.createObjectStore(HANDLE_STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
  })
}

async function loadStoredDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openHandleDb()
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(HANDLE_STORE_NAME, 'readonly')
      const store = transaction.objectStore(HANDLE_STORE_NAME)
      const request = store.get(HANDLE_KEY)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve((request.result as FileSystemDirectoryHandle | undefined) ?? null)
    })
  } catch {
    return null
  }
}

async function storeDirectoryHandle(handle: FileSystemDirectoryHandle) {
  const db = await openHandleDb()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(HANDLE_STORE_NAME, 'readwrite')
    const store = transaction.objectStore(HANDLE_STORE_NAME)
    const request = store.put(handle, HANDLE_KEY)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

async function clearStoredDirectoryHandle() {
  try {
    const db = await openHandleDb()
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(HANDLE_STORE_NAME, 'readwrite')
      const store = transaction.objectStore(HANDLE_STORE_NAME)
      const request = store.delete(HANDLE_KEY)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  } catch {
    // ignore
  }
}

async function ensureDirectoryPermission(
  handle: FileSystemDirectoryHandle,
  mode: DirectoryPermissionMode,
) {
  const options = { mode } as const
  if ((await handle.queryPermission(options)) === 'granted') {
    return true
  }

  return (await handle.requestPermission(options)) === 'granted'
}

export function useFileSystem(): FileSystemControls {
  const currentFile = shallowRef<FileInfo | null>(null)
  const files = ref<FileInfo[]>([])
  const isDirty = ref(false)
  const isSaving = ref(false)
  const isConnected = ref(false)
  const workspaceKind = ref<WorkspaceKind>('server')
  const workspaceName = ref(SERVER_WORKSPACE_NAME)
  const supportsDirectoryPicker = typeof window !== 'undefined' && 'showDirectoryPicker' in window

  const currentDirectory = shallowRef<FileSystemDirectoryHandle | null>(null)
  let ws: WebSocket | null = null
  let shouldReconnectWs = true

  function getLastFileStorageKey() {
    return getLastFileStorageKeyFor(workspaceKind.value, workspaceName.value)
  }

  function updateFileTimestamp(name: string, lastModified: number) {
    const index = files.value.findIndex((file) => file.name === name)
    if (index >= 0) {
      files.value[index] = { ...files.value[index], lastModified }
    }
  }

  async function fetchFiles(): Promise<FileInfo[]> {
    try {
      const res = await fetch(`${API_BASE}/files`)
      if (!res.ok) return []
      return await res.json()
    } catch {
      return []
    }
  }

  async function fetchFile(name: string): Promise<FileInfo | null> {
    try {
      const res = await fetch(`${API_BASE}/files/${encodeURIComponent(name)}`)
      if (!res.ok) return null
      return await res.json()
    } catch {
      return null
    }
  }

  async function writeServerFile(name: string, content: string): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/files/${encodeURIComponent(name)}`, {
        method: 'PUT',
        body: content,
        headers: { 'Content-Type': 'text/plain' },
      })
      return res.ok
    } catch {
      return false
    }
  }

  async function deleteServerFile(name: string): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/files/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      })
      return res.ok
    } catch {
      return false
    }
  }

  async function renameServerFile(from: string, to: string): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/files/${encodeURIComponent(from)}/rename`, {
        method: 'POST',
        body: to,
        headers: { 'Content-Type': 'text/plain' },
      })
      return res.ok
    } catch {
      return false
    }
  }

  async function listDirectoryFiles(
    root: FileSystemDirectoryHandle,
    prefix = '',
  ): Promise<FileInfo[]> {
    const results: FileInfo[] = []

    for await (const entry of root.values()) {
      const relativeName = prefix ? `${prefix}/${entry.name}` : entry.name

      if (entry.kind === 'directory') {
        results.push(...await listDirectoryFiles(entry, relativeName))
        continue
      }

      if (!entry.name.endsWith('.md')) continue

      const file = await entry.getFile()
      results.push({
        name: normalizeFileName(relativeName),
        content: '',
        lastModified: file.lastModified,
      })
    }

    return results.sort((a, b) => b.lastModified - a.lastModified)
  }

  async function getFileHandleFromDirectory(
    root: FileSystemDirectoryHandle,
    name: string,
    create: boolean,
  ) {
    const segments = normalizeFileName(name).split('/').filter(Boolean)
    const fileName = segments.pop()

    if (!fileName) {
      throw new Error('Invalid file name')
    }

    let directory = root
    for (const segment of segments) {
      directory = await directory.getDirectoryHandle(segment, { create })
    }

    return directory.getFileHandle(fileName, { create })
  }

  async function readDirectoryFile(name: string): Promise<FileInfo | null> {
    const root = currentDirectory.value
    if (!root) return null

    try {
      const handle = await getFileHandleFromDirectory(root, name, false)
      const file = await handle.getFile()
      return {
        name: normalizeFileName(name),
        content: await file.text(),
        lastModified: file.lastModified,
      }
    } catch {
      return null
    }
  }

  async function writeDirectoryFile(name: string, content: string): Promise<boolean> {
    const root = currentDirectory.value
    if (!root) return false

    try {
      const handle = await getFileHandleFromDirectory(root, name, true)
      const writable = await handle.createWritable()
      await writable.write(content)
      await writable.close()
      return true
    } catch {
      return false
    }
  }

  async function removeDirectoryFile(name: string): Promise<boolean> {
    const root = currentDirectory.value
    if (!root) return false

    try {
      const segments = normalizeFileName(name).split('/').filter(Boolean)
      const fileName = segments.pop()
      if (!fileName) return false

      let parent = root
      for (const segment of segments) {
        parent = await parent.getDirectoryHandle(segment, { create: false })
      }

      await parent.removeEntry(fileName)
      if (currentFile.value?.name === name) {
        currentFile.value = null
      }
      return true
    } catch {
      return false
    }
  }

  async function renameDirectoryFile(from: string, to: string): Promise<boolean> {
    const file = await readDirectoryFile(from)
    if (!file) return false

    const wrote = await writeDirectoryFile(to, file.content)
    if (!wrote) return false

    return removeDirectoryFile(from)
  }

  async function restoreLastFileOrDefault() {
    const lastFile = localStorage.getItem(getLastFileStorageKey())
    if (lastFile && files.value.find((file) => file.name === lastFile)) {
      await openFile(lastFile)
      return
    }

    if (files.value.length > 0) {
      await openFile(files.value[0].name)
      return
    }

    await newFile()
  }

  function connectWS() {
    if (workspaceKind.value !== 'server' || ws) return

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      ws = new WebSocket(`${protocol}//${window.location.host}${WS_PATH}`)

      ws.onopen = () => {
        isConnected.value = true
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          handleWsMessage(data)
        } catch {
          // ignore malformed events
        }
      }

      ws.onclose = () => {
        ws = null
        isConnected.value = false
        if (shouldReconnectWs && workspaceKind.value === 'server') {
          setTimeout(connectWS, 2000)
        }
      }

      ws.onerror = () => {
        isConnected.value = false
      }
    } catch {
      if (shouldReconnectWs && workspaceKind.value === 'server') {
        setTimeout(connectWS, 3000)
      }
    }
  }

  function disconnectWS() {
    shouldReconnectWs = false
    ws?.close()
    ws = null
    isConnected.value = false
  }

  function handleWsMessage(data: any) {
    if (data.type === 'init') {
      files.value = data.files
      return
    }

    if (data.type === 'created') {
      const exists = files.value.find((file) => file.name === data.name)
      if (!exists) {
        files.value.unshift({ name: data.name, content: data.content, lastModified: Date.now() })
      }
      return
    }

    if (data.type === 'changed') {
      const index = files.value.findIndex((file) => file.name === data.name)
      if (index >= 0) {
        files.value[index] = { ...files.value[index], content: data.content, lastModified: Date.now() }
      }

      const activeFile = currentFile.value
      if (!activeFile || activeFile.name !== data.name) return

      currentFile.value = {
        ...activeFile,
        content: data.content,
        lastModified: Date.now(),
      }
      isDirty.value = false
      return
    }

    if (data.type === 'deleted') {
      files.value = files.value.filter((file) => file.name !== data.name)
      if (currentFile.value?.name === data.name) {
        if (files.value.length > 0) {
          void openFile(files.value[0].name)
        } else {
          currentFile.value = null
        }
      }
    }
  }

  async function refreshFileList() {
    if (workspaceKind.value === 'directory' && currentDirectory.value) {
      files.value = await listDirectoryFiles(currentDirectory.value)
      return
    }

    files.value = await fetchFiles()
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

    const file = workspaceKind.value === 'directory'
      ? await readDirectoryFile(name)
      : await fetchFile(name)

    if (!file) return

    currentFile.value = file
    isDirty.value = false
    localStorage.setItem(getLastFileStorageKey(), name)
  }

  async function readFileByName(name: string) {
    return workspaceKind.value === 'directory'
      ? await readDirectoryFile(name)
      : await fetchFile(name)
  }

  async function saveFile(contentSnapshot?: string) {
    if (!currentFile.value || !isDirty.value || isSaving.value) return false

    const fileName = currentFile.value.name
    const snapshot = contentSnapshot ?? currentFile.value.content
    const saveTarget = workspaceKind.value
    isSaving.value = true

    const ok = saveTarget === 'directory'
      ? await writeDirectoryFile(fileName, snapshot)
      : await writeServerFile(fileName, snapshot)

    isSaving.value = false
    if (!ok) return false

    const now = Date.now()
    updateFileTimestamp(fileName, now)

    if (saveTarget === 'directory') {
      await refreshFileList()
    }

    if (currentFile.value?.name === fileName) {
      currentFile.value = {
        ...currentFile.value,
        content: snapshot,
        lastModified: now,
      }
    }
    isDirty.value = false

    return true
  }

  async function newFile(name?: string, content = '') {
    if (!name) {
      const date = new Date()
      name = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}.md`
    }

    if (!name.endsWith('.md')) name += '.md'
    const ok = workspaceKind.value === 'directory'
      ? await writeDirectoryFile(name, content)
      : await writeServerFile(name, content)

    if (!ok) return

    currentFile.value = { name, content, lastModified: Date.now() }
    isDirty.value = false
    await refreshFileList()
    localStorage.setItem(getLastFileStorageKey(), name)
  }

  async function renameFile(from: string, to: string) {
    const source = normalizeFileName(from).trim()
    let target = normalizeFileName(to).trim()

    if (!source || !target) return false
    if (!target.endsWith('.md')) target += '.md'
    if (source === target) return true

    const ok = workspaceKind.value === 'directory'
      ? await renameDirectoryFile(source, target)
      : await renameServerFile(source, target)

    if (!ok) return false

    await refreshFileList()

    if (currentFile.value?.name === source) {
      currentFile.value = {
        ...currentFile.value,
        name: target,
      }
      localStorage.setItem(getLastFileStorageKey(), target)
    }

    return true
  }

  async function deleteFile(name: string) {
    const wasCurrent = currentFile.value?.name === name
    const ok = workspaceKind.value === 'directory'
      ? await removeDirectoryFile(name)
      : await deleteServerFile(name)

    if (!ok) return

    await refreshFileList()

    if (!wasCurrent) return

    if (files.value.length > 0) {
      await openFile(files.value[0].name)
      return
    }

    currentFile.value = null
    isDirty.value = false
  }

  async function activateServerWorkspace() {
    currentDirectory.value = null
    workspaceKind.value = 'server'
    workspaceName.value = SERVER_WORKSPACE_NAME
    currentFile.value = null
    files.value = []
    isDirty.value = false
    shouldReconnectWs = true
    connectWS()
    await refreshFileList()
    await restoreLastFileOrDefault()
  }

  async function activateDirectoryWorkspace(handle: FileSystemDirectoryHandle) {
    disconnectWS()
    currentDirectory.value = handle
    workspaceKind.value = 'directory'
    workspaceName.value = handle.name
    currentFile.value = null
    files.value = []
    isDirty.value = false
    isConnected.value = true
    await refreshFileList()
    await restoreLastFileOrDefault()
  }

  async function restoreDirectoryWorkspace() {
    const handle = await loadStoredDirectoryHandle()
    if (!handle) return false

    const granted = await ensureDirectoryPermission(handle, 'readwrite')
    if (!granted) {
      await clearStoredDirectoryHandle()
      return false
    }

    await activateDirectoryWorkspace(handle)
    return true
  }

  async function chooseDirectory() {
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker
    if (!picker) {
      window.alert('当前浏览器不支持文件夹选择，请使用 Chromium 内核浏览器。')
      return
    }

    try {
      const handle = await picker.call(window)
      const granted = await ensureDirectoryPermission(handle, 'readwrite')
      if (!granted) {
        window.alert('没有拿到文件夹读写权限，无法作为工作区使用。')
        return
      }

      await storeDirectoryHandle(handle)
      await activateDirectoryWorkspace(handle)
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') {
        return
      }
      console.error('[Inner] Failed to open directory workspace', error)
      window.alert('打开文件夹失败。')
    }
  }

  async function useServerWorkspace() {
    await clearStoredDirectoryHandle()
    await activateServerWorkspace()
  }

  function markDirty() {
    if (!currentFile.value) return
    isDirty.value = true
  }

  function getContent() {
    return currentFile.value?.content ?? ''
  }

  onMounted(async () => {
    const restored = await restoreDirectoryWorkspace()
    if (!restored) {
      await activateServerWorkspace()
    }
  })

  onBeforeUnmount(() => {
    disconnectWS()
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
  }
}
