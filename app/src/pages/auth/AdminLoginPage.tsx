import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, User, Eye, EyeOff, LogIn, ArrowLeft } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
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
  }, [siteSettings, siteSettings.settings.current_colors])

  // 检查是否设置了自定义凭证
  useEffect(() => {
    try {
      const stored = localStorage.getItem('admin_auth_config')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed.passwordHash) {setHasCustomCred(true)}
      }
    } catch { /* ignore */ }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    
    try {
      const trimmedUser = username.trim()
      const trimmedPass = password.trim()
      if (!trimmedUser || !trimmedPass) {
        setError('用户名和密码不能为空')
        setLoading(false)
        return
      }
      const success = await login(trimmedUser, trimmedPass)
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
      <motion.button
        onClick={() => navigate('/')}
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.2, type: 'spring', stiffness: 360, damping: 28 }}
        className="fixed top-6 left-6 flex items-center gap-2 text-gray-500 hover:text-gray-700 transition-colors duration-200 text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        返回首页
      </motion.button>

      <motion.div
        className="w-full max-w-sm"
        initial={{ opacity: 0, y: 30, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 28, mass: 0.7 }}
      >
        {/* Logo */}
        <motion.div
          className="text-center mb-10"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 300, damping: 24 }}
        >
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
              <motion.div
                className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center"
                whileHover={{ scale: 1.08, rotate: 2 }}
                whileTap={{ scale: 0.94 }}
              >
                <Lock className="w-6 h-6 text-white" />
              </motion.div>
            )}
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">{siteName}</h1>
          <p className="text-gray-400 mt-2 text-sm">
            {siteDesc || (hasCustomCred ? '使用已设置的自定义凭证登录' : '使用默认凭证或已设置的凭证登录')}
          </p>
        </motion.div>

        {/* Login Form */}
        <motion.div
          className="bg-white rounded-3xl shadow-xl shadow-gray-200/50 p-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 320, damping: 26 }}
        >
          <form onSubmit={handleSubmit} className="space-y-5">
            <AnimatePresence>
              {error && (
                <motion.div
                  className="p-3 rounded-xl bg-red-50 text-red-600 text-sm text-center"
                  initial={{ opacity: 0, y: -8, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: 'auto' }}
                  exit={{ opacity: 0, y: -8, height: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.25, type: 'spring', stiffness: 320, damping: 24 }}
            >
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
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3, type: 'spring', stiffness: 320, damping: 24 }}
            >
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
            </motion.div>

            <motion.button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 transition-all duration-200 font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, type: 'spring', stiffness: 340, damping: 24 }}
              whileHover={!loading ? { scale: 1.02 } : {}}
              whileTap={!loading ? { scale: 0.97 } : {}}
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn className="w-5 h-5" />
                  登录
                </>
              )}
            </motion.button>
          </form>
        </motion.div>
      </motion.div>
    </div>
  )
}
