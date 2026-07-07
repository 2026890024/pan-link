-- 网盘拉新链接管理系统 V2 - 数据库初始化脚本
-- 运行前请确保已创建 Supabase 项目

-- ========================================
-- 1. 启用 UUID 扩展
-- ========================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========================================
-- 2. 用户配置表 (profiles)
-- ========================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT,
  avatar_url TEXT,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 启用 RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- RLS 策略
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ========================================
-- 3. 分类表 (categories)
-- ========================================
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- NULL 表示系统分类
  name TEXT NOT NULL,
  logo_url TEXT,
  sort_order INTEGER DEFAULT 0,
  is_system BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_category_name UNIQUE (user_id, name)
);

-- 启用 RLS
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- RLS 策略
CREATE POLICY "Anyone can view categories"
  ON categories FOR SELECT
  USING (is_system = TRUE OR auth.uid() = user_id);

CREATE POLICY "Users can manage own categories"
  ON categories FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "System categories are viewable by all"
  ON categories FOR SELECT
  USING (is_system = TRUE);

-- ========================================
-- 4. 标签表 (tags)
-- ========================================
CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366F1',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_tag_name UNIQUE (user_id, name)
);

-- 启用 RLS
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;

-- RLS 策略
CREATE POLICY "Users can view own tags"
  ON tags FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own tags"
  ON tags FOR ALL
  USING (auth.uid() = user_id);

-- ========================================
-- 5. 链接表 (links)
-- ========================================
CREATE TYPE link_status AS ENUM ('active', 'expired', 'disabled');
CREATE TYPE validity_period AS ENUM ('1_month', '3_months', '6_months', '1_year', 'permanent');

CREATE TABLE IF NOT EXISTS links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  url TEXT NOT NULL,
  extract_code TEXT,
  validity_period validity_period DEFAULT 'permanent',
  expires_at TIMESTAMPTZ,
  click_count INTEGER DEFAULT 0,
  registration_count INTEGER DEFAULT 0,
  is_pinned BOOLEAN DEFAULT FALSE,
  is_favorited BOOLEAN DEFAULT FALSE,
  status link_status DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_slug UNIQUE (user_id, slug)
);

-- 启用 RLS
ALTER TABLE links ENABLE ROW LEVEL SECURITY;

-- RLS 策略
CREATE POLICY "Anyone can view active links by slug"
  ON links FOR SELECT
  USING (status = 'active');

CREATE POLICY "Users can manage own links"
  ON links FOR ALL
  USING (auth.uid() = user_id);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_links_slug ON links(slug);
CREATE INDEX IF NOT EXISTS idx_links_category ON links(category_id);
CREATE INDEX IF NOT EXISTS idx_links_user ON links(user_id);
CREATE INDEX IF NOT EXISTS idx_links_status ON links(status);
CREATE INDEX IF NOT EXISTS idx_links_expires ON links(expires_at);

-- ========================================
-- 6. 链接标签关联表 (link_tags)
-- ========================================
CREATE TABLE IF NOT EXISTS link_tags (
  link_id UUID NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (link_id, tag_id)
);

-- 启用 RLS
ALTER TABLE link_tags ENABLE ROW LEVEL SECURITY;

-- RLS 策略 - 继承 links 表的访问控制
CREATE POLICY "Link tags accessible with link access"
  ON link_tags FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM links
      WHERE links.id = link_tags.link_id
      AND (links.status = 'active' OR links.user_id = auth.uid())
    )
  );

CREATE POLICY "Users can manage own link tags"
  ON link_tags FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM links
      WHERE links.id = link_tags.link_id
      AND links.user_id = auth.uid()
    )
  );

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_link_tags_link ON link_tags(link_id);
CREATE INDEX IF NOT EXISTS idx_link_tags_tag ON link_tags(tag_id);

-- ========================================
-- 7. 链接访问日志表 (link_visits)
-- ========================================
CREATE TYPE visit_type AS ENUM ('click', 'registration');

CREATE TABLE IF NOT EXISTS link_visits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  link_id UUID NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  visitor_ip TEXT,
  user_agent TEXT,
  referer TEXT,
  visit_type visit_type DEFAULT 'click',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 启用 RLS
