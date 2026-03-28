"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Profile = { role: string | null; store_id: string | null } | null;

type Employee = { id: string; emp_no: string | null; name: string | null };
type Store = { id: string; name: string | null };

type PerformanceRow = {
  id: string;
  month: string;
  employee_id: string;
  amount: number;
  note: string | null;
  updated_at: string;
  employees: { name: string | null; emp_no: string | null } | null;
};

type StoreBonusRow = {
  id: string;
  month: string;
  employee_id: string;
  store_id: string;
  amount: number;
  note: string | null;
  updated_at: string;
  employees: { name: string | null; emp_no: string | null } | null;
  stores: { name: string | null } | null;
};

function getCurrentMonthFirst(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function isFinanceOrHq(profile: Profile): boolean {
  return profile?.role === "finance" || profile?.role === "hq";
}

function empLabel(e: { name: string | null; emp_no: string | null } | null): string {
  if (!e) return "未知";
  return e.emp_no ? `${e.name ?? "未知"} (${e.emp_no})` : (e.name ?? "未知");
}

export default function PayrollPerformancePage() {
  const [profile, setProfile] = useState<Profile>(null);
  const [loading, setLoading] = useState(true);

  const [month, setMonth] = useState(getCurrentMonthFirst);
  const [activeTab, setActiveTab] = useState<"performance" | "bonus">("performance");

  // ── 公共数据
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [stores, setStores] = useState<Store[]>([]);

  // ── 绩效表单状态
  const [perfEmployeeId, setPerfEmployeeId] = useState("");
  const [perfAmount, setPerfAmount] = useState("");
  const [perfNote, setPerfNote] = useState("");
  const [perfMsg, setPerfMsg] = useState("");
  const [perfMsgType, setPerfMsgType] = useState<"info" | "error" | "success">("info");

  // ── 绩效列表
  const [perfRows, setPerfRows] = useState<PerformanceRow[]>([]);
  const [perfLoading, setPerfLoading] = useState(false);

  // ── 门店奖金表单状态
  const [bonusEmployeeId, setBonusEmployeeId] = useState("");
  const [bonusStoreId, setBonusStoreId] = useState("");
  const [bonusAmount, setBonusAmount] = useState("");
  const [bonusNote, setBonusNote] = useState("");
  const [bonusMsg, setBonusMsg] = useState("");
  const [bonusMsgType, setBonusMsgType] = useState<"info" | "error" | "success">("info");

  // ── 门店奖金列表
  const [bonusRows, setBonusRows] = useState<StoreBonusRow[]>([]);
  const [bonusLoading, setBonusLoading] = useState(false);

  // ── 初始化：获取登录用户与公共数据
  useEffect(() => {
    (async () => {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user ?? null;
      if (!user) {
        setLoading(false);
        return;
      }
      const { data: profileData } = await supabase
        .from("users_profile")
        .select("role, store_id")
        .eq("user_id", user.id)
        .maybeSingle();
      setProfile(
        profileData
          ? { role: profileData.role ?? null, store_id: profileData.store_id ?? null }
          : null
      );

      const [{ data: empData }, { data: storeData }] = await Promise.all([
        supabase.from("employees").select("id,emp_no,name").order("name"),
        supabase.from("stores").select("id,name").order("name"),
      ]);
      setEmployees((empData ?? []) as Employee[]);
      setStores((storeData ?? []) as Store[]);
      setLoading(false);
    })();
  }, []);

  // ── 加载绩效列表
  const loadPerfRows = useCallback(async () => {
    if (!month) return;
    setPerfLoading(true);
    const { data } = await supabase
      .from("payroll_performance")
      .select("id,month,employee_id,amount,note,updated_at,employees(name,emp_no)")
      .eq("month", month)
      .order("updated_at", { ascending: false });
    setPerfRows((data ?? []) as unknown as PerformanceRow[]);
    setPerfLoading(false);
  }, [month]);

  // ── 加载门店奖金列表
  const loadBonusRows = useCallback(async () => {
    if (!month) return;
    setBonusLoading(true);
    const { data } = await supabase
      .from("payroll_store_bonus")
      .select("id,month,employee_id,store_id,amount,note,updated_at,employees(name,emp_no),stores(name)")
      .eq("month", month)
      .order("updated_at", { ascending: false });
    setBonusRows((data ?? []) as unknown as StoreBonusRow[]);
    setBonusLoading(false);
  }, [month]);

  useEffect(() => {
    loadPerfRows();
    loadBonusRows();
  }, [loadPerfRows, loadBonusRows]);

  // ── 提交绩效
  const submitPerf = async () => {
    if (!perfEmployeeId) {
      setPerfMsg("请选择员工");
      setPerfMsgType("error");
      return;
    }
    const amountNum = Number(perfAmount);
    if (perfAmount === "" || Number.isNaN(amountNum) || amountNum < 0) {
      setPerfMsg("请填写有效的绩效金额（≥0）");
      setPerfMsgType("error");
      return;
    }
    setPerfMsg("提交中...");
    setPerfMsgType("info");

    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id ?? null;

    const { error } = await supabase
      .from("payroll_performance")
      .upsert(
        {
          month,
          employee_id: perfEmployeeId,
          amount: amountNum,
          note: perfNote.trim() || null,
          created_by: userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "month,employee_id" }
      );

    if (error) {
      setPerfMsg("保存失败：" + error.message);
      setPerfMsgType("error");
      return;
    }
    setPerfMsg("已保存");
    setPerfMsgType("success");
    setPerfEmployeeId("");
    setPerfAmount("");
    setPerfNote("");
    loadPerfRows();
  };

  // ── 删除绩效记录
  const deletePerf = async (id: string) => {
    if (!confirm("确定要删除此绩效记录吗？")) return;
    const { error } = await supabase.from("payroll_performance").delete().eq("id", id);
    if (error) {
      setPerfMsg("删除失败：" + error.message);
      setPerfMsgType("error");
      return;
    }
    setPerfMsg("已删除");
    setPerfMsgType("success");
    loadPerfRows();
  };

  // ── 编辑绩效（填入表单）
  const editPerf = (row: PerformanceRow) => {
    setPerfEmployeeId(row.employee_id);
    setPerfAmount(String(row.amount));
    setPerfNote(row.note ?? "");
  };

  // ── 提交门店奖金
  const submitBonus = async () => {
    if (!bonusEmployeeId) {
      setBonusMsg("请选择员工");
      setBonusMsgType("error");
      return;
    }
    if (!bonusStoreId) {
      setBonusMsg("请选择门店");
      setBonusMsgType("error");
      return;
    }
    const amountNum = Number(bonusAmount);
    if (bonusAmount === "" || Number.isNaN(amountNum) || amountNum < 0) {
      setBonusMsg("请填写有效的奖金金额（≥0）");
      setBonusMsgType("error");
      return;
    }
    setBonusMsg("提交中...");
    setBonusMsgType("info");

    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id ?? null;

    const { error } = await supabase
      .from("payroll_store_bonus")
      .upsert(
        {
          month,
          employee_id: bonusEmployeeId,
          store_id: bonusStoreId,
          amount: amountNum,
          note: bonusNote.trim() || null,
          created_by: userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "month,employee_id,store_id" }
      );

    if (error) {
      setBonusMsg("保存失败：" + error.message);
      setBonusMsgType("error");
      return;
    }
    setBonusMsg("已保存");
    setBonusMsgType("success");
    setBonusEmployeeId("");
    setBonusStoreId("");
    setBonusAmount("");
    setBonusNote("");
    loadBonusRows();
  };

  // ── 删除门店奖金记录
  const deleteBonus = async (id: string) => {
    if (!confirm("确定要删除此门店奖金记录吗？")) return;
    const { error } = await supabase.from("payroll_store_bonus").delete().eq("id", id);
    if (error) {
      setBonusMsg("删除失败：" + error.message);
      setBonusMsgType("error");
      return;
    }
    setBonusMsg("已删除");
    setBonusMsgType("success");
    loadBonusRows();
  };

  // ── 编辑门店奖金（填入表单）
  const editBonus = (row: StoreBonusRow) => {
    setBonusEmployeeId(row.employee_id);
    setBonusStoreId(row.store_id);
    setBonusAmount(String(row.amount));
    setBonusNote(row.note ?? "");
  };

  // ── Loading 状态
  if (loading) {
    return (
      <main className="page-container" style={{ maxWidth: 32 * 16 }}>
        <h1 className="heading-1">绩效 / 门店奖金录入</h1>
        <p className="muted-text">加载中…</p>
      </main>
    );
  }

  // ── 权限检查
  if (!isFinanceOrHq(profile)) {
    return (
      <main className="page-container" style={{ maxWidth: 32 * 16 }}>
        <h1 className="heading-1">绩效 / 门店奖金录入</h1>
        <p className="msg-error">本页面仅财务或总部角色可访问，请联系管理员。</p>
        <Link href="/" className="btn btn-outline btn-sm" style={{ marginTop: "0.75rem", display: "inline-flex" }}>
          返回主页
        </Link>
      </main>
    );
  }

  const disabledStyle = { opacity: 0.6 };

  return (
    <main className="page-container" style={{ maxWidth: 36 * 16 }}>
      {/* 页头 */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "0.75rem",
          marginBottom: "1.5rem",
        }}
      >
        <h1 className="heading-1" style={{ marginBottom: 0 }}>
          绩效 / 门店奖金录入
        </h1>
        <Link href="/" className="btn btn-outline btn-sm">
          返回主页
        </Link>
        <Link href="/payroll" className="btn btn-outline btn-sm">
          薪酬管理
        </Link>
      </div>

      {/* 月份选择 */}
      <div className="field" style={{ maxWidth: "14rem", marginBottom: "1.5rem" }}>
        <label className="field-label">月份</label>
        <input
          type="month"
          value={month.slice(0, 7)}
          onChange={(e) => {
            const v = e.target.value;
            setMonth(v ? `${v}-01` : getCurrentMonthFirst());
          }}
          className="input"
        />
      </div>

      {/* Tab 切换 */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          marginBottom: "1.5rem",
          borderBottom: "1px solid var(--border)",
          paddingBottom: "0.5rem",
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab("performance")}
          className={activeTab === "performance" ? "btn btn-primary btn-sm" : "btn btn-outline btn-sm"}
        >
          员工绩效
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("bonus")}
          className={activeTab === "bonus" ? "btn btn-primary btn-sm" : "btn btn-outline btn-sm"}
        >
          门店奖金
        </button>
      </div>

      {/* ═══════════════════════════════════════
          Tab: 员工绩效
      ═══════════════════════════════════════ */}
      {activeTab === "performance" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <p className="field-hint">
            绩效与员工挂钩，按本月在各门店的出勤天数比例自动分摊到各门店。
          </p>

          <div className="field">
            <label className="field-label">员工</label>
            <select
              value={perfEmployeeId}
              onChange={(e) => setPerfEmployeeId(e.target.value)}
              className="input"
            >
              <option value="">选择员工</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.emp_no ? `${e.name ?? "未知"} (${e.emp_no})` : (e.name ?? "未知")}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="field-label">绩效金额（元）</label>
            <input
              type="number"
              placeholder="0.00"
              min={0}
              step={0.01}
              value={perfAmount}
              onChange={(e) => setPerfAmount(e.target.value)}
              className="input"
              style={{ maxWidth: "12rem" }}
            />
          </div>

          <div className="field">
            <label className="field-label">备注（选填）</label>
            <input
              type="text"
              placeholder="如：3月绩效考核"
              value={perfNote}
              onChange={(e) => setPerfNote(e.target.value)}
              className="input"
            />
          </div>

          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button type="button" onClick={submitPerf} className="btn btn-primary">
              保存绩效
            </button>
            {perfEmployeeId && (
              <button
                type="button"
                onClick={() => {
                  setPerfEmployeeId("");
                  setPerfAmount("");
                  setPerfNote("");
                  setPerfMsg("");
                }}
                className="btn btn-ghost btn-sm"
              >
                清空
              </button>
            )}
          </div>

          <div
            className={
              perfMsgType === "error"
                ? "msg-error"
                : perfMsgType === "success"
                ? "msg-success"
                : "msg-info"
            }
          >
            {perfMsg || "\u00A0"}
          </div>

          {/* 绩效列表 */}
          <section style={{ marginTop: "1rem" }}>
            <h2 className="heading-2" style={{ marginBottom: "0.75rem" }}>
              {month.slice(0, 7)} 绩效记录
            </h2>
            {perfLoading ? (
              <p className="muted-text">加载中…</p>
            ) : perfRows.length === 0 ? (
              <p className="muted-text">本月暂无绩效记录</p>
            ) : (
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                }}
              >
                {perfRows.map((row) => (
                  <li
                    key={row.id}
                    className="card"
                    style={{
                      padding: "0.75rem 1rem",
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "0.5rem",
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ fontWeight: 600 }}>{empLabel(row.employees)}</span>
                      <span
                        style={{
                          marginLeft: "0.75rem",
                          fontWeight: 600,
                          color: "var(--primary)",
                        }}
                      >
                        ¥{Number(row.amount).toFixed(2)}
                      </span>
                      {row.note && (
                        <span className="muted-text" style={{ marginLeft: "0.5rem" }}>
                          · {row.note}
                        </span>
                      )}
                      <div className="field-hint" style={{ marginTop: "0.25rem" }}>
                        更新于 {new Date(row.updated_at).toLocaleString("zh-CN")}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button
                        type="button"
                        onClick={() => editPerf(row)}
                        className="btn btn-outline btn-sm"
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        onClick={() => deletePerf(row.id)}
                        className="btn btn-ghost btn-sm"
                        style={{ color: "var(--destructive)" }}
                      >
                        删除
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* ═══════════════════════════════════════
          Tab: 门店奖金
      ═══════════════════════════════════════ */}
      {activeTab === "bonus" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <p className="field-hint">
            门店奖金与员工+门店挂钩，计薪时直接归入对应门店，不参与跨店比例分摊。
          </p>

          <div className="field">
            <label className="field-label">员工</label>
            <select
              value={bonusEmployeeId}
              onChange={(e) => setBonusEmployeeId(e.target.value)}
              className="input"
            >
              <option value="">选择员工</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.emp_no ? `${e.name ?? "未知"} (${e.emp_no})` : (e.name ?? "未知")}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="field-label">归属门店</label>
            <select
              value={bonusStoreId}
              onChange={(e) => setBonusStoreId(e.target.value)}
              className="input"
            >
              <option value="">选择门店</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name ?? "未知门店"}
                </option>
              ))}
            </select>
            <p className="field-hint">
              选择该奖金所属的门店，计薪时将直接计入该门店的薪资支出
            </p>
          </div>

          <div className="field">
            <label className="field-label">奖金金额（元）</label>
            <input
              type="number"
              placeholder="0.00"
              min={0}
              step={0.01}
              value={bonusAmount}
              onChange={(e) => setBonusAmount(e.target.value)}
              className="input"
              style={{ maxWidth: "12rem" }}
            />
          </div>

          <div className="field">
            <label className="field-label">备注（选填）</label>
            <input
              type="text"
              placeholder="如：3月门店销售奖"
              value={bonusNote}
              onChange={(e) => setBonusNote(e.target.value)}
              className="input"
            />
          </div>

          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button type="button" onClick={submitBonus} className="btn btn-primary">
              保存奖金
            </button>
            {(bonusEmployeeId || bonusStoreId) && (
              <button
                type="button"
                onClick={() => {
                  setBonusEmployeeId("");
                  setBonusStoreId("");
                  setBonusAmount("");
                  setBonusNote("");
                  setBonusMsg("");
                }}
                className="btn btn-ghost btn-sm"
              >
                清空
              </button>
            )}
          </div>

          <div
            className={
              bonusMsgType === "error"
                ? "msg-error"
                : bonusMsgType === "success"
                ? "msg-success"
                : "msg-info"
            }
            style={disabledStyle.opacity === 0.6 ? undefined : undefined}
          >
            {bonusMsg || "\u00A0"}
          </div>

          {/* 门店奖金列表 */}
          <section style={{ marginTop: "1rem" }}>
            <h2 className="heading-2" style={{ marginBottom: "0.75rem" }}>
              {month.slice(0, 7)} 门店奖金记录
            </h2>
            {bonusLoading ? (
              <p className="muted-text">加载中…</p>
            ) : bonusRows.length === 0 ? (
              <p className="muted-text">本月暂无门店奖金记录</p>
            ) : (
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                }}
              >
                {bonusRows.map((row) => (
                  <li
                    key={row.id}
                    className="card"
                    style={{
                      padding: "0.75rem 1rem",
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "0.5rem",
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ fontWeight: 600 }}>{empLabel(row.employees)}</span>
                      <span className="muted-text" style={{ marginLeft: "0.5rem" }}>
                        @ {row.stores?.name ?? "未知门店"}
                      </span>
                      <span
                        style={{
                          marginLeft: "0.75rem",
                          fontWeight: 600,
                          color: "var(--primary)",
                        }}
                      >
                        ¥{Number(row.amount).toFixed(2)}
                      </span>
                      {row.note && (
                        <span className="muted-text" style={{ marginLeft: "0.5rem" }}>
                          · {row.note}
                        </span>
                      )}
                      <div className="field-hint" style={{ marginTop: "0.25rem" }}>
                        更新于 {new Date(row.updated_at).toLocaleString("zh-CN")}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button
                        type="button"
                        onClick={() => editBonus(row)}
                        className="btn btn-outline btn-sm"
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteBonus(row.id)}
                        className="btn btn-ghost btn-sm"
                        style={{ color: "var(--destructive)" }}
                      >
                        删除
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
