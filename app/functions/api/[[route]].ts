/**
 * pan-link API - Cloudflare Pages Functions
 * 提供 REST API，操作 D1 数据库
 * API 和前端共用 pan110.pages.dev 域名，解决国内访问问题
 */

interface Env {
  DB: D1Database;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  // Handle preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const url = new URL(request.url);
    const path = url.pathname;

    // ====== Health Check ======
    if (path === '/api/health') {
      return jsonResponse({ status: 'ok', db: env.DB ? 'connected' : 'missing' }, 200, corsHeaders);
    }

    // ====== CATEGORIES ======

    // GET /api/categories
    if (path === '/api/categories' && request.method === 'GET') {
      const result = await env.DB.prepare('SELECT * FROM categories ORDER BY sort_order ASC').all();
      return jsonResponse(result.results || [], 200, corsHeaders);
    }

    // POST /api/categories
    if (path === '/api/categories' && request.method === 'POST') {
      const body = await request.json<Record<string, unknown>>();
      const id = (body.id as string) || generateId();
      const now = new Date().toISOString();

      await env.DB.prepare(
        `INSERT INTO categories (id, user_id, name, logo_url, sort_order, is_system, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id,
        (body.user_id as string) || '',
        (body.name as string) || '',
        (body.logo_url as string) || null,
        (body.sort_order as number) || 0,
        body.is_system ? 1 : 0,
        now,
        now
      ).run();

      return jsonResponse({ success: true, id }, 201, corsHeaders);
    }

    // PUT /api/categories/:id
    if (matchPath(path, '/api/categories/:id') && request.method === 'PUT') {
      const catId = extractParam(path, '/api/categories/:id');
      const body = await request.json<Record<string, unknown>>();
      const now = new Date().toISOString();

      await env.DB.prepare(
        `UPDATE categories SET name=?, logo_url=?, sort_order=?, updated_at=? WHERE id=?`
      ).bind((body.name as string) || '', (body.logo_url as string) || null, (body.sort_order as number) || 0, now, catId).run();

      return jsonResponse({ success: true }, 200, corsHeaders);
    }

    // DELETE /api/categories/:id
    if (matchPath(path, '/api/categories/:id') && request.method === 'DELETE') {
      const catId = extractParam(path, '/api/categories/:id');
      await env.DB.prepare('DELETE FROM categories WHERE id=?').bind(catId).run();
      return jsonResponse({ success: true }, 200, corsHeaders);
    }

    // ====== LINKS ======

    // GET /api/links
    if (path === '/api/links' && request.method === 'GET') {
      const categoryId = url.searchParams.get('category_id');
      let query = `
        SELECT l.*,
               c.name as category_name,
               c.logo_url as category_logo
        FROM links l
        LEFT JOIN categories c ON l.category_id = c.id
        WHERE l.status = 'active'
      `;
      const params: unknown[] = [];

      if (categoryId) {
        query += ' AND l.category_id = ?';
        params.push(categoryId);
      }

      query += ' ORDER BY l.is_pinned DESC, l.created_at DESC';

      const stmt = env.DB.prepare(query);
      for (const p of params) stmt.bind(p as string);
      const result = await stmt.all();
      return jsonResponse(result.results || [], 200, corsHeaders);
    }

    // GET /api/links/public
    if (path === '/api/links/public' && request.method === 'GET') {
      const slug = url.searchParams.get('slug');
      let query = `
        SELECT l.*,
               c.name as category_name,
               c.logo_url as category_logo
        FROM links l
        LEFT JOIN categories c ON l.category_id = c.id
        WHERE l.status = 'active'
      `;
      const params: unknown[] = [];

      if (slug) {
        query += ' AND l.slug = ?';
        params.push(slug);
      }

      query += ' ORDER BY l.is_pinned DESC, l.created_at DESC';

      const stmt = env.DB.prepare(query);
      for (const p of params) stmt.bind(p as string);
      const result = await stmt.all();

      if (slug) {
        // 记录访问
        try {
          await env.DB.prepare(
            'INSERT INTO link_visits (link_id, visitor_ip, user_agent, referer, visit_type) VALUES (?, ?, ?, ?, ?)'
          ).bind(
            (result.results?.[0] as Record<string, unknown>)?.id || '',
            request.headers.get('CF-Connecting-IP') || null,
            request.headers.get('User-Agent') || null,
            request.headers.get('Referer') || null,
            'click'
          ).run();
          // 更新点击数
          if (result.results?.[0]) {
            await env.DB.prepare('UPDATE links SET click_count = click_count + 1 WHERE id = ?')
              .bind((result.results[0] as Record<string, unknown>).id as string).run();
          }
        } catch (_e) { /* ignore */ }

        return jsonResponse(result.results?.[0] || null, 200, corsHeaders);
      }

      return jsonResponse(result.results || [], 200, corsHeaders);
    }

    // GET /api/links/stats
    if (path === '/api/links/stats' && request.method === 'GET') {
      const linksResult = await env.DB.prepare('SELECT COUNT(*) as total FROM links WHERE status="active"').first();
      const clicksResult = await env.DB.prepare('SELECT COALESCE(SUM(click_count), 0) as total_clicks FROM links').first();
      const catsResult = await env.DB.prepare('SELECT COUNT(*) as total FROM categories').first();
      const pinnedResult = await env.DB.prepare('SELECT COUNT(*) as total FROM links WHERE is_pinned=1 AND status="active"').first();
      const favResult = await env.DB.prepare('SELECT COUNT(*) as total FROM links WHERE is_favorited=1 AND status="active"').first();

      return jsonResponse({
        total_links: (linksResult as Record<string, number>)?.total || 0,
        total_clicks: (clicksResult as Record<string, number>)?.total_clicks || 0,
        total_categories: (catsResult as Record<string, number>)?.total || 0,
        pinned_links: (pinnedResult as Record<string, number>)?.total || 0,
        favorited_links: (favResult as Record<string, number>)?.total || 0,
      }, 200, corsHeaders);
    }

    // POST /api/links
    if (path === '/api/links' && request.method === 'POST') {
      const body = await request.json<Record<string, unknown>>();
      const id = (body.id as string) || generateId();
      const now = new Date().toISOString();
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
        (body.user_id as string) || '',
        (body.name as string) || '',
        (body.slug as string) || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        (body.url as string) || '',
        (body.category_id as string) || null,
        (body.subcategory_id as string) || null,
        (body.extract_code as string) || null,
        (body.validity_period as string) || 'permanent',
        (body.expires_at as string) || null,
        0, 0,
        body.is_pinned ? 1 : 0,
        body.is_favorited ? 1 : 0,
        'active',
        (body.drive_type as string) || 'baidu',
        (body.icon as string) || null,
        (body.description as string) || null,
        now, now,
        body.visible !== undefined ? (body.visible ? 1 : 0) : 1,
        (body.sort_order as number) ?? (maxSort + 1)
      ).run();

      const link = await env.DB.prepare('SELECT * FROM links WHERE id = ?').bind(id).first();
      return jsonResponse(link, 201, corsHeaders);
    }

    // PUT /api/links/:id
    if (matchPath(path, '/api/links/:id') && request.method === 'PUT') {
      const linkId = extractParam(path, '/api/links/:id');
      const body = await request.json<Record<string, unknown>>();
      const now = new Date().toISOString();

      const fields: string[] = [];
      const values: unknown[] = [];
      const allowedFields = ['name', 'url', 'category_id', 'subcategory_id', 'extract_code',
        'validity_period', 'expires_at', 'is_pinned', 'is_favorited', 'status',
        'drive_type', 'icon', 'description', 'visible', 'sort_order'];

      for (const field of allowedFields) {
        if (body[field] !== undefined) {
          fields.push(`${field} = ?`);
          values.push(typeof body[field] === 'boolean' ? (body[field] ? 1 : 0) : body[field]);
        }
      }

      if (fields.length > 0) {
        fields.push('updated_at = ?');
        values.push(now);
        values.push(linkId);
        await env.DB.prepare(`UPDATE links SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
      }

      return jsonResponse({ success: true }, 200, corsHeaders);
    }