ALTER TABLE link_visits ENABLE ROW LEVEL SECURITY;

-- RLS 策略
CREATE POLICY "Anyone can create visit logs"
  ON link_visits FOR INSERT
  WITH CHECK (TRUE); -- 公开记录访问

CREATE POLICY "Users can view own link visits"
  ON link_visits FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM links
      WHERE links.id = link_visits.link_id
      AND links.user_id = auth.uid()
    )
  );

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_link_visits_link ON link_visits(link_id);
CREATE INDEX IF NOT EXISTS idx_link_visits_created ON link_visits(created_at);
CREATE INDEX IF NOT EXISTS idx_link_visits_type ON link_visits(visit_type);

-- ========================================
-- 8. 函数和触发器
-- ========================================

-- 更新时间戳函数
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 为各表添加更新时间戳触发器
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_categories_updated_at ON categories;
CREATE TRIGGER update_categories_updated_at
  BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_tags_updated_at ON tags;
CREATE TRIGGER update_tags_updated_at
  BEFORE UPDATE ON tags
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_links_updated_at ON links;
CREATE TRIGGER update_links_updated_at
  BEFORE UPDATE ON links
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 自动更新 link 点击数函数
CREATE OR REPLACE FUNCTION increment_link_click_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE links
  SET click_count = click_count + 1
  WHERE id = NEW.link_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 点击时自动增加点击数
DROP TRIGGER IF EXISTS on_link_click ON link_visits;
CREATE TRIGGER on_link_click
  AFTER INSERT ON link_visits
  FOR EACH ROW EXECUTE FUNCTION increment_link_click_count();

-- 检查链接过期状态函数
CREATE OR REPLACE FUNCTION check_expired_links()
RETURNS VOID AS $$
BEGIN
  UPDATE links
  SET status = 'expired'
  WHERE status = 'active'
    AND expires_at IS NOT NULL
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- 9. 插入系统预设分类
-- ========================================
INSERT INTO categories (name, logo_url, sort_order, is_system) VALUES
  ('夸克网盘', 'https://img.icons8.com/color/144/quark--v1.png', 1, TRUE),
  ('百度网盘', 'https://img.icons8.com/color/144/baidu.png', 2, TRUE),
  ('阿里云盘', 'https://img.icons8.com/color/144/alibaba.png', 3, TRUE),
  ('迅雷云盘', 'https://img.icons8.com/color/144/thunder.png', 4, TRUE),
  ('腾讯微云', 'https://img.icons8.com/color/144/tencent.png', 5, TRUE),
  ('115网盘', 'https://img.icons8.com/color/144/115.png', 6, TRUE),
  ('移动云盘', 'https://img.icons8.com/color/144/china-mobile.png', 7, TRUE),
  ('天翼云盘', 'https://img.icons8.com/color/144/tianyi.png', 8, TRUE)
ON CONFLICT DO NOTHING;

-- ========================================
-- 10. 存储桶配置 (如需在 Supabase Dashboard 中手动创建)
-- ========================================
-- 需要创建的存储桶:
-- 1. avatars - 用户头像
-- 2. category-logos - 分类图标
-- 3. exports - 数据导出文件

-- ========================================
-- 11. 常用视图
-- ========================================

-- 链接详情视图 (包含标签)
CREATE OR REPLACE VIEW links_with_tags AS
SELECT 
  l.*,
  c.name as category_name,
  c.logo_url as category_logo,
  COALESCE(
    json_agg(
      json_build_object('id', t.id, 'name', t.name, 'color', t.color)
    ) FILTER (WHERE t.id IS NOT NULL),
    '[]'::json
  ) as tags
FROM links l
LEFT JOIN categories c ON l.category_id = c.id
LEFT JOIN link_tags lt ON l.id = lt.link_id
LEFT JOIN tags t ON lt.tag_id = t.id
GROUP BY l.id, c.id;

-- 即将过期链接视图
CREATE OR REPLACE VIEW expiring_links AS
SELECT 
  l.*,
  c.name as category_name,
  EXTRACT(DAY FROM (l.expires_at - NOW())) as days_remaining
