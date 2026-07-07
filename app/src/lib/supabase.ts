import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// 类型定义
export interface Category {
  id: string
  user_id: string | null
  name: string
  logo_url: string | null
  sort_order: number
  is_system: boolean
  created_at: string
  updated_at: string
}

export interface Tag {
  id: string
  user_id: string
  name: string
  color: string
  created_at: string
  updated_at: string
}

export interface Link {
  id: string
  user_id: string
  name: string
  slug: string
  category_id: string | null
  url: string
  extract_code: string | null
  validity_period: '1_month' | '3_months' | '6_months' | '1_year' | 'permanent'
  expires_at: string | null
  click_count: number
  registration_count: number
  is_pinned: boolean
  is_favorited: boolean
  status: 'active' | 'expired' | 'disabled'
  created_at: string
  updated_at: string
  // 关联数据
  category_name?: string
  category_logo?: string
  tags?: Tag[]
}

export interface LinkVisit {
  id: string
  link_id: string
  visitor_ip: string | null
  user_agent: string | null
  referer: string | null
  visit_type: 'click' | 'registration'
  created_at: string
}

export interface Profile {
  id: string
  user_id: string
  username: string | null
  avatar_url: string | null
  settings: Record<string, any>
  created_at: string
  updated_at: string
}

export interface DashboardStats {
  total_links: number
  total_clicks: number
  total_registrations: number
  active_links: number
  expiring_soon: number
  expired_links: number
  pinned_links: number
  favorited_links: number
}

