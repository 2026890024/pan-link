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
  syncSubCategoriesToCloud: () => Promise<string> // 手动同步，返回结果消息

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

// 兼容旧版 localStorage 键名 (resource-cloud-storage)
// 当新键无数据时，尝试从旧键读取子分类
function loadLocalSubCategoriesCompat(): SubCategory[] {
  const fromNew = loadLocal<SubCategory[]>('subcategories', [])
  if (fromNew.length > 0) return fromNew

  try {
    const raw = localStorage.getItem('resource-cloud-storage')
    if (raw) {
      const parsed = JSON.parse(raw)
      const legacy = parsed?.state?.subCategories || parsed?.subCategories
      if (Array.isArray(legacy) && legacy.length > 0) {
        console.log('[DataStore] 从旧版存储格式加载', legacy.length, '个子分类')
        return legacy.map((sc: Record<string, unknown>) => ({
          id: String(sc.id || ''),
          category_id: String(sc.category_id || ''),
          name: String(sc.name || ''),
          sort_order: Number(sc.sort_order) || 0,
        }))
      }
    }
  } catch { /* ignore */ }
  return []
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
  if (fallback.length > 0) {
    console.log(`[DataStore] 云端和本地均无数据，使用 fallback（${fallback.length} 条）`)
  }
  return fallback
}

// ============ 子分类同步到云端（核心逻辑） ============
// 解决本地 category_id 与云端 category_id 不一致的问题：
// 1. 先按 ID 匹配云端分类
// 2. ID 不匹配时按本地分类名称匹配云端分类
// 3. 还找不到则记录失败原因
async function doSyncSubCategories(
  localSubs: SubCategory[],
  cloudCategories: Category[],
  set: (partial: Partial<DataStore>) => void
): Promise<{ success: number; failed: number; errors: string[] }> {
  const result = { success: 0, failed: 0, errors: [] as string[] }

  // 加载本地分类（包括新版和旧版 storage）
  const localCats = loadLocal<Category[]>('categories', [])
  const legacyCats = (() => {
    try {
      const raw = localStorage.getItem('resource-cloud-storage')
      if (raw) {
        const parsed = JSON.parse(raw)
        const list = parsed?.state?.categories || parsed?.categories || []
        return Array.isArray(list) ? list : []
      }
    } catch {}
    return [] as Category[]
  })()

  const nameToCloudId = new Map<string, string>()
  for (const cc of cloudCategories) {
    nameToCloudId.set(cc.name, cc.id)
  }

  const syncedIds = new Set<string>()

  for (const sc of localSubs) {
    let cloudCatId = cloudCategories.find(c => c.id === sc.category_id)?.id

    // ID 不匹配，按本地分类名称查找云端分类
    if (!cloudCatId) {
      const localCat = localCats.find(c => c.id === sc.category_id) || legacyCats.find(c => c.id === sc.category_id)
      if (localCat) {
        cloudCatId = nameToCloudId.get(localCat.name)
        // 如果按名称也找不到，尝试在云端创建该分类
        if (!cloudCatId) {
          try {
            const newCat = await ds.createCategory(localCat.name)
            cloudCatId = newCat.id
            nameToCloudId.set(localCat.name, newCat.id)
            cloudCategories.push(newCat)
            console.log(`[DataStore] 为同步子分类自动创建分类 "${localCat.name}"，id=${newCat.id}`)
          } catch (err) {
            console.error(`[DataStore] 自动创建分类 "${localCat.name}" 失败:`, err)
          }
        }
      }
    }


    if (!cloudCatId) {
      result.failed++
      const catName = localCats.find(c => c.id === sc.category_id)?.name
        || legacyCats.find(c => c.id === sc.category_id)?.name
        || sc.category_id
      result.errors.push(`"${sc.name}"：找不到对应分类 "${catName}"`)
      continue
    }

    try {
      await ds.addSubCategoryApi(cloudCatId, sc.name)
      result.success++
      syncedIds.add(sc.id)
    } catch (err) {
      result.failed++
      const msg = err instanceof Error ? err.message : String(err)
      result.errors.push(`"${sc.name}"：${msg}`)
      console.error(`[DataStore] 同步子分类 "${sc.name}" 失败:`, err)
    }
  }

  if (result.success > 0) {
    try {
      const cloudSubs = await ds.fetchSubCategories()
      const remainingLocal = localSubs.filter(sc => !syncedIds.has(sc.id))
      const merged = mergeLists(cloudSubs, remainingLocal)
      set({ subCategories: merged })
      saveLocalItem('subcategories', merged)
    } catch { /* ignore */ }
  }

  // 保存已同步 ID，避免重复同步
  try {
    const existing = (() => {
      try {
        const raw = localStorage.getItem('panlink_synced_sub_ids')
        if (raw) return new Set(JSON.parse(raw))
      } catch {}
      return new Set<string>()
    })()
    for (const id of syncedIds) existing.add(id)
    localStorage.setItem('panlink_synced_sub_ids', JSON.stringify([...existing]))
  } catch {}

  return result
}

