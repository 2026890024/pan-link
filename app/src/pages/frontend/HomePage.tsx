import Pagination from '@/components/home/Pagination'
import SearchBar from '@/components/home/SearchBar'
import CategorySidebar from '@/components/home/CategorySidebar'
import { useState, useMemo, useEffect, useCallback } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Star,
  Check,
  FolderOpen,
  Sparkles,
  Menu,
  List,
  Grid,
  Download,
  Share2,
  Home,
  ArrowUp,
  Key,
  Clock,
} from 'lucide-react'
import { useDataStore, type LinkItem } from '@/store/useDataStore'
import { useSiteSettingsStore } from '@/store/useSiteSettingsStore'
import { LinkIcon } from '@/components/LinkIcon'
import LinkDetailModal from '@/components/LinkDetailModal'
import SiteFooter from '@/components/SiteFooter'
import { SkeletonList } from '@/components/ui/Skeleton'
import { useBackToTop } from '@/hooks/useBackToTop'
import { checkLinkStatus, copyToClipboard as copyUtil, buildShareText } from '@/lib/utils'
import toast from 'react-hot-toast'

// ── 样式常量（提取重复样式）──
const BTN_PRIMARY = 'py-2 px-3 text-xs text-white bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-700 hover:to-brand-600 rounded-lg transition-all duration-200 cursor-pointer flex items-center gap-1 shadow-sm font-medium min-h-[44px] sm:min-h-[36px]'
const BTN_SECONDARY = 'py-2 px-3 text-xs text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-all duration-200 cursor-pointer flex items-center gap-1 min-h-[44px] sm:min-h-[36px]'
const PAGINATION_BTN = 'px-4 py-2 rounded-xl text-sm border border-gray-200 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 font-medium text-gray-600 cursor-pointer'

