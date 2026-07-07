import { AlertTriangle, X } from 'lucide-react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning' | 'info'
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
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null

  const variantStyles = {
    danger: { bg: 'bg-red-600 hover:bg-red-700', ring: 'ring-red-300', icon: 'text-red-500' },
    warning: { bg: 'bg-amber-500 hover:bg-amber-600', ring: 'ring-amber-300', icon: 'text-amber-500' },
    info: { bg: 'bg-brand-600 hover:bg-brand-700', ring: 'ring-brand-300', icon: 'text-brand-500' },
  }

  const styles = variantStyles[variant]

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in"
        onClick={onCancel}
      />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
        >
          <X className="w-4 h-4 text-gray-500" />
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
            className="flex-1 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 font-medium text-sm text-gray-600 transition-colors cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-2.5 ${styles.bg} text-white rounded-xl font-medium text-sm transition-all hover:shadow-md focus:outline-none focus:ring-2 ${styles.ring} focus:ring-offset-1 cursor-pointer`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
