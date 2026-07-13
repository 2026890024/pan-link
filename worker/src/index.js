/**
 * pan-link API Worker
 * 为前端提供 REST API，操作 D1 数据库
 * 部署在 Cloudflare Workers 上（开发/备用 API）
 *
 * 安全策略 (单人管理后台):
 * - CORS 白名单限制
 * - 内存级 Rate Limiting (写操作 20/min, 读操作 100/min)
 */

// ============ 内存级频率限制 ============

const rateMap = new Map();
let lastCleanup = 0;

function cleanRateMap(now) {
  if (now - lastCleanup > 300000) {
    for (const [k, v] of rateMap) {
      if (now > v.resetAt) rateMap.delete(k);
    }
    lastCleanup = now;
  }
}

function checkRateLimit(ip, method, now) {
  cleanRateMap(now);

  const isWrite = ['POST', 'PUT', 'DELETE'].includes(method);
  const key = `${ip}:${isWrite ? 'write' : 'read'}`;
  const limit = isWrite ? 20 : 100;       // 写 20/分钟，读 100/分钟
  const windowMs = 60000;                 // 1 分钟窗口

  let entry = rateMap.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
  }

  if (entry.count >= limit) {
    return { allowed: false, limit, resetAt: entry.resetAt };
  }

  entry.count++;
  rateMap.set(key, entry);
  return { allowed: true, limit, resetAt: entry.resetAt };
}

// ============ CORS 配置 ============

const ALLOWED_ORIGINS = [
  'https://pan110.pages.dev',
  'https://2c15ea46.pan110.pages.dev',
  'https://31b58f80.pan110.pages.dev',
  'http://localhost:5173',
  'http://localhost:3000',
];

function getAllowedOrigin(origin) {
  if (!origin) return '';
  // 允许所有 *.pan110.pages.dev 子域名
  if (origin.endsWith('.pan110.pages.dev') || origin === 'https://pan110.pages.dev') return origin;
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  return 'null';
}

// ============ Worker 主逻辑 ============

