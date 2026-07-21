import { useEffect, useCallback, useRef } from 'react'
import { Loader2, AlertTriangle, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning' | 'info'
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '确认',
  cancelLabel = '取消',
  variant = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  // Esc 关闭 + 焦点陷阱
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel()
      return
    }
    if (e.key === 'Tab' && modalRef.current) {
      const focusable = modalRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      if (focusable.length === 0) {return}
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
  }, [onCancel])

  useEffect(() => {
    if (!open) {return}

    previousFocusRef.current = document.activeElement as HTMLElement
    document.addEventListener('keydown', handleKeyDown)

    // iOS Safari 兼容滚动锁定
    const scrollY = window.scrollY
    const originalPosition = document.body.style.position
    const originalTop = document.body.style.top
    const originalWidth = document.body.style.width
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.width = '100%'

    // 聚焦确认按钮（最常用操作）
    requestAnimationFrame(() => {
      const focusable = modalRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      // 聚焦第一个按钮（取消），让用户可以 Tab 到确认按钮
      focusable?.[0]?.focus()
    })

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.position = originalPosition
      document.body.style.top = originalTop
      document.body.style.width = originalWidth
      window.scrollTo(0, scrollY)
      previousFocusRef.current?.focus()
    }
  }, [open, handleKeyDown])

  const variantStyles = {
    danger: { bg: 'bg-red-600 hover:bg-red-700', ring: 'ring-red-300', icon: 'text-red-500' },
    warning: { bg: 'bg-amber-500 hover:bg-amber-600', ring: 'ring-amber-300', icon: 'text-amber-500' },
    info: { bg: 'bg-brand-600 hover:bg-brand-700', ring: 'ring-brand-300', icon: 'text-brand-500' },
  }
  const styles = variantStyles[variant]

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            key="confirm-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onCancel}
          />
          <motion.div
            key="confirm-dialog"
            ref={modalRef}
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ type: 'spring', stiffness: 450, damping: 28 }}
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
        {/* 关闭按钮：纯图标，hover 出灰底 */}
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 w-8 h-8 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg flex items-center justify-center transition-colors cursor-pointer touch-manipulation border-none outline-none"
          aria-label="关闭"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className={`w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center ${styles.icon}`}>
            <AlertTriangle className="w-5 h-5" />
          </div>
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
        </div>

        <p className="text-sm text-gray-600 mb-6 leading-relaxed">{message}</p>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 font-medium text-sm text-gray-600 transition-colors cursor-pointer touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 py-2.5 ${styles.bg} text-white rounded-xl font-medium text-sm transition-all hover:shadow-md focus:outline-none focus:ring-2 ${styles.ring} focus:ring-offset-1 cursor-pointer touch-manipulation disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
