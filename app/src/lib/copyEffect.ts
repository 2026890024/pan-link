/**
 * 触发复制成功粒子效果 + 底部弹出提示
 * 使用 CSS 动画驱动，GPU 加速，无 DOM 残留
 */
export function showCopyEffect(x: number, y: number) {
  const colors = ['#818CF8', '#A78BFA', '#6366F1', '#F472B6', '#34D399']
  const particleCount = 8

  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement('div')
    particle.className = 'copy-particle'
    const angle = (i / particleCount) * Math.PI * 2
    const distance = 30 + Math.random() * 40
    const px = Math.cos(angle) * distance
    const py = Math.sin(angle) * distance
    particle.style.cssText = `
      left: ${x}px;
      top: ${y}px;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: ${colors[i % colors.length]};
      --px: ${px}px;
      --py: ${py}px;
    `
    document.body.appendChild(particle)

    particle.addEventListener('animationend', () => {
      particle.remove()
    })
  }
}

export function showCopyToast(message = '已复制到剪贴板') {
  const toast = document.createElement('div')
  toast.className = 'copy-toast'
  toast.textContent = message
  document.body.appendChild(toast)

  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease'
    toast.style.opacity = '0'
    toast.style.transform = 'translateX(-50%) translateY(10px) scale(0.95)'
    toast.addEventListener('transitionend', () => toast.remove())
  }, 1800)

  // 兜底 (prefers-reduced-motion 不触发 transitionend)
  setTimeout(() => {
    if (toast.parentNode) toast.remove()
  }, 2500)
}