export default {
  async fetch(request, env) {
    const method = request.method;
    const now = Date.now();

    // 获取客户端 IP
    const clientIp =
      request.headers.get('CF-Connecting-IP') ||
      request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
      'unknown';

    // Rate Limiting
    const rl = checkRateLimit(clientIp, method, now);
    if (!rl.allowed) {
      return new Response(
        JSON.stringify({
          error: '请求过于频繁，请稍后再试',
          retryAfter: Math.ceil((rl.resetAt - now) / 1000),
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(Math.ceil((rl.resetAt - now) / 1000)),
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    // CORS headers
    const requestOrigin = request.headers.get('Origin') || '';
    const allowOrigin = getAllowedOrigin(requestOrigin);

    const corsHeaders = {
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    };

    // 缓存策略：GET 请求缓存 60 秒
    const cacheHeaders = method === 'GET'
      ? { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' }
      : {};

    // 局部响应函数，自动合并缓存头
    const jsonResponse = (data, status, extraHeaders) => {
      const allHeaders = { ...extraHeaders, ...cacheHeaders };
      return new Response(JSON.stringify(data, null, 2), {
        status,
        headers: { ...allHeaders, 'Content-Type': 'application/json' },
      });
    };

    // Handle preflight
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      const url = new URL(request.url);
      const path = url.pathname;

      // ====== Health Check ======
      if (path === '/api/health') {
        return jsonResponse(
          { status: 'ok', db: env.DB ? 'connected' : 'missing' },
          200, corsHeaders
        );
      }

      // ====== CATEGORIES ======

      // GET /api/categories
      if (path === '/api/categories' && method === 'GET') {
        const result = await env.DB.prepare(
          'SELECT * FROM categories ORDER BY sort_order ASC'
        ).all();
        return jsonResponse(result.results || [], 200, corsHeaders);
      }

      // POST /api/categories
      if (path === '/api/categories' && method === 'POST') {
        const body = await request.json();
        const id = body.id || generateId();
        const nowISO = new Date().toISOString();

        await env.DB.prepare(
          `INSERT INTO categories (id, user_id, name, logo_url, sort_order, is_system, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          id,
          body.user_id || '',
          body.name || '',
          body.logo_url || null,
          body.sort_order || 0,
          body.is_system ? 1 : 0,
          nowISO,
          nowISO
        ).run();

        return jsonResponse({ success: true, id }, 201, corsHeaders);
      }

      // PUT /api/categories/:id
      if (matchPath(path, '/api/categories/:id') && method === 'PUT') {
        const catId = extractParam(path, '/api/categories/:id');
        const body = await request.json();
        const nowISO = new Date().toISOString();

        await env.DB.prepare(
          `UPDATE categories SET name=?, logo_url=?, sort_order=?, updated_at=? WHERE id=?`
        ).bind(
          body.name || '',
          body.logo_url || null,
          body.sort_order || 0,
          nowISO,
          catId
        ).run();

        return jsonResponse({ success: true }, 200, corsHeaders);
      }

      // DELETE /api/categories/:id
      if (matchPath(path, '/api/categories/:id') && method === 'DELETE') {
        const catId = extractParam(path, '/api/categories/:id');
        await env.DB.prepare('DELETE FROM categories WHERE id=?').bind(catId).run();
        return jsonResponse({ success: true }, 200, corsHeaders);
      }

      // ====== LINKS ======

      // GET /api/links
      if (path === '/api/links' && method === 'GET') {
        const categoryId = url.searchParams.get('category_id');
        let query = `
          SELECT l.*,
                 c.name as category_name,
                 c.logo_url as category_logo
          FROM links l
          LEFT JOIN categories c ON l.category_id = c.id
          WHERE l.status = 'active'
        `;
        const params = [];

        if (categoryId) {
          query += ' AND l.category_id = ?';
          params.push(categoryId);
        }

        query += ' ORDER BY l.is_pinned DESC, l.created_at DESC';

        const stmt = env.DB.prepare(query);
        for (const p of params) stmt.bind(p);
        const result = await stmt.all();
        return jsonResponse(result.results || [], 200, corsHeaders);
      }

      // GET /api/links/public
      if (path === '/api/links/public' && method === 'GET') {
        const slug = url.searchParams.get('slug');
        let query = `
          SELECT l.*,
                 c.name as category_name,
                 c.logo_url as category_logo
          FROM links l
          LEFT JOIN categories c ON l.category_id = c.id
          WHERE l.status = 'active'
        `;
        const params = [];

        if (slug) {
          query += ' AND l.slug = ?';
          params.push(slug);
        }

        query += ' ORDER BY l.is_pinned DESC, l.created_at DESC';

        const stmt = env.DB.prepare(query);
        for (const p of params) stmt.bind(p);
        const result = await stmt.all();

        if (slug) {
          // 记录访问
          try {
            await env.DB.prepare(
              'INSERT INTO link_visits (link_id, visitor_ip, user_agent, referer, visit_type) VALUES (?, ?, ?, ?, ?)'
            ).bind(
              result.results?.[0]?.id || '',
              request.headers.get('CF-Connecting-IP') || null,
              request.headers.get('User-Agent') || null,
              request.headers.get('Referer') || null,
              'click'
            ).run();
            // 更新点击数
            if (result.results?.[0]) {
              await env.DB.prepare(
                'UPDATE links SET click_count = click_count + 1 WHERE id = ?'
              ).bind(result.results[0].id).run();
            }
          } catch (e) { /* ignore */ }

          return jsonResponse(result.results?.[0] || null, 200, corsHeaders);
        }

        return jsonResponse(result.results || [], 200, corsHeaders);
      }

      // GET /api/links/stats
      if (path === '/api/links/stats' && method === 'GET') {
        const linksResult = await env.DB.prepare(
          'SELECT COUNT(*) as total FROM links WHERE status="active"'
        ).first();
        const clicksResult = await env.DB.prepare(
          'SELECT COALESCE(SUM(click_count), 0) as total_clicks FROM links'
        ).first();
        const catsResult = await env.DB.prepare(
          'SELECT COUNT(*) as total FROM categories'
        ).first();
        const pinnedResult = await env.DB.prepare(
          'SELECT COUNT(*) as total FROM links WHERE is_pinned=1 AND status="active"'
        ).first();
        const favResult = await env.DB.prepare(
          'SELECT COUNT(*) as total FROM links WHERE is_favorited=1 AND status="active"'
        ).first();

        return jsonResponse(
          {
            total_links: linksResult?.total || 0,
            total_clicks: clicksResult?.total_clicks || 0,
            total_categories: catsResult?.total || 0,
            pinned_links: pinnedResult?.total || 0,
            favorited_links: favResult?.total || 0,
          },
          200, corsHeaders
        );
      }

      // POST /api/links
      if (path === '/api/links' && method === 'POST') {
        const body = await request.json();
        const id = body.id || generateId();
        const nowISO = new Date().toISOString();
        const maxSort = await getMaxSort(env);

        await env.DB.prepare(
          `INSERT INTO links (
            id, user_id, name, slug, url, category_id, subcategory_id,
            extract_code, validity_period, expires_at, click_count, registration_count,
            is_pinned, is_favorited, status, drive_type, icon, description,
            created_at, updated_at, visible, sort_order
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          id,
          body.user_id || '',
          body.name || '',
          body.slug || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          body.url || '',
          body.category_id || null,
          body.subcategory_id || null,
          body.extract_code || null,
          body.validity_period || 'permanent',
          body.expires_at || null,
          0, 0,
          body.is_pinned ? 1 : 0,
          body.is_favorited ? 1 : 0,
          'active',
          body.drive_type || 'baidu',
          body.icon || null,
          body.description || null,
          nowISO, nowISO,
          body.visible !== undefined ? (body.visible ? 1 : 0) : 1,
          body.sort_order ?? (maxSort + 1)
        ).run();

        // 返回创建的记录
        const link = await env.DB.prepare('SELECT * FROM links WHERE id = ?').bind(id).first();
        return jsonResponse(link, 201, corsHeaders);
      }

      // PUT /api/links/:id
      if (matchPath(path, '/api/links/:id') && method === 'PUT') {
        const linkId = extractParam(path, '/api/links/:id');
        const body = await request.json();
        const nowISO = new Date().toISOString();

        const fields = [];
        const values = [];
        const allowedFields = [
          'name', 'url', 'category_id', 'subcategory_id', 'extract_code',
          'validity_period', 'expires_at', 'is_pinned', 'is_favorited', 'status',
          'drive_type', 'icon', 'description', 'visible', 'sort_order',
        ];

        for (const field of allowedFields) {
          if (body[field] !== undefined) {
            fields.push(`${field} = ?`);
            values.push(
              typeof body[field] === 'boolean' ? (body[field] ? 1 : 0) : body[field]
            );
          }
        }

        if (fields.length > 0) {
          fields.push('updated_at = ?');
          values.push(nowISO);
          values.push(linkId);
          await env.DB.prepare(
            `UPDATE links SET ${fields.join(', ')} WHERE id = ?`
          ).bind(...values).run();
        }

        return jsonResponse({ success: true }, 200, corsHeaders);
      }

      // DELETE /api/links/:id
      if (matchPath(path, '/api/links/:id') && method === 'DELETE') {
        const linkId = extractParam(path, '/api/links/:id');
        await env.DB.prepare('DELETE FROM links WHERE id = ?').bind(linkId).run();
        return jsonResponse({ success: true }, 200, corsHeaders);
      }

      // ====== TAGS ======

      // GET /api/tags
      if (path === '/api/tags' && method === 'GET') {
        const result = await env.DB.prepare('SELECT * FROM tags ORDER BY name ASC').all();
        return jsonResponse(result.results || [], 200, corsHeaders);
      }

      // POST /api/tags
      if (path === '/api/tags' && method === 'POST') {
        const body = await request.json();
        const id = body.id || generateId();
        const nowISO = new Date().toISOString();

        await env.DB.prepare(
          `INSERT INTO tags (id, user_id, name, color, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(
          id,
          body.user_id || '',
          body.name || '',
          body.color || '#6B7280',
          nowISO,
          nowISO
        ).run();

        return jsonResponse({ success: true, id }, 201, corsHeaders);
      }

      // DELETE /api/tags/:id
      if (matchPath(path, '/api/tags/:id') && method === 'DELETE') {
        const tagId = extractParam(path, '/api/tags/:id');
        await env.DB.prepare('DELETE FROM tags WHERE id = ?').bind(tagId).run();
        return jsonResponse({ success: true }, 200, corsHeaders);
      }

      // ====== SITE SETTINGS ======

      // GET /api/site-settings
      if (path === '/api/site-settings' && method === 'GET') {
        const result = await env.DB.prepare('SELECT key, value FROM site_settings').all();
        const settings = {};
        if (result.results) {
          for (const row of result.results) {
            try {
              settings[row.key] = JSON.parse(row.value);
            } catch {
              settings[row.key] = row.value;
            }
          }
        }
        return jsonResponse(settings, 200, corsHeaders);
      }

      // PUT /api/site-settings
      if (path === '/api/site-settings' && method === 'PUT') {
        const body = await request.json();
        const nowISO = new Date().toISOString();
        for (const [key, value] of Object.entries(body)) {
          const jsonValue = typeof value === 'string' ? value : JSON.stringify(value);
          await env.DB.prepare(
            `INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
          ).bind(key, jsonValue, nowISO).run();
        }
        return jsonResponse({ success: true }, 200, corsHeaders);
      }

      // POST /api/site-settings/logo
      if (path === '/api/site-settings/logo' && method === 'POST') {
        const body = await request.json();
        const logoKey = 'logo_library';
        const result = await env.DB.prepare(
          'SELECT value FROM site_settings WHERE key = ?'
        ).bind(logoKey).first();
        const library = result ? JSON.parse(result.value || '[]') : [];
        library.push({
          url: body.url || '',
          name: body.name || `Logo ${library.length + 1}`,
          added_at: new Date().toISOString(),
        });
        const nowISO = new Date().toISOString();
        await env.DB.prepare(
          `INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
        ).bind(logoKey, JSON.stringify(library), nowISO).run();
        return jsonResponse({ success: true, library }, 200, corsHeaders);
      }

      // DELETE /api/site-settings/logo
      if (path === '/api/site-settings/logo' && method === 'DELETE') {
        const urlToDelete = url.searchParams.get('url');
        const indexToDelete = url.searchParams.get('index');
        const logoKey = 'logo_library';
        const result = await env.DB.prepare(
          'SELECT value FROM site_settings WHERE key = ?'
        ).bind(logoKey).first();
        let library = result ? JSON.parse(result.value || '[]') : [];
        if (urlToDelete) {
          library = library.filter((l) => l.url !== urlToDelete);
        } else if (indexToDelete !== null) {
          const idx = parseInt(indexToDelete, 10);
          if (!isNaN(idx) && idx >= 0 && idx < library.length) library.splice(idx, 1);
        }
        const nowISO = new Date().toISOString();
        await env.DB.prepare(
          `INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
        ).bind(logoKey, JSON.stringify(library), nowISO).run();
        return jsonResponse({ success: true, library }, 200, corsHeaders);
      }

      // Default 404
      return jsonResponse({ error: 'Not found' }, 404, corsHeaders);
    } catch (err) {
      console.error('[pan-link API] Error:', err);
      return jsonResponse(
        { error: err.message || 'Internal server error' },
        500, corsHeaders
      );
    }
  },
};

// ============ Helper Functions ============

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function matchPath(path, pattern) {
  const regex = pattern.replace(/:[^/]+/g, '[^/]+');
  return new RegExp(`^${regex}$`).test(path);
}

function extractParam(path, pattern) {
  const parts = pattern.split('/');
  const pathParts = path.split('/');
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].startsWith(':')) {
      return pathParts[i];
    }
  }
  return null;
}

async function getMaxSort(env) {
  try {
    const r = await env.DB.prepare(
      'SELECT COALESCE(MAX(sort_order), 0) as max_sort FROM links'
    ).first();
    return r?.max_sort || 0;
  } catch {
    return 0;
  }
}
