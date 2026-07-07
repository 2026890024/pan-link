/**
 * 统一数据服务层
 * - 优先使用 Cloudflare Worker + D1 数据库（国内可访问）
 * - 未配置时自动回退到 localStorage
 */
// ============ 配置 ============

// Worker API 地址（部署后替换为实际地址）
// 生产环境：Pages Functions 同域名部署，使用相对路径
// 开发环境：通过 Vite proxy 转发 /api 到 Worker
// 也可以通过 VITE_API_BASE_URL 手动指定完整地址
const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

export function isCloudApiConfigured(): boolean {
  // 生产环境：空字符串 = Pages Functions 同域部署 = 已配置
  // 开发环境：有完整 URL 且不是占位符 = 已配置
  if (!API_BASE) return true  // Empty = relative = Pages Functions
  return !API_BASE.includes('你的用户名')
}

// ============ 类型定义 ============

export interface DriveType {
  id: string
  name: string
  color: string
  icon: string
}

export interface Category {
  id: string
  name: string
  icon: string
  logo_url?: string | null
  sort_order: number
  is_system?: boolean
}

export interface SubCategory {
  id: string
  category_id: string
  name: string
  sort_order: number
}

export interface Tag {
  id: string
  user_id: string
  name: string
  color: string
  created_at: string
  updated_at: string
}

export interface LinkItem {
  id: string
  name: string
  title: string
  description: string
  url: string
  drive_type: string
  category_id: string
  category_name?: string
  category_logo?: string
  subcategory_id: string
  icon: string
  is_pinned: boolean
  is_featured: boolean
  click_count: number
  registration_count: number
  extract_code: string
  expires_at: string | null
  tags: { id: string; name: string; color: string }[]
  keywords: string[]
  created_at: string
  slug: string
  sort_order: number
  visible: boolean
}

// ============ HTTP 工具函数 ============

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`
  const resp = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!resp.ok) {
    const errBody = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }))
    throw new Error(errBody.error || `API error ${resp.status}`)
  }

  return resp.json() as Promise<T>
}

const log = (action: string, ...args: unknown[]) => {
  if (import.meta.env.DEV) {
    console.log(`[DataService] ${isCloudApiConfigured() ? '☁️ D1-Worker' : '💾 localStorage'} - ${action}`, ...args)
  }
}

// ============ 数据转换 ============

function workerLinkToLinkItem(data: Record<string, unknown>): LinkItem {
  return {
    id: String(data.id || ''),
    name: String(data.name || ''),
    title: String(data.name || ''),
    description: typeof data.description === 'string' ? data.description : '',
    url: String(data.url || ''),
    drive_type: String(data.drive_type || data.category_id || 'baidu'),
    category_id: String(data.category_id || ''),
    category_name: data.category_name ? String(data.category_name) : undefined,
    category_logo: data.category_logo ? String(data.category_logo) : undefined,
    subcategory_id: String(data.subcategory_id || ''),
    icon: String(data.icon || data.category_logo || ''),
    is_pinned: Boolean(data.is_pinned),
    is_featured: Boolean(data.is_favorited),
    click_count: Number(data.click_count) || 0,
    registration_count: Number(data.registration_count) || 0,
    extract_code: String(data.extract_code || ''),
    expires_at: data.expires_at ? String(data.expires_at) : null,
    tags: Array.isArray(data.tags)
      ? (data.tags as Record<string, unknown>[]).map((t: Record<string, unknown>) => ({
          id: String(t.id || ''),
          name: String(t.name || ''),
          color: String(t.color || '#6366F1'),
        }))
      : [],
    keywords: [],
    created_at: String(data.created_at || new Date().toISOString()),
    slug: String(data.slug || ''),
    sort_order: Number(data.sort_order) || 999,
    visible: data.visible !== undefined ? Boolean(data.visible) : true,
  }
}


// ============ Categories API ============

export async function fetchCategories(): Promise<Category[]> {
  if (!isCloudApiConfigured()) return getLocalCategories()

  try {
    const data = await apiFetch<Category[]>('/api/categories')
    log('fetchCategories', data?.length)
    return data.map(c => ({
      id: String(c.id),
      name: c.name,
      icon: 'folder',
      logo_url: c.logo_url,
      sort_order: Number(c.sort_order) || 0,
      is_system: Boolean(c.is_system),
    }))
  } catch (err) {
    console.error('[DataService] fetchCategories error:', err)
    return getLocalCategories()
  }
}

export async function createCategory(name: string, userId?: string): Promise<Category> {
  if (!isCloudApiConfigured()) return addLocalCategory(name)

  try {
    const result = await apiFetch<{ success: boolean; id: string }>('/api/categories', {
      method: 'POST',
      body: JSON.stringify({ name, user_id: userId || '', sort_order: 999 }),
    })
    log('createCategory', name)
    return { id: result.id, name, icon: 'folder', logo_url: null, sort_order: 999 }
  } catch (err) {
    throw err
  }
}

export async function updateCategoryApi(id: string, updates: { name?: string; sort_order?: number }): Promise<void> {
  if (!isCloudApiConfigured()) { updateLocalCategory(id, updates); return }

  try {
    await apiFetch(`/api/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    })
    log('updateCategory', id, updates)
  } catch (err) { throw err }
}

