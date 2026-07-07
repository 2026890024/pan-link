import React from 'react'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className = '',
}) => {
  return (
    <div className={`flex flex-col items-center justify-center py-16 px-4 ${className}`}>
      {icon ? (
        <div className="w-16 h-16 rounded-2xl bg-brand-50 flex items-center justify-center mb-5">
          {icon}
        </div>
      ) : (
        <div className="w-16 h-16 rounded-2xl bg-brand-50 flex items-center justify-center mb-5">
          <svg className="w-8 h-8 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
        </div>
      )}
      <h3 className="text-base font-semibold text-brand-900 mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-brand-400 max-w-xs text-center">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export default EmptyState
