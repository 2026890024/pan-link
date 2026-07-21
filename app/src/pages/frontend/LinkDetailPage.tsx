import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Copy,
  Check,
  Clock,
  Share2,
  ArrowLeft,
  ChevronRight,
  ExternalLink,
  Gift,
  AlertTriangle,
  FolderOpen,
  Download,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { useDataStore } from '@/store/useDataStore'
import { getDaysRemaining, copyToClipboard, checkLinkStatus, buildShareText, hexToRgba } from '@/lib/utils'
import toast from 'react-hot-toast'

// 从 localStorage 读取分享链接（与 DataManagementPage 保持一致）
function loadShareLinks(): Array<{ id: string; name: string; slug: string; linkIds: Array<string>; visits: number; createdAt: string }> {
  try {
    const raw = localStorage.getItem('admin_share_links')
    if (raw) {return JSON.parse(raw)}
  } catch { /* ignore */ }
  return []
}

export default function LinkDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const { links, categories, subCategories, incrementClicks } = useDataStore()
  const [copiedField, setCopiedField] = useState<string | null>(null)

  // 检查是否是分享链接 slug
  const shareLinks = loadShareLinks()
  const shareLink = shareLinks.find(s => s.slug === slug)

  const link = !shareLink ? links.find((l) => l.slug === slug) : null
  const category = link ? categories.find((c) => c.id === link.category_id) : null

  useEffect(() => {
    if (shareLink) {
      document.title = `${shareLink.name} - 资源云`
    } else if (link) {
      document.title = `${link.name} - 资源云`
    } else {
      document.title = '链接不存在 - 资源云'
    }
  }, [shareLink, link])

  const subcategory = link?.subcategory_id
    ? subCategories.find(sc => sc.id === link.subcategory_id)
    : null

  // 过滤过期/隐藏资源
  const relatedLinks = link ? links
    .filter((l) =>
      l.category_id === link.category_id &&
      l.id !== link.id &&
      l.visible !== false &&
      checkLinkStatus(l.expires_at || null) !== 'expired'
    )
    .slice(0, 3) : []

  // 动态设置页面标题和 meta description
  useEffect(() => {
    if (link) {
      document.title = `${link.name} - 资源云`
      const meta = document.querySelector('meta[name="description"]')
      if (meta) {
        meta.setAttribute('content', `${link.description}。在资源云发现优质资源，一站式网盘资源聚合管理。`)
      }
    } else if (shareLink) {
      document.title = `${shareLink.name} - 资源云分享合集`
      const meta = document.querySelector('meta[name="description"]')
      if (meta) {
        meta.setAttribute('content', `分享合集：${shareLink.name}，包含多个优质资源。在资源云发现更多资源。`)
      }
    }
  }, [link, shareLink])

  const handleCopy = async (text: string, field: string) => {
    const success = await copyToClipboard(text)
    if (success) {
      setCopiedField(field)
      toast.success('复制成功')
      setTimeout(() => setCopiedField(null), 2000)
    } else {
      toast.error('复制失败')
    }
  }

  const handleVisit = () => {
    if (link) {
      incrementClicks(link.id)
      toast.success('即将跳转到下载页面...')
      window.open(link.url, '_blank', 'noopener,noreferrer')
    }
  }

  const handleShare = async () => {
    if (!link) {return}
    const shareUrl = window.location.href
    const shareText = buildShareText(link.name, shareUrl, link.extract_code || undefined)
    if (navigator.share) {
      try {
        await navigator.share({
          title: link.name,
          text: shareText,
        })
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {return}
        await copyToClipboard(shareText)
        toast.success('分享内容已复制')
      }
    } else {
      await copyToClipboard(shareText)
      toast.success('分享内容已复制')
    }
  }

  // 如果是分享链接，显示分享合集页面
  if (shareLink) {
    const sharedLinks = links.filter(l => (shareLink.linkIds || []).includes(l.id) && l.visible !== false)
    
    return (
      <div className="min-h-screen gradient-bg container mx-auto px-3 sm:px-4 py-4 sm:py-8 max-w-4xl">
        <motion.nav
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-500 mb-4 sm:mb-6"
        >
          <Link to="/" className="hover:text-brand-600 transition-colors inline-flex items-center gap-1">
            <ArrowLeft className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> 首页
          </Link>
          <ChevronRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
          <span className="text-gray-700 font-medium">分享合集</span>
        </motion.nav>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-2xl p-4 sm:p-8 mb-4 sm:mb-6"
        >
          <div className="flex items-center gap-3 sm:gap-4 mb-2">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-brand-50 to-violet-50 flex items-center justify-center flex-shrink-0">
              <Share2 className="w-6 h-6 sm:w-7 sm:h-7 text-brand-500" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{shareLink.name}</h1>
              <p className="text-xs sm:text-sm text-gray-500 mt-0.5 sm:mt-1">{sharedLinks.length} 个资源</p>
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="space-y-2 sm:space-y-3">
          {sharedLinks.length === 0 ? (
            <div className="text-center py-12 glass rounded-2xl">
              <FolderOpen className="w-10 h-10 sm:w-12 sm:h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500 text-sm sm:text-base">该合集暂无可用的资源链接</p>
            </div>
          ) : (
            sharedLinks.map((sharedLinkItem) => (
              <div
                key={sharedLinkItem.id}
                className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 glass rounded-xl hover:shadow-md transition-all"
              >
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
                  {sharedLinkItem.icon ? (
                    <img src={sharedLinkItem.icon} alt="" className="w-7 h-7 sm:w-8 sm:h-8 object-contain" loading="lazy" decoding="async" />
                  ) : (
                    <Gift className="w-4 h-4 sm:w-5 sm:h-5 text-brand-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-gray-800 truncate text-xs sm:text-sm">{sharedLinkItem.name}</h3>
                  <p className="text-[10px] sm:text-xs text-gray-500 truncate mt-0.5">{sharedLinkItem.description || sharedLinkItem.url}</p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    incrementClicks(sharedLinkItem.id)
                    window.open(sharedLinkItem.url, '_blank', 'noopener,noreferrer')
                  }}
                  className="px-3 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs text-white bg-gradient-to-r from-brand-600 to-brand-500 rounded-lg hover:from-brand-700 hover:to-brand-600 transition-all cursor-pointer flex items-center gap-1 flex-shrink-0 touch-manipulation"
                >
                  <Download className="w-3 h-3" />
                  下载
                </button>
              </div>
            ))
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="mt-8 sm:mt-10 text-center">
          <Link to="/" className="inline-flex items-center gap-2 text-brand-500 hover:text-brand-600 font-medium text-sm transition-colors">
            <ArrowLeft className="w-4 h-4" /> 返回首页
          </Link>
        </motion.div>
      </div>
    )
  }

  if (!link) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 text-lg">链接不存在或已删除</p>
          <Link to="/" className="text-brand-600 hover:underline mt-4 inline-block">返回首页</Link>
        </div>
      </div>
    )
  }

  const status = checkLinkStatus(link.expires_at || null)
  const daysRemaining = getDaysRemaining(link.expires_at || null)

  const getLinkIcon = () => {
    if (link.icon) {
      return (
        <img src={link.icon} alt={link.name} className="w-20 h-20 object-contain rounded-xl" loading="lazy" decoding="async" />
      )
    }
    return (
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center">
        <Gift className="w-10 h-10 text-indigo-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FAFBFC] container mx-auto px-3 sm:px-4 py-4 sm:py-8 max-w-4xl">
      <motion.nav
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-500 mb-4 sm:mb-6 flex-wrap"
      >
        <Link to="/" className="hover:text-gray-900 transition-colors">首页</Link>
        <ChevronRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
        {category && (
          <Link to={`/category/${category.id}`} className="hover:text-gray-900 transition-colors truncate">
            {category.name}
          </Link>
        )}
        {subcategory && (
          <>
            <ChevronRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
            <span className="text-gray-500 font-medium truncate">{subcategory.name}</span>
          </>
        )}
        <ChevronRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
        <span className="text-gray-700 font-medium truncate">{link.name}</span>
      </motion.nav>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm"
      >
        <div className={`h-1 bg-gradient-to-r ${status === 'expired' ? 'from-red-500 to-red-400' : 'from-gray-700 via-gray-500 to-gray-400'}`} />
        <div className={`h-1.5 bg-gradient-to-r ${status === 'expired' ? 'from-red-500 to-red-400' : 'from-brand-600 via-brand-500 to-violet-500'}`} />

        <div className="p-4 sm:p-8">
          <div className="text-center mb-6 sm:mb-8">
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: 'spring' }}
              className="w-20 h-20 sm:w-28 sm:h-28 mx-auto mb-4 sm:mb-6 rounded-2xl bg-gradient-to-br from-brand-50 to-violet-50 flex items-center justify-center shadow-glass"
            >
              {getLinkIcon()}
            </motion.div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-2 sm:mb-3">{link.name}</h1>

            {subcategory && (
              <span className="px-2.5 sm:px-3 py-0.5 sm:py-1 bg-brand-50 text-brand-600 rounded-full text-xs sm:text-sm font-medium">{subcategory.name}</span>
            )}

            {link.tags && link.tags.length > 0 && (
              <div className="flex items-center justify-center gap-1.5 sm:gap-2 flex-wrap mt-2 sm:mt-3">
                {link.tags.map((tag) => (
                  <span key={tag.id} className="px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs sm:text-sm font-medium" style={{ backgroundColor: hexToRgba(tag.color, 0.12), color: tag.color }}>
                    {tag.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 已过期警告 */}
          {status === 'expired' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mb-6 p-4 bg-red-50/80 border border-red-200 rounded-2xl flex items-center gap-3"
            >
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <span className="text-red-700 text-sm font-medium">
                该资源链接已过期，可能无法正常访问
              </span>
            </motion.div>
          )}

          {/* 即将过期警告 */}
          {status === 'expiring_soon' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mb-6 p-4 bg-amber-50/80 border border-amber-100 rounded-2xl flex items-center gap-3"
            >
              <Clock className="w-5 h-5 text-amber-500 flex-shrink-0" />
              <span className="text-amber-700 text-sm">
                即将过期：剩余 <strong className="text-amber-800">{daysRemaining}</strong> 天
              </span>
            </motion.div>
          )}

          <div className="space-y-2.5 sm:space-y-3 mb-5 sm:mb-6">
            <div className="p-3 sm:p-4 bg-brand-50/50 rounded-2xl border border-brand-50">
              <label className="text-[10px] sm:text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 sm:mb-2 block">链接地址</label>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input type="text" value={link.url} readOnly
                  className="flex-1 bg-white px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl border border-gray-200 font-mono text-[11px] sm:text-xs text-gray-700 truncate" />
                <button onClick={() => handleCopy(link.url, 'url')}
                  className="px-4 py-2 sm:py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl transition-colors flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-medium cursor-pointer touch-manipulation">
                  {copiedField === 'url' ? (<><Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> 已复制</>) : (<><Copy className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> 复制</>)}
                </button>
              </div>
            </div>

            {link.extract_code && (
              <div className="p-3 sm:p-4 bg-amber-50/50 rounded-2xl border border-amber-100">
                <label className="text-[10px] sm:text-xs font-semibold text-amber-500 uppercase tracking-wider mb-1.5 sm:mb-2 block">提取码</label>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input type="text" value={link.extract_code} readOnly
                    className="flex-1 bg-white px-4 py-2 sm:py-2.5 rounded-xl border border-amber-100 font-mono text-lg sm:text-xl text-center tracking-[0.3em] uppercase font-bold text-amber-700" />
                  <button onClick={() => handleCopy(link.extract_code ?? '', 'code')}
                    className="px-4 py-2 sm:py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl transition-colors flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-medium cursor-pointer touch-manipulation">
                    {copiedField === 'code' ? (<><Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> 已复制</>) : (<><Copy className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> 一键复制</>)}
                  </button>
                </div>
              </div>
            )}

            <div className="p-3 sm:p-4 bg-brand-50/50 rounded-2xl border border-brand-50">
              <label className="text-[10px] sm:text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 sm:mb-2 block">有效期</label>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1.5 sm:gap-2">
                <span className="text-sm sm:text-base font-semibold text-gray-800">
                  {daysRemaining === null ? (
                    <span className="text-emerald-600 flex items-center gap-1.5 sm:gap-2"><Check className="w-4 h-4 sm:w-5 sm:h-5" /> 永久有效</span>
                  ) : status === 'expired' ? (
                    <span className="text-red-600 flex items-center gap-1.5 sm:gap-2"><AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5" /> 已过期</span>
                  ) : (
                    `剩余 ${daysRemaining} 天`
                  )}
                </span>
                <span className="text-[11px] sm:text-sm text-gray-400">创建于 {new Date(link.created_at).toLocaleDateString('zh-CN')}</span>
              </div>
            </div>
          </div>




          <div className="space-y-2.5 sm:space-y-3">
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleVisit}
              className={`w-full py-3 sm:py-3.5 rounded-2xl font-semibold text-sm sm:text-base flex items-center justify-center gap-2 sm:gap-2.5 shadow-button hover:shadow-glass transition-all duration-300 cursor-pointer touch-manipulation ${
                status === 'expired'
                  ? 'bg-gray-400 text-white cursor-not-allowed'
                  : 'bg-gradient-to-r from-brand-600 to-brand-500 text-white'
              }`}
              disabled={status === 'expired'}
            >
              <ExternalLink className="w-4 h-4 sm:w-5 sm:h-5" />
              {status === 'expired' ? '链接已过期' : '立即下载'}
            </motion.button>
            <button onClick={handleShare}
              className="w-full py-3 bg-brand-50 text-brand-600 rounded-xl font-medium text-xs sm:text-sm flex items-center justify-center gap-2 hover:bg-brand-100 transition-all duration-200 border border-transparent cursor-pointer touch-manipulation">
              <Share2 className="w-4 h-4" /> 分享
            </button>
          </div>
        </div>
      </motion.div>

      {relatedLinks.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-6 sm:mt-8"
        >
          <h2 className="text-base sm:text-lg font-bold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2">
            <Gift className="w-4 h-4 sm:w-5 sm:h-5 text-brand-500" /> 相关推荐
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
            {relatedLinks.map((relatedLink) => (
              <Link key={relatedLink.id} to={`/s/${relatedLink.slug}`} className="block p-3 sm:p-4 glass rounded-xl card-hover group cursor-pointer touch-manipulation">
                <div className="flex items-center gap-2.5 sm:gap-3 mb-1.5 sm:mb-2">
                  {relatedLink.icon ? (
                    <img src={relatedLink.icon} alt={relatedLink.name} className="w-7 h-7 sm:w-8 sm:h-8 object-contain rounded-lg" loading="lazy" decoding="async" />
                  ) : (
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-brand-100 flex items-center justify-center">
                      <Gift className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-400" />
                    </div>
                  )}
                  <h3 className="font-medium text-gray-800 group-hover:text-brand-600 transition-colors truncate flex-1 text-xs sm:text-sm">{relatedLink.name}</h3>
                </div>
              </Link>
            ))}
          </div>
        </motion.section>
      )}

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="mt-8 sm:mt-10 text-center">
        <Link to={category ? `/category/${category.id}` : '/'} className="inline-flex items-center gap-2 text-brand-500 hover:text-brand-600 font-medium text-sm transition-colors">
          <ArrowLeft className="w-4 h-4" /> 返回{category?.name || '首页'}
        </Link>
      </motion.div>
    </div>
  )
}
