import { create } from 'zustand'
import * as ds from '@/services/dataService'
import { FALLBACK_DRIVE_TYPES } from '@/services/dataService'
import type { Category, LinkItem, SubCategory, Tag, DriveType, IconLibraryItem } from '@/services/dataService'

const devLog = (...args: Array<unknown>) => { if (import.meta.env.DEV) {console.log(...args)} }
const DEFAULT_CUSTOM_DRIVE_TYPES: Record<string, { name: string; icon: string; color: string }> = {}

// 同步锁：防止多个同步操作并发执行导致数据错乱
let _syncLock = false
function acquireSyncLock(): boolean {
  if (_syncLock) {return false}
  _syncLock = true
  return true
}
function releaseSyncLock(): void { _syncLock = false }


// ============ Store 接口 ============

export type { Category, LinkItem, SubCategory, Tag, DriveType, IconLibraryItem }

interface DataStore {
  // 数据
  categories: Array<Category>
  links: Array<LinkItem>
  subCategories: Array<SubCategory>
  tags: Array<Tag>
  driveTypes: Array<DriveType>
  customDriveTypes: Record<string, { name: string; icon: string; color: string }>
  iconLibrary: Array<IconLibraryItem>

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
  moveLinkSortOrder: (id: string, direction: 'up' | 'down', categoryId?: string) => Promise<boolean>
  incrementClicks: (id: string) => Promise<void>

  // SubCategories
  addSubCategory: (categoryId: string, name: string) => Promise<void>
  updateSubCategory: (id: string, updates: Partial<SubCategory>) => Promise<void>
  deleteSubCategory: (id: string) => Promise<void>
  moveSubCategorySortOrder: (id: string, direction: 'up' | 'down', categoryId: string) => Promise<boolean>
  getSubCategoriesByCategory: (categoryId: string) => Array<SubCategory>
  syncSubCategoriesToCloud: () => Promise<string> // 手动同步，返回结果消息
  deduplicateSubCategories: () => Promise<string> // 清理重复子分类，返回结果消息


  // DriveTypes
  addDriveType: (name: string, icon: string, color: string) => Promise<void>
  updateDriveType: (id: string, updates: Partial<DriveType>) => Promise<void>
  deleteDriveType: (id: string) => Promise<void>

  // Tags
  addTag: (name: string, color: string) => Promise<void>
  updateTag: (id: string, updates: Partial<Tag>) => Promise<void>
  deleteTag: (id: string) => Promise<void>

  // 待同步数据自动重试（网络恢复/页面加载后自动触发）
  syncPendingItems: () => Promise<number>
}

// Helper: generate unique slug from name
function generateSlug(name: string, existingSlugs?: Array<string>): string {
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
    if (raw) {return JSON.parse(raw)}
  } catch { /* ignore */ }
  return fallback
}

// 兼容旧版 localStorage 键名 (resource-cloud-storage)
// 当新键无数据时，尝试从旧键读取子分类
function loadLocalSubCategoriesCompat(): Array<SubCategory> {
  const fromNew = loadLocal<Array<SubCategory>>('subcategories', [])
  if (fromNew.length > 0) {return fromNew}

  try {
    const raw = localStorage.getItem('resource-cloud-storage')
    if (raw) {
      const parsed = JSON.parse(raw)
      const legacy = parsed?.state?.subCategories || parsed?.subCategories
      if (Array.isArray(legacy) && legacy.length > 0) {
        devLog('[DataStore] 从旧版存储格式加载', legacy.length, '个子分类')
        const migrated = legacy.map((sc: Record<string, unknown>) => ({
          id: String(sc.id || ''),
          category_id: String(sc.category_id || ''),
          name: String(sc.name || ''),
          sort_order: Number(sc.sort_order) || 0,
        }))
        // 迁移后立即保存到新版键，并清空旧版中的子分类，防止重复读回
        saveLocalItem('subcategories', migrated)
        try {
          const next = { ...parsed, state: { ...parsed?.state, subCategories: [] } }
          localStorage.setItem('resource-cloud-storage', JSON.stringify(next))
        } catch { /* ignore */ }
        return migrated
      }
    }
  } catch { /* ignore */ }
  return []
}

// 从旧版 storage 中删除指定子分类（防止幽灵数据）
function removeLegacySubCategory(id: string): void {
  try {
    const raw = localStorage.getItem('resource-cloud-storage')
    if (!raw) {return}
    const parsed = JSON.parse(raw)
    const legacy = parsed?.state?.subCategories || parsed?.subCategories
    if (!Array.isArray(legacy)) {return}
    const filtered = legacy.filter((sc: Record<string, unknown>) => String(sc.id) !== id)
    if (filtered.length === legacy.length) {return}
    const next = { ...parsed, state: { ...parsed?.state, subCategories: filtered } }
    localStorage.setItem('resource-cloud-storage', JSON.stringify(next))
  } catch { /* ignore */ }
}


function saveLocal<T>(key: string, data: T): void {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(data))
  } catch { /* quota exceeded */ }
}

function loadLocalLinks(): Array<LinkItem> {
  return loadLocal<Array<LinkItem>>('links', [])
}

function saveLocalLinks(links: Array<LinkItem>): void {
  saveLocal('links', links)
}

function saveLocalItem(key: string, data: unknown): void {
  saveLocal(key, data)
}

// ============ 初始化 ============

// 初始为空数组，统一由 initialize() → reloadAll() 从云端加载真实数据
// 不使用 mock 兜底，确保始终显示真实数据
const initCategories: Array<Category> = []
const initLinks: Array<LinkItem> = []
const initSubCategories: Array<SubCategory> = []

