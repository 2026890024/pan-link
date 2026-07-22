import { create } from 'zustand'
import * as ds from '@/services/dataService'
import type { SiteSettings, LogoItem, ColorScheme } from '@/services/dataService'

export type { SiteSettings, LogoItem, ColorScheme }

// 默认配色
const DEFAULT_COLORS = {
  primary: '#6366F1',
  secondary: '#818CF8',
  accent: '#A5B4FC',
  lightest: '#F5F3FF',
  darkest: '#1E1B4B',
}

// ── localStorage 缓存（和 useDataStore 统一）──
const SETTINGS_KEY = 'panlink_site_settings'

function loadCachedSettings(): SiteSettings | null {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {return JSON.parse(raw)}
  } catch { /* ignore */ }
  return null
}

function saveCachedSettings(settings: SiteSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch { /* quota exceeded */ }
}

// 默认初始设置
const DEFAULT_SETTINGS: SiteSettings = {
  current_logo_type: 'text',
  current_logo_text: 'Pan Link',
  current_logo_url: '',
  logo_library: [],
  current_favicon_url: '/favicon.png',
  favicon_library: [],
  current_colors: DEFAULT_COLORS,
  color_history: [],
  site_name: '资源云',
  site_description: '一站式网盘资源聚合管理平台',
}

// 启动时优先用 localStorage 缓存，确保 Logo 和数据内容同步显示
const cached = loadCachedSettings()
const hasCache = cached !== null

interface SiteSettingsStore {
  // 数据
  settings: SiteSettings
  loaded: boolean

  // 初始化
  loadSettings: () => Promise<void>

  // Logo 操作
  setLogoType: (type: 'text' | 'image') => Promise<void>
  setLogoText: (text: string) => Promise<void>
  setLogoUrl: (url: string) => Promise<void>
  addLogo: (url: string, name: string) => Promise<void>
  removeLogo: (index: number) => Promise<void>
  selectLogo: (index: number) => Promise<void>

  // Favicon 操作
  addFavicon: (url: string, name: string) => Promise<void>
  removeFavicon: (index: number) => Promise<void>
  selectFavicon: (index: number) => Promise<void>

  // 颜色操作
  updateColors: (colors: typeof DEFAULT_COLORS) => Promise<void>
  saveColorScheme: (name: string) => Promise<void>
  applyColorScheme: (index: number) => Promise<void>
  deleteColorScheme: (index: number) => Promise<void>

  // 站点名称
  setSiteName: (name: string) => Promise<void>
  setSiteDescription: (desc: string) => Promise<void>

  // 获取当前配色方案
  getCurrentColors: () => typeof DEFAULT_COLORS
}