export async function deleteCategoryApi(id: string): Promise<void> {
  if (!isCloudApiConfigured()) { deleteLocalCategory(id); return }

  try {
    await apiFetch(`/api/categories/${id}`, { method: 'DELETE' })
    log('deleteCategory', id)
  } catch (err) { throw err }
}

// ============ Links API ============

export async function fetchLinks(): Promise<LinkItem[]> {
  if (!isCloudApiConfigured()) return getLocalLinks()

  try {
    const data = await apiFetch<Record<string, unknown>[]>('/api/links')
    log('fetchLinks', data?.length)
    return data.map(workerLinkToLinkItem)
  } catch (err) {
    console.error('[DataService] fetchLinks error:', err)
    return getLocalLinks()
  }
}

export async function fetchPublicLinks(): Promise<LinkItem[]> {
  if (!isCloudApiConfigured()) return getLocalLinks()

  try {
    const data = await apiFetch<Record<string, unknown>[]>('/api/links/public')
    return data.map(workerLinkToLinkItem)
  } catch (err) {
    console.error('[DataService] fetchPublicLinks error:', err)
    return getLocalLinks()
  }
}

export async function createLinkApi(linkData: {
  name: string; slug: string; url: string; category_id?: string;
  extract_code?: string; expires_at?: string | null; is_pinned?: boolean;
  is_featured?: boolean; drive_type?: string; subcategory_id?: string;
  icon?: string; description?: string; tags?: string[]; sort_order?: number;
  visible?: boolean;
}, userId?: string): Promise<LinkItem> {
  if (!isCloudApiConfigured()) return addLocalLink(linkData)

  try {
    const data = await apiFetch<Record<string, unknown>>('/api/links', {
      method: 'POST',
      body: JSON.stringify({
        ...linkData,
        user_id: userId || '',
        status: 'active',
      }),
    })
    log('createLink', linkData.name)
    return workerLinkToLinkItem(data)
  } catch (err) { throw err }
}

export async function updateLinkApi(id: string, updates: Record<string, unknown>): Promise<void> {
  if (!isCloudApiConfigured()) { updateLocalLink(id, updates); return }

  try {
    // Convert field names for the worker
    const workerUpdates: Record<string, unknown> = {}
    if (updates.is_featured !== undefined) workerUpdates.is_favorited = updates.is_featured
    for (const [key, val] of Object.entries(updates)) {
      if (key !== 'is_featured') workerUpdates[key] = val
    }
    
    await apiFetch(`/api/links/${id}`, {
      method: 'PUT',
      body: JSON.stringify(workerUpdates),
    })
    log('updateLink', id, Object.keys(workerUpdates))
  } catch (err) { throw err }
}

export async function deleteLinkApi(id: string): Promise<void> {
  if (!isCloudApiConfigured()) { deleteLocalLink(id); return }

  try {
    await apiFetch(`/api/links/${id}`, { method: 'DELETE' })
    log('deleteLink', id)
  } catch (err) { throw err }
}

