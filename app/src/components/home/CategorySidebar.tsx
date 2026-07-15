import React from 'react'
import { FolderOpen, X, ChevronDown, ChevronRight } from 'lucide-react'
import type { Category, SubCategory } from '@/store/useDataStore'

interface CategorySidebarProps {
  visibleCategories: Category[]
  visibleSubCategories: SubCategory[]
  selectedCategory: string | null
  selectedSubCategory: string | null
  expandedCategory: string | null
  showMobileSidebar: boolean
  onCategoryClick: (categoryId: string) => void
  onAllClick: () => void
  onCloseMobile: () => void
  onUpdateUrlParams: (categoryId: string | null, subCategoryId: string | null) => void
  onSetExpandedCategory: (id: string | null) => void
  onSetSelectedCategory: (id: string | null) => void
  onSetSelectedSubCategory: (id: string | null) => void
  onSetIsSearchMode: (v: boolean) => void
  onSetSearchQuery: (q: string) => void
}

export default function CategorySidebar({
  visibleCategories,
  visibleSubCategories,
  selectedCategory,
  selectedSubCategory,
  expandedCategory,
  showMobileSidebar,
  onCategoryClick,
  onAllClick,
  onCloseMobile,
  onUpdateUrlParams,
  onSetExpandedCategory,
  onSetSelectedCategory,
  onSetSelectedSubCategory,
  onSetIsSearchMode,
  onSetSearchQuery,
}: CategorySidebarProps) {

  const getSubCategories = (categoryId: string) => {
    return visibleSubCategories.filter(sc => sc.category_id === categoryId)
  }

  return (
    <>
      {/* Mobile Sidebar Overlay */}
      {showMobileSidebar && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onCloseMobile}
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
              onClick={onCloseMobile}
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
              onClick={onAllClick}
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
                      onClick={() => onCategoryClick(category.id)}
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
                            onSetExpandedCategory(isExpanded ? null : category.id)
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
                        onClick={() => { onSetIsSearchMode(false); onSetSearchQuery(''); onSetSelectedSubCategory(null); onUpdateUrlParams(category.id, null) }}
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
                            onSetIsSearchMode(false)
                            onSetSearchQuery('')
                            onSetSelectedCategory(category.id)
                            onSetSelectedSubCategory(sc.id)
                            onUpdateUrlParams(category.id, sc.id)
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
    </>
  )
}
