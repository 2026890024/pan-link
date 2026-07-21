import { Sun, Moon } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useThemeStore } from '@/store/useThemeStore'

interface ThemeToggleProps {
  className?: string
}

export default function ThemeToggle({ className = '' }: ThemeToggleProps) {
  const { resolved, toggle } = useThemeStore()

  return (
    <motion.button
      onClick={toggle}
      className={`relative inline-flex items-center justify-center w-9 h-9 rounded-xl text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-gray-100 dark:hover:bg-slate-700/60 transition-colors cursor-pointer ${className}`}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.92 }}
      aria-label={resolved === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
      title={resolved === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
    >
      <AnimatePresence mode="wait" initial={false}>
        {resolved === 'dark' ? (
          <motion.span
            key="moon"
            initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            exit={{ rotate: 90, opacity: 0, scale: 0.5 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26, mass: 0.5 }}
            className="theme-toggle-icon"
          >
            <Moon className="w-4 h-4" />
          </motion.span>
        ) : (
          <motion.span
            key="sun"
            initial={{ rotate: 90, opacity: 0, scale: 0.5 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            exit={{ rotate: -90, opacity: 0, scale: 0.5 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26, mass: 0.5 }}
            className="theme-toggle-icon"
          >
            <Sun className="w-4 h-4" />
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  )
}
