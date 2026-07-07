/**
 * pan-link API Worker
 * 为前端提供 REST API，操作 D1 数据库
 * 部署在 Cloudflare Workers 上
 */

export default {
  async fetch(request, env) {
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

      // GET /api/categories - 获取所有分类
      if (path === '/api/categories' && request.method === 'GET') {
        const result = await env.DB.prepare('SELECT * FROM categories ORDER BY sort_order ASC').all();
        return jsonResponse(result.results || [], 200, corsHeaders);
      }

      // POST /api/categories - 创建分类
      if (path === '/api/categories' && request.method === 'POST') {
        const body = await request.json();
        const id = body.id || generateId();
        const now = new Date().toISOString();
        
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
          now,
          now
        ).run();

        return jsonResponse({ success: true, id }, 201, corsHeaders);
      }

      // PUT /api/categories/:id - 更新分类
      if (matchPath(path, '/api/categories/:id') && request.method === 'PUT') {
        const catId = extractParam(path, '/api/categories/:id');
        const body = await request.json();
        const now = new Date().toISOString();
        
        await env.DB.prepare(
          `UPDATE categories SET name=?, logo_url=?, sort_order=?, updated_at=? WHERE id=?`
        ).bind(body.name || '', body.logo_url || null, body.sort_order || 0, now, catId).run();

        return jsonResponse({ success: true }, 200, corsHeaders);
      }

      // DELETE /api/categories/:id - 删除分类
      if (matchPath(path, '/api/categories/:id') && request.method === 'DELETE') {
        const catId = extractParam(path, '/api/categories/:id');
        await env.DB.prepare('DELETE FROM categories WHERE id=?').bind(catId).run();
        return jsonResponse({ success: true }, 200, corsHeaders);
      }


      // ====== LINKS ======

      // GET /api/links - 获取所有链接（支持过滤）
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

      // GET /api/links/public - 公开接口（给访客用）
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
              await env.DB.prepare('UPDATE links SET click_count = click_count + 1 WHERE id = ?')
                .bind(result.results[0].id).run();
            }
          } catch(e) {}
          
          return jsonResponse(result.results?.[0] || null, 200, corsHeaders);
        }
        
        return jsonResponse(result.results || [], 200, corsHeaders);
      }

      // GET /api/links/stats - 获取统计数据
      if (path === '/api/links/stats' && request.method === 'GET') {
        const linksResult = await env.DB.prepare('SELECT COUNT(*) as total FROM links WHERE status="active"').first();
        const clicksResult = await env.DB.prepare('SELECT COALESCE(SUM(click_count), 0) as total_clicks FROM links').first();
        const catsResult = await env.DB.prepare('SELECT COUNT(*) as total FROM categories').first();
        const pinnedResult = await env.DB.prepare('SELECT COUNT(*) as total FROM links WHERE is_pinned=1 AND status="active"').first();
        const favResult = await env.DB.prepare('SELECT COUNT(*) as total FROM links WHERE is_favorited=1 AND status="active"').first();

        return jsonResponse({
          total_links: linksResult?.total || 0,
          total_clicks: clicksResult?.total_clicks || 0,
          total_categories: catsResult?.total || 0,
          pinned_links: pinnedResult?.total || 0,
          favorited_links: favResult?.total || 0,
        }, 200, corsHeaders);
      }

      // POST /api/links - 创建链接
      if (path === '/api/links' && request.method === 'POST') {
        const body = await request.json();
        const id = body.id || generateId();
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
          body.user_id || '',
          body.name || '',
          body.slug || `${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
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
          now, now,
          body.visible !== undefined ? (body.visible ? 1 : 0) : 1,
          body.sort_order ?? (maxSort + 1)
        ).run();

        // 返回创建的记录
        const link = await env.DB.prepare('SELECT * FROM links WHERE id = ?').bind(id).first();
        return JsonResponse(link, 201, corsHeaders);
      }

      // PUT /api/links/:id - 更新链接
      if (matchPath(path, '/api/links/:id') && request.method === 'PUT') {
        const linkId = extractParam(path, '/api/links/:id');
        const body = await request.json();
        const now = new Date().toISOString();

        const fields = [];
        const values = [];
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

      // DELETE /api/links/:id - 删除链接
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
        const body = await request.json();
        const id = body.id || generateId();
        const now = new Date().toISOString();

        await env.DB.prepare(
          `INSERT INTO tags (id, user_id, name, color, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(id, body.user_id || '', body.name || '', body.color || '#6B7280', now, now).run();

        return jsonResponse({ success: true, id }, 201, corsHeaders);
      }

      // Default 404
      return jsonResponse({ error: 'Not found' }, 404, corsHeaders);

    } catch (err) {
      console.error('[pan-link API] Error:', err);
      return jsonResponse({ error: err.message || 'Internal server error' }, 500, corsHeaders);
    }
  },
};

// Helper functions
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
    const r = await env.DB.prepare('SELECT COALESCE(MAX(sort_order), 0) as max_sort FROM links').first();
    return r?.max_sort || 0;
  } catch { return 0; }
}

function jsonResponse(data, status, headers) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}
