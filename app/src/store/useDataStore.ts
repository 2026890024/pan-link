import { create } from 'zustand'
import * as ds from '@/services/dataService'
import type { Category, LinkItem, SubCategory, Tag, DriveType, IconLibraryItem } from '@/services/dataService'

// 默认网盘类型（内联，避免打包 14KB mock 文件）
const DEFAULT_DRIVE_TYPES: DriveType[] = [
  { id: 'baidu', name: '百度网盘', icon: 'hard-drive', color: '#3B82F6' },
  { id: 'quark', name: '夸克网盘', icon: 'hard-drive', color: '#F59E0B' },
  { id: 'ali', name: '阿里云盘', icon: 'hard-drive', color: '#06B6D4' },
  { id: 'lanzou', name: '蓝奏云', icon: 'hard-drive', color: '#10B981' },
  { id: 'xunlei', name: '迅雷云盘', icon: 'hard-drive', color: '#6366F1' },
  { id: '115', name: '115网盘', icon: 'hard-drive', color: '#EC4899' },
]
const DEFAULT_CUSTOM_DRIVE_TYPES: Record<string, { name: string; icon: string; color: string }> = {}


// ============ Store 接口 ============

export type { Category, LinkItem, SubCategory, Tag, DriveType, IconLibraryItem }

interface DataStore {
  // 数据
  categories: Category[]
  links: LinkItem[]
  subCategories: SubCategory[]
  tags: Tag[]
  driveTypes: DriveType[]
  customDriveTypes: Record<string, { name: string; icon: string; color: string }>
  iconLibrary: IconLibraryItem[]

  // 加载状态 - initialized 表示后台数据加载完成
  initialized: boolean
  error: string | null
  cloudSyncError: boolean // 是否云写入失败（数据仅保存在本地）
  lastSyncErrorDetail: string // 最后一次云写入的精确错误详情

  // 初始化（非阻塞：先显示页面，后台静默加载数据）
  initialize: () => void

  // Icon Library
  addIconToLibrary: (name: string, dataUrl: string) => void
  deleteIconFromLibrary: (id: string) => void

  // Categories
  addCategory: (name: string) => Promise<void>
  updateCategory: (id: string, updates: Partial<Category>) => Promise<void>
  deleteCategory: (id: string) => Promise<void>

  // Links
  addLink: (link: Partial<LinkItem> & { name: string; url: string }) => Promise<void>
  updateLink: (id: string, updates: Partial<LinkItem>) => Promise<void>
  deleteLink: (id: string) => Promise<void>
  togglePin: (id: string) => Promise<void>
  toggleFeatured: (id: string) => Promise<void>
  toggleLinkVisibility: (id: string) => Promise<void>
  moveLinkSortOrder: (id: string, direction: 'up' | 'down', categoryId?: string) => Promise<void>
  incrementClicks: (id: string) => Promise<void>

  // SubCategories
  addSubCategory: (categoryId: string, name: string) => Promise<void>
  updateSubCategory: (id: string, updates: Partial<SubCategory>) => Promise<void>
  deleteSubCategory: (id: string) => Promise<void>
  moveSubCategorySortOrder: (id: string, direction: 'up' | 'down', categoryId: string) => Promise<void>
  getSubCategoriesByCategory: (categoryId: string) => SubCategory[]

  // DriveTypes
  addDriveType: (name: string, icon: string, color: string) => void
  updateDriveType: (id: string, updates: Partial<DriveType>) => void
  deleteDriveType: (id: string) => void

  // Tags
  addTag: (name: string, color: string) => Promise<void>
  updateTag: (id: string, updates: Partial<Tag>) => Promise<void>
  deleteTag: (id: string) => Promise<void>
}

// Helper: generate unique slug from name
function generateSlug(name: string, existingSlugs?: string[]): string {
  const base = name.toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .replace(/-+/g, '-') || 'link'
  // 使用时间戳 + 随机数确保唯一性
  const randomSuffix = Math.random().toString(36).substring(2, 6)
  let slug = `${Date.now()}-${randomSuffix}-${base}`.slice(0, 80)
  
  // 如果提供了存量列表，二次确认唯一
  if (existingSlugs) {
    while (existingSlugs.includes(slug)) {
      const r = Math.random().toString(36).substring(2, 6)
      slug = `${Date.now()}-${r}-${base}`.slice(0, 80)
    }
  }
  return slug
}

