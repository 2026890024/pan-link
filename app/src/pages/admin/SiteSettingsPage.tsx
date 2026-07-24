import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  Palette, Image, Type, Upload, Trash2, Save, Plus, Check, Loader2,
  Globe, X, Sparkles, ChevronDown, History, PanelTop,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useSiteSettingsStore, type ColorScheme } from '@/store/useSiteSettingsStore'
import { applyBrandColors, generatePaletteFromPrimary } from '@/lib/colors'

const tabs = [
  { id: 'logo' as const, label: 'Logo 管理', icon: Image },
  { id: 'favicon' as const, label: 'Favicon', icon: PanelTop },
  { id: 'colors' as const, label: '配色方案', icon: Palette },
  { id: 'info' as const, label: '站点信息', icon: Globe },
]

function resizeImageToDataURL(file: File, maxSize = 64): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      const size = Math.min(maxSize, Math.max(img.width, img.height))
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Canvas not supported'))
        return
      }
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, size, size)
      // 优先使用 PNG，必要时降级为 JPEG 以控制体积
      let dataUrl = canvas.toDataURL('image/png')
      if (dataUrl.length > 16384) {
        dataUrl = canvas.toDataURL('image/jpeg', 0.85)
      }
      if (dataUrl.length > 65535) {
        reject(new Error('图片压缩后仍超过限制，请选择更小的图片'))
      } else {
        resolve(dataUrl)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片加载失败'))
    }
    img.src = url
  })
}

export default function SiteSettingsPage() {
  const [activeTab, setActiveTab] = useState<'logo' | 'favicon' | 'colors' | 'info'>('logo')
  const { loaded } = useSiteSettingsStore()

  if (!loaded) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">站点设置</h1>
          <p className="text-gray-500 mt-1">管理网站 Logo、配色方案和基本信息</p>
        </div>
        <div className="flex items-center justify-center h-64 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          加载中...
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">站点设置</h1>
        <p className="text-gray-500 mt-1">管理网站 Logo、配色方案和基本信息</p>
      </div>

      {/* Tab 导航 */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
              activeTab === tab.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'logo' && <LogoTab />}
      {activeTab === 'favicon' && <FaviconTab />}
      {activeTab === 'colors' && <ColorsTab />}
      {activeTab === 'info' && <InfoTab />}
    </div>
  )
}

// ============ Logo 管理标签 ============

