"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import styles from "./insurance.module.css";

type Profile = { role: string | null; store_id: string | null } | null;

type EmployeeInfo = {
  name?: string | null;
  emp_no?: string | null;
  hire_date?: string | null;
  phone?: string | null;
  id_card?: string | null;
  id_number?: string | null;
};

type RequestRow = {
  id: string;
  employee_id: string;
  store_id: string;
  status: string;
  note: string | null;
  created_at: string;
  employees: EmployeeInfo | EmployeeInfo[] | null;
  stores: { name: string | null } | { name: string | null }[] | null;
};

const statusTabs = ["pending", "approved", "rejected"] as const;
type StatusTab = (typeof statusTabs)[number];

function getEmployee(row: RequestRow): EmployeeInfo | null {
  const emp = row.employees;
  if (!emp) return null;
  return Array.isArray(emp) ? emp[0] ?? null : emp;
}

function getEmployeeName(row: RequestRow): string {
  const e = getEmployee(row);
  const n = e?.name ?? "(未知)";
  return e?.emp_no ? `${n} (${e.emp_no})` : n;
}

function getStoreName(row: RequestRow): string {
  const st = row.stores;
  if (Array.isArray(st)) return st[0]?.name ?? "(未知)";
  return st?.name ?? "(未知)";
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function oneYearLaterStr(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function csvEscape(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export default function InsurancePage() {
  const [profile, setProfile] = useState<Profile>(null);
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusTab>("pending");
  const [selectedRequest, setSelectedRequest] = useState<RequestRow | null>(null);
  const [policyNo, setPolicyNo] = useState("");
  const [insurer, setInsurer] = useState("");
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(oneYearLaterStr);
  const [policyStatus, setPolicyStatus] = useState("active");
  const [policyNote, setPolicyNote] = useState("");
  const [submitMsg, setSubmitMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isHq = profile?.role === "hq";

  const loadRequests = useCallback(async () => {
    if (!isHq) return;
    const { data, error } = await supabase
      .from("insurance_requests")
      .select("id, employee_id, store_id, status, note, created_at, employees(name, emp_no, hire_date, phone, id_card, id_number), stores(name)")
      .eq("status", statusFilter)
      .order("created_at", { ascending: false });
    if (!error && data) setRequests((data as unknown as RequestRow[]) ?? []);
  }, [isHq, statusFilter]);

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
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const openForm = (row: RequestRow) => {
    setSelectedRequest(row);
    setPolicyNo("");
    setInsurer("");
    setStartDate(todayStr());
    setEndDate(oneYearLaterStr());
    setPolicyStatus("active");
    setPolicyNote("");
    setSubmitMsg("");
  };

  const closeForm = () => {
    setSelectedRequest(null);
    setSubmitMsg("");
  };

  const exportToExcel = () => {
    const headers = ["员工姓名", "门店", "入职日期", "电话", "身份证", "申请时间", "状态", "备注"];
    const rows = requests.map((r) => {
      const emp = getEmployee(r);
      const statusText = r.status === "pending" ? "待处理" : r.status === "approved" ? "已通过" : r.status === "rejected" ? "已拒绝" : r.status;
      return [
        csvEscape(getEmployeeName(r)),
        csvEscape(getStoreName(r)),
        csvEscape(emp?.hire_date ?? ""),
        csvEscape(emp?.phone ?? ""),
        csvEscape(emp?.id_card ?? emp?.id_number ?? ""),
        csvEscape(new Date(r.created_at).toLocaleString("zh-CN")),
        csvEscape(statusText),
        csvEscape(r.note ?? ""),
      ];
    });
    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `投保申请_${statusFilter}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSavePolicy = async () => {
    if (!selectedRequest) return;
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) {
      setSubmitMsg("未登录，请刷新后重试");
      return;
    }
    const start = startDate.trim();
    const end = endDate.trim();
    if (!start || !end) {
      setSubmitMsg("请填写起止日期");
      return;
    }
    if (new Date(end) < new Date(start)) {
      setSubmitMsg("结束日期不能早于开始日期");
      return;
    }
    setSubmitting(true);
    setSubmitMsg("");

    const { error: insErr } = await supabase.from("employee_insurance").insert([
      {
        employee_id: selectedRequest.employee_id,
        start_date: start,
        end_date: end,
        status: policyStatus,
        policy_no: policyNo.trim() || null,
        insurer: insurer.trim() || null,
        note: policyNote.trim() || null,
      },
    ]);

    if (insErr) {
      setSubmitting(false);
      setSubmitMsg("保单录入失败：" + insErr.message);
      return;
    }

    const { error: updErr } = await supabase
      .from("insurance_requests")
      .update({
        status: "approved",
        processed_by: userId,
        processed_at: new Date().toISOString(),
      })
      .eq("id", selectedRequest.id);

    setSubmitting(false);
    if (updErr) {
      setSubmitMsg("更新申请状态失败：" + updErr.message);
      return;
    }
    setSubmitMsg("已保存并已标记为已购买，员工将自动激活");
    setSelectedRequest(null);
    loadRequests();
  };

  if (loading) {
    return (
      <main className={styles.page}>
        <h1 className={styles.title}>总部 · 投保处理</h1>
        <p className={styles.muted}>加载中...</p>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className={styles.page}>
        <h1 className={styles.title}>总部 · 投保处理</h1>
        <p className={styles.muted}>请先登录</p>
      </main>
    );
  }

  if (!isHq) {
    return (
      <main className={styles.page}>
        <h1 className={styles.title}>总部 · 投保处理</h1>
        <p className={styles.noAccess}>无权限</p>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>总部 · 投保处理</h1>

      <div className={styles.tabs}>
        {statusTabs.map((tab) => (
          <button
            key={tab}
            type="button"
            className={statusFilter === tab ? `${styles.tab} ${styles.tabActive}` : styles.tab}
            onClick={() => setStatusFilter(tab)}
          >
            {tab === "pending" ? "待处理" : tab === "approved" ? "已通过" : "已拒绝"}
          </button>
        ))}
        <button
          type="button"
          className={`${styles.tab} ${styles.tabExport}`}
          onClick={exportToExcel}
          disabled={requests.length === 0}
        >
          导出为 Excel
        </button>
      </div>

      {statusFilter === "pending" && !selectedRequest && (
        <section className={styles.list}>
          <h2 className={styles.sectionTitle}>待处理申请</h2>
          {requests.length === 0 ? (
            <p className={styles.muted}>暂无待处理申请</p>
          ) : (
            <ul className={styles.requestList}>
              {requests.map((r) => {
                const emp = getEmployee(r);
                return (
                <li key={r.id} className={styles.requestItem}>
                  <div className={styles.rowMain}>
                    <span className={styles.empName}>{getEmployeeName(r)}</span>
                    <span className={styles.store}>{getStoreName(r)}</span>
                  </div>
                  <div className={styles.employeeInfo}>
                    <span>入职日期：{emp?.hire_date ?? "—"}</span>
                    <span>电话：{emp?.phone ?? "—"}</span>
                    <span>身份证：{emp?.id_card ?? emp?.id_number ?? "—"}</span>
                  </div>
                  <span className={styles.time}>
                    {new Date(r.created_at).toLocaleString("zh-CN")}
                  </span>
                  {r.note && (
                    <span className={styles.note}>备注：{r.note}</span>
                  )}
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    onClick={() => openForm(r)}
                  >
                    标记已购买并录入保单
                  </button>
                </li>
              );
              })}
            </ul>
          )}
        </section>
      )}

      {statusFilter !== "pending" && (
        <section className={styles.list}>
          <h2 className={styles.sectionTitle}>
            {statusFilter === "approved" ? "已通过" : "已拒绝"}记录
          </h2>
          <ul className={styles.requestList}>
              {requests.map((r) => (
                <li key={r.id} className={`${styles.requestItem} ${styles.requestItemReadonly}`}>
                  <span className={styles.empName}>{getEmployeeName(r)}</span>
                  <span className={styles.store}>{getStoreName(r)}</span>
                  <span className={styles.time}>
                    {new Date(r.created_at).toLocaleString("zh-CN")}
                  </span>
                  {r.note && <span className={styles.note}>备注：{r.note}</span>}
                </li>
              ))}
          </ul>
        </section>
      )}

      {selectedRequest && (
        <section className={styles.formSection}>
          <h2 className={styles.sectionTitle}>
            录入保单 · {getEmployeeName(selectedRequest)}
          </h2>
          <div className={styles.form}>
            <div className={styles.field}>
              <label htmlFor="policy_no">保单号（可选）</label>
              <input
                id="policy_no"
                type="text"
                value={policyNo}
                onChange={(e) => setPolicyNo(e.target.value)}
                className={styles.input}
                placeholder="保单号"
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="insurer">承保方（可选）</label>
              <input
                id="insurer"
                type="text"
                value={insurer}
                onChange={(e) => setInsurer(e.target.value)}
                className={styles.input}
                placeholder="承保方"
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="start_date">起保日期 *</label>
              <input
                id="start_date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={styles.input}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="end_date">止保日期 *</label>
              <input
                id="end_date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={styles.input}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="policy_status">状态</label>
              <select
                id="policy_status"
                value={policyStatus}
                onChange={(e) => setPolicyStatus(e.target.value)}
                className={styles.input}
              >
                <option value="active">生效中</option>
                <option value="expired">已过期</option>
                <option value="cancelled">已取消</option>
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="policy_note">备注（可选）</label>
              <textarea
                id="policy_note"
                value={policyNote}
                onChange={(e) => setPolicyNote(e.target.value)}
                className={`${styles.input} ${styles.textarea}`}
                rows={2}
                placeholder="备注"
              />
            </div>
            <div className={styles.formActions}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={closeForm}
                disabled={submitting}
              >
                取消
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={handleSavePolicy}
                disabled={submitting}
              >
                {submitting ? "保存中…" : "保存"}
              </button>
            </div>
            {submitMsg && (
              <p className={styles.success}>{submitMsg}</p>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