// Helper: 智能合并 - 云端数据是唯一数据源
// 云端有数据时：以云端为准，但保留本地标记为 _pendingSync 的数据（云写入失败时创建的）
// 云端为空时：使用本地数据（离线/首次使用）
// 云端和本地都为空时：使用 fallback（mock 数据兜底，保证首次访问有演示数据）
function mergeLists<T extends { id: string }>(remote: Array<T>, local: Array<T>, fallback: Array<T> = []): Array<T> {
  if (remote.length > 0) {
    // 云端有数据 → 云端是唯一数据源
    // 只保留本地被标记为 "pendingSync" 的数据（这些是之前云写入失败的新增数据）
    const pendingItems = local.filter(
      (l: Record<string, unknown>) => (l as unknown as Record<string, unknown>)._pendingSync === true
    ) as Array<T>
    if (pendingItems.length > 0) {
      const remoteIds = new Set(remote.map(r => r.id))
      const trulyPending = pendingItems.filter(p => !remoteIds.has(p.id))
      if (trulyPending.length > 0) {
        devLog(`[DataStore] 合并 ${trulyPending.length} 条待同步本地数据到云端数据`)
        return [...remote, ...trulyPending]
      }
    }
    return remote
  }
  // 云端无数据 → 使用本地数据作为回退
  if (local.length > 0) {
    devLog('[DataStore] 云端无数据，使用本地数据')
    return local
  }
  // 云端和本地都无数据 → fallback（mock 兜底，确保首次访问不显示空白）
  if (fallback.length > 0) {
    devLog(`[DataStore] 云端和本地均无数据，使用 fallback（${fallback.length} 条）`)
  }
  return fallback
}

// ============ 子分类同步到云端（核心逻辑） ============
// 解决本地 category_id 与云端 category_id 不一致的问题：
// 1. 先按 ID 匹配云端分类
// 2. ID 不匹配时按本地分类名称匹配云端分类
// 3. 还找不到则自动创建分类
// 4. 如果云端已存在同名同分类的子分类，则跳过不再重复创建
// 5. 同步后把本地链接里引用的旧子分类 ID 映射到云端子分类 ID
async function doSyncSubCategories(
  localSubs: Array<SubCategory>,
  cloudCategories: Array<Category>,
  cloudSubs: Array<SubCategory>,
  set: (partial: Partial<DataStore>) => void,
  get: () => DataStore
): Promise<{ success: number; failed: number; errors: Array<string> }> {
  const result = { success: 0, failed: 0, errors: [] as Array<string> }

  // 加载本地分类（包括新版和旧版 storage）
  const localCats = loadLocal<Array<Category>>('categories', [])
  const legacyCats = (() => {
    try {
      const raw = localStorage.getItem('resource-cloud-storage')
      if (raw) {
        const parsed = JSON.parse(raw)
        const list = parsed?.state?.categories || parsed?.categories || []
        return Array.isArray(list) ? list : []
      }
    } catch { /* 本地存储解析失败，回退到空数组 */ }
    return [] as Array<Category>
  })()

  const nameToCloudId = new Map<string, string>()
  for (const cc of cloudCategories) {
    nameToCloudId.set(cc.name, cc.id)
  }

  const syncedIds = new Set<string>()
  const idMap = new Map<string, string>() // 本地子分类 ID -> 云端子分类 ID

  // 同步前先对本地子分类自身去重，防止把重复项批量创建到云端
  const localUniqueMap = new Map<string, SubCategory>()
  const localIdMap = new Map<string, string>() // 重复本地子分类 ID -> 保留的本地子分类 ID
  for (const sc of localSubs) {
    const key = `${sc.category_id}::${sc.name.trim().toLowerCase()}`
    const existing = localUniqueMap.get(key)
    if (existing) {
      localIdMap.set(sc.id, existing.id)
    } else {
      localUniqueMap.set(key, sc)
    }
  }
  const uniqueLocalSubs = Array.from(localUniqueMap.values())

  for (const sc of uniqueLocalSubs) {
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
            devLog(`[DataStore] 为同步子分类自动创建分类 "${localCat.name}"，id=${newCat.id}`)
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

    // 如果云端已存在同名同分类的子分类，直接复用，避免重复
    const existingCloud = cloudSubs.find(
      cs => cs.category_id === cloudCatId && cs.name.trim().toLowerCase() === sc.name.trim().toLowerCase()
    )
    if (existingCloud) {
      idMap.set(sc.id, existingCloud.id)
      result.success++
      syncedIds.add(sc.id)
      continue
    }

    try {
      const newCloud = await ds.addSubCategoryApi(cloudCatId, sc.name)
      idMap.set(sc.id, newCloud.id)
      result.success++
      syncedIds.add(sc.id)
      // 把新创建的子分类也加入到 cloudSubs，方便后续去重判断
      cloudSubs.push(newCloud)
    } catch (err) {
      result.failed++
      const msg = err instanceof Error ? err.message : String(err)
      result.errors.push(`"${sc.name}"：${msg}`)
      console.error(`[DataStore] 同步子分类 "${sc.name}" 失败:`, err)
    }
  }

  // 本地重复子分类的 ID 也要映射到最终云端 ID
  for (const [dupId, keptId] of localIdMap) {
    const cloudId = idMap.get(keptId)
    if (cloudId) {
      idMap.set(dupId, cloudId)
      syncedIds.add(dupId)
    }
  }

  // 如果子分类 ID 有映射，更新链接中的旧 ID 为云端 ID
  if (idMap.size > 0) {
    const currentLinks = get().links
    const linkUpdates: Array<{ id: string; subcategory_id: string }> = []
    const links = currentLinks.map(l => {
      if (l.subcategory_id && idMap.has(l.subcategory_id)) {
        const newId = idMap.get(l.subcategory_id) as string
        linkUpdates.push({ id: l.id, subcategory_id: newId })
        return { ...l, subcategory_id: newId }
      }
      return l
    })

    try {
      if (ds.isCloudApiConfigured()) {
        await Promise.all(
          linkUpdates.map(u => ds.updateLinkApi(u.id, { subcategory_id: u.subcategory_id }))
        )
      }
    } catch (err) {
      console.error('[DataStore] 更新链接子分类 ID 失败:', err)
    }

    saveLocalLinks(links)
    set({ links })
  }


  if (result.success > 0) {
    try {
      const freshCloudSubs = await ds.fetchSubCategories()
      const remainingLocal = localSubs.filter(sc => !syncedIds.has(sc.id))
      const merged = mergeLists(freshCloudSubs, remainingLocal)
      set({ subCategories: merged })
      saveLocalItem('subcategories', merged)
    } catch { /* ignore */ }
  }

  // 保存已同步 ID，避免重复同步
  try {
    const existing = (() => {
      try {
        const raw = localStorage.getItem('panlink_synced_sub_ids')
        if (raw) {return new Set(JSON.parse(raw))}
      } catch { /* localStorage 读取失败 */ }
      return new Set<string>()
    })()
    for (const id of syncedIds) {existing.add(id)}
    localStorage.setItem('panlink_synced_sub_ids', JSON.stringify([...existing]))
  } catch { /* localStorage 写入失败 */ }

  return result
}


