# 修复工资运行：`column e.status does not exist`

`employees` 表已迁移为 `system_status` / `employment_status`，若数据库函数仍引用 `e.status` 或 `employees.status`，运行工资时会报错。

函数定义**在 Supabase 数据库中**，不在本仓库；需导出 → 替换 → 在 SQL Editor 中 `CREATE OR REPLACE` 更新。

---

## 调用链（便于排查）

应用调用 `api_run_payroll_v2` → 内部 `perform run_payroll_v2` → `run_payroll_v2` 内先 **`perform run_payroll(v_month)`**，再处理分摊等。

因此 **`e.status` 多数在 `run_payroll` 内**，只改 `run_payroll_v2` 往往不够；若仍报错，必须导出并修补 **`run_payroll`**。

---

## A. 修补 `run_payroll`（仍报 `e.status` 时必做）

### 1. 导出函数全文

在 **SQL Editor** 执行 `payroll_export_run_payroll.sql` 中的 **查询 1**。

- 复制 **`definition`** 的**完整内容**；界面可能只显示中间几行，请用 **Export → CSV** 或选中单元格 **全选复制**。
- 保存为 **`scripts/run_payroll.raw.sql`**，内容必须是**纯 SQL**：以 `CREATE OR REPLACE FUNCTION` 开头，**不要**首尾多一层 JSON 双引号。

### 2. 本地生成修补后的 SQL

在项目根目录执行：

```bash
node scripts/patch-payroll-v2-function.mjs scripts/run_payroll.raw.sql > scripts/run_payroll.fixed.sql
```

打开 `scripts/run_payroll.fixed.sql` 确认：完整 `CREATE OR REPLACE FUNCTION`，结尾为 `$function$;` 或 `$$;`。

> **说明**：脚本将 `employees.status` → `employees.system_status`、`e.status` → `e.system_status`。若使用别名 `emp.status` 等，需手工改。

### 3. 在 Supabase 执行

粘贴 **`scripts/run_payroll.fixed.sql` 全文**到 SQL Editor，**Run**。

---

## B. 修补 `api_run_payroll_v2`（可选，多为薄封装）

### 1. 导出函数全文

执行 `payroll_v2_export_function.sql` 中的 **查询 1**（或查询 2/3 处理多重重载）。

将内容保存为 `scripts/api_run_payroll_v2.raw.sql`。

### 2. 本地生成修补后的 SQL

```bash
node scripts/patch-payroll-v2-function.mjs scripts/api_run_payroll_v2.raw.sql > scripts/api_run_payroll_v2.fixed.sql
```

### 3. 在 Supabase 执行

粘贴 `scripts/api_run_payroll_v2.fixed.sql` 全文，**Run**。

---

## 验证

在应用中打开 **薪酬管理**，再次执行 **运行工资计算**。

若仍有报错，把**新错误信息**或仍含 `status` 的函数片段（可脱敏）发出来继续排查。

---

## 一键重算脚本（推荐）

若你已完成函数修补，可直接在 Supabase SQL Editor 执行：

- `scripts/payroll_recalc_month_safe.sql`

它会自动完成：

1. 定位并临时关闭 `payroll_month` 的“锁定不可修改”触发器  
2. 将目标月 `locked` 记录改为 `draft`  
3. 调用 `api_run_payroll_v2(v_month)` 运行工资与分摊  
4. 自动恢复触发器并输出该月结果

> 使用前只需把文件内的 `DATE '2026-03-01'` 改成你的目标月份首日。

---

## 仓库内相关文件

| 文件 | 作用 |
|------|------|
| `scripts/payroll_export_run_payroll.sql` | 导出 / 定位 `run_payroll` |
| `scripts/payroll_v2_export_function.sql` | 导出 / 定位 `api_run_payroll_v2` |
| `scripts/patch-payroll-v2-function.mjs` | 本地替换后生成 `.fixed.sql` |
| `scripts/payroll_recalc_month_safe.sql` | 自动解锁 → 重算 → 恢复触发器 |
| `scripts/migrate_employees_status_to_system_status.sql` | 表结构迁移背景（参考） |