// ============ localStorage 本地回退 ============

const LS_PREFIX = 'panlink_'

function loadLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return fallback
}

function saveLocal<T>(key: string, data: T): void {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(data))
  } catch { /* quota exceeded */ }
}

function loadLocalLinks(): LinkItem[] {
  return loadLocal<LinkItem[]>('links', [])
}

function saveLocalLinks(links: LinkItem[]): void {
  saveLocal('links', links)
}

function saveLocalItem(key: string, data: unknown): void {
  saveLocal(key, data)
}

// ============ 初始化 ============

// 初始为空数组，统一由 initialize() → reloadAll() 从云端加载真实数据
// 不使用 mock 兜底，确保始终显示真实数据
const initCategories: Category[] = []
const initLinks: LinkItem[] = []
const initSubCategories: SubCategory[] = []

// Helper: 智能合并 - 云端数据是唯一数据源
// 云端有数据时：以云端为准，但保留本地标记为 _pendingSync 的数据（云写入失败时创建的）
// 云端为空时：使用本地数据（离线/首次使用）
// 云端和本地都为空时：使用 fallback（mock 数据兜底，保证首次访问有演示数据）
function mergeLists<T extends { id: string }>(remote: T[], local: T[], fallback: T[] = []): T[] {
  if (remote.length > 0) {
    // 云端有数据 → 云端是唯一数据源
    // 只保留本地被标记为 "pendingSync" 的数据（这些是之前云写入失败的新增数据）
    const pendingItems = local.filter(
      (l: Record<string, unknown>) => (l as Record<string, unknown>)._pendingSync === true
    ) as T[]
    if (pendingItems.length > 0) {
      const remoteIds = new Set(remote.map(r => r.id))
      const trulyPending = pendingItems.filter(p => !remoteIds.has(p.id))
      if (trulyPending.length > 0) {
        console.log(`[DataStore] 合并 ${trulyPending.length} 条待同步本地数据到云端数据`)
        return [...remote, ...trulyPending]
      }
    }
    return remote
  }
  // 云端无数据 → 使用本地数据作为回退
  if (local.length > 0) {
    console.log('[DataStore] 云端无数据，使用本地数据')
    return local
  }
  // 云端和本地都无数据 → fallback（mock 兜底，确保首次访问不显示空白）
  console.log(`[DataStore] 云端和本地均无数据，使用 fallback（${fallback.length} 条）`)
  return fallback
}

// Helper: reload all data from service (非阻塞)
// 优化：分阶段加载，优先渲染核心数据 (categories + links)，延迟加载次要数据
async function reloadAll(set: (partial: Partial<DataStore>) => void, get: () => DataStore) {
  try {
    // 阶段 1: 并行加载核心数据（categories + links）—— 用户最快看到内容
    const [categories, links] = await Promise.all([
      ds.fetchCategories(),
      ds.fetchLinks(),
    ])

    // 获取本地数据用于合并
    const localCats = loadLocal<Category[]>('categories', [])
    const localLinks = loadLocalLinks()

    const mergedCategories = mergeLists(categories, localCats, [])
    const mergedLinks = mergeLists(links, localLinks, [])

    // 先设置核心数据，让页面立即渲染
    set({
      categories: mergedCategories,
      links: mergedLinks,
      initialized: true,
      error: null,
    })

    // 同步核心数据到 localStorage
    saveLocalItem('categories', mergedCategories)
    saveLocalLinks(mergedLinks)

    // 阶段 2: 并行加载次要数据（tags + subcategories + driveTypes）
    // 这些数据不影响首页核心展示，延迟加载可减少首次 API 冷启动压力
    const [tags, subCategories, driveTypes] = await Promise.all([
      ds.fetchTags().catch(() => [] as Tag[]),
      ds.fetchSubCategories().catch(() => [] as SubCategory[]),
      Promise.resolve(ds.fetchDriveTypes()),
    ])

    const localSubs = loadLocal<SubCategory[]>('subcategories', [])
    const mergedSubCategories = mergeLists(subCategories, localSubs)

    set({
      tags: tags.map(t => ({
        ...t,
        user_id: t.user_id || '1',
        created_at: t.created_at || new Date().toISOString(),
        updated_at: t.updated_at || new Date().toISOString(),
      })),
      subCategories: mergedSubCategories,
      driveTypes: [...driveTypes] as DriveType[],
    })

    saveLocalItem('subcategories', mergedSubCategories)

    // 判断云同步状态
    const hasCloudData = categories.length > 0 || links.length > 0
    const hasLocalOnly = localLinks.some(
      (l: Record<string, unknown>) => (l as Record<string, unknown>)._pendingSync === true
    )

    set({ cloudSyncError: !hasCloudData && hasLocalOnly })

    console.log(`[DataStore] 加载完成: ${categories.length} 分类, ${links.length} 链接, ${tags.length} 标签`)
  } catch (err) {
    console.error('[DataStore] reloadAll error:', err)
    // 云端加载失败，使用本地缓存（不再回退到 mock）
    const fallbackLinks = loadLocalLinks()
    const fallbackCats = loadLocal<Category[]>('categories', [])
    set({
      initialized: true,
      error: String(err),
      categories: fallbackCats,
      links: fallbackLinks,
      cloudSyncError: true,
    })
  }
}