FROM links l
LEFT JOIN categories c ON l.category_id = c.id
WHERE l.status = 'active'
  AND l.expires_at IS NOT NULL
  AND l.expires_at < NOW() + INTERVAL '7 days'
ORDER BY l.expires_at ASC;

-- 统计视图
CREATE OR REPLACE VIEW link_statistics AS
SELECT 
  u.id as user_id,
  COUNT(l.id) as total_links,
  SUM(l.click_count) as total_clicks,
  SUM(l.registration_count) as total_registrations,
  COUNT(CASE WHEN l.status = 'active' THEN 1 END) as active_links,
  COUNT(CASE WHEN l.status = 'expired' THEN 1 END) as expired_links,
  COUNT(CASE WHEN l.is_pinned THEN 1 END) as pinned_links,
  COUNT(CASE WHEN l.is_favorited THEN 1 END) as favorited_links,
  COUNT(CASE WHEN l.expires_at IS NOT NULL AND l.expires_at < NOW() + INTERVAL '7 days' THEN 1 END) as expiring_soon
FROM auth.users u
LEFT JOIN links l ON u.id = l.user_id
GROUP BY u.id;

-- ========================================
-- 12. RPC 函数 (高级查询)
-- ========================================

-- 获取用户仪表盘统计
CREATE OR REPLACE FUNCTION get_dashboard_stats(user_uuid UUID)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_links', COUNT(*),
    'total_clicks', COALESCE(SUM(click_count), 0),
    'total_registrations', COALESCE(SUM(registration_count), 0),
    'active_links', COUNT(*) FILTER (WHERE status = 'active'),
    'expiring_soon', COUNT(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at < NOW() + INTERVAL '7 days' AND expires_at > NOW()),
    'expired_links', COUNT(*) FILTER (WHERE status = 'expired'),
    'pinned_links', COUNT(*) FILTER (WHERE is_pinned = TRUE),
    'favorited_links', COUNT(*) FILTER (WHERE is_favorited = TRUE)
  ) INTO result
  FROM links
  WHERE user_id = user_uuid;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 获取分类统计
CREATE OR REPLACE FUNCTION get_category_stats(user_uuid UUID)
RETURNS TABLE (
  category_id UUID,
  category_name TEXT,
  category_logo TEXT,
  link_count BIGINT,
  total_clicks BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.name,
    c.logo_url,
    COUNT(l.id) as link_count,
    COALESCE(SUM(l.click_count), 0) as total_clicks
  FROM categories c
  LEFT JOIN links l ON c.id = l.category_id AND l.status = 'active'
  WHERE c.is_system = TRUE OR c.user_id = user_uuid
  GROUP BY c.id, c.name, c.logo_url
  ORDER BY c.sort_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 搜索链接
CREATE OR REPLACE FUNCTION search_links(search_query TEXT, user_uuid UUID DEFAULT NULL)
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  category_name TEXT,
  category_logo TEXT,
  click_count INTEGER,
  tags JSON,
  status link_status,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    l.id,
    l.name,
    l.slug,
    c.name as category_name,
    c.logo_url as category_logo,
    l.click_count,
    COALESCE(
      json_agg(
        json_build_object('id', t.id, 'name', t.name, 'color', t.color)
      ) FILTER (WHERE t.id IS NOT NULL),
      '[]'::json
    ) as tags,
    l.status,
    l.created_at
  FROM links l
  LEFT JOIN categories c ON l.category_id = c.id
  LEFT JOIN link_tags lt ON l.id = lt.link_id
  LEFT JOIN tags t ON lt.tag_id = t.id
  WHERE l.status = 'active'
    AND (user_uuid IS NULL OR l.user_id = user_uuid)
    AND (
      l.name ILIKE '%' || search_query || '%'
      OR l.slug ILIKE '%' || search_query || '%'
      OR c.name ILIKE '%' || search_query || '%'
      OR t.name ILIKE '%' || search_query || '%'
    )
  GROUP BY l.id, c.id
  ORDER BY l.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
