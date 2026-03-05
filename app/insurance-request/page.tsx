"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Profile = { role: string | null; store_id: string | null } | null;

type Employee = { id: string; name: string | null; emp_no: string | null };

type InsuranceRequestRow = {
  id: string;
  employee_id: string;
  status: string;
  note: string | null;
  created_at: string;
  employees: { name: string | null } | { name: string | null }[] | null;
};

function getEmployeeName(r: InsuranceRequestRow): string {
  const emp = r.employees;
  if (Array.isArray(emp)) return emp[0]?.name ?? "(未知)";
  return emp?.name ?? "(未知)";
}

export default function InsuranceRequestPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [employeesError, setEmployeesError] = useState<string | null>(null);
  const [requests, setRequests] = useState<InsuranceRequestRow[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [note, setNote] = useState("");
  const [submitMsg, setSubmitMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const storeId = profile?.store_id ?? null;

  const loadEmployees = useCallback(async () => {
    if (!storeId) {
      setEmployeesLoading(false);
      return;
    }
    setEmployeesLoading(true);
    setEmployeesError(null);
    const { data, error } = await supabase
      .from("employees")
      .select("id, name, emp_no")
      .eq("current_store_id", storeId)
      .order("name");

    if (error) {
      // TODO: 若 employees 表没有 current_store_id 字段，当前已回退为全量；请补充该字段或改用 home_store_id 后移除此回退逻辑
      setEmployeesError(error.message);
      const { data: fallback } = await supabase
        .from("employees")
        .select("id, name, emp_no")
        .order("name");
      setEmployees((fallback as Employee[]) ?? []);
    } else {
      setEmployees((data as Employee[]) ?? []);
    }
    setEmployeesLoading(false);
  }, [storeId]);

  const loadRequests = useCallback(async () => {
    if (!storeId) {
      setRequestsLoading(false);
      return;
    }
    setRequestsLoading(true);
    const { data, error } = await supabase
      .from("insurance_requests")
      .select("id, employee_id, status, note, created_at, employees(name)")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false });
    if (!error && data) setRequests((data as unknown as InsuranceRequestRow[]) ?? []);
    setRequestsLoading(false);
  }, [storeId]);

  useEffect(() => {
    (async () => {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user ?? null;

      if (!user) {
        setLoading(false);
        return;
      }

      setEmail(user.email ?? null);
      setUserId(user.id);

      const { data: profileData, error: profileErr } = await supabase
        .from("users_profile")
        .select("role, store_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profileErr) setProfileError(profileErr.message);
      else setProfileError(null);

      setProfile(
        profileData
          ? { role: profileData.role ?? null, store_id: profileData.store_id ?? null }
          : null
      );
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const isStoreManager = profile?.role === "store_manager" && !!profile?.store_id;

  const handleSubmit = async () => {
    if (!isStoreManager || !storeId) {
      setSubmitMsg("无权限或未绑定门店");
      return;
    }
    if (!selectedEmployeeId.trim()) {
      setSubmitMsg("请选择员工");
      return;
    }
    setSubmitting(true);
    setSubmitMsg("");
    const { error } = await supabase.from("insurance_requests").insert([
      {
        employee_id: selectedEmployeeId.trim(),
        store_id: storeId,
        note: note.trim() || null,
      },
    ]);
    setSubmitting(false);
    if (error) {
      setSubmitMsg("提交失败：" + error.message);
      return;
    }
    setSubmitMsg("已提交申请");
    setSelectedEmployeeId("");
    setNote("");
    loadRequests();
  };

  if (loading) {
    return (
      <main className="min-h-screen p-4 max-w-lg mx-auto font-sans">
        <h1 className="text-xl font-bold mb-3">投保申请</h1>
        <p className="text-gray-500 text-sm">加载中...</p>
      </main>
    );
  }

  if (!profile && !profileError) {
    return (
      <main className="min-h-screen p-4 max-w-lg mx-auto font-sans">
        <h1 className="text-xl font-bold mb-3">投保申请</h1>
        <p className="text-gray-500 text-sm">请先登录</p>
      </main>
    );
  }

  if (!isStoreManager) {
    return (
      <main className="min-h-screen p-4 max-w-lg mx-auto font-sans">
        <h1 className="text-xl font-bold mb-3">投保申请</h1>
        <p className="text-red-600 font-semibold mt-2">无权限</p>
        <Link
          href="/me"
          className="inline-block mt-3 text-blue-600 underline text-sm"
        >
          返回 /me
        </Link>
        {profileError && (
          <p className="mt-2 text-red-600 text-sm">users_profile: {profileError}</p>
        )}
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4 max-w-lg mx-auto font-sans">
      <h1 className="text-xl font-bold mb-3">投保申请</h1>

      <section className="mb-5 p-3 bg-gray-50 rounded-lg text-sm text-gray-700 space-y-1">
        <p><strong>email:</strong> {email ?? "—"}</p>
        <p><strong>user_id:</strong> {userId ?? "—"}</p>
        <p><strong>role:</strong> {profile?.role ?? "—"}</p>
        <p><strong>store_id:</strong> {storeId ?? "—"}</p>
        {profileError && (
          <p className="text-red-600 mt-1">users_profile: {profileError}</p>
        )}
      </section>

      <section className="mb-6">
        <h2 className="text-base font-semibold mb-2">提交申请</h2>
        <div className="space-y-3">
          <div>
            <label htmlFor="emp" className="block text-sm font-medium text-gray-700 mb-1">
              选择员工 *
            </label>
            <select
              id="emp"
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base touch-manipulation"
              aria-label="选择员工"
              disabled={employeesLoading}
            >
              <option value="">
                {employeesLoading ? "加载中…" : "请选择员工"}
              </option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name && e.emp_no ? `${e.name} (${e.emp_no})` : (e.name || e.emp_no || e.id)}
                </option>
              ))}
            </select>
            {employeesError && (
              <p className="mt-1 text-amber-700 text-sm">员工列表：{employeesError}（已回退为全量）</p>
            )}
          </div>
          <div>
            <label htmlFor="note" className="block text-sm font-medium text-gray-700 mb-1">
              备注（可选）
            </label>
            <textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="备注"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base min-h-[56px] resize-y"
              rows={2}
            />
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-3 px-4 rounded-lg bg-gray-900 text-white font-semibold text-base touch-manipulation disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? "提交中…" : "提交投保申请"}
          </button>
          {submitMsg && (
            <p className={submitMsg === "已提交申请" ? "text-green-700 text-sm" : "text-red-600 text-sm"}>
              {submitMsg}
            </p>
          )}
        </div>
      </section>

      <section className="pt-4 border-t border-gray-200">
        <h2 className="text-base font-semibold mb-2">本门店申请记录</h2>
        {requestsLoading ? (
          <p className="text-gray-500 text-sm">加载中...</p>
        ) : requests.length === 0 ? (
          <p className="text-gray-500 text-sm">暂无申请记录</p>
        ) : (
          <ul className="space-y-2 list-none p-0 m-0">
            {requests.map((r) => (
              <li
                key={r.id}
                className="p-3 border border-gray-200 rounded-lg flex flex-wrap gap-x-2 gap-y-1 items-baseline"
              >
                <span className="font-semibold">{getEmployeeName(r)}</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded ${
                    r.status === "pending"
                      ? "bg-amber-100 text-amber-800"
                      : r.status === "approved"
                      ? "bg-green-100 text-green-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {r.status === "pending" ? "待处理" : r.status === "approved" ? "已通过" : r.status === "rejected" ? "已拒绝" : r.status}
                </span>
                <span className="text-gray-500 text-xs">
                  {new Date(r.created_at).toLocaleString("zh-CN")}
                </span>
                {r.note && (
                  <span className="w-full text-gray-600 text-xs mt-1">备注：{r.note}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
