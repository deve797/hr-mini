"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Employee = {
  id: string;
  emp_no: string;
  name: string;
};

type PayrollMonthRow = {
  id: string;
  month: string; // date
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
  // input is 'YYYY-MM-DD' from <input type="date">
  // we just trust user will pick first day of month; if not, we normalize.
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
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 20, fontWeight: 800 }}>工资与分摊（财务）</h1>

      <div style={{ marginTop: 12, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, color: "#666" }}>月份（选择任意日期会自动归一到当月1号）</div>
          <input
            type="date"
            value={month}
            onChange={(e) => setMonth(monthStartISO(e.target.value))}
            style={{ padding: 10, border: "1px solid #ddd", borderRadius: 10 }}
          />
        </div>

        <button
          onClick={runPayroll}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid #ddd",
            background: "#fff",
            fontWeight: 700,
            height: 42,
            alignSelf: "end",
          }}
        >
          运行工资计算（含分摊）
        </button>
        <button
          onClick={lockPayrollMonth}
          disabled={!month}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid #ddd",
            background: "#fff",
            fontWeight: 700,
            height: 42,
            alignSelf: "end",
            cursor: month ? "pointer" : "not-allowed",
            opacity: month ? 1 : 0.6,
          }}
        >
          锁定本月（不可修改）
        </button>
      </div>

      {msg ? <div style={{ marginTop: 12, fontSize: 14 }}>{msg}</div> : null}

      <section style={{ marginTop: 18 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800 }}>工资总表 payroll_month</h2>
        <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
          说明：你可以先手录绩效/奖金/调整项，保存后再点“运行工资计算”让总额与门店分摊更新。
        </div>

        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              minWidth: 980,
              border: "1px solid #eee",
            }}
          >
            <thead>
              <tr style={{ background: "#fafafa" }}>
                <th style={th}>员工</th>
                <th style={th}>天数</th>
                <th style={th}>总工资</th>
                <th style={th}>绩效(手录)</th>
                <th style={th}>奖金(手录)</th>
                <th style={th}>调整(手录)</th>
                <th style={th}>状态</th>
                <th style={th}>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td style={td} colSpan={8}>
                    本月暂无工资数据。你可以先录入 workdays，然后点“运行工资计算”生成。
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid #eee" }}>
                    <td style={td}>
                      <button
                        onClick={() => selectEmployee(r.employee_id)}
                        style={{
                          border: "none",
                          background: "transparent",
                          textDecoration: "underline",
                          cursor: "pointer",
                          padding: 0,
                          fontWeight: 700,
                        }}
                      >
                        {empName(r.employee_id)}
                      </button>
                    </td>
                    <td style={td}>{r.total_days}</td>
                    <td style={td}>{Number(r.gross_total).toFixed(2)}</td>

                    <td style={td}>
                      <input
                        type="number"
                        value={r.performance_manual}
                        disabled={r.status === "locked"}
                        onChange={(e) =>
                          updateRow(r.id, { performance_manual: Number(e.target.value) })
                        }
                        style={input}
                      />
                    </td>
                    <td style={td}>
                      <input
                        type="number"
                        value={r.bonus_manual}
                        disabled={r.status === "locked"}
                        onChange={(e) => updateRow(r.id, { bonus_manual: Number(e.target.value) })}
                        style={input}
                      />
                    </td>
                    <td style={td}>
                      <input
                        type="number"
                        value={r.adjustment_manual}
                        disabled={r.status === "locked"}
                        onChange={(e) =>
                          updateRow(r.id, { adjustment_manual: Number(e.target.value) })
                        }
                        style={input}
                      />
                    </td>

                    <td style={td}>{r.status}</td>

                    <td style={td}>
                      <button
                        onClick={() => saveManual(r)}
                        disabled={r.status === "locked"}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 10,
                          border: "1px solid #ddd",
                          background: "#fff",
                          cursor: r.status === "locked" ? "not-allowed" : "pointer",
                        }}
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

      <section style={{ marginTop: 22 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800 }}>门店分摊 payroll_store_split</h2>
        <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
          点击上面员工姓名可查看该员工在各门店的分摊明细。
        </div>

        <div style={{ marginTop: 10 }}>
          {selectedEmployee ? (
            <div style={{ fontWeight: 800 }}>
              当前查看：{selectedEmployee.name}（{selectedEmployee.emp_no}）
            </div>
          ) : (
            <div style={{ color: "#666" }}>未选择员工</div>
          )}
        </div>

        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              minWidth: 760,
              border: "1px solid #eee",
            }}
          >
            <thead>
              <tr style={{ background: "#fafafa" }}>
                <th style={th}>门店</th>
                <th style={th}>天数</th>
                <th style={th}>比例</th>
                <th style={th}>分摊金额</th>
              </tr>
            </thead>
            <tbody>
              {splits.length === 0 ? (
                <tr>
                  <td style={td} colSpan={4}>
                    暂无分摊数据（先点上面的员工，或先运行一次“工资计算（含分摊）”）。
                  </td>
                </tr>
              ) : (
                splits.map((s) => (
                  <tr key={s.id} style={{ borderTop: "1px solid #eee" }}>
                    <td style={td}>{storeName(s.store_id)}</td>
                    <td style={td}>{s.workdays}</td>
                    <td style={td}>{Number(s.ratio).toFixed(6)}</td>
                    <td style={td}>{Number(s.store_total).toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div style={{ marginTop: 18, fontSize: 12, color: "#666" }}>
        提示：如果某些表因为 RLS 导致读取失败，你会在页面看到错误信息。我们下一步会统一配置最小可用的权限策略。
      </div>
    </main>
  );
}

const th: React.CSSProperties = {
  textAlign: "left",
  fontSize: 12,
  padding: "10px 10px",
  borderBottom: "1px solid #eee",
};

const td: React.CSSProperties = {
  fontSize: 13,
  padding: "10px 10px",
  verticalAlign: "middle",
};

const input: React.CSSProperties = {
  width: 120,
  padding: 8,
  border: "1px solid #ddd",
  borderRadius: 10,
};