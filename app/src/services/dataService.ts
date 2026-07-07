/**
 * 统一数据服务层
 * - 当配置了 Supabase 环境变量时，使用 Supabase (PostgreSQL) 作为主存储
 * - 未配置时自动回退到 localStorage
 * - 所有前端页面通过此服务进行 CRUD 操作，无需关心后端实现
 */
import { supabase } from '@/lib/supabase'

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

// ============ Supabase 是否可用 ============

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export function isSupabaseConfigured(): boolean {
  return !!(
    SUPABASE_URL &&
    SUPABASE_KEY &&
    SUPABASE_URL !== 'https://your-project.supabase.co' &&
    SUPABASE_KEY !== 'your-anon-key'
  )
}

// ============ 调试日志 ============

const log = (action: string, ...args: unknown[]) => {
  if (import.meta.env.DEV) {
    console.log(`[DataService] ${isSupabaseConfigured() ? '🔷 Supabase' : '💾 localStorage'} - ${action}`, ...args)
  }
}

// ============ 数据转换 ============

function supabaseLinkToLinkItem(data: Record<string, unknown>): LinkItem {
  const rawTags = Array.isArray(data.link_tags)
    ? data.link_tags.map((lt: Record<string, unknown>) => lt?.tag).filter(Boolean)
    : Array.isArray(data.tags)
      ? data.tags
      : []
  const tags = rawTags.map((t: Record<string, unknown>) => ({
    id: String(t?.id || ''),
    name: String(t?.name || ''),
    color: String(t?.color || '#6366F1'),
  }))

  return {
    id: String(data.id || ''),
    name: String(data.name || ''),
    title: String(data.name || ''),
    description: typeof data.description === 'string' ? data.description : '',
    url: String(data.url || ''),
    drive_type: String(data.drive_type || data.category_id || 'baidu'),
    category_id: String(data.category_id || ''),
    category_name: data.category_name ? String(data.category_name) : data.category ? String((data.category as Record<string, unknown>)?.name || '') : undefined,
    category_logo: data.category_logo ? String(data.category_logo) : data.category ? String((data.category as Record<string, unknown>)?.logo_url || '') : undefined,
    subcategory_id: String(data.subcategory_id || ''),
    icon: String(data.icon || data.category_logo || ''),
    is_pinned: Boolean(data.is_pinned),
    is_featured: Boolean(data.is_favorited) || Boolean(data.is_featured),
    click_count: Number(data.click_count) || 0,
    registration_count: Number(data.registration_count) || 0,
    extract_code: String(data.extract_code || ''),
    expires_at: data.expires_at ? String(data.expires_at) : null,
    tags,
    created_at: String(data.created_at || new Date().toISOString()),
    slug: String(data.slug || ''),
    sort_order: Number(data.sort_order) || 999,
    visible: data.visible !== undefined ? Boolean(data.visible) : true,
    keywords: Array.isArray(data.keywords) ? data.keywords.filter((k: unknown) => typeof k === 'string') : [],
  }
}

// ============ Categories API ============

export async function fetchCategories(): Promise<Category[]> {
  if (!isSupabaseConfigured()) return getLocalCategories()

  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('[DataService] fetchCategories error:', error)
    return getLocalCategories()
  }
  log('fetchCategories', data?.length)
  return (data || []).map(c => ({
    id: String(c.id),
    name: String(c.name),
    icon: 'folder',
    logo_url: c.logo_url,
    sort_order: Number(c.sort_order) || 0,
    is_system: Boolean(c.is_system),
  }))
}

export async function createCategory(name: string, userId?: string): Promise<Category> {
  if (!isSupabaseConfigured()) return addLocalCategory(name)

  const { data, error } = await supabase
    .from('categories')
    .insert({
      name,
      user_id: userId || null,
      sort_order: 999,
      is_system: false,
    })
    .select()
    .single()

  if (error) throw error
  log('createCategory', name)
  return { id: String(data.id), name: data.name, icon: 'folder', logo_url: data.logo_url, sort_order: data.sort_order, is_system: data.is_system }
}

