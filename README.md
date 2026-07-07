# 资源云 - 网盘资源聚合平台 V2

基于 React + TypeScript + Supabase 构建的网盘资源链接管理平台，前后台分离架构。

## 技术栈

- **前端框架**: React 18 + TypeScript
- **UI 框架**: Tailwind CSS + Radix UI 组件
- **路由**: React Router v7
- **状态管理**: Zustand + React Query (服务端缓存)
- **图表**: Recharts
- **动画**: Framer Motion
- **数据库**: Supabase (PostgreSQL)
- **构建工具**: Vite 6

## 项目结构

```
app/
├── src/
│   ├── services/
│   │   └── dataService.ts     # 统一数据服务层 (Supabase + localStorage 双轨)
│   ├── hooks/
│   │   ├── useDataQuery.ts    # React Query hooks (缓存 + 自动刷新)
│   │   └── useAuth.ts         # 认证 hook (Supabase Auth + 本地回退)
│   ├── store/
│   │   └── useDataStore.ts    # Zustand store (与 dataService 双向同步)
│   ├── components/
│   │   └── AdminAuthGuard.tsx  # 后台路由守卫
│   ├── layouts/
│   │   ├── PublicLayout.tsx    # 前台布局
│   │   └── AdminLayout.tsx     # 后台布局
│   ├── pages/
│   │   ├── frontend/           # 前台页面 (首页/详情/分类/搜索)
│   │   ├── admin/              # 后台页面 (仪表盘/资源/个人/数据/设置)
│   │   └── auth/               # 登录页
│   ├── App.tsx                 # 路由 + 懒加载
│   └── main.tsx                # 入口 (React Query Provider)
├── vercel.json                 # Vercel 部署配置
├── .env.example                # 环境变量示例
└── package.json
```

## 数据存储策略 (双轨架构)

项目采用**智能双轨存储**，自动判断使用哪种后端：

| 条件 | 存储方式 | 说明 |
|------|----------|------|
| Supabase 已配置 | **PostgreSQL (Supabase)** | 持久化存储，多终端共享，可靠性高 |
| Supabase 未配置 | **localStorage** | 本地存储，即时可用，适合开发调试 |

- 配置 `.env` 中真实的 Supabase 凭据后，自动切换到 Supabase
- 保持占位值不变，自动使用 localStorage 模式
- **所有前端页面代码无需修改**，自动适配

## 快速开始

### 1. 安装依赖

```bash
cd app
npm install
```

### 2. 本地开发（无需 Supabase）

直接运行，使用 localStorage 存储 mock 数据：

```bash
npm run dev
```

打开 http://localhost:5173

### 3. 接入真实存储（可选）

创建 `.env` 文件：

```bash
cp .env.example .env
```

编辑 `.env`，填入 Supabase 项目凭据（从 [supabase.com](https://supabase.com) 获取）：

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

然后在 Supabase Dashboard SQL Editor 中运行 `supabase/migrations/001_initial_schema.sql`

## 部署到 Vercel + 自定义域名

### 部署步骤

1. 将代码推送到 GitHub 仓库
2. 登录 [Vercel](https://vercel.com)，导入 GitHub 项目
3. 构建配置自动识别（已配置 `vercel.json`）
4. 在 Vercel Dashboard 中配置环境变量：
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

### 自定义域名设置

1. Vercel Dashboard → Settings → Domains
2. 添加你的自定义域名（如 `pan.yourdomain.com`）
3. 在域名 DNS 管理中添加 CNAME 记录：
   ```
   pan  CNAME  cname.vercel-dns.com
   ```
4. SSL 证书自动签发（约 1-2 分钟生效）

### 后台登录

- **Supabase 模式**: 使用 Supabase Auth 注册的邮箱和密码
- **本地模式**: 用户名密码见 `src/config/auth.ts`

## 性能优化

- ✅ **懒加载**: 后台管理页面按需加载，不影响前台首屏
- ✅ **代码分割**: React、Supabase、图表库等独立 chunk
- ✅ **React Query 缓存**: 5分钟数据新鲜度，30分钟垃圾回收
- ✅ **Vite 构建优化**: Terser 压缩 + console 移除
- ✅ **静态资源强缓存**: assets 文件 1 年缓存期

## 后台管理

| 页面 | 路径 | 功能 |
|------|------|------|
| 资源管理 | `/admin` | 分类树 + 链接CRUD + 置顶/精选 |
| 网盘类型 | `/admin/drive-types` | 网盘类型管理 |
| 仪表盘 | `/admin/dashboard` | KPI + 趋势图 + 热门排行 |
| 个人中心 | `/admin/profile` | 账号 + 分类/标签管理 |
| 数据管理 | `/admin/data` | 导出/导入/分享管理 |
| 首页设置 | `/admin/homepage-settings` | 首页分类可见性 |

## License

MIT