// ============ 创建 Store ============

export const useDataStore = create<DataStore>()((set, get) => ({
  // 初始数据：优先 localStorage，其次 mock
  categories: initCategories,
  links: initLinks,
  subCategories: initSubCategories,
  tags: [],
  driveTypes: [...DEFAULT_DRIVE_TYPES] as DriveType[],
  customDriveTypes: { ...DEFAULT_CUSTOM_DRIVE_TYPES },
  iconLibrary: (() => {
    try {
      const raw = localStorage.getItem('panlink_icon_library')
      if (raw) return JSON.parse(raw) as IconLibraryItem[]
    } catch { /* ignore */ }
    return []
  })(),

  initialized: false,
  error: null,
  cloudSyncError: false,
  lastSyncErrorDetail: '',

  // 初始化 - 后台静默加载，不阻塞页面渲染
  initialize: () => {
    // 立即返回，不阻塞 UI
    reloadAll(set, get)
  },

  // ===== Categories =====
  addCategory: async (name) => {
    try {
      const category = await ds.createCategory(name)
      const updated = [...get().categories, category]
      saveLocalItem('categories', updated)
      set(state => ({ categories: updated, cloudSyncError: false }))
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      const errDetail = JSON.stringify(err, null, 2)
      console.error('[DataStore] addCategory 云写入失败，回退到本地存储:', err)
      const categories = get().categories
      const newCat: Category = {
        id: Date.now().toString(), name, icon: 'folder',
        sort_order: categories.length + 1,
      }
      const updated = [...categories, newCat]
      // 回退到 localStorage
      saveLocalItem('categories', updated)
      set({ categories: updated, cloudSyncError: true, lastSyncErrorDetail: `addCategory 失败: ${errMsg}\n${errDetail}` })
    }
  },

  updateCategory: async (id, updates) => {
    try {
      await ds.updateCategoryApi(id, updates)
    } catch { /* 回退 */ }
    const updated = get().categories.map(c => c.id === id ? { ...c, ...updates } : c)
    saveLocalItem('categories', updated)
    set({ categories: updated })
  },

  deleteCategory: async (id) => {
    try {
      await ds.deleteCategoryApi(id)
    } catch { /* 回退 */ }
    const updatedCategories = get().categories.filter(c => c.id !== id)
    saveLocalItem('categories', updatedCategories)
    const updatedLinks = get().links.map(l => l.category_id === id ? { ...l, category_id: '', subcategory_id: '' } : l)
    saveLocalLinks(updatedLinks)
    set({
      categories: updatedCategories,
      links: updatedLinks,
      subCategories: get().subCategories.filter(sc => sc.category_id !== id),
    })
  },

  // ===== Links =====
  addLink: async (linkData) => {
    const currentLinks = get().links
    const maxSort = Math.max(0, ...currentLinks.map(l => l.sort_order || 0))
    const originalCategoryId = linkData.category_id || ''

    const newLink: LinkItem = {
      id: Date.now().toString(),
      name: linkData.name || '',
      title: linkData.name || '',
      description: linkData.description || '',
      url: linkData.url || '',
      drive_type: linkData.drive_type || 'baidu',
      category_id: originalCategoryId,
      subcategory_id: linkData.subcategory_id || '',
      icon: linkData.icon || '',
      icon_size: linkData.icon_size || (linkData.icon ? 'md' : undefined),
      is_pinned: linkData.is_pinned || false,
      is_featured: linkData.is_featured || false,
      click_count: 0,
      registration_count: 0,
      extract_code: linkData.extract_code || '',
      expires_at: linkData.expires_at || null,
      tags: linkData.tags || [],
      keywords: linkData.keywords || [],
      created_at: new Date().toISOString(),
      slug: linkData.slug || generateSlug(linkData.name || '', currentLinks.map(l => l.slug)),
      sort_order: maxSort + 1,
      visible: true,
    }

    // 尝试云写入
    try {
      if (ds.isCloudApiConfigured()) {
        console.log('[DataStore] addLink 尝试云写入:', newLink.name)
        await ds.createLinkApi({
          name: newLink.name,
          slug: newLink.slug,
          url: newLink.url,
          category_id: originalCategoryId,
          extract_code: newLink.extract_code,
          expires_at: newLink.expires_at,
          is_pinned: newLink.is_pinned,
          is_featured: newLink.is_featured,
          drive_type: newLink.drive_type,
          subcategory_id: newLink.subcategory_id,
          icon: newLink.icon,
          icon_size: newLink.icon_size,
          description: newLink.description,
        })
        // 云写入成功 → 从云端重新拉取完整数据（以云端为准）
        const links = await ds.fetchLinks()
        saveLocalLinks(links)
        set({ links, cloudSyncError: false, lastSyncErrorDetail: '' })
        console.log('[DataStore] addLink 云写入成功，云端共', links.length, '条链接')
        return
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      console.error('[DataStore] addLink 云写入失败，回退到本地存储:', errMsg)
      // 云写入失败 → 保存到本地，标记为待同步
      const pendingLink = { ...newLink, _pendingSync: true } as LinkItem & { _pendingSync?: boolean }
      const storage = loadLocalLinks()
      storage.unshift(pendingLink as LinkItem)
      saveLocalLinks(storage)
      set({ 
        links: [pendingLink as LinkItem, ...get().links], 
        cloudSyncError: true,
        lastSyncErrorDetail: `addLink 云写入失败: ${errMsg}`
      })
      return
    }
    
    // 云端未配置 → 纯本地模式
    const storage = loadLocalLinks()
    storage.unshift(newLink)
    saveLocalLinks(storage)
    set({ links: [newLink, ...get().links], cloudSyncError: false })
  },

  updateLink: async (id, updates) => {
    let cloudFailed = false
    try {
      if (ds.isCloudApiConfigured()) {
        const cloudUpdates = { ...updates } as Record<string, unknown>
        await ds.updateLinkApi(id, cloudUpdates)
        // 云写入成功 → 以云端数据为准
        const links = await ds.fetchLinks()
        saveLocalLinks(links)
        set({ links, cloudSyncError: false })
        return
      }
    } catch (err) {
      console.error('[DataStore] updateLink 云写入失败，回退到本地存储:', err)
      cloudFailed = true
    }
    const updatedLinks = get().links.map(l => l.id === id ? { ...l, ...updates } : l)
    saveLocalLinks(updatedLinks)
    set({ links: updatedLinks, cloudSyncError: cloudFailed })
  },

  deleteLink: async (id) => {
    let cloudFailed = false
    try {
      if (ds.isCloudApiConfigured()) {
        await ds.deleteLinkApi(id)
        // 云删除成功 → 以云端数据为准
        const links = await ds.fetchLinks()
        saveLocalLinks(links)
        set({ links, cloudSyncError: false })
        return
      }
    } catch (err) {
      console.error('[DataStore] deleteLink 云写入失败，回退到本地存储:', err)
      cloudFailed = true
    }
    const filteredLinks = get().links.filter(l => l.id !== id)
    saveLocalLinks(filteredLinks)
    set({ links: filteredLinks, cloudSyncError: cloudFailed })
  },

  togglePin: async (id) => {
    const link = get().links.find(l => l.id === id)
    if (!link) return
    try {
      if (ds.isCloudApiConfigured()) {
        await ds.updateLinkApi(id, { is_pinned: !link.is_pinned })
        const links = await ds.fetchLinks()
        set({ links, cloudSyncError: false })
        return
      }
    } catch (err) { console.error('[DataStore] togglePin 云API失败:', err) }
    const updated = get().links.map(l => l.id === id ? { ...l, is_pinned: !l.is_pinned } : l)
    saveLocalLinks(updated)
    set({ links: updated })
  },

  toggleFeatured: async (id) => {
    const link = get().links.find(l => l.id === id)
    if (!link) return
    try {
      if (ds.isCloudApiConfigured()) {
        await ds.updateLinkApi(id, { is_featured: !link.is_featured })
        const links = await ds.fetchLinks()
        set({ links, cloudSyncError: false })
        return
      }
    } catch (err) { console.error('[DataStore] toggleFeatured 云API失败:', err) }
    const updated = get().links.map(l => l.id === id ? { ...l, is_featured: !l.is_featured } : l)
    saveLocalLinks(updated)
    set({ links: updated })
  },

  toggleLinkVisibility: async (id) => {
    const link = get().links.find(l => l.id === id)
    if (!link) return
    const newVisible = !link.visible
    try {
      if (ds.isCloudApiConfigured()) {
        await ds.updateLinkApi(id, { visible: newVisible })
        const links = await ds.fetchLinks()
        set({ links, cloudSyncError: false })
        return
      }
    } catch (err) { console.error('[DataStore] toggleLinkVisibility 云API失败:', err) }
    const updated = get().links.map(l => l.id === id ? { ...l, visible: newVisible } : l)
    saveLocalLinks(updated)
    set({ links: updated })
  },

  moveLinkSortOrder: async (id, direction, categoryId) => {
    const links = get().links
    const targetLink = links.find(l => l.id === id)
    if (!targetLink) return

    // 获取同分类下的链接，按 sort_order 排序
    const siblings = links
      .filter(l => categoryId ? l.category_id === categoryId : l.category_id === targetLink.category_id)
      .sort((a, b) => a.sort_order - b.sort_order)

    const currentIndex = siblings.findIndex(l => l.id === id)
    if (currentIndex === -1) return

    const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (swapIndex < 0 || swapIndex >= siblings.length) return

    const swapLink = siblings[swapIndex]
    const newSortOrder = swapLink.sort_order
    const swapNewSortOrder = targetLink.sort_order

    try {
      if (ds.isCloudApiConfigured()) {
        await Promise.all([
          ds.updateLinkApi(id, { sort_order: newSortOrder }),
          ds.updateLinkApi(swapLink.id, { sort_order: swapNewSortOrder }),
        ])
        const refreshedLinks = await ds.fetchLinks()
        set({ links: refreshedLinks })
        return
      }
    } catch (err) { console.error('[DataStore] moveLinkSortOrder 云API失败:', err) }

    const updatedLinks = get().links.map(l => {
        if (l.id === id) return { ...l, sort_order: newSortOrder }
        if (l.id === swapLink.id) return { ...l, sort_order: swapNewSortOrder }
        return l
      })
    saveLocalLinks(updatedLinks)
    set({ links: updatedLinks })
  },

  incrementClicks: async (id) => {
    try {
      if (ds.isCloudApiConfigured()) {
        await ds.incrementLinkClicks(id)
      }
    } catch { /* ignore */ }
    set({
      links: get().links.map(l => l.id === id ? { ...l, click_count: l.click_count + 1 } : l),
    })
  },

  // ===== SubCategories =====
  addSubCategory: async (categoryId, name) => {
    try {
      const sub = await ds.addSubCategoryApi(categoryId, name)
      set({ subCategories: [...get().subCategories, sub] })
    } catch {
      const subCategories = get().subCategories
      const existing = subCategories.filter(sc => sc.category_id === categoryId)
      set({
        subCategories: [...subCategories, {
          id: Date.now().toString(), category_id: categoryId, name,
          sort_order: existing.length + 1,
        }],
      })
    }
  },

  updateSubCategory: async (id, updates) => {
    set({
      subCategories: get().subCategories.map(sc => sc.id === id ? { ...sc, ...updates } : sc),
    })
  },

  deleteSubCategory: async (id) => {
    try {
      await ds.deleteSubCategoryApi(id)
    } catch { /* ignore */ }
    set({
      subCategories: get().subCategories.filter(sc => sc.id !== id),
      links: get().links.map(l => l.subcategory_id === id ? { ...l, subcategory_id: '' } : l),
    })
  },

  moveSubCategorySortOrder: async (id, direction, categoryId) => {
    const scs = get().subCategories
    const siblings = scs
      .filter(sc => sc.category_id === categoryId)
      .sort((a, b) => a.sort_order - b.sort_order)
    const currentIndex = siblings.findIndex(sc => sc.id === id)
    if (currentIndex === -1) return

    const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (swapIndex < 0 || swapIndex >= siblings.length) return

    const swapSc = siblings[swapIndex]
    const currentSort = siblings[currentIndex].sort_order
    const swapSort = swapSc.sort_order

    set({
      subCategories: get().subCategories.map(sc => {
        if (sc.id === id) return { ...sc, sort_order: swapSort }
        if (sc.id === swapSc.id) return { ...sc, sort_order: currentSort }
        return sc
      }),
    })
  },

  getSubCategoriesByCategory: (categoryId) => {
    return get().subCategories.filter(sc => sc.category_id === categoryId).sort((a, b) => a.sort_order - b.sort_order)
  },

  // ===== DriveTypes =====
  addDriveType: (name, icon, color) => {
    try {
      const dt = ds.addDriveTypeApi(name, icon, color)
      set({ driveTypes: [...get().driveTypes, dt] })
    } catch {
      set({
        driveTypes: [...get().driveTypes, {
          id: `custom-${Date.now()}`, name, icon, color,
        }],
      })
    }
  },

  updateDriveType: (id, updates) => {
    set({
      driveTypes: get().driveTypes.map(dt => dt.id === id ? { ...dt, ...updates } : dt),
    })
  },

  deleteDriveType: (id) => {
    try { ds.deleteDriveTypeApi(id) } catch { /* ignore */ }
    set({ driveTypes: get().driveTypes.filter(dt => dt.id !== id) })
  },

  // ===== Tags =====
  addTag: async (name, color) => {
    try {
      const tag = await ds.createTagApi(name, color)
      set({ tags: [...get().tags, tag] })
    } catch {
      const now = new Date().toISOString()
      set({
        tags: [...get().tags, {
          id: Date.now().toString(), user_id: '1', name, color,
          created_at: now, updated_at: now,
        }],
      })
    }
  },

  updateTag: async (id, updates) => {
    set({
      tags: get().tags.map(t => t.id === id ? { ...t, ...updates, updated_at: new Date().toISOString() } : t),
    })
  },

  deleteTag: async (id) => {
    try {
      await ds.deleteTagApi(id)
    } catch { /* ignore */ }
    set({
      tags: get().tags.filter(t => t.id !== id),
      links: get().links.map(l => ({
        ...l,
        tags: l.tags.filter(t => t.id !== id),
      })),
    })
  },

  // ===== Icon Library =====
  addIconToLibrary: (name, dataUrl) => {
    const newIcon: IconLibraryItem = {
      id: `icon-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: name || '未命名图标',
      dataUrl,
      size: dataUrl.length,
      created_at: new Date().toISOString(),
    }
    const updated = [...get().iconLibrary, newIcon]
    try { localStorage.setItem('panlink_icon_library', JSON.stringify(updated)) } catch { /* quota exceeded */ }
    set({ iconLibrary: updated })
  },

  deleteIconFromLibrary: (id) => {
    const updated = get().iconLibrary.filter(i => i.id !== id)
    try { localStorage.setItem('panlink_icon_library', JSON.stringify(updated)) } catch { /* quota exceeded */ }
    // 同时清除所有使用该图标的链接的 icon 字段
    const updatedLinks = get().links.map(l =>
      l.icon && l.icon === get().iconLibrary.find(i => i.id === id)?.dataUrl
        ? { ...l, icon: '' }
        : l
    )
    saveLocalLinks(updatedLinks)
    set({ iconLibrary: updated, links: updatedLinks })
  },
}))