export const useSiteSettingsStore = create<SiteSettingsStore>()((set, get) => ({
  // 👇 如果有缓存，立即恢复（Logo 不再延迟出现）
  settings: hasCache
    ? { ...DEFAULT_SETTINGS, ...cached }
    : DEFAULT_SETTINGS,
  loaded: hasCache, // 有缓存就直接显示，不等 API

  loadSettings: async () => {
    try {
      const settings = await ds.fetchSiteSettings()
      const merged: SiteSettings = {
        ...settings, // 保留所有云端字段（homepage_show_featured、homepage_category_visibility 等）
        current_logo_type: settings.current_logo_type || DEFAULT_SETTINGS.current_logo_type,
        current_logo_text: settings.current_logo_text || DEFAULT_SETTINGS.current_logo_text,
        current_logo_url: settings.current_logo_url || DEFAULT_SETTINGS.current_logo_url,
        logo_library: settings.logo_library || [],
        current_favicon_url: settings.current_favicon_url || DEFAULT_SETTINGS.current_favicon_url,
        favicon_library: settings.favicon_library || [],
        current_colors: settings.current_colors || DEFAULT_COLORS,
        color_history: settings.color_history || [],
        site_name: settings.site_name || DEFAULT_SETTINGS.site_name,
        site_description: settings.site_description || DEFAULT_SETTINGS.site_description,
      }
      // 持久化到 localStorage，下次打开瞬间恢复
      saveCachedSettings(merged)
      set({ settings: merged, loaded: true })
    } catch {
      // API 失败也不影响，有缓存就用缓存
      set({ loaded: true })
    }
  },

  // ===== Logo =====

  setLogoType: async (type) => {
    const settings = { ...get().settings, current_logo_type: type }
    set({ settings })
    saveCachedSettings(settings)
    await ds.updateSiteSettings({ current_logo_type: type })
  },

  setLogoText: async (text) => {
    const settings = { ...get().settings, current_logo_text: text }
    set({ settings })
    saveCachedSettings(settings)
    await ds.updateSiteSettings({ current_logo_text: text })
  },

  setLogoUrl: async (url) => {
    const settings = { ...get().settings, current_logo_url: url }
    set({ settings })
    saveCachedSettings(settings)
    await ds.updateSiteSettings({ current_logo_url: url })
  },

  addLogo: async (url, name) => {
    const library = await ds.addLogoToLibrary(url, name)
    const settings = { ...get().settings, logo_library: library }
    set({ settings })
    saveCachedSettings(settings)
  },

  removeLogo: async (index) => {
    const library = await ds.deleteLogoFromLibrary(index)
    const settings = { ...get().settings, logo_library: library }
    set({ settings })
    saveCachedSettings(settings)
  },

  selectLogo: async (index) => {
    const { settings } = get()
    const logo = settings.logo_library?.[index]
    if (logo) {
      const updated = { ...settings, current_logo_type: 'image' as const, current_logo_url: logo.url }
      set({ settings: updated })
      saveCachedSettings(updated)
      await ds.updateSiteSettings({
        current_logo_type: 'image',
        current_logo_url: logo.url,
      })
    }
  },

  // ===== Favicon =====

  addFavicon: async (url, name) => {
    const library = await ds.addFaviconToLibrary(url, name)
    const settings = { ...get().settings, favicon_library: library, current_favicon_url: url }
    set({ settings })
    saveCachedSettings(settings)
  },

  removeFavicon: async (index) => {
    const { settings } = get()
    const target = settings.favicon_library?.[index]
    const library = await ds.deleteFaviconFromLibrary(index)
    const updated: SiteSettings = {
      ...settings,
      favicon_library: library,
      current_favicon_url: target && settings.current_favicon_url === target.url
        ? '/favicon.png'
        : settings.current_favicon_url,
    }
    set({ settings: updated })
    saveCachedSettings(updated)
  },

  selectFavicon: async (index) => {
    const { settings } = get()
    const item = settings.favicon_library?.[index]
    if (item) {
      const updated = { ...settings, current_favicon_url: item.url }
      set({ settings: updated })
      saveCachedSettings(updated)
      await ds.updateSiteSettings({ current_favicon_url: item.url })
    }
  },

  // ===== Colors =====

  updateColors: async (colors) => {
    const settings = { ...get().settings, current_colors: colors }
    set({ settings })
    saveCachedSettings(settings)
    await ds.updateSiteSettings({ current_colors: colors })
  },

  saveColorScheme: async (name) => {
    const { settings } = get()
    const scheme: ColorScheme = {
      name,
      ...(settings.current_colors ?? DEFAULT_COLORS),
      saved_at: new Date().toISOString(),
    }
    const history = [...(settings.color_history || []), scheme]
    const updated = { ...settings, color_history: history }
    set({ settings: updated })
    saveCachedSettings(updated)
    await ds.updateSiteSettings({ color_history: history })
  },

  applyColorScheme: async (index) => {
    const { settings } = get()
    const scheme = settings.color_history?.[index]
    if (scheme) {
      const colors = {
        primary: scheme.primary,
        secondary: scheme.secondary,
        accent: scheme.accent,
        lightest: scheme.lightest,
        darkest: scheme.darkest,
      }
      const updated = { ...settings, current_colors: colors }
      set({ settings: updated })
      saveCachedSettings(updated)
      await ds.updateSiteSettings({ current_colors: colors })
    }
  },

  deleteColorScheme: async (index) => {
    const { settings } = get()
    const history = (settings.color_history || []).filter((_, i) => i !== index)
    const updated = { ...settings, color_history: history }
    set({ settings: updated })
    saveCachedSettings(updated)
    await ds.updateSiteSettings({ color_history: history })
  },

  // ===== Site Info =====

  setSiteName: async (name) => {
    const settings = { ...get().settings, site_name: name }
    set({ settings })
    saveCachedSettings(settings)
    await ds.updateSiteSettings({ site_name: name })
  },

  setSiteDescription: async (desc) => {
    const settings = { ...get().settings, site_description: desc }
    set({ settings })
    saveCachedSettings(settings)
    await ds.updateSiteSettings({ site_description: desc })
  },

  getCurrentColors: () => {
    return get().settings.current_colors || DEFAULT_COLORS
  },
}))
