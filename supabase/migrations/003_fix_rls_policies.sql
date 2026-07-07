-- ============================================================
-- 修复 RLS 策略 - 允许匿名用户读写（适用于无登录管理的场景）
-- 在 Supabase SQL Editor 中执行此脚本
-- ============================================================

-- ============ 1. 禁用 links 表的 RLS（或添加允许策略）============
ALTER TABLE links DISABLE ROW LEVEL SECURITY;

-- 如果想保留 RLS 但允许操作，用下面这条代替上面那条：
-- CREATE POLICY "Allow anonymous full access" ON links FOR ALL USING (true) WITH CHECK (true);

-- ============ 2. 禁用 categories 表的 RLS ============
ALTER TABLE categories DISABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow anonymous full access" ON categories FOR ALL USING (true) WITH CHECK (true);

-- ============ 3. 禁用 tags 表的 RLS ============
ALTER TABLE tags DISABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow anonymous full access" ON tags FOR ALL USING (true) WITH CHECK (true);

-- ============ 4. 禁用 link_tags 表的 RLS ============
ALTER TABLE link_tags DISABLE ROW LEVEL SECURITY;

-- ============ 5. 禁用 link_visits 表的 RLS ============
ALTER TABLE link_visits DISABLE ROW LEVEL SECURITY;

-- ============ 验证 ============
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('links', 'categories', 'tags', 'link_tags', 'link_visits');
