"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import styles from "./payroll.module.css";

type Employee = {
  id: string;
  emp_no: string;
  name: string;
};

/** 与 run_payroll_v3_test 中 manual_overrides 的键一致 */
type OverrideFieldKey =
  | "base_pay"
  | "position_pay"
  | "subsidy_pay"
  | "meal_allowance_total"
  | "attendance_bonus"
  | "overtime_pay";

type PayrollMonthRow = {
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
  manual_overrides?: Record<string, boolean> | null;
  status: "draft" | "locked";
  store_approved_at: string | null;
};

function computeGrossTotal(r: PayrollMonthRow): number {
  return (
    Number(r.base_pay) +
    Number(r.position_pay) +
    Number(r.subsidy_pay) +
    Number(r.meal_allowance_total) +
    Number(r.attendance_bonus) +
    Number(r.overtime_pay) +
    Number(r.performance_total) +
    Number(r.store_bonus_total) +
    Number(r.adjustment_manual)
  );
}

function hasManualOverride(
  mo: PayrollMonthRow["manual_overrides"],
  key: OverrideFieldKey
): boolean {
  if (!mo || typeof mo !== "object") return false;
  return Boolean((mo as Record<string, unknown>)[key]);
}

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

type StoreEmpRow = {
  split: SplitRow;
  payroll: PayrollMonthRow | undefined;
};

