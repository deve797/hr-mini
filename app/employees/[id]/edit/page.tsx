"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Profile = { role: string | null; store_id: string | null } | null;

type Store = { id: string; name: string };

type PositionRow = { id: string; name: string; dept_id: string | null };

const EMPLOYMENT_STATUS_OPTIONS = ["试用期", "转正", "离职"] as const;
const SYSTEM_STATUS_OPTIONS = [
  { value: "pending", label: "待审核" },
  { value: "active", label: "激活" },
  { value: "inactive", label: "停用" },
] as const;

type EmploymentStatus = (typeof EMPLOYMENT_STATUS_OPTIONS)[number];
type SystemStatus = (typeof SYSTEM_STATUS_OPTIONS)[number]["value"];

type EmployeeRow = {
  id: string;
  name: string | null;
  emp_no: string | null;
  employment_status: string | null;
  system_status: string | null;
  current_store_id: string | null;
  home_store_id: string | null;
  position_id: string | null;
  work_shift: number | null;
  dept_id: string | null;
  contract_entity_id: string | null;
  hire_date: string | null;
};

function isStoreManager(profile: Profile): boolean {
  return profile?.role === "store_manager" && !!profile?.store_id;
}

function isHq(profile: Profile): boolean {
  return profile?.role === "hq";
}

function isFinance(profile: Profile): boolean {
  return profile?.role === "finance";
}