// API 函数
export async function getPublicLinks() {
  const { data, error } = await supabase
    .from('links')
    .select(`
      *,
      category:categories(name, logo_url),
      link_tags(tag:tags(*))
    `)
    .eq('status', 'active')
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

export async function getLinkBySlug(slug: string) {
  const { data, error } = await supabase
    .from('links')
    .select(`
      *,
      category:categories(*),
      link_tags(tag:tags(*))
    `)
    .eq('slug', slug)
    .eq('status', 'active')
    .single()

  if (error) throw error
  return data
}

export async function getLinksByCategory(categoryId: string) {
  const { data, error } = await supabase
    .from('links')
    .select(`
      *,
      category:categories(name, logo_url),
      link_tags(tag:tags(*))
    `)
    .eq('category_id', categoryId)
    .eq('status', 'active')
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

export async function searchLinks(query: string) {
  const { data, error } = await supabase.rpc('search_links', {
    search_query: query,
  })

  if (error) throw error
  return data
}

export async function getCategories() {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) throw error
  return data
}

export async function getDashboardStats(userId: string): Promise<DashboardStats> {
  const { data, error } = await supabase.rpc('get_dashboard_stats', {
    user_uuid: userId,
  })

  if (error) throw error
  return data
}

export async function getCategoryStats(userId: string) {
  const { data, error } = await supabase.rpc('get_category_stats', {
    user_uuid: userId,
  })

  if (error) throw error
  return data
}

export async function createLink(link: Partial<Link>) {
  const { data, error } = await supabase
    .from('links')
    .insert(link)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateLink(id: string, updates: Partial<Link>) {
  const { data, error } = await supabase
    .from('links')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteLink(id: string) {
  const { error } = await supabase
    .from('links')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export async function createCategory(category: Partial<Category>) {
  const { data, error } = await supabase
    .from('categories')
    .insert(category)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function createTag(tag: Partial<Tag>) {
  const { data, error } = await supabase
    .from('tags')
    .insert(tag)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function recordLinkVisit(linkId: string, visitType: 'click' | 'registration' = 'click') {
  const { error } = await supabase
    .from('link_visits')
    .insert({
      link_id: linkId,
      visit_type: visitType,
      user_agent: navigator.userAgent,
      referer: document.referrer,
    })

  if (error) console.error('Failed to record visit:', error)
}

// 模拟数据（用于开发预览）
export const mockCategories: Category[] = [
  { id: '1', user_id: null, name: '夸克网盘', logo_url: 'https://img.icons8.com/color/144/quark--v1.png', sort_order: 1, is_system: true, created_at: '', updated_at: '' },
  { id: '2', user_id: null, name: '百度网盘', logo_url: 'https://img.icons8.com/color/144/baidu.png', sort_order: 2, is_system: true, created_at: '', updated_at: '' },
  { id: '3', user_id: null, name: '阿里云盘', logo_url: 'https://img.icons8.com/color/144/alibaba.png', sort_order: 3, is_system: true, created_at: '', updated_at: '' },
  { id: '4', user_id: null, name: '迅雷云盘', logo_url: 'https://img.icons8.com/color/144/thunder.png', sort_order: 4, is_system: true, created_at: '', updated_at: '' },
]

export const mockTags: Tag[] = [
  { id: '1', user_id: '1', name: '热门', color: '#EF4444', created_at: '', updated_at: '' },
  { id: '2', user_id: '1', name: '推荐', color: '#F59E0B', created_at: '', updated_at: '' },
  { id: '3', user_id: '1', name: '教程', color: '#10B981', created_at: '', updated_at: '' },
  { id: '4', user_id: '1', name: '资源', color: '#6366F1', created_at: '', updated_at: '' },
]

export const mockLinks: Link[] = [
  {
    id: '1',
    user_id: '1',
    name: 'Adobe全家桶 2024最新版',
    slug: 'adobe-2024',
    category_id: '1',
    url: 'https://pan.quark.cn/s/xxxxx',
    extract_code: '1234',
    validity_period: 'permanent',
    expires_at: null,
    click_count: 1568,
    registration_count: 89,
    is_pinned: true,
    is_favorited: false,
    status: 'active',
    created_at: '2024-01-15T10:30:00Z',
    updated_at: '2024-01-15T10:30:00Z',
    category_name: '夸克网盘',
    category_logo: 'https://img.icons8.com/color/144/quark--v1.png',
    tags: [mockTags[0], mockTags[3]],
  },
  {
    id: '2',
    user_id: '1',
    name: 'Python从入门到精通全套教程',
    slug: 'python-tutorial',
    category_id: '2',
    url: 'https://pan.baidu.com/s/xxxxx',
    extract_code: 'py24',
    validity_period: '1_year',
    expires_at: '2025-12-31T23:59:59Z',
    click_count: 2341,
    registration_count: 156,
    is_pinned: false,
    is_favorited: true,
    status: 'active',
    created_at: '2024-02-20T14:20:00Z',
    updated_at: '2024-02-20T14:20:00Z',
    category_name: '百度网盘',
    category_logo: 'https://img.icons8.com/color/144/baidu.png',
    tags: [mockTags[2], mockTags[1]],
  },
  {
    id: '3',
    user_id: '1',
    name: '4K高清壁纸合集 500张',
    slug: '4k-wallpapers',
    category_id: '3',
    url: 'https://www.aliyundrive.com/s/xxxxx',
    extract_code: '4kwall',
    validity_period: '6_months',
    expires_at: '2024-08-15T23:59:59Z',
    click_count: 892,
    registration_count: 45,
    is_pinned: false,
    is_favorited: false,
    status: 'active',
    created_at: '2024-03-10T09:15:00Z',
    updated_at: '2024-03-10T09:15:00Z',
    category_name: '阿里云盘',
    category_logo: 'https://img.icons8.com/color/144/alibaba.png',
    tags: [mockTags[3]],
  },
  {
    id: '4',
    user_id: '1',
    name: 'Windows 11专业版镜像下载',
    slug: 'win11-pro',
    category_id: '4',
    url: 'https://pan.xunlei.com/s/xxxxx',
    extract_code: 'win11',
    validity_period: '3_months',
    expires_at: '2024-06-20T23:59:59Z',
    click_count: 3214,
    registration_count: 234,
    is_pinned: true,
    is_favorited: true,
    status: 'active',
    created_at: '2024-04-05T16:45:00Z',
    updated_at: '2024-04-05T16:45:00Z',
    category_name: '迅雷云盘',
    category_logo: 'https://img.icons8.com/color/144/thunder.png',
    tags: [mockTags[0], mockTags[1]],
  },
]
