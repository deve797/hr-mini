"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Profile = { role: string | null; store_id: string | null } | null;

type EmployeeInfo = {
  name?: string | null;
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
  return e?.name ?? "(未知)";
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
      .select("id, employee_id, store_id, status, note, created_at, employees(name, hire_date, phone, id_card, id_number), stores(name)")
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
      <main className="ins-page">
        <h1 className="ins-title">总部 · 投保处理</h1>
        <p className="ins-muted">加载中...</p>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="ins-page">
        <h1 className="ins-title">总部 · 投保处理</h1>
        <p className="ins-muted">请先登录</p>
      </main>
    );
  }

  if (!isHq) {
    return (
      <main className="ins-page">
        <h1 className="ins-title">总部 · 投保处理</h1>
        <p className="ins-no-access">无权限</p>
      </main>
    );
  }

  return (
    <main className="ins-page">
      <h1 className="ins-title">总部 · 投保处理</h1>

      <div className="ins-tabs">
        {statusTabs.map((tab) => (
          <button
            key={tab}
            type="button"
            className={`ins-tab ${statusFilter === tab ? "ins-tab-active" : ""}`}
            onClick={() => setStatusFilter(tab)}
          >
            {tab === "pending" ? "待处理" : tab === "approved" ? "已通过" : "已拒绝"}
          </button>
        ))}
        <button
          type="button"
          className="ins-tab ins-tab-export"
          onClick={exportToExcel}
          disabled={requests.length === 0}
        >
          导出为 Excel
        </button>
      </div>

      {statusFilter === "pending" && !selectedRequest && (
        <section className="ins-list">
          <h2 className="ins-section-title">待处理申请</h2>
          {requests.length === 0 ? (
            <p className="ins-muted">暂无待处理申请</p>
          ) : (
            <ul className="ins-request-list">
              {requests.map((r) => {
                const emp = getEmployee(r);
                return (
                <li key={r.id} className="ins-request-item">
                  <div className="ins-row-main">
                    <span className="ins-emp-name">{getEmployeeName(r)}</span>
                    <span className="ins-store">{getStoreName(r)}</span>
                  </div>
                  <div className="ins-employee-info">
                    <span>入职日期：{emp?.hire_date ?? "—"}</span>
                    <span>电话：{emp?.phone ?? "—"}</span>
                    <span>身份证：{emp?.id_card ?? emp?.id_number ?? "—"}</span>
                  </div>
                  <span className="ins-time">
                    {new Date(r.created_at).toLocaleString("zh-CN")}
                  </span>
                  {r.note && (
                    <span className="ins-note">备注：{r.note}</span>
                  )}
                  <button
                    type="button"
                    className="ins-btn-primary"
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
        <section className="ins-list">
          <h2 className="ins-section-title">
            {statusFilter === "approved" ? "已通过" : "已拒绝"}记录
          </h2>
          <ul className="ins-request-list">
              {requests.map((r) => (
                <li key={r.id} className="ins-request-item ins-request-item-readonly">
                  <span className="ins-emp-name">{getEmployeeName(r)}</span>
                  <span className="ins-store">{getStoreName(r)}</span>
                  <span className="ins-time">
                    {new Date(r.created_at).toLocaleString("zh-CN")}
                  </span>
                  {r.note && <span className="ins-note">备注：{r.note}</span>}
                </li>
              ))}
          </ul>
        </section>
      )}

      {selectedRequest && (
        <section className="ins-form-section">
          <h2 className="ins-section-title">
            录入保单 · {getEmployeeName(selectedRequest)}
          </h2>
          <div className="ins-form">
            <div className="ins-field">
              <label htmlFor="policy_no">保单号（可选）</label>
              <input
                id="policy_no"
                type="text"
                value={policyNo}
                onChange={(e) => setPolicyNo(e.target.value)}
                className="ins-input"
                placeholder="保单号"
              />
            </div>
            <div className="ins-field">
              <label htmlFor="insurer">承保方（可选）</label>
              <input
                id="insurer"
                type="text"
                value={insurer}
                onChange={(e) => setInsurer(e.target.value)}
                className="ins-input"
                placeholder="承保方"
              />
            </div>
            <div className="ins-field">
              <label htmlFor="start_date">起保日期 *</label>
              <input
                id="start_date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="ins-input"
              />
            </div>
            <div className="ins-field">
              <label htmlFor="end_date">止保日期 *</label>
              <input
                id="end_date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="ins-input"
              />
            </div>
            <div className="ins-field">
              <label htmlFor="policy_status">状态</label>
              <select
                id="policy_status"
                value={policyStatus}
                onChange={(e) => setPolicyStatus(e.target.value)}
                className="ins-input"
              >
                <option value="active">生效中</option>
                <option value="expired">已过期</option>
                <option value="cancelled">已取消</option>
              </select>
            </div>
            <div className="ins-field">
              <label htmlFor="policy_note">备注（可选）</label>
              <textarea
                id="policy_note"
                value={policyNote}
                onChange={(e) => setPolicyNote(e.target.value)}
                className="ins-input ins-textarea"
                rows={2}
                placeholder="备注"
              />
            </div>
            <div className="ins-form-actions">
              <button
                type="button"
                className="ins-btn-secondary"
                onClick={closeForm}
                disabled={submitting}
              >
                取消
              </button>
              <button
                type="button"
                className="ins-btn-primary"
                onClick={handleSavePolicy}
                disabled={submitting}
              >
                {submitting ? "保存中…" : "保存"}
              </button>
            </div>
            {submitMsg && (
              <p className="ins-success">{submitMsg}</p>
            )}
          </div>
        </section>
      )}

      <style jsx>{`
        .ins-page {
          padding: 16px;
          max-width: 520px;
          margin: 0 auto;
          font-family: system-ui, sans-serif;
        }
        .ins-title {
          font-size: 1.25rem;
          font-weight: 700;
          margin: 0 0 16px 0;
        }
        .ins-muted {
          color: #666;
          font-size: 0.875rem;
          margin: 0;
        }
        .ins-no-access {
          color: #c00;
          font-weight: 600;
          margin: 12px 0 0 0;
        }
        .ins-tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 16px;
        }
        .ins-tab {
          padding: 8px 14px;
          border: 1px solid #ddd;
          border-radius: 8px;
          background: #fff;
          font-size: 0.875rem;
          cursor: pointer;
        }
        .ins-tab-active {
          background: #333;
          color: #fff;
          border-color: #333;
        }
        .ins-tab-export {
          margin-left: auto;
        }
        .ins-tab-export:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .ins-section-title {
          font-size: 1rem;
          font-weight: 600;
          margin: 0 0 10px 0;
        }
        .ins-list {
          margin-bottom: 20px;
        }
        .ins-request-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        .ins-request-item {
          padding: 12px;
          border: 1px solid #eee;
          border-radius: 8px;
          margin-bottom: 8px;
          display: flex;
          flex-wrap: wrap;
          gap: 8px 12px;
          align-items: baseline;
        }
        .ins-request-item-readonly {
          background: #fafafa;
        }
        .ins-row-main {
          display: flex;
          align-items: baseline;
          gap: 8px;
          width: 100%;
        }
        .ins-emp-name {
          font-weight: 600;
          flex: 0 0 auto;
        }
        .ins-store {
          font-size: 0.875rem;
          color: #555;
        }
        .ins-employee-info {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 2px;
          font-size: 0.8125rem;
          color: #444;
        }
        .ins-employee-info span {
          display: block;
        }
        .ins-time {
          font-size: 0.8125rem;
          color: #666;
          flex: 0 0 auto;
        }
        .ins-note {
          width: 100%;
          font-size: 0.8125rem;
          color: #666;
        }
        .ins-btn-primary {
          padding: 8px 14px;
          border-radius: 8px;
          border: 1px solid #333;
          background: #333;
          color: #fff;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
        }
        .ins-btn-primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .ins-form-section {
          border-top: 1px solid #eee;
          padding-top: 16px;
        }
        .ins-form {
          margin-top: 8px;
        }
        .ins-field {
          margin-bottom: 12px;
        }
        .ins-field label {
          display: block;
          font-size: 0.875rem;
          margin-bottom: 4px;
          color: #333;
        }
        .ins-input {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #ddd;
          border-radius: 8px;
          font-size: 1rem;
          box-sizing: border-box;
        }
        .ins-textarea {
          resize: vertical;
          min-height: 56px;
        }
        .ins-form-actions {
          display: flex;
          gap: 12px;
          margin-top: 16px;
        }
        .ins-btn-secondary {
          padding: 10px 16px;
          border-radius: 8px;
          border: 1px solid #ddd;
          background: #fff;
          font-size: 1rem;
          cursor: pointer;
        }
        .ins-btn-secondary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .ins-form-actions .ins-btn-primary {
          padding: 10px 16px;
          font-size: 1rem;
        }
        .ins-success {
          color: #0a0;
          font-size: 0.875rem;
          margin: 12px 0 0 0;
        }
      `}</style>
    </main>
  );
}
