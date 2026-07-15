/**
 * pan-link API - Cloudflare Pages Functions
 * REST API，操作 D1 数据库
 *
 * 安全策略:
 * - POST/PUT/DELETE 需要 Bearer Token (HMAC-SHA256 签名)
 * - GET 公开（读取资源/分类等公开数据）
 * - 内存级 Rate Limiting
 * - 凭证通过 Cloudflare Pages 环境变量配置 (ADMIN_USER, ADMIN_PASS, JWT_SECRET)
 */

interface Env {
  DB: D1Database
  ADMIN_USER?: string
  ADMIN_PASS?: string
  JWT_SECRET?: string
}

// ============ 认证 ============

function base64url(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlDecode(str: string): string {
  str = str.replace(/-/g, '+').replace(/_/g, '/')
  while (str.length % 4) str += '='
  return atob(str)
}

async function createToken(env: Env): Promise<string> {
  const secret = env.JWT_SECRET || 'pan-link-default-secret-change-me'
  const encoder = new TextEncoder()
  const header = base64url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const payload = base64url(encoder.encode(JSON.stringify({
    sub: 'admin',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 8 * 3600, // 8 hours
  })))
  const data = encoder.encode(`${header}.${payload}`)
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, data)
  return `${header}.${payload}.${base64url(sig)}`
}

async function verifyToken(token: string, env: Env): Promise<boolean> {
  try {
    const secret = env.JWT_SECRET || 'pan-link-default-secret-change-me'
    const parts = token.split('.')
    if (parts.length !== 3) return false
    const [header, payload, sig] = parts
    const encoder = new TextEncoder()
    const data = encoder.encode(`${header}.${payload}`)
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    )
    const sigBytes = new Uint8Array(
      atob(sig.replace(/-/g, '+').replace(/_/g, '/'))
        .split('').map(c => c.charCodeAt(0))
    )
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, data)
    if (!valid) return false

    // Check expiry
    const payloadJson = JSON.parse(base64urlDecode(payload))
    return payloadJson.exp > Math.floor(Date.now() / 1000)
  } catch {
    return false
  }
}

async function requireAuth(request: Request, env: Env): Promise<boolean> {
  if (!env.ADMIN_USER || !env.JWT_SECRET) return true // 未配置则不强制
  const auth = request.headers.get('Authorization') || ''
  if (!auth.startsWith('Bearer ')) return false
  return verifyToken(auth.slice(7), env)
}

// ============ Rate Limiting ============

interface RateEntry { count: number; resetAt: number }
const rateMap = new Map<string, RateEntry>()
let lastCleanup = 0

function cleanRateMap(now: number) {
  if (now - lastCleanup > 300_000) {
    for (const [k, v] of rateMap) {
      if (now > v.resetAt) rateMap.delete(k)
    }
    lastCleanup = now
  }
}

function checkRateLimit(ip: string, method: string, now: number) {
  cleanRateMap(now)
  const isWrite = ['POST', 'PUT', 'DELETE'].includes(method)
  const key = `${ip}:${isWrite ? 'write' : 'read'}`
  const limit = isWrite ? 20 : 100
  const windowMs = 60_000

  const entry = rateMap.get(key) || { count: 0, resetAt: now + windowMs }
  if (now > entry.resetAt) {
    entry.count = 0
    entry.resetAt = now + windowMs
  }
  if (entry.count >= limit) {
    return { allowed: false, limit, resetAt: entry.resetAt }
  }
  entry.count++
  rateMap.set(key, entry)
  return { allowed: true, limit, resetAt: entry.resetAt }
}