export async function incrementLinkClicks(id: string): Promise<void> {
  if (!isCloudApiConfigured()) { incrementLocalClicks(id); return }
  // Worker 的 /api/links/public GET 会自动记录点击
  log('incrementClicks', id)
}

// ============ Tags API ============

export async function fetchTags(userId?: string): Promise<Tag[]> {
  if (!isCloudApiConfigured()) return getLocalTags()

  try {
    const data = await apiFetch<Tag[]>('/api/tags')
    return (data || []).map(t => ({
      id: String(t.id), user_id: t.user_id, name: t.name, color: t.color,
      created_at: t.created_at, updated_at: t.updated_at,
    }))
  } catch (err) {
    console.error('[DataService] fetchTags error:', err)
    return getLocalTags()
  }
}

export async function createTagApi(name: string, color: string, userId?: string): Promise<Tag> {
  if (!isCloudApiConfigured()) return addLocalTag(name, color)

  try {
    const result = await apiFetch<{ success: boolean; id: string }>('/api/tags', {
      method: 'POST',
      body: JSON.stringify({ name, color, user_id: userId || '' }),
    })
    return { id: result.id, user_id: userId || '', name, color, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
  } catch (err) { throw err }
}

export async function deleteTagApi(id: string): Promise<void> {
  if (!isCloudApiConfigured()) { deleteLocalTag(id); return }
  
  try {
    await apiFetch(`/api/tags/${id}`, { method: 'DELETE' })
  } catch (err) { throw err }
}

// ============ Dashboard Stats ============

export async function fetchDashboardStats(_userId?: string): Promise<{
  total_links: number; total_clicks: number; total_registrations: number;
  active_links: number; expiring_soon: number; expired_links: number;
  pinned_links: number; favorited_links: number;
}> {
  if (!isCloudApiConfigured()) {
    const links = getLocalLinks()
    return {
      total_links: links.length,
      total_clicks: links.reduce((s, l) => s + l.click_count, 0),
      total_registrations: links.reduce((s, l) => s + l.registration_count, 0),
      active_links: links.length,
      expiring_soon: links.filter(l => l.expires_at && new Date(l.expires_at) < new Date(Date.now() + 7 * 86400000)).length,
      expired_links: links.filter(l => l.expires_at && new Date(l.expires_at) < new Date()).length,
      pinned_links: links.filter(l => l.is_pinned).length,
      favorited_links: links.filter(l => l.is_featured).length,
    }
  }

  try {
    const data = await apiFetch<{
      total_links: number; total_clicks: number; total_categories: number;
      pinned_links: number; favorited_links: number;
    }>('/api/links/stats')

    return {
      total_links: data.total_links || 0,
      total_clicks: data.total_clicks || 0,
      total_registrations: 0,
      active_links: data.total_links || 0,
      expiring_soon: 0,
      expired_links: 0,
      pinned_links: data.pinned_links || 0,
      favorited_links: data.favorited_links || 0,
    }
  } catch (err) {
    console.error('[DataService] fetchStats error:', err)
    throw err
  }
}

// ============ SubCategories (local only) ============

export async function fetchSubCategories(): Promise<SubCategory[]> { return getLocalSubCategories() }
export async function addSubCategoryApi(categoryId: string, name: string): Promise<SubCategory> { return addLocalSubCategory(categoryId, name) }
export async function deleteSubCategoryApi(id: string): Promise<void> { deleteLocalSubCategory(id) }

// ============ DriveTypes (local only) ============

export function fetchDriveTypes(): DriveType[] { return getLocalDriveTypes() }
export function addDriveTypeApi(name: string, icon: string, color: string): DriveType { return addLocalDriveType(name, icon, color) }
export function deleteDriveTypeApi(id: string): void { deleteLocalDriveType(id) }


// ============ 公共接口（给前端页面直接调用）============

export async function getLinkBySlug(slug: string): Promise<LinkItem | null> {
  if (!isCloudApiConfigured()) return null
  
  try {
    const data = await apiFetch<Record<string, unknown>>(`/api/links/public?slug=${encodeURIComponent(slug)}`)
    return data ? workerLinkToLinkItem(data) : null
  } catch { return null }
}

export async function getLinksByCategory(categoryId: string): Promise<LinkItem[]> {
  if (!isCloudApiConfigured()) return getLocalLinks().filter(l => l.category_id === categoryId)
  
  try {
    const data = await apiFetch<Record<string, unknown>[]>(`/api/links?category_id=${categoryId}`)
    return data.map(workerLinkToLinkItem)
  } catch { return [] }
}

export async function recordLinkVisit(_linkId: string, _visitType?: string): Promise<void> {
  // Worker 自动记录，无需额外调用
}

export async function searchLinks(_query: string): Promise<LinkItem[]> {
  if (!isCloudApiConfigured()) return []
  // TODO: 实现搜索（需要在 D1 中创建 FTS5 或用 LIKE 查询）
  return []
}


// ============ localStorage 回退实现 ============

const STORAGE_KEY = 'resource-cloud-storage'
import { mockCategories, mockLinks, mockSubCategories, mockTags, driveTypes, customDriveTypes } from '@/data/mock'

interface LocalStorage {
  categories: Category[]
  links: LinkItem[]
  subCategories: SubCategory[]
  tags: Tag[]
  driveTypes: DriveType[]
  customDriveTypes: Record<string, { name: string; icon: string; color: string }>
}

function loadStorage(): LocalStorage {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed.state) {
        return {
          categories: parsed.state.categories || mockCategories,
          links: (parsed.state.links || mockLinks).map((l: Partial<LinkItem & { tags?: { id: string; name: string; color: string }[] }>) => ({
            ...l,
            sort_order: l.sort_order ?? 999,
            visible: l.visible !== undefined ? l.visible : true,
            tags: l.tags || [],
            keywords: l.keywords || [],
          })),
          subCategories: parsed.state.subCategories || mockSubCategories,
          tags: parsed.state.tags || mockTags,
          driveTypes: parsed.state.driveTypes || driveTypes,
          customDriveTypes: parsed.state.customDriveTypes || customDriveTypes,
        }
      }
      return parsed as LocalStorage
    }
  } catch { /* ignore */ }
  return {
    categories: [...mockCategories],
    links: mockLinks.map(l => ({ ...l, sort_order: l.sort_order ?? 999, visible: l.visible !== undefined ? l.visible : true, tags: l.tags || [] })) as LinkItem[],
    subCategories: [...mockSubCategories],
    tags: [...mockTags],
    driveTypes: [...driveTypes] as DriveType[],
    customDriveTypes: { ...customDriveTypes },
  }
}

