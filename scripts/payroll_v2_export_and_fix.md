# 修复 `api_run_payroll_v2`：`column e.status does not exist`

`employees` 表已迁移为 `system_status` / `employment_status`，若数据库函数仍引用 `e.status` 或 `employees.status`，运行工资时会报错。

函数定义**在 Supabase 数据库中**，不在本仓库；需导出 → 替换 → 在 SQL Editor 中 `CREATE OR REPLACE` 更新。

---

## 你需要在 Supabase 上完成的步骤

### 1. 导出函数全文

打开 **Supabase Dashboard → SQL Editor**，执行 `payroll_v2_export_function.sql` 中的 **查询 1**。

- 在结果中复制 **`definition`** 列的**完整内容**（从 `CREATE OR REPLACE FUNCTION` 到最后的 `$$;` 或等价结尾）。
- 若报错「多于一个函数」，先执行 **查询 2**，根据 `args` 用 **查询 3** 的写法，把函数签名填完整后再导出。

将内容保存为本地文件，例如项目根目录下的 `api_run_payroll_v2.raw.sql`。

### 2. 本地生成修补后的 SQL

在项目根目录执行：

```bash
node scripts/patch-payroll-v2-function.mjs api_run_payroll_v2.raw.sql > api_run_payroll_v2.fixed.sql
```

打开 `api_run_payroll_v2.fixed.sql` 快速扫一眼：应为完整的一段 `CREATE OR REPLACE FUNCTION`。

> **说明**：脚本只替换 `employees.status` → `employees.system_status`、`e.status` → `e.system_status`。若你的函数里还有别的别名（如 `emp.status`），需手工改或扩展脚本。

### 3. 在 Supabase 执行更新

在 **SQL Editor** 中粘贴 **`api_run_payroll_v2.fixed.sql` 全文**，点击 **Run**。

### 4. 验证

在应用中打开 **薪酬管理**，再次执行 **运行工资计算**。

若仍有报错，把**新错误信息**或函数里仍含 `status` 的片段（可脱敏）发出来继续排查。

---

## 仓库内相关文件

| 文件 | 作用 |
|------|------|
| `scripts/payroll_v2_export_function.sql` | 导出 / 定位函数的查询 |
| `scripts/patch-payroll-v2-function.mjs` | 本地替换后生成 `.fixed.sql` |
| `scripts/migrate_employees_status_to_system_status.sql` | 表结构迁移背景（参考） |