function LogoTab() {
  const { settings, setLogoType, setLogoText, setLogoUrl, selectLogo, addLogo, removeLogo } = useSiteSettingsStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [logoUrlInput, setLogoUrlInput] = useState('')
  const [logoNameInput, setLogoNameInput] = useState('')

  const logoType = settings.current_logo_type || 'text'
  const logoText = settings.current_logo_text || '资源云'
  const logoUrl = settings.current_logo_url || ''
  const library = settings.logo_library || []

  // 上传图片转为 base64
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) {return}
    if (!file.type.startsWith('image/')) {
      toast.error('请上传图片格式文件')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('图片大小不能超过 2MB')
      return
    }
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string
      const name = file.name.replace(/\.[^.]+$/, '')
      await addLogo(dataUrl, name)
      toast.success(`Logo "${name}" 已添加到库`)
    }
    reader.readAsDataURL(file)
    // 重置 input
    if (fileInputRef.current) {fileInputRef.current.value = ''}
  }

  const handleAddUrlLogo = async () => {
    if (!logoUrlInput.trim()) {
      toast.error('请输入 Logo 图片 URL')
      return
    }
    await addLogo(logoUrlInput.trim(), logoNameInput.trim() || '网络 Logo')
    toast.success('Logo 已添加到库')
    setLogoUrlInput('')
    setLogoNameInput('')
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* 左侧：当前 Logo 预览 */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="lg:col-span-1">
        <div className="bg-white rounded-xl border shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-brand-500" />
            当前 Logo
          </h2>

          <div className="flex flex-col items-center gap-4">
            {/* Preview */}
            <div className="w-full aspect-[3/1] rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 border flex items-center justify-center">
              {logoType === 'image' && logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Logo"
                  className="max-h-full max-w-[80%] object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
              ) : (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-brand-500 to-violet-500 flex items-center justify-center">
                    <Type className="w-5 h-5 text-white" />
                  </div>
                  <span className="font-bold text-xl text-gray-800">{logoText}</span>
                </div>
              )}
            </div>

            {/* 类型切换 */}
            <div className="w-full flex gap-1 bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setLogoType('text')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-all cursor-pointer ${
                  logoType === 'text' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                }`}
              >
                <Type className="w-3.5 h-3.5" />文字 Logo
              </button>
              <button
                onClick={() => setLogoType('image')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-all cursor-pointer ${
                  logoType === 'image' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                }`}
              >
                <Image className="w-3.5 h-3.5" />图片 Logo
              </button>
            </div>

            {/* 文字 Logo 编辑 */}
            {logoType === 'text' && (
              <div className="w-full">
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Logo 文字</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={logoText}
                    onChange={(e) => setLogoText(e.target.value)}
                    placeholder="输入 Logo 文字"
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-300 text-sm"
                  />
                </div>
              </div>
            )}

            {/* 图片 Logo 编辑 */}
            {logoType === 'image' && (
              <div className="w-full">
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Logo 图片 URL</label>
                <input
                  type="text"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="输入 Logo 图片地址"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-300 text-sm"
                />
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* 右侧：Logo 库 */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="lg:col-span-2"
      >
        <div className="bg-white rounded-xl border shadow-sm p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Image className="w-5 h-5 text-brand-500" />
              Logo 库
              <span className="text-sm font-normal text-gray-400">({library.length})</span>
            </h2>
          </div>

          {/* 添加 Logo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5 p-4 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            {/* 上传图片 */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed border-gray-300 hover:border-brand-400 hover:bg-brand-50/50 text-sm text-gray-500 hover:text-brand-600 transition-all cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              上传本地图片
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />

            {/* 输入 URL */}
            <div className="flex gap-2">
              <input
                type="text"
                value={logoUrlInput}
                onChange={(e) => setLogoUrlInput(e.target.value)}
                placeholder="输入 Logo URL"
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300 text-sm"
                onKeyDown={(e) => e.key === 'Enter' && handleAddUrlLogo()}
              />
              <button
                onClick={handleAddUrlLogo}
                disabled={!logoUrlInput.trim()}
                className="px-3 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center gap-1 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Logo 列表 */}
          {library.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Image className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">还没有 Logo，上传或添加 URL 开始</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {library.map((logo, i) => (
                <div
                  key={i}
                  className={`group relative bg-gray-50 rounded-xl border-2 p-3 flex flex-col items-center gap-2 transition-all cursor-pointer ${
                    logo.url === settings.current_logo_url
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-transparent hover:border-gray-200'
                  }`}
                >
                  {/* 选中标记 */}
                  {logo.url === settings.current_logo_url && (
                    <div className="absolute top-2 right-2 w-5 h-5 bg-brand-500 rounded-full flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}

                  {/* 图片预览 */}
                  <div
                    className="w-full aspect-square rounded-lg bg-white border flex items-center justify-center overflow-hidden"
                    onClick={() => selectLogo(i)}
                  >
                    <img
                      src={logo.url}
                      alt={logo.name}
                      className="max-w-[80%] max-h-[80%] object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="%23999" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>'
                      }}
                    />
                  </div>

                  <span className="text-xs text-gray-600 truncate w-full text-center">{logo.name}</span>

                  {/* 操作按钮 */}
                  <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); removeLogo(i) }}
                      className="w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {library.length > 0 && (
            <p className="text-xs text-gray-400 mt-4">
              点击 Logo 即可设为当前使用的 Logo，悬停显示删除按钮
            </p>
          )}
        </div>
      </motion.div>
    </div>
  )
}

// ============ Favicon 标签 ============

