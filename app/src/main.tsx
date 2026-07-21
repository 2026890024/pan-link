import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'

// 在 React 渲染前初始化主题，避免暗黑模式 FOUC
;(function initTheme() {
  try {
    const theme = localStorage.getItem('panlink-theme')
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else if (!theme || theme === 'system') {
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.classList.add('dark')
      }
    }
  } catch { /* 静默失败，PPR 向后兼容 */ }
})()

// 配置 React Query - 优化缓存策略
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5分钟内数据视为新鲜
      retry: 2,                  // 失败重试2次
      refetchOnWindowFocus: false, // 切换窗口不重新请求
      gcTime: 1000 * 60 * 30,    // 30分钟垃圾回收
    },
    mutations: {
      retry: 1,
    },
  },
})

const rootEl = document.getElementById('root')
if (!rootEl) {throw new Error('Root element not found')}
ReactDOM.createRoot(rootEl).render(
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </QueryClientProvider>,
)
