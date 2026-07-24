/**
 * 统一数据服务层
 * - 优先使用 Cloudflare Worker + D1 数据库
 * - 未配置时自动回退到 localStorage
 */
// ============ 配置 ============

// Worker API 地址（部署后替换为实际地址）
// 生产环境：Pages Functions 同域名部署，使用相对路径
// 开发环境：通过 Vite proxy 转发 /api 到 Worker
// 也可以通过 VITE_API_BASE_URL 手动指定完整地址
export const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

// 获取认证 token
function getAuthToken(): string | null {
  try { return sessionStorage.getItem('admin_token') } catch { return null }
}

export function isCloudApiConfigured(): boolean {
  // 显式设置了完整的 Worker URL 且不是占位符 = 已配置
  if (API_BASE && !API_BASE.includes('你的用户名')) {return true}
  // 生产环境 + 空 API_BASE = Pages Functions 同域部署 = 已配置
  if (!API_BASE && import.meta.env.PROD) {return true}
  // 开发环境且未配置 = 回退到 localStorage
  return false
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
  _pendingSync?: boolean
}

export interface SubCategory {
  id: string
  category_id: string
  name: string
  sort_order: number
  _pendingSync?: boolean
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
  icon_size?: 'sm' | 'md' | 'lg'
  is_pinned: boolean
  is_featured: boolean
  click_count: number
  registration_count: number
  extract_code: string
  expires_at: string | null
  tags: Array<{ id: string; name: string; color: string }>
  keywords: Array<string>
  created_at: string
  slug: string
  sort_order: number
  visible: boolean
  _pendingSync?: boolean
}

// ============ HTTP 工具函数 ============

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const isWrite = options?.method && ['POST', 'PUT', 'DELETE'].includes(options.method)
  const token = getAuthToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> || {}),
  }
  if (isWrite && token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  // GET 请求：利用 CDN/浏览器缓存，不加时间戳，大幅减少 Functions 调用次数
  // 写请求：加时间戳避免缓存旧数据，确保写后立即读到最新
  const url = isWrite
    ? `${API_BASE}${path}${path.includes('?') ? '&' : '?'}_cb=${Date.now()}`
    : `${API_BASE}${path}${path.includes('?') ? '&' : '?'}_t=1` // 固定的 query param，让 CDN 能命中缓存

  // AbortController 超时控制（15秒）
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 15000)
  const signal = controller.signal

  // 对写请求自动重试（Cloudflare Workers 有 Rate Limit，429 时指数退避）
  const maxRetries = isWrite ? 3 : 0
  let lastErr: Error | undefined

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(url, {
        ...options,
        headers,
        signal,
        // GET 请求允许 CDN 缓存，写请求禁用缓存确保拿到最新数据
        cache: isWrite ? 'no-store' : 'default',
      })

      clearTimeout(timeoutId)

      if (!resp.ok) {
        // 401 = 始终是认证失效
        // 403 = 仅当请求携带了 token 且非 GET 时才判定为认证失效（避免前台公开页受爬虫拦截影响）
        if (resp.status === 401 || (resp.status === 403 && isWrite && token)) {
          try { sessionStorage.removeItem('admin_token') } catch { /* ignore */ }
          if (import.meta.env.DEV) { console.log('[DataService] Auth expired, redirecting to login'); }
          window.location.href = '/admin-login'
          throw new Error('认证已过期，请重新登录')
        }
        const errBody = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }))
        throw new Error(errBody.error || `API error ${resp.status}`)
      }

      return resp.json() as Promise<T>
    } catch (err) {
      clearTimeout(timeoutId)
      if (err instanceof DOMException && err.name === 'AbortError') {
        lastErr = new Error('请求超时，请检查网络连接后重试')
      } else {
        lastErr = err instanceof Error ? err : new Error(String(err))
      }
      const isRateLimit = lastErr.message.includes('请求过于频繁') || lastErr.message.includes('429')
      if (isWrite && isRateLimit && attempt < maxRetries) {
        const delay = 1000 * Math.pow(2, attempt) // 1s, 2s, 4s
        if (import.meta.env.DEV) {console.log(`[DataService] apiFetch 429 重试 ${attempt + 1}/${maxRetries}，等待 ${delay}ms`)}
        await new Promise(r => setTimeout(r, delay))
        continue
      }
      throw lastErr
    }
  }

  throw lastErr || new Error('API request failed')
}

