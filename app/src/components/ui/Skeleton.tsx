import React from 'react'

interface SkeletonProps {
  className?: string
  variant?: 'text' | 'circular' | 'rectangular' | 'card'
  width?: string | number
  height?: string | number
}

export const Skeleton: React.FC<SkeletonProps> = React.memo(({
  className = '',
  variant = 'text',
  width,
  height,
}) => {
  const baseClass = 'skeleton'

  const variantClasses = {
    text: 'h-4 w-full rounded-md',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
    card: 'rounded-2xl h-48 w-full',
  }

  return (
    <div
      className={`${baseClass} ${variantClasses[variant]} ${className}`}
      style={{ width, height }}
    />
  )
})

export const SkeletonCard: React.FC<{ className?: string }> = React.memo(({ className = '' }) => (
  <div className={`rounded-2xl bg-white p-4 md:p-5 space-y-4 shadow-card ${className}`}>
    <div className="flex items-center gap-3">
      <Skeleton variant="circular" width={40} height={40} />
      <div className="flex-1 space-y-2">
        <Skeleton className="w-3/4" />
        <Skeleton className="w-1/2" />
      </div>
    </div>
    <Skeleton variant="rectangular" className="h-16" />
    <div className="flex gap-2">
      <Skeleton className="w-16 h-6 rounded-full" />
      <Skeleton className="w-12 h-6 rounded-full" />
    </div>
  </div>
))

export const SkeletonList: React.FC<{
  count?: number
  className?: string
}> = React.memo(({ count = 5, className = '' }) => (
  <div className={`space-y-3 ${className}`}>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="rounded-xl bg-white p-4 shadow-card flex items-center gap-4">
        <Skeleton variant="circular" width={36} height={36} />
        <div className="flex-1 space-y-2">
          <Skeleton className="w-1/3" />
          <Skeleton className="w-2/3" />
        </div>
        <Skeleton className="w-16 h-6 rounded-full" />
      </div>
    ))}
  </div>
))

export default Skeleton
