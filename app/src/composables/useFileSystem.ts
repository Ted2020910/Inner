import { ref, type Ref } from 'vue'

export interface FileInfo {
  name: string
  path: string
  content: string
  lastSaved: number
}

export interface FileSystemControls {
  currentFile: Ref<FileInfo | null>
  files: Ref<FileInfo[]>
  isDirty: Ref<boolean>
  openFile: () => Promise<void>
  saveFile: () => Promise<void>
  newFile: () => void
  setContent: (content: string) => void
  getContent: () => string
}

/**
 * File system composable.
 * P0: Uses browser localStorage + File System Access API as fallback.
 * Will be replaced with Tauri fs API when build tools are ready.
 */
export function useFileSystem(): FileSystemControls {
  const currentFile = ref<FileInfo | null>(null)
  const files = ref<FileInfo[]>([])
  const isDirty = ref(false)

  // Load saved files list from localStorage
  function loadFilesList() {
    try {
      const saved = localStorage.getItem('inner:files')
      if (saved) {
        files.value = JSON.parse(saved)
      }
    } catch {
      // ignore
    }
  }

  function saveFilesList() {
    localStorage.setItem('inner:files', JSON.stringify(files.value))
  }

  function newFile() {
    const now = Date.now()
    const date = new Date()
    const name = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}.md`

    const file: FileInfo = {
      name,
      path: `local://${name}`,
      content: '',
      lastSaved: now,
    }

    currentFile.value = file
    isDirty.value = false

    // Add to files list if not exists
    if (!files.value.find((f) => f.path === file.path)) {
      files.value.push(file)
      saveFilesList()
    }
  }

  function setContent(content: string) {
    if (currentFile.value) {
      currentFile.value.content = content
      isDirty.value = true
    }
  }

  function getContent(): string {
    return currentFile.value?.content ?? ''
  }

  async function saveFile() {
    if (!currentFile.value) return

    currentFile.value.lastSaved = Date.now()
    isDirty.value = false

    // Save to localStorage
    localStorage.setItem(
      `inner:file:${currentFile.value.path}`,
      currentFile.value.content
    )

    // Update files list
    const idx = files.value.findIndex((f) => f.path === currentFile.value!.path)
    if (idx >= 0) {
      files.value[idx] = { ...currentFile.value }
    } else {
      files.value.push({ ...currentFile.value })
    }
    saveFilesList()

    // Also try to save via File System Access API if available
    await saveViaFSAPI()
  }

  async function saveViaFSAPI() {
    if (!currentFile.value) return
    if (!('showSaveFilePicker' in window)) return

    // Only prompt for download on explicit save, not auto-save
    // For auto-save, localStorage is sufficient in P0
  }

  async function openFile() {
    // Try File System Access API first
    if ('showOpenFilePicker' in window) {
      try {
        const [handle] = await (window as any).showOpenFilePicker({
          types: [
            {
              description: 'Markdown files',
              accept: { 'text/markdown': ['.md'] },
            },
          ],
        })
        const file = await handle.getFile()
        const content = await file.text()

        const fileInfo: FileInfo = {
          name: file.name,
          path: `fs://${file.name}`,
          content,
          lastSaved: Date.now(),
        }

        currentFile.value = fileInfo
        isDirty.value = false

        // Cache in localStorage too
        localStorage.setItem(`inner:file:${fileInfo.path}`, content)
        if (!files.value.find((f) => f.path === fileInfo.path)) {
          files.value.push(fileInfo)
          saveFilesList()
        }
        return
      } catch {
        // User cancelled or API not available
      }
    }

    // Fallback: load from localStorage
    loadFilesList()
    if (files.value.length > 0) {
      const latest = files.value[files.value.length - 1]
      const savedContent = localStorage.getItem(`inner:file:${latest.path}`)
      currentFile.value = {
        ...latest,
        content: savedContent ?? latest.content,
      }
      isDirty.value = false
    }
  }

  // Initialize: load last file or create new one
  loadFilesList()
  if (files.value.length > 0) {
    const latest = files.value[files.value.length - 1]
    const savedContent = localStorage.getItem(`inner:file:${latest.path}`)
    currentFile.value = {
      ...latest,
      content: savedContent ?? latest.content,
    }
  } else {
    newFile()
  }

  return {
    currentFile,
    files,
    isDirty,
    openFile,
    saveFile,
    newFile,
    setContent,
    getContent,
  }
}
