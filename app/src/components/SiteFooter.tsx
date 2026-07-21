import { Link } from 'react-router-dom'
import { LayoutGrid } from 'lucide-react'
import { useSiteSettingsStore } from '@/store/useSiteSettingsStore'

interface SiteFooterProps {
  variant?: 'full' | 'compact'
}

const currentYear = new Date().getFullYear()

export default function SiteFooter({ variant = 'full' }: SiteFooterProps) {
  const siteSettings = useSiteSettingsStore()
  const siteName = siteSettings.settings.site_name || '资源云'
  const logoType = siteSettings.settings.current_logo_type || 'text'
  const logoUrl = siteSettings.settings.current_logo_url || ''

  return (
    <footer className={variant === 'full' ? 'mt-12 pb-8' : 'mt-auto pt-10 sm:pt-12 pb-2 sm:pb-4'}>
      <div className="max-w-7xl mx-auto px-4">
        {/* Divider */}
        <div className="flex items-center justify-center gap-4 mb-6">
          <div className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent flex-1"></div>
          <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
          <div className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent flex-1"></div>
        </div>
        {/* Disclaimer */}
        <div className="text-center mb-6 max-w-4xl mx-auto">
          <p className="text-xs text-gray-400 leading-relaxed">
            免责申明：本站不以盈利为目的，下载资源均来源于网络，只做学习和交流使用，版权归原作者所有，若作商业用途请购买正版，由于未及时购买和付费发生的侵权行为，与本站无关。如果侵犯了您的合法权益，请联系站长删除。
          </p>
        </div>
        {/* Copyright */}
        <div className="flex items-center justify-center gap-3 text-sm text-gray-400">
          <Link
            to="/admin-login"
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-300 hover:scale-105 cursor-pointer overflow-hidden bg-transparent"
            title="进入后台管理"
          >
            {logoType === 'image' && logoUrl ? (
              <img src={logoUrl} alt={`${siteName} Logo`} loading="lazy" decoding="async" className="w-full h-full object-contain rounded-xl" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-brand-600 via-brand-500 to-violet-500 rounded-xl flex items-center justify-center">
                <LayoutGrid className="w-4 h-4 text-white" />
              </div>
            )}
          </Link>
          <span className="font-medium text-gray-500">{siteName}</span>
          <span className="text-gray-300">·</span>
          <span>© {currentYear}</span>
        </div>
      </div>
    </footer>
  )
}
