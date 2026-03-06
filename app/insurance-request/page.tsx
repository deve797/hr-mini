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
      <main className="page-container" style={{ maxWidth: 32 * 16 }}>
        <h1 className="heading-1" style={{ marginBottom: "0.75rem" }}>投保申请</h1>
        <p className="muted-text">加载中...</p>
      </main>
    );
  }

  if (!profile && !profileError) {
    return (
      <main className="page-container" style={{ maxWidth: 32 * 16 }}>
        <h1 className="heading-1" style={{ marginBottom: "0.75rem" }}>投保申请</h1>
        <p className="muted-text">请先登录</p>
      </main>
    );
  }

  if (!isStoreManager) {
    return (
      <main className="page-container" style={{ maxWidth: 32 * 16 }}>
        <h1 className="heading-1" style={{ marginBottom: "0.75rem" }}>投保申请</h1>
        <p className="msg-error" style={{ marginTop: "0.5rem" }}>无权限</p>
        <Link
          href="/me"
          className="btn btn-ghost btn-sm"
          style={{ marginTop: "1rem", display: "inline-flex" }}
        >
          返回 /me
        </Link>
        {profileError && (
          <p className="msg-error" style={{ marginTop: "0.5rem" }}>users_profile: {profileError}</p>
        )}
      </main>
    );
  }

  return (
    <main className="page-container" style={{ maxWidth: 32 * 16 }}>
      <h1 className="heading-1" style={{ marginBottom: "0.75rem" }}>投保申请</h1>

      <section className="card" style={{ padding: "1rem", marginBottom: "1.5rem" }}>
        <p className="body-text muted-text" style={{ marginBottom: "0.25rem" }}>
          <strong>email:</strong> {email ?? "—"}
        </p>
        <p className="body-text muted-text" style={{ marginBottom: "0.25rem" }}>
          <strong>user_id:</strong> {userId ?? "—"}
        </p>
        <p className="body-text muted-text" style={{ marginBottom: "0.25rem" }}>
          <strong>role:</strong> {profile?.role ?? "—"}
        </p>
        <p className="body-text muted-text">
          <strong>store_id:</strong> {storeId ?? "—"}
        </p>
        {profileError && (
          <p className="msg-error" style={{ marginTop: "0.5rem" }}>users_profile: {profileError}</p>
        )}
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2 className="heading-2" style={{ marginBottom: "0.5rem" }}>提交申请</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div className="field">
            <label htmlFor="emp" className="field-label">
              选择员工 *
            </label>
            <select
              id="emp"
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              className="input"
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
              <p className="field-hint msg-error">员工列表：{employeesError}（已回退为全量）</p>
            )}
          </div>
          <div className="field">
            <label htmlFor="note" className="field-label">
              备注（可选）
            </label>
            <textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="备注"
              className="input"
              rows={2}
              style={{ minHeight: "3.5rem" }}
            />
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="btn btn-primary"
            style={{ width: "100%" }}
          >
            {submitting ? "提交中…" : "提交投保申请"}
          </button>
          {submitMsg && (
            <p className={submitMsg === "已提交申请" ? "msg-success" : "msg-error"} style={{ marginTop: "0.25rem" }}>
              {submitMsg}
            </p>
          )}
        </div>
      </section>

      <section style={{ paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
        <h2 className="heading-2" style={{ marginBottom: "0.5rem" }}>本门店申请记录</h2>
        {requestsLoading ? (
          <p className="muted-text">加载中...</p>
        ) : requests.length === 0 ? (
          <p className="muted-text">暂无申请记录</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {requests.map((r) => (
              <li
                key={r.id}
                className="card"
                style={{
                  padding: "0.75rem 1rem",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.25rem 0.5rem",
                  alignItems: "center",
                }}
              >
                <span style={{ fontWeight: 600 }}>{getEmployeeName(r)}</span>
                <span
                  style={{
                    fontSize: "0.75rem",
                    padding: "0.125rem 0.5rem",
                    borderRadius: "var(--radius-lg)",
                    background: r.status === "pending" ? "rgba(193, 140, 93, 0.2)" : r.status === "approved" ? "rgba(93, 112, 82, 0.2)" : "rgba(168, 84, 72, 0.2)",
                    color: r.status === "pending" ? "var(--secondary)" : r.status === "approved" ? "var(--primary)" : "var(--destructive)",
                  }}
                >
                  {r.status === "pending" ? "待处理" : r.status === "approved" ? "已通过" : r.status === "rejected" ? "已拒绝" : r.status}
                </span>
                <span className="muted-text" style={{ fontSize: "0.75rem" }}>
                  {new Date(r.created_at).toLocaleString("zh-CN")}
                </span>
                {r.note && (
                  <span className="muted-text" style={{ width: "100%", fontSize: "0.75rem", marginTop: "0.25rem" }}>
                    备注：{r.note}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
