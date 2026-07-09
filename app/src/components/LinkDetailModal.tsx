import { useState, useEffect, useCallback } from 'react'
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
import { getDaysRemaining, copyToClipboard, checkLinkStatus } from '@/lib/utils'
import { LinkIcon } from '@/components/LinkIcon'
import toast from 'react-hot-toast'

interface LinkDetailModalProps {
  link: LinkItem | null
  onClose: () => void
}

export default function LinkDetailModal({ link, onClose }: LinkDetailModalProps) {
  const { categories, subCategories, incrementClicks } = useDataStore()
  const [copiedField, setCopiedField] = useState<string | null>(null)

  // Esc 关闭
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [handleKeyDown])

  if (!link) return null

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
    window.open(link.url, '_blank')
  }

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/s/${link.slug}`
    if (navigator.share) {
      try {
        await navigator.share({
          title: link.name,
          text: `发现优质资源：${link.name}`,
          url: shareUrl,
        })
      } catch {
        // 用户取消分享
      }
    } else {
      await copyToClipboard(shareUrl)
      toast.success('分享链接已复制')
    }
  }

  const getLinkIcon = () => {
    if (link.icon) {
      return <img src={link.icon} alt={link.name} className="w-16 h-16 rounded-xl object-cover shadow-sm" loading="lazy" decoding="async" />
    }
    return <LinkIcon link={link} size="lg" />
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* 弹窗内容 */}
      <div
        className="relative w-full max-w-md bg-white rounded-2xl shadow-glass-lg animate-scale-in max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部彩色条 */}
        <div className={`h-1.5 rounded-t-2xl bg-gradient-to-r ${status === 'expired' ? 'from-red-500 to-red-400' : 'from-brand-600 via-brand-500 to-violet-500'}`} />

        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors cursor-pointer z-10"
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>

        <div className="p-6 pt-8">
          {/* 图标 + 标题 */}
          <div className="flex flex-col items-center mb-6">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-50 to-violet-50 flex items-center justify-center shadow-sm mb-4">
              {getLinkIcon()}
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-1 text-center">{link.name || link.title}</h2>

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

            {/* 标签 */}
            {link.tags && link.tags.length > 0 && (
              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                {link.tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="px-2.5 py-0.5 rounded-full text-xs font-medium"
                    style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            )}

            {/* 描述 */}
            {link.description && (
              <p className="text-sm text-gray-500 mt-3 text-center leading-relaxed">{link.description}</p>
            )}
          </div>

          {/* 过期/即将过期警告 */}
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

          {/* 链接地址 */}
          <div className="mb-3">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">链接地址</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={link.url}
                readOnly
                className="flex-1 bg-gray-50 px-3 py-2.5 rounded-xl border border-gray-200 font-mono text-xs text-gray-600 truncate"
              />
              <button
                onClick={() => handleCopy(link.url, 'url')}
                className="px-3 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl transition-colors flex items-center gap-1.5 text-sm font-medium flex-shrink-0 cursor-pointer"
              >
                {copiedField === 'url' ? (
                  <><Check className="w-3.5 h-3.5" /> 已复制</>
                ) : (
                  <><Copy className="w-3.5 h-3.5" /> 复制</>
                )}
              </button>
            </div>
          </div>

          {/* 提取码 */}
          {link.extract_code && (
            <div className="mb-3">
              <label className="text-xs font-semibold text-amber-500 uppercase tracking-wider mb-1.5 block">提取码</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={link.extract_code}
                  readOnly
                  className="flex-1 bg-amber-50 px-3 py-2.5 rounded-xl border border-amber-100 font-mono text-lg text-center tracking-[0.3em] uppercase font-bold text-amber-700"
                />
                <button
                  onClick={() => handleCopy(link.extract_code!, 'code')}
                  className="px-3 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl transition-colors flex items-center gap-1.5 text-sm font-medium flex-shrink-0 cursor-pointer"
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



          {/* 操作按钮 */}
          <div className="space-y-2.5">
            <button
              onClick={handleVisit}
              disabled={status === 'expired'}
              className={`w-full py-3 rounded-xl font-semibold text-base flex items-center justify-center gap-2 shadow-button transition-all duration-300 cursor-pointer ${
                status === 'expired'
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-brand-600 to-brand-500 text-white hover:shadow-glass active:scale-[0.98]'
              }`}
            >
              <ExternalLink className="w-5 h-5" />
              {status === 'expired' ? '链接已过期' : '立即访问'}
            </button>
            <button
              onClick={handleShare}
              className="w-full py-2.5 bg-brand-50 text-brand-600 rounded-xl font-medium text-sm flex items-center justify-center gap-2 hover:bg-brand-100 transition-all duration-200 cursor-pointer"
            >
              <Share2 className="w-4 h-4" /> 分享
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
