import { useState, useMemo, useEffect, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  Star,
  Check,
  FolderOpen,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Menu,
  X,
  List,
  Grid,
  Download,
  Share2,
} from 'lucide-react'
import { useDataStore, type LinkItem } from '@/store/useDataStore'
import { LinkIcon } from '@/components/LinkIcon'
import LinkDetailModal from '@/components/LinkDetailModal'
import { SkeletonList } from '@/components/ui/Skeleton'
import { checkLinkStatus, copyToClipboard as copyUtil } from '@/lib/utils'
import toast from 'react-hot-toast'

export default function HomePage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { categories, links, subCategories, incrementClicks } = useDataStore()

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

  // 子分类可见性过滤
  const visibleSubCategories = useMemo(() => {
    try {
      const subVis: Record<string, boolean> = JSON.parse(
        localStorage.getItem('homepage_subcategory_visibility') || '{}'
      )
      return subCategories
        .filter(sc => {
          // 父分类可见 + 子分类默认可见（除非显式隐藏）
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
  const itemsPerPage = 10
  const searchInputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  // 同步 URL 参数到本地状态
  useEffect(() => {
    if (urlCategory) setSelectedCategory(urlCategory)
    if (urlSubCategory) setSelectedSubCategory(urlSubCategory)
  }, [urlCategory, urlSubCategory])

  // 精选推荐开关（从 localStorage 读取，默认开启）
  const showFeaturedSection = localStorage.getItem('homepage_show_featured') !== 'false'

  // SEO 标题
  useEffect(() => { document.title = '资源云 - 一站式网盘资源聚合管理平台' }, [])

  // 数据是否加载中
  const isLoading = links.length === 0 && categories.length === 0

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

  // 点击外部关闭搜索建议
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // 键盘快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // / 聚焦搜索框
      if (e.key === '/' && document.activeElement !== searchInputRef.current && !(document.activeElement instanceof HTMLInputElement) && !(document.activeElement instanceof HTMLTextAreaElement)) {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
      // Esc 清除搜索
      if (e.key === 'Escape' && document.activeElement === searchInputRef.current) {
        setSearchQuery('')
        setShowSuggestions(false)
        searchInputRef.current?.blur()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // 过期资源过滤 + 分类筛选（memo 优化）
  const filteredLinks = useMemo(() => {
    return links
      .filter(link => {
        if (link.visible === false) return false
        if (isExpired(link)) return false
        const matchesCategory = selectedCategory ? link.category_id === selectedCategory : true
        const matchesSubCategory = selectedSubCategory ? link.subcategory_id === selectedSubCategory : true
        return matchesCategory && matchesSubCategory
      })
      .sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0) || a.sort_order - b.sort_order)
  }, [links, selectedCategory, selectedSubCategory])

  const totalPages = Math.ceil(filteredLinks.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const paginatedLinks = useMemo(() => filteredLinks.slice(startIndex, startIndex + itemsPerPage), [filteredLinks, startIndex])

  const getSubCategories = (categoryId: string) => {
    return visibleSubCategories.filter(sc => sc.category_id === categoryId).sort((a, b) => a.sort_order - b.sort_order)
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery)}`)
    }
  }

  const handleSuggestionClick = (link: LinkItem) => {
    setShowSuggestions(false)
    navigate(`/s/${link.slug}`)
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

  const handleLinkClick = (link: LinkItem) => {
    incrementClicks(link.id)
    window.open(link.url, '_blank', 'noopener,noreferrer')
  }

  const getLinkIcon = (link: LinkItem) => <LinkIcon link={link} size="md" />

  const updateUrlParams = (categoryId: string | null, subCategoryId: string | null) => {
    const params = new URLSearchParams()
    if (categoryId) params.set('category', categoryId)
    if (subCategoryId) params.set('subcategory', subCategoryId)
    setSearchParams(params, { replace: true })
  }

  const handleCategoryClick = (categoryId: string) => {
    if (selectedCategory === categoryId) {
      // 同一分类：切换展开/折叠
      setExpandedCategory(expandedCategory === categoryId ? null : categoryId)
    } else {
      setSelectedCategory(categoryId)
      setSelectedSubCategory(null)
      setExpandedCategory(categoryId)
      setCurrentPage(1)
      updateUrlParams(categoryId, null)
    }
  }

  const handleAllClick = () => {
    setSelectedCategory(null)
    setSelectedSubCategory(null)
    setExpandedCategory(null)
    setCurrentPage(1)
    setSearchParams({}, { replace: true })
  }

  return (
    <div className="min-h-screen text-gray-900 flex flex-col">
      {/* Hero Section */}
      <div className="gradient-hero flex flex-col items-center pt-16 sm:pt-24 px-4 pb-12 sm:pb-16">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-4 mb-6 sm:mb-8 group">
          <div className="w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-brand-600 via-brand-500 to-violet-500 rounded-2xl flex items-center justify-center shadow-glass group-hover:shadow-glass-lg group-hover:scale-105 transition-all duration-500">
            <svg viewBox="0 0 24 24" className="w-7 h-7 sm:w-8 sm:h-8 text-white" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="text-3xl sm:text-4xl font-bold text-gradient">
            资源云
          </span>
        </Link>

        {/* Subtitle */}
        <p className="text-gray-500 text-sm sm:text-base mb-6 sm:mb-8">高效聚合 · 一站管理 · 轻松分享</p>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="w-full max-w-xl sm:max-w-2xl relative">
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-brand-400 via-brand-500 to-violet-500 rounded-full opacity-20 blur-md group-focus-within:opacity-40 group-focus-within:blur-lg transition-all duration-500" />
            <div className="relative">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setShowSuggestions(true) }}
                onFocus={() => searchQuery.trim() && setShowSuggestions(true)}
                placeholder="搜索您需要的资源..."
                className="w-full px-5 py-3.5 sm:px-6 sm:py-4 pl-12 sm:pl-14 pr-24 sm:pr-28 rounded-full glass text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-400/50 focus:border-brand-400/30 transition-all duration-300 text-sm sm:text-base shadow-glass"
                aria-label="搜索资源"
              />
              <Search className="absolute left-4 sm:left-5 top-1/2 -translate-y-1/2 w-5 h-5 sm:w-6 sm:h-6 text-brand-400 group-focus-within:text-brand-600 transition-colors duration-300" />
              <button
                type="submit"
                className="absolute right-2 top-1/2 -translate-y-1/2 px-5 sm:px-8 py-2 sm:py-2.5 bg-gradient-to-r from-brand-600 to-brand-500 text-white text-sm rounded-full hover:from-brand-700 hover:to-brand-600 transition-all duration-300 font-semibold shadow-button hover:shadow-lg active:scale-95"
              >
                搜索
              </button>
            </div>
          </div>

          {/* 实时搜索建议 */}
          {showSuggestions && searchSuggestions.length > 0 && (
            <div
              ref={suggestionsRef}
              className="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-glass-lg border border-gray-100 overflow-hidden z-50"
            >
              {searchSuggestions.map((link) => (
                <button
                  key={link.id}
                  onClick={() => handleSuggestionClick(link)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-brand-50 transition-colors text-left cursor-pointer"
                >
                  {getLinkIcon(link)}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-gray-800 truncate">{link.name}</div>
                    <div className="text-xs text-gray-400 truncate">{link.description}</div>
                  </div>
                </button>
              ))}
              <button
                onClick={handleSearch}
                className="w-full text-center py-2.5 text-sm text-brand-600 font-medium hover:bg-brand-50 transition-colors border-t border-gray-50 cursor-pointer"
              >
                查看全部结果 →
              </button>
            </div>
          )}
        </form>

        {/* 分类快速筛选按钮 */}
        <div className="mt-6 sm:mt-8 w-full max-w-4xl">
          <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap justify-center">
            <button
              onClick={handleAllClick}
              className={`px-4 sm:px-5 py-2 sm:py-2.5 rounded-full text-xs sm:text-sm font-medium transition-all duration-300 whitespace-nowrap cursor-pointer ${
                !selectedCategory
                  ? 'bg-brand-600 text-white shadow-button'
                  : 'bg-white/70 text-gray-600 hover:bg-gray-50 hover:text-brand-600 border border-gray-200 shadow-sm'
              }`}
            >
              全部
            </button>
            {visibleCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => handleCategoryClick(cat.id)}
                className={`px-4 sm:px-5 py-2 sm:py-2.5 rounded-full text-xs sm:text-sm font-medium transition-all duration-300 whitespace-nowrap cursor-pointer ${
                  selectedCategory === cat.id
                    ? 'bg-brand-600 text-white shadow-button'
                    : 'bg-white/70 text-gray-600 hover:bg-gray-50 hover:text-brand-600 border border-gray-200 shadow-sm'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile Menu Button (floating) */}
      <button
        onClick={() => setShowMobileSidebar(!showMobileSidebar)}
        className="fixed left-4 bottom-6 z-30 md:hidden px-4 py-3 bg-gradient-to-br from-brand-600 to-brand-500 text-white rounded-2xl shadow-glass flex items-center gap-2 hover:shadow-glass-lg active:scale-95 transition-all duration-300 cursor-pointer"
        aria-label="打开分类菜单"
      >
        <Menu className="w-5 h-5" />
        <span className="text-sm font-medium">分类</span>
      </button>

      {/* Main Content - 直接显示 */}
      <main className="max-w-7xl mx-auto px-4 py-6 w-full">
          <div className="flex gap-6">
            {/* Mobile Sidebar Overlay */}
          {showMobileSidebar && (
            <div
              className="fixed inset-0 bg-black/50 z-40 md:hidden"
              onClick={() => setShowMobileSidebar(false)}
            />
          )}

          {/* Left Sidebar */}
          <div className={`
            ${showMobileSidebar ? 'fixed left-0 top-0 h-full w-72 z-50 transform translate-x-0' : 'hidden md:block'}
            md:static md:transform-none md:w-64 md:flex-shrink-0 animate-slide-up
          `}>
            <div className="bg-white/80 backdrop-blur-xl h-full md:h-auto md:rounded-2xl shadow-glass border border-white/60 p-5 md:sticky md:top-24 overflow-y-auto">
              {/* Mobile Close Button */}
              <div className="flex justify-between items-center mb-5 md:hidden">
                <span className="font-semibold text-gray-900 text-lg">资源分类</span>
                <button
                  onClick={() => setShowMobileSidebar(false)}
                  className="p-2 hover:bg-gray-100 rounded-xl transition-all duration-200 cursor-pointer"
                  aria-label="关闭分类菜单"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-4 px-2">资源分类</h3>
              <nav className="space-y-1" role="navigation" aria-label="资源分类导航">
                {/* 全部 */}
                <button
                  onClick={handleAllClick}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-2.5 cursor-pointer ${
                    !selectedCategory
                      ? 'bg-brand-600 text-white shadow-button'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                  aria-label="查看全部资源"
                  aria-current={!selectedCategory ? 'page' : undefined}
                >
                  <FolderOpen className={`w-4 h-4 ${!selectedCategory ? 'text-white/90' : 'text-brand-400'}`} />
                  <span>全部资源</span>
                </button>
                {visibleCategories.map((category) => {
                  const subcategories = getSubCategories(category.id)
                  const isExpanded = expandedCategory === category.id
                  const isSelected = selectedCategory === category.id

                  return (
                    <div key={category.id}>
                      <div className="flex items-center">
                        <button
                          onClick={() => handleCategoryClick(category.id)}
                          className={`flex-1 text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 flex items-center justify-between cursor-pointer ${
                            isSelected
                              ? 'bg-brand-600 text-white shadow-button'
                              : 'text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <FolderOpen className={`w-4 h-4 ${isSelected ? 'text-white/90' : 'text-brand-400'}`} />
                            <span>{category.name}</span>
                          </div>
                          {subcategories.length > 0 && (
                            <span
                              onClick={(e) => {
                                e.stopPropagation()
                                setExpandedCategory(isExpanded ? null : category.id)
                              }}
                              className={`p-1 rounded-lg transition-all duration-200 ${isSelected ? 'hover:bg-white/20' : 'hover:bg-brand-100'}`}
                            >
                              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </span>
                          )}
                        </button>
                      </div>

                      {/* 子分类 */}
                      {isExpanded && subcategories.length > 0 && (
                        <div className="mt-1 ml-2 space-y-0.5 border-l-2 border-brand-100 pl-3">
                          <button
                            onClick={() => { setSelectedSubCategory(null); setCurrentPage(1); updateUrlParams(category.id, null) }}
                            className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all duration-200 cursor-pointer ${
                              selectedSubCategory === null && isSelected
                                ? 'bg-brand-50 text-brand-600 font-semibold'
                                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                            }`}
                          >
                            全部
                          </button>
                          {subcategories.map(sc => (
                            <button
                              key={sc.id}
                              onClick={() => {
                                setSelectedCategory(category.id)
                                setSelectedSubCategory(sc.id)
                                setCurrentPage(1)
                                updateUrlParams(category.id, sc.id)
                              }}
                              className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all duration-200 cursor-pointer ${
                                selectedSubCategory === sc.id
                                  ? 'bg-brand-50 text-brand-600 font-semibold'
                                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                              }`}
                            >
                              {sc.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </nav>
            </div>
          </div>

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
            {/* Featured - 只在全部资源下显示 */}
            {!selectedCategory && !selectedSubCategory && featuredLinks.length > 0 && (
              <div className="mb-8 animate-fade-in">
                <div className="flex items-center gap-3 mb-5">
                  <div className="p-2 bg-amber-50 rounded-xl border border-amber-100">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                  </div>
                  <h2 className="text-lg font-bold text-gray-900">精选推荐</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                  {featuredLinks.map((link, idx) => (
                    <div
                      key={link.id}
                      onClick={() => setSelectedLink(link)}
                      className={`group bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-gray-100 card-hover cursor-pointer animate-fade-in stagger-${Math.min(idx + 1, 5)}`}
                    >
                      <div className="flex flex-col gap-3">
                        {getLinkIcon(link)}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900 group-hover:text-brand-600 transition-colors text-sm truncate leading-tight">
                            {link.name}
                          </h3>
                          <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">{link.description}</p>
                        </div>
                        <div className="flex items-center gap-1.5 mt-auto pt-2 border-t border-gray-50" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleLinkClick(link) }}
                            className="flex-1 py-2 text-xs text-white bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-700 hover:to-brand-600 rounded-lg transition-all duration-200 cursor-pointer flex items-center justify-center gap-1 shadow-sm hover:shadow-md font-medium min-h-[36px]"
                            aria-label={`访问 ${link.name}`}
                          >
                            <Download className="w-3 h-3" />
                            访问下载
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); shareLink(link) }}
                            className="py-2 px-3 text-xs text-gray-500 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-all duration-200 cursor-pointer flex items-center gap-1 min-h-[36px]"
                            aria-label={`分享 ${link.name}`}
                          >
                            {copiedId === link.id ? <Check className="w-3 h-3 text-emerald-500" /> : <Share2 className="w-3 h-3" />}
                            分享
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Links List */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-fade-in">
              <div className="px-5 sm:px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-1 h-6 bg-gradient-to-b from-brand-500 to-brand-600 rounded-full"></div>
                  <h2 className="text-lg font-bold text-gray-900">
                    {selectedSubCategory
                      ? getSubCategories(selectedCategory || '').find(sc => sc.id === selectedSubCategory)?.name || '资源列表'
                      : selectedCategory
                        ? categories.find(c => c.id === selectedCategory)?.name
                        : '全部资源'
                    }
                  </h2>
                  <span className="px-2.5 py-0.5 bg-brand-50 rounded-full text-xs text-brand-500 font-semibold">{filteredLinks.length} 个</span>
                </div>
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
                          className="space-y-2"
                        >
                          {paginatedLinks.map((link) => (
                            <div
                              key={link.id}
                              className="group flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4 rounded-xl hover:bg-gray-50 transition-all duration-200 cursor-pointer border border-transparent hover:border-gray-200"
                              onClick={() => setSelectedLink(link)}
                            >
                              <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                                {getLinkIcon(link)}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <h3 className="font-semibold text-gray-900 group-hover:text-brand-600 transition-colors text-sm sm:truncate leading-tight">
                                      {link.name}
                                    </h3>
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
                                  className="py-2 px-3 text-xs text-white bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-700 hover:to-brand-600 rounded-lg transition-all duration-200 cursor-pointer flex items-center gap-1 shadow-sm font-medium min-h-[36px]"
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
                                  className="py-2 px-3 text-xs text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-all duration-200 cursor-pointer flex items-center gap-1 min-h-[36px]"
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
                              className={`group p-4 sm:p-5 rounded-2xl border border-gray-100 bg-white shadow-sm card-hover cursor-pointer animate-fade-in stagger-${Math.min(idx + 1, 5)}`}
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
                                  className="flex-1 py-2 text-xs text-white bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-700 hover:to-brand-600 rounded-lg transition-all duration-200 cursor-pointer flex items-center justify-center gap-1 shadow-sm font-medium min-h-[36px]"
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
                                  className="py-2 px-3 text-xs text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-all duration-200 cursor-pointer flex items-center gap-1 min-h-[36px]"
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
                      <div className="flex items-center justify-center gap-2 mt-8">
                        <button
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                          className="px-4 py-2 rounded-xl text-sm border border-gray-200 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 font-medium text-gray-600 cursor-pointer"
                          aria-label="上一页"
                        >
                          上一页
                        </button>

                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                          .filter(page =>
                            page === 1 ||
                            page === totalPages ||
                            Math.abs(page - currentPage) <= 2
                          )
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
                                aria-label={`第 ${page} 页`}
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
                          aria-label="下一页"
                        >
                          下一页
                        </button>
                      </div>
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
      <footer className="mt-12 pb-8">
        <div className="max-w-7xl mx-auto px-4">
          {/* Divider */}
          <div className="flex items-center justify-center gap-4 mb-6">
            <div className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent flex-1"></div>
            <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
            <div className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent flex-1"></div>
          </div>
          {/* Disclaimer */}
          <div className="text-center mb-6 max-w-4xl mx-auto">
            <p className="text-xs text-gray-400 leading-relaxed">
              免责申明：本站不以盈利为目的，下载资源均来源于网络，只做学习和交流使用，版权归原作者所有，若作商业用途请购买正版，由于未及时购买和付费发生的侵权行为，与本站无关。如果侵犯了您的合法权益，请联系站长删除。
            </p>
          </div>
          {/* Copyright */}
          <div className="flex items-center justify-center gap-3 text-sm text-gray-400">
            <Link
              to="/admin-login"
              className="w-8 h-8 bg-gradient-to-br from-brand-600 via-brand-500 to-violet-500 rounded-xl flex items-center justify-center hover:shadow-button transition-all duration-300 hover:scale-105 cursor-pointer"
              title="进入后台管理"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
            <span className="font-medium text-gray-500">资源云</span>
            <span className="text-gray-300">·</span>
            <span>© 2026</span>
          </div>
        </div>
      </footer>

      {/* 资源详情弹窗 */}
      {selectedLink && (
        <LinkDetailModal link={selectedLink} onClose={() => setSelectedLink(null)} />
      )}
    </div>
  )
}
