-- ============================================================
-- 🔧 修复外键约束 - 解决 cloud sync 写入失败
-- 
-- 问题原因：links.user_id 有 FK REFERENCES auth.users(id)
-- 匿名 anon key 插入时 user_id 无法匹配 auth.users 中的任何记录
-- RLS 禁用后仍会被 FK 约束阻止写入
--
-- 使用方法：在 Supabase SQL Editor 中执行本文件全部内容
-- https://supabase.com/dashboard/project/kcucxrunwzcxxwxwnpojoc/sql/new
-- ============================================================

-- 1. 删除 links.user_id 的外键约束（指向 auth.users）
DO $$
DECLARE
    constraint_name_var TEXT;
BEGIN
    SELECT conname INTO constraint_name_var
    FROM pg_constraint 
    WHERE conrelid = 'links'::regclass 
      AND confrelid = 'auth.users'::regclass;
    
    IF constraint_name_var IS NOT NULL THEN
        EXECUTE format('ALTER TABLE links DROP CONSTRAINT %I', constraint_name_var);
        RAISE NOTICE '✅ 已删除 links.user_id → auth.users 外键约束: %', constraint_name_var;
    ELSE
        RAISE NOTICE 'ℹ️ links.user_id 没有外键约束，无需处理';
    END IF;
END $$;

-- 2. 删除 categories.user_id 的外键约束（指向 auth.users）
DO $$
DECLARE
    constraint_name_var TEXT;
BEGIN
    SELECT conname INTO constraint_name_var
    FROM pg_constraint 
    WHERE conrelid = 'categories'::regclass 
      AND confrelid = 'auth.users'::regclass;
    
    IF constraint_name_var IS NOT NULL THEN
        EXECUTE format('ALTER TABLE categories DROP CONSTRAINT %I', constraint_name_var);
        RAISE NOTICE '✅ 已删除 categories.user_id → auth.users 外键约束: %', constraint_name_var;
    ELSE
        RAISE NOTICE 'ℹ️ categories.user_id 没有外键约束，无需处理';
    END IF;
END $$;

-- 3. 删除 tags.user_id 的外键约束（指向 auth.users）
DO $$
DECLARE
    constraint_name_var TEXT;
BEGIN
    SELECT conname INTO constraint_name_var
    FROM pg_constraint 
    WHERE conrelid = 'tags'::regclass 
      AND confrelid = 'auth.users'::regclass;
    
    IF constraint_name_var IS NOT NULL THEN
        EXECUTE format('ALTER TABLE tags DROP CONSTRAINT %I', constraint_name_var);
        RAISE NOTICE '✅ 已删除 tags.user_id → auth.users 外键约束: %', constraint_name_var;
    ELSE
        RAISE NOTICE 'ℹ️ tags.user_id 没有外键约束，无需处理';
    END IF;
END $$;

-- 4. 修改 links.user_id 为可空（去掉 NOT NULL）
ALTER TABLE links ALTER COLUMN user_id DROP NOT NULL;
RAISE NOTICE '✅ links.user_id 已改为可空';

-- 5. 修改 categories.user_id 设置默认值（已有 nullable）
ALTER TABLE categories ALTER COLUMN user_id DROP NOT NULL;
RAISE NOTICE '✅ categories.user_id 已改为可空';

-- 6. 验证所有外键约束已清除
SELECT 
    tc.constraint_name AS "约束名",
    tc.table_name AS "表名",
    ccu.table_name AS "引用表"
FROM information_schema.table_constraints tc
JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name IN ('links', 'categories', 'tags', 'link_tags', 'link_visits')
ORDER BY tc.table_name;

RAISE NOTICE '========================================================';
RAISE NOTICE '🎉 修复完成！刷新 pan110.pages.dev/admin 测试';
RAISE NOTICE '========================================================';
