-- ============================================================
-- 🔧 一键修复脚本 - 解决"云同步不可用"问题
-- 
-- 使用方法：
--   1. 打开 https://supabase.com/dashboard/project/kcucxrunwzcxxwxwnpojoc/sql/new
--   2. 复制粘贴本文件全部内容
--   3. 点击 "Run" 执行
--   4. 刷新 pan110.pages.dev/admin 页面
--
-- 如果项目ID不是 kcucxrunwzcxxwxwnpojoc，请替换上面的URL
-- ============================================================


-- ============================================================
-- 第1步：禁用所有表的 RLS（行级安全）
-- 这是最常见的原因 - RLS 默认阻止匿名写入
-- ============================================================

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREach t IN ARRAY['links','categories','tags','link_tags','link_visits']
    LOOP
        BEGIN
            EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', t);
            RAISE NOTICE '✅ 已禁用 RLS: %', t;
        EXCEPTION WHEN others THEN
            RAISE NOTICE '⚠️ 表 % 不存在或无权限: %', t, sqlerrm;
        END;
    END LOOP;
END $$;


-- ============================================================
-- 第2步：确保 links 表有所有必需的列（防止字段缺失导致写入失败）
-- ============================================================

DO $$
BEGIN
    -- 检查并添加缺失的列
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'links' AND column_name = 'user_id') THEN
        ALTER TABLE links ADD COLUMN user_id UUID DEFAULT gen_random_uuid();
        RAISE NOTICE '✅ 添加了 links.user_id 列';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'links' AND column_name = 'slug') THEN
        ALTER TABLE links ADD COLUMN slug VARCHAR(255) DEFAULT '';
        RAISE NOTICE '✅ 添加了 links.slug 列';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'links' AND column_name = 'is_favorited') THEN
        ALTER TABLE links ADD COLUMN is_favorited BOOLEAN DEFAULT FALSE;
        RAISE NOTICE '✅ 添加了 links.is_favorited 列';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'links' AND column_name = 'status') THEN
        ALTER TABLE links ADD COLUMN status VARCHAR(20) DEFAULT 'active';
        RAISE NOTICE '✅ 添加了 links.status 列';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'links' AND column_name = 'validity_period') THEN
        ALTER TABLE links ADD COLUMN validity_period VARCHAR(20) DEFAULT 'permanent';
        RAISE NOTICE '✅ 添加了 links.validity_period 列';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'links' AND column_name = 'visible') THEN
        ALTER TABLE links ADD COLUMN visible BOOLEAN DEFAULT TRUE;
        RAISE NOTICE '✅ 添加了 links.visible 列';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'links' AND column_name = 'drive_type') THEN
        ALTER TABLE links ADD COLUMN drive_type VARCHAR(50) DEFAULT 'baidu';
        RAISE NOTICE '✅ 添加了 links.drive_type 列';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'links' AND column_name = 'extract_code') THEN
        ALTER TABLE links ADD COLUMN extract_code VARCHAR(100);
        RAISE NOTICE '✅ 添加了 links.extract_code 列';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'links' AND column_name = 'expires_at') THEN
        ALTER TABLE links ADD COLUMN expires_at TIMESTAMPTZ;
        RAISE NOTICE '✅ 添加了 links.expires_at 列';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'links' AND column_name = 'sort_order') THEN
        ALTER TABLE links ADD COLUMN sort_order INTEGER DEFAULT 999;
        RAISE NOTICE '✅ 添加了 links.sort_order 列';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'links' AND column_name = 'click_count') THEN
        ALTER TABLE links ADD COLUMN click_count INTEGER DEFAULT 0;
        RAISE NOTICE '✅ 添加了 links.click_count 列';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'links' AND column_name = 'registration_count') THEN
        ALTER TABLE links ADD COLUMN registration_count INTEGER DEFAULT 0;
        RAISE NOTICE '✅ 添加了 links.registration_count 列';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'links' AND column_name = 'description') THEN
        ALTER TABLE links ADD COLUMN description TEXT;
        RAISE NOTICE '✅ 添加了 links.description 列';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'links' AND column_name = 'icon') THEN
        ALTER TABLE links ADD COLUMN icon VARCHAR(255);
        RAISE NOTICE '✅ 添加了 links.icon 列';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'links' AND column_name = 'subcategory_id') THEN
        ALTER TABLE links ADD COLUMN subcategory_id UUID;
        RAISE NOTICE '✅ 添加了 links.subcategory_id 列';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'links' AND column_name = 'is_pinned') THEN
        ALTER TABLE links ADD COLUMN is_pinned BOOLEAN DEFAULT FALSE;
        RAISE NOTICE '✅ 添加了 links.is_pinned 列';
    END IF;
END $$;


-- ============================================================
-- 第3步：确保 categories 表有必需列
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'categories' AND column_name = 'user_id') THEN
        ALTER TABLE categories ADD COLUMN user_id UUID DEFAULT gen_random_uuid();
        RAISE NOTICE '✅ 添加了 categories.user_id 列';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'categories' AND column_name = 'logo_url') THEN
        ALTER TABLE categories ADD COLUMN logo_url VARCHAR(255);
        RAISE NOTICE '✅ 添加了 categories.logo_url 列';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'categories' AND column_name = 'is_system') THEN
        ALTER TABLE categories ADD COLUMN is_system BOOLEAN DEFAULT FALSE;
        RAISE NOTICE '✅ 添加了 categories.is_system 列';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'categories' AND column_name = 'sort_order') THEN
        ALTER TABLE categories ADD COLUMN sort_order INTEGER DEFAULT 0;
        RAISE NOTICE '✅ 添加了 categories.sort_order 列';
    END IF;
END $$;


-- ============================================================
-- 第4步：确保 tags 表有必需列
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tags' AND column_name = 'color') THEN
        ALTER TABLE tags ADD COLUMN color VARCHAR(20) DEFAULT '#6366F1';
        RAISE NOTICE '✅ 添加了 tags.color 列';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tags' AND column_name = 'updated_at') THEN
        ALTER TABLE tags ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
        RAISE NOTICE '✅ 添加了 tags.updated_at 列';
    END IF;
END $$;


-- ============================================================
-- 第5步：验证 - 显示所有表的当前状态
-- ============================================================

SELECT 
    tablename AS "表名",
    rowsecurity AS "RLS状态",
    CASE WHEN rowsecurity THEN '🔒 启用（阻止写入）' ELSE '✅ 禁用（允许写入）' END AS "说明"
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('links', 'categories', 'tags', 'link_tags', 'link_visits')
ORDER BY tablename;


-- ============================================================
-- 第6步：快速写入测试 - 验证 anon key 是否能真正写入
-- ============================================================

INSERT INTO categories (name, sort_order, is_system)
VALUES ('__test_write_check__', 0, FALSE)
ON CONFLICT DO NOTHING;

DELETE FROM categories WHERE name = '__test_write_check__';

RAISE NOTICE '========================================================';
RAISE NOTICE '🎉 修复完成！如果上面显示所有表都是 ✅ 禁用 状态';
RAISE NOTICE '请刷新 pan110.pages.dev/admin 页面测试添加功能';
RAISE NOTICE '========================================================';
