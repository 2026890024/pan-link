import React, { useRef, useEffect } from 'react'
import { Search } from 'lucide-react'
import { type LinkItem } from '@/store/useDataStore'
import { LinkIcon } from '@/components/LinkIcon'

interface SearchBarProps {
  searchQuery: string
  onSearchQueryChange: (query: string) => void
  searchSuggestions: LinkItem[]
  showSuggestions: boolean
  onShowSuggestionsChange: (show: boolean) => void
  onSearch: (e: React.FormEvent) => void
  onSuggestionClick: (link: LinkItem) => void
  onClearSearch: () => void
}

export default function SearchBar({
  searchQuery,
  onSearchQueryChange,
  searchSuggestions,
  showSuggestions,
  onShowSuggestionsChange,
  onSearch,
  onSuggestionClick,
  onClearSearch,
}: SearchBarProps) {
  const searchInputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  const getLinkIcon = (link: LinkItem) => <LinkIcon link={link} size={link.icon_size || 'md'} />

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

  return (
    <form onSubmit={onSearch} className="w-full max-w-xl sm:max-w-2xl relative">
      <div className="relative group">
        <div className="absolute -inset-1 bg-gradient-to-r from-brand-400 via-brand-500 to-violet-500 rounded-full opacity-20 blur-md group-focus-within:opacity-40 group-focus-within:blur-lg transition-all duration-500" />
        <div className="relative">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => { onSearchQueryChange(e.target.value); onShowSuggestionsChange(true) }}
            onFocus={() => searchQuery.trim() && onShowSuggestionsChange(true)}
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
              onClick={() => onSuggestionClick(link)}
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
            onClick={onSearch}
            className="w-full text-center py-2.5 text-sm text-brand-600 font-medium hover:bg-brand-50 transition-colors border-t border-gray-50 cursor-pointer"
          >
            查看全部结果 →
          </button>
        </div>
      )}
    </form>
  )
}