    // DELETE /api/links/:id
    if (matchPath(path, '/api/links/:id') && request.method === 'DELETE') {
      const linkId = extractParam(path, '/api/links/:id');
      await env.DB.prepare('DELETE FROM links WHERE id = ?').bind(linkId).run();
      return jsonResponse({ success: true }, 200, corsHeaders);
    }

    // ====== TAGS ======

    // GET /api/tags
    if (path === '/api/tags' && request.method === 'GET') {
      const result = await env.DB.prepare('SELECT * FROM tags ORDER BY name ASC').all();
      return jsonResponse(result.results || [], 200, corsHeaders);
    }

    // POST /api/tags
    if (path === '/api/tags' && request.method === 'POST') {
      const body = await request.json<Record<string, unknown>>();
      const id = (body.id as string) || generateId();
      const now = new Date().toISOString();

      await env.DB.prepare(
        `INSERT INTO tags (id, user_id, name, color, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(id, (body.user_id as string) || '', (body.name as string) || '', (body.color as string) || '#6B7280', now, now).run();

      return jsonResponse({ success: true, id }, 201, corsHeaders);
    }

    // DELETE /api/tags/:id
    if (matchPath(path, '/api/tags/:id') && request.method === 'DELETE') {
      const tagId = extractParam(path, '/api/tags/:id');
      await env.DB.prepare('DELETE FROM tags WHERE id = ?').bind(tagId).run();
      return jsonResponse({ success: true }, 200, corsHeaders);
    }

    // Default 404
    return jsonResponse({ error: 'Not found' }, 404, corsHeaders);

  } catch (err) {
    console.error('[pan-link API] Error:', err);
    return jsonResponse({ error: (err as Error).message || 'Internal server error' }, 500, corsHeaders);
  }
};

// ============ Helper Functions ============

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function matchPath(path: string, pattern: string): boolean {
  const regex = pattern.replace(/:[^/]+/g, '[^/]+');
  return new RegExp(`^${regex}$`).test(path);
}

function extractParam(path: string, pattern: string): string | null {
  const parts = pattern.split('/');
  const pathParts = path.split('/');
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].startsWith(':')) {
      return pathParts[i];
    }
  }
  return null;
}

async function getMaxSort(env: Env): Promise<number> {
  try {
    const r = await env.DB.prepare('SELECT COALESCE(MAX(sort_order), 0) as max_sort FROM links').first();
    return (r as Record<string, number>)?.max_sort || 0;
  } catch { return 0; }
}

function jsonResponse(data: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}
