import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useDataStore } from '@/store/useDataStore'

// 前台页面 - 立即加载（用户访问频率最高）
import HomePage from '@/pages/frontend/HomePage'
import SearchPage from '@/pages/frontend/SearchPage'

// 前台页面 - 懒加载
const LinkDetailPage = lazy(() => import('@/pages/frontend/LinkDetailPage'))
const CategoryPage = lazy(() => import('@/pages/frontend/CategoryPage'))

// 认证页面 - 懒加载
const AdminLoginPage = lazy(() => import('@/pages/auth/AdminLoginPage'))

// 后台页面 - 全部懒加载（只有管理员访问）
const DashboardPage = lazy(() => import('@/pages/admin/DashboardPage'))
const ResourceManagementPage = lazy(() => import('@/pages/admin/ResourceManagementPage'))
const DriveTypeManagementPage = lazy(() => import('@/pages/admin/DriveTypeManagementPage'))
const ProfilePage = lazy(() => import('@/pages/admin/ProfilePage'))
const AccountSettingsPage = lazy(() => import('@/pages/admin/AccountSettingsPage'))
const DataManagementPage = lazy(() => import('@/pages/admin/DataManagementPage'))
const HomepageSettingsPage = lazy(() => import('@/pages/admin/HomepageSettingsPage'))
const AdminLayout = lazy(() => import('@/layouts/AdminLayout'))
const AdminAuthGuard = lazy(() => import('@/components/AdminAuthGuard'))
import PublicLayout from '@/layouts/PublicLayout'

// 页面加载骨架屏
function PageLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-gray-200 border-t-brand-500 rounded-full animate-spin" />
        <span className="text-sm text-gray-400">加载中...</span>
      </div>
    </div>
  )
}

function App() {
  const { initialize, initialized } = useDataStore()

  useEffect(() => {
    // 后台静默加载，不阻塞页面渲染
    initialize()
  }, [initialize])

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
              <Route path="drive-types" element={<DriveTypeManagementPage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="account" element={<AccountSettingsPage />} />
              <Route path="data" element={<DataManagementPage />} />
              <Route path="homepage-settings" element={<HomepageSettingsPage />} />
            </Route>
          </Route>
        </Routes>
      </Suspense>
    </ErrorBoundary>
  )
}

export default App
