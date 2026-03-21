#!/usr/bin/env node
/**
 * 将 api_run_payroll_v2 源码中 employees 的旧列 status 替换为 system_status。
 *
 * 用法（在项目根目录）：
 *   node scripts/patch-payroll-v2-function.mjs api_run_payroll_v2.raw.sql > api_run_payroll_v2.fixed.sql
 *
 * 将 api_run_payroll_v2.fixed.sql 全文粘贴到 Supabase SQL Editor 执行。
 */
import fs from "fs";

const path = process.argv[2];
if (!path) {
  console.error("用法: node scripts/patch-payroll-v2-function.mjs <导出的.sql文件路径>");
  process.exit(1);
}

let sql = fs.readFileSync(path, "utf8");

sql = sql.replace(/\bemployees\.status\b/g, "employees.system_status");
sql = sql.replace(/\be\.status\b/g, "e.system_status");

process.stdout.write(sql);
