"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Profile = { role: string | null; store_id: string | null } | null;

type Employee = { id: string; name: string | null; emp_no?: string | null; status?: string };

type MonthlyWorkdayRow = {
  id: string;
  month: string;
  store_id: string;
  employee_id: string;
  days: number;
  created_at: string;
  employees: { name: string | null; emp_no?: string | null } | null;
};

function getCurrentMonthFirst(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function mapError(message: string): string {
  if (message.includes("Employee not payable"))
    return "该员工未投保或状态不允许计薪，请先完成投保/转正状态确认";
  if (message.includes("Trial employee cannot have regular_days"))
    return "试用期员工本月不能填写转正规则天数";
  if (message.includes("Regular employee cannot have trial_days"))
    return "转正员工本月不能填写试用期天数";
  if (
    message.includes("duplicate key") ||
    message.includes("unique constraint") ||
    message.includes("uniq_mw_month_store_employee")
  )
    return "该员工本月已录入，将为你更新";
  if (message.includes('null value in column "store_id"')) return "请选择门店";
  return message;
}

function isStoreManager(profile: Profile): boolean {
  return profile?.role === "store_manager" && !!profile?.store_id;
}

export default function WorkdaysPage() {
  const [profile, setProfile] = useState<Profile>(null);
  const [storeId, setStoreId] = useState<string>("");
  const [storeName, setStoreName] = useState<string>("");
  const [month, setMonth] = useState(() => getCurrentMonthFirst());
  const [employeeId, setEmployeeId] = useState("");
  const [workdays, setWorkdays] = useState("");
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"info" | "error" | "success">("info");
  const [selectedEmployeeInsured, setSelectedEmployeeInsured] = useState<boolean | null>(null);

  const [monthlyList, setMonthlyList] = useState<MonthlyWorkdayRow[]>([]);
  const [monthlyListLoading, setMonthlyListLoading] = useState(false);

  const [employeesInMonth, setEmployeesInMonth] = useState<Employee[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Employee[]>([]);
  const [searching, setSearching] = useState(false);

  const isManager = isStoreManager(profile);

  const loadProfileAndStore = useCallback(async () => {
    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user ?? null;
    if (!user) {
      setProfile(null);
      setStoreId("");
      setStoreName("");
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

    if (isStoreManager(p) && p?.store_id) {
      setStoreId(p.store_id);
      const { data: storeData } = await supabase
        .from("stores")
        .select("name")
        .eq("id", p.store_id)
        .maybeSingle();
      setStoreName(storeData?.name ?? "本门店");
    } else {
      setStoreId("");
      setStoreName("");
    }
  }, []);

  const loadMonthlyList = useCallback(async () => {
    if (!storeId || !month) {
      setMonthlyList([]);
      return;
    }
    setMonthlyListLoading(true);
    const { data, error } = await supabase
      .from("monthly_workdays")
      .select("id, month, store_id, employee_id, days, created_at, employees(name, emp_no)")
      .eq("store_id", storeId)
      .eq("month", month)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("加载本月录入列表失败:", error);
      setMonthlyList([]);
    } else {
      const list = (data as unknown as MonthlyWorkdayRow[]) ?? [];
      setMonthlyList(list);
      const emps: Employee[] = list.map((row) => ({
        id: row.employee_id,
        name: row.employees?.name ?? "未知",
      }));
      setEmployeesInMonth(emps);
    }
    setMonthlyListLoading(false);
  }, [storeId, month]);

  useEffect(() => {
    loadProfileAndStore();
  }, [loadProfileAndStore]);

  useEffect(() => {
    loadMonthlyList();
  }, [loadMonthlyList]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const t = searchQuery.trim();
    setSearching(true);
    supabase
      .from("employees")
      .select("id, name, emp_no, status")
      .or(`name.ilike.%${t}%,emp_no.ilike.%${t}%`)
      .limit(20)
      .then(({ data, error }) => {
        if (error) {
          console.error("搜索员工失败:", error);
          setSearchResults([]);
        } else {
          setSearchResults((data as Employee[]) ?? []);
        }
        setSearching(false);
      });
  }, [searchQuery]);

  const allSelectableEmployees = useCallback(() => {
    const byId = new Map<string, Employee>();
    employeesInMonth.forEach((e) => byId.set(e.id, e));
    searchResults.forEach((e) => byId.set(e.id, e));
    return Array.from(byId.values()).sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  }, [employeesInMonth, searchResults]);

  useEffect(() => {
    if (!employeeId) {
      setSelectedEmployeeInsured(null);
      return;
    }
    (async () => {
      let isInsured = false;
      const { data: viewData, error: viewError } = await supabase
        .from("v_employee_insurance_status")
        .select("is_insured")
        .eq("employee_id", employeeId)
        .maybeSingle();
      if (!viewError && viewData?.is_insured === true) isInsured = true;
      if (!isInsured) {
        const { data: directData } = await supabase
          .from("employee_insurance")
          .select("id")
          .eq("employee_id", employeeId)
          .eq("status", "active")
          .gte("end_date", new Date().toISOString().slice(0, 10))
          .limit(1);
        if (directData && directData.length > 0) isInsured = true;
      }
      setSelectedEmployeeInsured(isInsured);
    })();
  }, [employeeId]);

  const showMsg = (text: string, type: "info" | "error" | "success") => {
    setMsg(text);
    setMsgType(type);
  };

  const submit = async () => {
    if (!storeId) {
      showMsg("无法获取门店信息，请重新登录", "error");
      return;
    }
    if (!employeeId) {
      showMsg("请选择员工", "error");
      return;
    }
    if (!month) {
      showMsg("请选择月份", "error");
      return;
    }
    const daysNum = Number(workdays);
    if (workdays === "" || Number.isNaN(daysNum)) {
      showMsg("请填写有效的工作天数", "error");
      return;
    }
    if (daysNum < 0 || daysNum > 31) {
      showMsg("工作天数须在 0～31 之间", "error");
      return;
    }

    let isInsured = false;
    const { data: viewData, error: viewError } = await supabase
      .from("v_employee_insurance_status")
      .select("is_insured")
      .eq("employee_id", employeeId)
      .maybeSingle();
    if (!viewError && viewData?.is_insured === true) isInsured = true;
    if (!isInsured) {
      const { data: directData } = await supabase
        .from("employee_insurance")
        .select("id")
        .eq("employee_id", employeeId)
        .eq("status", "active")
        .gte("end_date", new Date().toISOString().slice(0, 10))
        .limit(1);
      if (directData && directData.length > 0) isInsured = true;
    }
    if (!isInsured) {
      showMsg("该员工没有购买意外险，不能输入考勤", "error");
      return;
    }

    showMsg("提交中...", "info");

    const existing = monthlyList.find(
      (r) => r.employee_id === employeeId && r.store_id === storeId && r.month === month
    );

    if (existing) {
      const { error: updateError } = await supabase
        .from("monthly_workdays")
        .update({ days: daysNum })
        .eq("id", existing.id);

      if (updateError) {
        console.error("更新工作天数失败:", updateError);
        showMsg("更新失败：" + mapError(updateError.message), "error");
        return;
      }
      showMsg("已更新", "success");
      loadMonthlyList();
      setWorkdays("");
      setEmployeeId("");
      return;
    }

    const { error: insertError } = await supabase.from("monthly_workdays").insert([
      {
        employee_id: employeeId,
        store_id: storeId,
        month,
        days: daysNum,
      },
    ]);

    if (insertError) {
      if (
        insertError.message.includes("duplicate key") ||
        insertError.message.includes("unique constraint") ||
        insertError.message.includes("uniq_mw_month_store_employee")
      ) {
        showMsg("该员工本月已录入，将为你更新", "info");
        const { data: rows } = await supabase
          .from("monthly_workdays")
          .select("id")
          .eq("store_id", storeId)
          .eq("month", month)
          .eq("employee_id", employeeId)
          .limit(1);
        if (rows?.[0]) {
          const { error: retryErr } = await supabase
            .from("monthly_workdays")
            .update({ days: daysNum })
            .eq("id", (rows[0] as { id: string }).id);
          if (!retryErr) {
            showMsg("已更新", "success");
            loadMonthlyList();
            setWorkdays("");
            setEmployeeId("");
          } else {
            showMsg("更新失败，请稍后重试", "error");
          }
        }
      } else {
        console.error("提交工作天数失败:", insertError);
        showMsg("提交失败：" + mapError(insertError.message), "error");
      }
      return;
    }

    showMsg("已提交", "success");
    loadMonthlyList();
    setWorkdays("");
    setEmployeeId("");
  };

  const fillFormForEdit = (row: MonthlyWorkdayRow) => {
    setEmployeeId(row.employee_id);
    setWorkdays(String(row.days));
  };

  const removeRecord = async (id: string) => {
    if (!confirm("确定要删除这条录入记录吗？")) return;
    const { error } = await supabase.from("monthly_workdays").delete().eq("id", id);
    if (error) {
      console.error("删除失败:", error);
      showMsg("删除失败：" + mapError(error.message), "error");
      return;
    }
    showMsg("已删除", "success");
    loadMonthlyList();
    if (employeeId && monthlyList.some((r) => r.id === id && r.employee_id === employeeId)) {
      setEmployeeId("");
      setWorkdays("");
    }
  };

  const selectables = allSelectableEmployees();

  if (profile === null) {
    return (
      <main className="page-container" style={{ maxWidth: 32 * 16 }}>
        <p className="muted-text">加载中…</p>
      </main>
    );
  }

  if (!isManager || !storeId) {
    return (
      <main className="page-container" style={{ maxWidth: 32 * 16 }}>
        <p className="body-text" style={{ color: "var(--foreground)" }}>
          仅店长可录入工作天数，或你的账号未绑定门店，请联系管理员。
        </p>
        <Link href="/me" className="btn btn-ghost btn-sm" style={{ marginTop: "0.5rem", display: "inline-flex" }}>
          返回个人页
        </Link>
      </main>
    );
  }

  return (
    <main className="page-container" style={{ maxWidth: 32 * 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.75rem", marginBottom: "1.5rem" }}>
        <h1 className="heading-1">录入工作天数</h1>
        <Link href="/insurance" className="btn btn-outline btn-sm">
          投保管理
        </Link>
        <Link href="/employees/new" className="btn btn-outline btn-sm">
          员工入职
        </Link>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div className="field">
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

        <div className="field">
          <label className="field-label">门店</label>
          <div className="card" style={{ padding: "0.75rem 1rem", pointerEvents: "none" }}>
            {storeName || "本门店"}
          </div>
        </div>

        <div className="field">
          <label className="field-label">员工</label>
          <p className="field-hint" style={{ marginBottom: "0.25rem" }}>
            可选：本月已录入员工，或下方搜索添加其他员工
          </p>
          <input
            type="text"
            placeholder="搜索员工姓名或工号"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input"
            style={{ marginBottom: "0.5rem" }}
          />
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="input"
          >
            <option value="">选择员工</option>
            {monthlyList.length > 0 && (
              <optgroup label="本月已录入">
                {monthlyList.map((r) => {
                  const nm = r.employees?.name ?? "未知";
                  const no = r.employees?.emp_no;
                  const label = no ? `${nm} (${no})（已录 ${r.days} 天）` : `${nm}（已录 ${r.days} 天）`;
                  return (
                    <option key={r.id} value={r.employee_id}>
                      {label}
                    </option>
                  );
                })}
              </optgroup>
            )}
            {searchResults.length > 0 && (
              <optgroup label="搜索结果">
                {searchResults.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.emp_no ? `${e.name ?? "未知"} (${e.emp_no})` : (e.name ?? "未知")}
                  </option>
                ))}
              </optgroup>
            )}
            {selectables.length === 0 && !searching && (
              <option value="" disabled>
                {monthlyListLoading ? "加载中…" : "请先搜索员工或等待本月列表加载"}
              </option>
            )}
          </select>
        </div>

        {selectedEmployeeInsured === false && (
          <div className="card msg-error" style={{ padding: "0.75rem 1rem" }}>
            该员工没有购买意外险，不能输入考勤
          </div>
        )}

        <div className="field">
          <label className="field-label">工作天数</label>
          <input
            type="number"
            placeholder="0～31"
            min={0}
            max={31}
            value={workdays}
            onChange={(e) => setWorkdays(e.target.value)}
            disabled={selectedEmployeeInsured === false}
            className="input"
            style={{ opacity: selectedEmployeeInsured === false ? 0.6 : 1 }}
          />
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={selectedEmployeeInsured === false}
          className="btn btn-primary"
          style={{ opacity: selectedEmployeeInsured === false ? 0.6 : 1 }}
        >
          提交
        </button>

        <div className={msgType === "error" ? "msg-error" : msgType === "success" ? "msg-success" : "msg-info"}>
          {msg || "\u00A0"}
        </div>
      </div>

      <section style={{ marginTop: "2rem" }}>
        <h2 className="heading-2" style={{ marginBottom: "0.75rem" }}>本月录入列表</h2>
        {monthlyListLoading ? (
          <p className="muted-text">加载中…</p>
        ) : monthlyList.length === 0 ? (
          <p className="muted-text">本月暂无录入</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {[...monthlyList]
              .sort((a, b) => (a.employees?.name ?? "").localeCompare(b.employees?.name ?? ""))
              .map((row) => (
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
                    <span style={{ fontWeight: 600 }}>
                      {row.employees?.emp_no
                        ? `${row.employees.name ?? "未知"} (${row.employees.emp_no})`
                        : (row.employees?.name ?? "未知")}
                    </span>
                    <span className="muted-text" style={{ marginLeft: "0.5rem" }}>{row.days} 天</span>
                    <div className="field-hint" style={{ marginTop: "0.25rem" }}>
                      更新于 {new Date(row.created_at).toLocaleString("zh-CN")}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button type="button" onClick={() => fillFormForEdit(row)} className="btn btn-outline btn-sm">
                      编辑
                    </button>
                    <button type="button" onClick={() => removeRecord(row.id)} className="btn btn-ghost btn-sm" style={{ color: "var(--destructive)" }}>
                      删除
                    </button>
                  </div>
                </li>
              ))}
          </ul>
        )}
      </section>
    </main>
  );
}
