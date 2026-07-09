import { useState, useEffect, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { motion, AnimatePresence } from 'framer-motion'
import {
  Search as SearchIcon,
  X,
  Check,
  Download,
  Share2,
  ArrowLeft,
  LayoutGrid,
  Menu,
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
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'relevance' | 'recent' | 'popular'>('relevance')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedLink, setSelectedLink] = useState<LinkItem | null>(null)
  const itemsPerPage = 10

  // 如果从首页带了搜索词进来，自动搜索
  useEffect(() => {
    const q = searchParams.get('q')
    if (q) {
      setQuery(q)
      setHasSearched(true)
    }
  }, [searchParams])

  const getSubCategoryName = (subcategoryId: string) => {
    if (!subcategoryId) return ''
    const sub = subCategories.find(sc => sc.id === subcategoryId)
    return sub ? sub.name : ''
  }

  const isExpired = (link: LinkItem) => checkLinkStatus(link.expires_at || null) === 'expired'

  // 执行搜索
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
      setSearchParams({ q: query })
    }
  }

  const handleLinkClick = (link: LinkItem) => {
    incrementClicks(link.id)
    window.open(link.url, '_blank', 'noopener,noreferrer')
  }

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
        toast.success('已添加到剪贴板', {
          style: {
            borderRadius: '12px',
            background: '#1F2937',
            color: '#F9FAFB',
            fontSize: '14px',
          },
        })
        setTimeout(() => setCopiedId(null), 2000)
      } else {
        toast.error('复制失败')
      }
    }
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
    <div className="min-h-screen bg-[#F5F7FA] pb-48">
      {/* 顶部居中标题 */}
      <div className="pt-6 pb-4">
        <Link to="/" className="flex items-center justify-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center shadow-md">
            <LayoutGrid className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-xl text-gray-800">资源云</span>
        </Link>
      </div>

      <div className="max-w-3xl mx-auto px-4">
        {/* 搜索框 */}
        <motion.form
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleSearch}
          className="relative"
        >
          <div className="flex items-center bg-white rounded-2xl shadow-sm border border-gray-200/60 px-4 py-3 focus-within:ring-2 focus-within:ring-brand-400/20 focus-within:border-brand-400/40 transition-all">
            <SearchIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索您需要的资源..."
              className="flex-1 ml-3 bg-transparent outline-none text-base text-gray-800 placeholder:text-gray-400 min-w-0"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="p-1.5 rounded-full hover:bg-gray-100 transition-colors mr-3 flex-shrink-0"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            )}
            <button
              type="submit"
              className="px-5 py-2.5 bg-brand-500 text-white rounded-full font-medium text-sm hover:bg-brand-600 transition-all duration-200 flex-shrink-0 shadow-sm"
            >
              搜索
            </button>
          </div>
        </motion.form>

        {/* 结果统计 + 排序 */}
        <AnimatePresence>
          {!isSearching && hasSearched && results.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between mt-5 mb-3 gap-2"
            >
              <div className="text-sm text-gray-500">
                {query ? (
                  <span>找到 <strong className="text-brand-600">{results.length}</strong> 个与「{query}」相关的结果</span>
                ) : (
                  <span>共 <strong className="text-brand-600">{results.length}</strong> 个资源</span>
                )}
              </div>
              {/* 排序按钮组 */}
              <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                {[
                  { value: 'relevance' as const, label: '默认' },
                  { value: 'recent' as const, label: '最新' },
                  { value: 'popular' as const, label: '热门' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setSortBy(opt.value)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                      sortBy === opt.value
                        ? 'bg-brand-600 text-white shadow-sm'
                        : 'text-gray-500 hover:bg-gray-100'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 桌面端分类标签 */}
        <AnimatePresence>
          {!isSearching && hasSearched && results.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="hidden lg:flex gap-2 overflow-x-auto pb-3 scrollbar-hide mb-1"
            >
              <button
                onClick={() => setFilterCategory('all')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap flex-shrink-0 ${
                  filterCategory === 'all'
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'bg-white text-gray-500 hover:bg-gray-50 border border-gray-200'
                }`}
              >
                全部 ({results.length})
              </button>
              {categories.filter(c => categoryCounts[c.id]).map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setFilterCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap flex-shrink-0 ${
                    filterCategory === cat.id
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'bg-white text-gray-500 hover:bg-gray-50 border border-gray-200'
                  }`}
                >
                  {cat.name} ({categoryCounts[cat.id]})
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* 结果列表 */}
        <div className="mt-2">
          <AnimatePresence mode="wait">
            {isSearching ? (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 skeleton rounded-lg" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 skeleton rounded w-3/4" />
                        <div className="h-3 skeleton rounded w-1/2" />
                      </div>
                    </div>
                  </div>
                ))}
              </motion.div>
            ) : !hasSearched ? (
              <motion.div key="idle" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center py-20">
                <SearchIcon className="w-14 h-14 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-base font-medium">输入关键词开始搜索</p>
                <p className="text-gray-400 text-sm mt-1">支持搜索资源名称、别名、分类、标签</p>
              </motion.div>
            ) : results.length === 0 ? (
              <motion.div key="empty" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center py-20">
                <SearchIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-500 text-base font-medium">没有找到相关资源</p>
                <p className="text-gray-400 text-sm mt-1">尝试使用其他关键词搜索</p>
              </motion.div>
            ) : (
              <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
                {paginatedResults.map((link, index) => (
                  <motion.div
                    key={link.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    className="bg-white rounded-xl p-3.5 sm:p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow cursor-pointer group flex items-center gap-3"
                    onClick={() => setSelectedLink(link)}
                  >
                    {/* 图标 */}
                    <div className="flex-shrink-0">
                      <LinkIcon link={link} size="md" />
                    </div>

                    {/* 信息 */}
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <h3 className="font-medium text-gray-800 text-sm truncate group-hover:text-brand-600 transition-colors">
                        {link.name}
                      </h3>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[11px] text-brand-500 bg-brand-50 px-1.5 py-0.5 rounded font-medium">
                          {categories.find(c => c.id === link.category_id)?.name || '未分类'}
                        </span>
                        {link.subcategory_id && (
                          <span className="text-[11px] text-violet-500 bg-violet-50 px-1.5 py-0.5 rounded font-medium">
                            {getSubCategoryName(link.subcategory_id)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleLinkClick(link)
                        }}
                        className="px-3 py-2 text-xs text-white bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 rounded-lg transition-all shadow-sm font-medium flex items-center gap-1 flex-shrink-0"
                      >
                        <Download className="w-3.5 h-3.5" />
                        访问下载
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          shareLink(link)
                        }}
                        className="flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600 transition-colors flex-shrink-0 px-2 py-2"
                        title="分享链接"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        <span>分享</span>
                      </button>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* 返回首页 */}
          {hasSearched && results.length > 0 && !isSearching && (
            <div className="mt-8 text-center">
              <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-brand-500 hover:text-brand-600 transition-colors font-medium">
                <ArrowLeft className="w-4 h-4" /> 返回首页
              </Link>
            </div>
          )}

          {/* 分页 */}
          {totalPages > 1 && hasSearched && results.length > 0 && !isSearching && (
            <div className="flex items-center justify-center gap-1.5 mt-6">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-2 rounded-lg text-sm border border-gray-200 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-gray-600"
              >
                上一页
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(page => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 2)
                .map((page, index, array) => (
                  <span key={page} className="flex items-center">
                    {index > 0 && array[index - 1] !== page - 1 && (
                      <span className="px-1 text-gray-400 text-sm">...</span>
                    )}
                    <button
                      onClick={() => setCurrentPage(page)}
                      className={`w-8 h-8 rounded-lg text-sm transition-all font-medium ${
                        currentPage === page
                          ? 'bg-brand-600 text-white shadow-sm'
                          : 'border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-600'
                      }`}
                    >
                      {page}
                    </button>
                  </span>
                ))}
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-2 rounded-lg text-sm border border-gray-200 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-gray-600"
              >
                下一页
              </button>
            </div>
          )}

          {/* Footer */}
          <footer className="mt-12 pb-4">
            {/* Divider */}
            <div className="flex items-center justify-center gap-4 mb-4">
              <div className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent flex-1"></div>
              <div className="w-1.5 h-1.5 bg-gray-300 rounded-full"></div>
              <div className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent flex-1"></div>
            </div>
            {/* Disclaimer */}
            <div className="text-center mb-4 max-w-2xl mx-auto">
              <p className="text-[11px] text-gray-400 leading-relaxed">
                免责申明：本站不以盈利为目的，下载资源均来源于网络，只做学习和交流使用，版权归原作者所有，若作商业用途请购买正版，由于未及时购买和付费发生的侵权行为，与本站无关。如果侵犯了您的合法权益，请联系站长删除。
              </p>
            </div>
            {/* Bottom Row */}
            <div className="flex items-center justify-center gap-3 text-sm text-gray-400">
              <Link
                to="/"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-500 text-white rounded-full text-xs font-medium hover:bg-brand-600 transition-colors cursor-pointer"
              >
                <Menu className="w-3.5 h-3.5" />
                分类
              </Link>
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center">
                <LayoutGrid className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="font-medium text-gray-500">资源云</span>
              <span className="text-gray-300">·</span>
              <span className="text-gray-400">© 2026</span>
            </div>
          </footer>
        </div>
      </div>

      {/* 底部分类导航（移动端固定） */}
      {hasSearched && results.length > 0 && !isSearching && categories.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-sm border-t border-gray-100 lg:hidden">
          <div className="flex items-center overflow-x-auto px-3 py-2 gap-1.5 scrollbar-hide max-w-3xl mx-auto">
            <button
              onClick={() => setFilterCategory('all')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap flex-shrink-0 transition-all ${
                filterCategory === 'all'
                  ? 'bg-brand-50 text-brand-600 border border-brand-200'
                  : 'bg-gray-50 text-gray-500 border border-gray-200 hover:border-gray-300'
              }`}
            >
              全部 ({results.length})
            </button>
            {categories.filter(c => categoryCounts[c.id]).map(cat => (
              <button
                key={cat.id}
                onClick={() => setFilterCategory(cat.id)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap flex-shrink-0 transition-all ${
                  filterCategory === cat.id
                    ? 'bg-brand-50 text-brand-600 border border-brand-200'
                    : 'bg-gray-50 text-gray-500 border border-gray-200 hover:border-gray-300'
                }`}
              >
                {cat.name} ({categoryCounts[cat.id]})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 资源详情弹窗 */}
      {selectedLink && (
        <LinkDetailModal link={selectedLink} onClose={() => setSelectedLink(null)} />
      )}
    </div>
  )
}
