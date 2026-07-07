-- ============================================================
-- Pan-Link 完整数据库 Schema
-- 适配当前代码数据模型，可直接在 Supabase SQL Editor 中执行
-- ============================================================

-- ============ 1. 分类表 ============
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID DEFAULT NULL,
  name TEXT NOT NULL,
  logo_url TEXT DEFAULT NULL,
  sort_order INTEGER NOT NULL DEFAULT 999,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ 2. 标签表 ============
CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366F1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ 3. 链接表（核心表） ============
-- validity_period 枚举
DO $$ BEGIN
  CREATE TYPE validity_period_type AS ENUM ('1_month', '3_months', '6_months', '1_year', 'permanent');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- status 枚举
DO $$ BEGIN
  CREATE TYPE link_status_type AS ENUM ('active', 'expired', 'disabled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL,
  category_id UUID DEFAULT NULL REFERENCES categories(id) ON DELETE SET NULL,
  extract_code TEXT DEFAULT NULL,
  validity_period validity_period_type NOT NULL DEFAULT 'permanent',
  expires_at TIMESTAMPTZ DEFAULT NULL,
  click_count INTEGER NOT NULL DEFAULT 0,
  registration_count INTEGER NOT NULL DEFAULT 0,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  is_favorited BOOLEAN NOT NULL DEFAULT FALSE,
  status link_status_type NOT NULL DEFAULT 'active',
  sort_order INTEGER NOT NULL DEFAULT 999,
  visible BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_links_user_id ON links(user_id);
CREATE INDEX IF NOT EXISTS idx_links_category_id ON links(category_id);
CREATE INDEX IF NOT EXISTS idx_links_status ON links(status);
CREATE INDEX IF NOT EXISTS idx_links_is_pinned ON links(is_pinned);
CREATE INDEX IF NOT EXISTS idx_links_is_favorited ON links(is_favorited);
CREATE INDEX IF NOT EXISTS idx_links_slug ON links(slug);
CREATE INDEX IF NOT EXISTS idx_links_created_at ON links(created_at);

-- ============ 4. 链接-标签关联表（多对多） ============
CREATE TABLE IF NOT EXISTS link_tags (
  link_id UUID NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (link_id, tag_id)
);

-- ============ 5. 访问记录表 ============
DO $$ BEGIN
  CREATE TYPE visit_type_type AS ENUM ('click', 'registration');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS link_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id UUID NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  visitor_ip TEXT DEFAULT NULL,
  user_agent TEXT DEFAULT NULL,
  referer TEXT DEFAULT NULL,
  visit_type visit_type_type NOT NULL DEFAULT 'click',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_link_visits_link_id ON link_visits(link_id);

-- ============ 6. 用户资料表 ============
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT DEFAULT NULL,
  avatar_url TEXT DEFAULT NULL,
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- RPC 函数
-- ============================================================

-- 增加链接点击计数
CREATE OR REPLACE FUNCTION increment_link_click_count(link_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE links SET click_count = click_count + 1 WHERE id = link_id;
END;
$$ LANGUAGE plpgsql;

-- 搜索链接
CREATE OR REPLACE FUNCTION search_links(search_query TEXT)
RETURNS TABLE(
  id UUID,
  user_id UUID,
  name TEXT,
  slug TEXT,
  description TEXT,
  url TEXT,
  category_id UUID,
  extract_code TEXT,
  validity_period validity_period_type,
  expires_at TIMESTAMPTZ,
  click_count INTEGER,
  registration_count INTEGER,
  is_pinned BOOLEAN,
  is_favorited BOOLEAN,
  status link_status_type,
  sort_order INTEGER,
  visible BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  category_name TEXT,
  category_logo TEXT
) AS $$
BEGIN
  RETURN QUERY
    SELECT
      l.id, l.user_id, l.name, l.slug, l.description, l.url,
      l.category_id, l.extract_code, l.validity_period, l.expires_at,
      l.click_count, l.registration_count, l.is_pinned, l.is_favorited,
      l.status, l.sort_order, l.visible, l.created_at, l.updated_at,
      c.name AS category_name,
      c.logo_url AS category_logo
    FROM links l
    LEFT JOIN categories c ON l.category_id = c.id
    WHERE
      l.status = 'active'
      AND l.visible = TRUE
      AND (
        l.name ILIKE '%' || search_query || '%'
        OR l.description ILIKE '%' || search_query || '%'
        OR l.slug ILIKE '%' || search_query || '%'
        OR l.extract_code ILIKE '%' || search_query || '%'
      )
    ORDER BY l.is_pinned DESC, l.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Dashboard 统计
CREATE OR REPLACE FUNCTION get_dashboard_stats(user_uuid UUID)
RETURNS TABLE(
  total_links BIGINT,
  total_clicks BIGINT,
  total_registrations BIGINT,
  active_links BIGINT,
  expiring_soon BIGINT,
  expired_links BIGINT,
  pinned_links BIGINT,
  favorited_links BIGINT
) AS $$
BEGIN
  RETURN QUERY
    SELECT
      COUNT(*) AS total_links,
      COALESCE(SUM(l.click_count), 0) AS total_clicks,
      COALESCE(SUM(l.registration_count), 0) AS total_registrations,
      COUNT(*) FILTER (WHERE l.status = 'active') AS active_links,
      COUNT(*) FILTER (WHERE l.status = 'active' AND l.expires_at IS NOT NULL AND l.expires_at <= now() + INTERVAL '7 days') AS expiring_soon,
      COUNT(*) FILTER (WHERE l.status = 'expired') AS expired_links,
      COUNT(*) FILTER (WHERE l.is_pinned = TRUE) AS pinned_links,
      COUNT(*) FILTER (WHERE l.is_favorited = TRUE) AS favorited_links
    FROM links l
    WHERE l.user_id = user_uuid;
END;
$$ LANGUAGE plpgsql;

-- 分类统计
CREATE OR REPLACE FUNCTION get_category_stats(user_uuid UUID)
RETURNS TABLE(
  category_id UUID,
  category_name TEXT,
  category_logo TEXT,
  link_count BIGINT,
  total_clicks BIGINT
) AS $$
BEGIN
  RETURN QUERY
    SELECT
      c.id AS category_id,
      c.name AS category_name,
      c.logo_url AS category_logo,
      COUNT(l.id) AS link_count,
      COALESCE(SUM(l.click_count), 0) AS total_clicks
    FROM categories c
    LEFT JOIN links l ON l.category_id = c.id AND l.user_id = user_uuid
    GROUP BY c.id, c.name, c.logo_url
    ORDER BY c.sort_order ASC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 自动更新 updated_at 触发器
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 为各表创建触发器
DO $$ BEGIN
  CREATE TRIGGER set_links_updated_at BEFORE UPDATE ON links
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER set_categories_updated_at BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER set_tags_updated_at BEFORE UPDATE ON tags
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 预设种子数据
-- ============================================================

-- 预设分类
INSERT INTO categories (id, name, logo_url, sort_order, is_system) VALUES
  ('11111111-1111-1111-1111-111111111101', '夸克网盘', 'https://img.icons8.com/color/144/quark--v1.png', 1, TRUE),
  ('11111111-1111-1111-1111-111111111102', '百度网盘', 'https://img.icons8.com/color/144/baidu.png', 2, TRUE),
  ('11111111-1111-1111-1111-111111111103', '阿里云盘', 'https://img.icons8.com/color/144/alibaba.png', 3, TRUE),
  ('11111111-1111-1111-1111-111111111104', '迅雷云盘', 'https://img.icons8.com/color/144/thunder.png', 4, TRUE),
  ('11111111-1111-1111-1111-111111111105', '蓝奏云',   'https://img.icons8.com/color/144/lanzou.png', 5, TRUE),
  ('11111111-1111-1111-1111-111111111106', '其他网盘', 'https://img.icons8.com/color/144/folder-invoices--v1.png', 99, TRUE)
ON CONFLICT (id) DO NOTHING;

-- 预设标签
INSERT INTO tags (id, user_id, name, color) VALUES
  ('22222222-2222-2222-2222-222222222201', '00000000-0000-0000-0000-000000000000', '热门', '#EF4444'),
  ('22222222-2222-2222-2222-222222222202', '00000000-0000-0000-0000-000000000000', '推荐', '#F59E0B'),
  ('22222222-2222-2222-2222-222222222203', '00000000-0000-0000-0000-000000000000', '教程', '#10B981'),
  ('22222222-2222-2222-2222-222222222204', '00000000-0000-0000-0000-000000000000', '资源', '#6366F1')
ON CONFLICT (id) DO NOTHING;
