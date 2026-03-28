"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import styles from "./page.module.css";

type Profile = { role: string | null; store_id: string | null } | null;

type Employee = { id: string; emp_no: string; name: string };

type PayrollRow = {
  id: string;
  month: string;
  employee_id: string;
  total_days: number;
  base_pay: number;
  position_pay: number;
  subsidy_pay: number;
  meal_allowance_total: number;
  attendance_bonus: number;
  overtime_hours_total: number;
  overtime_pay: number;
  performance_total: number;
  store_bonus_total: number;
  adjustment_manual: number;
  gross_total: number;
  store_approved_at: string | null;
};

function monthStartISO(input: string) {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}-01`;
}

function isStoreManager(profile: Profile): boolean {
  return profile?.role === "store_manager" && !!profile?.store_id;
}

export default function PayrollVerifyPage() {
  const [profile, setProfile] = useState<Profile>(null);
  const [storeName, setStoreName] = useState<string>("");
  const [month, setMonth] = useState<string>(() => monthStartISO(new Date().toISOString()));
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [linkedSelfEmployee, setLinkedSelfEmployee] = useState<{
    name: string | null;
    emp_no: string | null;
  } | null>(null);
  const [linkedSelfChecked, setLinkedSelfChecked] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user ?? null;
      if (!user) {
        setProfile(null);
        setLinkedSelfEmployee(null);
        setLinkedSelfChecked(false);
        setLoading(false);
        return;
      }
      const { data: profileData } = await supabase
        .from("users_profile")
        .select("role, store_id")
        .eq("user_id", user.id)
        .maybeSingle();
      const p: Profile = profileData
        ? { role: profileData.role ?? null, store_id: profileData.store_id ?? null }
        : null;
      setProfile(p);
      if (!isStoreManager(p) || !p?.store_id) {
        setLinkedSelfEmployee(null);
        setLinkedSelfChecked(true);
        setLoading(false);
        return;
      }
      const { data: storeData } = await supabase
        .from("stores")
        .select("name")
        .eq("id", p.store_id)
        .maybeSingle();
      setStoreName(storeData?.name ?? "本门店");
      const { data: linkEmp } = await supabase
        .from("employees")
        .select("name, emp_no")
        .eq("user_id", user.id)
        .maybeSingle();
      setLinkedSelfEmployee(linkEmp ?? null);
      setLinkedSelfChecked(true);
      setLoading(false);
    })();
  }, []);

  const loadData = useCallback(async () => {
    if (!profile?.store_id || !month) return;
    setMsg("加载中...");
    const { data: empData, error: empErr } = await supabase
      .from("employees")
      .select("id, emp_no, name")
      .eq("home_store_id", profile.store_id)
      .order("name");
    if (empErr) {
      setMsg("员工加载失败：" + empErr.message);
      setRows([]);
      return;
    }
    const empList = (empData ?? []) as Employee[];
    setEmployees(empList);
    if (empList.length === 0) {
      setRows([]);
      setMsg("本店暂无员工");
      return;
    }
    const ids = empList.map((e) => e.id);
    const { data: payrollData, error: payrollErr } = await supabase
      .from("payroll_month")
      .select("id,month,employee_id,total_days,base_pay,position_pay,subsidy_pay,meal_allowance_total,attendance_bonus,overtime_hours_total,overtime_pay,performance_total,store_bonus_total,adjustment_manual,gross_total,store_approved_at")
      .eq("month", month)
      .in("employee_id", ids)
      .order("gross_total", { ascending: false });
    if (payrollErr) {
      setMsg("工资数据加载失败：" + payrollErr.message);
      setRows([]);
      return;
    }
    setRows((payrollData ?? []) as PayrollRow[]);
    setMsg("");
  }, [profile?.store_id, month]);

  useEffect(() => {
    if (!profile || !isStoreManager(profile) || !profile.store_id) return;
    loadData();
  }, [profile, month, loadData]);

  const approveStoreMonth = async () => {
    if (!profile?.store_id || !month) {
      setMsg("请选择月份");
      return;
    }
    setMsg("提交审核中...");
    const { error } = await supabase.rpc("api_store_approve_payroll_month", {
      p_month: month,
      p_store_id: profile.store_id,
    });
    if (error) {
      setMsg("审核失败：" + error.message);
      return;
    }
    setMsg("审核通过，已更新");
    await loadData();
  };

  const empName = (employeeId: string) => {
    const e = employees.find((x) => x.id === employeeId);
    return e ? `${e.name}（${e.emp_no}）` : employeeId;
  };

  if (loading) {
    return (
      <main className="page-container">
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.75rem", marginBottom: "1.5rem" }}>
          <h1 className="heading-1" style={{ marginBottom: 0 }}>薪资核对</h1>
          <Link href="/" className="btn btn-outline btn-sm">
            返回主页
          </Link>
        </div>
        <p className="muted-text">加载中…</p>
      </main>
    );
  }

  if (!isStoreManager(profile) || !profile?.store_id) {
    return (
      <main className="page-container">
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.75rem", marginBottom: "1.5rem" }}>
          <h1 className="heading-1" style={{ marginBottom: 0 }}>薪资核对</h1>
          <Link href="/" className="btn btn-outline btn-sm">
            返回主页
          </Link>
        </div>
        <p className="muted-text">仅店长可访问，请使用店长账号登录。</p>
      </main>
    );
  }

  return (
    <main className={`page-container ${styles.wrap}`}>
      <div className={styles.toolbar}>
        <h1 className="heading-1" style={{ marginBottom: 0 }}>
          薪资核对
        </h1>
        <Link href="/" className="btn btn-outline btn-sm">
          返回主页
        </Link>
      </div>
      <p className="muted-text" style={{ marginTop: "0.5rem" }}>
        {storeName} · 审核本店当月工资，供财务确认提交
      </p>

      {linkedSelfChecked && !linkedSelfEmployee ? (
        <div
          className="card"
          style={{
            marginTop: "1rem",
            padding: "1rem 1.25rem",
            borderColor: "color-mix(in srgb, var(--secondary) 40%, var(--border))",
            background: "color-mix(in srgb, var(--secondary) 8%, var(--card-bg))",
          }}
        >
          <p className="body-text" style={{ margin: 0, fontWeight: 600 }}>
            尚未绑定本人员工档案
          </p>
          <p className="field-hint" style={{ marginTop: "0.5rem", marginBottom: "0.75rem" }}>
            本人工资出现在列表前，需先在「员工入职」建档并勾选绑定登录账号，并完成投保与工时录入。
          </p>
          <Link href="/employees/new" className="btn btn-primary btn-sm" style={{ display: "inline-flex" }}>
            去员工入职
          </Link>
        </div>
      ) : null}

      {linkedSelfChecked && linkedSelfEmployee ? (
        <p className="field-hint" style={{ marginTop: "1rem" }}>
          本人档案：{linkedSelfEmployee.name ?? "—"}（{linkedSelfEmployee.emp_no ?? "—"}）· 列表中应包含本人工资行（需财务已跑算薪）。
        </p>
      ) : null}

      <div className={styles.toolbar} style={{ marginTop: "1.25rem" }}>
        <div className="field">
          <label className="field-label">月份</label>
          <input
            type="month"
            value={month.slice(0, 7)}
            onChange={(e) => setMonth(e.target.value ? `${e.target.value}-01` : "")}
            className="input"
            style={{ width: "auto", minWidth: "10rem" }}
          />
        </div>
        <button
          type="button"
          onClick={approveStoreMonth}
          disabled={!month || rows.length === 0}
          className="btn btn-primary"
        >
          审核通过（本店本月）
        </button>
      </div>

      {msg ? <p className="muted-text" style={{ marginTop: "0.75rem" }}>{msg}</p> : null}

      <section style={{ marginTop: "1.25rem" }}>
        <h2 className="heading-2" style={{ marginBottom: "0.375rem" }}>
          本店该月工资列表
        </h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>员工</th>
                <th className={styles.th}>天数</th>
                <th className={styles.th}>基本工资</th>
                <th className={styles.th}>岗位工资</th>
                <th className={styles.th}>补贴</th>
                <th className={styles.th}>餐补</th>
                <th className={styles.th}>全勤奖</th>
                <th className={styles.th}>加班费</th>
                <th className={styles.th}>绩效</th>
                <th className={styles.th}>门店奖金</th>
                <th className={styles.th}>调整</th>
                <th className={styles.th}>总工资</th>
                <th className={styles.th}>审核</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td className={styles.td} colSpan={13}>
                    本店该月暂无工资数据；请由财务先运行工资计算。
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td className={styles.td}>{empName(r.employee_id)}</td>
                    <td className={styles.td}>{r.total_days}</td>
                    <td className={styles.td}>{Number(r.base_pay).toFixed(2)}</td>
                    <td className={styles.td}>{Number(r.position_pay).toFixed(2)}</td>
                    <td className={styles.td}>{Number(r.subsidy_pay).toFixed(2)}</td>
                    <td className={styles.td}>{Number(r.meal_allowance_total).toFixed(2)}</td>
                    <td className={styles.td}>{Number(r.attendance_bonus).toFixed(2)}</td>
                    <td className={styles.td} title={`加班 ${Number(r.overtime_hours_total)} 小时`}>
                      {Number(r.overtime_pay).toFixed(2)}
                      {Number(r.overtime_hours_total) > 0 && (
                        <span style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", marginLeft: "0.25rem" }}>
                          ({Number(r.overtime_hours_total)}h)
                        </span>
                      )}
                    </td>
                    <td className={styles.td}>{Number(r.performance_total).toFixed(2)}</td>
                    <td className={styles.td}>{Number(r.store_bonus_total).toFixed(2)}</td>
                    <td className={styles.td}>{Number(r.adjustment_manual).toFixed(2)}</td>
                    <td className={styles.td} style={{ fontWeight: 600 }}>
                      {Number(r.gross_total).toFixed(2)}
                    </td>
                    <td className={styles.td}>
                      {r.store_approved_at ? "已审核" : "待审核"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
