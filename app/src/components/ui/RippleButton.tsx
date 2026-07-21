import { type ButtonHTMLAttributes, useCallback, useRef, type MouseEvent } from 'react'

interface RippleButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  rippleColor?: string
}

export default function RippleButton({
  children,
  className = '',
  rippleColor,
  onClick,
  ...props
}: RippleButtonProps) {
  const btnRef = useRef<HTMLButtonElement>(null)

  const createRipple = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      const button = btnRef.current
      if (!button) {
        return
      }

      const rect = button.getBoundingClientRect()
      const size = Math.max(rect.width, rect.height)
      const x = e.clientX - rect.left - size / 2
      const y = e.clientY - rect.top - size / 2

      const ripple = document.createElement('span')
      ripple.className = 'ripple-effect'
      ripple.style.left = `${x}px`
      ripple.style.top = `${y}px`
      ripple.style.width = `${size}px`
      ripple.style.height = `${size}px`
      if (rippleColor) {
        ripple.style.background = rippleColor
      }

      button.appendChild(ripple)

      ripple.addEventListener('animationend', () => {
        ripple.remove()
      })
    },
    [rippleColor],
  )

  const handleClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      createRipple(e)
      onClick?.(e)
    },
    [createRipple, onClick],
  )

  return (
    <button
      ref={btnRef}
      className={`ripple-container ${className}`}
      onClick={handleClick}
      {...props}
    >
      {children}
    </button>
  )
}
