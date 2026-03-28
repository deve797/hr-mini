"use client";

/**
 * 录工时双通道升级
 * - 默认员工来源：本店员工池 store_staff_pool（仅本店可调用员工）
 * - 跨店支援开关：默认关闭；开启后可搜索全公司 employees
 * - 成功后自动入池：insert/update monthly_workdays 成功后，自动 upsert store_staff_pool
 *   若店长无写权限（RLS 拒绝），则静默失败，录工时不受影响
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Profile = { role: string | null; store_id: string | null } | null;

type Employee = { id: string; name: string | null; emp_no?: string | null; employment_status?: string; phone?: string | null };

type MonthlyWorkdayRow = {
  id: string;
  month: string;
  store_id: string;
  employee_id: string;
  workdays: number;
  trial_days?: number;
  regular_days?: number;
  overtime_hours?: number;
  days_reaching_12h?: number;
  created_at: string;
  employees: { name: string | null; emp_no?: string | null } | null;
};

function getCurrentMonthFirst(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/** 根据 month (YYYY-MM-01) 返回当月首尾日期 */
function getMonthRange(month: string): { monthStart: string; monthEnd: string } {
  const [y, m] = month.split("-").map(Number);
  const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const monthEnd = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { monthStart, monthEnd };
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

/** 按录入月份判断保险是否覆盖：status=active 且 保险区间与 month 有重叠 */
async function checkInsuredForMonth(employeeId: string, month: string): Promise<boolean> {
  const { monthStart, monthEnd } = getMonthRange(month);
  const { data } = await supabase
    .from("employee_insurance")
    .select("id")
    .eq("employee_id", employeeId)
    .eq("status", "active")
    .lte("start_date", monthEnd)
    .gte("end_date", monthStart)
    .limit(1);
  return !!(data && data.length > 0);
}

/** 录工时成功后尝试加入本店员工池；店长无写权限时 RLS 会拒绝，属预期，录工时不受影响 */
async function tryAddToStorePool(
  storeId: string,
  employeeId: string,
  onPoolFail?: () => void
): Promise<void> {
  try {
    const { error } = await supabase
      .from("store_staff_pool")
      .upsert(
        { store_id: storeId, employee_id: employeeId, status: "active" },
        { onConflict: "store_id,employee_id" }
      );
    if (error) {
      console.error("[store_staff_pool] 自动入池失败（店长无写权限时属预期）:", error);
      onPoolFail?.();
    } else {
      console.log("[store_staff_pool] 已自动加入本店员工池:", employeeId);
    }
  } catch (e) {
    console.error("[store_staff_pool] 自动入池异常:", e);
    onPoolFail?.();
  }
}

export default function WorkdaysPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [profile, setProfile] = useState<Profile>(null);
  const [storeId, setStoreId] = useState<string>("");
  const [storeName, setStoreName] = useState<string>("");
  const [month, setMonth] = useState(() => getCurrentMonthFirst());
  const [employeeId, setEmployeeId] = useState("");
  const [workdays, setWorkdays] = useState("");
  const [overtimeHours, setOvertimeHours] = useState("0");
  const [daysReaching12h, setDaysReaching12h] = useState("0");
  const [selectedEmployeeWorkShift, setSelectedEmployeeWorkShift] = useState<number | null>(null);
  const [selectedEmployeeStatus, setSelectedEmployeeStatus] = useState<string | null>(null);
  const [midMonthConversion, setMidMonthConversion] = useState(false);
  const [trialDaysInput, setTrialDaysInput] = useState("0");
  const [regularDaysInput, setRegularDaysInput] = useState("0");
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"info" | "error" | "success">("info");
  const [selectedEmployeeInsured, setSelectedEmployeeInsured] = useState<boolean | null>(null);

  const [monthlyList, setMonthlyList] = useState<MonthlyWorkdayRow[]>([]);
  const [monthlyListLoading, setMonthlyListLoading] = useState(false);

  const [poolStaff, setPoolStaff] = useState<Employee[]>([]);
  const [poolLoading, setPoolLoading] = useState(false);

  const [employeesInMonth, setEmployeesInMonth] = useState<Employee[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Employee[]>([]);
  const [searching, setSearching] = useState(false);
  const [crossStoreSupport, setCrossStoreSupport] = useState(false);
  const [poolAddFailedHint, setPoolAddFailedHint] = useState(false);
  /** 店长：是否已查询 employees.user_id 本人绑定 */
  const [linkedSelfChecked, setLinkedSelfChecked] = useState(false);
  const [linkedSelfEmployee, setLinkedSelfEmployee] = useState<{
    name: string | null;
    emp_no: string | null;
  } | null>(null);

  const isManager = isStoreManager(profile);

  const loadProfileAndStore = useCallback(async () => {
    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user ?? null;
    if (!user) {
      setUserId(null);
      setProfileError(null);
      setProfile(null);
      setStoreId("");
      setStoreName("");
      setLinkedSelfEmployee(null);
      setLinkedSelfChecked(false);
      setPageLoading(false);
      return;
    }
    setUserId(user.id);
    const { data: profileData, error: profileErr } = await supabase
      .from("users_profile")
      .select("role, store_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profileErr) {
      console.error("users_profile 查询失败:", profileErr);
      setProfileError(profileErr.message);
      setProfile(null);
      setStoreId("");
      setStoreName("");
      setLinkedSelfEmployee(null);
      setLinkedSelfChecked(true);
      setPageLoading(false);
      return;
    }
    setProfileError(null);
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
      const { data: linkEmp } = await supabase
        .from("employees")
        .select("name, emp_no")
        .eq("user_id", user.id)
        .maybeSingle();
      setLinkedSelfEmployee(linkEmp ?? null);
    } else {
      setStoreId("");
      setStoreName("");
      setLinkedSelfEmployee(null);
    }
    setLinkedSelfChecked(true);
    setPageLoading(false);
  }, []);

  const loadMonthlyList = useCallback(async () => {
    if (!storeId || !month) {
      setMonthlyList([]);
      return;
    }
    setMonthlyListLoading(true);
    const { data, error } = await supabase
      .from("monthly_workdays")
      .select("id, month, store_id, employee_id, workdays, trial_days, regular_days, overtime_hours, days_reaching_12h, created_at, employees(name, emp_no)")
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
        emp_no: row.employees?.emp_no,
      }));
      setEmployeesInMonth(emps);
    }
    setMonthlyListLoading(false);
  }, [storeId, month]);

  const loadPoolStaff = useCallback(async () => {
    if (!storeId) {
      setPoolStaff([]);
      return;
    }
    setPoolLoading(true);
    const { data, error } = await supabase
      .from("store_staff_pool")
      .select("employee_id, employees(id, name, emp_no, phone)")
      .eq("store_id", storeId)
      .eq("status", "active");

    if (error) {
      console.error("加载本店员工池失败:", error);
      setPoolStaff([]);
    } else {
      const rows = (data ?? []) as unknown as Array<{ employee_id: string; employees: { id: string; name: string | null; emp_no: string | null; phone: string | null } | null }>;
      const emps: Employee[] = rows
        .filter((r) => r.employees)
        .map((r) => ({
          id: r.employee_id,
          name: r.employees?.name ?? "未知",
          emp_no: r.employees?.emp_no ?? null,
          phone: r.employees?.phone ?? null,
        }));
      setPoolStaff(emps);
    }
    setPoolLoading(false);
  }, [storeId]);

  useEffect(() => {
    loadProfileAndStore();
  }, [loadProfileAndStore]);

  useEffect(() => {
    loadMonthlyList();
  }, [loadMonthlyList]);

  useEffect(() => {
    loadPoolStaff();
  }, [loadPoolStaff]);

  /** 跨店支援开启且至少2字符时，搜索 employees 全表 */
  useEffect(() => {
    if (!crossStoreSupport) {
      setSearchResults([]);
      return;
    }
    const t = searchQuery.trim();
    if (t.length < 2) {
      setSearchResults([]);
      return;
    }
    const safe = t.replace(/%/g, "");
    setSearching(true);
    supabase
      .from("employees")
      .select("id, name, emp_no, phone, employment_status")
      .or(`name.ilike.%${safe}%,emp_no.ilike.%${safe}%,phone.ilike.%${safe}%`)
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
  }, [crossStoreSupport, searchQuery]);

  const getFilteredPoolStaff = useCallback((): Employee[] => {
    if (!searchQuery.trim()) return poolStaff;
    const q = searchQuery.trim().toLowerCase();
    return poolStaff.filter(
      (e) =>
        (e.name ?? "").toLowerCase().includes(q) ||
        (e.emp_no ?? "").toLowerCase().includes(q) ||
        (e.phone ?? "").includes(q)
    );
  }, [poolStaff, searchQuery]);

  const allSelectableEmployees = useCallback(() => {
    const byId = new Map<string, Employee>();
    employeesInMonth.forEach((e) => byId.set(e.id, e));
    if (crossStoreSupport) {
      searchResults.forEach((e) => byId.set(e.id, e));
    } else {
      getFilteredPoolStaff().forEach((e) => byId.set(e.id, e));
    }
    return Array.from(byId.values()).sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  }, [employeesInMonth, crossStoreSupport, searchResults, getFilteredPoolStaff]);

  useEffect(() => {
    if (!employeeId || !month) {
      setSelectedEmployeeInsured(null);
      return;
    }
    (async () => {
      const isInsured = await checkInsuredForMonth(employeeId, month);
      setSelectedEmployeeInsured(isInsured);
    })();
  }, [employeeId, month]);

  /** 选中员工时查询其 work_shift 和 employment_status */
  useEffect(() => {
    if (!employeeId) {
      setSelectedEmployeeWorkShift(null);
      setSelectedEmployeeStatus(null);
      setDaysReaching12h("0");
      setMidMonthConversion(false);
      setTrialDaysInput("0");
      setRegularDaysInput("0");
      return;
    }
    supabase
      .from("employees")
      .select("work_shift, employment_status")
      .eq("id", employeeId)
      .maybeSingle()
      .then(({ data }) => {
        const empRecord = data as { work_shift?: number | null; employment_status?: string | null } | null;
        const shift = empRecord ? Number(empRecord.work_shift ?? 0) : null;
        setSelectedEmployeeWorkShift(shift);
        if (shift === 12) setDaysReaching12h("0");
        const empStatus = empRecord?.employment_status ?? null;
        setSelectedEmployeeStatus(empStatus);
        if (empStatus !== "试用期") {
          setMidMonthConversion(false);
          setTrialDaysInput("0");
          setRegularDaysInput("0");
        }
      });
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
    let daysNum: number;
    let trial_days: number;
    let regular_days: number;

    if (midMonthConversion) {
      const trialNum = Math.max(0, Math.floor(Number(trialDaysInput) || 0));
      const regularNum = Math.max(0, Math.floor(Number(regularDaysInput) || 0));
      if (trialNum === 0 && regularNum === 0) {
        showMsg("月中转正模式下，试用期天数和转正天数不能都为 0", "error");
        return;
      }
      if (trialNum + regularNum > 31) {
        showMsg("试用期天数 + 转正天数合计须在 0～31 之间", "error");
        return;
      }
      daysNum = trialNum + regularNum;
      trial_days = trialNum;
      regular_days = regularNum;
    } else {
      daysNum = Number(workdays);
      if (workdays === "" || Number.isNaN(daysNum)) {
        showMsg("请填写有效的工作天数", "error");
        return;
      }
      if (daysNum < 0 || daysNum > 31) {
        showMsg("工作天数须在 0～31 之间", "error");
        return;
      }
      const isTrial = selectedEmployeeStatus === "试用期";
      trial_days = isTrial ? daysNum : 0;
      regular_days = isTrial ? 0 : daysNum;
    }

    const isInsured = await checkInsuredForMonth(employeeId, month);
    if (!isInsured) {
      showMsg("该员工在该月没有购买意外险，不能输入考勤", "error");
      return;
    }

    showMsg("提交中...", "info");

    const existing = monthlyList.find(
      (r) => r.employee_id === employeeId && r.store_id === storeId && r.month === month
    );

    const onSuccess = () => {
      setPoolAddFailedHint(false);
      tryAddToStorePool(storeId, employeeId, () => setPoolAddFailedHint(true));
      showMsg(
        "已提交。请通知财务对该月重新运行工资计算，以同步本次出勤修改。",
        "success"
      );
      loadMonthlyList();
      setWorkdays("");
      setOvertimeHours("0");
      setDaysReaching12h("0");
      setMidMonthConversion(false);
      setTrialDaysInput("0");
      setRegularDaysInput("0");
      setEmployeeId("");
    };

    const overtimeHoursNum = Math.max(0, Number(overtimeHours) || 0);
    const daysReaching12hNum = selectedEmployeeWorkShift === 12
      ? 0
      : Math.max(0, Math.min(daysNum, Math.floor(Number(daysReaching12h) || 0)));
    const payload = {
      workdays: daysNum,
      trial_days,
      regular_days,
      overtime_hours: overtimeHoursNum,
      days_reaching_12h: daysReaching12hNum,
    };

    if (existing) {
      const { error: updateError } = await supabase
        .from("monthly_workdays")
        .update(payload)
        .eq("id", existing.id);

      if (updateError) {
        console.error("更新工作天数失败:", updateError);
        showMsg("更新失败：" + mapError(updateError.message), "error");
        return;
      }
      onSuccess();
      return;
    }

    const insertPayload = {
      employee_id: employeeId,
      store_id: storeId,
      month,
      ...payload,
    };
    if (typeof window !== "undefined") console.log("[workdays] 提交 payload:", insertPayload);
    const { error: insertError } = await supabase.from("monthly_workdays").insert([insertPayload]);

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
            .update(payload)
            .eq("id", (rows[0] as { id: string }).id);
          if (!retryErr) {
            onSuccess();
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

    onSuccess();
  };

  const fillFormForEdit = (row: MonthlyWorkdayRow) => {
    setEmployeeId(row.employee_id);
    const trialD = row.trial_days ?? 0;
    const regularD = row.regular_days ?? 0;
    const isMidMonth = trialD > 0 && regularD > 0;
    if (isMidMonth) {
      setMidMonthConversion(true);
      setTrialDaysInput(String(trialD));
      setRegularDaysInput(String(regularD));
      setWorkdays("");
    } else {
      setMidMonthConversion(false);
      setTrialDaysInput("0");
      setRegularDaysInput("0");
      const total = row.workdays ?? trialD + regularD;
      setWorkdays(String(total));
    }
    setOvertimeHours(String(row.overtime_hours ?? 0));
    setDaysReaching12h(String(row.days_reaching_12h ?? 0));
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
  const filteredPool = getFilteredPoolStaff();

  if (pageLoading) {
    return (
      <main className="page-container" style={{ maxWidth: 32 * 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.75rem", marginBottom: "1.5rem" }}>
          <h1 className="heading-1" style={{ marginBottom: 0 }}>录入工作天数</h1>
          <Link href="/" className="btn btn-outline btn-sm">
            返回主页
          </Link>
        </div>
        <p className="muted-text">加载中…</p>
      </main>
    );
  }

  if (!userId) {
    return (
      <main className="page-container" style={{ maxWidth: 32 * 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.75rem", marginBottom: "1.5rem" }}>
          <h1 className="heading-1" style={{ marginBottom: 0 }}>录入工作天数</h1>
          <Link href="/" className="btn btn-outline btn-sm">
            返回主页
          </Link>
        </div>
        <p className="body-text" style={{ color: "var(--foreground)" }}>请先登录</p>
        <Link href="/me" className="btn btn-ghost btn-sm" style={{ marginTop: "0.5rem", display: "inline-flex" }}>
          返回个人页
        </Link>
        <Link href="/login" className="btn btn-outline btn-sm" style={{ marginTop: "0.5rem", marginLeft: "0.5rem", display: "inline-flex" }}>
          去登录
        </Link>
      </main>
    );
  }

  if (profileError) {
    return (
      <main className="page-container" style={{ maxWidth: 32 * 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.75rem", marginBottom: "1.5rem" }}>
          <h1 className="heading-1" style={{ marginBottom: 0 }}>录入工作天数</h1>
          <Link href="/" className="btn btn-outline btn-sm">
            返回主页
          </Link>
        </div>
        <p className="msg-error">查询 users_profile 失败：{profileError}</p>
        <Link href="/me" className="btn btn-ghost btn-sm" style={{ marginTop: "0.5rem", display: "inline-flex" }}>
          返回个人页
        </Link>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="page-container" style={{ maxWidth: 32 * 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.75rem", marginBottom: "1.5rem" }}>
          <h1 className="heading-1" style={{ marginBottom: 0 }}>录入工作天数</h1>
          <Link href="/" className="btn btn-outline btn-sm">
            返回主页
          </Link>
        </div>
        <p className="body-text" style={{ color: "var(--foreground)" }}>
          已登录，但未在 users_profile 中查到该账号的角色与门店绑定，请联系总部管理员。
        </p>
        <Link href="/me" className="btn btn-ghost btn-sm" style={{ marginTop: "0.5rem", display: "inline-flex" }}>
          查看账号信息
        </Link>
      </main>
    );
  }

  if (!isManager || !storeId) {
    return (
      <main className="page-container" style={{ maxWidth: 32 * 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.75rem", marginBottom: "1.5rem" }}>
          <h1 className="heading-1" style={{ marginBottom: 0 }}>录入工作天数</h1>
          <Link href="/" className="btn btn-outline btn-sm">
            返回主页
          </Link>
        </div>
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
        <h1 className="heading-1" style={{ marginBottom: 0 }}>录入工作天数</h1>
        <Link href="/" className="btn btn-outline btn-sm">
          返回主页
        </Link>
        <Link href="/insurance" className="btn btn-outline btn-sm">
          投保管理
        </Link>
        <Link href="/employees/new" className="btn btn-outline btn-sm">
          员工入职
        </Link>
      </div>

      <p className="field-hint" style={{ marginBottom: "1rem", maxWidth: "42rem" }}>
        修改或补录出勤并保存后，工资不会自动更新；请通知财务在「工资与分摊」中对所选月份点击「运行工资计算（含分摊）」，才会按新出勤重算工资与门店分摊。
      </p>

      {isManager && linkedSelfChecked && !linkedSelfEmployee ? (
        <div
          className="card"
          style={{
            padding: "1rem 1.25rem",
            marginBottom: "1rem",
            borderColor: "color-mix(in srgb, var(--secondary) 40%, var(--border))",
            background: "color-mix(in srgb, var(--secondary) 8%, var(--card-bg))",
          }}
          role="region"
          aria-label="店长本人档案提示"
        >
          <p className="body-text" style={{ margin: 0, fontWeight: 600, color: "var(--foreground)" }}>
            尚未绑定本人员工档案
          </p>
          <p className="field-hint" style={{ marginTop: "0.5rem", marginBottom: "0.75rem" }}>
            参与本人考勤与工资前，请先到「员工入职」填写本人信息并勾选「绑定当前登录账号」，再完成投保；之后可在本页选择本人录入工时。
          </p>
          <Link href="/employees/new" className="btn btn-primary btn-sm" style={{ display: "inline-flex" }}>
            去员工入职
          </Link>
        </div>
      ) : null}

      {isManager && linkedSelfChecked && linkedSelfEmployee ? (
        <p className="field-hint" style={{ marginBottom: "1rem" }}>
          本人档案：{linkedSelfEmployee.name ?? "—"}（{linkedSelfEmployee.emp_no ?? "—"}）· 投保通过后在下方选择本人录入工时。
        </p>
      ) : null}

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
            默认：本月已录入 + 本店员工池。开启「跨店支援」可搜索全公司员工
          </p>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem", fontSize: "0.875rem" }}>
            <input
              type="checkbox"
              checked={crossStoreSupport}
              onChange={(e) => setCrossStoreSupport(e.target.checked)}
              style={{ width: "1rem", height: "1rem" }}
            />
            <span>跨店支援员工（搜索全公司）</span>
          </label>
          <input
            type="text"
            placeholder={crossStoreSupport ? "搜索姓名/工号/手机（至少2字）" : "在本店员工池中搜索"}
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
                  const total = r.workdays ?? (r.trial_days ?? 0) + (r.regular_days ?? 0);
                  const label = no ? `${nm} (${no})（已录 ${total} 天）` : `${nm}（已录 ${total} 天）`;
                  return (
                    <option key={r.id} value={r.employee_id}>
                      {label}
                    </option>
                  );
                })}
              </optgroup>
            )}
            {filteredPool.length > 0 && (
              <optgroup label="本店员工池">
                {filteredPool.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.emp_no ? `${e.name ?? "未知"} (${e.emp_no})` : (e.name ?? "未知")}
                  </option>
                ))}
              </optgroup>
            )}
            {crossStoreSupport && searchResults.length > 0 && (
              <optgroup label="跨店支援搜索结果">
                {searchResults.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.emp_no ? `${e.name ?? "未知"} (${e.emp_no})` : (e.name ?? "未知")}
                  </option>
                ))}
              </optgroup>
            )}
            {selectables.length === 0 && !searching && (
              <option value="" disabled>
                {monthlyListLoading || poolLoading ? "加载中…" : crossStoreSupport ? "开启跨店支援后输入至少2字搜索，或从本店员工池选择" : "请从本店员工池选择或开启跨店支援搜索"}
              </option>
            )}
          </select>
        </div>

        {selectedEmployeeInsured === false && (
          <div className="card msg-error" style={{ padding: "0.75rem 1rem" }}>
            该员工在该月没有购买意外险，不能输入考勤
          </div>
        )}

        {selectedEmployeeStatus === "试用期" && (
          <div className="field">
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem" }}>
              <input
                type="checkbox"
                checked={midMonthConversion}
                onChange={(e) => {
                  setMidMonthConversion(e.target.checked);
                  if (!e.target.checked) {
                    setTrialDaysInput("0");
                    setRegularDaysInput("0");
                  } else {
                    setWorkdays("");
                  }
                }}
                disabled={selectedEmployeeInsured === false}
                style={{ width: "1rem", height: "1rem" }}
              />
              <span>本月有月中转正（同一个月内既有试用期出勤又有转正后出勤）</span>
            </label>
          </div>
        )}

        {midMonthConversion ? (
          <>
            <div className="field">
              <label className="field-label">试用期出勤天数</label>
              <input
                type="number"
                placeholder="0～31"
                min={0}
                max={31}
                value={trialDaysInput}
                onChange={(e) => setTrialDaysInput(e.target.value)}
                disabled={selectedEmployeeInsured === false}
                className="input"
                style={{ opacity: selectedEmployeeInsured === false ? 0.6 : 1, maxWidth: "10rem" }}
              />
            </div>
            <div className="field">
              <label className="field-label">转正后出勤天数</label>
              <input
                type="number"
                placeholder="0～31"
                min={0}
                max={31}
                value={regularDaysInput}
                onChange={(e) => setRegularDaysInput(e.target.value)}
                disabled={selectedEmployeeInsured === false}
                className="input"
                style={{ opacity: selectedEmployeeInsured === false ? 0.6 : 1, maxWidth: "10rem" }}
              />
              <p className="field-hint">
                两项合计为本月总出勤天数（≤31）。转正日期请同步在「员工信息」中更新为「转正」状态。
              </p>
            </div>
          </>
        ) : (
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
        )}

        <div className="field">
          <label className="field-label">加班小时数（本店本月合计）</label>
          <input
            type="number"
            placeholder="0"
            min={0}
            max={999}
            step={0.5}
            value={overtimeHours}
            onChange={(e) => setOvertimeHours(e.target.value)}
            disabled={selectedEmployeeInsured === false}
            className="input"
            style={{ opacity: selectedEmployeeInsured === false ? 0.6 : 1, maxWidth: "10rem" }}
          />
          <p className="field-hint">如本月无加班填 0；支持小数（如 1.5 表示 1.5 小时）</p>
        </div>

        {selectedEmployeeWorkShift !== null && selectedEmployeeWorkShift !== 12 && (
          <div className="field">
            <label className="field-label">本月达到 12 小时的天数</label>
            <input
              type="number"
              placeholder="0"
              min={0}
              max={31}
              step={1}
              value={daysReaching12h}
              onChange={(e) => setDaysReaching12h(e.target.value)}
              disabled={selectedEmployeeInsured === false}
              className="input"
              style={{ opacity: selectedEmployeeInsured === false ? 0.6 : 1, maxWidth: "10rem" }}
            />
            <p className="field-hint">
              该员工为 {selectedEmployeeWorkShift} 小时班制（标准 1 餐/天）。
              如当天加班后工作时长达到 12 小时，填写天数，系统会多补 1 餐（10元）。
            </p>
          </div>
        )}

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
        {poolAddFailedHint && (
          <p className="field-hint" style={{ color: "var(--muted-foreground)" }}>
            已录工时，但自动加入员工池失败，请联系总部维护员工池
          </p>
        )}
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
                    {(row.trial_days ?? 0) > 0 && (row.regular_days ?? 0) > 0 ? (
                      <span className="muted-text" style={{ marginLeft: "0.5rem" }}>
                        {(row.trial_days ?? 0) + (row.regular_days ?? 0)} 天（试用 {row.trial_days} + 转正 {row.regular_days}）
                      </span>
                    ) : (
                      <span className="muted-text" style={{ marginLeft: "0.5rem" }}>{row.workdays ?? (row.trial_days ?? 0) + (row.regular_days ?? 0)} 天</span>
                    )}
                    {(row.overtime_hours ?? 0) > 0 && (
                      <span className="muted-text" style={{ marginLeft: "0.5rem" }}>· 加班 {row.overtime_hours} h</span>
                    )}
                    {(row.days_reaching_12h ?? 0) > 0 && (
                      <span className="muted-text" style={{ marginLeft: "0.5rem" }}>· 达12h {row.days_reaching_12h} 天</span>
                    )}
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