const log = (action: string, ...args: Array<unknown>) => {
  if (import.meta.env.DEV) {
    console.log(`[DataService] ${isCloudApiConfigured() ? '☁️ D1-Worker' : '💾 localStorage'} - ${action}`, ...args)
  }
}

// ============ 数据转换 ============

function parseKeywords(raw: unknown): Array<string> {
  if (Array.isArray(raw)) {return raw.map(k => String(k).trim()).filter(Boolean)}
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {return parsed.map((k: unknown) => String(k).trim()).filter(Boolean)}
    } catch { /* not JSON */ }
    return raw.split(',').map(k => k.trim()).filter(Boolean)
  }
  return []
}

function workerLinkToLinkItem(data: Record<string, unknown>): LinkItem {
  return {
    id: String(data.id || ''),
    name: String(data.name || ''),
    title: String(data.name || ''),
    description: typeof data.description === 'string' ? data.description : '',
    url: String(data.url || ''),
    drive_type: String(data.drive_type || 'baidu'),
    category_id: String(data.category_id || ''),
    category_name: data.category_name ? String(data.category_name) : undefined,
    category_logo: data.category_logo ? String(data.category_logo) : undefined,
    subcategory_id: String(data.subcategory_id || ''),
    icon: String(data.icon || data.category_logo || ''),
    icon_size: (['sm', 'md', 'lg'].includes(String(data.icon_size)) ? String(data.icon_size) : undefined) as 'sm' | 'md' | 'lg' | undefined,
    is_pinned: Boolean(data.is_pinned),
    is_featured: Boolean(data.is_favorited),
    click_count: Number(data.click_count) || 0,
    registration_count: Number(data.registration_count) || 0,
    extract_code: String(data.extract_code || ''),
    expires_at: data.expires_at ? String(data.expires_at) : null,
    tags: Array.isArray(data.tags)
      ? (data.tags as Array<Record<string, unknown>>).map((t: Record<string, unknown>) => ({
          id: String(t.id || ''),
          name: String(t.name || ''),
          color: String(t.color || '#6366F1'),
        }))
      : [],
    keywords: parseKeywords(data.keywords),
    created_at: String(data.created_at || new Date().toISOString()),
    slug: String(data.slug || ''),
    sort_order: Number(data.sort_order) || 999,
    visible: data.visible !== undefined ? Boolean(data.visible) : true,
  }
}


// ============ Categories API ============