export async function updateCategoryApi(id: string, updates: { name?: string; sort_order?: number }): Promise<void> {
  if (!isSupabaseConfigured()) { updateLocalCategory(id, updates); return }

  const { error } = await supabase
    .from('categories')
    .update(updates)
    .eq('id', id)

  if (error) throw error
  log('updateCategory', id, updates)
}

export async function deleteCategoryApi(id: string): Promise<void> {
  if (!isSupabaseConfigured()) { deleteLocalCategory(id); return }

  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', id)

  if (error) throw error
  log('deleteCategory', id)
}

// ============ Links API ============

export async function fetchLinks(): Promise<LinkItem[]> {
  if (!isSupabaseConfigured()) return getLocalLinks()

  const { data, error } = await supabase
    .from('links')
    .select(`*, category:categories(name, logo_url), link_tags(tag:tags(*))`)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[DataService] fetchLinks error:', error)
    return getLocalLinks()
  }
  log('fetchLinks', data?.length)
  return (data || []).map(supabaseLinkToLinkItem)
}

export async function fetchPublicLinks(): Promise<LinkItem[]> {
  if (!isSupabaseConfigured()) return getLocalLinks()

  const { data, error } = await supabase
    .from('links')
    .select(`*, category:categories(name, logo_url), link_tags(tag:tags(*))`)
    .eq('status', 'active')
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[DataService] fetchPublicLinks error:', error)
    return getLocalLinks()
  }
  return (data || []).map(supabaseLinkToLinkItem)
}

export async function createLinkApi(linkData: {
  name: string; slug: string; url: string; category_id?: string;
  extract_code?: string; expires_at?: string | null; is_pinned?: boolean;
  is_featured?: boolean; drive_type?: string; subcategory_id?: string;
  icon?: string; description?: string; tags?: string[]; sort_order?: number;
  visible?: boolean;
}, userId?: string): Promise<LinkItem> {
  if (!isSupabaseConfigured()) return addLocalLink(linkData)

  const { data, error } = await supabase
    .from('links')
    .insert({
      user_id: userId || '00000000-0000-0000-0000-000000000000',
      name: linkData.name,
      slug: linkData.slug || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url: linkData.url,
      category_id: linkData.category_id || null,
      extract_code: linkData.extract_code || null,
      expires_at: linkData.expires_at || null,
      is_pinned: linkData.is_pinned || false,
      is_favorited: linkData.is_featured || false,
      status: 'active',
      validity_period: linkData.expires_at ? '1_year' : 'permanent',
      sort_order: linkData.sort_order ?? 999,
      visible: linkData.visible !== undefined ? linkData.visible : true,
    })
    .select(`*, category:categories(name, logo_url)`)
    .single()

  if (error) throw error
  log('createLink', linkData.name)

  // Insert tag associations if tags provided
  if (linkData.tags && linkData.tags.length > 0 && data) {
    const tagRelations = linkData.tags.map(tagId => ({
      link_id: data.id,
      tag_id: tagId,
    }))
    const { error: tagErr } = await supabase.from('link_tags').insert(tagRelations)
    if (tagErr) console.error('[DataService] link_tags insert error:', tagErr)
  }

  return supabaseLinkToLinkItem(data)
}

export async function updateLinkApi(id: string, updates: Record<string, unknown>): Promise<void> {
  if (!isSupabaseConfigured()) { updateLocalLink(id, updates); return }

  // Map UI field names to Supabase field names
  const supabaseUpdates: Record<string, unknown> = {}
  if (updates.name !== undefined) supabaseUpdates.name = updates.name
  if (updates.slug !== undefined) supabaseUpdates.slug = updates.slug
  if (updates.url !== undefined) supabaseUpdates.url = updates.url
  if (updates.category_id !== undefined) supabaseUpdates.category_id = updates.category_id
  if (updates.extract_code !== undefined) supabaseUpdates.extract_code = updates.extract_code
  if (updates.expires_at !== undefined) supabaseUpdates.expires_at = updates.expires_at
  if (updates.is_pinned !== undefined) supabaseUpdates.is_pinned = updates.is_pinned
  if (updates.is_featured !== undefined) supabaseUpdates.is_favorited = updates.is_featured
  if (updates.description !== undefined) supabaseUpdates.description = updates.description
  if (updates.sort_order !== undefined) supabaseUpdates.sort_order = updates.sort_order
  if (updates.visible !== undefined) supabaseUpdates.visible = updates.visible

  if (Object.keys(supabaseUpdates).length === 0) return

  const { error } = await supabase
    .from('links')
    .update(supabaseUpdates)
    .eq('id', id)

  if (error) throw error
  log('updateLink', id, Object.keys(supabaseUpdates))
}

