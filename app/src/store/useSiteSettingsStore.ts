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
  settings: {
    current_logo_type: 'text',
    current_logo_text: 'Pan Link',
    current_logo_url: '',
    logo_library: [],
    current_colors: DEFAULT_COLORS,
    color_history: [],
    site_name: '资源云',
    site_description: '一站式网盘资源聚合管理平台',
  },
  loaded: false,

  loadSettings: async () => {
    try {
      const settings = await ds.fetchSiteSettings()
      set({
        settings: {
          current_logo_type: settings.current_logo_type || 'text',
          current_logo_text: settings.current_logo_text || 'Pan Link',
          current_logo_url: settings.current_logo_url || '',
          logo_library: settings.logo_library || [],
          current_colors: settings.current_colors || DEFAULT_COLORS,
          color_history: settings.color_history || [],
          site_name: settings.site_name || '资源云',
          site_description: settings.site_description || '一站式网盘资源聚合管理平台',
        },
        loaded: true,
      })
    } catch {
      set({ loaded: true })
    }
  },

  // ===== Logo =====

  setLogoType: async (type) => {
    const settings = { ...get().settings, current_logo_type: type }
    set({ settings })
    await ds.updateSiteSettings({ current_logo_type: type })
  },

  setLogoText: async (text) => {
    const settings = { ...get().settings, current_logo_text: text }
    set({ settings })
    await ds.updateSiteSettings({ current_logo_text: text })
  },

  setLogoUrl: async (url) => {
    const settings = { ...get().settings, current_logo_url: url }
    set({ settings })
    await ds.updateSiteSettings({ current_logo_url: url })
  },

  addLogo: async (url, name) => {
    const library = await ds.addLogoToLibrary(url, name)
    set({ settings: { ...get().settings, logo_library: library } })
  },

  removeLogo: async (index) => {
    const library = await ds.deleteLogoFromLibrary(index)
    set({ settings: { ...get().settings, logo_library: library } })
  },

  selectLogo: async (index) => {
    const { settings } = get()
    const logo = settings.logo_library?.[index]
    if (logo) {
      const updated = { ...settings, current_logo_type: 'image' as const, current_logo_url: logo.url }
      set({ settings: updated })
      await ds.updateSiteSettings({
        current_logo_type: 'image',
        current_logo_url: logo.url,
      })
    }
  },

  // ===== Colors =====

  updateColors: async (colors) => {
    const settings = { ...get().settings, current_colors: colors }
    set({ settings })
    await ds.updateSiteSettings({ current_colors: colors })
  },

  saveColorScheme: async (name) => {
    const { settings } = get()
    const scheme: ColorScheme = {
      name,
      ...settings.current_colors!,
      saved_at: new Date().toISOString(),
    }
    const history = [...(settings.color_history || []), scheme]
    const updated = { ...settings, color_history: history }
    set({ settings: updated })
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
      await ds.updateSiteSettings({ current_colors: colors })
    }
  },

  deleteColorScheme: async (index) => {
    const { settings } = get()
    const history = (settings.color_history || []).filter((_, i) => i !== index)
    const updated = { ...settings, color_history: history }
    set({ settings: updated })
    await ds.updateSiteSettings({ color_history: history })
  },

  // ===== Site Info =====

  setSiteName: async (name) => {
    const settings = { ...get().settings, site_name: name }
    set({ settings })
    await ds.updateSiteSettings({ site_name: name })
  },

  setSiteDescription: async (desc) => {
    const settings = { ...get().settings, site_description: desc }
    set({ settings })
    await ds.updateSiteSettings({ site_description: desc })
  },

  getCurrentColors: () => {
    return get().settings.current_colors || DEFAULT_COLORS
  },
}))
