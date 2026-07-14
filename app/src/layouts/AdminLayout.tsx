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
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { useSiteSettingsStore } from '@/store/useSiteSettingsStore'

const navItems = [
  { path: '/admin/resources', label: '资源管理', icon: Link2 },
  { path: '/admin/dashboard', label: '仪表盘', icon: LayoutDashboard },
  { path: '/admin/data', label: '数据管理', icon: Database },
  { path: '/admin/homepage-settings', label: '首页设置', icon: Settings },
  { path: '/admin/site-settings', label: '站点设置', icon: Palette },
  { path: '/admin/account', label: '账户设置', icon: User },
]

export default function AdminLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { logout } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  // 动态 Logo/颜色
  const siteSettings = useSiteSettingsStore()
  const settingsLoaded = siteSettings.loaded
  const siteName = siteSettings.settings.site_name || '资源云'
  const logoType = siteSettings.settings.current_logo_type || 'text'

  // 读取动态头像和用户名（每次渲染时从 localStorage 读取最新值）
  const getProfile = () => {
    try {
      const stored = localStorage.getItem('admin_profile')
      if (stored) {
        const p = JSON.parse(stored)
        return { username: p.username || 'Admin', email: p.email || '', avatar: p.avatar || null }
      }
    } catch { /* ignore */ }
    return { username: 'Admin', email: 'admin@example.com', avatar: null }
  }
  const [profile, setProfile] = useState(getProfile)

  // 监听 localStorage 变化和窗口聚焦时更新头像
  useEffect(() => {
    const handleFocus = () => setProfile(getProfile())
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'admin_profile') setProfile(getProfile())
    }
    window.addEventListener('focus', handleFocus)
    window.addEventListener('storage', handleStorage)
    return () => {
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

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
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
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
        <div className="flex items-center h-16 px-4 border-b border-gray-100">
          <Link to="/admin" className="flex items-center gap-3 overflow-hidden">
            {settingsLoaded && logoType === 'image' && siteSettings.settings.current_logo_url ? (
              <div className="w-9 h-9 rounded-xl overflow-hidden flex items-center justify-center bg-transparent flex-shrink-0">
                <img
                  src={siteSettings.settings.current_logo_url}
                  alt="Logo"
                  className="w-full h-full object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              </div>
            ) : (
              <div className="w-9 h-9 bg-gradient-to-br from-brand-600 to-brand-500 rounded-xl flex items-center justify-center flex-shrink-0">
                <Link2 className="w-5 h-5 text-white" />
              </div>
            )}
            {sidebarOpen && (
              <span className="font-bold text-gray-900 text-base whitespace-nowrap">{siteName}</span>
            )}
          </Link>
          <button
            className="ml-auto p-1.5 rounded-lg hover:bg-gray-50 text-gray-400 hover:text-gray-600 transition-all duration-200 hidden lg:block cursor-pointer"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <Menu className="w-4 h-4" />
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
            className="lg:hidden p-2 rounded-lg hover:bg-gray-50 text-gray-400 transition-all duration-200 cursor-pointer"
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

          {/* 用户信息 */}
          <Link
            to="/admin/account"
            className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-violet-500 flex items-center justify-center text-white text-xs font-bold overflow-hidden flex-shrink-0">
              {profile.avatar ? (
                <img src={profile.avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                profile.username.charAt(0).toUpperCase()
              )}
            </div>
            <span className="hidden sm:block text-sm font-medium text-gray-700">{profile.username}</span>
          </Link>
        </header>

        {/* 内容 */}
        <main className="p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
