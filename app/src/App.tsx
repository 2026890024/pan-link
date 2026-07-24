import { lazy, Suspense, useEffect, useRef } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import PageProgressBar from '@/components/ui/PageProgressBar'
import { useDataStore } from '@/store/useDataStore'
import { useSiteSettingsStore } from '@/store/useSiteSettingsStore'
import { applyBrandColors } from '@/lib/colors'
import { fetchSiteSettings } from '@/services/dataService'

// 前台页面 - 全部懒加载（减少初始 bundle ~126 kB，首屏快 2-3 秒）
const HomePage = lazy(() => import('@/pages/frontend/HomePage'))
const SearchPage = lazy(() => import('@/pages/frontend/SearchPage'))
const LinkDetailPage = lazy(() => import('@/pages/frontend/LinkDetailPage'))
const CategoryPage = lazy(() => import('@/pages/frontend/CategoryPage'))

// 认证页面 - 懒加载
const AdminLoginPage = lazy(() => import('@/pages/auth/AdminLoginPage'))

// 后台页面 - 高频切换的设置页同步引入，其余懒加载
import {
  DashboardPage,
  ResourceManagementPage,
  AccountSettingsPage,
  DataManagementPage,
} from '@/pages/admin'
import SiteSettingsPage from '@/pages/admin/SiteSettingsPage'
import HomepageSettingsPage from '@/pages/admin/HomepageSettingsPage'
// 后台布局与守卫 - 同步引入（避免切换时整页 loading）
import AdminLayout from '@/layouts/AdminLayout'
import AdminAuthGuard from '@/components/AdminAuthGuard'
// 前台布局 - 所有用户都需要
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
      // 🚀 并行发起：fetchSiteSettings + initialize(fetchAll) 同时请求，节省一次往返
      const settingsPromise = fetchSiteSettings()
      initialize()
      // 用预取数据直接设置，免去 loadSettings 内部的二次 API 调用
      settingsPromise.then(settings => {
        siteSettings.loadSettingsFromData(settings)
      }).catch(() => {
        siteSettings.loadSettings() // 网络失败时 fallback
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 监听颜色变化，实时注入 CSS（站点设置变化时同步更新）
  useEffect(() => {
    const colors = siteSettings.getCurrentColors()
    if (colors.primary) {
      applyBrandColors(colors.primary)
    }
    // 浏览器标题完整使用“浏览器标题描述”字段，不再拼接站点名称
    const pageTitle = siteSettings.settings.site_description || '全网资源交流分享'
    if (document.title !== pageTitle) {
      document.title = pageTitle
    }
  }, [siteSettings, siteSettings.settings.current_colors, siteSettings.settings.site_description])

  // 动态同步 favicon
  useEffect(() => {
    const faviconUrl = siteSettings.settings.current_favicon_url || '/favicon.png'
    let link = document.querySelector("link[rel*='icon']") as HTMLLinkElement | null
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      link.type = 'image/png'
      document.head.appendChild(link)
    }
    // 加时间戳避免浏览器缓存导致切换不生效（data URL 不能追加参数）
    if (faviconUrl.startsWith('data:')) {
      link.href = faviconUrl
    } else {
      const sep = faviconUrl.includes('?') ? '&' : '?'
      link.href = `${faviconUrl}${sep}_t=${Date.now()}`
    }
  }, [siteSettings.settings.current_favicon_url])

  return (
    <ErrorBoundary>
      <PageProgressBar />
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 2000,
          style: {
            borderRadius: '14px',
            background: '#1F2937',
            color: '#F9FAFB',
            fontSize: '14px',
            fontWeight: 500,
            padding: '12px 20px',
            border: '1px solid rgba(99,102,241,0.15)',
            boxShadow: '0 8px 32px rgba(99,102,241,0.12)',
          },
          success: {
            iconTheme: {
              primary: '#6366F1',
              secondary: '#fff',
            },
            style: {
              borderColor: 'rgba(99,102,241,0.3)',
            },
          },
          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: '#fff',
            },
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
