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
  while (str.length % 4) {str += '='}
  return atob(str)
}

async function createToken(env: Env): Promise<string> {
  const secret = env.JWT_SECRET
  if (!secret) {throw new Error('JWT_SECRET 未配置')}
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
    const secret = env.JWT_SECRET
    if (!secret) {return false}
    const parts = token.split('.')
    if (parts.length !== 3) {return false}
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
    if (!valid) {return false}

    // Check expiry
    const payloadJson = JSON.parse(base64urlDecode(payload))
    return payloadJson.exp > Math.floor(Date.now() / 1000)
  } catch {
    return false
  }
}

function requireAuth(request: Request, env: Env): Promise<boolean> {
  if (!env.ADMIN_USER || !env.JWT_SECRET) {return Promise.resolve(false)} // 未配置则拒绝所有写操作
  const auth = request.headers.get('Authorization') || ''
  if (!auth.startsWith('Bearer ')) {return Promise.resolve(false)}
  return verifyToken(auth.slice(7), env)
}

// ============ Rate Limiting ============

interface RateEntry { count: number; resetAt: number }
const rateMap = new Map<string, RateEntry>()
let lastCleanup = 0

function cleanRateMap(now: number) {
  if (now - lastCleanup > 300_000) {
    for (const [k, v] of rateMap) {
      if (now > v.resetAt) {rateMap.delete(k)}
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

// ============ 边缘缓存 ============

const CACHEABLE_PATHS = ['/api/all', '/api/links', '/api/categories', '/api/tags', '/api/site-settings', '/api/links/public']

function isCacheable(request: Request): boolean {
  if (request.method !== 'GET') { return false }
  const url = new URL(request.url)
  // 健康检查不缓存；搜索/分页参数繁多，命中低，不缓存
  if (url.pathname === '/api/health') { return false }
  if (url.pathname.startsWith('/api/admin/')) { return false }
  if (url.pathname === '/api/auth/status') { return false }
  return CACHEABLE_PATHS.includes(url.pathname) || url.pathname === '/api/links/search'
}

const PUBLIC_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=120, s-maxage=300, stale-while-revalidate=600',
  'CDN-Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
}

async function getCache(request: Request): Promise<Response | undefined> {
  try {
    return await (caches as CacheStorage).default.match(request)
  } catch {
    return undefined
  }
}

async function putCache(request: Request, response: Response): Promise<void> {
  try {
    // clone 避免原始响应 body 被 cache.put 消耗，导致返回客户端时报错
    await (caches as CacheStorage).default.put(request, response.clone())
  } catch {
    // 缓存失败不阻断响应
  }
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

  // UA 爬虫拦截（仅 API 路由，正常浏览器必有 UA）
  const ua = (request.headers.get('User-Agent') || '').toLowerCase()
  const isBot =
    !ua ||
    /python|curl|wget|httpie|go-http|scrapy|zgrab|masscan|nmap|nikto|sqlmap|nessus|burp|postman/i.test(ua) ||
    (!/mozilla|chrome|safari|firefox|edge|opera/i.test(ua) && /\b(bot|crawler|spider|scanner)\b/i.test(ua))
  if (isBot) {
    return jsonRes({ error: 'Forbidden' }, 403)
  }

  // GET 公开 API 边缘缓存：命中则直接返回，不再消耗 D1 查询和 CPU
  if (isCacheable(request)) {
    const cached = await getCache(request)
    if (cached) {
      return cached
    }
  }

  // CORS - 生产环境同域 + 本地开发 + preview 域名
  // 更换域名时设置 CORS_PREVIEW_PATTERN 环境变量（正则字符串），默认为 pan110.pages.dev
  const origin = request.headers.get('Origin') || ''
  const requestHost = new URL(request.url).host
  const isSameOrigin = !origin || requestHost === new URL(origin).host
  // 通过环境变量配置 preview 域名匹配规则，支持域名迁移
  const previewPattern = (env as Record<string, unknown>).CORS_PREVIEW_PATTERN as string || 'pan110\\.pages\\.dev'
  const isAllowedPreview = requestHost.match(new RegExp(String.raw`^[a-f0-9]+\.${previewPattern}$`))
  const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:8788',
  ]
  const isAllowedOrigin = isSameOrigin || !!isAllowedPreview || allowedOrigins.includes(origin)
  const allowOrigin = isAllowedOrigin ? (origin || '*') : 'null'

  const corsHeaders = {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  }



  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...corsHeaders, ...securityHeaders } })
  }

  try {
    const url = new URL(request.url)
    const path = url.pathname

    // ====== Health Check ======
    if (path === '/api/health') {
      return jsonRes({ status: 'ok' }, 200, corsHeaders)
    }

    // ====== ALL DATA (合并查询，减少 Workers 冷启动请求次数) ======
    if (path === '/api/all' && method === 'GET') {
      const [
        categories,
        links,
        subcategories,
        tags,
      ] = await Promise.all([
        env.DB.prepare('SELECT * FROM categories ORDER BY sort_order ASC').all(),
        env.DB.prepare(
          `SELECT l.*, c.name as category_name, c.logo_url as category_logo
           FROM links l LEFT JOIN categories c ON l.category_id = c.id
           WHERE l.status = 'active' ORDER BY l.is_pinned DESC, l.sort_order ASC, l.created_at DESC`
        ).all(),
        env.DB.prepare('SELECT * FROM subcategories ORDER BY sort_order ASC').all().catch(() => ({ results: [] })),
        env.DB.prepare('SELECT * FROM tags ORDER BY name ASC').all(),
      ])
      const linksList = (links.results || []) as Array<Record<string, unknown>>
      await batchAttachTags(env, linksList)
      const cacheHeaders = {
        'Cache-Control': 'public, max-age=120, s-maxage=300, stale-while-revalidate=600',
        'CDN-Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
      }
      const response = new Response(
        JSON.stringify({
          categories: categories.results || [],
          links: linksList,
          subcategories: subcategories.results || [],
          tags: tags.results || [],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders, ...cacheHeaders } }
      )
      await putCache(request, response)
      return response
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

    // ====== Click tracking (公开接口, 无需认证) ======
    if (matchPath(path, '/api/links/:id/click') && method === 'POST') {
      const linkId = extractParam(path, '/api/links/:id/click')
      if (linkId) {
        try {
          await env.DB.prepare('UPDATE links SET click_count = click_count + 1 WHERE id = ?').bind(linkId).run()
        } catch { /* ignore - best-effort click tracking */ }
      }
      return jsonRes({ success: true }, 200, corsHeaders)
    }

    // ====== Write operations require auth ======
    const isWriteOp = ['POST', 'PUT', 'DELETE'].includes(method)
    if (isWriteOp && !(await requireAuth(request, env))) {
      return jsonRes({ error: '未授权，请先登录' }, 401, corsHeaders)
    }

    // ====== All data routes that need auth should come after this line ======

    // ====== CATEGORIES ======

    if (path === '/api/categories' && method === 'GET') {
      const result = await env.DB.prepare(
        'SELECT * FROM categories ORDER BY sort_order ASC'
      ).all()
      const response = jsonRes(result.results || [], 200, { ...corsHeaders, ...PUBLIC_CACHE_HEADERS })
      await putCache(request, response)
      return response
    }

    if (path === '/api/categories' && method === 'POST') {
      const body = await request.json<Record<string, unknown>>()
      const name = sanitizeString((body.name as string) || '')
      if (!name || name.length > 100) {
        return jsonRes({ error: '分类名称不能为空且不超过100个字符' }, 400, corsHeaders)
      }
      const id = (body.id as string) || generateId()
      const nowISO = new Date().toISOString()
      let sortOrder = (body.sort_order as number) ?? 0
      if (sortOrder === 0) {
        const maxResult = await env.DB.prepare('SELECT COALESCE(MAX(sort_order), 0) as max_sort FROM categories').first()
        sortOrder = ((maxResult as Record<string, number>)?.max_sort || 0) + 1
      }
      await env.DB.prepare(
        `INSERT INTO categories (id, user_id, name, logo_url, sort_order, is_system, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(id, (body.user_id as string) || '', name,
        (body.logo_url as string) || null, sortOrder,
        body.is_system ? 1 : 0, nowISO, nowISO).run()
      return jsonRes({ success: true, id }, 201, corsHeaders)
    }

    if (matchPath(path, '/api/categories/:id') && method === 'PUT') {
      const catId = extractParam(path, '/api/categories/:id')
      const body = await request.json<Record<string, unknown>>()
      const name = sanitizeString((body.name as string) || '')
      if (body.name !== undefined && (!name || name.length > 100)) {
        return jsonRes({ error: '分类名称不能为空且不超过100个字符' }, 400, corsHeaders)
      }
      const nowISO = new Date().toISOString()
      const updateName = body.name !== undefined ? name : undefined
      await env.DB.prepare(
        'UPDATE categories SET name=COALESCE(?, name), logo_url=COALESCE(?, logo_url), sort_order=COALESCE(?, sort_order), updated_at=? WHERE id=?'
      ).bind(updateName || null, (body.logo_url as string) || null,
        (body.sort_order as number) || 0, nowISO, catId).run()
      return jsonRes({ success: true }, 200, corsHeaders)
    }

    if (matchPath(path, '/api/categories/:id') && method === 'DELETE') {
      const catId = extractParam(path, '/api/categories/:id')
      // Clean up related links: set category_id and subcategory_id to NULL
      await env.DB.prepare(
        "UPDATE links SET category_id = NULL, subcategory_id = NULL, updated_at = ? WHERE category_id = ?"
      ).bind(new Date().toISOString(), catId).run()
      // Delete related subcategories
      await env.DB.prepare('DELETE FROM subcategories WHERE category_id = ?').bind(catId).run()
      await env.DB.prepare('DELETE FROM categories WHERE id = ?').bind(catId).run()
      return jsonRes({ success: true }, 200, corsHeaders)
    }

    // ====== LINKS ======

    if (path === '/api/links' && method === 'GET') {
      const categoryId = url.searchParams.get('category_id')
      let query = `SELECT l.*, c.name as category_name, c.logo_url as category_logo
        FROM links l LEFT JOIN categories c ON l.category_id = c.id
        WHERE l.status = 'active'`
      const params: Array<unknown> = []
      if (categoryId) { query += ' AND l.category_id = ?'; params.push(categoryId) }
      query += ' ORDER BY l.is_pinned DESC, l.sort_order ASC, l.created_at DESC'
      const stmt = env.DB.prepare(query)
      for (const p of params) {stmt.bind(p as string)}
      const result = await stmt.all()
      const list = (result.results || []) as Array<Record<string, unknown>>
      await batchAttachTags(env, list)
      const response = jsonRes(list, 200, { ...corsHeaders, ...PUBLIC_CACHE_HEADERS })
      await putCache(request, response)
      return response
    }

    // GET /api/links/search?q=
    if (path === '/api/links/search' && method === 'GET') {
      const q = url.searchParams.get('q') || ''
      if (!q.trim()) {return jsonRes([], 200, corsHeaders)}
      const like = `%${q}%`
      const result = await env.DB.prepare(
        `SELECT l.*, c.name as category_name, c.logo_url as category_logo
         FROM links l LEFT JOIN categories c ON l.category_id = c.id
         WHERE l.status = 'active' AND (l.name LIKE ? OR l.description LIKE ? OR l.keywords LIKE ?)
         ORDER BY l.is_pinned DESC, l.sort_order ASC, l.created_at DESC LIMIT 50`
      ).bind(like, like, like).all()
      const searchList = (result.results || []) as Array<Record<string, unknown>>
      await batchAttachTags(env, searchList)
      const response = jsonRes(searchList, 200, { ...corsHeaders, ...PUBLIC_CACHE_HEADERS })
      await putCache(request, response)
      return response
    }

    // GET /api/links/public
    if (path === '/api/links/public' && method === 'GET') {
      const slug = url.searchParams.get('slug')
      let query = `SELECT l.*, c.name as category_name, c.logo_url as category_logo
        FROM links l LEFT JOIN categories c ON l.category_id = c.id
        WHERE l.status = 'active'`
      const params: Array<unknown> = []
      if (slug) { query += ' AND l.slug = ?'; params.push(slug) }
      query += ' ORDER BY l.is_pinned DESC, l.sort_order ASC, l.created_at DESC'
      const stmt = env.DB.prepare(query)
      for (const p of params) {stmt.bind(p as string)}
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
        } catch { /* ignore */ }
        const single = (result.results?.[0] || null) as Record<string, unknown> | null
        if (single) { const arr = [single]; await batchAttachTags(env, arr); Object.assign(single, arr[0]) }
        return jsonRes(single, 200, corsHeaders)
      }
      const pubList = (result.results || []) as Array<Record<string, unknown>>
      await batchAttachTags(env, pubList)
      const response = jsonRes(pubList, 200, { ...corsHeaders, ...PUBLIC_CACHE_HEADERS })
      await putCache(request, response)
      return response
    }

    // GET /api/links/stats - 需要认证（管理统计）
    if (path === '/api/links/stats' && method === 'GET') {
      if (!(await requireAuth(request, env))) {
        return jsonRes({ error: '需要管理员认证' }, 401, corsHeaders)
      }
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
      const name = sanitizeString((body.name as string) || '')
      const url = sanitizeLinkUrl((body.url as string) || '')
      if (!name || name.length > 200) {
        return jsonRes({ error: '链接名称不能为空且不超过200个字符' }, 400, corsHeaders)
      }
      if (!url) {
        return jsonRes({ error: '链接地址不能为空' }, 400, corsHeaders)
      }
      if (!isSafeUrl(url)) {
        return jsonRes({ error: '不支持的链接协议，仅允许 http/https/ftp/magnet/ed2k/thunder' }, 400, corsHeaders)
      }
      if ((body.description as string)?.length > 2000) {
        return jsonRes({ error: '描述不能超过2000个字符' }, 400, corsHeaders)
      }
      const id = (body.id as string) || generateId()
      const nowISO = new Date().toISOString()
      const maxSort = await getMaxSort(env)

      // Check slug uniqueness
      const slug = (body.slug as string) || `${Date.now()}`
      const existing = await env.DB.prepare('SELECT id FROM links WHERE slug=?').bind(slug).first()
      const finalSlug = existing ? `${slug}-${Math.random().toString(36).slice(2, 6)}` : slug

      // 序列化 keywords: 前端传 string[] / JSON string / 逗号分隔字符串
      let keywordsJson = '[]'
      if (body.keywords) {
        if (Array.isArray(body.keywords)) {
          keywordsJson = JSON.stringify(body.keywords)
        } else if (typeof body.keywords === 'string') {
          // 可能是逗号分隔或 JSON string
          try { keywordsJson = JSON.stringify(JSON.parse(body.keywords)) } catch {
            keywordsJson = JSON.stringify((body.keywords as string).split(',').map((k: string) => k.trim()).filter(Boolean))
          }
        }
      }

      // 排除前端不发的不必要字段，只保留 API 需要的字段
      const insertBody: Record<string, unknown> = {
        id,
        user_id: (body.user_id as string) || '',
        name,
        title: (body.title as string) || name,
        slug: finalSlug,
        url,
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
        keywords: keywordsJson,
      }

      await env.DB.prepare(
        `INSERT INTO links (id, user_id, name, slug, url, category_id, subcategory_id,
          extract_code, validity_period, expires_at, click_count, registration_count,
          is_pinned, is_favorited, status, drive_type, icon, description,
          created_at, updated_at, visible, sort_order, keywords)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        insertBody.id, insertBody.user_id, insertBody.name, insertBody.slug,
        insertBody.url, insertBody.category_id, insertBody.subcategory_id,
        insertBody.extract_code, insertBody.validity_period, insertBody.expires_at,
        insertBody.is_pinned, insertBody.is_favorited,
        insertBody.drive_type, insertBody.icon, insertBody.description,
        nowISO, nowISO, insertBody.visible, insertBody.sort_order, insertBody.keywords
      ).run()

      // 保存标签关联
      if (Array.isArray(body.tags)) {
        try { await setLinkTags(env, String(id), body.tags as Array<string>) } catch (e) {
          console.error(`[POST /api/links] 标签关联失败 link_id=${id} tags=${JSON.stringify(body.tags)}:`, e)
        }
      }

      const link = await env.DB.prepare('SELECT * FROM links WHERE id = ?').bind(id).first()
      return jsonRes(link, 201, corsHeaders)
    }

    // PUT /api/links/:id
    if (matchPath(path, '/api/links/:id') && method === 'PUT') {
      const linkId = extractParam(path, '/api/links/:id')
      const body = await request.json<Record<string, unknown>>()
      // 验证 URL 安全性
      if (body.url !== undefined) {
        const url = sanitizeLinkUrl((body.url as string) || '')
        if (!url) {
          return jsonRes({ error: '链接地址不能为空' }, 400, corsHeaders)
        }
        if (!isSafeUrl(url)) {
          return jsonRes({ error: '不支持的链接协议，仅允许 http/https/ftp/magnet/ed2k/thunder' }, 400, corsHeaders)
        }
        body.url = url
      }
      if (body.name !== undefined) {
        const name = sanitizeString((body.name as string) || '')
        if (!name || name.length > 200) {
          return jsonRes({ error: '链接名称不能为空且不超过200个字符' }, 400, corsHeaders)
        }
        body.name = name
      }
      if ((body.description as string)?.length > 2000) {
        return jsonRes({ error: '描述不能超过2000个字符' }, 400, corsHeaders)
      }
      const nowISO = new Date().toISOString()
      const fields: Array<string> = []
      const values: Array<unknown> = []
      // title 映射为 name（D1 列名是 name）
      if (body.title !== undefined && body.name === undefined) {
        body.name = body.title
        delete body.title
      }
      // is_featured 映射为 is_favorited（D1 列名是 is_favorited，前端使用 is_featured）
      if (body.is_featured !== undefined && body.is_favorited === undefined) {
        body.is_favorited = body.is_featured
        delete body.is_featured
      }
      // slug 去重检查
      if (body.slug !== undefined) {
        const conflict = await env.DB.prepare(
          'SELECT id FROM links WHERE slug = ? AND id != ?'
        ).bind(body.slug as string, linkId).first()
        if (conflict) {
          return jsonRes({ error: `URL标识符 "${body.slug}" 已被其他链接使用，请更换` }, 409, corsHeaders)
        }
      }
      // keywords 序列化
      if (body.keywords !== undefined) {
        let keywordsJson = '[]'
        if (Array.isArray(body.keywords)) {
          keywordsJson = JSON.stringify(body.keywords)
        } else if (typeof body.keywords === 'string') {
          try { keywordsJson = JSON.stringify(JSON.parse(body.keywords)) } catch {
            keywordsJson = JSON.stringify((body.keywords as string).split(',').map(k => k.trim()).filter(Boolean))
          }
        }
        body.keywords = keywordsJson
      }
      const allowedFields = [
        'name', 'url', 'category_id', 'subcategory_id', 'extract_code',
        'validity_period', 'expires_at', 'is_pinned', 'is_favorited', 'status',
        'drive_type', 'icon', 'description', 'visible', 'sort_order', 'slug', 'keywords',
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
      // 更新标签关联（如果传了 tags 字段）
      if (body.tags !== undefined) {
        const tagIds = Array.isArray(body.tags) ? (body.tags as Array<string>) : []
        try { await setLinkTags(env, linkId, tagIds) } catch (e) {
          console.error(`[PUT /api/links/${linkId}] 标签关联失败 tags=${JSON.stringify(tagIds)}:`, e)
        }
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
      try {
        const result = await env.DB.prepare(
          'SELECT * FROM subcategories ORDER BY sort_order ASC'
        ).all()
        return jsonRes(result.results || [], 200, corsHeaders)
      } catch {
        // 表不存在时返回空数组，兼容未执行建表脚本的旧数据库
        return jsonRes([], 200, corsHeaders)
      }
    }

    if (path === '/api/subcategories' && method === 'POST') {
      const body = await request.json<Record<string, unknown>>()
      const name = sanitizeString((body.name as string) || '')
      const categoryId = (body.category_id as string) || ''
      if (!name || name.length > 100) {
        return jsonRes({ error: '子分类名称不能为空且不超过100个字符' }, 400, corsHeaders)
      }
      if (!categoryId) {
        return jsonRes({ error: '所属分类不能为空' }, 400, corsHeaders)
      }
      const id = (body.id as string) || generateId()
      const nowISO = new Date().toISOString()
      let sortOrder = (body.sort_order as number) ?? 0
      if (sortOrder === 0) {
        const maxResult = await env.DB.prepare('SELECT COALESCE(MAX(sort_order), 0) as max_sort FROM subcategories WHERE category_id = ?').bind(categoryId).first()
        sortOrder = ((maxResult as Record<string, number>)?.max_sort || 0) + 1
      }
      await env.DB.prepare(
        'INSERT INTO subcategories (id, category_id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(
        id,
        categoryId,
        (body.name as string) || '',
        sortOrder,
        nowISO, nowISO
      ).run()
      return jsonRes({ success: true, id }, 201, corsHeaders)
    }

    if (matchPath(path, '/api/subcategories/:id') && method === 'PUT') {
      const subId = extractParam(path, '/api/subcategories/:id')
      const body = await request.json<Record<string, unknown>>()
      if (body.name !== undefined) {
        const name = sanitizeString((body.name as string) || '')
        if (!name || name.length > 100) {
          return jsonRes({ error: '子分类名称不能为空且不超过100个字符' }, 400, corsHeaders)
        }
        body.name = name
      }
      const nowISO = new Date().toISOString()
      const fields: Array<string> = []
      const values: Array<unknown> = []
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
      try {
        // 清空相关链接的子分类引用
        await env.DB.prepare(
          "UPDATE links SET subcategory_id = NULL, updated_at = ? WHERE subcategory_id = ?"
        ).bind(new Date().toISOString(), subId).run()
        await env.DB.prepare('DELETE FROM subcategories WHERE id = ?').bind(subId).run()
      } catch (err) {
        console.error('DELETE subcategory error:', err)
        return jsonRes({ success: false, error: '删除子分类失败' }, 500, corsHeaders)
      }
      return jsonRes({ success: true }, 200, corsHeaders)
    }

    // ====== TAGS ======

    if (path === '/api/tags' && method === 'GET') {
      const result = await env.DB.prepare('SELECT * FROM tags ORDER BY name ASC').all()
      const response = jsonRes(result.results || [], 200, { ...corsHeaders, ...PUBLIC_CACHE_HEADERS })
      await putCache(request, response)
      return response
    }

    if (path === '/api/tags' && method === 'POST') {
      const body = await request.json<Record<string, unknown>>()
      const name = sanitizeString((body.name as string) || '')
      const color = (body.color as string) || '#6B7280'
      if (!name || name.length > 50) {
        return jsonRes({ error: '标签名称不能为空且不超过50个字符' }, 400, corsHeaders)
      }
      if (!/^#[0-9A-Fa-f]{3,8}$/.test(color)) {
        return jsonRes({ error: '颜色格式无效，需为十六进制格式如 #FF0000' }, 400, corsHeaders)
      }
      const id = (body.id as string) || generateId()
      const nowISO = new Date().toISOString()
      await env.DB.prepare(
        'INSERT INTO tags (id, user_id, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(id, (body.user_id as string) || '', name, color, nowISO, nowISO).run()
      return jsonRes({ success: true, id }, 201, corsHeaders)
    }

    if (matchPath(path, '/api/tags/:id') && method === 'PUT') {
      const tagId = extractParam(path, '/api/tags/:id')
      const body = await request.json<Record<string, unknown>>()
      if (body.name !== undefined) {
        const name = sanitizeString((body.name as string) || '')
        if (!name || name.length > 50) {
          return jsonRes({ error: '标签名称不能为空且不超过50个字符' }, 400, corsHeaders)
        }
        body.name = name
      }
      if (body.color !== undefined && !/^#[0-9A-Fa-f]{3,8}$/.test(body.color as string)) {
        return jsonRes({ error: '颜色格式无效，需为十六进制格式如 #FF0000' }, 400, corsHeaders)
      }
      const nowISO = new Date().toISOString()
      const fields: Array<string> = []
      const values: Array<unknown> = []
      const allowedFields = ['name', 'color']
      for (const field of allowedFields) {
        if (body[field] !== undefined) {
          fields.push(`${field} = ?`)
          values.push(body[field])
        }
      }
      if (fields.length > 0) {
        fields.push('updated_at = ?')
        values.push(nowISO)
        values.push(tagId)
        await env.DB.prepare(`UPDATE tags SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run()
      }
      return jsonRes({ success: true }, 200, corsHeaders)
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
      // 保证默认值
      if (!settings.site_name) {
        settings.site_name = '资源云'
      }
      if (!settings.site_description) {
        settings.site_description = '全网资源交流分享'
      }
      if (!settings.current_favicon_url) {
        settings.current_favicon_url = '/favicon.png'
      }
      if (!settings.favicon_library) {
        settings.favicon_library = []
      }
      const response = jsonRes(settings, 200, { ...corsHeaders, 'Cache-Control': 'public, max-age=30, s-maxage=120, stale-while-revalidate=300', 'CDN-Cache-Control': 'public, max-age=120, stale-while-revalidate=300' })
      await putCache(request, response)
      return response
    }

    if (path === '/api/site-settings' && method === 'PUT') {
      const body = await request.json<Record<string, unknown>>()
      // 使用黑名单机制，只阻止危险/敏感字段，允许其余所有字段通过
      const blockedKeys = new Set(['custom_css', 'admin_password', 'admin_token', 'api_key', 'db_id', 'db_name'])
      const nowISO = new Date().toISOString()
      for (const [key, value] of Object.entries(body)) {
        if (blockedKeys.has(key)) {
          continue // 拒绝危险字段
        }
        const jsonValue = typeof value === 'string' ? value : JSON.stringify(value)
        if (jsonValue.length > 65535) {
          return jsonRes({ success: false, error: `字段 ${key} 数据过大，请压缩后重试` }, 413, corsHeaders)
        }
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
        if (!isNaN(idx) && idx >= 0 && idx < library.length) {library.splice(idx, 1)}
      }
      const nowISO = new Date().toISOString()
      await env.DB.prepare(
        `INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      ).bind(logoKey, JSON.stringify(library), nowISO).run()
      return jsonRes({ success: true, library }, 200, corsHeaders)
    }

    if (path === '/api/site-settings/favicon' && method === 'POST') {
      const body = await request.json<{ url: string; name: string }>()
      const faviconKey = 'favicon_library'
      const result = await env.DB.prepare('SELECT value FROM site_settings WHERE key = ?').bind(faviconKey).first()
      const library: Array<{ url: string; name: string; added_at: string }> = result
        ? JSON.parse((result as { value: string }).value || '[]') : []
      library.push({ url: body.url || '', name: body.name || `Favicon ${library.length + 1}`, added_at: new Date().toISOString() })
      const nowISO = new Date().toISOString()
      await env.DB.prepare(
        `INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      ).bind(faviconKey, JSON.stringify(library), nowISO).run()
      await env.DB.prepare(
        `INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      ).bind('current_favicon_url', body.url || '', nowISO).run()
      return jsonRes({ success: true, library }, 200, corsHeaders)
    }

    if (path === '/api/site-settings/favicon' && method === 'DELETE') {
      const urlToDelete = url.searchParams.get('url')
      const indexToDelete = url.searchParams.get('index')
      const faviconKey = 'favicon_library'
      const result = await env.DB.prepare('SELECT value FROM site_settings WHERE key = ?').bind(faviconKey).first()
      let library: Array<{ url: string; name: string; added_at: string }> = result
        ? JSON.parse((result as { value: string }).value || '[]') : []
      if (urlToDelete) {
        library = library.filter((l) => l.url !== urlToDelete)
      } else if (indexToDelete !== null) {
        const idx = parseInt(indexToDelete, 10)
        if (!isNaN(idx) && idx >= 0 && idx < library.length) {library.splice(idx, 1)}
      }
      const nowISO = new Date().toISOString()
      await env.DB.prepare(
        `INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      ).bind(faviconKey, JSON.stringify(library), nowISO).run()
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

/** 批量查询链接的标签并附加到 link 对象上 */
async function batchAttachTags(env: Env, links: Array<Record<string, unknown>>) {
  if (links.length === 0) {return}
  const ids = links.map(l => l.id as string).filter(Boolean)
  if (ids.length === 0) {return}
  const ph = ids.map(() => '?').join(',')
  const tagRows = await env.DB.prepare(
    `SELECT lt.link_id, t.id as tag_id, t.name as tag_name, t.color as tag_color
     FROM link_tags lt JOIN tags t ON lt.tag_id = t.id
     WHERE lt.link_id IN (${ph})`
  ).bind(...ids).all()
  const byLink = new Map<string, Array<{ id: string; name: string; color: string }>>()
  const rows = tagRows.results as Array<Record<string, unknown>>
  for (let i = 0; i < (rows?.length || 0); i++) {
    const lid = String(rows[i].link_id)
    if (!byLink.has(lid)) {byLink.set(lid, [])}
    const arr = byLink.get(lid)
    if (arr) {arr.push({
      id: String(rows[i].tag_id),
      name: String(rows[i].tag_name),
      color: String(rows[i].tag_color || '#6366F1'),
    })}
  }
  for (const l of links) {
    l.tags = byLink.get(String(l.id)) || []
  }
}

/** 写入链接的标签关联 */
async function setLinkTags(env: Env, linkId: string, tagIds: Array<string>) {
  await env.DB.prepare('DELETE FROM link_tags WHERE link_id = ?').bind(linkId).run()
  if (tagIds.length === 0) {return}
  // 批量插入
  const phs = tagIds.map(() => '(?, ?)').join(', ')
  const vals: Array<string> = []
  for (const tid of tagIds) { vals.push(linkId, tid) }
  await env.DB.prepare(`INSERT INTO link_tags (link_id, tag_id) VALUES ${phs}`).bind(...vals).run()
}

function matchPath(path: string, pattern: string): boolean {
  return new RegExp(`^${pattern.replace(/:[^/]+/g, '[^/]+')}$`).test(path)
}

function extractParam(path: string, pattern: string): string | null {
  const parts = pattern.split('/')
  const pathParts = path.split('/')
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].startsWith(':')) {return pathParts[i]}
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

/** Security headers for all responses */
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-XSS-Protection': '1; mode=block',
}

function jsonRes(data: unknown, status: number, extraHeaders?: Record<string, string>): Response {
  const isGet = status >= 200 && status < 300
  // GET 响应启用 CDN 缓存：浏览器 2 分钟 / CDN 边缘 5 分钟 / 过期后异步刷新 10 分钟
  const cacheHeaders = isGet ? {
    'Cache-Control': 'public, max-age=120, s-maxage=300, stale-while-revalidate=600',
    'CDN-Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
  } : {}
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...securityHeaders, ...extraHeaders, ...cacheHeaders },
  })
}

/** 安全协议白名单 */
const ALLOWED_PROTOCOLS = new Set([
  'http:', 'https:', 'ftp:', 'ftps:', 'magnet:', 'ed2k:', 'thunder:',
])

/** 验证 URL 是否安全（仅允许白名单协议） */
function isSafeUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl)
    return ALLOWED_PROTOCOLS.has(u.protocol)
  } catch {
    return false
  }
}

/** 去除 HTML 标签和首尾空白 */
function sanitizeString(str: string): string {
  return str.replace(/<[^>]*>/g, '').trim()
}

/** 净化链接 URL：去除空白和多余字符 */
function sanitizeLinkUrl(rawUrl: string): string {
  const url = rawUrl.trim()
  // 去除可能被注入的 javascript: 协议
  if (/^\s*javascript\s*:/i.test(url)) {return ''}
  if (/^\s*data\s*:/i.test(url)) {return ''}
  if (/^\s*file\s*:/i.test(url)) {return ''}
  return url
}
