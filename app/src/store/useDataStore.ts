import { create } from 'zustand'
import { mockCategories, mockLinks, mockSubCategories, mockTags, driveTypes, customDriveTypes } from '@/data/mock'
import * as ds from '@/services/dataService'
import type { Category, LinkItem, SubCategory, Tag, DriveType } from '@/services/dataService'

// ============ Store 接口 ============

export type { Category, LinkItem, SubCategory, Tag, DriveType }

interface DataStore {
  // 数据
  categories: Category[]
  links: LinkItem[]
  subCategories: SubCategory[]
  tags: Tag[]
  driveTypes: DriveType[]
  customDriveTypes: Record<string, { name: string; icon: string; color: string }>

  // 加载状态 - initialized 表示后台数据加载完成
  initialized: boolean
  error: string | null
  cloudSyncError: boolean // 是否 Supabase 写入失败（数据仅保存在本地）

  // 初始化（非阻塞：先显示页面，后台静默加载数据）
  initialize: () => void

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
  return loadLocal<LinkItem[]>('links', mockLinks as LinkItem[])
}

function saveLocalLinks(links: LinkItem[]): void {
  saveLocal('links', links)
}

function saveLocalItem(key: string, data: unknown): void {
  saveLocal(key, data)
}

// ============ 初始化 ============

// 优先从 localStorage 恢复数据（持久化），其次使用 mock 数据
const initCategories: Category[] = loadLocal<Category[]>('categories', mockCategories as Category[])
const initLinks: LinkItem[] = loadLocalLinks()
const initSubCategories: SubCategory[] = loadLocal<SubCategory[]>('subcategories', mockSubCategories as SubCategory[])

// Helper: 智能合并 - Supabase 数据优先，但保留本地独有的新增数据
function mergeLists<T extends { id: string }>(remote: T[], local: T[]): T[] {
  const remoteIds = new Set(remote.map(r => r.id))
  const localOnly = local.filter(l => !remoteIds.has(l.id))
  // 如果本地有比远程多的数据（新增但写 Supabase 失败），合并进来
  if (localOnly.length > 0) {
    console.log(`[DataStore] 合并 ${localOnly.length} 条本地独有数据到远程数据中`)
  }
  return [...remote, ...localOnly]
}

// Helper: reload all data from service (非阻塞)
async function reloadAll(set: (partial: Partial<DataStore>) => void) {
  try {
    const [categories, links, subCategories, tags, driveTypes] = await Promise.all([
      ds.fetchCategories(),
      ds.fetchLinks(),
      ds.fetchSubCategories(),
      ds.fetchTags(),
      Promise.resolve(ds.fetchDriveTypes()),
    ])
    
    // 获取之前的本地数据，合并本地独有条目（这些可能是 Supabase 写入失败后仅存本地的新增数据）
    const localCats = loadLocal<Category[]>('categories', [])
    const localLinks = loadLocalLinks()
    const localSubs = loadLocal<SubCategory[]>('subcategories', [])
    
    // 合并：Supabase 数据 + 本地独有的新数据
    const mergedCategories = mergeLists(categories, localCats)
    const mergedLinks = mergeLists(links, localLinks)
    const mergedSubCategories = mergeLists(subCategories, localSubs)
    
    // 同步到 localStorage 作为本地缓存
    saveLocalItem('categories', mergedCategories)
    saveLocalLinks(mergedLinks)
    saveLocalItem('subcategories', mergedSubCategories)
    
    const hasLocalOnly = localCats.length > categories.length || localLinks.length > links.length
    set({ 
      categories: mergedCategories, 
      links: mergedLinks, 
      subCategories: mergedSubCategories, 
      tags, driveTypes, 
      initialized: true, 
      error: null, 
      cloudSyncError: hasLocalOnly // 如果有本地独有数据，说明之前 Supabase 写入失败了
    })
  } catch (err) {
    console.error('[DataStore] reloadAll error:', err)
    // 即使失败也不阻塞页面，用户仍能看到 localStorage/mock 数据
    set({ initialized: false, error: String(err) })
  }
}

// ============ 创建 Store ============

