# 资源云 - 网盘资源聚合平台 V2

基于 React + TypeScript + Cloudflare D1 构建的网盘资源链接管理平台，前后台分离架构。

## 技术栈

- **前端框架**: React 18 + TypeScript
- **UI 框架**: Tailwind CSS + Radix UI 组件
- **路由**: React Router v7
- **状态管理**: Zustand + React Query (服务端缓存)
- **图表**: Recharts
- **动画**: Framer Motion
- **数据库**: Cloudflare D1 (SQLite)
- **部署**: Cloudflare Pages + Pages Functions
- **构建工具**: Vite 6

## 项目结构

```
├── app/                        # React 前端应用
│   ├── src/
│   │   ├── services/
│   │   │   └── dataService.ts  # 统一数据服务层 (D1 API + localStorage 双轨)
│   │   ├── hooks/
│   │   │   ├── useDataQuery.ts # React Query hooks (缓存 + 自动刷新)
│   │   │   └── useAuth.ts      # 认证 hook (本地认证)
│   │   ├── store/
│   │   │   └── useDataStore.ts # Zustand store (与 dataService 双向同步)
│   │   ├── components/
│   │   │   └── AdminAuthGuard.tsx  # 后台路由守卫
│   │   ├── layouts/
│   │   │   ├── PublicLayout.tsx    # 前台布局
│   │   │   └── AdminLayout.tsx     # 后台布局
│   │   ├── pages/
│   │   │   ├── frontend/           # 前台页面 (首页/详情/分类/搜索)
│   │   │   ├── admin/              # 后台页面 (仪表盘/资源/数据/设置)
│   │   │   └── auth/               # 登录页
│   │   ├── App.tsx                 # 路由 + 懒加载
│   │   └── main.tsx                # 入口 (React Query Provider)
│   ├── .env.example                # 环境变量示例
│   └── package.json
├── functions/                  # Cloudflare Pages Functions (生产 API)
│   └── api/[[route]].ts        # REST API 路由
├── worker/                     # Cloudflare Worker (开发/备用 API)
│   └── src/index.js            # Worker API 逻辑
├── d1-schema.sql               # D1 数据库建表脚本
└── README.md
```

## 数据存储策略 (双轨架构)

项目采用**智能双轨存储**，自动判断使用哪种后端：

| 条件 | 存储方式 | 说明 |
|------|----------|------|
| 生产环境 (Pages Functions) | **D1 (SQLite)** | 持久化存储，多端共享，通过同域 API 访问 |
| 开发环境 / 离线 | **localStorage** | 本地存储，即时可用，无需后端 |

- 部署到 Cloudflare Pages 后自动使用 D1 + Pages Functions
- 本地开发时自动回退到 localStorage 模式
- **所有前端页面代码无需修改**，自动适配

## 快速开始

### 1. 安装依赖

```bash
cd app
npm install
```

### 2. 本地开发

直接运行，使用 localStorage 存储 mock 数据：

```bash
npm run dev
```

打开 http://localhost:5173

### 3. 部署到 Cloudflare Pages

```bash
# 构建
npm run build

# 部署 (需要先安装 wrangler 并登录)
npx wrangler pages deploy dist --branch main
```

API 通过 Pages Functions 同域部署，无需额外配置。需要先在 Cloudflare Dashboard 创建 D1 数据库并绑定到 Pages 项目，然后执行 `d1-schema.sql` 建表。

**必需环境变量** (Cloudflare Pages → Settings → Environment variables):

| 变量名 | 说明 |
|--------|------|
| `ADMIN_USER` | 管理员用户名 |
| `ADMIN_PASS` | 管理员密码 |
| `JWT_SECRET` | JWT 签名密钥（随机字符串） |

## 性能优化

- ✅ **懒加载**: 后台管理页面按需加载，不影响前台首屏
- ✅ **代码分割**: React、图表库等独立 chunk
- ✅ **React Query 缓存**: 5分钟数据新鲜度，30分钟垃圾回收
- ✅ **Vite 构建优化**: esbuild 压缩 + console 移除
- ✅ **静态资源强缓存**: assets 文件 1 年缓存期
- ✅ **API 缓存**: GET 请求 60 秒 CDN 缓存

## 后台管理

| 页面 | 路径 | 功能 |
|------|------|------|
| 资源管理 | `/admin` | 分类树 + 链接 CRUD + 置顶/精选 |
| 网盘类型 | `/admin/drive-types` | 网盘类型管理 |
| 仪表盘 | `/admin/dashboard` | KPI + 趋势图 + 热门排行 |
| 个人中心 | `/admin/profile` | 账号 + 分类/标签管理 |
| 数据管理 | `/admin/data` | 导出/导入/分享管理 |
| 首页设置 | `/admin/homepage-settings` | 首页分类可见性 |
| 账户设置 | `/admin/account` | 账户信息 + 登录凭证 |
| 站点设置 | `/admin/site-settings` | 站点全局配置 |

## 后台登录

- 凭证通过 Cloudflare Pages 环境变量 (`ADMIN_USER` / `ADMIN_PASS`) 配置
- 登录使用 HMAC-SHA256 JWT 认证，token 有效期 8 小时
- 本地开发模式：在账户设置页面设置用户名密码（SHA-256 哈希存储）

## License

MIT