// ============ 主处理 ============

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context
  const method = request.method
  const now = Date.now()

  const clientIp =
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown'

  // Rate limit
  const rl = checkRateLimit(clientIp, method, now)
  if (!rl.allowed) {
    return jsonRes({ error: '请求过于频繁，请稍后再试' }, 429,
      { 'Retry-After': String(Math.ceil((rl.resetAt - now) / 1000)) })
  }

  // CORS - 生产环境同域 + 本地开发 + preview 域名
  const origin = request.headers.get('Origin') || ''
  const requestHost = new URL(request.url).host
  const isSameOrigin = !origin || requestHost === new URL(origin).host
  const isCloudflarePreview = requestHost.includes('.pages.dev')
  const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:8788',
  ]
  const allowOrigin = isSameOrigin || isCloudflarePreview || allowedOrigins.includes(origin)
    ? (origin || '*')
    : 'null'

  const corsHeaders = {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
  }

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    const url = new URL(request.url)
    const path = url.pathname

    // ====== Health Check ======
    if (path === '/api/health') {
      return jsonRes({ status: 'ok', db: env.DB ? 'connected' : 'missing', auth: !!env.ADMIN_USER }, 200, corsHeaders)
    }

    // ====== Auth ======
    if (path === '/api/auth/login' && method === 'POST') {
      if (!env.ADMIN_USER || !env.ADMIN_PASS) {
        return jsonRes({ error: '管理员账户未配置' }, 500, corsHeaders)
      }
      const body = await request.json<{ username: string; password: string }>()
      if (body.username === env.ADMIN_USER && body.password === env.ADMIN_PASS) {
        const token = await createToken(env)
        return jsonRes({ token, expiresIn: 28800 }, 200, corsHeaders)
      }
      return jsonRes({ error: '用户名或密码错误' }, 401, corsHeaders)
    }

    // ====== Write operations require auth ======
    const isWriteOp = ['POST', 'PUT', 'DELETE'].includes(method)
    if (isWriteOp && !(await requireAuth(request, env))) {
      return jsonRes({ error: '未授权，请先登录' }, 401, corsHeaders)
    }

    // ====== CATEGORIES ======

    if (path === '/api/categories' && method === 'GET') {
      const result = await env.DB.prepare(
        'SELECT * FROM categories ORDER BY sort_order ASC'
      ).all()
      return jsonRes(result.results || [], 200, corsHeaders)
    }

    if (path === '/api/categories' && method === 'POST') {
      const body = await request.json<Record<string, unknown>>()
      const id = (body.id as string) || generateId()
      const nowISO = new Date().toISOString()
      await env.DB.prepare(
        `INSERT INTO categories (id, user_id, name, logo_url, sort_order, is_system, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(id, (body.user_id as string) || '', (body.name as string) || '',
        (body.logo_url as string) || null, (body.sort_order as number) || 0,
        body.is_system ? 1 : 0, nowISO, nowISO).run()
      return jsonRes({ success: true, id }, 201, corsHeaders)
    }

    if (matchPath(path, '/api/categories/:id') && method === 'PUT') {
      const catId = extractParam(path, '/api/categories/:id')
      const body = await request.json<Record<string, unknown>>()
      const nowISO = new Date().toISOString()
      await env.DB.prepare(
        'UPDATE categories SET name=?, logo_url=?, sort_order=?, updated_at=? WHERE id=?'
      ).bind((body.name as string) || '', (body.logo_url as string) || null,
        (body.sort_order as number) || 0, nowISO, catId).run()
      return jsonRes({ success: true }, 200, corsHeaders)
    }

    if (matchPath(path, '/api/categories/:id') && method === 'DELETE') {
      const catId = extractParam(path, '/api/categories/:id')
      await env.DB.prepare('DELETE FROM categories WHERE id=?').bind(catId).run()
      return jsonRes({ success: true }, 200, corsHeaders)
    }

    // ====== LINKS ======

    if (path === '/api/links' && method === 'GET') {
      const categoryId = url.searchParams.get('category_id')
      let query = `SELECT l.*, c.name as category_name, c.logo_url as category_logo
        FROM links l LEFT JOIN categories c ON l.category_id = c.id
        WHERE l.status = 'active'`
      const params: unknown[] = []
      if (categoryId) { query += ' AND l.category_id = ?'; params.push(categoryId) }
      query += ' ORDER BY l.is_pinned DESC, l.created_at DESC'
      const stmt = env.DB.prepare(query)
      for (const p of params) stmt.bind(p as string)
      const result = await stmt.all()
      return jsonRes(result.results || [], 200, corsHeaders)
    }

    // GET /api/links/search?q=
    if (path === '/api/links/search' && method === 'GET') {
      const q = url.searchParams.get('q') || ''
      if (!q.trim()) return jsonRes([], 200, corsHeaders)
      const like = `%${q}%`
      const result = await env.DB.prepare(
        `SELECT l.*, c.name as category_name, c.logo_url as category_logo
         FROM links l LEFT JOIN categories c ON l.category_id = c.id
         WHERE l.status = 'active' AND (l.name LIKE ? OR l.description LIKE ?)
         ORDER BY l.is_pinned DESC, l.created_at DESC LIMIT 50`
      ).bind(like, like).all()
      return jsonRes(result.results || [], 200, corsHeaders)
    }

    // GET /api/links/public
    if (path === '/api/links/public' && method === 'GET') {
      const slug = url.searchParams.get('slug')
      let query = `SELECT l.*, c.name as category_name, c.logo_url as category_logo
        FROM links l LEFT JOIN categories c ON l.category_id = c.id
        WHERE l.status = 'active'`
      const params: unknown[] = []
      if (slug) { query += ' AND l.slug = ?'; params.push(slug) }
      query += ' ORDER BY l.is_pinned DESC, l.created_at DESC'
      const stmt = env.DB.prepare(query)
      for (const p of params) stmt.bind(p as string)
      const result = await stmt.all()

      if (slug) {
        try {
          await env.DB.prepare(
            'INSERT INTO link_visits (link_id, visitor_ip, user_agent, referer, visit_type) VALUES (?, ?, ?, ?, ?)'
          ).bind(
            (result.results?.[0] as Record<string, unknown>)?.id || '',
            request.headers.get('CF-Connecting-IP') || null,
            request.headers.get('User-Agent') || null,
            request.headers.get('Referer') || null, 'click'
          ).run()
          if (result.results?.[0]) {
            await env.DB.prepare(
              'UPDATE links SET click_count = click_count + 1 WHERE id = ?'
            ).bind((result.results[0] as Record<string, unknown>).id as string).run()
          }
        } catch (_e) { /* ignore */ }
        return jsonRes(result.results?.[0] || null, 200, corsHeaders)
      }
      return jsonRes(result.results || [], 200, corsHeaders)
    }

    // GET /api/links/stats
    if (path === '/api/links/stats' && method === 'GET') {
      const nowISO = new Date().toISOString()
      const weekLater = new Date(Date.now() + 7 * 86400000).toISOString()

      const total = await env.DB.prepare(
        "SELECT COUNT(*) as total FROM links WHERE status='active'"
      ).first() as Record<string, number>
      const clicks = await env.DB.prepare(
        'SELECT COALESCE(SUM(click_count), 0) as total_clicks FROM links'
      ).first() as Record<string, number>
      const regs = await env.DB.prepare(
        'SELECT COALESCE(SUM(registration_count), 0) as total_regs FROM links'
      ).first() as Record<string, number>
      const cats = await env.DB.prepare(
        'SELECT COUNT(*) as total FROM categories'
      ).first() as Record<string, number>
      const pinned = await env.DB.prepare(
        "SELECT COUNT(*) as total FROM links WHERE is_pinned=1 AND status='active'"
      ).first() as Record<string, number>
      const fav = await env.DB.prepare(
        "SELECT COUNT(*) as total FROM links WHERE is_favorited=1 AND status='active'"
      ).first() as Record<string, number>
      const expiring = await env.DB.prepare(
        "SELECT COUNT(*) as total FROM links WHERE status='active' AND expires_at IS NOT NULL AND expires_at > ? AND expires_at <= ?"
      ).bind(nowISO, weekLater).first() as Record<string, number>
      const expired = await env.DB.prepare(
        "SELECT COUNT(*) as total FROM links WHERE status='active' AND expires_at IS NOT NULL AND expires_at < ?"
      ).bind(nowISO).first() as Record<string, number>

      return jsonRes({
        total_links: total?.total || 0,
        total_clicks: clicks?.total_clicks || 0,
        total_registrations: regs?.total_regs || 0,
        total_categories: cats?.total || 0,
        pinned_links: pinned?.total || 0,
        favorited_links: fav?.total || 0,
        expiring_soon: expiring?.total || 0,
        expired_links: expired?.total || 0,
      }, 200, corsHeaders)
    }

    // POST /api/links
    if (path === '/api/links' && method === 'POST') {
      const body = await request.json<Record<string, unknown>>()
      const id = (body.id as string) || generateId()
      const nowISO = new Date().toISOString()
      const maxSort = await getMaxSort(env)

      // Check slug uniqueness
      const slug = (body.slug as string) || `${Date.now()}`
      const existing = await env.DB.prepare('SELECT id FROM links WHERE slug=?').bind(slug).first()
      const finalSlug = existing ? `${slug}-${Math.random().toString(36).slice(2, 6)}` : slug

      // 排除前端不发的不必要字段，只保留 API 需要的字段
      const insertBody: Record<string, unknown> = {
        id,
        user_id: (body.user_id as string) || '',
        name: (body.name as string) || '',
        title: (body.title as string) || (body.name as string) || '',
        slug: finalSlug,
        url: (body.url as string) || '',
        category_id: (body.category_id as string) || null,
        subcategory_id: (body.subcategory_id as string) || null,
        extract_code: (body.extract_code as string) || null,
        validity_period: (body.validity_period as string) || 'permanent',
        expires_at: (body.expires_at as string) || null,
        is_pinned: body.is_pinned ? 1 : 0,
        is_favorited: body.is_featured || body.is_favorited ? 1 : 0,
        drive_type: (body.drive_type as string) || 'baidu',
        icon: (body.icon as string) || null,
        description: (body.description as string) || null,
        visible: body.visible !== undefined ? (body.visible ? 1 : 0) : 1,
        sort_order: (body.sort_order as number) ?? (maxSort + 1),
      }

      await env.DB.prepare(
        `INSERT INTO links (id, user_id, name, slug, url, category_id, subcategory_id,
          extract_code, validity_period, expires_at, click_count, registration_count,
          is_pinned, is_favorited, status, drive_type, icon, description,
          created_at, updated_at, visible, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        insertBody.id, insertBody.user_id, insertBody.name, insertBody.slug,
        insertBody.url, insertBody.category_id, insertBody.subcategory_id,
        insertBody.extract_code, insertBody.validity_period, insertBody.expires_at,
        insertBody.is_pinned, insertBody.is_favorited,
        insertBody.drive_type, insertBody.icon, insertBody.description,
        nowISO, nowISO, insertBody.visible, insertBody.sort_order
      ).run()

      const link = await env.DB.prepare('SELECT * FROM links WHERE id = ?').bind(id).first()
      return jsonRes(link, 201, corsHeaders)
    }

    // PUT /api/links/:id
    if (matchPath(path, '/api/links/:id') && method === 'PUT') {
      const linkId = extractParam(path, '/api/links/:id')
      const body = await request.json<Record<string, unknown>>()
      const nowISO = new Date().toISOString()
      const fields: string[] = []
      const values: unknown[] = []
      // title 映射为 name（D1 列名是 name）
      if (body.title !== undefined && body.name === undefined) {
        body.name = body.title
        delete body.title
      }
      const allowedFields = [
        'name', 'url', 'category_id', 'subcategory_id', 'extract_code',
        'validity_period', 'expires_at', 'is_pinned', 'is_favorited', 'status',
        'drive_type', 'icon', 'description', 'visible', 'sort_order', 'slug',
      ]
      for (const field of allowedFields) {
        if (body[field] !== undefined) {
          fields.push(`${field} = ?`)
          values.push(typeof body[field] === 'boolean' ? ((body[field] as boolean) ? 1 : 0) : body[field])
        }
      }
      if (fields.length > 0) {
        fields.push('updated_at = ?')
        values.push(nowISO)
        values.push(linkId)
        await env.DB.prepare(`UPDATE links SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run()
      }
      return jsonRes({ success: true }, 200, corsHeaders)
    }

    // DELETE /api/links/:id
    if (matchPath(path, '/api/links/:id') && method === 'DELETE') {
      const linkId = extractParam(path, '/api/links/:id')
      // CASCADE 自动清理 link_visits 和 link_tags
      await env.DB.prepare('DELETE FROM links WHERE id = ?').bind(linkId).run()
      return jsonRes({ success: true }, 200, corsHeaders)
    }

    // ====== SUBCATEGORIES ======

    if (path === '/api/subcategories' && method === 'GET') {
      const result = await env.DB.prepare(
        'SELECT * FROM subcategories ORDER BY sort_order ASC'
      ).all()
      return jsonRes(result.results || [], 200, corsHeaders)
    }

    if (path === '/api/subcategories' && method === 'POST') {
      const body = await request.json<Record<string, unknown>>()
      const id = (body.id as string) || generateId()
      const nowISO = new Date().toISOString()
      await env.DB.prepare(
        'INSERT INTO subcategories (id, category_id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(
        id,
        (body.category_id as string) || '',
        (body.name as string) || '',
        (body.sort_order as number) || 0,
        nowISO, nowISO
      ).run()
      return jsonRes({ success: true, id }, 201, corsHeaders)
    }

    if (matchPath(path, '/api/subcategories/:id') && method === 'PUT') {
      const subId = extractParam(path, '/api/subcategories/:id')
      const body = await request.json<Record<string, unknown>>()
      const nowISO = new Date().toISOString()
      const fields: string[] = []
      const values: unknown[] = []
      const allowedFields = ['category_id', 'name', 'sort_order']
      for (const field of allowedFields) {
        if (body[field] !== undefined) {
          fields.push(`${field} = ?`)
          values.push(body[field])
        }
      }
      if (fields.length > 0) {
        fields.push('updated_at = ?')
        values.push(nowISO)
        values.push(subId)
        await env.DB.prepare(`UPDATE subcategories SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run()
      }
      return jsonRes({ success: true }, 200, corsHeaders)
    }

    if (matchPath(path, '/api/subcategories/:id') && method === 'DELETE') {
      const subId = extractParam(path, '/api/subcategories/:id')
      await env.DB.prepare('DELETE FROM subcategories WHERE id = ?').bind(subId).run()
      return jsonRes({ success: true }, 200, corsHeaders)
    }

    // ====== TAGS ======

    if (path === '/api/tags' && method === 'GET') {
      const result = await env.DB.prepare('SELECT * FROM tags ORDER BY name ASC').all()
      return jsonRes(result.results || [], 200, corsHeaders)
    }

    if (path === '/api/tags' && method === 'POST') {
      const body = await request.json<Record<string, unknown>>()
      const id = (body.id as string) || generateId()
      const nowISO = new Date().toISOString()
      await env.DB.prepare(
        'INSERT INTO tags (id, user_id, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(id, (body.user_id as string) || '', (body.name as string) || '',
        (body.color as string) || '#6B7280', nowISO, nowISO).run()
      return jsonRes({ success: true, id }, 201, corsHeaders)
    }

    if (matchPath(path, '/api/tags/:id') && method === 'DELETE') {
      const tagId = extractParam(path, '/api/tags/:id')
      await env.DB.prepare('DELETE FROM tags WHERE id = ?').bind(tagId).run()
      return jsonRes({ success: true }, 200, corsHeaders)
    }

    // ====== SITE SETTINGS ======

    if (path === '/api/site-settings' && method === 'GET') {
      const result = await env.DB.prepare('SELECT key, value FROM site_settings').all()
      const settings: Record<string, unknown> = {}
      if (result.results) {
        for (const row of result.results as Array<{ key: string; value: string }>) {
          try { settings[row.key] = JSON.parse(row.value) } catch { settings[row.key] = row.value }
        }
      }
      return jsonRes(settings, 200, corsHeaders)
    }

    if (path === '/api/site-settings' && method === 'PUT') {
      const body = await request.json<Record<string, unknown>>()
      const nowISO = new Date().toISOString()
      for (const [key, value] of Object.entries(body)) {
        const jsonValue = typeof value === 'string' ? value : JSON.stringify(value)
        await env.DB.prepare(
          `INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
        ).bind(key, jsonValue, nowISO).run()
      }
      return jsonRes({ success: true }, 200, corsHeaders)
    }

    if (path === '/api/site-settings/logo' && method === 'POST') {
      const body = await request.json<{ url: string; name: string }>()
      const logoKey = 'logo_library'
      const result = await env.DB.prepare('SELECT value FROM site_settings WHERE key = ?').bind(logoKey).first()
      const library: Array<{ url: string; name: string; added_at: string }> = result
        ? JSON.parse((result as { value: string }).value || '[]') : []
      library.push({ url: body.url || '', name: body.name || `Logo ${library.length + 1}`, added_at: new Date().toISOString() })
      const nowISO = new Date().toISOString()
      await env.DB.prepare(
        `INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      ).bind(logoKey, JSON.stringify(library), nowISO).run()
      return jsonRes({ success: true, library }, 200, corsHeaders)
    }

    if (path === '/api/site-settings/logo' && method === 'DELETE') {
      const urlToDelete = url.searchParams.get('url')
      const indexToDelete = url.searchParams.get('index')
      const logoKey = 'logo_library'
      const result = await env.DB.prepare('SELECT value FROM site_settings WHERE key = ?').bind(logoKey).first()
      let library: Array<{ url: string; name: string; added_at: string }> = result
        ? JSON.parse((result as { value: string }).value || '[]') : []
      if (urlToDelete) {
        library = library.filter((l) => l.url !== urlToDelete)
      } else if (indexToDelete !== null) {
        const idx = parseInt(indexToDelete, 10)
        if (!isNaN(idx) && idx >= 0 && idx < library.length) library.splice(idx, 1)
      }
      const nowISO = new Date().toISOString()
      await env.DB.prepare(
        `INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      ).bind(logoKey, JSON.stringify(library), nowISO).run()
      return jsonRes({ success: true, library }, 200, corsHeaders)
    }

    return jsonRes({ error: 'Not found' }, 404, corsHeaders)
  } catch (err) {
    console.error('[pan-link API] Error:', err)
    // 生产环境不暴露内部错误详情
    const message = err instanceof Error ? err.message : '服务器内部错误'
    return jsonRes(
      { error: message.length < 200 ? message : '服务器内部错误，请稍后重试' },
      500, corsHeaders
    )
  }
}

// ============ Helpers ============

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}

function matchPath(path: string, pattern: string): boolean {
  return new RegExp(`^${pattern.replace(/:[^/]+/g, '[^/]+')}$`).test(path)
}

function extractParam(path: string, pattern: string): string | null {
  const parts = pattern.split('/')
  const pathParts = path.split('/')
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].startsWith(':')) return pathParts[i]
  }
  return null
}

async function getMaxSort(env: Env): Promise<number> {
  try {
    const r = await env.DB.prepare(
      'SELECT COALESCE(MAX(sort_order), 0) as max_sort FROM links'
    ).first()
    return (r as Record<string, number>)?.max_sort || 0
  } catch { return 0 }
}

function jsonRes(data: unknown, status: number, extraHeaders?: Record<string, string>): Response {
  const isGet = status >= 200 && status < 300
  const cacheHeaders = isGet ? { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } : {}
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders, ...cacheHeaders },
  })
}
