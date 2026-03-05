"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Profile = { role: string | null; store_id: string | null } | null;

function getCurrentMonthFirst(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function mapInsertError(message: string): string {
  if (message.includes("Employee not payable"))
    return "该员工未投保或状态不允许计薪，请先完成投保/转正状态确认";
  if (message.includes("Trial employee cannot have regular_days"))
    return "试用期员工本月不能填写转正规则天数";
  if (message.includes("Regular employee cannot have trial_days"))
    return "转正员工本月不能填写试用期天数";
  if (message.includes("duplicate key value violates unique constraint"))
    return "本月该门店该员工已录入过天数，如需修改请到表里编辑或先删除再录入";
  if (message.includes('null value in column "store_id"')) return "请选择门店";
  return message;
}

function isStoreManager(profile: Profile): boolean {
  return profile?.role === "store_manager" && !!profile?.store_id;
}

export default function WorkdaysPage() {
  const [profile, setProfile] = useState<Profile>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [month, setMonth] = useState(() => getCurrentMonthFirst());
  const [workdays, setWorkdays] = useState("");
  const [msg, setMsg] = useState("");
  const [selectedEmployeeInsured, setSelectedEmployeeInsured] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user ?? null;
      if (!user) {
        setProfile(null);
        setEmployees([]);
        setStores([]);
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

      const isManager = isStoreManager(p);
      const managerStoreId = p?.store_id ?? null;

      const empQuery = supabase
        .from("employees")
        .select("id,name,status,current_store_id");
      if (isManager && managerStoreId) {
        empQuery.eq("current_store_id", managerStoreId);
      }
      const { data: empData } = await empQuery;
      if (empData) setEmployees(empData);

      const storeQuery = supabase.from("stores").select("id,name").order("name");
      if (isManager && managerStoreId) {
        storeQuery.eq("id", managerStoreId);
      }
      const { data: storeData, error: storeError } = await storeQuery;
      if (storeError) setMsg("门店加载失败：" + storeError.message);
      else if (storeData) setStores(storeData);
    })();
  }, []);

  useEffect(() => {
    if (!employeeId || employees.length === 0) return;
    const emp = employees.find((e) => e.id === employeeId);
    const sid = emp?.current_store_id;
    if (sid && storeId === "") setStoreId(sid);
  }, [employeeId, employees]);

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

  const submit = async () => {
    if (!employeeId) {
      setMsg("请选择员工");
      return;
    }
    if (!storeId) {
      setMsg("请选择门店");
      return;
    }
    if (!month) {
      setMsg("请选择月份");
      return;
    }
    const daysNum = Number(workdays);
    if (workdays === "" || Number.isNaN(daysNum)) {
      setMsg("请填写有效的工作天数");
      return;
    }
    if (daysNum < 0 || daysNum > 31) {
      setMsg("工作天数须在 0～31 之间");
      return;
    }

    let isInsured = false;
    const { data: viewData, error: viewError } = await supabase
      .from("v_employee_insurance_status")
      .select("is_insured")
      .eq("employee_id", employeeId)
      .maybeSingle();
    if (!viewError && viewData?.is_insured === true) {
      isInsured = true;
    }
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
      setMsg("该员工没有购买意外险，不能输入考勤");
      return;
    }

    setMsg("提交中...");

    const employee = employees.find((e) => e.id === employeeId);
    const isTrial = employee?.status === "试用期";

    const { error } = await supabase.from("monthly_workdays").insert([
      {
        employee_id: employeeId,
        store_id: storeId,
        month: month,
        workdays: daysNum,
        trial_days: isTrial ? daysNum : 0,
        regular_days: isTrial ? 0 : daysNum,
      },
    ]);

    if (error) {
      setMsg("提交失败：" + mapInsertError(error.message));
      return;
    }

    setMsg("提交成功！");
  };

  return (
    <main style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>录入工作天数</h1>
        <Link
          href="/insurance"
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #ddd",
            background: "#fff",
            fontSize: 14,
            textDecoration: "none",
            color: "inherit",
          }}
        >
          投保管理
        </Link>
        <Link
          href="/employees/new"
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #ddd",
            background: "#fff",
            fontSize: 14,
            textDecoration: "none",
            color: "inherit",
          }}
        >
          员工入职
        </Link>
      </div>

      <div style={{ marginTop: 16 }}>
        <select
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
        >
          <option value="">选择员工</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginTop: 12 }}>
        <select
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
        >
          <option value="">选择门店</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginTop: 12 }}>
        <input
          type="date"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
      </div>

      {selectedEmployeeInsured === false && (
        <div style={{ marginTop: 12, padding: 10, background: "#fef2f2", color: "#b91c1c", borderRadius: 8, fontSize: 14 }}>
          该员工没有购买意外险，不能输入考勤
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <input
          type="number"
          placeholder="工作天数"
          min={0}
          max={31}
          value={workdays}
          onChange={(e) => setWorkdays(e.target.value)}
          disabled={selectedEmployeeInsured === false}
        />
      </div>

      <button
        onClick={submit}
        style={{ marginTop: 16, padding: 10 }}
        disabled={selectedEmployeeInsured === false}
      >
        提交
      </button>

      <div style={{ marginTop: 12 }}>{msg}</div>
    </main>
  );
}