function monthStartISO(input: string) {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}-01`;
}

export default function PayrollPage() {
  const router = useRouter();
  const [month, setMonth] = useState<string>("2026-03-01");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [rows, setRows] = useState<PayrollMonthRow[]>([]);
  const [splits, setSplits] = useState<SplitRow[]>([]);
  const [activeStoreId, setActiveStoreId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>("");
  const [storeFilterOpen, setStoreFilterOpen] = useState(false);
  const [storeFilterQuery, setStoreFilterQuery] = useState("");

  const payrollByEmployeeId = useMemo(() => {
    const m = new Map<string, PayrollMonthRow>();
    for (const r of rows) {
      m.set(r.employee_id, r);
    }
    return m;
  }, [rows]);

  /** 本月有分摊数据的门店，顺序与 stores（名称）一致；stores 未就绪时退回 splits 中出现顺序 */
  const storeIdsWithSplits = useMemo(() => {
    const ids = new Set(splits.map((s) => s.store_id));
    if (ids.size === 0) return [];
    const ordered = stores.filter((s) => ids.has(s.id)).map((s) => s.id);
    if (ordered.length > 0) return ordered;
    const seen = new Set<string>();
    const fallback: string[] = [];
    for (const s of splits) {
      if (!seen.has(s.store_id)) {
        seen.add(s.store_id);
        fallback.push(s.store_id);
      }
    }
    return fallback;
  }, [splits, stores]);

  const splitCountByStore = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of splits) {
      m.set(s.store_id, (m.get(s.store_id) ?? 0) + 1);
    }
    return m;
  }, [splits]);

  /** 弹层内按门店名称关键字过滤（不区分大小写） */
  const filteredStoreIdsForPicker = useMemo(() => {
    const q = storeFilterQuery.trim().toLowerCase();
    if (!q) return storeIdsWithSplits;
    return storeIdsWithSplits.filter((sid) => {
      const label = stores.find((s) => s.id === sid)?.name ?? sid;
      return String(label).toLowerCase().includes(q);
    });
  }, [storeIdsWithSplits, storeFilterQuery, stores]);

  const currentStoreRows: StoreEmpRow[] = useMemo(() => {
    if (!activeStoreId) return [];
    const list = splits
      .filter((s) => s.store_id === activeStoreId)
      .map((split) => ({
        split,
        payroll: payrollByEmployeeId.get(split.employee_id),
      }));
    list.sort((a, b) => {
      const na = employees.find((e) => e.id === a.split.employee_id)?.name ?? "";
      const nb = employees.find((e) => e.id === b.split.employee_id)?.name ?? "";
      return na.localeCompare(nb, "zh");
    });
    return list;
  }, [activeStoreId, splits, payrollByEmployeeId, employees]);

  const currentStoreTotals = useMemo(() => {
    let days = 0;
    let splitSum = 0;
    for (const { split } of currentStoreRows) {
      days += Number(split.workdays);
      splitSum += Number(split.store_total);
    }
    return { days, splitSum };
  }, [currentStoreRows]);

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
    const ids = new Set(splits.map((s) => s.store_id));
    if (ids.size === 0) {
      setActiveStoreId(null);
      return;
    }
    const ordered = stores.filter((s) => ids.has(s.id)).map((s) => s.id);
    const fallback = ordered[0] ?? [...ids][0];
    setActiveStoreId((prev) => (prev && ids.has(prev) ? prev : fallback ?? null));
  }, [splits, stores]);

  useEffect(() => {
    if (!storeFilterOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setStoreFilterOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [storeFilterOpen]);

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

    const [pmRes, splitRes] = await Promise.all([
      supabase
        .from("payroll_month")
        .select(
          "id,month,employee_id,total_days,base_pay,position_pay,subsidy_pay,meal_allowance_total,attendance_bonus,overtime_hours_total,overtime_pay,performance_total,store_bonus_total,adjustment_manual,manual_overrides,gross_total,status,store_approved_at"
        )
        .eq("month", month)
        .order("gross_total", { ascending: false }),
      supabase
        .from("payroll_store_split")
        .select("id,month,employee_id,store_id,workdays,ratio,store_total")
        .eq("month", month)
        .order("employee_id"),
    ]);

    if (pmRes.error) {
      setMsg("工资加载失败：" + pmRes.error.message);
      return;
    }
    if (splitRes.error) {
      setMsg("门店分摊加载失败：" + splitRes.error.message);
      return;
    }

    setRows((pmRes.data ?? []) as PayrollMonthRow[]);
    setSplits((splitRes.data ?? []) as SplitRow[]);
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

  const patchPayrollRow = (id: string, patch: Partial<PayrollMonthRow>) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, ...patch };
        next.gross_total = computeGrossTotal(next);
        return next;
      })
    );
  };

  const savePayrollDetail = async (row: PayrollMonthRow) => {
    if (row.status === "locked") {
      setMsg("该工资单已锁定，不能修改");
      return;
    }

    setMsg("保存中...");
    const gross_total = computeGrossTotal(row);
    const { error } = await supabase
      .from("payroll_month")
      .update({
        base_pay: row.base_pay,
        position_pay: row.position_pay,
        subsidy_pay: row.subsidy_pay,
        meal_allowance_total: row.meal_allowance_total,
        attendance_bonus: row.attendance_bonus,
        overtime_pay: row.overtime_pay,
        adjustment_manual: row.adjustment_manual,
        gross_total,
        manual_overrides: row.manual_overrides ?? {},
      })
      .eq("id", row.id);

    if (error) {
      setMsg("保存失败：" + error.message);
      return;
    }
    setMsg("保存成功。请再点「运行工资计算（含分摊）」将本页总工资同步到各门店分摊。");
  };

  const resetManualOverrides = async (row: PayrollMonthRow) => {
    if (row.status === "locked") {
      setMsg("该工资单已锁定，不能修改");
      return;
    }
    setMsg("处理中...");
    const { error } = await supabase
      .from("payroll_month")
      .update({ manual_overrides: {} })
      .eq("id", row.id);

    if (error) {
      setMsg("重置失败：" + error.message);
      return;
    }
    patchPayrollRow(row.id, { manual_overrides: {} });
    setMsg("已清除手动标记，请重新运行工资计算以恢复公式值");
  };

  const storeName = (id: string) => stores.find((s) => s.id === id)?.name ?? id;
  const empName = (id: string) => {
    const e = employees.find((x) => x.id === id);
    return e ? `${e.name}（${e.emp_no}）` : id;
  };

  const handleGoHome = () => {
    router.replace("/");
    router.refresh();
  };

  return (
    <main className={`page-container ${styles.wrap}`}>
      <div className={styles.pageHeader}>
        <h1 className="heading-1" style={{ marginBottom: 0 }}>
          工资与分摊（财务）
        </h1>
        <button type="button" onClick={handleGoHome} className="btn btn-outline btn-sm">
          返回主页
        </button>
      </div>

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
          按门店查看
        </h2>
        <p className="field-hint" style={{ marginBottom: "0.5rem" }}>
          说明：绩效和门店奖金请在「绩效 / 门店奖金」页面录入。基本工资、岗位工资、补贴、餐补、全勤奖、加班费由系统按员工档案与工时自动填入，可直接修改；浅底色表示该项已手动改过，重跑计算不会覆盖。修改后点「保存明细」，再点「运行工资计算（含分摊）」同步门店分摊。需恢复公式值时点「重置公式」后重跑计算。同一员工在多家店出勤会在对应门店各显示一行。
        </p>

        {storeIdsWithSplits.length === 0 ? (
          <p className="muted-text" style={{ marginTop: "0.75rem" }}>
            {rows.length > 0
              ? "本月有工资汇总但暂无门店分摊数据，请先点「运行工资计算（含分摊）」。"
              : "本月暂无工资与分摊数据。可先在各店录入工时，再运行工资计算。"}
          </p>
        ) : (
          <>
            <div className={styles.storeBar}>
              <div className={styles.storeBarText}>
                <span className="muted-text">当前门店：</span>
                <strong>{activeStoreId ? storeName(activeStoreId) : "—"}</strong>
                <span className={styles.storeCountHint}>
                  （本月共 {storeIdsWithSplits.length} 家门店有分摊）
                </span>
              </div>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                aria-expanded={storeFilterOpen}
                aria-controls="payroll-store-dialog"
                onClick={() => {
                  if (storeFilterOpen) {
                    setStoreFilterOpen(false);
                  } else {
                    setStoreFilterQuery("");
                    setStoreFilterOpen(true);
                  }
                }}
              >
                筛选门店
              </button>
            </div>

            {storeFilterOpen ? (
              <div
                className={styles.modalBackdrop}
                role="presentation"
                onClick={() => setStoreFilterOpen(false)}
              >
                <div
                  className={styles.modalPanel}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="payroll-store-dialog-title"
                  id="payroll-store-dialog"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className={styles.modalHeader}>
                    <h3 className={styles.modalTitle} id="payroll-store-dialog-title">
                      选择门店
                    </h3>
                    <button
                      type="button"
                      className={styles.modalClose}
                      aria-label="关闭"
                      onClick={() => setStoreFilterOpen(false)}
                    >
                      ×
                    </button>
                  </div>
                  <div className={styles.modalBody}>
                    <label className="field-label" htmlFor="payroll-store-filter-input">
                      门店名称关键字
                    </label>
                    <input
                      id="payroll-store-filter-input"
                      type="search"
                      className="input"
                      placeholder="输入关键字过滤…"
                      value={storeFilterQuery}
                      onChange={(e) => setStoreFilterQuery(e.target.value)}
                      autoComplete="off"
                    />
                    <ul className={styles.modalList} role="listbox" aria-label="门店列表">
                      {filteredStoreIdsForPicker.map((sid) => (
                        <li key={sid} role="none">
                          <button
                            type="button"
                            role="option"
                            aria-selected={activeStoreId === sid}
                            className={styles.modalListItem}
                            onClick={() => {
                              setActiveStoreId(sid);
                              setStoreFilterOpen(false);
                            }}
                          >
                            <span>{storeName(sid)}</span>
                            <span className={styles.modalListMeta}>
                              {splitCountByStore.get(sid) ?? 0} 条分摊
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    {filteredStoreIdsForPicker.length === 0 ? (
                      <p className={styles.modalEmpty}>无匹配门店，请调整关键字。</p>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            <div className={styles.tableWrap} style={{ marginTop: "0.75rem" }}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>员工</th>
                    <th className={styles.th}>本店天数</th>
                    <th className={styles.th}>基本工资</th>
                    <th className={styles.th}>岗位工资</th>
                    <th className={styles.th}>补贴</th>
                    <th className={styles.th}>餐补</th>
                    <th className={styles.th}>全勤奖</th>
                    <th className={styles.th}>加班费</th>
                    <th className={styles.th}>绩效</th>
                    <th className={styles.th}>门店奖金</th>
                    <th className={styles.th}>调整(手录)</th>
                    <th className={styles.th}>总工资</th>
                    <th className={styles.th}>本店分摊</th>
                    <th className={styles.th}>状态</th>
                    <th className={styles.th}>审核</th>
                    <th className={styles.th}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {currentStoreRows.length === 0 ? (
                    <tr>
                      <td className={styles.td} colSpan={16}>
                        当前门店暂无分摊行。
                      </td>
                    </tr>
                  ) : (
                    currentStoreRows.map(({ split, payroll }) => {
                      const pr = payroll;
                      if (!pr) {
                        return (
                          <tr key={split.id}>
                            <td className={styles.td}>{empName(split.employee_id)}</td>
                            <td className={styles.td} colSpan={15}>
                              缺少工资汇总行，请运行工资计算或联系管理员。
                            </td>
                          </tr>
                        );
                      }
                      return (
                        <tr key={split.id}>
                          <td className={styles.td}>{empName(split.employee_id)}</td>
                          <td className={styles.td}>{Number(split.workdays)}</td>
                          <td className={styles.td}>
                            <input
                              type="number"
                              step={0.01}
                              value={pr.base_pay}
                              disabled={pr.status === "locked"}
                              onChange={(e) =>
                                patchPayrollRow(pr.id, {
                                  base_pay: Number(e.target.value),
                                  manual_overrides: {
                                    ...(pr.manual_overrides ?? {}),
                                    base_pay: true,
                                  },
                                })
                              }
                              className={`${styles.numInput} ${hasManualOverride(pr.manual_overrides, "base_pay") ? styles.numInputOverride : ""}`}
                            />
                          </td>
                          <td className={styles.td}>
                            <input
                              type="number"
                              step={0.01}
                              value={pr.position_pay}
                              disabled={pr.status === "locked"}
                              onChange={(e) =>
                                patchPayrollRow(pr.id, {
                                  position_pay: Number(e.target.value),
                                  manual_overrides: {
                                    ...(pr.manual_overrides ?? {}),
                                    position_pay: true,
                                  },
                                })
                              }
                              className={`${styles.numInput} ${hasManualOverride(pr.manual_overrides, "position_pay") ? styles.numInputOverride : ""}`}
                            />
                          </td>
                          <td className={styles.td}>
                            <input
                              type="number"
                              step={0.01}
                              value={pr.subsidy_pay}
                              disabled={pr.status === "locked"}
                              onChange={(e) =>
                                patchPayrollRow(pr.id, {
                                  subsidy_pay: Number(e.target.value),
                                  manual_overrides: {
                                    ...(pr.manual_overrides ?? {}),
                                    subsidy_pay: true,
                                  },
                                })
                              }
                              className={`${styles.numInput} ${hasManualOverride(pr.manual_overrides, "subsidy_pay") ? styles.numInputOverride : ""}`}
                            />
                          </td>
                          <td className={styles.td}>
                            <input
                              type="number"
                              step={0.01}
                              value={pr.meal_allowance_total}
                              disabled={pr.status === "locked"}
                              onChange={(e) =>
                                patchPayrollRow(pr.id, {
                                  meal_allowance_total: Number(e.target.value),
                                  manual_overrides: {
                                    ...(pr.manual_overrides ?? {}),
                                    meal_allowance_total: true,
                                  },
                                })
                              }
                              className={`${styles.numInput} ${hasManualOverride(pr.manual_overrides, "meal_allowance_total") ? styles.numInputOverride : ""}`}
                            />
                          </td>
                          <td className={styles.td}>
                            <input
                              type="number"
                              step={0.01}
                              value={pr.attendance_bonus}
                              disabled={pr.status === "locked"}
                              onChange={(e) =>
                                patchPayrollRow(pr.id, {
                                  attendance_bonus: Number(e.target.value),
                                  manual_overrides: {
                                    ...(pr.manual_overrides ?? {}),
                                    attendance_bonus: true,
                                  },
                                })
                              }
                              className={`${styles.numInput} ${hasManualOverride(pr.manual_overrides, "attendance_bonus") ? styles.numInputOverride : ""}`}
                            />
                          </td>
                          <td className={styles.td} title={`系统汇总加班时长 ${Number(pr.overtime_hours_total)} 小时`}>
                            <input
                              type="number"
                              step={0.01}
                              value={pr.overtime_pay}
                              disabled={pr.status === "locked"}
                              onChange={(e) =>
                                patchPayrollRow(pr.id, {
                                  overtime_pay: Number(e.target.value),
                                  manual_overrides: {
                                    ...(pr.manual_overrides ?? {}),
                                    overtime_pay: true,
                                  },
                                })
                              }
                              className={`${styles.numInput} ${hasManualOverride(pr.manual_overrides, "overtime_pay") ? styles.numInputOverride : ""}`}
                            />
                            {Number(pr.overtime_hours_total) > 0 && (
                              <span className="muted-text" style={{ fontSize: "0.75rem", marginLeft: "0.25rem" }}>
                                ({Number(pr.overtime_hours_total)}h)
                              </span>
                            )}
                          </td>
                          <td className={styles.td}>{Number(pr.performance_total).toFixed(2)}</td>
                          <td className={styles.td}>{Number(pr.store_bonus_total).toFixed(2)}</td>
                          <td className={styles.td}>
                            <input
                              type="number"
                              step={0.01}
                              value={pr.adjustment_manual}
                              disabled={pr.status === "locked"}
                              onChange={(e) =>
                                patchPayrollRow(pr.id, { adjustment_manual: Number(e.target.value) })
                              }
                              className={styles.numInput}
                            />
                          </td>
                          <td className={styles.td} style={{ fontWeight: 600 }}>
                            {Number(pr.gross_total).toFixed(2)}
                          </td>
                          <td className={styles.td} style={{ fontWeight: 600, color: "var(--primary)" }}>
                            {Number(split.store_total).toFixed(2)}
                          </td>
                          <td className={styles.td}>{pr.status}</td>
                          <td className={styles.td}>
                            {pr.store_approved_at ? "已审核" : "待审核"}
                          </td>
                          <td className={styles.td}>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                              <button
                                type="button"
                                onClick={() => savePayrollDetail(pr)}
                                disabled={pr.status === "locked"}
                                className="btn btn-outline btn-sm"
                              >
                                保存明细
                              </button>
                              <button
                                type="button"
                                onClick={() => resetManualOverrides(pr)}
                                disabled={pr.status === "locked"}
                                className="btn btn-ghost btn-sm"
                              >
                                重置公式
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {currentStoreRows.length > 0 && (
                  <tfoot>
                    <tr>
                      <td className={styles.td} colSpan={2} style={{ fontWeight: 600 }}>
                        本店合计
                      </td>
                      <td className={styles.td} colSpan={10} />
                      <td className={styles.td} style={{ fontWeight: 600 }} />
                      <td className={styles.td} style={{ fontWeight: 600, color: "var(--primary)" }}>
                        {currentStoreTotals.splitSum.toFixed(2)}
                      </td>
                      <td
                        className={styles.td}
                        colSpan={3}
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        本店出勤 {currentStoreTotals.days.toFixed(1)} 天
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </>
        )}
      </section>

      <p className="field-hint" style={{ marginTop: "1rem" }}>
        若加载失败或无法保存，页面会显示具体原因；无法自行处理时请把提示原文发给管理员。
      </p>
    </main>
  );
}
