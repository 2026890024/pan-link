-- 删除 categories 和 tags 的外键约束 + 改 user_id 为可空
-- 直接复制到 Supabase SQL Editor 执行

-- 1. 删除 categories.user_id 外键约束
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_user_id_fkey;

-- 2. 删除 tags.user_id 外键约束  
ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_user_id_fkey;

-- 3. links.user_id 改为可空
ALTER TABLE links ALTER COLUMN user_id DROP NOT NULL;

-- 4. categories.user_id 改为可空
ALTER TABLE categories ALTER COLUMN user_id DROP NOT NULL;

-- 验证
SELECT '✅ 全部完成！' AS result;