// 子分类自动同步到云端
// 当云端子分类为空但本地有数据时，自动 POST 到 D1
async function autoSyncSubCategories(
  cloudSubsLength: number,
  cloudCategories: Category[],
  localSubs: SubCategory[],
  set: (partial: Partial<DataStore>) => void,
  get: () => DataStore
) {
  if (cloudSubsLength > 0 || localSubs.length === 0) return
  if (!ds.isCloudApiConfigured()) return

  const token = (() => { try { return sessionStorage.getItem('admin_token') } catch { return null } })()
  if (!token) return

  const syncFlagKey = 'panlink_subcategories_synced'
  const alreadySynced = (() => { try { return localStorage.getItem(syncFlagKey) === '1' } catch { return false } })()
  if (alreadySynced) return

  const syncedIds = (() => {
    try {
      const raw = localStorage.getItem('panlink_synced_sub_ids')
      if (raw) return new Set(JSON.parse(raw))
    } catch {}
    return new Set<string>()
  })()

  const unsynced = localSubs.filter(sc => !syncedIds.has(sc.id))
  if (unsynced.length === 0) return

  console.log(`[DataStore] 发现 ${unsynced.length} 个本地子分类未同步到云端，开始自动同步...`)

  const result = await doSyncSubCategories(unsynced, cloudCategories, set)

  if (result.success > 0) {
    console.log(`[DataStore] 已同步 ${result.success} 个子分类到云端`)
  }
  if (result.failed > 0) {
    console.log(`[DataStore] ${result.failed} 个子分类同步失败`, result.errors)
  }

  try { localStorage.setItem(syncFlagKey, '1') } catch {}
}


