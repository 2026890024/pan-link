import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom'
import { Home, Search } from 'lucide-react'
import { useSiteSettingsStore } from '@/store/useSiteSettingsStore'

export default function PublicLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const isHomePage = location.pathname === '/'
  const isSearchPage = location.pathname === '/search'

  // 动态 Logo/颜色
  const siteSettings = useSiteSettingsStore()
  const logoType = siteSettings.settings.current_logo_type || 'text'
  const logoText = siteSettings.settings.current_logo_text || 'Pan Link'

  return (
    <div className="min-h-screen flex flex-col">
      {/* 全局导航栏 - 首页和搜索页不显示（它们有自己的顶栏） */}
      {!isHomePage && !isSearchPage && (
        <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/80 border-b border-gray-100">
          <div className="container mx-auto px-4 h-14 flex items-center justify-between">
            {/* Logo / 品牌 */}
            <Link
              to="/"
              className="flex items-center gap-2 text-gray-800 hover:text-brand-600 transition-colors shrink-0"
            >
              <LogoIcon logoType={logoType} logoUrl={siteSettings.settings.current_logo_url} />
              <span className="font-bold text-sm sm:text-base hidden sm:block">{logoText}</span>
            </Link>

            {/* 右侧导航操作 */}
            <div className="flex items-center gap-1 sm:gap-2">
              <button
                onClick={() => navigate('/search')}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors cursor-pointer"
                aria-label="搜索"
              >
                <Search className="w-4 h-4" />
                <span className="hidden sm:inline">搜索</span>
              </button>
            </div>
          </div>
        </header>
      )}

      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}

// 公共 Logo 图标组件
function LogoIcon({ logoType, logoUrl }: { logoType: string; logoUrl?: string }) {
  if (logoType === 'image' && logoUrl) {
    return (
      <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center bg-transparent">
        <img
          src={logoUrl}
          alt="站点 Logo"
          loading="lazy"
          decoding="async"
          className="w-full h-full object-contain"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none'
          }}
        />
      </div>
    )
  }
  return (
    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-violet-500 flex items-center justify-center">
      <Home className="w-4 h-4 text-white" />
    </div>
  )
}