function saveStorage(data: LocalStorage): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: data, version: 1 }))
  } catch { /* quota exceeded */ }
}

// Categories - local
function getLocalCategories(): Category[] { return loadStorage().categories }
function addLocalCategory(name: string): Category {
  const storage = loadStorage()
  const cat: Category = { id: Date.now().toString(), name, icon: 'folder', sort_order: storage.categories.length + 1 }
  storage.categories.push(cat)
  saveStorage(storage)
  return cat
}
function updateLocalCategory(id: string, updates: Record<string, unknown>): void {
  const storage = loadStorage()
  storage.categories = storage.categories.map(c => c.id === id ? { ...c, ...updates } : c)
  saveStorage(storage)
}
function deleteLocalCategory(id: string): void {
  const storage = loadStorage()
  storage.categories = storage.categories.filter(c => c.id !== id)
  storage.links = storage.links.map(l => l.category_id === id ? { ...l, category_id: '', subcategory_id: '' } : l)
  storage.subCategories = storage.subCategories.filter(sc => sc.category_id !== id)
  saveStorage(storage)
}

// Links - local
function getLocalLinks(): LinkItem[] { return loadStorage().links }
function addLocalLink(linkData: Record<string, unknown>): LinkItem {
  const storage = loadStorage()
  const maxSort = Math.max(0, ...storage.links.map(l => l.sort_order || 0))
  const link: LinkItem = {
    id: Date.now().toString(),
    name: String(linkData.name || ''),
    title: String(linkData.name || ''),
    description: String(linkData.description || ''),
    url: String(linkData.url || ''),
    drive_type: String(linkData.drive_type || 'baidu'),
    category_id: String(linkData.category_id || ''),
    category_name: undefined,
    category_logo: undefined,
    subcategory_id: String(linkData.subcategory_id || ''),
    icon: String(linkData.icon || ''),
    is_pinned: Boolean(linkData.is_pinned),
    is_featured: Boolean(linkData.is_featured),
    click_count: 0,
    registration_count: 0,
    extract_code: String(linkData.extract_code || ''),
    expires_at: linkData.expires_at ? String(linkData.expires_at) : null,
    tags: [],
    keywords: Array.isArray(linkData.keywords) ? (linkData.keywords as string[]).filter(k => typeof k === 'string') : [],
    created_at: new Date().toISOString(),
    slug: String(linkData.slug || `${Date.now()}`),
    sort_order: Number(linkData.sort_order) || (maxSort + 1),
    visible: linkData.visible !== undefined ? Boolean(linkData.visible) : true,
  }
  storage.links.unshift(link)
  saveStorage(storage)
  return link
}
function updateLocalLink(id: string, updates: Record<string, unknown>): void {
  const storage = loadStorage()
  storage.links = storage.links.map(l => l.id === id ? { ...l, ...updates } as LinkItem : l)
  saveStorage(storage)
}
function deleteLocalLink(id: string): void {
  const storage = loadStorage()
  storage.links = storage.links.filter(l => l.id !== id)
  saveStorage(storage)
}
function incrementLocalClicks(id: string): void {
  const storage = loadStorage()
  storage.links = storage.links.map(l => l.id === id ? { ...l, click_count: l.click_count + 1 } : l)
  saveStorage(storage)
}

