import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, User, Eye, EyeOff, LogIn, ArrowLeft } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useSiteSettingsStore } from '@/store/useSiteSettingsStore'
import { applyBrandColors } from '@/lib/colors'

export default function AdminLoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasCustomCred, setHasCustomCred] = useState(false)

  // 动态 Logo/站点名
  const siteSettings = useSiteSettingsStore()
  const settingsLoaded = siteSettings.loaded
  const siteName = siteSettings.settings.site_name || '资源云'
  const logoType = siteSettings.settings.current_logo_type || 'text'
  const logoUrl = siteSettings.settings.current_logo_url || ''
  const siteDesc = siteSettings.settings.site_description || ''

  // 动态颜色注入
  useEffect(() => {
    const colors = siteSettings.getCurrentColors()
    if (colors.primary) {applyBrandColors(colors.primary)}
  }, [siteSettings.settings.current_colors])

  // 检查是否设置了自定义凭证
  useEffect(() => {
    try {
      const stored = localStorage.getItem('admin_auth_config')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed.password) {setHasCustomCred(true)}
      }
    } catch { /* ignore */ }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    
    try {
      const success = await login(username, password)
      if (success) {
        navigate('/admin', { replace: true })
      } else {
        setError('用户名或密码错误')
      }
    } catch {
      setError('登录失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      {/* Back to Home */}
      <button
        onClick={() => navigate('/')}
        className="fixed top-6 left-6 flex items-center gap-2 text-gray-500 hover:text-gray-700 transition-colors duration-200 text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        返回首页
      </button>

      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl mb-6 bg-transparent">
            {settingsLoaded && logoType === 'image' && logoUrl ? (
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center overflow-hidden bg-transparent">
                <img
                  src={logoUrl}
                  alt={siteName}
                  className="w-full h-full object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              </div>
            ) : (
              <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center">
                <Lock className="w-6 h-6 text-white" />
              </div>
            )}
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">{siteName}</h1>
          <p className="text-gray-400 mt-2 text-sm">
            {siteDesc || (hasCustomCred ? '使用已设置的自定义凭证登录' : '使用默认凭证或已设置的凭证登录')}
          </p>
        </div>

        {/* Login Form */}
        <div className="bg-white rounded-3xl shadow-xl shadow-gray-200/50 p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-3 rounded-xl bg-red-50 text-red-600 text-sm text-center">
                {error}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">用户名</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-300" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="请输入用户名"
                  autoComplete="username"
                  className="w-full pl-12 pr-4 py-3.5 bg-gray-50/50 border border-gray-200/50 rounded-2xl focus:outline-none focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all duration-200 text-sm"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">密码</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-300" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入密码"
                  autoComplete="current-password"
                  className="w-full pl-12 pr-12 py-3.5 bg-gray-50/50 border border-gray-200/50 rounded-2xl focus:outline-none focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all duration-200 text-sm"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 transition-all duration-200 font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn className="w-5 h-5" />
                  登录
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
