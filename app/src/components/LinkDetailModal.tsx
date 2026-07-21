import { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  Copy,
  Check,
  Clock,
  Share2,
  ExternalLink,
  X,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react'
import { useDataStore, type LinkItem } from '@/store/useDataStore'
import { getDaysRemaining, copyToClipboard, checkLinkStatus, buildShareText, hexToRgba } from '@/lib/utils'
import { LinkIcon } from '@/components/LinkIcon'
import toast from 'react-hot-toast'

interface LinkDetailModalProps {
  link: LinkItem | null
  onClose: () => void
}

export default function LinkDetailModal({ link, onClose }: LinkDetailModalProps) {
  const { categories, subCategories, incrementClicks } = useDataStore()
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [iconError, setIconError] = useState(false)
  const modalRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  // Esc 关闭 + 焦点陷阱
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {onClose()}
    if (e.key === 'Tab' && modalRef.current) {
      const focusable = modalRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      if (focusable.length === 0) {return}
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
  }, [onClose])

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement
    document.addEventListener('keydown', handleKeyDown)
    // iOS Safari 兼容滚动锁定
    const scrollY = window.scrollY
    const originalPosition = document.body.style.position
    const originalTop = document.body.style.top
    const originalWidth = document.body.style.width
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.width = '100%'
    // 用 rAF 替代 setTimeout 确保动画完成后聚焦
    requestAnimationFrame(() => {
      const focusable = modalRef.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      focusable?.focus()
    })
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.position = originalPosition
      document.body.style.top = originalTop
      document.body.style.width = originalWidth
      window.scrollTo(0, scrollY)
      previousFocusRef.current?.focus()
    }
  }, [handleKeyDown])

  if (!link) {return null}

  const category = categories.find((c) => c.id === link.category_id)
  const subcategory = link.subcategory_id
    ? subCategories.find(sc => sc.id === link.subcategory_id)
    : null
  const status = checkLinkStatus(link.expires_at || null)
  const daysRemaining = getDaysRemaining(link.expires_at || null)

  const handleCopy = async (text: string, field: string) => {
    const success = await copyToClipboard(text)
    if (success) {
      setCopiedField(field)
      toast.success('链接已复制')
      setTimeout(() => setCopiedField(null), 2000)
    } else {
      toast.error('复制失败')
    }
  }

  const handleVisit = () => {
    incrementClicks(link.id)
    toast.success('即将跳转到下载页面...')
    window.open(link.url, '_blank', 'noopener,noreferrer')
  }

  const handleShare = async () => {
    const shareText = buildShareText(link.name, link.url, link.extract_code || undefined)
    if (navigator.share) {
      try {
        await navigator.share({
          title: link.name,
          text: shareText,
          url: link.url,
        })
      } catch (err) {
        // 用户取消 (AbortError) 静默，其他错误降级到复制
        if (err instanceof DOMException && err.name === 'AbortError') {return}
        await copyToClipboard(shareText)
        toast.success('分享内容已复制')
      }
    } else {
      await copyToClipboard(shareText)
      toast.success('分享内容已复制')
    }
  }

  // 图标加载失败降级为 LinkIcon
  const getLinkIcon = () => {
    if (link.icon && !iconError) {
      return (
        <img
          src={link.icon}
          alt={link.name}
          className="w-16 h-16 rounded-xl object-cover shadow-sm"
          loading="lazy"
          decoding="async"
          onError={() => setIconError(true)}
        />
      )
    }
    return <LinkIcon link={link} size={link.icon_size || 'lg'} />
  }

  return (
    // 移动端底部抽屉 → 桌面端居中弹窗
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* 背景遮罩 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* 弹窗本体：移动端贴底全宽+顶部大圆角，桌面端居中卡片 */}
      <motion.div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        initial={{ opacity: 0, y: 30, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.94 }}
        transition={{ type: 'spring', stiffness: 380, damping: 28, mass: 0.6 }}
        className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-glass-lg max-h-[90vh] sm:max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部彩色状态条 */}
        <div className={`h-1.5 rounded-t-3xl sm:rounded-t-2xl bg-gradient-to-r ${status === 'expired' ? 'from-red-500 to-red-400' : 'from-brand-600 via-brand-500 to-violet-500'}`} />

        {/* 关闭按钮：纯图标，hover 时才出现灰底 */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg flex items-center justify-center transition-colors cursor-pointer z-10 touch-manipulation border-none outline-none"
          aria-label="关闭"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-6 pt-8">
          {/* 图标 + 标题 */}
          <div className="flex flex-col items-center mb-6">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-50 to-violet-50 flex items-center justify-center shadow-sm mb-4">
              {getLinkIcon()}
            </div>
            <h2 id="modal-title" className="text-xl font-bold text-gray-900 mb-1 text-center">{link.name || link.title}</h2>

            {/* 分类 + 子分类 */}
            <div className="flex items-center gap-2 mb-2">
              {category && (
                <span className="px-2.5 py-0.5 bg-brand-50 text-brand-600 rounded-full text-xs font-medium">
                  {category.name}
                </span>
              )}
              {subcategory && (
                <>
                  <ChevronRight className="w-3 h-3 text-gray-300" />
                  <span className="px-2.5 py-0.5 bg-violet-50 text-violet-600 rounded-full text-xs font-medium">
                    {subcategory.name}
                  </span>
                </>
              )}
            </div>

            {/* 标签 - 使用 hexToRgba 安全拼接颜色 */}
            {link.tags && link.tags.length > 0 && (
              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                {link.tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="px-2.5 py-0.5 rounded-full text-xs font-medium"
                    style={{ backgroundColor: hexToRgba(tag.color, 0.12), color: tag.color }}
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 过期 / 即将过期警告 */}
          {status === 'expired' && (
            <div className="mb-5 p-3 bg-red-50/80 border border-red-200 rounded-xl flex items-center gap-3">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <span className="text-red-700 text-sm font-medium">该资源链接已过期，可能无法正常访问</span>
            </div>
          )}
          {status === 'expiring_soon' && (
            <div className="mb-5 p-3 bg-amber-50/80 border border-amber-100 rounded-xl flex items-center gap-3">
              <Clock className="w-4 h-4 text-amber-500 flex-shrink-0" />
              <span className="text-amber-700 text-sm">即将过期：剩余 <strong className="text-amber-800">{daysRemaining}</strong> 天</span>
            </div>
          )}

          {/* 链接地址：input → div + select-none */}
          <div className="mb-3">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">链接地址</label>
            <div className="flex items-center gap-2">
              <div
                className="flex-1 bg-gray-50 px-3 py-2.5 rounded-xl border border-gray-200 font-mono text-xs text-gray-600 truncate select-none"
                title={link.url}
              >
                {link.url}
              </div>
              <button
                onClick={() => handleCopy(link.url, 'url')}
                className="px-3 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl transition-colors flex items-center gap-1.5 text-sm font-medium flex-shrink-0 cursor-pointer touch-manipulation"
              >
                {copiedField === 'url' ? (
                  <><Check className="w-3.5 h-3.5" /> 已复制</>
                ) : (
                  <><Copy className="w-3.5 h-3.5" /> 复制</>
                )}
              </button>
            </div>
          </div>

          {/* 提取码：input → div，按钮统一 brand-600 */}
          {link.extract_code && (
            <div className="mb-3">
              <label className="text-xs font-semibold text-amber-500 uppercase tracking-wider mb-1.5 block">提取码</label>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-amber-50 px-3 py-2.5 rounded-xl border border-amber-100 font-mono text-lg text-center tracking-[0.3em] uppercase font-bold text-amber-700 select-none">
                  {link.extract_code}
                </div>
                <button
                  onClick={() => handleCopy(link.extract_code ?? '', 'code')}
                  className="px-3 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl transition-colors flex items-center gap-1.5 text-sm font-medium flex-shrink-0 cursor-pointer touch-manipulation"
                >
                  {copiedField === 'code' ? (
                    <><Check className="w-3.5 h-3.5" /> 已复制</>
                  ) : (
                    <><Copy className="w-3.5 h-3.5" /> 一键复制</>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* 有效期 */}
          <div className="mb-5 p-3 bg-brand-50/50 rounded-xl border border-brand-50 flex items-center justify-between">
            <span className="text-xs text-gray-500 font-medium">有效期</span>
            <span className="text-sm font-semibold">
              {daysRemaining === null ? (
                <span className="text-emerald-600 flex items-center gap-1.5">
                  <Check className="w-4 h-4" /> 永久有效
                </span>
              ) : status === 'expired' ? (
                <span className="text-red-600 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" /> 已过期
                </span>
              ) : (
                <span className="text-gray-700">剩余 {daysRemaining} 天</span>
              )}
            </span>
          </div>

          {/* 操作按钮 - sticky 固定在弹窗底部，移动端长内容时始终可见 */}
          <div className="sticky bottom-0 bg-white border-t border-gray-100 space-y-2.5 pt-3 pb-[env(safe-area-inset-bottom,0px)]">
            <button
              onClick={handleVisit}
              disabled={status === 'expired'}
              className={`w-full py-3 rounded-xl font-semibold text-base flex items-center justify-center gap-2 shadow-button transition-all duration-300 cursor-pointer touch-manipulation ${
                status === 'expired'
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-brand-600 to-brand-500 text-white hover:shadow-glass active:scale-[0.98]'
              }`}
            >
              <ExternalLink className="w-5 h-5" />
              {status === 'expired' ? '链接已过期' : '立即下载'}
            </button>
            <button
              onClick={handleShare}
              className="w-full py-2.5 bg-brand-50 text-brand-600 rounded-xl font-medium text-sm flex items-center justify-center gap-2 hover:bg-brand-100 transition-all duration-200 cursor-pointer touch-manipulation"
            >
              <Share2 className="w-4 h-4" /> 分享
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