// 子分类自动同步到云端
// 当云端子分类为空但本地有数据时，自动 POST 到 D1
async function autoSyncSubCategories(
  cloudSubsLength: number,
  cloudCategories: Array<Category>,
  localSubs: Array<SubCategory>,
  set: (partial: Partial<DataStore>) => void,
  get: () => DataStore
) {
  if (cloudSubsLength > 0 || localSubs.length === 0) {return}
  if (!ds.isCloudApiConfigured()) {return}

  const token = (() => { try { return sessionStorage.getItem('admin_token') } catch { return null } })()
  if (!token) {return}

  const syncFlagKey = 'panlink_subcategories_synced'
  const alreadySynced = (() => { try { return localStorage.getItem(syncFlagKey) === '1' } catch { return false } })()
  if (alreadySynced) {return}

  const syncedIds = (() => {
    try {
      const raw = localStorage.getItem('panlink_synced_sub_ids')
      if (raw) {return new Set(JSON.parse(raw))}
    } catch { /* localStorage 读取失败 */ }
    return new Set<string>()
  })()

  const unsynced = localSubs.filter(sc => !syncedIds.has(sc.id))
  if (unsynced.length === 0) {return}

  devLog(`[DataStore] 发现 ${unsynced.length} 个本地子分类未同步到云端，开始自动同步...`)

  const result = await doSyncSubCategories(unsynced, cloudCategories, [], set, get)


  if (result.success > 0) {
    devLog(`[DataStore] 已同步 ${result.success} 个子分类到云端`)
  }
  if (result.failed > 0) {
    devLog(`[DataStore] ${result.failed} 个子分类同步失败`, result.errors)
  }

  try { localStorage.setItem(syncFlagKey, '1') } catch { /* localStorage 写入失败 */ }
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
      const localCats = loadLocal<Array<Category>>('categories', [])
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
        cloudSyncError: false,
      })

      saveLocalItem('categories', mergedCategories)
      saveLocalLinks(mergedLinks)
      saveLocalItem('subcategories', mergedSubCategories)

      // 加载次要数据（tags + driveTypes）
      const localTags = loadLocal<Array<Tag>>('tags', [])
      const [tags, driveTypes] = await Promise.all([
        ds.fetchTags().catch(() => [] as Array<Tag>),
        Promise.resolve(ds.fetchDriveTypes()),
      ])

      // 云端标签规范化 + 过滤待删除
      const pendingDeletes = loadLocal<Array<string>>('tag_delete_pending', [])
      const cloudTags = tags
        .filter(t => !pendingDeletes.includes(t.id))
        .map(t => ({
          ...t,
          user_id: t.user_id || '1',
          created_at: t.created_at || new Date().toISOString(),
          updated_at: t.updated_at || new Date().toISOString(),
        }))
      const mergedTags = mergeLists(cloudTags, localTags, [])

      set({
        tags: mergedTags,
        driveTypes: [...driveTypes] as Array<DriveType>,
      })

      // 从云端加载图标库
      try {
        const siteSettings = await ds.fetchSiteSettings()
        if (siteSettings.icon_library && siteSettings.icon_library.length > 0) {
          const merged = [...(get().iconLibrary || []), ...siteSettings.icon_library.filter(
            (ci: IconLibraryItem) => !(get().iconLibrary || []).find(li => li.id === ci.id || li.name === ci.name)
          )]
          try { localStorage.setItem('panlink_icon_library', JSON.stringify(merged)) } catch { /* ignore */ }
          set({ iconLibrary: merged })
        }
      } catch { /* icon library sync non-critical */ }

      // 判断云同步状态
      const hasCloudData = allData.categories.length > 0 || allData.links.length > 0
      const hasLocalOnly = localLinks.some(
        (l) => (l as LinkItem & { _pendingSync?: boolean })._pendingSync === true
      )
      set({ cloudSyncError: !hasCloudData && hasLocalOnly })

      devLog(`[DataStore] 加载完成: ${mergedCategories.length} 分类, ${mergedLinks.length} 链接, ${mergedSubCategories.length} 子分类`)

      // 自动同步本地子分类到云端（仅在云端为空且本地有数据时）
      autoSyncSubCategories(allData.subcategories.length, allData.categories, localSubs, set, get)

      return
    }

    // 合并查询失败/未配置，回退到单独请求
    devLog('[DataStore] 合并查询不可用，回退到单独请求')
    // ... 回退逻辑（与之前相同）
    const [categories, links, subCategories] = await Promise.all([
      ds.fetchCategories(),
      ds.fetchLinks(),
      ds.fetchSubCategories().catch(() => [] as Array<SubCategory>),
    ])

    const localCats = loadLocal<Array<Category>>('categories', [])
    const localLinks = loadLocalLinks()
    const localSubs = loadLocalSubCategoriesCompat()

    const mergedCategories = mergeLists(categories, localCats, [])
    const mergedLinks = mergeLists(links, localLinks, [])
    const mergedSubCategories = mergeLists(subCategories, localSubs)

    // 判断是否需要标记云端同步异常（云端全空但本地有待同步数据）
    const cloudEmpty = categories.length === 0 && links.length === 0
    const hasPendingLocal = localLinks.some(l => (l as unknown as Record<string, unknown>)._pendingSync)
    const cloudNotReachable = cloudEmpty && hasPendingLocal

    set({
      categories: mergedCategories,
      links: mergedLinks,
      subCategories: mergedSubCategories,
      initialized: true,
      error: null,
      cloudSyncError: cloudNotReachable,
    })

    saveLocalItem('categories', mergedCategories)
    saveLocalLinks(mergedLinks)
    saveLocalItem('subcategories', mergedSubCategories)

    const localTags = loadLocal<Array<Tag>>('tags', [])
    const [tags, driveTypes] = await Promise.all([
      ds.fetchTags().catch(() => [] as Array<Tag>),
      Promise.resolve(ds.fetchDriveTypes()),
    ])

    // 云端标签规范化 + 过滤待删除
    const pendingDeletes = loadLocal<Array<string>>('tag_delete_pending', [])
    const cloudTags = tags
      .filter(t => !pendingDeletes.includes(t.id))
      .map(t => ({
        ...t,
        user_id: t.user_id || '1',
        created_at: t.created_at || new Date().toISOString(),
        updated_at: t.updated_at || new Date().toISOString(),
      }))
    const mergedTags = mergeLists(cloudTags, localTags, [])

    set({
      tags: mergedTags,
      driveTypes: [...driveTypes] as Array<DriveType>,
    })

    // 从云端加载图标库（回退路径也需要）
    try {
      const siteSettings = await ds.fetchSiteSettings()
      if (siteSettings.icon_library && siteSettings.icon_library.length > 0) {
        const merged = [...(get().iconLibrary || []), ...siteSettings.icon_library.filter(
          (ci: IconLibraryItem) => !(get().iconLibrary || []).find(li => li.id === ci.id || li.name === ci.name)
        )]
        try { localStorage.setItem('panlink_icon_library', JSON.stringify(merged)) } catch { /* ignore */ }
        set({ iconLibrary: merged })
      }
    } catch { /* icon library sync non-critical */ }

    const hasCloudData = categories.length > 0 || links.length > 0
    const hasLocalOnly = localLinks.some(
      (l) => (l as LinkItem & { _pendingSync?: boolean })._pendingSync === true
    )
    set({ cloudSyncError: !hasCloudData && hasLocalOnly })

    devLog(`[DataStore] 加载完成: ${categories.length} 分类, ${links.length} 链接`)

    // 自动同步本地子分类到云端
    autoSyncSubCategories(subCategories.length, categories, localSubs, set, get)
  } catch (err) {
    console.error('[DataStore] reloadAll error:', err)
    const fallbackLinks = loadLocalLinks()
    const fallbackCats = loadLocal<Array<Category>>('categories', [])
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

// ============ 待同步数据自动重试 ============
// 遍历所有标记为 _pendingSync 的数据，逐个重试云端创建
// 按依赖顺序：categories → subcategories → links → tags → pending tag deletes
async function syncPendingToCloud(
  set: (partial: Partial<DataStore>) => void,
  get: () => DataStore,
): Promise<number> {
  if (!ds.isCloudApiConfigured()) {return 0}
  if (!acquireSyncLock()) { devLog('[DataStore] ⏳ 同步已在执行中，跳过本次调用'); return 0 }

  let synced = 0
  try {
  const state = get()

  // 1. 同步 pending categories（先同步，因为 links/subcategories 依赖它们）
  const pendingCats = state.categories.filter(c => (c as unknown as Record<string, unknown>)._pendingSync === true)
  if (pendingCats.length > 0) {
    const idMap = new Map<string, string>() // 旧 ID → 新云端 ID
    for (const cat of pendingCats) {
      try {
        const cloudCat = await ds.createCategory(cat.name)
        idMap.set(cat.id, cloudCat.id)
        synced++
        devLog(`[DataStore] ✅ 重试同步分类 "${cat.name}" 成功`)
      } catch (err) {
        console.error(`[DataStore] ❌ 重试同步分类 "${cat.name}" 失败:`, err)
      }
    }
    if (idMap.size > 0) {
      // 更新所有引用旧 ID 的地方
      const fresh = get()
      const updatedCats = fresh.categories.map(c => {
        if (idMap.has(c.id)) {
          const { _pendingSync, ...rest } = c as unknown as Record<string, unknown>
          return { ...rest, id: idMap.get(c.id) as string } as Category
        }
        return c
      })
      const updatedLinks = fresh.links.map(l =>
        idMap.has(l.category_id) ? { ...l, category_id: idMap.get(l.category_id) as string } : l
      )
      const updatedSubs = fresh.subCategories.map(sc =>
        idMap.has(sc.category_id) ? { ...sc, category_id: idMap.get(sc.category_id) as string } : sc
      )
      saveLocalItem('categories', updatedCats)
      saveLocalLinks(updatedLinks)
      saveLocalItem('subcategories', updatedSubs)
      set({ categories: updatedCats, links: updatedLinks, subCategories: updatedSubs })
    }
  }

  // 2. 同步 pending subcategories
  const fresh1 = get()
  const pendingSubs = fresh1.subCategories.filter(sc => (sc as unknown as Record<string, unknown>)._pendingSync === true)
  if (pendingSubs.length > 0) {
    const idMap = new Map<string, string>()
    for (const sc of pendingSubs) {
      try {
        const cloudSub = await ds.addSubCategoryApi(sc.category_id, sc.name)
        idMap.set(sc.id, cloudSub.id)
        synced++
        devLog(`[DataStore] ✅ 重试同步子分类 "${sc.name}" 成功`)
      } catch (err) {
        console.error(`[DataStore] ❌ 重试同步子分类 "${sc.name}" 失败:`, err)
      }
    }
    if (idMap.size > 0) {
      const fresh = get()
      const updatedSubs = fresh.subCategories.map(sc => {
        if (idMap.has(sc.id)) {
          const { _pendingSync, ...rest } = sc as unknown as Record<string, unknown>
          return { ...rest, id: idMap.get(sc.id) as string } as SubCategory
        }
        return sc
      })
      const updatedLinks = fresh.links.map(l =>
        idMap.has(l.subcategory_id || '') ? { ...l, subcategory_id: idMap.get(l.subcategory_id ?? '') as string } : l
      )
      saveLocalItem('subcategories', updatedSubs)
      saveLocalLinks(updatedLinks)
      set({ subCategories: updatedSubs, links: updatedLinks })
    }
  }

  // 3. 同步 pending links
  const fresh2 = get()
  const pendingLinks = fresh2.links.filter(l => (l as unknown as Record<string, unknown>)._pendingSync === true)
  if (pendingLinks.length > 0) {
    for (const link of pendingLinks) {
      try {
        await ds.createLinkApi({
          name: link.name,
          slug: link.slug,
          url: link.url,
          category_id: link.category_id,
          extract_code: link.extract_code,
          expires_at: link.expires_at,
          is_pinned: link.is_pinned,
          is_featured: link.is_featured,
          drive_type: link.drive_type,
          subcategory_id: link.subcategory_id,
          icon: link.icon,
          description: link.description,
          keywords: link.keywords,
          tags: (link.tags || []).map(t => t.id),
          sort_order: link.sort_order,
          visible: link.visible,
        })
        synced++
        devLog(`[DataStore] ✅ 重试同步链接 "${link.name}" 成功`)
      } catch (err) {
        console.error(`[DataStore] ❌ 重试同步链接 "${link.name}" 失败:`, err)
        break // 链路上一个失败后续大概率也失败，等下次
      }
    }
    // 同步成功后从云端拉取最新数据
    try {
      const cloudLinks = await ds.fetchLinks()
      const localLinks = loadLocalLinks()
      const merged = mergeLists(cloudLinks, localLinks, [])
      saveLocalLinks(merged)
      set({ links: merged })
    } catch { /* 云端拉取失败不影响已同步的结果 */ }
  }

  // 4. 同步 pending tags
  const fresh3 = get()
  const pendingTags = fresh3.tags.filter(t => (t as unknown as Record<string, unknown>)._pendingSync === true)
  if (pendingTags.length > 0) {
    for (const tag of pendingTags) {
      try {
        await ds.createTagApi(tag.name, tag.color)
        synced++
        devLog(`[DataStore] ✅ 重试同步标签 "${tag.name}" 成功`)
      } catch (err) {
        console.error(`[DataStore] ❌ 重试同步标签 "${tag.name}" 失败:`, err)
        break
      }
    }
    try {
      const cloudTags = await ds.fetchTags()
      const localTags = loadLocal<Array<Tag>>('tags', [])
      const pendingDeletes = loadLocal<Array<string>>('tag_delete_pending', [])
      const filteredCloud = cloudTags
        .filter(t => !pendingDeletes.includes(t.id))
        .map(t => ({ ...t, user_id: t.user_id || '1', created_at: t.created_at || new Date().toISOString(), updated_at: t.updated_at || new Date().toISOString() }))
      const merged = mergeLists(filteredCloud, localTags, [])
      saveLocalItem('tags', merged)
      set({ tags: merged })
    } catch { /* 非关键 */ }
  }

  // 5. 重试 pending tag deletes
  const pendingDeletes = loadLocal<Array<string>>('tag_delete_pending', [])
  if (pendingDeletes.length > 0) {
    const remaining: Array<string> = []
    for (const id of pendingDeletes) {
      try {
        await ds.deleteTagApi(id)
        synced++
        devLog(`[DataStore] ✅ 重试删除标签 ${id} 成功`)
      } catch {
        remaining.push(id)
      }
    }
    saveLocalItem('tag_delete_pending', remaining)
  }

  // 更新 cloudSyncError 状态
  const check = get()
  const stillPending =
    check.links.some(l => (l as unknown as Record<string, unknown>)._pendingSync) ||
    check.categories.some(c => (c as unknown as Record<string, unknown>)._pendingSync) ||
    check.subCategories.some(sc => (sc as unknown as Record<string, unknown>)._pendingSync) ||
    check.tags.some(t => (t as unknown as Record<string, unknown>)._pendingSync) ||
    loadLocal<Array<string>>('tag_delete_pending', []).length > 0

  if (!stillPending) {
    set({ cloudSyncError: false, lastSyncErrorDetail: '' })
    devLog('[DataStore] 🎉 所有待同步数据已成功推送到云端')
  } else {
    devLog('[DataStore] ⚠️ 仍有部分数据未能同步到云端')
  }

  } finally { releaseSyncLock() }
  return synced
}

// ============ 创建 Store ============

export const useDataStore = create<DataStore>()((set, get) => ({
  // 初始数据：优先 localStorage，其次 mock
  categories: initCategories,
  links: initLinks,
  subCategories: initSubCategories,
  tags: [],
  driveTypes: [...FALLBACK_DRIVE_TYPES],
  customDriveTypes: { ...DEFAULT_CUSTOM_DRIVE_TYPES },
  iconLibrary: (() => {
    try {
      const raw = localStorage.getItem('panlink_icon_library')
      if (raw) {return JSON.parse(raw) as Array<IconLibraryItem>}
    } catch { /* ignore */ }
    return []
  })(),

  initialized: false,
  error: null,
  cloudSyncError: false,
  lastSyncErrorDetail: '',

  // 初始化 - 先加载本地缓存让页面不空白，再后台刷新云端
  initialize: () => {
    const localCats = loadLocal<Array<Category>>('categories', [])
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
      devLog('[DataStore] 先显示本地缓存:', localCats.length, '分类,', localLinks.length, '链接,', localSubs.length, '子分类')
    }

    // 后台静默刷新云端数据，完成后自动重试待同步数据
    reloadAll(set, get).then(() => {
      if (ds.isCloudApiConfigured()) {
        syncPendingToCloud(set, get)
      }
    })

    // 监听网络恢复：从离线回到在线时自动重试
    const handleOnline = () => {
      if (ds.isCloudApiConfigured()) {
        devLog('[DataStore] 网络恢复，自动重试同步待处理数据')
        syncPendingToCloud(set, get)
      }
    }
    // 避免重复注册
    if (typeof window !== 'undefined' && !(window as unknown as Record<string, unknown>).__panlinkOnlineHandler) {
      window.addEventListener('online', handleOnline)
      ;(window as unknown as Record<string, unknown>).__panlinkOnlineHandler = true
    }
  },

  // ===== Categories =====
  addCategory: async (name) => {
    try {
      const category = await ds.createCategory(name)
      const updated = [...get().categories, category]
      saveLocalItem('categories', updated)
      set({ categories: updated, cloudSyncError: false })
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      const errDetail = JSON.stringify(err, null, 2)
      console.error('[DataStore] addCategory 云写入失败，回退到本地存储:', err)
      const categories = get().categories
      const newCat = {
        id: Date.now().toString(), name, icon: 'folder',
        sort_order: categories.length + 1,
        _pendingSync: true,
      } as Category & { _pendingSync?: boolean }
      const updated = [...categories, newCat as Category]
      // 回退到 localStorage
      saveLocalItem('categories', updated)
      set({ categories: updated, cloudSyncError: true, lastSyncErrorDetail: `addCategory 失败: ${errMsg}\n${errDetail}` })
    }
  },

  updateCategory: async (id, updates) => {
    let cloudFailed = false
    try {
      await ds.updateCategoryApi(id, updates)
    } catch { cloudFailed = true }
    const updated = get().categories.map(c => c.id === id ? { ...c, ...updates } : c)
    saveLocalItem('categories', updated)
    set({ categories: updated, cloudSyncError: cloudFailed })
  },

  deleteCategory: async (id) => {
    let cloudFailed = false
    try {
      await ds.deleteCategoryApi(id)
    } catch { cloudFailed = true }
    const updatedCategories = get().categories.filter(c => c.id !== id)
    saveLocalItem('categories', updatedCategories)
    const updatedLinks = get().links.map(l => l.category_id === id ? { ...l, category_id: '', subcategory_id: '' } : l)
    saveLocalLinks(updatedLinks)
    const filteredSubs = get().subCategories.filter(sc => sc.category_id !== id)
    saveLocalItem('subcategories', filteredSubs)
    set({
      categories: updatedCategories,
      links: updatedLinks,
      subCategories: filteredSubs,
      cloudSyncError: cloudFailed,
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
        devLog('[DataStore] addLink 尝试云写入:', newLink.name)
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
          description: newLink.description,
          keywords: newLink.keywords,
          tags: (newLink.tags || []).map(t => t.id),
        })
        // 云写入成功 → 从云端重新拉取完整数据（以云端为准）
        const links = await ds.fetchLinks()
        saveLocalLinks(links)
        set({ links, cloudSyncError: false, lastSyncErrorDetail: '' })
        devLog('[DataStore] addLink 云写入成功，云端共', links.length, '条链接')
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
        const cloudUpdates = { ...updates } as unknown as Record<string, unknown>
        // 标签需要转换为云端的 ID 数组格式
        if (Array.isArray(cloudUpdates.tags)) {
          cloudUpdates.tags = (cloudUpdates.tags as Array<{ id: string }>).map(t => t.id)
        }
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
    if (!link) {return}
    try {
      if (ds.isCloudApiConfigured()) {
        await ds.updateLinkApi(id, { is_pinned: !link.is_pinned })
        const links = await ds.fetchLinks()
        saveLocalLinks(links)
        set({ links, cloudSyncError: false })
        return
      }
    } catch (err) { console.error('[DataStore] togglePin 云API失败:', err) }
    const updated = get().links.map(l => l.id === id ? { ...l, is_pinned: !l.is_pinned } : l)
    saveLocalLinks(updated)
    set({ links: updated, cloudSyncError: true })
  },

  toggleFeatured: async (id) => {
    const link = get().links.find(l => l.id === id)
    if (!link) {return}
    try {
      if (ds.isCloudApiConfigured()) {
        await ds.updateLinkApi(id, { is_featured: !link.is_featured })
        const links = await ds.fetchLinks()
        saveLocalLinks(links)
        set({ links, cloudSyncError: false })
        return
      }
    } catch (err) { console.error('[DataStore] toggleFeatured 云API失败:', err) }
    const updated = get().links.map(l => l.id === id ? { ...l, is_featured: !l.is_featured } : l)
    saveLocalLinks(updated)
    set({ links: updated, cloudSyncError: true })
  },

  toggleLinkVisibility: async (id) => {
    const link = get().links.find(l => l.id === id)
    if (!link) {return}
    const newVisible = !link.visible
    try {
      if (ds.isCloudApiConfigured()) {
        await ds.updateLinkApi(id, { visible: newVisible })
        const links = await ds.fetchLinks()
        saveLocalLinks(links)
        set({ links, cloudSyncError: false })
        return
      }
    } catch (err) { console.error('[DataStore] toggleLinkVisibility 云API失败:', err) }
    const updated = get().links.map(l => l.id === id ? { ...l, visible: newVisible } : l)
    saveLocalLinks(updated)
    set({ links: updated, cloudSyncError: true })
  },

  moveLinkSortOrder: async (id, direction, categoryId) => {
    const targetLink = get().links.find(l => l.id === id)
    if (!targetLink) {return false}

    const siblings = get().links
      .filter(l => categoryId ? l.category_id === categoryId : l.category_id === targetLink.category_id)
      .sort((a, b) => a.sort_order - b.sort_order)

    const currentIndex = siblings.findIndex(l => l.id === id)
    if (currentIndex === -1) {return false}

    const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (swapIndex < 0 || swapIndex >= siblings.length) {return false}

    // 如果相邻项 sort_order 相同或存在重复，先规范化整个兄弟列表
    const hasDuplicate = new Set(siblings.map(s => s.sort_order)).size !== siblings.length
    const needNormalize = hasDuplicate || siblings[currentIndex].sort_order === siblings[swapIndex].sort_order

    try {
      if (ds.isCloudApiConfigured()) {
        if (needNormalize) {
          const normalized = siblings.map((s, idx) => ({ ...s, sort_order: (idx + 1) * 10 }))
          await Promise.all(normalized.map(s => ds.updateLinkApi(s.id, { sort_order: s.sort_order })))
          const refreshedLinks = await ds.fetchLinks()
          saveLocalLinks(refreshedLinks)
          set({ links: refreshedLinks, cloudSyncError: false })
          return true
        }

        const swapLink = siblings[swapIndex]
        await Promise.all([
          ds.updateLinkApi(id, { sort_order: swapLink.sort_order }),
          ds.updateLinkApi(swapLink.id, { sort_order: targetLink.sort_order }),
        ])
        const refreshedLinks = await ds.fetchLinks()
        saveLocalLinks(refreshedLinks)
        set({ links: refreshedLinks, cloudSyncError: false })
        return true
      }
    } catch (err) { console.error('[DataStore] moveLinkSortOrder 云API失败:', err) }

    // 本地模式兜底：规范化后交换
    const normalized = siblings.map((s, idx) => ({ ...s, sort_order: (idx + 1) * 10 }))
    const currentAfterNorm = normalized[currentIndex]
    const swapAfterNorm = normalized[swapIndex]
    const updatedLinks = get().links.map(l => {
      if (l.id === id) {return { ...l, sort_order: swapAfterNorm.sort_order }}
      if (l.id === swapAfterNorm.id) {return { ...l, sort_order: currentAfterNorm.sort_order }}
      return l
    })
    saveLocalLinks(updatedLinks)
    set({ links: updatedLinks, cloudSyncError: true })
    return true
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
        _pendingSync: true,
      } as SubCategory & { _pendingSync?: boolean }
      const updated = [...subCategories, newSub as SubCategory]
      set({ subCategories: updated, cloudSyncError: true })
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
    let cloudFailed = false
    try {
      if (ds.isCloudApiConfigured()) {
        await ds.deleteSubCategoryApi(id)
        const subCategories = await ds.fetchSubCategories()
        const updatedLinks = get().links.map(l => l.subcategory_id === id ? { ...l, subcategory_id: '' } : l)
        set({ subCategories, links: updatedLinks, cloudSyncError: false })
        saveLocalItem('subcategories', subCategories)
        removeLegacySubCategory(id)
        return
      }
    } catch (err) {
      console.error('[DataStore] deleteSubCategory 云API失败:', err)
      cloudFailed = true
    }

    // 本地模式 / 云端降级
    const updatedSubs = get().subCategories.filter(sc => sc.id !== id)
    const updatedLinks = get().links.map(l => l.subcategory_id === id ? { ...l, subcategory_id: '' } : l)
    saveLocalItem('subcategories', updatedSubs)
    set({ subCategories: updatedSubs, links: updatedLinks, cloudSyncError: cloudFailed })
    removeLegacySubCategory(id)
  },

  moveSubCategorySortOrder: async (id, direction, categoryId) => {
    const siblings = get().subCategories
      .filter(sc => sc.category_id === categoryId)
      .sort((a, b) => a.sort_order - b.sort_order)
    const currentIndex = siblings.findIndex(sc => sc.id === id)
    if (currentIndex === -1) {return false}

    const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (swapIndex < 0 || swapIndex >= siblings.length) {return false}

    // 如果相邻项 sort_order 相同或存在重复，先规范化整个兄弟列表
    const hasDuplicate = new Set(siblings.map(s => s.sort_order)).size !== siblings.length
    const needNormalize = hasDuplicate || siblings[currentIndex].sort_order === siblings[swapIndex].sort_order

    try {
      if (ds.isCloudApiConfigured()) {
        if (needNormalize) {
          const normalized = siblings.map((s, idx) => ({ ...s, sort_order: (idx + 1) * 10 }))
          await Promise.all(normalized.map(s => ds.updateSubCategoryApi(s.id, { sort_order: s.sort_order })))
          const subCategories = await ds.fetchSubCategories()
          set({ subCategories, cloudSyncError: false })
          saveLocalItem('subcategories', subCategories)
          return true
        }

        const swapSc = siblings[swapIndex]
        const currentSort = siblings[currentIndex].sort_order
        await Promise.all([
          ds.updateSubCategoryApi(id, { sort_order: swapSc.sort_order }),
          ds.updateSubCategoryApi(swapSc.id, { sort_order: currentSort }),
        ])
        const subCategories = await ds.fetchSubCategories()
        set({ subCategories, cloudSyncError: false })
        saveLocalItem('subcategories', subCategories)
        return true
      }
    } catch (err) { console.error('[DataStore] moveSubCategorySortOrder 云API失败:', err) }

    // 本地模式兜底：规范化后交换
    const normalized = siblings.map((s, idx) => ({ ...s, sort_order: (idx + 1) * 10 }))
    const currentAfterNorm = normalized[currentIndex]
    const swapAfterNorm = normalized[swapIndex]
    const updated = get().subCategories.map(sc => {
      if (sc.id === id) {return { ...sc, sort_order: swapAfterNorm.sort_order }}
      if (sc.id === swapAfterNorm.id) {return { ...sc, sort_order: currentAfterNorm.sort_order }}
      return sc
    })
    saveLocalItem('subcategories', updated)
    set({ subCategories: updated, cloudSyncError: true })
    return true
  },

  getSubCategoriesByCategory: (categoryId) => {
    return get().subCategories.filter(sc => sc.category_id === categoryId).sort((a, b) => a.sort_order - b.sort_order)
  },

  // 手动同步本地子分类到云端
  syncSubCategoriesToCloud: async () => {
    if (!ds.isCloudApiConfigured()) {return '云端未配置，无法同步'}
    const localSubs = loadLocalSubCategoriesCompat()
    if (localSubs.length === 0) {return '没有本地子分类需要同步'}

    // 获取云端已有子分类和分类，用于 ID 映射
    let cloudSubs: Array<SubCategory> = []
    let cloudCats: Array<Category> = []
    try {
      [cloudSubs, cloudCats] = await Promise.all([
        ds.fetchSubCategories(),
        ds.fetchCategories(),
      ])
    } catch { return '无法连接云端，请检查网络' }

    const cloudIds = new Set(cloudSubs.map(s => s.id))
    const unsynced = localSubs.filter(sc => !cloudIds.has(sc.id))
    if (unsynced.length === 0) {return '所有子分类已在云端，无需同步'}

    const result = await doSyncSubCategories(unsynced, cloudCats, cloudSubs, set, get)


    if (result.failed > 0) {
      const token = (() => { try { return sessionStorage.getItem('admin_token') } catch { return null } })()
      if (!token) {return `同步失败：${result.failed} 个未成功。请先登录管理后台\n${result.errors.join('\n')}`}
      return `已同步 ${result.success} 个，${result.failed} 个失败\n${result.errors.join('\n')}`
    }
    return `已成功同步 ${result.success} 个子分类到云端`
  },

  // 清理重复子分类：相同分类 + 相同名称只保留一条
  // 删除其余重复项，并把链接里引用的重复子分类 ID 迁移到保留项
  deduplicateSubCategories: async () => {
    const all = get().subCategories.slice()
    const links = get().links.slice()

    if (all.length === 0) {return '没有子分类'}

    // 按 category_id + name 分组（忽略首尾空格，不区分大小写）
    const groups = new Map<string, Array<SubCategory>>()
    for (const sc of all) {
      const key = `${sc.category_id}::${sc.name.trim().toLowerCase()}`
      const list = groups.get(key) || []
      list.push(sc)
      groups.set(key, list)
    }

    const toDelete: Array<SubCategory> = []
    const idMap = new Map<string, string>() // 被删除子分类 ID -> 保留子分类 ID

    for (const [, list] of groups) {
      if (list.length <= 1) {continue}
      // 保留 sort_order 最小、id 最小的那一条
      list.sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
      const kept = list[0]
      for (const dup of list.slice(1)) {
        toDelete.push(dup)
        idMap.set(dup.id, kept.id)
      }
    }

    if (toDelete.length === 0) {return '未发现重复子分类'}

    // 先更新链接中的子分类 ID 引用
    const linkUpdates: Array<{ id: string; subcategory_id: string }> = []
    const updatedLinks = links.map(l => {
      if (l.subcategory_id && idMap.has(l.subcategory_id)) {
        const newId = idMap.get(l.subcategory_id) as string
        linkUpdates.push({ id: l.id, subcategory_id: newId })
        return { ...l, subcategory_id: newId }
      }
      return l
    })

    try {
      if (ds.isCloudApiConfigured()) {
        // 云端：先串行更新链接（避免并发写触发限流），再串行删除重复子分类
        for (const u of linkUpdates) {
          await ds.updateLinkApi(u.id, { subcategory_id: u.subcategory_id })
        }
        // 串行删除，每个之间加 200ms 延迟，降低触发限流的概率
        for (let i = 0; i < toDelete.length; i++) {
          const dup = toDelete[i]
          await ds.deleteSubCategoryApi(dup.id)
          if (i < toDelete.length - 1) {await new Promise(r => setTimeout(r, 200))}
        }
        // 以云端数据为准刷新
        const [subCategories, refreshedLinks] = await Promise.all([
          ds.fetchSubCategories(),
          ds.fetchLinks(),
        ])
        set({ subCategories, links: refreshedLinks })
        saveLocalItem('subcategories', subCategories)
        saveLocalLinks(refreshedLinks)
        // 清理旧版缓存
        for (const dup of toDelete) {removeLegacySubCategory(dup.id)}
        return `已清理 ${toDelete.length} 个重复子分类`
      }
    } catch (err) {
      console.error('[DataStore] deduplicateSubCategories 云API失败:', err)
      return `清理失败：${err instanceof Error ? err.message : String(err)}`
    }

    // 本地回退
    const updatedSubs = all.filter(sc => !toDelete.some(d => d.id === sc.id))
    set({ subCategories: updatedSubs, links: updatedLinks })
    saveLocalItem('subcategories', updatedSubs)
    saveLocalLinks(updatedLinks)
    for (const dup of toDelete) {removeLegacySubCategory(dup.id)}
    return `已清理 ${toDelete.length} 个重复子分类（本地）`

  },


  // ===== DriveTypes =====
  addDriveType: async (name, icon, color) => {
    try {
      const dt = await ds.addDriveTypeApi(name, icon, color)
      set({ driveTypes: [...get().driveTypes, dt], cloudSyncError: false })
    } catch {
      console.error('[DataStore] addDriveType 云写入失败')
      set({
        driveTypes: [...get().driveTypes, {
          id: `custom-${Date.now()}`, name, icon, color,
        }],
        cloudSyncError: true,
      })
    }
  },

  updateDriveType: async (id, updates) => {
    set({
      driveTypes: get().driveTypes.map(dt => dt.id === id ? { ...dt, ...updates } : dt),
    })
    // 同步到云端
    if (ds.isCloudApiConfigured()) {
      try {
        const settings = await ds.fetchSiteSettings()
        const driveTypes: Array<DriveType> = (settings as unknown as Record<string, unknown>).drive_types as Array<DriveType> || []
        const idx = driveTypes.findIndex(dt => dt.id === id)
        if (idx >= 0) {
          driveTypes[idx] = { ...driveTypes[idx], ...updates }
          await ds.updateSiteSettings({ drive_types: driveTypes } as unknown as Parameters<typeof ds.updateSiteSettings>[0])
        }
      } catch (err) {
        console.error('[DataStore] updateDriveType 云同步失败:', err)
        set({ cloudSyncError: true })
      }
    }
  },

  deleteDriveType: async (id) => {
    let cloudFailed = false
    try { await ds.deleteDriveTypeApi(id) } catch { cloudFailed = true }
    const updated = get().driveTypes.filter(dt => dt.id !== id)
    set({ driveTypes: updated, cloudSyncError: cloudFailed })
  },

  // 自动重试待同步数据到云端
  syncPendingItems: () => syncPendingToCloud(set, get),

  // ===== Tags =====
  addTag: async (name, color) => {
    try {
      const tag = await ds.createTagApi(name, color)
      const merged = [...get().tags, tag]
      set({ tags: merged })
      saveLocalItem('tags', merged)
    } catch {
      const now = new Date().toISOString()
      const pendingTag = {
        id: Date.now().toString(), user_id: '1', name, color,
        created_at: now, updated_at: now, _pendingSync: true,
      } as Tag & { _pendingSync?: boolean }
      const merged = [...get().tags, pendingTag as Tag]
      set({ tags: merged, cloudSyncError: true })
      saveLocalItem('tags', merged)
    }
  },

  updateTag: async (id, updates) => {
    let cloudFailed = false
    try {
      if (ds.isCloudApiConfigured()) {
        await ds.updateTagApi(id, updates)
      }
    } catch (err) {
      console.error('[DataStore] updateTag cloud sync error:', err)
      cloudFailed = true
    }
    const updatedTags = get().tags.map(t =>
      t.id === id ? { ...t, ...updates, updated_at: new Date().toISOString() } : t
    )
    saveLocalItem('tags', updatedTags)
    set({ tags: updatedTags, cloudSyncError: cloudFailed })
  },

  deleteTag: async (id) => {
    const updatedTags = get().tags.filter(t => t.id !== id)
    const updatedLinks = get().links.map(l => ({
      ...l,
      tags: l.tags.filter(t => t.id !== id),
    }))
    set({ tags: updatedTags, links: updatedLinks })
    saveLocalItem('tags', updatedTags)

    try {
      await ds.deleteTagApi(id)
    } catch {
      // 云端删除失败 → 标记该 ID 为待删除，下次 reloadAll 时跳过云端中该标签
      try {
        const pendingDeletes = loadLocal<Array<string>>('tag_delete_pending', [])
        if (!pendingDeletes.includes(id)) {
          pendingDeletes.push(id)
          saveLocalItem('tag_delete_pending', pendingDeletes)
        }
      } catch { /* ignore */ }
      set({ cloudSyncError: true })
    }
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
    // 同步到云端
    if (ds.isCloudApiConfigured()) {
      ds.updateSiteSettings({ icon_library: updated } as unknown as Parameters<typeof ds.updateSiteSettings>[0]).catch(() => {})
    }
    set({ iconLibrary: updated })
  },

  deleteIconFromLibrary: (id) => {
    const updated = get().iconLibrary.filter(i => i.id !== id)
    try { localStorage.setItem('panlink_icon_library', JSON.stringify(updated)) } catch { /* quota exceeded */ }
    // 同步到云端
    if (ds.isCloudApiConfigured()) {
      ds.updateSiteSettings({ icon_library: updated } as unknown as Parameters<typeof ds.updateSiteSettings>[0]).catch(() => {})
    }
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
