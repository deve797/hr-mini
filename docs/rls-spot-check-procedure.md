# RLS 抽检操作（手工）

配合 [`supabase-rls-checklist.md`](supabase-rls-checklist.md) 使用：在**不改生产策略**的前提下，用「错误角色账号」验证关键表是否**拒绝越权**。

## 前置

- 在 Supabase 准备至少两个测试账号（或本地两个浏览器配置）：  
  - **A**：店长 `store_manager` + 绑定 `store_id = 门店 X`  
  - **B**：财务 `finance` 或总部 `hq`（与 A 不同店/不同权限）
- 应用已使用 Cookie 会话（`@supabase/ssr` + `middleware.ts`）；抽检时以**真实登录会话**为准。

## 抽检步骤（每条记录通过 / 失败）

### 1) `employees`

- 用 **店长 A** 登录，在「员工入职」尝试写入**非本店**员工（若界面无法选其他店，可在 SQL 或 Table Editor 用 A 的 JWT 测 `INSERT`，预期 **拒绝**）。
- 用 **财务 B** 登录，确认能否按业务需要看到全表或受限范围（与清单一致）。

### 2) `store_staff_pool`

- **店长 A**：仅能对 `store_id = 本店` 增删改；对其它 `store_id` 行 **拒绝**。
- **财务 B**：是否具备管理多店（与清单一致）。

### 3) `monthly_workdays`

- **店长 A**：`INSERT/UPDATE` 的 `store_id` 必须等于 `users_profile.store_id`，跨店 **拒绝**。

### 4) `payroll_month` / `payroll_store_split`（若走客户端查询）

- **店长 A**：应 **无法** 打开财务薪酬页或查询被拒（与 RLS 设计一致）；若业务允许店长只读部分列，则按清单核对 `SELECT`。
- **财务 B**：可读写/运行 RPC（与 `api_run_payroll_v2`、锁定策略一致）。

### 5) `insurance_requests`

- **店长 A**：仅能本店 `store_id`；**财务 B**：可处理待办（与页面一致）。

## 记录方式

在 [`supabase-rls-checklist.md`](supabase-rls-checklist.md) 对应小节勾选，并记下**失败时** Postgres 返回的 `42501` / `RLS` 相关文案，便于回溯 policy 名称。