export const useDataStore = create<DataStore>()((set, get) => ({
  // 初始数据：优先 localStorage，其次 mock
  categories: initCategories,
  links: initLinks,
  subCategories: initSubCategories,
  tags: mockTags.map(t => ({
    ...t,
    user_id: t.user_id || '1',
    created_at: t.created_at || new Date().toISOString(),
    updated_at: t.updated_at || new Date().toISOString(),
  })),
  driveTypes: [...driveTypes] as DriveType[],
  customDriveTypes: { ...customDriveTypes },

  loading: false,
  initialized: false,
  error: null,
  cloudSyncError: false,

  // 初始化 - 后台静默加载，不阻塞页面渲染
  initialize: () => {
    // 立即返回，不阻塞 UI
    reloadAll(set)
  },

  // ===== Categories =====
  addCategory: async (name) => {
    try {
      const category = await ds.createCategory(name)
      const updated = [...get().categories, category]
      saveLocalItem('categories', updated)
      set(state => ({ categories: updated, cloudSyncError: false }))
    } catch (err) {
      console.error('[DataStore] addCategory Supabase 写入失败，回退到本地存储:', err)
      const categories = get().categories
      const newCat: Category = {
        id: Date.now().toString(), name, icon: 'folder',
        sort_order: categories.length + 1,
      }
      const updated = [...categories, newCat]
      // 回退到 localStorage
      saveLocalItem('categories', updated)
      set({ categories: updated, cloudSyncError: true })
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
    // 确保 category_id 是有效 UUID（否则 Supabase 会拒绝）
    const catId = linkData.category_id || ''
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(catId)
    const finalCategoryId = isUuid ? catId : ''

    const newLink: LinkItem = {
      id: Date.now().toString(),
      name: linkData.name || '',
      title: linkData.name || '',
      description: linkData.description || '',
      url: linkData.url || '',
      drive_type: linkData.drive_type || 'baidu',
      category_id: finalCategoryId,
      subcategory_id: linkData.subcategory_id || '',
      icon: linkData.icon || '',
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

    let supabaseFailed = false
    try {
      if (ds.isSupabaseConfigured()) {
        await ds.createLinkApi({
          name: newLink.name,
          slug: newLink.slug,
          url: newLink.url,
          category_id: finalCategoryId || null,
          extract_code: newLink.extract_code,
          expires_at: newLink.expires_at,
          is_pinned: newLink.is_pinned,
          is_featured: newLink.is_featured,
          drive_type: newLink.drive_type,
          subcategory_id: newLink.subcategory_id,
          icon: newLink.icon,
          description: newLink.description,
        })
        const links = await ds.fetchLinks()
        // 同步到 localStorage 作为缓存，确保刷新不丢失
        saveLocalLinks(links)
        set({ links, cloudSyncError: false })
        return
      }
    } catch (err) {
      console.error('[DataStore] addLink Supabase 写入失败，回退到本地存储:', err)
      supabaseFailed = true
    }
    // 回退：存到 localStorage
    const storage = loadLocalLinks()
    storage.unshift(newLink)
    saveLocalLinks(storage)
    set({ links: [newLink, ...get().links], cloudSyncError: supabaseFailed })
  },

  updateLink: async (id, updates) => {
    let supabaseFailed = false
    try {
      if (ds.isSupabaseConfigured()) {
        // 确保 category_id 是有效 UUID
        const supabaseUpdates = { ...updates } as Record<string, unknown>
        if (supabaseUpdates.category_id) {
          const catId = String(supabaseUpdates.category_id)
          if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(catId)) {
            delete supabaseUpdates.category_id // 非 UUID，不传给 Supabase
          }
        }
        await ds.updateLinkApi(id, supabaseUpdates)
        const links = await ds.fetchLinks()
        set({ links, cloudSyncError: false })
        return
      }
    } catch (err) {
      console.error('[DataStore] updateLink Supabase 写入失败，回退到本地存储:', err)
      supabaseFailed = true
    }
    const updatedLinks = get().links.map(l => l.id === id ? { ...l, ...updates } : l)
    saveLocalLinks(updatedLinks)
    set({ links: updatedLinks, cloudSyncError: supabaseFailed || get().cloudSyncError })
  },

  deleteLink: async (id) => {
    let supabaseFailed = false
    try {
      await ds.deleteLinkApi(id)
    } catch (err) {
      console.error('[DataStore] deleteLink Supabase 写入失败，回退到本地存储:', err)
      supabaseFailed = true
    }
    const filteredLinks = get().links.filter(l => l.id !== id)
    saveLocalLinks(filteredLinks)
    set({ links: filteredLinks, cloudSyncError: supabaseFailed || get().cloudSyncError })
  },

  togglePin: async (id) => {
    const link = get().links.find(l => l.id === id)
    if (!link) return
    try {
      if (ds.isSupabaseConfigured()) {
        await ds.updateLinkApi(id, { is_pinned: !link.is_pinned })
        const links = await ds.fetchLinks()
        set({ links, cloudSyncError: false })
        return
      }
    } catch (err) { console.error('[DataStore] togglePin Supabase 失败:', err) }
    const updated = get().links.map(l => l.id === id ? { ...l, is_pinned: !l.is_pinned } : l)
    saveLocalLinks(updated)
    set({ links: updated })
  },

  toggleFeatured: async (id) => {
    const link = get().links.find(l => l.id === id)
    if (!link) return
    try {
      if (ds.isSupabaseConfigured()) {
        await ds.updateLinkApi(id, { is_featured: !link.is_featured })
        const links = await ds.fetchLinks()
        set({ links, cloudSyncError: false })
        return
      }
    } catch (err) { console.error('[DataStore] toggleFeatured Supabase 失败:', err) }
    const updated = get().links.map(l => l.id === id ? { ...l, is_featured: !l.is_featured } : l)
    saveLocalLinks(updated)
    set({ links: updated })
  },

  toggleLinkVisibility: async (id) => {
    const link = get().links.find(l => l.id === id)
    if (!link) return
    const newVisible = !link.visible
    try {
      if (ds.isSupabaseConfigured()) {
        await ds.updateLinkApi(id, { visible: newVisible })
        const links = await ds.fetchLinks()
        set({ links, cloudSyncError: false })
        return
      }
    } catch (err) { console.error('[DataStore] toggleLinkVisibility Supabase 失败:', err) }
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
      if (ds.isSupabaseConfigured()) {
        await Promise.all([
          ds.updateLinkApi(id, { sort_order: newSortOrder }),
          ds.updateLinkApi(swapLink.id, { sort_order: swapNewSortOrder }),
        ])
        const refreshedLinks = await ds.fetchLinks()
        set({ links: refreshedLinks })
        return
      }
    } catch (err) { console.error('[DataStore] moveLinkSortOrder Supabase 失败:', err) }

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
      if (ds.isSupabaseConfigured()) {
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
}))
