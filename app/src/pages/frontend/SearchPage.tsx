import { useState, useEffect, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { motion, AnimatePresence } from 'framer-motion'
import {
  Search as SearchIcon,
  History,
  X,
  TrendingUp,
  FolderOpen,
  ArrowLeft,
  ChevronRight,
  Check,
  Download,
  Share2,
  SlidersHorizontal,
} from 'lucide-react'
import { useDataStore, type LinkItem } from '@/store/useDataStore'
import { checkLinkStatus, copyToClipboard as copyUtil } from '@/lib/utils'
import { LinkIcon } from '@/components/LinkIcon'
import LinkDetailModal from '@/components/LinkDetailModal'
import toast from 'react-hot-toast'

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { links, categories, subCategories, incrementClicks } = useDataStore()
  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [results, setResults] = useState<LinkItem[]>([])
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'relevance' | 'recent' | 'popular'>('relevance')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedLink, setSelectedLink] = useState<LinkItem | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const itemsPerPage = 10

  // 加载搜索历史
  useEffect(() => {
    const history = localStorage.getItem('recentSearches')
    if (history) setRecentSearches(JSON.parse(history))
  }, [])

  // 如果从首页带了搜索词进来，自动搜索
  useEffect(() => {
    const q = searchParams.get('q')
    if (q) {
      setQuery(q)
      setHasSearched(true)
    }
  }, [searchParams])

  // 获取子分类名称
  const getSubCategoryName = (subcategoryId: string) => {
    if (!subcategoryId) return ''
    const sub = subCategories.find(sc => sc.id === subcategoryId)
    return sub ? sub.name : ''
  }

  // 过期过滤
  const isExpired = (link: LinkItem) => checkLinkStatus(link.expires_at || null) === 'expired'

  // 执行搜索（实时搜索，有输入即搜）
  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      setHasSearched(false)
      setCurrentPage(1)
      return
    }

    setHasSearched(true)
    setIsSearching(true)

    const timer = setTimeout(() => {
      let filtered = links
        .filter(link => link.visible !== false && !isExpired(link))
        .filter((link) => {
          const searchLower = query.toLowerCase()
          const subCategoryName = getSubCategoryName(link.subcategory_id || '').toLowerCase()
          const tagMatch = link.tags?.some(tag => tag.name.toLowerCase().includes(searchLower))
          const keywordMatch = link.keywords?.some(kw => kw.toLowerCase().includes(searchLower))
          return (
            link.name.toLowerCase().includes(searchLower) ||
            link.title.toLowerCase().includes(searchLower) ||
            link.description.toLowerCase().includes(searchLower) ||
            (link.category_id && categories.find(c => c.id === link.category_id)?.name.toLowerCase().includes(searchLower)) ||
            subCategoryName.includes(searchLower) ||
            tagMatch ||
            keywordMatch
          )
        })

      if (filterCategory !== 'all') {
        filtered = filtered.filter(link => link.category_id === filterCategory)
      }

      if (sortBy === 'popular') {
        filtered.sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0) || b.click_count - a.click_count)
      } else if (sortBy === 'recent') {
        filtered.sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      } else {
        filtered.sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0) || a.sort_order - b.sort_order || b.click_count - a.click_count)
      }

      setResults(filtered)
      setCurrentPage(1)
      setIsSearching(false)
    }, 300)

    return () => clearTimeout(timer)
  }, [query, links, categories, subCategories, sortBy, filterCategory])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      setHasSearched(true)
      const newHistory = [query, ...recentSearches.filter((s) => s !== query)].slice(0, 10)
      setRecentSearches(newHistory)
      localStorage.setItem('recentSearches', JSON.stringify(newHistory))
      setSearchParams({ q: query })
    }
  }

  const handleRecentSearch = (term: string) => {
    setQuery(term)
    setHasSearched(true)
    const newHistory = [term, ...recentSearches.filter((s) => s !== term)].slice(0, 10)
    setRecentSearches(newHistory)
    localStorage.setItem('recentSearches', JSON.stringify(newHistory))
    setSearchParams({ q: term })
  }

  const handleClearHistory = () => {
    setRecentSearches([])
    localStorage.removeItem('recentSearches')
  }

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

  // 键盘快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault()
        const input = document.querySelector<HTMLInputElement>('input[type="text"]')
        input?.focus()
      }
      if (e.key === 'Escape' && document.activeElement?.tagName === 'INPUT') {
        setQuery('')
        ;(document.activeElement as HTMLInputElement)?.blur()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // 动态热门搜索：取点击量最高的5个资源的名称
  const hotSearches = useMemo(() => {
    return links
      .filter(l => l.visible !== false && !isExpired(l))
      .sort((a, b) => b.click_count - a.click_count)
      .slice(0, 6)
      .map(l => l.name.length > 10 ? l.name.slice(0, 10) + '...' : l.name)
  }, [links])

  const getLinkIcon = (link: LinkItem) => {
    if (!link.icon) {
      return <LinkIcon link={link} size="md" />
    }
    return (
      <div className="relative w-12 h-12 flex-shrink-0">
        <img
          src={link.icon}
          alt={link.name}
          className="w-12 h-12 rounded-xl object-cover absolute inset-0"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none'
          }}
        />
        <div className="absolute inset-0">
          <LinkIcon link={link} size="md" />
        </div>
      </div>
    )
  }

  // 分页
  const totalPages = Math.ceil(results.length / itemsPerPage)
  const paginatedResults = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return results.slice(start, start + itemsPerPage)
  }, [results, currentPage])

  // 切换分类时重置页码
  useEffect(() => { setCurrentPage(1) }, [filterCategory])

  // 分类统计
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    results.forEach(link => {
      if (link.category_id) {
        counts[link.category_id] = (counts[link.category_id] || 0) + 1
      }
    })
    return counts
  }, [results])

  return (
    <div className="min-h-screen gradient-bg container mx-auto px-4 py-8 max-w-5xl">
      {/* 面包屑导航 */}
      <motion.nav
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-2 text-sm text-gray-500 mb-6"
      >
        <Link to="/" className="hover:text-brand-600 transition-colors inline-flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" /> 首页
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-gray-700 font-medium">搜索</span>
        {query && (
          <>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-brand-600 font-medium truncate max-w-[120px] sm:max-w-[200px]">{query}</span>
          </>
        )}
      </motion.nav>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <form onSubmit={handleSearch} className="relative">
          <div className="absolute -inset-1 bg-gradient-to-r from-brand-400 via-brand-500 to-violet-500 rounded-2xl opacity-10 blur-md group-focus-within:opacity-25 transition-all duration-500" />
          <div className="relative">
            <SearchIcon className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-500 z-10 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索资源名称、别名、分类、标签..."
              className="w-full pl-14 pr-14 py-4 sm:py-5 glass rounded-2xl text-base sm:text-lg focus:outline-none focus:ring-2 focus:ring-brand-400/30 transition-all duration-200 shadow-glass-sm"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-20 top-1/2 -translate-y-1/2 p-2 rounded-full hover:bg-brand-50 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4 text-brand-400" />
              </button>
            )}
            <button
              type="submit"
              className="absolute right-3 top-1/2 -translate-y-1/2 px-5 py-2.5 bg-gradient-to-r from-brand-600 to-brand-500 text-white rounded-xl font-semibold text-sm hover:shadow-button transition-all duration-200 cursor-pointer"
            >
              搜索
            </button>
          </div>
        </form>
      </motion.div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* 移动端筛选按钮 */}
        {(hasSearched && results.length > 0) && (
          <div className="lg:hidden">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 px-4 py-2.5 glass rounded-xl text-sm font-medium text-brand-600 cursor-pointer hover:shadow-sm transition-all"
            >
              <SlidersHorizontal className="w-4 h-4" />
              筛选与排序
              {(recentSearches.length > 0 || hotSearches.length > 0) && (
                <span className="text-xs text-gray-400">（{filterCategory !== 'all' ? '已筛选' : `${results.length}条结果`}）</span>
              )}
            </button>
          </div>
        )}

        {/* 侧边栏：移动端可折叠 */}
        <motion.aside
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className={`lg:w-64 flex-shrink-0 ${showFilters ? 'block' : 'hidden'} lg:block`}
        >
          {/* 移动端关闭按钮 */}
          <div className="flex items-center justify-between mb-3 lg:hidden">
            <span className="text-sm font-semibold text-gray-700">筛选与排序</span>
            <button
              onClick={() => setShowFilters(false)}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          {recentSearches.length > 0 && (
            <div className="glass rounded-2xl p-5 mb-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-800 flex items-center gap-2 text-sm">
                  <History className="w-4 h-4 text-gray-400" />
                  搜索历史
                </h3>
                <button
                  onClick={handleClearHistory}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                >
                  清空
                </button>
              </div>
              <div className="space-y-1.5">
                {recentSearches.map((term, index) => (
                  <button
                    key={index}
                    onClick={() => handleRecentSearch(term)}
                    className="block w-full text-left px-3 py-2.5 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors text-sm cursor-pointer"
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="glass rounded-2xl p-5 mb-4">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2 mb-4 text-sm">
              <TrendingUp className="w-4 h-4 text-amber-400" />
              热门搜索
            </h3>
            <div className="flex flex-wrap gap-2">
              {hotSearches.map((term, index) => (
                <button
                  key={index}
                  onClick={() => handleRecentSearch(term)}
                  className="px-3 py-2 bg-brand-50 hover:bg-brand-100 text-brand-600 hover:text-brand-700 rounded-full text-xs font-medium transition-colors cursor-pointer"
                >
                  {term}
                </button>
              ))}
            </div>
          </div>

          {/* 分类筛选 */}
          {hasSearched && results.length > 0 && (
            <div className="glass rounded-2xl p-5">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2 mb-4 text-sm">
                <FolderOpen className="w-4 h-4 text-gray-400" />
                分类筛选
              </h3>
              <div className="space-y-1">
                <button
                  onClick={() => setFilterCategory('all')}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all duration-200 cursor-pointer ${
                    filterCategory === 'all'
                      ? 'bg-brand-50 text-brand-600 font-semibold'
                      : 'text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  全部 ({results.length})
                </button>
                {categories.filter(c => categoryCounts[c.id]).map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setFilterCategory(cat.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all duration-200 cursor-pointer ${
                      filterCategory === cat.id
                        ? 'bg-brand-50 text-brand-600 font-semibold'
                        : 'text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    {cat.name} ({categoryCounts[cat.id]})
                  </button>
                ))}
              </div>
            </div>
          )}
        </motion.aside>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="flex-1"
        >
          {/* 结果统计 + 排序 */}
          {!isSearching && hasSearched && results.length > 0 && (
            <div className="flex items-center justify-between mb-5">
              <div className="text-gray-500 text-sm">
                {query ? (
                  <span>找到 <strong className="text-brand-600">{results.length}</strong> 个与「{query}」相关的结果</span>
                ) : (
                  <span>共 <strong className="text-brand-600">{results.length}</strong> 个资源</span>
                )}
              </div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'relevance' | 'recent' | 'popular')}
                className="px-3 py-2 glass rounded-xl text-sm text-brand-600 font-medium focus:outline-none cursor-pointer"
              >
                <option value="relevance">默认排序</option>
                <option value="recent">最新优先</option>
                <option value="popular">热门优先</option>
              </select>
            </div>
          )}

          <AnimatePresence mode="wait">
            {isSearching ? (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="glass rounded-xl p-4">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 skeleton rounded-xl" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 skeleton rounded w-3/4" />
                        <div className="h-3 skeleton rounded w-1/2" />
                      </div>
                    </div>
                  </div>
                ))}
              </motion.div>
            ) : !hasSearched ? (
              <motion.div key="idle" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center py-16 glass rounded-2xl">
                <SearchIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 text-base font-medium">输入关键词开始搜索</p>
                <p className="text-gray-400 text-sm mt-1">支持搜索资源名称、别名、分类、标签</p>
              </motion.div>
            ) : results.length === 0 ? (
              <motion.div key="empty" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center py-16 glass rounded-2xl">
                <SearchIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 text-base font-medium">没有找到相关资源</p>
                <p className="text-gray-400 text-sm mt-1">尝试使用其他关键词搜索</p>
              </motion.div>
            ) : (
              <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
                {paginatedResults.map((link, index) => (
                  <motion.div
                    key={link.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.04 }}
                    className="flex items-center gap-4 p-4 glass rounded-xl card-hover group cursor-pointer"
                    onClick={() => setSelectedLink(link)}
                  >
                    {getLinkIcon(link)}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-800 group-hover:text-brand-600 transition-colors truncate text-sm">
                        {link.name}
                      </h3>
                      <p className="text-xs text-gray-500 truncate mt-0.5">{link.description}</p>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                        <span className="px-2 py-0.5 bg-brand-50 rounded-full text-[10px] font-medium text-brand-500">
                          {categories.find(c => c.id === link.category_id)?.name || '未分类'}
                        </span>
                        {link.subcategory_id && (
                          <span className="px-2 py-0.5 bg-violet-50 text-violet-500 rounded-full text-[10px] font-medium">
                            {getSubCategoryName(link.subcategory_id)}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* 快速操作按钮 */}
                    <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
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
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* 分页控件 */}
          {totalPages > 1 && hasSearched && results.length > 0 && !isSearching && (
            <div className="flex items-center justify-center gap-2 mt-6">
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
        </motion.div>
      </div>

      {/* 返回首页按钮 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="mt-10 text-center"
      >
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-brand-500 hover:text-brand-600 font-medium transition-colors px-4 py-2 rounded-xl hover:bg-brand-50"
        >
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