function FaviconTab() {
  const { settings, addFavicon, removeFavicon, selectFavicon } = useSiteSettingsStore()
  const [urlInput, setUrlInput] = useState('')
  const [urlError, setUrlError] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const library = settings.favicon_library || []
  const currentUrl = settings.current_favicon_url || '/favicon.png'

  const isValidImageUrl = (url: string) => {
    if (!url) { return false }
    if (url.startsWith('data:image/')) { return true }
    try { new URL(url); return true } catch { return false }
  }

  const handleUrlSubmit = async () => {
    const trimmed = urlInput.trim()
    if (!isValidImageUrl(trimmed)) {
      setUrlError('请输入有效的图片 URL 或 Base64 图片')
      return
    }
    await addFavicon(trimmed, `Favicon ${library.length + 1}`)
    setUrlInput('')
    setUrlError('')
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) { return }
    if (!file.type.startsWith('image/')) {
      toast.error('请选择图片文件')
      return
    }
    setIsUploading(true)
    try {
      const dataUrl = await resizeImageToDataURL(file, 64)
      await addFavicon(dataUrl, file.name.replace(/\.[^/.]+$/, ''))
      toast.success('Favicon 上传成功')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '上传失败')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) { fileInputRef.current.value = '' }
    }
  }

  const handleDelete = async (index: number) => {
    await removeFavicon(index)
    toast.success('已删除')
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* 左侧：当前 Favicon 预览 */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="lg:col-span-5 bg-white rounded-2xl p-6 border border-gray-100 shadow-sm"
      >
        <div className="flex items-center gap-2 mb-5">
          <PanelTop className="w-4 h-4 text-brand-600" />
          <h3 className="text-base font-semibold text-gray-900">当前 Favicon</h3>
        </div>

        {/* 浏览器标签页预览 */}
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 mb-5">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 px-3 py-2 flex items-center gap-2 max-w-[260px]">
            <img
              src={currentUrl}
              alt="favicon"
              className="w-4 h-4 object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/favicon.png'
              }}
            />
            <span className="text-xs text-gray-600 truncate">{settings.site_name || '资源云'}</span>
            <X className="w-3 h-3 text-gray-300 ml-auto" />
          </div>
          <p className="text-xs text-gray-400 mt-3">浏览器标签页图标预览</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Favicon URL</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={urlInput}
                onChange={(e) => { setUrlInput(e.target.value); setUrlError('') }}
                placeholder="输入图片 URL 或 Base64"
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              />
              <button
                onClick={handleUrlSubmit}
                disabled={!urlInput.trim()}
                className="px-4 py-2 text-sm text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                添加
              </button>
            </div>
            {urlError && <p className="text-xs text-red-500 mt-1.5">{urlError}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">上传本地图片</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="w-full py-8 border-2 border-dashed border-gray-200 rounded-xl hover:border-brand-400 hover:bg-brand-50/50 transition-colors flex flex-col items-center gap-2 text-gray-500 hover:text-brand-600"
            >
              {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
              <span className="text-sm">{isUploading ? '上传中...' : '点击上传 Favicon'}</span>
            </button>
            <p className="text-xs text-gray-400 mt-2">建议尺寸 32×32 或 64×64，支持 PNG / JPG / SVG</p>
          </div>
        </div>
      </motion.div>

      {/* 右侧：Favicon 库 */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="lg:col-span-7 bg-white rounded-2xl p-6 border border-gray-100 shadow-sm"
      >
        <div className="flex items-center gap-2 mb-5">
          <History className="w-4 h-4 text-brand-600" />
          <h3 className="text-base font-semibold text-gray-900">Favicon 库 ({library.length})</h3>
        </div>

        {library.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-gray-200 rounded-xl">
            <PanelTop className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">暂无 Favicon</p>
            <p className="text-xs text-gray-400 mt-1">上传或输入 URL 后会显示在这里</p>
          </div>
        ) : (
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3">
            {library.map((item, index) => {
              const isActive = currentUrl === item.url
              return (
                <div
                  key={`${item.url}-${index}`}
                  onClick={async () => {
                    try {
                      await selectFavicon(index)
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : '设置失败')
                    }
                  }}
                  className={`relative group cursor-pointer rounded-xl border-2 p-3 flex flex-col items-center gap-2 transition-all ${
                    isActive
                      ? 'border-brand-500 bg-brand-50 shadow-sm'
                      : 'border-gray-100 hover:border-brand-300 hover:bg-gray-50'
                  }`}
                >
                  <img
                    src={item.url}
                    alt={item.name}
                    className="w-8 h-8 object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/favicon.png'
                    }}
                  />
                  <span className="text-[10px] text-gray-500 truncate w-full text-center">{item.name}</span>

                  {isActive && (
                    <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-brand-600 rounded-full flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}

                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(index) }}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-white text-red-500 border border-gray-100 rounded-full items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hidden group-hover:flex"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {library.length > 0 && (
          <p className="text-xs text-gray-400 mt-4">
            点击 Favicon 即可设为当前使用的标签页图标，悬停显示删除按钮
          </p>
        )}
      </motion.div>
    </div>
  )
}

// ============ 配色方案标签 ============

