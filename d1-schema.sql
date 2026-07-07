-- pan-link D1 数据库建表脚本
-- 在 Cloudflare D1 控制台的「控制台」标签中执行

-- 分类表
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT NOT NULL,
  logo_url TEXT DEFAULT NULL,
  sort_order INTEGER DEFAULT 0,
  is_system INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 标签表
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6B7280',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 链接表
CREATE TABLE IF NOT EXISTS links (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  url TEXT NOT NULL,
  category_id TEXT DEFAULT NULL,
  subcategory_id TEXT DEFAULT NULL,
  extract_code TEXT DEFAULT NULL,
  validity_period TEXT DEFAULT 'permanent',
  expires_at TEXT DEFAULT NULL,
  click_count INTEGER DEFAULT 0,
  registration_count INTEGER DEFAULT 0,
  is_pinned INTEGER DEFAULT 0,
  is_favorited INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  drive_type TEXT DEFAULT 'baidu',
  icon TEXT DEFAULT NULL,
  description TEXT DEFAULT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  visible INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 999
);

-- 链接访问记录表
CREATE TABLE IF NOT EXISTS link_visits (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  link_id TEXT NOT NULL,
  visitor_ip TEXT,
  user_agent TEXT,
  referer TEXT,
  visit_type TEXT DEFAULT 'click',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (link_id) REFERENCES links(id)
);

-- 链接-标签关联表
CREATE TABLE IF NOT EXISTS link_tags (
  link_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (link_id, tag_id),
  FOREIGN KEY (link_id) REFERENCES links(id),
  FOREIGN KEY (tag_id) REFERENCES tags(id)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_links_category ON links(category_id);
CREATE INDEX IF NOT EXISTS idx_links_status ON links(status);
CREATE INDEX IF NOT EXISTS idx_links_pinned ON links(is_pinned);
CREATE INDEX IF NOT EXISTS idx_links_slug ON links(slug);
CREATE INDEX IF NOT EXISTS idx_link_visits_link ON link_visits(link_id);
CREATE INDEX IF NOT EXISTS idx_categories_sort ON categories(sort_order);
