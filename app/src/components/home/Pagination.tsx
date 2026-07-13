import React from 'react'

interface PaginationProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
}

const PAGINATION_BTN = 'px-4 py-2 rounded-xl text-sm border border-gray-200 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 font-medium text-gray-600 cursor-pointer'

export default function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter(page =>
      page === 1 ||
      page === totalPages ||
      Math.abs(page - currentPage) <= 2
    )

  return (
    <div className="flex items-center justify-center gap-2 mt-8">
      <button
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        disabled={currentPage === 1}
        className={`${PAGINATION_BTN} sm:px-4 sm:py-2 min-h-[44px] sm:min-h-[36px]`}
        aria-label="上一页"
      >
        上一页
      </button>

      {pages.map((page, index, array) => (
        <span key={page}>
          {index > 0 && array[index - 1] !== page - 1 && (
            <span className="px-1 text-gray-400">...</span>
          )}
          <button
            onClick={() => onPageChange(page)}
            className={`w-11 h-11 sm:w-9 sm:h-9 rounded-xl text-sm transition-all duration-200 font-medium cursor-pointer ${
              currentPage === page
                ? 'bg-brand-600 text-white shadow-button'
                : 'border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-600'
            }`}
            aria-label={`第 ${page} 页`}
          >
            {page}
          </button>
        </span>
      ))}

      <button
        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        disabled={currentPage === totalPages}
        className={`${PAGINATION_BTN} sm:px-4 sm:py-2 min-h-[44px] sm:min-h-[36px]`}
        aria-label="下一页"
      >
        下一页
      </button>
    </div>
  )
}