export async function deleteLinkApi(id: string): Promise<void> {
  if (!isSupabaseConfigured()) { deleteLocalLink(id); return }

  const { error } = await supabase
    .from('links')
    .delete()
    .eq('id', id)

  if (error) throw error
  log('deleteLink', id)
}

export async function incrementLinkClicks(id: string): Promise<void> {
  if (!isSupabaseConfigured()) { incrementLocalClicks(id); return }

  const { error } = await supabase.rpc('increment_link_click_count', {
    link_id: id,
  }).single()

  if (error) {
    // Fallback: directly update
    const { data } = await supabase.from('links').select('click_count').eq('id', id).single()
    if (data) {
      await supabase.from('links').update({ click_count: (data.click_count || 0) + 1 }).eq('id', id)
    }
  }
}

// ============ Tags API ============

export async function fetchTags(userId?: string): Promise<Tag[]> {
  if (!isSupabaseConfigured()) return getLocalTags()

  const query = supabase.from('tags').select('*')
  if (userId) query.eq('user_id', userId)

  const { data, error } = await query.order('created_at', { ascending: false })

  if (error) {
    console.error('[DataService] fetchTags error:', error)
    return getLocalTags()
  }
  return (data || []).map(t => ({
    id: String(t.id),
    user_id: String(t.user_id),
    name: String(t.name),
    color: String(t.color),
    created_at: String(t.created_at),
    updated_at: String(t.updated_at),
  }))
}

export async function createTagApi(name: string, color: string, userId?: string): Promise<Tag> {
  if (!isSupabaseConfigured()) return addLocalTag(name, color)

  const { data, error } = await supabase
    .from('tags')
    .insert({
      user_id: userId || '00000000-0000-0000-0000-000000000000',
      name,
      color,
    })
    .select()
    .single()

  if (error) throw error
  return { id: String(data.id), user_id: String(data.user_id), name: data.name, color: data.color, created_at: data.created_at, updated_at: data.updated_at }
}

export async function deleteTagApi(id: string): Promise<void> {
  if (!isSupabaseConfigured()) { deleteLocalTag(id); return }

  const { error } = await supabase
    .from('tags')
    .delete()
    .eq('id', id)

  if (error) throw error
}

// ============ Dashboard Stats ============

export async function fetchDashboardStats(userId?: string): Promise<{
  total_links: number; total_clicks: number; total_registrations: number;
  active_links: number; expiring_soon: number; expired_links: number;
  pinned_links: number; favorited_links: number;
}> {
  if (!isSupabaseConfigured()) {
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

  const { data, error } = await supabase.rpc('get_dashboard_stats', {
    user_uuid: userId || '00000000-0000-0000-0000-000000000000',
  })

  if (error) throw error
  return data
}

// ============ SubCategories (local only for now) ============

export async function fetchSubCategories(): Promise<SubCategory[]> {
  return getLocalSubCategories()
}

export async function addSubCategoryApi(categoryId: string, name: string): Promise<SubCategory> {
  return addLocalSubCategory(categoryId, name)
}

export async function deleteSubCategoryApi(id: string): Promise<void> {
  deleteLocalSubCategory(id)
}

// ============ DriveTypes (local only) ============

export function fetchDriveTypes(): DriveType[] {
  return getLocalDriveTypes()
}

export function addDriveTypeApi(name: string, icon: string, color: string): DriveType {
  return addLocalDriveType(name, icon, color)
}

export function deleteDriveTypeApi(id: string): void {
  deleteLocalDriveType(id)
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