export async function fetchCategories(): Promise<Array<Category>> {
  if (!isCloudApiConfigured()) {return getLocalCategories()}

  try {
    const data = await apiFetch<Array<Category>>('/api/categories')
    log('fetchCategories', data?.length)
    return (data || []).map(c => ({
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
  if (!isCloudApiConfigured()) {return addLocalCategory(name)}

  const result = await apiFetch<{ success: boolean; id: string }>('/api/categories', {
    method: 'POST',
    body: JSON.stringify({ name, user_id: userId || '' }),
  })
  log('createCategory', name)
  return { id: result.id, name, icon: 'folder', logo_url: null, sort_order: 0 }
}

export async function updateCategoryApi(id: string, updates: { name?: string; sort_order?: number }): Promise<void> {
  if (!isCloudApiConfigured()) { updateLocalCategory(id, updates); return }

  await apiFetch(`/api/categories/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  })
  log('updateCategory', id, updates)
}

export async function deleteCategoryApi(id: string): Promise<void> {
  if (!isCloudApiConfigured()) { deleteLocalCategory(id); return }

  await apiFetch(`/api/categories/${id}`, { method: 'DELETE' })
  log('deleteCategory', id)
}

// ============ Links API ============

export async function fetchLinks(): Promise<Array<LinkItem>> {
  if (!isCloudApiConfigured()) {return getLocalLinks()}

  try {
    const data = await apiFetch<Array<Record<string, unknown>>>('/api/links')
    log('fetchLinks', data?.length)
    return (data || []).map(workerLinkToLinkItem)
  } catch (err) {
    console.error('[DataService] fetchLinks error:', err)
    return getLocalLinks()
  }
}

export async function fetchPublicLinks(): Promise<Array<LinkItem>> {
  if (!isCloudApiConfigured()) {return getLocalLinks()}

  try {
    const data = await apiFetch<Array<Record<string, unknown>>>('/api/links/public')
    return (data || []).map(workerLinkToLinkItem)
  } catch (err) {
    console.error('[DataService] fetchPublicLinks error:', err)
    return getLocalLinks()
  }
}

export async function createLinkApi(linkData: {
  name: string; slug: string; url: string; category_id?: string;
  extract_code?: string; expires_at?: string | null; is_pinned?: boolean;
  is_featured?: boolean; drive_type?: string; subcategory_id?: string;
  icon?: string; description?: string; tags?: Array<string>; sort_order?: number;
  visible?: boolean; keywords?: Array<string>;
}, userId?: string): Promise<LinkItem> {
  if (!isCloudApiConfigured()) {return addLocalLink(linkData)}

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
}

export async function updateLinkApi(id: string, updates: Record<string, unknown>): Promise<void> {
  if (!isCloudApiConfigured()) { updateLocalLink(id, updates); return }

  // Convert field names for the worker
  const workerUpdates: Record<string, unknown> = {}
  if (updates.is_featured !== undefined) {workerUpdates.is_favorited = updates.is_featured}
  for (const [key, val] of Object.entries(updates)) {
    if (key !== 'is_featured') {workerUpdates[key] = val}
  }

  await apiFetch(`/api/links/${id}`, {
    method: 'PUT',
    body: JSON.stringify(workerUpdates),
  })
  log('updateLink', id, Object.keys(workerUpdates))
}

export async function deleteLinkApi(id: string): Promise<void> {
  if (!isCloudApiConfigured()) { deleteLocalLink(id); return }

  await apiFetch(`/api/links/${id}`, { method: 'DELETE' })
  log('deleteLink', id)
}

export async function incrementLinkClicks(id: string): Promise<void> {
  if (!isCloudApiConfigured()) { incrementLocalClicks(id); return }
  // 通过公开 POST API 记录点击（无需认证，best-effort）
  try {
    await apiFetch(`/api/links/${id}/click`, { method: 'POST' })
    log('incrementClicks', id)
  } catch { /* ignore - 点击记录为 best-effort */ }
}

// ============ Tags API ============

export async function fetchTags(_userId?: string): Promise<Array<Tag>> {
  if (!isCloudApiConfigured()) {return getLocalTags()}

  try {
    const data = await apiFetch<Array<Tag>>('/api/tags')
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
  if (!isCloudApiConfigured()) {return addLocalTag(name, color)}

  const result = await apiFetch<{ success: boolean; id: string }>('/api/tags', {
    method: 'POST',
    body: JSON.stringify({ name, color, user_id: userId || '' }),
  })
  return { id: result.id, user_id: userId || '', name, color, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
}

export async function updateTagApi(id: string, updates: { name?: string; color?: string }): Promise<void> {
  if (!isCloudApiConfigured()) { updateLocalTag(id, updates); return }
  await apiFetch(`/api/tags/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  })
}

export async function deleteTagApi(id: string): Promise<void> {
  if (!isCloudApiConfigured()) { deleteLocalTag(id); return }

  await apiFetch(`/api/tags/${id}`, { method: 'DELETE' })
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
      total_registrations: number; pinned_links: number; favorited_links: number;
      expiring_soon: number; expired_links: number;
    }>('/api/links/stats')

    return {
      total_links: data.total_links || 0,
      total_clicks: data.total_clicks || 0,
      total_registrations: data.total_registrations || 0,
      active_links: data.total_links || 0,
      expiring_soon: data.expiring_soon || 0,
      expired_links: data.expired_links || 0,
      pinned_links: data.pinned_links || 0,
      favorited_links: data.favorited_links || 0,
    }
  } catch (err) {
    console.error('[DataService] fetchStats error, falling back to local:', err)
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
}

// ============ SubCategories API ============

export async function fetchSubCategories(): Promise<Array<SubCategory>> {
  if (!isCloudApiConfigured()) {return getLocalSubCategories()}

  try {
    const data = await apiFetch<Array<SubCategory>>('/api/subcategories')
    log('fetchSubCategories', data?.length)
    return (data || []).map(sc => ({
      id: String(sc.id),
      category_id: String(sc.category_id),
      name: sc.name,
      sort_order: Number(sc.sort_order) || 0,
    }))
  } catch (err) {
    console.error('[DataService] fetchSubCategories error:', err)
    return getLocalSubCategories()
  }
}

// ===== 合并查询：一次请求获取所有核心数据，减少 Workers 冷启动 =====
export interface AllData {
  categories: Array<Category>
  links: Array<LinkItem>
  subcategories: Array<SubCategory>
  tags: Array<Tag>
}
export async function fetchAll(): Promise<AllData | null> {
  if (!isCloudApiConfigured()) {return null}

  try {
    const data = await apiFetch<{
      categories: Array<Record<string, unknown>>
      links: Array<Record<string, unknown>>
      subcategories: Array<Record<string, unknown>>
      tags: Array<Record<string, unknown>>
    }>('/api/all')
    log('fetchAll', data.categories?.length, data.links?.length, data.subcategories?.length)
    return {
      categories: (data.categories || []).map(c => ({
        id: String(c.id),
        name: c.name as string,
        icon: (c.icon as string) || 'folder',
        logo_url: (c.logo_url as string) || null,
        sort_order: Number(c.sort_order || 0),
        is_system: Boolean(c.is_system),
        created_at: (c.created_at as string) || new Date().toISOString(),
        updated_at: (c.updated_at as string) || new Date().toISOString(),
      })),
      links: (data.links || []).map(workerLinkToLinkItem),
      subcategories: (data.subcategories || []).map(sc => ({
        id: String(sc.id),
        category_id: String(sc.category_id),
        name: sc.name as string,
        sort_order: Number(sc.sort_order || 0),
        created_at: (sc.created_at as string) || new Date().toISOString(),
        updated_at: (sc.updated_at as string) || new Date().toISOString(),
      })),
      tags: (data.tags || []).map(t => ({
        id: String(t.id),
        user_id: String(t.user_id || '1'),
        name: t.name as string,
        color: (t.color as string) || '#6B7280',
        created_at: (t.created_at as string) || new Date().toISOString(),
        updated_at: (t.updated_at as string) || new Date().toISOString(),
      })),
    }
  } catch (err) {
    console.error('[DataService] fetchAll error:', err)
    return null
  }
}

export async function addSubCategoryApi(categoryId: string, name: string): Promise<SubCategory> {
  if (!isCloudApiConfigured()) {return addLocalSubCategory(categoryId, name)}

  const result = await apiFetch<{ success: boolean; id: string }>('/api/subcategories', {
    method: 'POST',
    body: JSON.stringify({ category_id: categoryId, name }),
  })
  return { id: result.id, category_id: categoryId, name, sort_order: 0 }
}

export async function updateSubCategoryApi(id: string, updates: Partial<SubCategory>): Promise<void> {
  if (!isCloudApiConfigured()) { updateLocalSubCategory(id, updates); return }

  await apiFetch(`/api/subcategories/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  })
  log('updateSubCategory', id, updates)
}

export async function deleteSubCategoryApi(id: string): Promise<void> {
  if (!isCloudApiConfigured()) { deleteLocalSubCategory(id); return }

  await apiFetch(`/api/subcategories/${id}`, { method: 'DELETE' })
  log('deleteSubCategory', id)
}

// ============ DriveTypes (cloud + local) ============

export async function fetchDriveTypes(settings?: SiteSettings): Promise<Array<DriveType>> {
  const base = [...FALLBACK_DRIVE_TYPES]
  
  if (!isCloudApiConfigured()) {
    const local = getLocalDriveTypes()
    const custom = local.filter(dt => !base.find(b => b.id === dt.id))
    return [...base, ...custom]
  }
  
  try {
    const siteSettings = settings || await fetchSiteSettings()
    const cloudCustom: Array<DriveType> = (siteSettings as Record<string, unknown>).drive_types as Array<DriveType> || []
    if (cloudCustom.length > 0) {
      const customMap = new Map(cloudCustom.map(dt => [dt.id, dt]))
      // Deduplicate: cloud types override local with same id
      const local = getLocalDriveTypes()
      const localCustom = local.filter(dt => !base.find(b => b.id === dt.id) && !customMap.has(dt.id))
      return [...base, ...cloudCustom, ...localCustom]
    }
    const local = getLocalDriveTypes()
    const custom = local.filter(dt => !base.find(b => b.id === dt.id))
    return [...base, ...custom]
  } catch {
    const local = getLocalDriveTypes()
    const custom = local.filter(dt => !base.find(b => b.id === dt.id))
    return [...base, ...custom]
  }
}

export async function addDriveTypeApi(name: string, icon: string, color: string): Promise<DriveType> {
  const dt: DriveType = { id: `custom-${Date.now()}`, name, icon, color }

  if (!isCloudApiConfigured()) {
    addLocalDriveType(name, icon, color)
    return dt
  }

  const settings = await fetchSiteSettings()
  const driveTypes: Array<DriveType> = (settings as Record<string, unknown>).drive_types as Array<DriveType> || []
  driveTypes.push(dt)
  await updateSiteSettings({ drive_types: driveTypes } as unknown as SiteSettings)
  addLocalDriveType(name, icon, color)
  return dt
}

export async function deleteDriveTypeApi(id: string): Promise<void> {
  if (!isCloudApiConfigured()) {
    deleteLocalDriveType(id)
    return
  }

  const settings = await fetchSiteSettings()
  const driveTypes: Array<DriveType> = (settings as Record<string, unknown>).drive_types as Array<DriveType> || []
  const updated = driveTypes.filter(dt => dt.id !== id)
  await updateSiteSettings({ drive_types: updated } as unknown as SiteSettings)
  deleteLocalDriveType(id)
}


// ============ 公共接口（给前端页面直接调用）============

export async function getLinkBySlug(slug: string): Promise<LinkItem | null> {
  if (!isCloudApiConfigured()) {return null}
  
  try {
    const data = await apiFetch<Record<string, unknown>>(`/api/links/public?slug=${encodeURIComponent(slug)}`)
    return data ? workerLinkToLinkItem(data) : null
  } catch { return null }
}

export async function getLinksByCategory(categoryId: string): Promise<Array<LinkItem>> {
  if (!isCloudApiConfigured()) {return getLocalLinks().filter(l => l.category_id === categoryId)}
  
  try {
    const data = await apiFetch<Array<Record<string, unknown>>>(`/api/links?category_id=${categoryId}`)
    return (data || []).map(workerLinkToLinkItem)
  } catch { return [] }
}

export async function recordLinkVisit(_linkId: string, _visitType?: string): Promise<void> {
  // Worker 自动记录，无需额外调用
}

export async function searchLinks(query: string): Promise<Array<LinkItem>> {
  if (!isCloudApiConfigured()) {
    // 本地搜索：在 localStorage 中模糊匹配
    const links = getLocalLinks()
    const q = query.toLowerCase()
    return links.filter(l =>
      l.name.toLowerCase().includes(q) ||
      l.description?.toLowerCase().includes(q)
    )
  }
  try {
    const data = await apiFetch<Array<Record<string, unknown>>>(`/api/links/search?q=${encodeURIComponent(query)}`)
    return (data || []).map(workerLinkToLinkItem)
  } catch (err) {
    console.error('[DataService] searchLinks error:', err)
    return []
  }
}


// ============ localStorage 回退实现 ============

const STORAGE_KEY = 'resource-cloud-storage'

export const FALLBACK_DRIVE_TYPES: Array<DriveType> = [
  { id: 'baidu', name: '百度网盘', icon: 'hard-drive', color: '#3B82F6' },
  { id: 'quark', name: '夸克网盘', icon: 'hard-drive', color: '#F59E0B' },
  { id: 'ali', name: '阿里云盘', icon: 'hard-drive', color: '#06B6D4' },
  { id: 'lanzou', name: '蓝奏云', icon: 'hard-drive', color: '#10B981' },
  { id: 'xunlei', name: '迅雷云盘', icon: 'hard-drive', color: '#6366F1' },
  { id: '115', name: '115网盘', icon: 'hard-drive', color: '#EC4899' },
]

interface LocalStorage {
  categories: Array<Category>
  links: Array<LinkItem>
  subCategories: Array<SubCategory>
  tags: Array<Tag>
  driveTypes: Array<DriveType>
  customDriveTypes: Record<string, { name: string; icon: string; color: string }>
}

function loadStorage(): LocalStorage {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed.state) {
        return {
          categories: parsed.state.categories || [],
          links: (parsed.state.links || []).map((l: Partial<LinkItem & { tags?: Array<{ id: string; name: string; color: string }> }>) => ({
            ...l,
            sort_order: l.sort_order ?? 999,
            visible: l.visible !== undefined ? l.visible : true,
            tags: l.tags || [],
            keywords: l.keywords || [],
          })),
          subCategories: parsed.state.subCategories || [],
          tags: parsed.state.tags || [],
          driveTypes: parsed.state.driveTypes || FALLBACK_DRIVE_TYPES,
          customDriveTypes: parsed.state.customDriveTypes || {},
        }
      }
      return parsed as LocalStorage
    }
  } catch { /* ignore */ }
  return {
    categories: [],
    links: [],
    subCategories: [],
    tags: [],
    driveTypes: [...FALLBACK_DRIVE_TYPES] as Array<DriveType>,
    customDriveTypes: {},
  }
}

function saveStorage(data: LocalStorage): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: data, version: 1 }))
  } catch { /* quota exceeded */ }
}

// Categories - local
function getLocalCategories(): Array<Category> { return loadStorage().categories }
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
function getLocalLinks(): Array<LinkItem> { return loadStorage().links }
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
    keywords: Array.isArray(linkData.keywords) ? (linkData.keywords as Array<string>).filter(k => typeof k === 'string') : [],
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
function getLocalTags(): Array<Tag> { return loadStorage().tags }
function addLocalTag(name: string, color: string): Tag {
  const storage = loadStorage()
  const now = new Date().toISOString()
  const tag: Tag = { id: Date.now().toString(), user_id: '1', name, color, created_at: now, updated_at: now }
  storage.tags.push(tag)
  saveStorage(storage)
  return tag
}
function updateLocalTag(id: string, updates: { name?: string; color?: string }): void {
  const storage = loadStorage()
  storage.tags = storage.tags.map(t => t.id === id ? { ...t, ...updates, updated_at: new Date().toISOString() } : t)
  saveStorage(storage)
}

function deleteLocalTag(id: string): void {
  const storage = loadStorage()
  storage.tags = storage.tags.filter(t => t.id !== id)
  storage.links = storage.links.map(l => ({ ...l, tags: l.tags.filter(t => t.id !== id) }))
  saveStorage(storage)
}

// SubCategories - local
function getLocalSubCategories(): Array<SubCategory> { return loadStorage().subCategories }
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

function updateLocalSubCategory(id: string, updates: Partial<SubCategory>): void {
  const storage = loadStorage()
  storage.subCategories = storage.subCategories.map(sc =>
    sc.id === id ? { ...sc, ...updates } as SubCategory : sc
  )
  saveStorage(storage)
}

// DriveTypes - local
function getLocalDriveTypes(): Array<DriveType> {
  const storage = loadStorage()
  return storage.driveTypes || FALLBACK_DRIVE_TYPES
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

// ============ Site Settings API ============

export interface LogoItem {
  url: string
  name: string
  added_at: string
}

export interface ColorScheme {
  name: string
  primary: string
  secondary: string
  accent: string
  lightest: string
  darkest: string
  saved_at: string
}

export interface IconLibraryItem {
  id: string
  name: string
  dataUrl: string
  size: number
  created_at: string
}

export interface FaviconItem {
  url: string
  name: string
  added_at: string
}

export interface SiteSettings {
  current_logo_type?: 'text' | 'image'
  current_logo_text?: string
  current_logo_url?: string
  logo_library?: Array<LogoItem>
  current_favicon_url?: string
  favicon_library?: Array<FaviconItem>
  icon_library?: Array<IconLibraryItem>
  current_colors?: Omit<ColorScheme, 'name' | 'saved_at'>
  color_history?: Array<ColorScheme>
  site_name?: string
  site_description?: string
  drive_types?: Array<DriveType>
}

// 本地 site settings 回退
const SS_KEY = 'panlink_site_settings'

function getLocalSiteSettings(): SiteSettings {
  try {
    const raw = localStorage.getItem(SS_KEY)
    if (raw) {return JSON.parse(raw)}
  } catch { /* ignore */ }
  return {
    current_logo_type: 'text',
    current_logo_text: 'Pan Link',
    current_logo_url: '',
    logo_library: [],
    icon_library: [],
    current_colors: {
      primary: '#6366F1',
      secondary: '#818CF8',
      accent: '#A5B4FC',
      lightest: '#F5F3FF',
      darkest: '#1E1B4B',
    },
    color_history: [],
    site_name: '资源云',
    site_description: '全网资源交流分享',
  }
}

function saveLocalSiteSettings(settings: SiteSettings): void {
  try {
    localStorage.setItem(SS_KEY, JSON.stringify(settings))
  } catch { /* ignore */ }
}

// ============ 内存缓存 + 请求去重 ============
// 避免短时间内重复请求 /api/site-settings，减少 Workers 调用次数
let _siteSettingsCache: { data: SiteSettings; timestamp: number } | null = null
let _siteSettingsPromise: Promise<SiteSettings> | null = null
const SETTINGS_CACHE_TTL = 30_000 // 30 秒

export function fetchSiteSettings(): Promise<SiteSettings> {
  // 1. 优先返回内存缓存（30 秒内有效）
  if (_siteSettingsCache && (Date.now() - _siteSettingsCache.timestamp) < SETTINGS_CACHE_TTL) {
    return Promise.resolve(_siteSettingsCache.data)
  }

  // 2. 如果有正在进行的请求，复用同一个 Promise（避免并发重复请求）
  if (_siteSettingsPromise) {
    return _siteSettingsPromise
  }

  if (!isCloudApiConfigured()) {return Promise.resolve(getLocalSiteSettings())}

  // 3. 发起新请求，Promise 存入全局变量用于去重
  _siteSettingsPromise = (async () => {
    try {
      const data = await apiFetch<SiteSettings>('/api/site-settings')
      // 深度合并：云端有值的字段优先，空值/null/undefined 回退到本地
      const local = getLocalSiteSettings()
      const result = { ...local }
      for (const key of Object.keys(data) as Array<keyof SiteSettings>) {
        const val = data[key]
        if (val !== null && val !== undefined && !(typeof val === 'string' && val === '')) {
          result[key] = val as never
        }
      }
      // 存入内存缓存
      _siteSettingsCache = { data: result, timestamp: Date.now() }
      return result
    } catch (err) {
      console.error('[DataService] fetchSiteSettings error:', err)
      // 错误时也返回缓存（如果有），避免雪崩
      if (_siteSettingsCache) {return _siteSettingsCache.data}
      return getLocalSiteSettings()
    } finally {
      _siteSettingsPromise = null
    }
  })()

  return _siteSettingsPromise
}

/** 清除 siteSettings 内存缓存（写入后调用，确保后续读最新的数据） */
export function invalidateSiteSettingsCache(): void {
  _siteSettingsCache = null
}

export async function updateSiteSettings(updates: Partial<SiteSettings>): Promise<void> {
  if (!isCloudApiConfigured()) {
    const local = getLocalSiteSettings()
    const merged = { ...local, ...updates }
    saveLocalSiteSettings(merged)
    invalidateSiteSettingsCache()
    return
  }

  // 转换为 key-value 格式发送给 API
  const payload: Record<string, string> = {}
  for (const [key, value] of Object.entries(updates)) {
    payload[key] = typeof value === 'string' ? value : JSON.stringify(value)
  }
  await apiFetch('/api/site-settings', {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
  // 同步到本地缓存并清除内存缓存，确保下次读取最新数据
  const local = getLocalSiteSettings()
  saveLocalSiteSettings({ ...local, ...updates })
  invalidateSiteSettingsCache()
}

export async function addLogoToLibrary(url: string, name: string): Promise<Array<LogoItem>> {
  const newLogo: LogoItem = { url, name, added_at: new Date().toISOString() }

  if (!isCloudApiConfigured()) {
    const local = getLocalSiteSettings()
    local.logo_library = [...(local.logo_library || []), newLogo]
    saveLocalSiteSettings(local)
    return local.logo_library
  }

  const data = await apiFetch<{ success: boolean; library: Array<LogoItem> }>('/api/site-settings/logo', {
    method: 'POST',
    body: JSON.stringify({ url, name }),
  })
  const local = getLocalSiteSettings()
  local.logo_library = data.library
  saveLocalSiteSettings(local)
  return data.library
}

export async function deleteLogoFromLibrary(urlOrIndex: string | number): Promise<Array<LogoItem>> {
  if (!isCloudApiConfigured()) {
    const local = getLocalSiteSettings()
    let library = local.logo_library || []
    if (typeof urlOrIndex === 'number') {
      library = library.filter((_, i) => i !== urlOrIndex)
    } else {
      library = library.filter(l => l.url !== urlOrIndex)
    }
    local.logo_library = library
    saveLocalSiteSettings(local)
    return library
  }

  const params = typeof urlOrIndex === 'number'
    ? `?index=${urlOrIndex}`
    : `?url=${encodeURIComponent(urlOrIndex)}`
  const data = await apiFetch<{ success: boolean; library: Array<LogoItem> }>(`/api/site-settings/logo${params}`, {
    method: 'DELETE',
  })
  const local = getLocalSiteSettings()
  local.logo_library = data.library
  saveLocalSiteSettings(local)
  return data.library
}

export async function addFaviconToLibrary(url: string, name: string): Promise<Array<FaviconItem>> {
  const newItem: FaviconItem = { url, name, added_at: new Date().toISOString() }

  if (!isCloudApiConfigured()) {
    const local = getLocalSiteSettings()
    local.favicon_library = [...(local.favicon_library || []), newItem]
    local.current_favicon_url = url
    saveLocalSiteSettings(local)
    return local.favicon_library
  }

  const data = await apiFetch<{ success: boolean; library: Array<FaviconItem> }>('/api/site-settings/favicon', {
    method: 'POST',
    body: JSON.stringify({ url, name }),
  })
  const local = getLocalSiteSettings()
  local.favicon_library = data.library
  local.current_favicon_url = url
  saveLocalSiteSettings(local)
  return data.library
}

export async function deleteFaviconFromLibrary(urlOrIndex: string | number): Promise<Array<FaviconItem>> {
  if (!isCloudApiConfigured()) {
    const local = getLocalSiteSettings()
    let library = local.favicon_library || []
    const removed = typeof urlOrIndex === 'number'
      ? library[urlOrIndex]
      : library.find(l => l.url === urlOrIndex)

    if (typeof urlOrIndex === 'number') {
      library = library.filter((_, i) => i !== urlOrIndex)
    } else {
      library = library.filter(l => l.url !== urlOrIndex)
    }
    local.favicon_library = library
    if (removed && local.current_favicon_url === removed.url) {
      local.current_favicon_url = '/favicon.png'
    }
    saveLocalSiteSettings(local)
    return library
  }

  const params = typeof urlOrIndex === 'number'
    ? `?index=${urlOrIndex}`
    : `?url=${encodeURIComponent(urlOrIndex)}`
  const data = await apiFetch<{ success: boolean; library: Array<FaviconItem> }>(`/api/site-settings/favicon${params}`, {
    method: 'DELETE',
  })
  const local = getLocalSiteSettings()
  local.favicon_library = data.library
  saveLocalSiteSettings(local)
  return data.library
}

// ============ Account Password ============

/**
 * 修改管理员登录凭证（用户名和密码）
 * 云端：调用 Cloudflare Pages Functions API，存入 D1 admin_config 表
 * 本地：当云端不可用时返回 false，由调用方回退到 localStorage
 */
export async function changeAdminPassword(
  currentPassword: string,
  newPassword: string,
  newUsername: string,
): Promise<{ success: boolean; error?: string; username?: string }> {
  if (!isCloudApiConfigured()) { return { success: false, error: '云端 API 未配置' } }
  try {
    const data = await apiFetch<{ success: boolean; username: string }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword, newUsername }),
    })
    return { success: true, username: data.username }
  } catch (error) {
    log('changeAdminPassword error', error)
    return { success: false, error: '修改密码失败，请检查当前密码是否正确' }
  }
}
