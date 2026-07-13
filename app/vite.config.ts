import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {
        // 本地开发时运行: npx wrangler pages dev
        target: 'http://localhost:8788',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // 代码分割：将大型依赖拆分为独立 chunk
    rollupOptions: {
      output: {
        manualChunks: {
          // React 核心
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // UI 组件库
          'vendor-ui': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-select', '@radix-ui/react-tabs', '@radix-ui/react-switch'],
          // 图表库
          'vendor-charts': ['recharts'],
          // 动画
          'vendor-animation': ['framer-motion'],
          // 图表/工具
          'vendor-utils': ['@tanstack/react-query', '@tanstack/react-table', 'zustand'],
          // 图标
          'vendor-icons': ['lucide-react'],
        },
        // 资源命名
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
    // 压缩（使用内置 esbuild）
    minify: 'esbuild',
    // 生产环境移除 console 和 debugger
    esbuild: {
      drop: ['console', 'debugger'],
    },
    // 提高 chunk 大小警告阈值
    chunkSizeWarningLimit: 1000,
  },
})
