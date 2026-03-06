"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import styles from "./payroll.module.css";

type Employee = {
  id: string;
  emp_no: string;
  name: string;
};

type PayrollMonthRow = {
  id: string;
  month: string;
  employee_id: string;
  total_days: number;
  gross_total: number;
  performance_manual: number;
  bonus_manual: number;
  adjustment_manual: number;
  status: "draft" | "locked";
};

type SplitRow = {
  id: string;
  month: string;
  employee_id: string;
  store_id: string;
  workdays: number;
  ratio: number;
  store_total: number;
};

type Store = {
  id: string;
  name: string;
};

function monthStartISO(input: string) {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}-01`;
}

export default function PayrollPage() {
  const [month, setMonth] = useState<string>("2026-03-01");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [rows, setRows] = useState<PayrollMonthRow[]>([]);
  const [splits, setSplits] = useState<SplitRow[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [msg, setMsg] = useState<string>("");

  const selectedEmployee = useMemo(
    () => employees.find((e) => e.id === selectedEmployeeId),
    [employees, selectedEmployeeId]
  );

  useEffect(() => {
    loadBase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!month) return;
    loadPayroll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  useEffect(() => {
    (async () => {
      const res = await supabase.auth.getUser();
      console.log("当前登录用户：", res.data.user);
    })();
  }, []);

  const loadBase = async () => {
    setMsg("加载基础数据...");
    const [empRes, storeRes] = await Promise.all([
      supabase.from("employees").select("id,emp_no,name").order("name"),
      supabase.from("stores").select("id,name").order("name"),
    ]);

    if (empRes.error) {
      setMsg("员工加载失败：" + empRes.error.message);
      return;
    }
    if (storeRes.error) {
      setMsg("门店加载失败：" + storeRes.error.message);
      return;
    }

    setEmployees((empRes.data ?? []) as Employee[]);
    setStores((storeRes.data ?? []) as Store[]);
    setMsg("");
  };

  const loadPayroll = async () => {
    setMsg("加载工资数据...");
    setSelectedEmployeeId("");
    setSplits([]);

    const { data, error } = await supabase
      .from("payroll_month")
      .select(
        "id,month,employee_id,total_days,gross_total,performance_manual,bonus_manual,adjustment_manual,status"
      )
      .eq("month", month)
      .order("gross_total", { ascending: false });

    if (error) {
      setMsg("工资加载失败：" + error.message);
      return;
    }

    setRows((data ?? []) as PayrollMonthRow[]);
    setMsg("");
  };

  const runPayroll = async () => {
    if (!month) {
      setMsg("请选择月份");
      return;
    }
    setMsg("运行工资计算中...");
    const { error } = await supabase.rpc("api_run_payroll_v2", { p_month: month });
    if (error) {
      setMsg("运行失败：" + error.message);
      return;
    }
    setMsg("运行成功，刷新数据...");
    await loadPayroll();
    setMsg("完成");
  };

  const lockPayrollMonth = async () => {
    if (!month) {
      setMsg("请选择月份");
      return;
    }
    setMsg("锁定中...");
    const { error } = await supabase.rpc("api_lock_payroll_month", { p_month: month });
    if (error) {
      setMsg("锁定失败：" + error.message);
      return;
    }
    setMsg("锁定成功");
    await loadPayroll();
  };

  const saveManual = async (row: PayrollMonthRow) => {
    if (row.status === "locked") {
      setMsg("该工资单已锁定，不能修改");
      return;
    }

    setMsg("保存中...");
    const { error } = await supabase
      .from("payroll_month")
      .update({
        performance_manual: row.performance_manual,
        bonus_manual: row.bonus_manual,
        adjustment_manual: row.adjustment_manual,
      })
      .eq("id", row.id);

    if (error) {
      setMsg("保存失败：" + error.message);
      return;
    }
    setMsg("保存成功（注意：需要点一次“运行工资计算”才会重新分摊到门店）");
  };

  const selectEmployee = async (employeeId: string) => {
    setSelectedEmployeeId(employeeId);
    setMsg("加载分摊明细...");

    const { data, error } = await supabase
      .from("payroll_store_split")
      .select("id,month,employee_id,store_id,workdays,ratio,store_total")
      .eq("month", month)
      .eq("employee_id", employeeId)
      .order("store_total", { ascending: false });

    if (error) {
      setMsg("分摊明细加载失败：" + error.message);
      setSplits([]);
      return;
    }

    setSplits((data ?? []) as SplitRow[]);
    setMsg("");
  };

  const storeName = (id: string) => stores.find((s) => s.id === id)?.name ?? id;
  const empName = (id: string) => {
    const e = employees.find((x) => x.id === id);
    return e ? `${e.name}（${e.emp_no}）` : id;
  };

  const updateRow = (id: string, patch: Partial<PayrollMonthRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  return (
    <main className={`page-container ${styles.wrap}`}>
      <h1 className="heading-1" style={{ marginBottom: "0.75rem" }}>
        工资与分摊（财务）
      </h1>

      <div className={styles.toolbar}>
        <div className="field">
          <label className="field-label">月份（选择任意日期会自动归一到当月1号）</label>
          <input
            type="date"
            value={month}
            onChange={(e) => setMonth(monthStartISO(e.target.value))}
            className="input"
            style={{ width: "auto", minWidth: "10rem" }}
          />
        </div>
        <button type="button" onClick={runPayroll} className="btn btn-outline">
          运行工资计算（含分摊）
        </button>
        <button
          type="button"
          onClick={lockPayrollMonth}
          disabled={!month}
          className="btn btn-outline"
        >
          锁定本月（不可修改）
        </button>
      </div>

      {msg ? <p className="muted-text" style={{ marginTop: "0.75rem" }}>{msg}</p> : null}

      <section style={{ marginTop: "1.25rem" }}>
        <h2 className="heading-2" style={{ marginBottom: "0.375rem" }}>
          工资总表 payroll_month
        </h2>
        <p className="field-hint" style={{ marginBottom: "0.5rem" }}>
          说明：你可以先手录绩效/奖金/调整项，保存后再点“运行工资计算”让总额与门店分摊更新。
        </p>

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
                <th className={styles.th}>状态</th>
                <th className={styles.th}>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td className={styles.td} colSpan={8}>
                    本月暂无工资数据。你可以先录入 workdays，然后点“运行工资计算”生成。
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td className={styles.td}>
                      <button
                        type="button"
                        onClick={() => selectEmployee(r.employee_id)}
                        className={styles.linkBtn}
                      >
                        {empName(r.employee_id)}
                      </button>
                    </td>
                    <td className={styles.td}>{r.total_days}</td>
                    <td className={styles.td}>{Number(r.gross_total).toFixed(2)}</td>
                    <td className={styles.td}>
                      <input
                        type="number"
                        value={r.performance_manual}
                        disabled={r.status === "locked"}
                        onChange={(e) =>
                          updateRow(r.id, { performance_manual: Number(e.target.value) })
                        }
                        className={styles.numInput}
                      />
                    </td>
                    <td className={styles.td}>
                      <input
                        type="number"
                        value={r.bonus_manual}
                        disabled={r.status === "locked"}
                        onChange={(e) => updateRow(r.id, { bonus_manual: Number(e.target.value) })}
                        className={styles.numInput}
                      />
                    </td>
                    <td className={styles.td}>
                      <input
                        type="number"
                        value={r.adjustment_manual}
                        disabled={r.status === "locked"}
                        onChange={(e) =>
                          updateRow(r.id, { adjustment_manual: Number(e.target.value) })
                        }
                        className={styles.numInput}
                      />
                    </td>
                    <td className={styles.td}>{r.status}</td>
                    <td className={styles.td}>
                      <button
                        type="button"
                        onClick={() => saveManual(r)}
                        disabled={r.status === "locked"}
                        className="btn btn-outline btn-sm"
                      >
                        保存手录
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginTop: "1.5rem" }}>
        <h2 className="heading-2" style={{ marginBottom: "0.375rem" }}>
          门店分摊 payroll_store_split
        </h2>
        <p className="field-hint" style={{ marginBottom: "0.5rem" }}>
          点击上面员工姓名可查看该员工在各门店的分摊明细。
        </p>

        <div style={{ marginTop: "0.5rem" }}>
          {selectedEmployee ? (
            <p style={{ fontWeight: 700 }}>
              当前查看：{selectedEmployee.name}（{selectedEmployee.emp_no}）
            </p>
          ) : (
            <p className="muted-text">未选择员工</p>
          )}
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>门店</th>
                <th className={styles.th}>天数</th>
                <th className={styles.th}>比例</th>
                <th className={styles.th}>分摊金额</th>
              </tr>
            </thead>
            <tbody>
              {splits.length === 0 ? (
                <tr>
                  <td className={styles.td} colSpan={4}>
                    暂无分摊数据（先点上面的员工，或先运行一次“工资计算（含分摊）”）。
                  </td>
                </tr>
              ) : (
                splits.map((s) => (
                  <tr key={s.id}>
                    <td className={styles.td}>{storeName(s.store_id)}</td>
                    <td className={styles.td}>{s.workdays}</td>
                    <td className={styles.td}>{Number(s.ratio).toFixed(6)}</td>
                    <td className={styles.td}>{Number(s.store_total).toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="field-hint" style={{ marginTop: "1rem" }}>
        提示：如果某些表因为 RLS 导致读取失败，你会在页面看到错误信息。我们下一步会统一配置最小可用的权限策略。
      </p>
    </main>
  );
}
