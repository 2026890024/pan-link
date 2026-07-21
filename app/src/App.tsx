import { lazy, Suspense, useEffect, useRef } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useDataStore } from '@/store/useDataStore'
import { useSiteSettingsStore } from '@/store/useSiteSettingsStore'
import { applyBrandColors } from '@/lib/colors'

// 前台页面 - 全部懒加载（减少初始 bundle ~126 kB，首屏快 2-3 秒）
const HomePage = lazy(() => import('@/pages/frontend/HomePage'))
const SearchPage = lazy(() => import('@/pages/frontend/SearchPage'))
const LinkDetailPage = lazy(() => import('@/pages/frontend/LinkDetailPage'))
const CategoryPage = lazy(() => import('@/pages/frontend/CategoryPage'))

// 认证页面 - 懒加载
const AdminLoginPage = lazy(() => import('@/pages/auth/AdminLoginPage'))

// 后台页面 - 全部懒加载（只有管理员访问）
const DashboardPage = lazy(() => import('@/pages/admin/DashboardPage'))
const ResourceManagementPage = lazy(() => import('@/pages/admin/ResourceManagementPage'))
const AccountSettingsPage = lazy(() => import('@/pages/admin/AccountSettingsPage'))
const DataManagementPage = lazy(() => import('@/pages/admin/DataManagementPage'))
const HomepageSettingsPage = lazy(() => import('@/pages/admin/HomepageSettingsPage'))
const SiteSettingsPage = lazy(() => import('@/pages/admin/SiteSettingsPage'))
// 后台布局与守卫 - 静态导入（立即需要）
import AdminLayout from '@/layouts/AdminLayout'
import AdminAuthGuard from '@/components/AdminAuthGuard'
import PublicLayout from '@/layouts/PublicLayout'
import NotFoundPage from '@/pages/NotFoundPage'

// 页面加载骨架屏 — 与 index.html 中 #preloader 视觉完全一致，避免双重加载动画
function PageLoading() {
  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-[#f8fafc]"
      style={{ pointerEvents: 'none' }}
    >
      <div
        style={{
          width: 36, height: 36,
          border: '3px solid #e2e8f0',
          borderTopColor: '#6366f1',
          borderRadius: '50%',
          animation: 'spin 0.7s linear infinite',
        }}
      />
    </div>
  )
}

function App() {
  const { initialize } = useDataStore()
  const siteSettings = useSiteSettingsStore()
  const initializedRef = useRef(false)

  useEffect(() => {
    // 后台静默加载，不阻塞页面渲染（仅执行一次）
    if (!initializedRef.current) {
      initializedRef.current = true
      initialize()
      siteSettings.loadSettings()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 监听颜色变化，实时注入 CSS（站点设置变化时同步更新）
  useEffect(() => {
    const colors = siteSettings.getCurrentColors()
    if (colors.primary) {
      applyBrandColors(colors.primary)
    }
    if (siteSettings.settings.site_name) {
      document.title = `${siteSettings.settings.site_name} - ${siteSettings.settings.site_description || ''}`
    }
  }, [siteSettings, siteSettings.settings.current_colors, siteSettings.settings.site_name, siteSettings.settings.site_description])

  return (
    <ErrorBoundary>
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 2000,
          style: {
            borderRadius: '12px',
            background: '#1F2937',
            color: '#F9FAFB',
            fontSize: '14px',
          },
        }}
      />
      <Suspense fallback={<PageLoading />}>
        <Routes>
          {/* 前台公开路由 */}
          <Route element={<PublicLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/s/:slug" element={<LinkDetailPage />} />
            <Route path="/category/:id" element={<CategoryPage />} />
            <Route path="/search" element={<SearchPage />} />
          </Route>

          {/* 管理后台登录 */}
          <Route path="/admin-login" element={<AdminLoginPage />} />

          {/* 后台管理路由 - 需要认证 */}
          <Route element={<AdminAuthGuard />}>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<ResourceManagementPage />} />
              <Route path="resources" element={<ResourceManagementPage />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="account" element={<AccountSettingsPage />} />
              <Route path="data" element={<DataManagementPage />} />
              <Route path="homepage-settings" element={<HomepageSettingsPage />} />
              <Route path="site-settings" element={<SiteSettingsPage />} />
            </Route>
          </Route>

          {/* 404 页面 */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  )
}

export default App
