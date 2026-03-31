import { ref, watch } from 'vue'

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'inner:theme'

// Singleton state — shared across all consumers
const theme = ref<Theme>(
  (localStorage.getItem(STORAGE_KEY) as Theme) || 'dark'
)

function applyTheme(t: Theme) {
  document.documentElement.setAttribute('data-theme', t)
  // Update meta color-scheme for native elements (scrollbars, form inputs, etc.)
  const meta = document.querySelector('meta[name="color-scheme"]')
  if (meta) meta.setAttribute('content', t)
}

// Apply immediately on module load (prevents flash)
applyTheme(theme.value)

watch(theme, (t) => {
  localStorage.setItem(STORAGE_KEY, t)
  applyTheme(t)
})

export function useTheme() {
  function toggle() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
  }

  function setTheme(t: Theme) {
    theme.value = t
  }

  return {
    theme,
    toggle,
    setTheme,
    isDark: () => theme.value === 'dark',
  }
}