export default function HomePage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { categories, links, subCategories, incrementClicks, initialized } = useDataStore()
  const siteSettings = useSiteSettingsStore()
  const siteSettingsLoaded = siteSettings.loaded
  const siteName = siteSettings.settings.site_name || '资源云'
  const logoType = siteSettings.settings.current_logo_type || 'text'
  const logoUrl = siteSettings.settings.current_logo_url || ''

  // 链接图标渲染函数
  const getLinkIcon = (link: LinkItem) => <LinkIcon link={link} size={link.icon_size || 'md'} />

  // URL 参数读取分类/子分类
  const urlCategory = searchParams.get('category') || null
  const urlSubCategory = searchParams.get('subcategory') || null

  // 首页分类按钮：按可见性过滤 + sort_order 排序
  const visibleCategories = useMemo(() => {
    try {
      const visibility: Record<string, boolean> = JSON.parse(
        localStorage.getItem('homepage_category_visibility') || '{}'
      )
      return [...categories]
        .filter(c => visibility[c.id] !== false)
        .sort((a, b) => a.sort_order - b.sort_order)
    } catch {
      return [...categories].sort((a, b) => a.sort_order - b.sort_order)
    }
  }, [categories])

  // 子分类可见性过滤（已按 sort_order 排序）
  const visibleSubCategories = useMemo(() => {
    try {
      const subVis: Record<string, boolean> = JSON.parse(
        localStorage.getItem('homepage_subcategory_visibility') || '{}'
      )
      return subCategories
        .filter(sc => {
          const parentVisible = visibleCategories.some(c => c.id === sc.category_id)
          if (!parentVisible) return false
          return subVis[sc.id] !== false
        })
        .sort((a, b) => a.sort_order - b.sort_order)
    } catch {
      return subCategories.filter(sc =>
        visibleCategories.some(c => c.id === sc.category_id)
      ).sort((a, b) => a.sort_order - b.sort_order)
    }
  }, [subCategories, visibleCategories])
  
  // 获取某个分类的子分类（已全局排序，无需再排）
  const getSubCategories = (categoryId: string) => {
    return visibleSubCategories.filter(sc => sc.category_id === categoryId)
  }

  const [searchQuery, setSearchQuery] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(urlCategory)
  const [selectedSubCategory, setSelectedSubCategory] = useState<string | null>(urlSubCategory)
  const [expandedCategory, setExpandedCategory] = useState<string | null>(urlCategory || categories[0]?.id || null)
  const [selectedLink, setSelectedLink] = useState<LinkItem | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [showMobileSidebar, setShowMobileSidebar] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const [isSearchMode, setIsSearchMode] = useState(false)
  const { showBackToTop, scrollToTop } = useBackToTop()
  const itemsPerPage = 10

  // 回访用户检测：第二次访问自动收窄 Hero
  const [isReturning, setIsReturning] = useState(false)
  useEffect(() => {
    const visited = localStorage.getItem('panlink_visited')
    if (visited) {
      setIsReturning(true)
    } else {
      localStorage.setItem('panlink_visited', '1')
    }
  }, [])

  // 同步 URL 参数到本地状态
  useEffect(() => {
    if (urlCategory) setSelectedCategory(urlCategory)
    if (urlSubCategory) setSelectedSubCategory(urlSubCategory)
  }, [urlCategory, urlSubCategory])

  // 精选推荐开关（从 localStorage 读取，默认开启）
  const showFeaturedSection = localStorage.getItem('homepage_show_featured') !== 'false'

  // SEO 标题
  useEffect(() => {
    const desc = siteSettings.settings.site_description || '一站式网盘资源聚合管理平台'
    document.title = `${siteName} - ${desc}`
  }, [siteName, siteSettings.settings.site_description])

  // 数据是否加载中（用 initialized 标记，而非依赖数据长度——空数据库 ≠ 未加载）
  const isLoading = !initialized

  // 过期资源过滤
  const isExpired = (link: LinkItem) => checkLinkStatus(link.expires_at || null) === 'expired'

  const featuredLinks = showFeaturedSection
    ? links.filter(link => link.is_featured && link.visible !== false && !isExpired(link))
    : []

  // 搜索建议（实时过滤，最多 5 条）
  const searchSuggestions = useMemo(() => {
    if (!searchQuery.trim()) return []
    const q = searchQuery.toLowerCase()
    return links
      .filter(link => link.visible !== false && !isExpired(link))
      .filter(link =>
        link.name.toLowerCase().includes(q) ||
        link.title.toLowerCase().includes(q) ||
        link.description.toLowerCase().includes(q) ||
        link.keywords?.some(kw => kw.toLowerCase().includes(q)) ||
        link.tags?.some(tag => tag.name.toLowerCase().includes(q))
      )
      .sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0) || b.click_count - a.click_count)
      .slice(0, 5)
  }, [searchQuery, links])

  // 过期资源过滤 + 分类筛选 + 搜索筛选（memo 优化）
  const filteredLinks = useMemo(() => {
    return links
      .filter(link => {
        if (link.visible === false) return false
        if (isExpired(link)) return false
        // 搜索模式：按搜索词过滤，忽略分类
        if (isSearchMode && searchQuery.trim()) {
          const q = searchQuery.toLowerCase()
          return (
            link.name.toLowerCase().includes(q) ||
            link.title.toLowerCase().includes(q) ||
            link.description.toLowerCase().includes(q) ||
            link.keywords?.some(kw => kw.toLowerCase().includes(q)) ||
            link.tags?.some(tag => tag.name.toLowerCase().includes(q))
          )
        }
        // 正常模式：按分类过滤
        const matchesCategory = selectedCategory ? link.category_id === selectedCategory : true
        const matchesSubCategory = selectedSubCategory ? link.subcategory_id === selectedSubCategory : true
        return matchesCategory && matchesSubCategory
      })
      .sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0) || a.sort_order - b.sort_order)
  }, [links, selectedCategory, selectedSubCategory, isSearchMode, searchQuery])

  const totalPages = Math.ceil(filteredLinks.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const paginatedLinks = useMemo(() => filteredLinks.slice(startIndex, startIndex + itemsPerPage), [filteredLinks, startIndex])

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      setIsSearchMode(true)
      setCurrentPage(1)
      setShowSuggestions(false)
    }
  }, [searchQuery])

  const handleClearSearch = useCallback(() => {
    setSearchQuery('')
    setIsSearchMode(false)
    setCurrentPage(1)
  }, [])

  const handleSuggestionClick = useCallback((link: LinkItem) => {
    setShowSuggestions(false)
    navigate(`/s/${link.slug}`)
  }, [navigate])

  const handleLinkClick = useCallback((link: LinkItem) => {
    incrementClicks(link.id)
    window.open(link.url, '_blank', 'noopener,noreferrer')
  }, [incrementClicks])

  const shareLink = useCallback(async (link: LinkItem) => {
    const shareText = buildShareText(link.name, link.url, link.extract_code || undefined)
    if (navigator.share) {
      try {
        await navigator.share({
          title: link.name,
          text: shareText,
          url: link.url,
        })
      } catch {
        // 用户取消
      }
    } else {
      const success = await copyUtil(shareText)
      if (success) {
        setCopiedId(link.id)
        toast.success('已复制分享内容')
        setTimeout(() => setCopiedId(null), 2000)
      } else {
        toast.error('复制失败')
      }
    }
  }, [])

  const updateUrlParams = useCallback((categoryId: string | null, subCategoryId: string | null) => {
    const params = new URLSearchParams()
    if (categoryId) params.set('category', categoryId)
    if (subCategoryId) params.set('subcategory', subCategoryId)
    setSearchParams(params, { replace: true })
  }, [setSearchParams])

  const handleCategoryClick = useCallback((categoryId: string) => {
    if (selectedCategory === categoryId) {
      setExpandedCategory(prev => prev === categoryId ? null : categoryId)
    } else {
      setSelectedCategory(categoryId)
      setSelectedSubCategory(null)
      setExpandedCategory(categoryId)
      setCurrentPage(1)
      updateUrlParams(categoryId, null)
    }
  }, [selectedCategory])

  const handleAllClick = useCallback(() => {
    setSelectedCategory(null)
    setSelectedSubCategory(null)
    setExpandedCategory(null)
    setCurrentPage(1)
    setSearchParams({}, { replace: true })
  }, [setSearchParams])

  const handleCategoryClickWithSearchClear = useCallback((categoryId: string) => {
    setIsSearchMode(false)
    setSearchQuery('')
    handleCategoryClick(categoryId)
  }, [handleCategoryClick])

  const handleAllClickWithSearchClear = useCallback(() => {
    setIsSearchMode(false)
    setSearchQuery('')
    handleAllClick()
  }, [handleAllClick])

  return (
    <div className="min-h-screen text-gray-900 flex flex-col">
      {/* Hero Section */}
      <div className={`gradient-hero flex flex-col items-center px-4 pb-12 sm:pb-16 transition-all duration-500 ${isReturning ? 'pt-[max(1.5rem,env(safe-area-inset-top))] gap-3' : 'pt-[max(4rem,env(safe-area-inset-top))] sm:pt-[max(6rem,env(safe-area-inset-top))] gap-6 sm:gap-8'}`}>
        {/* Logo + 回访用户收缩 */}
        <Link to="/" onClick={handleClearSearch} className={`flex items-center gap-4 group transition-all duration-500 ${isReturning ? 'scale-75' : 'mb-0'}`}>
          {siteSettingsLoaded && logoType === 'image' && logoUrl ? (
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center overflow-hidden bg-transparent group-hover:scale-105 transition-all duration-500">
              <img src={logoUrl} alt={siteName} className="w-full h-full object-contain" />
            </div>
          ) : (
            <div className="w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-brand-600 via-brand-500 to-violet-500 rounded-2xl flex items-center justify-center shadow-glass group-hover:shadow-glass-lg group-hover:scale-105 transition-all duration-500">
              <svg viewBox="0 0 24 24" className="w-7 h-7 sm:w-8 sm:h-8 text-white" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          )}
          <span className="text-3xl sm:text-4xl font-bold text-gradient">
            {siteName}
          </span>
        </Link>

        {/* Subtitle - 回访时隐藏 */}
        {!isReturning && (
          <p className="text-gray-500 text-sm sm:text-base">高效聚合 · 一站管理 · 轻松分享</p>
        )}

        {/* Search Bar */}
        <SearchBar
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          searchSuggestions={searchSuggestions}
          showSuggestions={showSuggestions}
          onShowSuggestionsChange={setShowSuggestions}
          onSearch={handleSearch}
          onSuggestionClick={handleSuggestionClick}
          onClearSearch={handleClearSearch}
        />

        {/* 分类快速筛选按钮 */}
      </div>

      {/* Mobile Menu Button (floating) */}
      <button
        onClick={() => setShowMobileSidebar(!showMobileSidebar)}
        className="fixed left-4 bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))] z-30 md:hidden px-4 py-3 bg-gradient-to-br from-brand-600 to-brand-500 text-white rounded-2xl shadow-glass flex items-center gap-2 hover:shadow-glass-lg active:scale-95 transition-all duration-300 cursor-pointer"
        aria-label="打开分类菜单"
      >
        <Menu className="w-5 h-5" />
        <span className="text-sm font-medium">分类</span>
      </button>

      {/* Main Content - 直接显示 */}
      <main className="max-w-7xl mx-auto px-4 py-6 w-full flex-1">
          <div className="flex gap-6">
            {/* Mobile Sidebar Overlay */}
          {showMobileSidebar && (
            <div
              className="fixed inset-0 bg-black/50 z-40 md:hidden"
              onClick={() => setShowMobileSidebar(false)}
            />
          )}

          <CategorySidebar
            categories={categories}
            visibleCategories={visibleCategories}
            visibleSubCategories={visibleSubCategories}
            selectedCategory={selectedCategory}
            selectedSubCategory={selectedSubCategory}
            expandedCategory={expandedCategory}
            showMobileSidebar={showMobileSidebar}
            onCategoryClick={handleCategoryClickWithSearchClear}
            onAllClick={handleAllClickWithSearchClear}
            onCloseMobile={() => setShowMobileSidebar(false)}
            onUpdateUrlParams={updateUrlParams}
            onSetExpandedCategory={setExpandedCategory}
            onSetSelectedCategory={setSelectedCategory}
            onSetSelectedSubCategory={setSelectedSubCategory}
            onSetIsSearchMode={setIsSearchMode}
            onSetSearchQuery={setSearchQuery}
            onSetCurrentPage={setCurrentPage}
          />

          {/* Right Content */}
          <div className="flex-1 min-w-0">
            {/* 数据加载骨架屏 */}
            {isLoading ? (
              <div className="animate-fade-in">
                <div className="mb-8">
                  <SkeletonList count={4} />
                </div>
              </div>
            ) : (
              <>
            {/* Featured - 只在非搜索模式且全部资源下显示 */}
            {!isSearchMode && !selectedCategory && !selectedSubCategory && featuredLinks.length > 0 && (
              <div className="mb-8 animate-fade-in">
                <div className="flex items-center gap-3 mb-5">
                  <div className="p-2 bg-amber-50 rounded-xl border border-amber-100">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                  </div>
                  <h2 className="text-lg font-bold text-gray-900">精选推荐</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  {featuredLinks.map((link, idx) => (
                    <div
                      key={link.id}
                      onClick={() => setSelectedLink(link)}
                      className={`group bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-gray-100 hover:shadow-lg hover:border-gray-300 hover:-translate-y-1 transition-all duration-300 cursor-pointer animate-fade-in stagger-${Math.min(idx + 1, 5)}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="shrink-0 pt-0.5">
                          {getLinkIcon(link)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900 group-hover:text-brand-600 transition-colors text-sm truncate leading-tight">
                            {link.name}
                          </h3>
                          <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed break-all">
                            {link.description}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 mt-3 pt-2 border-t border-gray-50" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleLinkClick(link) }}
                            className={`flex-1 justify-center ${BTN_PRIMARY} hover:shadow-md`}
                            aria-label={`访问 ${link.name}`}
                          >
                            <Download className="w-3 h-3" />
                            访问下载
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); shareLink(link) }}
                            className={`text-gray-500 ${BTN_SECONDARY}`}
                            aria-label={`分享 ${link.name}`}
                          >
                            {copiedId === link.id ? <Check className="w-3 h-3 text-emerald-500" /> : <Share2 className="w-3 h-3" />}
                            分享
                          </button>
                        </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Gradient Divider */}
            {!isSearchMode && !selectedCategory && !selectedSubCategory && featuredLinks.length > 0 && (
              <div className="my-8 h-px bg-gradient-to-r from-transparent via-brand-200 to-transparent"></div>
            )}

            {/* Links List */}
            <div className="bg-white rounded-2xl shadow-card border border-gray-200 overflow-hidden animate-fade-in">
              <div className="px-4 sm:px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-6 bg-gradient-to-b from-brand-500 to-brand-600 rounded-full"></div>
                  <h2 className="text-base sm:text-lg font-bold text-gray-900">
                    {isSearchMode
                      ? '搜索结果'
                      : selectedSubCategory
                        ? getSubCategories(selectedCategory || '').find(sc => sc.id === selectedSubCategory)?.name || '资源列表'
                        : selectedCategory
                          ? categories.find(c => c.id === selectedCategory)?.name
                          : '全部资源'
                    }
                  </h2>
                  <span className="px-2 py-0.5 bg-brand-50 rounded-full text-xs text-brand-500 font-semibold">{filteredLinks.length} 个</span>
                </div>
                <div className="flex items-center gap-2">
                  {isSearchMode && (
                    <button
                      onClick={handleClearSearch}
                      className="flex items-center justify-center w-8 h-8 text-brand-500 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-all duration-200 cursor-pointer"
                      aria-label="返回首页"
                    >
                      <Home className="w-4 h-4" />
                    </button>
                  )}
                  <div className="flex items-center bg-brand-50 rounded-xl p-1 gap-0.5">
                    <button
                      onClick={() => setViewMode('list')}
                      className={`p-2 rounded-lg transition-all duration-200 cursor-pointer ${
                        viewMode === 'list'
                          ? 'bg-white text-brand-600 shadow-sm'
                          : 'text-brand-400 hover:text-brand-600'
                      }`}
                      aria-label="列表视图"
                    >
                      <List className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setViewMode('grid')}
                      className={`p-2 rounded-lg transition-all duration-200 cursor-pointer ${
                        viewMode === 'grid'
                          ? 'bg-white text-brand-600 shadow-sm'
                          : 'text-brand-400 hover:text-brand-600'
                      }`}
                      aria-label="网格视图"
                    >
                      <Grid className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-4 sm:p-6">
                {filteredLinks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <div className="w-20 h-20 rounded-2xl bg-brand-50 flex items-center justify-center mb-5">
                      <FolderOpen className="w-10 h-10 text-gray-400" />
                    </div>
                    <p className="text-base font-semibold text-gray-500">暂无资源</p>
                    <p className="text-sm text-gray-400 mt-1">该分类下还没有添加资源</p>
                  </div>
                ) : (
                  <>
                    <AnimatePresence mode="wait">
                      {viewMode === 'list' ? (
                        <motion.div
                          key="list-view"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="space-y-3"
                        >
                          {paginatedLinks.map((link) => (
                            <div
                              key={link.id}
                              className={`group flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4 rounded-xl bg-white border transition-all duration-300 cursor-pointer ${
                                link.is_pinned
                                  ? 'border-l-2 border-brand-400 border-l-brand-400 border-gray-100 hover:shadow-md hover:-translate-y-0.5 hover:border-gray-300'
                                  : 'border-gray-100 hover:shadow-md hover:-translate-y-0.5 hover:border-gray-300'
                              }`}
                              onClick={() => setSelectedLink(link)}
                            >
                              <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                                {getLinkIcon(link)}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <h3 className="font-semibold text-gray-900 group-hover:text-brand-600 transition-colors text-sm truncate leading-tight">
                                      {link.name}
                                    </h3>
                                    {link.is_pinned && (
                                      <span className="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-semibold rounded-md bg-amber-50 text-amber-600 border border-amber-200">置顶</span>
                                    )}
                                    {link.extract_code && (
                                      <span className="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-semibold rounded-md bg-blue-50 text-blue-600 border border-blue-200 inline-flex items-center gap-1"><Key className="w-2.5 h-2.5 flex-shrink-0" />提取码</span>
                                    )}
                                    {link.expires_at && (() => {
                                      const days = Math.ceil((new Date(link.expires_at).getTime() - Date.now()) / 86400000)
                                      if (days <= 30 && days > 0) return (
                                        <span className="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-semibold rounded-md bg-amber-50 text-amber-700 border border-amber-200 inline-flex items-center gap-1">
                                          <Clock className="w-2.5 h-2.5 flex-shrink-0" />{days <= 7 ? `${days}天后过期` : `${days}天`}
                                        </span>
                                      )
                                      return null
                                    })()}
                                  </div>
                                  <p className="text-xs text-gray-500 mt-1 leading-relaxed line-clamp-2 sm:truncate">{link.description}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0 sm:ml-auto" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleLinkClick(link)
                                  }}
                                  className={BTN_PRIMARY}
                                  aria-label={`访问 ${link.name}`}
                                >
                                  <Download className="w-3 h-3" />
                                  访问下载
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    shareLink(link)
                                  }}
                                  className={BTN_SECONDARY}
                                  aria-label={`分享 ${link.name}`}
                                >
                                  {copiedId === link.id ? (
                                    <Check className="w-3 h-3 text-emerald-500" />
                                  ) : (
                                    <Share2 className="w-3 h-3" />
                                  )}
                                  分享
                                </button>
                              </div>
                            </div>
                          ))}
                        </motion.div>
                      ) : (
                        <motion.div
                          key="grid-view"
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.98 }}
                          transition={{ duration: 0.25 }}
                          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
                        >
                          {paginatedLinks.map((link, idx) => (
                            <div
                              key={link.id}
                              onClick={() => setSelectedLink(link)}
                              className={`group p-4 sm:p-5 rounded-2xl border border-gray-100 bg-white shadow-sm hover:shadow-lg hover:border-gray-300 hover:-translate-y-1 transition-all duration-300 cursor-pointer animate-fade-in stagger-${Math.min(idx + 1, 5)}`}
                            >
                              <div className="flex items-center gap-3 mb-3">
                                {getLinkIcon(link)}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <h3 className="font-semibold text-gray-900 group-hover:text-brand-600 transition-colors text-sm truncate">
                                      {link.name}
                                    </h3>
                                  </div>
                                  <p className="text-xs text-gray-500 truncate mt-0.5">{link.description}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 pt-2 border-t border-gray-50" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleLinkClick(link)
                                  }}
                                  className={`flex-1 justify-center ${BTN_PRIMARY}`}
                                  aria-label={`访问 ${link.name}`}
                                >
                                  <Download className="w-3 h-3" />
                                  访问下载
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    shareLink(link)
                                  }}
                                  className={BTN_SECONDARY}
                                  aria-label={`分享 ${link.name}`}
                                >
                                  {copiedId === link.id ? <Check className="w-3 h-3 text-emerald-500" /> : <Share2 className="w-3 h-3" />}
                                  分享
                                </button>
                              </div>
                            </div>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* 分页控件 */}
                    {totalPages > 1 && (
                      <Pagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      onPageChange={setCurrentPage}
                    />
                    )}
                  </>
                )}
              </div>
            </div>
            </>
            )}
          </div>
        </div>
      </main>


      {/* Footer */}
      <SiteFooter />

      {/* 资源详情弹窗 */}
      {selectedLink && (
        <LinkDetailModal link={selectedLink} onClose={() => setSelectedLink(null)} />
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