// Tags - local
function getLocalTags(): Tag[] { return loadStorage().tags }
function addLocalTag(name: string, color: string): Tag {
  const storage = loadStorage()
  const now = new Date().toISOString()
  const tag: Tag = { id: Date.now().toString(), user_id: '1', name, color, created_at: now, updated_at: now }
  storage.tags.push(tag)
  saveStorage(storage)
  return tag
}
function deleteLocalTag(id: string): void {
  const storage = loadStorage()
  storage.tags = storage.tags.filter(t => t.id !== id)
  storage.links = storage.links.map(l => ({ ...l, tags: l.tags.filter(t => t.id !== id) }))
  saveStorage(storage)
}

// SubCategories - local
function getLocalSubCategories(): SubCategory[] { return loadStorage().subCategories }
function addLocalSubCategory(categoryId: string, name: string): SubCategory {
  const storage = loadStorage()
  const existing = storage.subCategories.filter(sc => sc.category_id === categoryId)
  const sub: SubCategory = { id: Date.now().toString(), category_id: categoryId, name, sort_order: existing.length + 1 }
  storage.subCategories.push(sub)
  saveStorage(storage)
  return sub
}
function deleteLocalSubCategory(id: string): void {
  const storage = loadStorage()
  storage.subCategories = storage.subCategories.filter(sc => sc.id !== id)
  storage.links = storage.links.map(l => l.subcategory_id === id ? { ...l, subcategory_id: '' } : l)
  saveStorage(storage)
}

// DriveTypes - local
function getLocalDriveTypes(): DriveType[] {
  const storage = loadStorage()
  return storage.driveTypes || driveTypes
}
function addLocalDriveType(name: string, icon: string, color: string): DriveType {
  const storage = loadStorage()
  const dt: DriveType = { id: `custom-${Date.now()}`, name, icon, color }
  storage.driveTypes = [...storage.driveTypes, dt]
  saveStorage(storage)
  return dt
}
function deleteLocalDriveType(id: string): void {
  const storage = loadStorage()
  storage.driveTypes = storage.driveTypes.filter(dt => dt.id !== id)
  saveStorage(storage)
}
