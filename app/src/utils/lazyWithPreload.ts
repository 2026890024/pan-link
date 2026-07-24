import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

/**
 * 支持 preload 的 React.lazy 封装。
 * 用于后台侧边栏 hover 时预加载对应页面 chunk，避免点击后等待。
 */
export type PreloadableComponent<T extends ComponentType<any>> = LazyExoticComponent<T> & {
  preload: () => Promise<{ default: T }>
}

export function lazyWithPreload<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>
): PreloadableComponent<T> {
  const LazyComponent = lazy(importFn) as PreloadableComponent<T>
  let preloaded: Promise<{ default: T }> | null = null

  LazyComponent.preload = () => {
    if (!preloaded) {
      preloaded = importFn()
    }
    return preloaded
  }

  return LazyComponent
}
