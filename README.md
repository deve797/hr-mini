# HR Mini

人事管理（Next.js App Router + Supabase）。

## 环境要求

- Node.js（与 Next 16 兼容的版本）
- **包管理：仅使用 npm**（勿用 pnpm/yarn 锁文件）

## 配置 Supabase

1. 复制环境变量模板：

   ```bash
   cp .env.example .env.local
   ```

2. 在 [.env.example](.env.example) 中列出的键名对应填入 Supabase 项目 **Project Settings → API** 中的值：

   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

3. 不要将 `.env.local` 提交到 Git。

## 本地开发

```bash
npm install
npm run dev
```

默认开发地址：<http://localhost:3000>（若端口占用，Next 会选用其他端口，以终端输出为准）。

## 构建与生产启动

```bash
npm run build
npm run start
```

## RLS 与安全

数据库行级安全策略请在 Supabase Dashboard 中核对，详见 [docs/supabase-rls-checklist.md](docs/supabase-rls-checklist.md)。

## 关键路由（App Router）

页面位于 `app/**/page.tsx`，例如：`/`、`/login`、`/me`、`/employees/new`、`/insurance-request`、`/store-staff`、`/workdays`、`/dashboard`、`/insurance`、`/payroll`。

## 网络与 VPN

若浏览器无法连接 Supabase：检查 DNS、系统/浏览器代理、以及是否能解析 `*.supabase.co` 域名。
