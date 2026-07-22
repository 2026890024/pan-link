import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Lock,
  Eye,
  EyeOff,
  Shield,
  Loader2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { hashPassword, verifyPassword } from '@/lib/crypto'

// 登录凭证持久化 key
const AUTH_KEY = 'admin_auth_config'

interface AuthCredentials {
  username: string
  passwordHash: string
}

function loadAuth(): AuthCredentials {
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    if (raw) {return JSON.parse(raw)}
  } catch { /* ignore */ }
  return { username: '', passwordHash: '' }
}

function saveAuth(auth: AuthCredentials) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(auth))
}

export default function AccountSettingsPage() {
  const [auth, setAuth] = useState<AuthCredentials>(loadAuth)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [newUsername, setNewUsername] = useState(auth.username || '')
  const [showCurrentPwd, setShowCurrentPwd] = useState(false)
  const [showNewPwd, setShowNewPwd] = useState(false)
  const [showConfirmPwd, setShowConfirmPwd] = useState(false)
  const [changingCred, setChangingCred] = useState(false)

  useEffect(() => {
    const a = loadAuth()
    setNewUsername(a.username || '')
    setAuth(a)
  }, [])

  // 修改登录密码
  const handleChangeCredentials = async () => {
    if (changingCred) {return}
    setChangingCred(true)
    try {
      const storedAuth = loadAuth()

      // 如果之前设置过密码哈希，需要验证当前密码
      if (storedAuth.passwordHash) {
        if (!currentPassword) {
          toast.error('请输入当前密码')
          setChangingCred(false)
          return
        }
        const valid = await verifyPassword(currentPassword.trim(), storedAuth.passwordHash)
        if (!valid) {
          toast.error('当前密码错误')
          setChangingCred(false)
          return
        }
      }

      if (!newPassword || newPassword.length < 6) {
        toast.error('新密码至少需要 6 位字符')
        setChangingCred(false)
        return
      }

      if (newPassword !== confirmPassword) {
        toast.error('两次输入的新密码不一致')
        setChangingCred(false)
        return
      }

      // 存储密码哈希而非明文
      const updated: AuthCredentials = {
        username: newUsername.trim() || storedAuth.username || 'admin',
        passwordHash: await hashPassword(newPassword),
      }
      setAuth(updated)
      saveAuth(updated)

      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      toast.success('登录凭证已更新，下次登录生效')
    } catch {
      toast.error('密码更新失败')
    } finally {
      setChangingCred(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">账户设置</h1>
        <p className="text-gray-500 mt-1">修改后台管理系统的登录账号和密码</p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-xl"
      >
        <div className="bg-white rounded-xl border shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
            <Shield className="w-5 h-5 text-brand-500" />
            登录凭证
          </h2>

          <div className="space-y-6 max-w-md">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <p className="text-sm text-blue-700">
                修改后台管理系统的登录用户名和密码。修改后将在下次登录时生效。
              </p>
            </div>

            {/* 登录用户名 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                登录用户名
              </label>
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder={auth.username || '保持当前用户名'}
                maxLength={50}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-300 transition-all text-sm"
              />
            </div>

            {/* 当前密码（如果已设置过） */}
            {auth.passwordHash && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  当前密码
                </label>
                <div className="relative">
                  <input
                    type={showCurrentPwd ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="请输入当前密码"
                    maxLength={100}
                    className="w-full px-4 py-2.5 pr-10 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-300 transition-all text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPwd(!showCurrentPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showCurrentPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* 新密码 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                新密码
              </label>
              <div className="relative">
                <input
                  type={showNewPwd ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="至少 6 位字符"
                  maxLength={100}
                  className="w-full px-4 py-2.5 pr-10 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-300 transition-all text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPwd(!showNewPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showNewPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* 确认新密码 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                确认新密码
              </label>
              <div className="relative">
                <input
                  type={showConfirmPwd ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="再次输入新密码"
                  maxLength={100}
                  className="w-full px-4 py-2.5 pr-10 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-300 transition-all text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPwd(!showConfirmPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showConfirmPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-red-500 mt-1">两次输入的密码不一致</p>
              )}
            </div>

            {/* 保存按钮 */}
            <div className="pt-2">
              <button
                onClick={handleChangeCredentials}
                disabled={
                  changingCred ||
                  (!newUsername.trim() && !newPassword) ||
                  (!!newPassword && newPassword !== confirmPassword)
                }
                className="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-medium text-sm flex items-center gap-2 shadow-button transition-all cursor-pointer"
              >
                {changingCred ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                {changingCred ? '更新中...' : '更新登录凭证'}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
