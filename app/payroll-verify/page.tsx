"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import styles from "./page.module.css";

type Profile = { role: string | null; store_id: string | null } | null;

type Employee = { id: string; emp_no: string; name: string };

type PayrollRow = {
  id: string;
  month: string;
  employee_id: string;
  total_days: number;
  gross_total: number;
  performance_manual: number;
  bonus_manual: number;
  adjustment_manual: number;
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
  const router = useRouter();
  const [profile, setProfile] = useState<Profile>(null);
  const [storeName, setStoreName] = useState<string>("");
  const [month, setMonth] = useState<string>(() => monthStartISO(new Date().toISOString()));
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user ?? null;
      if (!user) {
        setProfile(null);
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
        setLoading(false);
        return;
      }
      const { data: storeData } = await supabase
        .from("stores")
        .select("name")
        .eq("id", p.store_id)
        .maybeSingle();
      setStoreName(storeData?.name ?? "本门店");
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
      .select("id,month,employee_id,total_days,gross_total,performance_manual,bonus_manual,adjustment_manual,store_approved_at")
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
        <h1 className="heading-1">薪资核对</h1>
        <p className="muted-text">加载中…</p>
      </main>
    );
  }

  if (!isStoreManager(profile) || !profile?.store_id) {
    return (
      <main className="page-container">
        <h1 className="heading-1">薪资核对</h1>
        <p className="muted-text">仅店长可访问，请使用店长账号登录。</p>
        <Link href="/dashboard" className="btn btn-outline" style={{ marginTop: "1rem" }}>
          返回工作台
        </Link>
      </main>
    );
  }

  return (
    <main className={`page-container ${styles.wrap}`}>
      <div className={styles.toolbar}>
        <h1 className="heading-1" style={{ marginBottom: 0 }}>
          薪资核对
        </h1>
        <Link href="/dashboard" className="btn btn-ghost btn-sm">
          返回工作台
        </Link>
      </div>
      <p className="muted-text" style={{ marginTop: "0.5rem" }}>
        {storeName} · 审核本店当月工资，供财务确认提交
      </p>

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
                <th className={styles.th}>总工资</th>
                <th className={styles.th}>绩效(手录)</th>
                <th className={styles.th}>奖金(手录)</th>
                <th className={styles.th}>调整(手录)</th>
                <th className={styles.th}>店长审核</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td className={styles.td} colSpan={7}>
                    本店该月暂无工资数据；请由财务先运行工资计算并填写绩效/奖金。
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td className={styles.td}>{empName(r.employee_id)}</td>
                    <td className={styles.td}>{r.total_days}</td>
                    <td className={styles.td}>{Number(r.gross_total).toFixed(2)}</td>
                    <td className={styles.td}>{r.performance_manual}</td>
                    <td className={styles.td}>{r.bonus_manual}</td>
                    <td className={styles.td}>{r.adjustment_manual}</td>
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
