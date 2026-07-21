import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

export default function PageProgressBar() {
  const location = useLocation()

  useEffect(() => {
    const bar = document.createElement('div')
    bar.className = 'bar'
    const peg = document.createElement('div')
    peg.className = 'peg'
    bar.appendChild(peg)

    let container = document.getElementById('nprogress')
    if (!container) {
      container = document.createElement('div')
      container.id = 'nprogress'
      document.body.appendChild(container)
    }
    container.appendChild(bar)

    // 启动动画
    bar.style.transition = 'none'
    bar.style.width = '0%'
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    bar.offsetHeight // 强制回流
    bar.style.transition = 'width 0.4s cubic-bezier(0.22, 0.61, 0.36, 1)'
    bar.style.width = '40%'

    const timer1 = setTimeout(() => {
      bar.style.width = '75%'
    }, 200)

    const timer2 = setTimeout(() => {
      bar.style.width = '100%'
      bar.style.transition = 'width 0.2s ease-in'
      setTimeout(() => {
        bar.remove()
      }, 250)
    }, 600)

    return () => {
      clearTimeout(timer1)
      clearTimeout(timer2)
      bar.remove()
    }
  }, [location.pathname])

  return null
}