export default function EditEmployeePage() {
  const params = useParams();
  const router = useRouter();
  const employeeId = typeof params.id === "string" ? params.id : "";

  const [profile, setProfile] = useState<Profile>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [employee, setEmployee] = useState<EmployeeRow | null>(null);

  const [stores, setStores] = useState<Store[]>([]);
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [workShiftOptions, setWorkShiftOptions] = useState<{ value: string; label: string }[]>([]);

  const [employmentStatus, setEmploymentStatus] = useState<EmploymentStatus>("试用期");
  const [systemStatus, setSystemStatus] = useState<SystemStatus>("pending");
  const [currentStoreId, setCurrentStoreId] = useState("");
  const [positionId, setPositionId] = useState("");
  const [deptId, setDeptId] = useState("");
  const [workShift, setWorkShift] = useState("");

  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"success" | "error" | "info" | "">("");
  const [submitLoading, setSubmitLoading] = useState(false);

  const loadProfileAndOptions = useCallback(async (): Promise<
    "no_user" | "profile_error" | "no_profile" | "ok"
  > => {
    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user ?? null;
    if (!user) {
      setUserId(null);
      setProfile(null);
      setProfileError(null);
      return "no_user";
    }
    setUserId(user.id);
    const { data: profileData, error: profileErr } = await supabase
      .from("users_profile")
      .select("role, store_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profileErr) {
      setProfileError(profileErr.message);
      setProfile(null);
      return "profile_error";
    }
    setProfileError(null);
    if (!profileData) {
      setProfile(null);
      return "no_profile";
    }
    setProfile({
      role: profileData.role ?? null,
      store_id: profileData.store_id ?? null,
    });

    const storeQuery = supabase.from("stores").select("id,name").order("name");
    const { data: storeData, error: storeError } = await storeQuery;
    if (!storeError && storeData?.length) {
      setStores(storeData as Store[]);
    }

    let posRows: PositionRow[] | null = null;
    const { data: posByPn } = await supabase
      .from("position_catalog")
      .select("id,position_name,dept_id")
      .order("position_name");
    if (posByPn?.length) {
      posRows = (posByPn as { id: string; position_name: string; dept_id: string | null }[]).map((r) => ({
        id: r.id,
        name: r.position_name,
        dept_id: r.dept_id ?? null,
      }));
    }
    if (!posRows?.length) {
      const { data: posByName } = await supabase.from("position_catalog").select("id,name,dept_id").order("name");
      if (posByName?.length) {
        posRows = (posByName as { id: string; name: string; dept_id: string | null }[]).map((r) => ({
          id: r.id,
          name: r.name,
          dept_id: r.dept_id ?? null,
        }));
      }
    }
    if (posRows?.length) setPositions(posRows);

    const { data: wsData } = await supabase.from("work_shift").select("id,name").order("id");
    const fallbackWorkShift = [
      { value: "9", label: "9小时/天" },
      { value: "10", label: "10小时/天" },
      { value: "12", label: "12小时/天" },
    ];
    if (wsData?.length) {
      const allowedIds = [9, 10, 12];
      const opts = wsData
        .filter((r: { id: number }) => allowedIds.includes(Number(r.id)))
        .map((r: { id: number | string; name: string }) => ({ value: String(r.id), label: r.name }));
      if (opts.length > 0) setWorkShiftOptions(opts);
      else setWorkShiftOptions(fallbackWorkShift);
    } else {
      setWorkShiftOptions(fallbackWorkShift);
    }
    return "ok";
  }, []);

  const loadEmployee = useCallback(async () => {
    if (!employeeId) {
      setLoadError("无效的员工 ID");
      return;
    }
    setLoadError(null);
    const { data, error } = await supabase
      .from("employees")
      .select(
        "id, name, emp_no, employment_status, system_status, current_store_id, home_store_id, position_id, work_shift, dept_id, contract_entity_id, hire_date"
      )
      .eq("id", employeeId)
      .maybeSingle();

    if (error) {
      setLoadError(error.message);
      setEmployee(null);
      return;
    }
    if (!data) {
      setLoadError("未找到该员工");
      setEmployee(null);
      return;
    }

    const row = data as EmployeeRow;
    setEmployee(row);
    if (row.employment_status && EMPLOYMENT_STATUS_OPTIONS.includes(row.employment_status as EmploymentStatus)) {
      setEmploymentStatus(row.employment_status as EmploymentStatus);
    }
    if (row.system_status && SYSTEM_STATUS_OPTIONS.some((s) => s.value === row.system_status)) {
      setSystemStatus(row.system_status as SystemStatus);
    }
    setCurrentStoreId(row.current_store_id ?? "");
    setPositionId(row.position_id ?? "");
    setDeptId(row.dept_id ?? "");
    const ws = row.work_shift != null ? String(row.work_shift) : "";
    setWorkShift(ws);
  }, [employeeId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      const profileStatus = await loadProfileAndOptions();
      if (cancelled) return;
      if (profileStatus !== "ok") {
        setLoading(false);
        return;
      }
      await loadEmployee();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [employeeId, loadProfileAndOptions, loadEmployee]);

  useEffect(() => {
    if (!positionId || positions.length === 0) return;
    const pos = positions.find((p) => p.id === positionId);
    if (pos?.dept_id) setDeptId(pos.dept_id);
  }, [positionId, positions]);

  const canAccess =
    profile &&
    !isFinance(profile) &&
    (isHq(profile) || isStoreManager(profile));

  const storeManagerAllowed =
    isStoreManager(profile) &&
    profile?.store_id &&
    employee?.current_store_id === profile.store_id;

  const handleSubmit = async () => {
    if (!employee || !profile || !canAccess) return;

    if (isStoreManager(profile) && !storeManagerAllowed) {
      setMsg("只能编辑本店员工");
      setMsgType("error");
      return;
    }

    setSubmitLoading(true);
    setMsg("");
    setMsgType("info");

    if (isHq(profile)) {
      const workShiftValue = /^\d+$/.test(String(workShift)) ? parseInt(String(workShift), 10) : workShift;
      const homeId = String(currentStoreId).trim();
      const selectedPos = positions.find((p) => p.id === positionId);
      const nextDeptId = selectedPos?.dept_id ?? deptId;

      const payload: Record<string, unknown> = {
        employment_status: employmentStatus,
        system_status: systemStatus,
        current_store_id: homeId,
        home_store_id: homeId,
        position_id: positionId || null,
        dept_id: nextDeptId || null,
        work_shift: workShiftValue,
      };

      const { error } = await supabase.from("employees").update(payload).eq("id", employee.id);

      if (error) {
        setMsg(error.message ?? "保存失败");
        setMsgType("error");
        setSubmitLoading(false);
        return;
      }
    } else {
      const { error } = await supabase
        .from("employees")
        .update({ employment_status: employmentStatus })
        .eq("id", employee.id);

      if (error) {
        setMsg(error.message ?? "保存失败");
        setMsgType("error");
        setSubmitLoading(false);
        return;
      }
    }

    setMsg("已保存");
    setMsgType("success");
    setSubmitLoading(false);
    router.push("/employees/new");
  };

  if (loading && !employee && !loadError) {
    return (
      <main className="page-container" style={{ maxWidth: 28 * 16 }}>
        <p className="muted-text">加载中…</p>
      </main>
    );
  }

  if (!userId) {
    return (
      <main className="page-container" style={{ maxWidth: 28 * 16 }}>
        <h1 className="heading-1">编辑员工</h1>
        <p className="muted-text">请先登录。</p>
        <Link href="/login" className="btn btn-ghost btn-sm" style={{ marginTop: "0.75rem", display: "inline-flex" }}>
          去登录
        </Link>
      </main>
    );
  }

  if (profileError) {
    return (
      <main className="page-container" style={{ maxWidth: 28 * 16 }}>
        <h1 className="heading-1">编辑员工</h1>
        <p className="msg-error">查询 users_profile 失败：{profileError}</p>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="page-container" style={{ maxWidth: 28 * 16 }}>
        <h1 className="heading-1">编辑员工</h1>
        <p className="muted-text">未查到账号角色，请联系总部管理员。</p>
      </main>
    );
  }

  if (isFinance(profile)) {
    return (
      <main className="page-container" style={{ maxWidth: 28 * 16 }}>
        <h1 className="heading-1">编辑员工</h1>
        <p className="muted-text">您当前无权限编辑员工档案。</p>
        <Link href="/employees/new" className="btn btn-outline btn-sm" style={{ marginTop: "0.75rem", display: "inline-flex" }}>
          返回员工入职
        </Link>
      </main>
    );
  }

  if (!isHq(profile) && !isStoreManager(profile)) {
    return (
      <main className="page-container" style={{ maxWidth: 28 * 16 }}>
        <h1 className="heading-1">编辑员工</h1>
        <p className="muted-text">仅总部或店长可编辑员工档案。</p>
        <Link href="/employees/new" className="btn btn-outline btn-sm" style={{ marginTop: "0.75rem", display: "inline-flex" }}>
          返回员工入职
        </Link>
      </main>
    );
  }

  if (loadError || !employee) {
    return (
      <main className="page-container" style={{ maxWidth: 28 * 16 }}>
        <h1 className="heading-1">编辑员工</h1>
        <p className="msg-error">{loadError ?? "未找到员工"}</p>
        <Link href="/employees/new" className="btn btn-outline btn-sm" style={{ marginTop: "0.75rem", display: "inline-flex" }}>
          返回员工入职
        </Link>
      </main>
    );
  }

  if (isStoreManager(profile) && !storeManagerAllowed) {
    return (
      <main className="page-container" style={{ maxWidth: 28 * 16 }}>
        <h1 className="heading-1">编辑员工</h1>
        <p className="muted-text">只能编辑当前门店下的员工。</p>
        <Link href="/employees/new" className="btn btn-outline btn-sm" style={{ marginTop: "0.75rem", display: "inline-flex" }}>
          返回员工入职
        </Link>
      </main>
    );
  }

  const hqMode = isHq(profile);
  const readOnlyFields = !hqMode;

  return (
    <main className="page-container" style={{ maxWidth: 28 * 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <h1 className="heading-1" style={{ marginBottom: 0 }}>
          编辑员工
        </h1>
        <Link href="/employees/new" className="btn btn-outline btn-sm">
          返回员工入职
        </Link>
      </div>

      <p className="muted-text" style={{ marginBottom: "1rem" }}>
        {hqMode
          ? "总部可修改职位、用工/系统状态、门店与工作时长；保存后系统会按岗位同步班次与基本工资。"
          : "店长仅可修改本店员工的用工状态（如试用期转转正）。"}
      </p>

      <div style={{ maxWidth: 25 * 16 }}>
        <div className="field">
          <label className="field-label">姓名</label>
          <input type="text" value={employee.name ?? ""} readOnly className="input" style={{ opacity: 0.85 }} />
        </div>
        <div className="field">
          <label className="field-label">员工编号</label>
          <input type="text" value={employee.emp_no ?? "—"} readOnly className="input" style={{ opacity: 0.85 }} />
        </div>
        <div className="field">
          <label className="field-label">入职日期</label>
          <input type="text" value={employee.hire_date ?? "—"} readOnly className="input" style={{ opacity: 0.85 }} />
        </div>

        <div className="field">
          <label className="field-label">用工状态 *</label>
          <select
            value={employmentStatus}
            onChange={(e) => setEmploymentStatus(e.target.value as EmploymentStatus)}
            className="input"
          >
            {EMPLOYMENT_STATUS_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field-label">系统状态 *</label>
          <select
            value={systemStatus}
            onChange={(e) => setSystemStatus(e.target.value as SystemStatus)}
            className="input"
            disabled={readOnlyFields}
          >
            {SYSTEM_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field-label">当前门店 *</label>
          <select
            value={currentStoreId}
            onChange={(e) => setCurrentStoreId(e.target.value)}
            className="input"
            disabled={readOnlyFields}
          >
            <option value="">请选择门店</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field-label">职位 *</label>
          <select
            value={positionId}
            onChange={(e) => setPositionId(e.target.value)}
            className="input"
            disabled={readOnlyFields}
          >
            <option value="">请选择职位</option>
            {positions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field-label">工作时长 *</label>
          <select
            value={workShift}
            onChange={(e) => setWorkShift(e.target.value)}
            className="input"
            disabled={readOnlyFields}
          >
            <option value="">请选择工作时长</option>
            {workShiftOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginTop: "1.25rem" }}>
          <button type="button" onClick={() => void handleSubmit()} className="btn btn-primary" disabled={submitLoading}>
            {submitLoading ? "保存中…" : "保存"}
          </button>
          {msg && (
            <p
              className="muted-text"
              style={{
                marginTop: "0.75rem",
                color:
                  msgType === "error"
                    ? "var(--destructive)"
                    : msgType === "success"
                      ? "var(--success, green)"
                      : undefined,
              }}
            >
              {msg}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
