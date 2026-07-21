import { type ReactNode, useState } from 'react'

type TooltipPosition = 'top' | 'bottom' | 'left' | 'right'

interface TooltipProps {
  content: string
  children: ReactNode
  position?: TooltipPosition
  delay?: number
}

export default function Tooltip({
  content,
  children,
  position = 'top',
  delay = 300,
}: TooltipProps) {
  const [visible, setVisible] = useState(false)

  return (
    <div
      className={`tooltip-wrapper tooltip-${position}`}
      onMouseEnter={() => setTimeout(() => setVisible(true), delay)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div className="tooltip-content" role="tooltip">
          {content}
        </div>
      )}
    </div>
  )
}
