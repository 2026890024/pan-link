import { useState, useEffect } from 'react'

export function useBackToTop(threshold = 400) {
  const [showBackToTop, setShowBackToTop] = useState(false)

  useEffect(() => {
    const handler = () => {
      setShowBackToTop(window.scrollY > threshold)
    }
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [threshold])

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return { showBackToTop, scrollToTop }
}
