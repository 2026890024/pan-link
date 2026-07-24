import React, { useRef, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search, Tag } from 'lucide-react'
import { type LinkItem } from '@/store/useDataStore'
import { LinkIcon } from '@/components/LinkIcon'
import { useDataStore } from '@/store/useDataStore'

interface SearchBarProps {
  searchQuery: string
  onSearchQueryChange: (query: string) => void
  searchSuggestions: Array<LinkItem>
  showSuggestions: boolean
  onShowSuggestionsChange: (show: boolean) => void
  onSearch: (e: React.FormEvent) => void
  onSuggestionClick: (link: LinkItem) => void
  onClearSearch: () => void
}

interface DropdownPosition {
  top: number
  left: number
  width: number
}

export default function SearchBar({
  searchQuery,
  onSearchQueryChange,
  searchSuggestions,
  showSuggestions,
  onShowSuggestionsChange,
  onSearch,
  onSuggestionClick,
  onClearSearch: _onClearSearch,
}: SearchBarProps) {
  const searchInputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)
  const { categories, subCategories } = useDataStore()
  const [dropdownPosition, setDropdownPosition] = useState<DropdownPosition>({ top: 0, left: 0, width: 0 })

  const getLinkIcon = (link: LinkItem) => <LinkIcon link={link} size={link.icon_size || 'md'} />
  const getCategoryName = (link: LinkItem) => {
    const cat = categories.find(c => c.id === link.category_id)
    return cat?.name || ''
  }
  const getSubCategoryName = (link: LinkItem) => {
    const sub = subCategories.find(sc => sc.id === link.subcategory_id)
    return sub?.name || ''
  }
  const highlightText = (text: string, query: string) => {
    if (!query.trim()) {return text}
    const q = query.toLowerCase()
    const idx = text.toLowerCase().indexOf(q)
    if (idx === -1) {return text}
    return (
      <>
        {text.slice(0, idx)}
        <span className="text-brand-600 font-semibold">{text.slice(idx, idx + query.length)}</span>
        {text.slice(idx + query.length)}
      </>
    )
  }

  // 点击外部关闭搜索建议
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(e.target as Node)
      ) {
        onShowSuggestionsChange(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onShowSuggestionsChange])

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
        onSearchQueryChange('')
        onShowSuggestionsChange(false)
        searchInputRef.current?.blur()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onSearchQueryChange, onShowSuggestionsChange])

  // 使用 Portal 渲染下拉框，确保悬浮在所有页面内容之上
  useEffect(() => {
    if (!showSuggestions || searchSuggestions.length === 0) {return}

    const updatePosition = () => {
      if (searchInputRef.current) {
        const rect = searchInputRef.current.getBoundingClientRect()
        setDropdownPosition({
          top: rect.bottom + 4,
          left: rect.left,
          width: rect.width,
        })
      }
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [showSuggestions, searchSuggestions.length])

  const suggestionsContent = showSuggestions && searchSuggestions.length > 0 && (
    <div
      ref={suggestionsRef}
      className="fixed bg-white/95 backdrop-blur-xl rounded-3xl shadow-lg border border-gray-100 overflow-hidden max-h-80 overflow-y-auto z-30"
      style={{
        top: dropdownPosition.top,
        left: dropdownPosition.left,
        width: dropdownPosition.width,
      }}
      role="listbox"
      aria-label="搜索建议"
    >
      {searchSuggestions.map((link) => (
        <button
          key={link.id}
          onClick={() => onSuggestionClick(link)}
          className="w-full flex items-start gap-3 px-4 py-3 hover:bg-brand-50/80 transition-colors text-left cursor-pointer border-b border-gray-50 last:border-b-0"
          role="option"
        >
          <div className="flex-shrink-0 mt-0.5">
            {getLinkIcon(link)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm text-gray-800 truncate">
              {highlightText(link.name, searchQuery)}
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              {getCategoryName(link) && (
                <span className="text-[10px] text-brand-500 bg-brand-50 px-1.5 py-0.5 rounded font-medium">
                  {getCategoryName(link)}
                </span>
              )}
              {getSubCategoryName(link) && (
                <span className="text-[10px] text-violet-500 bg-violet-50 px-1.5 py-0.5 rounded font-medium">
                  {getSubCategoryName(link)}
                </span>
              )}
              {link.tags && link.tags.length > 0 && (
                <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
                  <Tag className="w-2.5 h-2.5" />
                  {link.tags.length}
                </span>
              )}
            </div>

          </div>
        </button>
      ))}
      <button
        onClick={onSearch}
        className="w-full text-center py-2.5 text-sm text-brand-600 font-medium hover:bg-brand-50 transition-colors border-t border-gray-50 cursor-pointer"
      >
        查看全部 {searchSuggestions.length >= 10 ? '10+' : searchSuggestions.length} 个结果 →
      </button>
    </div>
  )

  return (
    <form onSubmit={onSearch} className="w-full max-w-xl sm:max-w-2xl relative">
      <div className="relative group">
        <div className="relative">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => { onSearchQueryChange(e.target.value); onShowSuggestionsChange(true) }}
            onFocus={() => searchQuery.trim() && onShowSuggestionsChange(true)}
            placeholder="搜索您需要的资源..."
            className="w-full px-5 py-3.5 sm:px-6 sm:py-4 pl-12 sm:pl-14 pr-24 sm:pr-28 rounded-full bg-white/80 backdrop-blur-xl text-gray-900 placeholder-gray-400 focus:outline-none text-base border border-gray-100 shadow-sm transition-colors duration-300"
            aria-label="搜索资源"
            aria-expanded={showSuggestions}
            aria-autocomplete="list"
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

      {/* 实时搜索建议 - 通过 Portal 渲染到 body，避免被父级层叠上下文裁剪 */}
      {suggestionsContent && createPortal(suggestionsContent, document.body)}
    </form>
  )
}
