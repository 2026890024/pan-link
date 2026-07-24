import { Suspense } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Link2,
  User,
  Database,
  LogOut,
  Menu,
  ChevronRight,
  Settings,
  Palette,
  Loader2,
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { useSiteSettingsStore } from '@/store/useSiteSettingsStore'
import { adminRoutePreloadMap } from '@/pages/admin'
import ThemeToggle from '@/components/ui/ThemeToggle'

const navItems = [
  { path: '/admin/resources', label: '资源管理', icon: Link2 },
  { path: '/admin/dashboard', label: '仪表盘', icon: LayoutDashboard },
  { path: '/admin/data', label: '数据管理', icon: Database },
  { path: '/admin/homepage-settings', label: '首页设置', icon: Settings },
  { path: '/admin/site-settings', label: '站点设置', icon: Palette },
  { path: '/admin/account', label: '账户设置', icon: User },
]

function ContentLoading() {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-3 text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span className="text-sm">页面加载中...</span>
      </div>
    </div>
  )
}

export default function AdminLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { logout } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  // 动态 Logo/颜色
  const siteSettings = useSiteSettingsStore()
  const settingsLoaded = siteSettings.loaded
  const logoType = siteSettings.settings.current_logo_type || 'text'

  const handleLogout = async () => {
    await logout()
    navigate('/admin-login', { replace: true })
  }

  const isActive = (path: string) => {
    if (path === '/admin/resources') {
      return location.pathname === '/admin' || location.pathname === '/admin/resources'
    }
    return location.pathname === path
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 移动端遮罩 */}
      {mobileSidebarOpen && (
        <div
          role="button"
          tabIndex={-1}
          aria-label="关闭导航菜单"
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
          onKeyDown={(e) => { if (e.key === 'Escape') {setMobileSidebarOpen(false)} }}
        />
      )}

      {/* 侧边栏 */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-50 h-full bg-white/90 backdrop-blur-xl border-r border-gray-100 transition-all duration-300',
          sidebarOpen ? 'w-64' : 'w-[72px]',
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-center h-16 px-4 border-b border-gray-100">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="flex items-center justify-center w-10 h-10 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-all cursor-pointer"
            title={sidebarOpen ? '收起侧边栏' : '展开侧边栏'}
            aria-label={sidebarOpen ? '收起侧边栏' : '展开侧边栏'}
          >
            {settingsLoaded && logoType === 'image' && siteSettings.settings.current_logo_url ? (
              <div className="w-9 h-9 rounded-xl overflow-hidden flex items-center justify-center bg-transparent flex-shrink-0">
                <img
                  src={siteSettings.settings.current_logo_url}
                  alt="Logo"
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              </div>
            ) : (
              <div className="w-9 h-9 bg-gradient-to-br from-brand-600 to-brand-500 rounded-xl flex items-center justify-center flex-shrink-0">
                <Link2 className="w-5 h-5 text-white" />
              </div>
            )}
          </button>
        </div>

        {/* 导航 */}
        <nav className="p-3 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 overflow-hidden',
                isActive(item.path)
                  ? 'bg-brand-600 text-white shadow-button'
                  : 'text-gray-400 hover:bg-gray-50 hover:text-gray-700'
              )}
              onClick={() => setMobileSidebarOpen(false)}
              onMouseEnter={() => adminRoutePreloadMap[item.path]?.()}
              onFocus={() => adminRoutePreloadMap[item.path]?.()}
            >
              <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
              {sidebarOpen && <span className="font-medium text-sm whitespace-nowrap">{item.label}</span>}
            </Link>
          ))}
        </nav>

        {/* 底部 */}
        <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-gray-100">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-400 hover:bg-red-50 hover:text-red-500 transition-all duration-200 overflow-hidden cursor-pointer"
          >
            <LogOut className="w-[18px] h-[18px] flex-shrink-0" />
            {sidebarOpen && <span className="font-medium text-sm whitespace-nowrap">退出登录</span>}
          </button>
        </div>
      </aside>

      {/* 主内容区 */}
      <div
        className={cn(
          'min-h-screen transition-all duration-300',
          sidebarOpen ? 'lg:ml-64' : 'lg:ml-[72px]'
        )}
      >
        {/* 顶部栏 */}
        <header className="sticky top-0 z-30 h-16 glass mx-4 mt-3 rounded-2xl flex items-center px-5 gap-3 shadow-glass-sm">
          <button
            className="lg:hidden p-2 rounded-lg hover:bg-gray-50 text-gray-400 transition-all duration-200 cursor-pointer touch-manipulation"
            onClick={() => setMobileSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 text-sm flex-1">
            <span className="text-gray-400">后台</span>
            {location.pathname !== '/admin' && (
              <>
                <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
                <span className="text-gray-700 font-medium">
                  {navItems.find((item) => isActive(item.path))?.label}
                </span>
              </>
            )}
          </div>

          {/* 主题切换 */}
          <div className="flex items-center gap-1">
            <ThemeToggle />
          </div>
        </header>

        {/* 内容 */}
        <main className="p-4 sm:p-6">
          <Suspense fallback={<ContentLoading />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
