/**
 * 短链接 Slug 重定向处理
 * 路径: /s/:slug  例如 pan110.pages.dev/s/1 → 302 跳转到目标 URL
 */

interface Env {
  DB: D1Database
}

interface LinkRow {
  url: string
  id: string
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { env } = context
  const slug = context.params.slug as string

  if (!slug) {
    return new Response('Missing slug', { status: 400 })
  }

  // D1 查询 slug → url
  try {
    const link = await env.DB.prepare(
      'SELECT url, id FROM links WHERE slug = ? AND status = ? LIMIT 1'
    ).bind(slug, 'active').first<LinkRow>()

    if (!link || !link.url) {
      return new Response('Link not found', { status: 404 })
    }

    // 异步更新点击统计（不阻塞重定向）
    context.waitUntil(
      env.DB.prepare('UPDATE links SET click_count = click_count + 1 WHERE id = ?')
        .bind(link.id)
        .run()
    )

    // 302 跳转到目标 URL
    return new Response(null, {
      status: 302,
      headers: {
        'Location': link.url,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[pan-link /s/] Slug lookup error:', err)
    return new Response('Internal error', { status: 500 })
  }
}
