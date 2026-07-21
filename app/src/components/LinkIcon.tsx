import type { LinkItem } from '@/store/useDataStore'

interface LinkIconProps {
  link: LinkItem
  size?: 'sm' | 'md' | 'lg'
}

const sizeClasses = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-12 h-12',
}

const colors: Record<string, string> = {
  baidu: 'bg-gradient-to-br from-blue-500 to-blue-600',
  quark: 'bg-gradient-to-br from-purple-500 to-purple-600',
  aliyun: 'bg-gradient-to-br from-red-500 to-orange-500',
  lanzou: 'bg-gradient-to-br from-orange-500 to-amber-500',
  xunlei: 'bg-gradient-to-br from-cyan-500 to-blue-500',
}

const names: Record<string, string> = {
  baidu: '百度',
  quark: '夸克',
  aliyun: '阿里',
  lanzou: '蓝奏',
  xunlei: '迅雷',
}

export function LinkIcon({ link, size = 'md' }: LinkIconProps) {
  if (link.icon) {
    return (
      <img
        src={link.icon}
        alt={link.title || link.name}
        className={`${sizeClasses[size]} rounded-xl object-cover flex-shrink-0 shadow-sm`}
        loading="lazy"
        decoding="async"
      />
    )
  }

  return (
    <div
      className={`${sizeClasses[size]} rounded-xl ${colors[link.drive_type] || 'bg-gradient-to-br from-gray-400 to-gray-500'} flex items-center justify-center text-white font-bold flex-shrink-0 shadow-sm`}
      style={{ fontSize: size === 'sm' ? '0.625rem' : size === 'lg' ? '0.875rem' : '0.75rem' }}
    >
      {names[link.drive_type] || '网'}
    </div>
  )
}

