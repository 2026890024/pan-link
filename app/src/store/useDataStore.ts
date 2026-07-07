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
    set({ categories, links, subCategories, tags, driveTypes, initialized: true, error: null })
  } catch (err) {
    console.error('[DataStore] reloadAll error:', err)
    // 即使失败也不阻塞页面，用户仍能看到 mock 数据
    set({ initialized: false, error: String(err) })
  }
}

// ============ 创建 Store ============

export const useDataStore = create<DataStore>()((set, get) => ({
  // 初始数据 (localStorage fallback)
  categories: [...mockCategories],
  links: [...mockLinks],
  subCategories: [...mockSubCategories],
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

  // 初始化 - 后台静默加载，不阻塞页面渲染
  initialize: () => {
    // 立即返回，不阻塞 UI
    reloadAll(set)
  },

  // ===== Categories =====
  addCategory: async (name) => {
    try {
      const category = await ds.createCategory(name)
      set(state => ({ categories: [...state.categories, category] }))
    } catch (err) {
      console.error('[DataStore] addCategory error:', err)
      // 回退到本地
      const categories = get().categories
      const newCat: Category = {
        id: Date.now().toString(), name, icon: 'folder',
        sort_order: categories.length + 1,
      }
      set({ categories: [...categories, newCat] })
    }
  },

  updateCategory: async (id, updates) => {
    try {
      await ds.updateCategoryApi(id, updates)
    } catch { /* 回退 */ }
    set({
      categories: get().categories.map(c => c.id === id ? { ...c, ...updates } : c),
    })
  },

  deleteCategory: async (id) => {
    try {
      await ds.deleteCategoryApi(id)
    } catch { /* 回退 */ }
    set({
      categories: get().categories.filter(c => c.id !== id),
      links: get().links.map(l => l.category_id === id ? { ...l, category_id: '', subcategory_id: '' } : l),
      subCategories: get().subCategories.filter(sc => sc.category_id !== id),
    })
  },

  // ===== Links =====
  addLink: async (linkData) => {
    const currentLinks = get().links
    const maxSort = Math.max(0, ...currentLinks.map(l => l.sort_order || 0))
    const newLink: LinkItem = {
      id: Date.now().toString(),
      name: linkData.name || '',
      title: linkData.name || '',
      description: linkData.description || '',
      url: linkData.url || '',
      drive_type: linkData.drive_type || 'baidu',
      category_id: linkData.category_id || '',
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

    try {
      if (ds.isSupabaseConfigured()) {
        await ds.createLinkApi({
          name: newLink.name,
          slug: newLink.slug,
          url: newLink.url,
          category_id: newLink.category_id,
          extract_code: newLink.extract_code,
          expires_at: newLink.expires_at,
          is_pinned: newLink.is_pinned,
          is_featured: newLink.is_featured,
          drive_type: newLink.drive_type,
          subcategory_id: newLink.subcategory_id,
          icon: newLink.icon,
          description: newLink.description,
        })
        // 刷新列表
        const links = await ds.fetchLinks()
        set({ links })
        return
      }
    } catch (err) {
      console.error('[DataStore] addLink error:', err)
    }
    set({ links: [newLink, ...get().links] })
  },

  updateLink: async (id, updates) => {
    try {
      if (ds.isSupabaseConfigured()) {
        await ds.updateLinkApi(id, updates as Record<string, unknown>)
        const links = await ds.fetchLinks()
        set({ links })
        return
      }
    } catch (err) {
      console.error('[DataStore] updateLink error:', err)
    }
    set({
      links: get().links.map(l => l.id === id ? { ...l, ...updates } : l),
    })
  },

  deleteLink: async (id) => {
    try {
      await ds.deleteLinkApi(id)
    } catch (err) {
      console.error('[DataStore] deleteLink error:', err)
    }
    set({ links: get().links.filter(l => l.id !== id) })
  },

  togglePin: async (id) => {
    const link = get().links.find(l => l.id === id)
    if (!link) return
    try {
      if (ds.isSupabaseConfigured()) {
        await ds.updateLinkApi(id, { is_pinned: !link.is_pinned })
        const links = await ds.fetchLinks()
        set({ links })
        return
      }
    } catch (err) { console.error(err) }
    set({
      links: get().links.map(l => l.id === id ? { ...l, is_pinned: !l.is_pinned } : l),
    })
  },

  toggleFeatured: async (id) => {
    const link = get().links.find(l => l.id === id)
    if (!link) return
    try {
      if (ds.isSupabaseConfigured()) {
        await ds.updateLinkApi(id, { is_featured: !link.is_featured })
        const links = await ds.fetchLinks()
        set({ links })
        return
      }
    } catch (err) { console.error(err) }
    set({
      links: get().links.map(l => l.id === id ? { ...l, is_featured: !l.is_featured } : l),
    })
  },

  toggleLinkVisibility: async (id) => {
    const link = get().links.find(l => l.id === id)
    if (!link) return
    const newVisible = !link.visible
    try {
      if (ds.isSupabaseConfigured()) {
        await ds.updateLinkApi(id, { visible: newVisible })
        const links = await ds.fetchLinks()
        set({ links })
        return
      }
    } catch (err) { console.error(err) }
    set({
      links: get().links.map(l => l.id === id ? { ...l, visible: newVisible } : l),
    })
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
    } catch (err) { console.error(err) }

    set({
      links: get().links.map(l => {
        if (l.id === id) return { ...l, sort_order: newSortOrder }
        if (l.id === swapLink.id) return { ...l, sort_order: swapNewSortOrder }
        return l
      }),
    })
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
