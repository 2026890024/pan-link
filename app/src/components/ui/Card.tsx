import React from 'react'

interface CardProps {
  children: React.ReactNode
  className?: string
  hover?: boolean
  glass?: boolean
  padding?: 'none' | 'sm' | 'md' | 'lg'
  onClick?: () => void
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  hover = false,
  glass = false,
  padding = 'md',
  onClick,
}) => {
  const paddings = {
    none: '',
    sm: 'p-3',
    md: 'p-4 md:p-5',
    lg: 'p-5 md:p-6',
  }

  return (
    <div
      className={`
        rounded-2xl overflow-hidden
        ${glass ? 'glass' : 'bg-white shadow-card'}
        ${hover ? 'card-hover cursor-pointer' : ''}
        ${paddings[padding]}
        ${className}
      `}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

export default Card
