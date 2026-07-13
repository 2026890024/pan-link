import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  User,
  Upload,
  Save,
  Lock,
  Eye,
  EyeOff,
  Shield,
  Settings,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { fastHash, fastVerify } from '@/lib/crypto'

// 账号数据持久化 key
const PROFILE_KEY = 'admin_profile'
const AUTH_KEY = 'admin_auth_config'

interface AdminProfile {
  username: string
  email: string
  avatar: string | null
}

interface AuthCredentials {
  username: string
  passwordHash: string
}

function loadProfile(): AdminProfile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return { username: 'Admin', email: 'admin@example.com', avatar: null }
}

function saveProfile(profile: AdminProfile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
}

function loadAuth(): AuthCredentials {
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return { username: '', passwordHash: '' }
}

function saveAuth(auth: AuthCredentials) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(auth))
}

export default function AccountSettingsPage() {
  // 账号信息
  const [profile, setProfile] = useState<AdminProfile>(loadProfile)
  const [editUsername, setEditUsername] = useState(profile.username)
  const [editEmail, setEditEmail] = useState(profile.email)
  const [avatar, setAvatar] = useState<string | null>(profile.avatar)

  // 登录凭证
  const [auth, setAuth] = useState<AuthCredentials>(loadAuth)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [newUsername, setNewUsername] = useState(auth.username || '')
  const [showCurrentPwd, setShowCurrentPwd] = useState(false)
  const [showNewPwd, setShowNewPwd] = useState(false)
  const [showConfirmPwd, setShowConfirmPwd] = useState(false)

  // 标签切换
  const [activeTab, setActiveTab] = useState<'profile' | 'credentials'>('profile')
  // 温馨提示关闭状态
  const [showTip, setShowTip] = useState(() => {
    try { return localStorage.getItem('account_tip_closed') !== 'true' } catch { return true }
  })
  const closeTip = () => {
    setShowTip(false)
    try { localStorage.setItem('account_tip_closed', 'true') } catch { /* ignore */ }
  }

  // 同步初始值
  useEffect(() => {
    const p = loadProfile()
    setEditUsername(p.username)
    setEditEmail(p.email)
    setAvatar(p.avatar)
    const a = loadAuth()
    setNewUsername(a.username || '')
    setAuth(a)
  }, [])

  const tabs = [
    { id: 'profile' as const, label: '个人资料', icon: User },
    { id: 'credentials' as const, label: '登录凭证', icon: Shield },
  ]

  // 图片压缩（限制 256x256，避免 localStorage 溢出）
  const compressImage = (file: File, maxSize = 256): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          const size = Math.min(img.width, img.height, maxSize)
          canvas.width = size
          canvas.height = size
          const ctx = canvas.getContext('2d')
          if (ctx) {
            // 居中裁剪为正方形
            const sx = (img.width - size) / 2
            const sy = (img.height - size) / 2
            ctx.drawImage(img, sx, sy, size, size, 0, 0, size, size)
          }
          resolve(canvas.toDataURL('image/jpeg', 0.85))
        }
        img.src = e.target?.result as string
      }
      reader.readAsDataURL(file)
    })
  }

  // 头像上传
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('请上传图片格式文件')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('图片大小不能超过 5MB')
      return
    }
    try {
      const compressed = await compressImage(file)
      setAvatar(compressed)
      toast.success('头像已更新')
    } catch {
      toast.error('图片处理失败')
    }
  }

  // 保存个人资料
  const handleSaveProfile = () => {
    if (!editUsername.trim()) {
      toast.error('用户名不能为空')
      return
    }
    if (!editEmail.trim()) {
      toast.error('邮箱不能为空')
      return
    }
    const updated: AdminProfile = {
      username: editUsername.trim(),
      email: editEmail.trim(),
      avatar,
    }
    setProfile(updated)
    saveProfile(updated)
    toast.success('个人资料已保存')
  }

  // 修改登录密码
  const handleChangeCredentials = () => {
    const storedAuth = loadAuth()

    // 如果之前设置过密码哈希，需要验证当前密码
    if (storedAuth.passwordHash && !fastVerify(currentPassword, storedAuth.passwordHash)) {
      toast.error('当前密码错误')
      return
    }

    if (!newPassword || newPassword.length < 6) {
      toast.error('新密码至少需要 6 位字符')
      return
    }

    if (newPassword !== confirmPassword) {
      toast.error('两次输入的新密码不一致')
      return
    }

    // 存储密码哈希而非明文
    const updated: AuthCredentials = {
      username: newUsername.trim() || storedAuth.username || 'admin',
      passwordHash: fastHash(newPassword),
    }
    setAuth(updated)
    saveAuth(updated)

    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    toast.success('登录凭证已更新，下次登录生效')
  }

  const getInitial = () => {
    return (editUsername || profile.username || 'A').charAt(0).toUpperCase()
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">账户设置</h1>
        <p className="text-gray-500 mt-1">管理您的账户信息、头像和登录凭证</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* 左侧卡片 */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="lg:w-72 flex-shrink-0"
        >
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            {/* 头像和基本信息 */}
            <div className="p-6 text-center border-b">
              <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-brand-500 to-violet-500 flex items-center justify-center text-white text-3xl font-bold mb-4 overflow-hidden shadow-lg">
                {avatar ? (
                  <img src={avatar} alt="头像" className="w-full h-full object-cover" />
                ) : (
                  getInitial()
                )}
              </div>
              <h3 className="font-semibold text-gray-800 text-lg">{profile.username}</h3>
              <p className="text-sm text-gray-500 mt-1">{profile.email}</p>
            </div>

            {/* 导航 */}
            <nav className="p-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-sm font-medium ${
                    activeTab === tab.id
                      ? 'bg-brand-50 text-brand-600'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <tab.icon className="w-5 h-5" />
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* 提示信息 */}
          {showTip && (
            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 relative">
              <button
                onClick={closeTip}
                className="absolute top-2 right-2 p-1 rounded-full hover:bg-amber-200/50 text-amber-500 transition-colors"
                title="不再提示"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              <div className="flex items-start gap-2.5">
                <Settings className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-amber-800">温馨提示</p>
                  <p className="text-xs text-amber-600 mt-1">
                  当前使用本地存储模式。修改的账户信息仅保存在当前浏览器中。
                  部署到 Cloudflare Pages 后，信息将通过 D1 数据库同步到云端。
                  </p>
                </div>
              </div>
            </div>
          )}
        </motion.div>

        {/* 右侧内容 */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex-1"
        >
          {/* 个人资料 */}
          {activeTab === 'profile' && (
            <div className="bg-white rounded-xl border shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
                <User className="w-5 h-5 text-brand-500" />
                个人资料
              </h2>

              <div className="space-y-6 max-w-lg">
                {/* 头像 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    头像
                  </label>
                  <div className="flex items-center gap-5">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-brand-500 to-violet-500 flex items-center justify-center text-white text-2xl font-bold overflow-hidden shadow-md flex-shrink-0">
                      {avatar ? (
                        <img src={avatar} alt="预览" className="w-full h-full object-cover" />
                      ) : (
                        getInitial()
                      )}
                    </div>
                    <div>
                      <label className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 cursor-pointer text-sm text-gray-600 transition-colors">
                        <Upload className="w-4 h-4" />
                        {avatar ? '更换头像' : '上传头像'}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleAvatarUpload}
                          className="hidden"
                        />
                      </label>
                      {avatar && (
                        <button
                          onClick={() => setAvatar(null)}
                          className="ml-2 px-3 py-2.5 text-sm text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                        >
                          移除头像
                        </button>
                      )}
                      <p className="text-xs text-gray-400 mt-1.5">支持 JPG、PNG，大小不超过 2MB</p>
                    </div>
                  </div>
                </div>

                {/* 用户名 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    用户名
                  </label>
                  <input
                    type="text"
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value)}
                    placeholder="请输入用户名"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-300 transition-all text-sm"
                  />
                  <p className="text-xs text-gray-400 mt-1">这将显示在后台管理界面中</p>
                </div>

                {/* 邮箱 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    邮箱
                  </label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="请输入邮箱地址"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-300 transition-all text-sm"
                  />
                  <p className="text-xs text-gray-400 mt-1">用于接收系统通知和找回密码</p>
                </div>

                {/* 保存按钮 */}
                <div className="pt-2">
                  <button
                    onClick={handleSaveProfile}
                    className="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-medium text-sm flex items-center gap-2 shadow-button transition-all cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    保存修改
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 登录凭证 */}
          {activeTab === 'credentials' && (
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
                      (!newUsername.trim() && !newPassword) ||
                      (!!newPassword && newPassword !== confirmPassword)
                    }
                    className="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-medium text-sm flex items-center gap-2 shadow-button transition-all cursor-pointer"
                  >
                    <Lock className="w-4 h-4" />
                    更新登录凭证
                  </button>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  )
}
