import { useParams, Link } from 'react-router-dom'
import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Grid3X3,
  List,
  Search,
  Clock,
  Pin,
  Filter,
  ChevronRight,
  ArrowLeft,
  FolderOpen,
  Check,
  Download,
  Share2,
} from 'lucide-react'
import { useDataStore, type LinkItem } from '@/store/useDataStore'
import { LinkIcon } from '@/components/LinkIcon'
import LinkDetailModal from '@/components/LinkDetailModal'
import { getDaysRemaining, checkLinkStatus, copyToClipboard as copyUtil } from '@/lib/utils'
import toast from 'react-hot-toast'

export default function CategoryPage() {
  const { id } = useParams<{ id: string }>()
  const { links, categories, incrementClicks } = useDataStore()
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [sortBy, setSortBy] = useState<'default' | 'recent' | 'popular'>('default')
  const [searchQuery, setSearchQuery] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedLink, setSelectedLink] = useState<LinkItem | null>(null)
  const itemsPerPage = 12

  const category = categories.find((c) => c.id === id)

  // 键盘快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault()
        const input = document.querySelector<HTMLInputElement>('input[type="text"]')
        input?.focus()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  if (!id || !category) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 text-lg">分类不存在或已被删除</p>
          <Link to="/" className="text-brand-600 hover:underline mt-4 inline-block">返回首页</Link>
        </div>
      </div>
    )
  }

  const isExpiredLink = (link: LinkItem) => checkLinkStatus(link.expires_at || null) === 'expired'

  let filteredLinks = links.filter((l) => l.category_id === id && l.visible !== false && !isExpiredLink(l))

  if (searchQuery) {
    filteredLinks = filteredLinks.filter((l) =>
      l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.keywords?.some(kw => kw.toLowerCase().includes(searchQuery.toLowerCase()))
    )
  }

  if (sortBy === 'popular') {
    filteredLinks = [...filteredLinks].sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0) || b.click_count - a.click_count)
  } else if (sortBy === 'recent') {
    filteredLinks = [...filteredLinks].sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  } else {
    filteredLinks = [...filteredLinks].sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0) || a.sort_order - b.sort_order)
  }

  // 重置分页
  const resetPage = useCallback(() => setCurrentPage(1), [])
  useEffect(() => { resetPage() }, [searchQuery, sortBy, id])

  const totalPages = Math.ceil(filteredLinks.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const sortedLinks = filteredLinks.slice(startIndex, startIndex + itemsPerPage)

  const handleLinkClick = (link: LinkItem) => {
    incrementClicks(link.id)
    window.open(link.url, '_blank', 'noopener,noreferrer')
  }

  // 分享：手机端用系统分享面板，桌面端复制链接
  const shareLink = async (link: LinkItem) => {
    const shareUrl = `${window.location.origin}/s/${link.slug}`
    if (navigator.share) {
      try {
        await navigator.share({
          title: link.name,
          text: `发现优质资源：${link.name}`,
          url: shareUrl,
        })
      } catch {
        // 用户取消
      }
    } else {
      const success = await copyUtil(link.url)
      if (success) {
        setCopiedId(link.id)
        toast.success('链接已复制')
        setTimeout(() => setCopiedId(null), 2000)
      } else {
        toast.error('复制失败')
      }
    }
  }

  const getLinkIcon = (link: LinkItem) => <LinkIcon link={link} size="md" />

  return (
    <div className="min-h-screen gradient-bg container mx-auto px-4 py-8">
      <motion.nav
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-2 text-sm text-gray-500 mb-6"
      >
        <Link to="/" className="hover:text-brand-600 transition-colors">首页</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-gray-700 font-medium">{category.name}</span>
      </motion.nav>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl p-6 sm:p-8 mb-6"
      >
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-brand-50 to-violet-50 flex items-center justify-center shadow-glass-sm">
            <FolderOpen className="w-10 h-10 sm:w-14 sm:h-14 text-brand-500" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">{category.name}</h1>
            <p className="text-gray-500 text-sm">共 {filteredLinks.length} 个资源{totalPages > 1 ? ` · 第 ${currentPage}/${totalPages} 页` : ''}</p>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6"
      >
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="搜索该分类下的资源..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 glass rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/30 transition-all duration-200"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'default' | 'recent' | 'popular')}
            className="px-3 py-2.5 glass rounded-xl text-sm text-brand-600 font-medium focus:outline-none cursor-pointer"
          >
            <option value="default">默认排序</option>
            <option value="recent">最新优先</option>
            <option value="popular">热门优先</option>
          </select>

          <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-0.5 border border-gray-100">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg transition-all duration-200 cursor-pointer ${viewMode === 'grid' ? 'bg-white text-brand-600 shadow-sm' : 'text-gray-400 hover:text-brand-600'}`}
            >
              <Grid3X3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-all duration-200 cursor-pointer ${viewMode === 'list' ? 'bg-white text-brand-600 shadow-sm' : 'text-gray-400 hover:text-brand-600'}`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.div>

      <AnimatePresence mode="wait">
        {sortedLinks.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16 glass rounded-2xl">
            <Filter className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 text-base font-medium">没有找到相关资源</p>
            <p className="text-gray-400 text-sm mt-1">尝试其他关键词或浏览其他分类</p>
          </motion.div>
        ) : viewMode === 'grid' ? (
          <motion.div key="grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
            {sortedLinks.map((link, index) => (
              <motion.div key={link.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }}>
                <div onClick={() => setSelectedLink(link)} className="block glass rounded-xl card-hover overflow-hidden group cursor-pointer relative">
                  <div className="aspect-video bg-gradient-to-br from-brand-50/50 to-brand-100/50 relative flex items-center justify-center">
                    <div className="flex items-center justify-center">{getLinkIcon(link)}</div>
                    {isExpiredLink(link) && (
                      <span className="absolute top-2 right-2 px-2 py-0.5 bg-red-500/80 text-white text-[10px] rounded-full font-medium">已过期</span>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="font-medium text-gray-800 group-hover:text-brand-600 transition-colors line-clamp-2 mb-2 text-sm">{link.name}</h3>
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {getDaysRemaining(link.expires_at) === null ? '永久' : `${getDaysRemaining(link.expires_at)}天`}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mt-2 pt-2 border-t border-gray-50" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleLinkClick(link)
                        }}
                        className="flex-1 py-2 text-xs text-white bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-700 hover:to-brand-600 rounded-lg transition-all duration-200 cursor-pointer flex items-center justify-center gap-1 shadow-sm hover:shadow-md font-medium min-h-[36px]"
                        title="访问下载"
                      >
                        <Download className="w-3 h-3" />
                        访问下载
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          shareLink(link)
                        }}
                        className="py-2 px-3 text-xs text-gray-500 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-all duration-200 cursor-pointer flex items-center gap-1 min-h-[36px]"
                        title="分享链接"
                      >
                        {copiedId === link.id ? <Check className="w-3 h-3 text-emerald-500" /> : <Share2 className="w-3 h-3" />}
                        分享
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
            {sortedLinks.map((link, index) => (
              <motion.div key={link.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.03 }}>
                <div onClick={() => setSelectedLink(link)} className="flex items-center gap-4 p-4 glass rounded-xl card-hover group cursor-pointer">
                  <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {getLinkIcon(link)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-800 group-hover:text-brand-600 transition-colors truncate text-sm">{link.name}</h3>
                    <div className="flex items-center gap-4 mt-1 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {getDaysRemaining(link.expires_at) === null ? '永久有效' : `${getDaysRemaining(link.expires_at)}天后过期`}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.preventDefault()}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleLinkClick(link)
                      }}
                      className="py-2 px-3 text-xs text-white bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-700 hover:to-brand-600 rounded-lg transition-all duration-200 cursor-pointer flex items-center gap-1 shadow-sm font-medium min-h-[36px]"
                      title="访问下载"
                    >
                      <Download className="w-3 h-3" />
                      访问下载
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        shareLink(link)
                      }}
                      className="py-2 px-3 text-xs text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-all duration-200 cursor-pointer flex items-center gap-1 min-h-[36px]"
                      title="分享链接"
                    >
                      {copiedId === link.id ? <Check className="w-3 h-3 text-emerald-500" /> : <Share2 className="w-3 h-3" />}
                      分享
                    </button>
                    <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-brand-500 transition-colors" />
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 分页控件 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-4 py-2 rounded-xl text-sm border border-gray-200 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 font-medium text-gray-600 cursor-pointer"
          >
            上一页
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter(page => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 2)
            .map((page, index, array) => (
              <span key={page}>
                {index > 0 && array[index - 1] !== page - 1 && (
                  <span className="px-1 text-gray-400">...</span>
                )}
                <button
                  onClick={() => setCurrentPage(page)}
                  className={`w-9 h-9 rounded-xl text-sm transition-all duration-200 font-medium cursor-pointer ${
                    currentPage === page
                      ? 'bg-brand-600 text-white shadow-button'
                      : 'border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-600'
                  }`}
                >
                  {page}
                </button>
              </span>
            ))
          }
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-4 py-2 rounded-xl text-sm border border-gray-200 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 font-medium text-gray-600 cursor-pointer"
          >
            下一页
          </button>
        </div>
      )}

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="mt-10 text-center">
        <Link to="/" className="inline-flex items-center gap-2 text-brand-500 hover:text-brand-600 font-medium transition-colors">
          <ArrowLeft className="w-4 h-4" /> 返回首页
        </Link>
      </motion.div>

      {/* 资源详情弹窗 */}
      {selectedLink && (
        <LinkDetailModal link={selectedLink} onClose={() => setSelectedLink(null)} />
      )}

    </div>
  )
}
