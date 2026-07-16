import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      // 跳过不必要的插件加载
      babel: { babelrc: false, configFile: false },
    }),
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {
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
    // 目标设为 es2020 以获得更小体积（支持 95%+ 浏览器）
    target: 'es2020',
    // 生产环境不生成 sourcemap
    sourcemap: false,
    // CSS 代码分割
    cssCodeSplit: true,
    // 模块预加载优化：关闭 polyfill（现代浏览器原生支持）
    modulePreload: {
      polyfill: false,
    },
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-core': ['react', 'react-dom', 'react-router-dom'],
          'vendor-animation': ['framer-motion'],
          'vendor-utils': ['@tanstack/react-query', 'zustand'],
          'vendor-icons': ['lucide-react'],
        },
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
    minify: 'esbuild',
    esbuild: {
      drop: ['console', 'debugger'],
    },
    chunkSizeWarningLimit: 500,
    // 小于此大小的资源内联为 base64，减少 HTTP 请求
    assetsInlineLimit: 8192,
  },
})
