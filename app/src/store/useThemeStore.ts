import { create } from 'zustand'

type Theme = 'light' | 'dark'

const STORAGE_KEY = 'panlink-theme'

function getSystemTheme(): Theme {
  if (typeof window === 'undefined') {
    return 'light'
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getInitialTheme(): Theme {
  try {
    const theme = localStorage.getItem(STORAGE_KEY)
    if (theme === 'dark' || theme === 'light') {
      return theme
    }
    if (!theme || theme === 'system') {
      return getSystemTheme()
    }
  } catch {
    /* ignore */
  }
  return 'light'
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') {
    return
  }
  const root = document.documentElement
  if (theme === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch { /* ignore */ }
}

interface ThemeStore {
  resolved: Theme
  init: () => void
  toggle: () => void
  setTheme: (theme: Theme) => void
}

export const useThemeStore = create<ThemeStore>()((set) => ({
  resolved: getInitialTheme(),

  init: () => {
    const theme = getInitialTheme()
    applyTheme(theme)
    set({ resolved: theme })
  },

  toggle: () => {
    set((state) => {
      const next = state.resolved === 'dark' ? 'light' : 'dark'
      applyTheme(next)
      return { resolved: next }
    })
  },

  setTheme: (theme) => {
    applyTheme(theme)
    set({ resolved: theme })
  },
}))

// 启动时立即应用主题，避免 FOUC
applyTheme(getInitialTheme())
