import { useParams, Link } from 'react-router-dom'
import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Grid3X3,
  List,
  Search,
  Clock,
  Filter,
  ChevronRight,
  FolderOpen,
  Check,
  Download,
  Share2,
  ArrowUp,
} from 'lucide-react'
import { useDataStore, type LinkItem } from '@/store/useDataStore'
import { LinkIcon } from '@/components/LinkIcon'
const LinkDetailModal = lazy(() => import('@/components/LinkDetailModal'))
import SiteFooter from '@/components/SiteFooter'
import { useBackToTop } from '@/hooks/useBackToTop'
import { useLinkActions } from '@/hooks/useLinkActions'
import { getDaysRemaining } from '@/lib/utils'

export default function CategoryPage() {
  const { id } = useParams<{ id: string }>()
  const { links, categories } = useDataStore()
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [sortBy, setSortBy] = useState<'default' | 'recent' | 'popular'>('default')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const { showBackToTop, scrollToTop } = useBackToTop()
  const { isExpired: isExpiredLink, shareLink, handleLinkClick } = useLinkActions({
    onCopied: setCopiedId,
    onCopyClear: () => setCopiedId(null),
  })

  const category = categories.find(c => c.id === id)

  useEffect(() => {
    document.title = category ? `${category.name} - 资源云` : '分类 - 资源云'
  }, [category])

  const [currentPage, setCurrentPage] = useState(1)
  const [selectedLink, setSelectedLink] = useState<LinkItem | null>(null)
  const itemsPerPage = 12

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

  // 搜索防抖 200ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 200)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const filteredLinks = useMemo(() => {
    let result = links.filter((l) => l.category_id === id && l.visible !== false && !isExpiredLink(l))

    if (debouncedQuery) {
      result = result.filter((l) =>
        l.name.toLowerCase().includes(debouncedQuery.toLowerCase()) ||
        l.description.toLowerCase().includes(debouncedQuery.toLowerCase()) ||
        l.keywords?.some(kw => kw.toLowerCase().includes(debouncedQuery.toLowerCase()))
      )
    }

    switch (sortBy) {
      case 'popular':
        return [...result].sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0) || b.click_count - a.click_count)
      case 'recent':
        return [...result].sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      default:
        return [...result].sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0) || a.sort_order - b.sort_order)
    }
  }, [links, id, debouncedQuery, sortBy])

  // 重置分页
  const resetPage = useCallback(() => setCurrentPage(1), [])
  useEffect(() => { resetPage() }, [debouncedQuery, sortBy, id])

  const totalPages = Math.ceil(filteredLinks.length / itemsPerPage)
  const sortedLinks = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    return filteredLinks.slice(startIndex, startIndex + itemsPerPage)
  }, [filteredLinks, currentPage])

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

  const getLinkIcon = (link: LinkItem) => <LinkIcon link={link} size={link.icon_size || 'md'} />

  return (
    <div className="min-h-screen bg-[#FAFBFC] container mx-auto px-3 sm:px-4 py-4 sm:py-8"
      style={{
        paddingLeft: 'max(0.75rem, env(safe-area-inset-left))',
        paddingRight: 'max(0.75rem, env(safe-area-inset-right))',
      }}>
      <motion.nav
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-500 mb-4 sm:mb-6 flex-wrap"
      >
        <Link to="/" className="hover:text-gray-900 transition-colors">首页</Link>
        <ChevronRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
        <span className="text-gray-700 font-medium truncate">{category.name}</span>
      </motion.nav>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-8 mb-4 sm:mb-6 shadow-sm"
      >
        <div className="flex items-center gap-4 sm:gap-5">
          <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-2xl bg-gray-50 flex items-center justify-center flex-shrink-0">
            <FolderOpen className="w-9 h-9 sm:w-14 sm:h-14 text-gray-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-3xl font-bold text-gray-900 mb-0.5 sm:mb-1">{category.name}</h1>
            <p className="text-gray-500 text-xs sm:text-sm">共 {filteredLinks.length} 个资源{totalPages > 1 ? ` · 第 ${currentPage}/${totalPages} 页` : ''}</p>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3 mb-4 sm:mb-6"
      >
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="搜索该分类下的资源..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-100 rounded-xl text-base sm:text-sm focus:outline-none focus:border-gray-300 focus:shadow-sm transition-all duration-200"
            aria-label="搜索该分类下的资源"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'default' | 'recent' | 'popular')}
            className="flex-1 sm:flex-none px-3 py-2.5 bg-white border border-gray-100 rounded-xl text-sm text-gray-600 font-medium focus:outline-none cursor-pointer select-arrow"
          >
            <option value="default">默认排序</option>
            <option value="recent">最新优先</option>
            <option value="popular">热门优先</option>
          </select>

          <div className="flex items-center bg-gray-50 rounded-xl p-1 gap-0.5 flex-shrink-0">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg transition-all duration-150 cursor-pointer touch-manipulation ${viewMode === 'grid' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
              aria-label="网格视图"
            >
              <Grid3X3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-all duration-150 cursor-pointer touch-manipulation ${viewMode === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
              aria-label="列表视图"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.div>

      <AnimatePresence mode="wait">
        {sortedLinks.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-12 sm:py-16 bg-white rounded-2xl border border-gray-100 shadow-sm">
            <Filter className="w-10 h-10 sm:w-12 sm:h-12 text-gray-300 mx-auto mb-3 sm:mb-4" />
            <p className="text-gray-500 text-sm sm:text-base font-medium">没有找到相关资源</p>
            <p className="text-gray-400 text-xs sm:text-sm mt-1">尝试其他关键词或浏览其他分类</p>
          </motion.div>
        ) : viewMode === 'grid' ? (
          <motion.div key="grid"
            initial="hidden" animate="visible" exit="hidden"
            variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.04 } } }}
            className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-4">
            {sortedLinks.map((link) => (
              <motion.div key={link.id} variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}>
                <div
                  role="button" tabIndex={0} aria-label={`查看 ${link.name} 详情`}
                  onClick={() => setSelectedLink(link)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedLink(link) } }}
                  className="block bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg hover:shadow-gray-900/5 hover:border-gray-200 transition-[transform,box-shadow,border-color] duration-200 overflow-hidden group cursor-pointer relative touch-manipulation">
                    <div className="bg-gradient-to-br from-brand-50 to-violet-50 relative flex items-center justify-center py-6">
                      <div className="flex items-center justify-center">{getLinkIcon(link)}</div>
                      {link.is_pinned && (
                        <span className="absolute top-2 left-2 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] rounded-md font-medium">置顶</span>
                      )}
                      {isExpiredLink(link) && (
                        <span className="absolute top-2 right-2 px-2 py-0.5 bg-red-500/90 text-white text-[10px] rounded-full font-medium">已过期</span>
                      )}
                    </div>
                  <div className="p-3 sm:p-4">
                    <h3 className="font-medium text-gray-800 group-hover:text-gray-900 transition-colors line-clamp-2 mb-2 text-xs sm:text-sm">{link.name}</h3>
                    <div className="flex items-center justify-between text-[10px] sm:text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {getDaysRemaining(link.expires_at) === null ? '永久' : `${getDaysRemaining(link.expires_at)}天`}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-gray-50" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleLinkClick(link)
                        }}
                        className="flex-1 py-1.5 sm:py-2 text-[10px] sm:text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg transition-all duration-150 cursor-pointer flex items-center justify-center gap-1 min-h-[44px] sm:min-h-[36px] touch-manipulation"
                        title="下载"
                      >
                        <Download className="w-3 h-3" />
                        下载
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          shareLink(link)
                        }}
                        className="py-1.5 sm:py-2 px-2 sm:px-3 text-[10px] sm:text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-all duration-150 cursor-pointer flex items-center gap-1 min-h-[44px] sm:min-h-[36px] touch-manipulation"
                        title="分享链接"
                      >
                        {copiedId === link.id ? <Check className="w-3 h-3 text-emerald-500" /> : <Share2 className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <motion.div key="list"
            initial="hidden" animate="visible" exit="hidden"
            variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.03 } } }}
            className="space-y-1.5 sm:space-y-2">
            {sortedLinks.map((link) => (
              <motion.div key={link.id} variants={{ hidden: { opacity: 0, x: -16 }, visible: { opacity: 1, x: 0 } }}>
                <div
                  role="button" tabIndex={0} aria-label={`查看 ${link.name} 详情`}
                  onClick={() => setSelectedLink(link)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedLink(link) } }}
                  className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-[transform,box-shadow,border-color] duration-150 group cursor-pointer touch-manipulation">
                  <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {getLinkIcon(link)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-800 group-hover:text-gray-900 transition-colors truncate text-xs sm:text-sm">{link.name}</h3>
                    <div className="flex items-center gap-3 sm:gap-4 mt-0.5 sm:mt-1 text-[10px] sm:text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {getDaysRemaining(link.expires_at) === null ? '永久有效' : `${getDaysRemaining(link.expires_at)}天后过期`}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0" onClick={(e) => e.preventDefault()}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleLinkClick(link)
                      }}
                      className="py-1.5 sm:py-2 px-2.5 sm:px-3 text-[10px] sm:text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg transition-all duration-150 cursor-pointer flex items-center gap-1 min-h-[44px] sm:min-h-[36px] touch-manipulation"
                      title="下载"
                    >
                      <Download className="w-3 h-3" />
                      下载
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        shareLink(link)
                      }}
                      className="py-1.5 sm:py-2 px-2 text-[10px] sm:text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-all duration-150 cursor-pointer flex items-center gap-1 min-h-[44px] sm:min-h-[36px] touch-manipulation"
                      title="分享链接"
                    >
                      {copiedId === link.id ? <Check className="w-3 h-3 text-emerald-500" /> : <Share2 className="w-3 h-3" />}
                    </button>
                    <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-300 group-hover:text-gray-500 transition-colors hidden sm:block" />
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 分页控件 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1.5 sm:gap-2 mt-6 sm:mt-8">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm border border-gray-200 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 font-medium text-gray-600 cursor-pointer touch-manipulation min-h-[44px] sm:min-h-[36px]"
          >
            上一页
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter(page => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1)
            .map((page, index, array) => (
              <span key={page}>
                {index > 0 && array[index - 1] !== page - 1 && (
                  <span className="px-0.5 text-gray-400 text-xs">...</span>
                )}
                <button
                  onClick={() => setCurrentPage(page)}
                  className={`w-11 h-11 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl text-xs sm:text-sm transition-all duration-200 font-medium cursor-pointer touch-manipulation ${
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
            className="px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm border border-gray-200 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 font-medium text-gray-600 cursor-pointer touch-manipulation min-h-[44px] sm:min-h-[36px]"
          >
            下一页
          </button>
        </div>
      )}

      <SiteFooter />

      {/* 资源详情弹窗 - 懒加载 */}
      {selectedLink && (
        <Suspense fallback={null}>
          <LinkDetailModal link={selectedLink} onClose={() => setSelectedLink(null)} />
        </Suspense>
      )}

      {/* 回到顶部按钮 */}
      {showBackToTop && (
        <button
          onClick={scrollToTop}
          className="fixed right-4 bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))] z-30 w-11 h-11 bg-white border border-gray-200 rounded-2xl shadow-glass flex items-center justify-center hover:shadow-glass-lg hover:border-brand-200 hover:text-brand-600 active:scale-95 transition-all duration-300 cursor-pointer"
          aria-label="回到顶部"
        >
          <ArrowUp className="w-5 h-5" />
        </button>
      )}

    </div>
  )
}