function ColorsTab() {
  const { settings, updateColors, saveColorScheme, applyColorScheme, deleteColorScheme } = useSiteSettingsStore()
  const [schemeName, setSchemeName] = useState('')
  const [showSaved, setShowSaved] = useState(false)

  const colors = settings.current_colors || {
    primary: '#6366F1',
    secondary: '#818CF8',
    accent: '#A5B4FC',
    lightest: '#F5F3FF',
    darkest: '#1E1B4B',
  }
  const history = settings.color_history || []

  const handleColorChange = (key: string, value: string) => {
    if (key === 'primary') {
      // 修改主色时自动推导其他颜色
      const auto = generatePaletteFromPrimary(value)
      updateColors({ primary: value, secondary: auto.secondary, accent: auto.accent, lightest: auto.lightest, darkest: auto.darkest })
    } else {
      updateColors({ ...colors, [key]: value })
    }
  }

  const handleAutoPalette = () => {
    const auto = generatePaletteFromPrimary(colors.primary)
    updateColors({ ...colors, ...auto })
    toast.success('已根据主色自动配置其他颜色')
  }

  const handleSaveScheme = async () => {
    if (!schemeName.trim()) {
      toast.error('请输入方案名称')
      return
    }
    await saveColorScheme(schemeName.trim())
    setSchemeName('')
    toast.success(`配色方案「${schemeName.trim()}」已保存`)
    setShowSaved(true)
  }

  // 实时预览颜色
  useEffect(() => {
    applyBrandColors(colors.primary)
  }, [colors.primary])

  const colorFields: Array<{ key: keyof typeof colors; label: string; desc: string }> = [
    { key: 'primary', label: '品牌主色', desc: '按钮、链接、强调元素' },
    { key: 'secondary', label: '品牌辅色', desc: '次要元素、hover 状态' },
    { key: 'accent', label: '强调色', desc: '最浅的强调色' },
    { key: 'lightest', label: '最浅色', desc: '背景色、hover 背景' },
    { key: 'darkest', label: '最深色', desc: '深色背景、文字' },
  ]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* 左侧：颜色编辑器 */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="lg:col-span-2">
        <div className="bg-white rounded-xl border shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-5 flex items-center gap-2">
            <Palette className="w-5 h-5 text-brand-500" />
            当前配色
            <button
              onClick={handleAutoPalette}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand-600 bg-brand-50 hover:bg-brand-100 rounded-lg transition-colors cursor-pointer"
              title="根据主色自动计算其他颜色"
            >
              <Sparkles className="w-3.5 h-3.5" />
              自动配色
            </button>
          </h2>

          <div className="space-y-5">
            {colorFields.map(field => (
              <div key={field.key}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <label className="text-sm font-medium text-gray-700">{field.label}</label>
                    <p className="text-xs text-gray-400">{field.desc}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-8 h-8 rounded-lg border shadow-sm"
                      style={{ backgroundColor: colors[field.key] }}
                    />
                    <div className="relative">
                      <input
                        type="color"
                        value={colors[field.key]}
                        onChange={(e) => handleColorChange(field.key, e.target.value)}
                        className="absolute inset-0 opacity-0 w-8 h-8 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={colors[field.key]}
                        onChange={(e) => handleColorChange(field.key, e.target.value)}
                        className="w-24 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-brand-300"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 实时预览卡片 */}
          <div className="mt-6 p-4 rounded-xl border" style={{ backgroundColor: colors.lightest }}>
            <div className="flex flex-wrap gap-2 mb-3">
              {[50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map(shade => (
                <div key={shade}>
                  <div className="text-[10px] text-gray-500 mb-1">{shade}</div>
                  <div
                    className="w-8 h-8 rounded-md"
                    style={{ backgroundColor: `var(--brand-${shade})` }}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                className="px-3 py-1.5 rounded-lg text-white text-xs font-medium"
                style={{ backgroundColor: colors.primary }}
              >
                主色按钮
              </button>
              <button
                className="px-3 py-1.5 rounded-lg text-xs font-medium border"
                style={{ borderColor: colors.primary, color: colors.primary }}
              >
                描边按钮
              </button>
              <span className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ backgroundColor: colors.darkest, color: 'white' }}>
                深色标签
              </span>
            </div>
          </div>

          {/* 保存方案 */}
          <div className="mt-5 flex items-center gap-3 p-4 bg-gray-50 rounded-xl">
            <input
              type="text"
              value={schemeName}
              onChange={(e) => setSchemeName(e.target.value)}
              placeholder="输入方案名称（如：清新绿、科技蓝...）"
              className="flex-1 px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300 text-sm"
              onKeyDown={(e) => e.key === 'Enter' && handleSaveScheme()}
            />
            <button
              onClick={handleSaveScheme}
              className="px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-all cursor-pointer"
            >
              <Save className="w-4 h-4" />
              保存方案
            </button>
          </div>
        </div>
      </motion.div>

      {/* 右侧：配色历史 */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <div className="bg-white rounded-xl border shadow-sm p-6">
          <button
            onClick={() => setShowSaved(!showSaved)}
            className="w-full flex items-center justify-between mb-4"
          >
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <History className="w-5 h-5 text-brand-500" />
              配色历史
              <span className="text-sm font-normal text-gray-400">({history.length})</span>
            </h2>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showSaved ? 'rotate-180' : ''}`} />
          </button>

          {showSaved && (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {history.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">还没有保存的配色方案</p>
              ) : (
                history.map((scheme, i) => (
                  <ColorSchemeCard
                    key={i}
                    scheme={scheme}
                    isActive={
                      scheme.primary === colors.primary &&
                      scheme.secondary === colors.secondary
                    }
                    onApply={() => applyColorScheme(i)}
                    onDelete={() => deleteColorScheme(i)}
                  />
                ))
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}

function ColorSchemeCard({
  scheme, isActive, onApply, onDelete,
}: {
  scheme: ColorScheme
  isActive: boolean
  onApply: () => void
  onDelete: () => void
}) {
  return (
    <div className={`p-3 rounded-lg border transition-all ${
      isActive ? 'border-brand-500 bg-brand-50' : 'border-gray-100 hover:border-gray-200'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">{scheme.name}</span>
        <span className="text-[10px] text-gray-400">
          {new Date(scheme.saved_at).toLocaleDateString('zh-CN')}
        </span>
      </div>
      <div className="flex gap-1.5 mb-2">
        {[scheme.primary, scheme.secondary, scheme.accent, scheme.darkest].map((color, i) => (
          <div
            key={i}
            className="w-5 h-5 rounded-full border shadow-sm"
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
      <div className="flex gap-2">
        {isActive ? (
          <span className="flex-1 text-center text-xs text-brand-600 font-medium py-1 inline-flex items-center justify-center gap-1">
            <Check className="w-3 h-3 flex-shrink-0" />当前使用
          </span>
        ) : (
          <button
            onClick={onApply}
            className="flex-1 px-2 py-1 text-xs bg-brand-600 hover:bg-brand-700 text-white rounded-md transition-colors cursor-pointer"
          >
            应用
          </button>
        )}
        <button
          onClick={onDelete}
          className="px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ============ 站点信息标签 ============

function InfoTab() {
  const { settings, setSiteName, setSiteDescription } = useSiteSettingsStore()
  const [name, setName] = useState(settings.site_name || '资源云')
  const [desc, setDesc] = useState(settings.site_description || '')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setName(settings.site_name || '资源云')
    setDesc(settings.site_description || '')
  }, [settings.site_name, settings.site_description])

  const handleSave = async () => {
    const trimmedName = name.trim()
    const trimmedDesc = desc.trim()
    if (!trimmedName) { toast('站点名称不能为空'); return }
    if (saving) {return}
    setSaving(true)
    try {
      await setSiteName(trimmedName)
      await setSiteDescription(trimmedDesc)
      // 浏览器标题完整使用“浏览器标题描述”字段
      document.title = trimmedDesc
      toast.success('站点信息已保存')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`保存失败：${msg}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl">
      <div className="bg-white rounded-xl border shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-5 flex items-center gap-2">
          <Globe className="w-5 h-5 text-brand-500" />
          站点基本信息
        </h2>

        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              网站 Logo 旁名称
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="输入网站 Logo 旁显示的名称"
              maxLength={100}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-300 text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">仅显示在首页顶部与页脚的 Logo 旁边</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              浏览器标题描述
            </label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="输入浏览器标签页标题中的描述"
              maxLength={500}
              rows={3}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-300 text-sm resize-none"
            />
            <p className="text-xs text-gray-400 mt-1">完整显示在浏览器标签页标题中，不再拼接站点名称</p>
          </div>

          <div className="pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className={`px-6 py-2.5 rounded-xl font-medium text-sm flex items-center gap-2 shadow-button transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                saved
                  ? 'bg-green-500 text-white'
                  : 'bg-brand-600 hover:bg-brand-700 text-white'
              }`}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {saving ? '保存中...' : saved ? '已保存' : '保存站点信息'}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