// Helper: reload all data from service (非阻塞)
// 优化 1: 先显示本地缓存（在 initialize 中完成）
// 优化 2: 使用 /api/all 合并查询，一次请求获取所有核心数据，减少 Workers 冷启动
async function reloadAll(set: (partial: Partial<DataStore>) => void, get: () => DataStore) {
  try {
    // 尝试合并查询：一次请求获取所有核心数据
    const allData = await ds.fetchAll()

    if (allData) {
      // 获取本地数据用于合并
      const localCats = loadLocal<Category[]>('categories', [])
      const localLinks = loadLocalLinks()
      const localSubs = loadLocalSubCategoriesCompat()

      const mergedCategories = mergeLists(allData.categories, localCats, [])
      const mergedLinks = mergeLists(allData.links, localLinks, [])
      const mergedSubCategories = mergeLists(allData.subcategories, localSubs)

      // 更新数据（本地已有数据则静默更新，否则设置 initialized）
      set({
        categories: mergedCategories,
        links: mergedLinks,
        subCategories: mergedSubCategories,
        initialized: true,
        error: null,
      })

      saveLocalItem('categories', mergedCategories)
      saveLocalLinks(mergedLinks)
      saveLocalItem('subcategories', mergedSubCategories)

      // 加载次要数据（tags + driveTypes）
      const [tags, driveTypes] = await Promise.all([
        ds.fetchTags().catch(() => [] as Tag[]),
        Promise.resolve(ds.fetchDriveTypes()),
      ])

      set({
        tags: tags.map(t => ({
          ...t,
          user_id: t.user_id || '1',
          created_at: t.created_at || new Date().toISOString(),
          updated_at: t.updated_at || new Date().toISOString(),
        })),
        driveTypes: [...driveTypes] as DriveType[],
      })

      // 判断云同步状态
      const hasCloudData = allData.categories.length > 0 || allData.links.length > 0
      const hasLocalOnly = localLinks.some(
        (l: Record<string, unknown>) => (l as Record<string, unknown>)._pendingSync === true
      )
      set({ cloudSyncError: !hasCloudData && hasLocalOnly })

      console.log(`[DataStore] 加载完成: ${allData.categories.length} 分类, ${allData.links.length} 链接, ${allData.subcategories.length} 子分类`)

      // 自动同步本地子分类到云端（仅在云端为空且本地有数据时）
      autoSyncSubCategories(allData.subcategories.length, allData.categories, localSubs, set, get)

      return
    }

    // 合并查询失败/未配置，回退到单独请求
    console.log('[DataStore] 合并查询不可用，回退到单独请求')
    // ... 回退逻辑（与之前相同）
    const [categories, links, subCategories] = await Promise.all([
      ds.fetchCategories(),
      ds.fetchLinks(),
      ds.fetchSubCategories().catch(() => [] as SubCategory[]),
    ])

    const localCats = loadLocal<Category[]>('categories', [])
    const localLinks = loadLocalLinks()
    const localSubs = loadLocalSubCategoriesCompat()

    const mergedCategories = mergeLists(categories, localCats, [])
    const mergedLinks = mergeLists(links, localLinks, [])
    const mergedSubCategories = mergeLists(subCategories, localSubs)

    set({
      categories: mergedCategories,
      links: mergedLinks,
      subCategories: mergedSubCategories,
      initialized: true,
      error: null,
    })

    saveLocalItem('categories', mergedCategories)
    saveLocalLinks(mergedLinks)
    saveLocalItem('subcategories', mergedSubCategories)

    const [tags, driveTypes] = await Promise.all([
      ds.fetchTags().catch(() => [] as Tag[]),
      Promise.resolve(ds.fetchDriveTypes()),
    ])

    set({
      tags: tags.map(t => ({
        ...t,
        user_id: t.user_id || '1',
        created_at: t.created_at || new Date().toISOString(),
        updated_at: t.updated_at || new Date().toISOString(),
      })),
      driveTypes: [...driveTypes] as DriveType[],
    })

    const hasCloudData = categories.length > 0 || links.length > 0
    const hasLocalOnly = localLinks.some(
      (l: Record<string, unknown>) => (l as Record<string, unknown>)._pendingSync === true
    )
    set({ cloudSyncError: !hasCloudData && hasLocalOnly })

    console.log(`[DataStore] 加载完成: ${categories.length} 分类, ${links.length} 链接`)

    // 自动同步本地子分类到云端
    autoSyncSubCategories(subCategories.length, categories, localSubs, set, get)
  } catch (err) {
    console.error('[DataStore] reloadAll error:', err)
    const fallbackLinks = loadLocalLinks()
    const fallbackCats = loadLocal<Category[]>('categories', [])
    const fallbackSubs = loadLocalSubCategoriesCompat()
    set({
      initialized: true,
      error: String(err),
      categories: fallbackCats,
      links: fallbackLinks,
      subCategories: fallbackSubs,
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

  // 初始化 - 先加载本地缓存让页面不空白，再后台刷新云端
  initialize: () => {
    const localCats = loadLocal<Category[]>('categories', [])
    const localLinks = loadLocalLinks()
    const localSubs = loadLocalSubCategoriesCompat()

    // 如果本地有缓存，先立即显示，不空白等待
    if (localCats.length > 0 || localLinks.length > 0) {
      set({
        categories: localCats,
        links: localLinks,
        subCategories: localSubs,
        initialized: true,
      })
      console.log('[DataStore] 先显示本地缓存:', localCats.length, '分类,', localLinks.length, '链接,', localSubs.length, '子分类')
    }

    // 后台静默刷新云端数据
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
      await ds.addSubCategoryApi(categoryId, name)
      // 云写入成功 → 从云端重新拉取完整子分类
      const subCategories = await ds.fetchSubCategories()
      set({ subCategories })
      saveLocalItem('subcategories', subCategories)
    } catch {
      const subCategories = get().subCategories
      const existing = subCategories.filter(sc => sc.category_id === categoryId)
      const newSub = {
        id: Date.now().toString(), category_id: categoryId, name,
        sort_order: existing.length + 1,
      }
      const updated = [...subCategories, newSub]
      set({ subCategories: updated })
      saveLocalItem('subcategories', updated)
    }
  },

  updateSubCategory: async (id, updates) => {
    let cloudFailed = false
    try {
      if (ds.isCloudApiConfigured()) {
        await ds.updateSubCategoryApi(id, updates)
        const subCategories = await ds.fetchSubCategories()
        set({ subCategories })
        saveLocalItem('subcategories', subCategories)
        return
      }
    } catch (err) {
      console.error('[DataStore] updateSubCategory 云API失败:', err)
      cloudFailed = true
    }
    const updated = get().subCategories.map(sc => sc.id === id ? { ...sc, ...updates } : sc)
    saveLocalItem('subcategories', updated)
    set({ subCategories: updated, cloudSyncError: cloudFailed })
  },

  deleteSubCategory: async (id) => {
    try {
      if (ds.isCloudApiConfigured()) {
        await ds.deleteSubCategoryApi(id)
        const subCategories = await ds.fetchSubCategories()
        set({ subCategories, links: get().links.map(l => l.subcategory_id === id ? { ...l, subcategory_id: '' } : l) })
        saveLocalItem('subcategories', subCategories)
        return
      }
    } catch (err) {
      console.error('[DataStore] deleteSubCategory 云API失败:', err)
    }
    const updatedSubs = get().subCategories.filter(sc => sc.id !== id)
    const updatedLinks = get().links.map(l => l.subcategory_id === id ? { ...l, subcategory_id: '' } : l)
    saveLocalItem('subcategories', updatedSubs)
    set({ subCategories: updatedSubs, links: updatedLinks })
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

    try {
      if (ds.isCloudApiConfigured()) {
        await Promise.all([
          ds.updateSubCategoryApi(id, { sort_order: swapSort }),
          ds.updateSubCategoryApi(swapSc.id, { sort_order: currentSort }),
        ])
        const subCategories = await ds.fetchSubCategories()
        set({ subCategories })
        saveLocalItem('subcategories', subCategories)
        return
      }
    } catch (err) { console.error('[DataStore] moveSubCategorySortOrder 云API失败:', err) }

    const updated = get().subCategories.map(sc => {
      if (sc.id === id) return { ...sc, sort_order: swapSort }
      if (sc.id === swapSc.id) return { ...sc, sort_order: currentSort }
      return sc
    })
    saveLocalItem('subcategories', updated)
    set({ subCategories: updated })
  },

  getSubCategoriesByCategory: (categoryId) => {
    return get().subCategories.filter(sc => sc.category_id === categoryId).sort((a, b) => a.sort_order - b.sort_order)
  },

  // 手动同步本地子分类到云端
  syncSubCategoriesToCloud: async () => {
    if (!ds.isCloudApiConfigured()) return '云端未配置，无法同步'
    const localSubs = loadLocalSubCategoriesCompat()
    if (localSubs.length === 0) return '没有本地子分类需要同步'

    // 获取云端已有子分类和分类，用于 ID 映射
    let cloudSubs: SubCategory[] = []
    let cloudCats: Category[] = []
    try {
      [cloudSubs, cloudCats] = await Promise.all([
        ds.fetchSubCategories(),
        ds.fetchCategories(),
      ])
    } catch { return '无法连接云端，请检查网络' }

    const cloudIds = new Set(cloudSubs.map(s => s.id))
    const unsynced = localSubs.filter(sc => !cloudIds.has(sc.id))
    if (unsynced.length === 0) return '所有子分类已在云端，无需同步'

    const result = await doSyncSubCategories(unsynced, cloudCats, set)

    if (result.failed > 0) {
      const token = (() => { try { return sessionStorage.getItem('admin_token') } catch { return null } })()
      if (!token) return `同步失败：${result.failed} 个未成功。请先登录管理后台\n${result.errors.join('\n')}`
      return `已同步 ${result.success} 个，${result.failed} 个失败\n${result.errors.join('\n')}`
    }
    return `已成功同步 ${result.success} 个子分类到云端`
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
