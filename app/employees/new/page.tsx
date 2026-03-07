"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Profile = { role: string | null; store_id: string | null } | null;

type Store = { id: string; name: string };

type ContractEntity = { id: string; name: string };

type Department = { id: string; dept_name: string };

type Position = { id: string; name: string };

const EMPLOYMENT_STATUS_OPTIONS = ["试用期", "转正", "离职"] as const;
const SYSTEM_STATUS_OPTIONS = [
  { value: "pending", label: "pending" },
  { value: "active", label: "active" },
  { value: "inactive", label: "inactive" },
] as const;

type EmploymentStatus = (typeof EMPLOYMENT_STATUS_OPTIONS)[number];
type SystemStatus = (typeof SYSTEM_STATUS_OPTIONS)[number]["value"];

type RecentEmployee = {
  id: string;
  name: string | null;
  emp_no: string | null;
  employment_status: string | null;
  system_status: string | null;
  current_store_id: string | null;
  created_at: string | null;
  stores: { name: string } | null;
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

/** 身份证 18 位基本格式 */
function isValidIdCard(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length !== 18) return false;
  return /^\d{17}[\dXx]$/.test(trimmed);
}

/** 中国大陆 11 位手机号 */
function isValidPhone(value: string): boolean {
  const trimmed = value.trim().replace(/\s/g, "");
  return /^1[3-9]\d{9}$/.test(trimmed);
}

const DEFAULT_HIRE_DATE = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function NewEmployeePage() {
  const [profile, setProfile] = useState<Profile>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [contractEntities, setContractEntities] = useState<ContractEntity[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [workShiftOptions, setWorkShiftOptions] = useState<{ value: string; label: string }[]>([]);
  const [name, setName] = useState("");
  const [idCard, setIdCard] = useState("");
  const [phone, setPhone] = useState("");
  const [employmentStatus, setEmploymentStatus] = useState<EmploymentStatus>("试用期");
  const [systemStatus, setSystemStatus] = useState<SystemStatus>("pending");
  const [currentStoreId, setCurrentStoreId] = useState("");
  const [contractEntityId, setContractEntityId] = useState("");
  const [deptId, setDeptId] = useState("");
  const [positionId, setPositionId] = useState("");
  const [workShift, setWorkShift] = useState("");
  const [hireDate, setHireDate] = useState(DEFAULT_HIRE_DATE);
  const [applyInsurance, setApplyInsurance] = useState(false);
  const [importMode, setImportMode] = useState(false);
  const [empNoManual, setEmpNoManual] = useState("");
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"success" | "error" | "info" | "">("");
  const [lastCreatedEmpNo, setLastCreatedEmpNo] = useState<string | null>(null);
  const [lastCreatedName, setLastCreatedName] = useState<string | null>(null);
  const [insuranceRequestFailed, setInsuranceRequestFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [recentEmployees, setRecentEmployees] = useState<RecentEmployee[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);

  const loadProfileAndOptions = useCallback(async () => {
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
    const p: Profile = profileData
      ? { role: profileData.role ?? null, store_id: profileData.store_id ?? null }
      : null;
    setProfile(p);

    const isManager = isStoreManager(p);
    const managerStoreId = p?.store_id ?? null;

    const storeQuery = supabase.from("stores").select("id,name").order("name");
    if (isManager && managerStoreId) {
      storeQuery.eq("id", managerStoreId);
    }
    const { data: storeData, error: storeError } = await storeQuery;
    if (storeError) {
      setMsg("门店加载失败");
      setMsgType("error");
      setLoading(false);
      return;
    }
    if (storeData?.length) {
      setStores(storeData as Store[]);
      if (storeData.length === 1) setCurrentStoreId(storeData[0].id);
      else if (managerStoreId) setCurrentStoreId(managerStoreId);
    }

    let entityData: { id: string; name: string }[] | null = null;
    const { data: legalData, error: legalErr } = await supabase
      .from("legal_entities")
      .select("id,name")
      .order("name");
    if (!legalErr && legalData?.length) {
      entityData = legalData as { id: string; name: string }[];
    }
    if (!entityData?.length) {
      const { data: d1 } = await supabase.from("contract_entity").select("id,name").order("name");
      if (d1?.length) entityData = d1 as { id: string; name: string }[];
    }
    if (entityData?.length) {
      setContractEntities(entityData);
      if (entityData.length === 1 && entityData[0].id) setContractEntityId(String(entityData[0].id));
    }

    let deptData: Department[] | null = null;
    const { data: dDept } = await supabase.from("departments").select("id,dept_name").order("dept_name");
    if (dDept?.length) deptData = dDept as Department[];
    if (!deptData?.length) {
      const { data: dDept2 } = await supabase.from("department").select("id,dept_name").order("dept_name");
      if (dDept2?.length) deptData = dDept2 as Department[];
    }
    if (deptData?.length) {
      setDepartments(deptData);
      if (deptData.length === 1) setDeptId(deptData[0].id);
    }

    let posData: Position[] | null = null;
    const { data: posByName } = await supabase.from("position_catalog").select("id,name").order("name");
    if (posByName?.length) posData = posByName as Position[];
    if (!posData?.length) {
      const { data: posByTitle } = await supabase.from("position_catalog").select("id,position_name").order("position_name");
      if (posByTitle?.length)
        posData = (posByTitle as { id: string; position_name: string }[]).map((r) => ({ id: r.id, name: r.position_name }));
    }
    if (!posData?.length) {
      const { data: posByTitle2 } = await supabase.from("position_catalog").select("id,title").order("title");
      if (posByTitle2?.length)
        posData = (posByTitle2 as { id: string; title: string }[]).map((r) => ({ id: r.id, name: r.title }));
    }
    if (posData?.length) {
      setPositions(posData);
      if (posData.length === 1) setPositionId(posData[0].id);
    }

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
      if (opts.length > 0) {
        setWorkShiftOptions(opts);
        setWorkShift(opts[0].value);
      } else {
        setWorkShiftOptions(fallbackWorkShift);
        setWorkShift("9");
      }
    } else {
      const { data: ws2 } = await supabase.from("work_shifts").select("id,name").order("id");
      if (ws2?.length) {
        const allowedIds = [9, 10, 12];
        const opts = ws2
          .filter((r: { id: number }) => allowedIds.includes(Number(r.id)))
          .map((r: { id: number | string; name: string }) => ({ value: String(r.id), label: r.name }));
        if (opts.length > 0) {
          setWorkShiftOptions(opts);
          setWorkShift(opts[0].value);
        } else {
          setWorkShiftOptions(fallbackWorkShift);
          setWorkShift("9");
        }
      } else {
        setWorkShiftOptions(fallbackWorkShift);
        setWorkShift("9");
      }
    }

    setLoading(false);
  }, []);

  const loadRecentEmployees = useCallback(async () => {
    setRecentLoading(true);
    const { data, error } = await supabase
      .from("employees")
      .select("id, name, emp_no, employment_status, system_status, current_store_id, created_at, stores(name)")
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) {
      console.error("最近新增员工列表加载失败", error);
      setRecentEmployees([]);
      setRecentLoading(false);
      return;
    }
    setRecentEmployees((data as unknown as RecentEmployee[]) ?? []);
    setRecentLoading(false);
  }, []);

  useEffect(() => {
    loadProfileAndOptions();
  }, [loadProfileAndOptions]);

  useEffect(() => {
    if (!profile) return;
    loadRecentEmployees();
  }, [profile, loadRecentEmployees]);

  useEffect(() => {
    if (contractEntities.length === 1 && !contractEntityId && contractEntities[0].id) {
      setContractEntityId(String(contractEntities[0].id));
    }
  }, [contractEntities, contractEntityId]);

  useEffect(() => {
    if (departments.length === 1 && !deptId && departments[0].id) setDeptId(departments[0].id);
  }, [departments, deptId]);

  useEffect(() => {
    if (positions.length === 1 && !positionId && positions[0].id) setPositionId(positions[0].id);
  }, [positions, positionId]);

  useEffect(() => {
    if (workShiftOptions.length > 0 && !workShift) setWorkShift(workShiftOptions[0].value);
  }, [workShiftOptions, workShift]);

  function validateForm(): { ok: boolean; message: string } {
    const trimmedName = name.trim();
    if (!trimmedName) return { ok: false, message: "请填写员工姓名" };
    const trimmedIdCard = idCard.trim();
    if (!trimmedIdCard) return { ok: false, message: "请填写身份证号" };
    if (!isValidIdCard(trimmedIdCard)) return { ok: false, message: "请输入正确的18位身份证号" };
    const trimmedPhone = phone.trim().replace(/\s/g, "");
    if (!trimmedPhone) return { ok: false, message: "请填写手机号" };
    if (!isValidPhone(phone)) return { ok: false, message: "请输入正确的11位中国大陆手机号" };
    if (!currentStoreId) return { ok: false, message: "请选择当前门店" };
    if (!contractEntityId) return { ok: false, message: "请选择签约主体" };
    if (!deptId) return { ok: false, message: "请选择部门" };
    if (!positionId) return { ok: false, message: "请选择职位" };
    if (!workShift) return { ok: false, message: "请选择工作时长" };
    if (!hireDate?.trim()) return { ok: false, message: "请选择入职日期" };
    if (importMode && isHq(profile) && empNoManual.trim()) {
      const no = empNoManual.trim();
      if (!/^[A-Za-z0-9\-_]+$/.test(no)) return { ok: false, message: "员工编号仅允许字母、数字、横线、下划线" };
    }
    return { ok: true, message: "" };
  }

  function buildEmployeePayload(): Record<string, unknown> {
    const homeStoreId = String(currentStoreId).trim();
    const workShiftValue = /^\d+$/.test(String(workShift)) ? parseInt(String(workShift), 10) : workShift;
    const payload: Record<string, unknown> = {
      name: name.trim(),
      id_card: idCard.trim(),
      phone: phone.trim().replace(/\s/g, ""),
      employment_status: employmentStatus,
      system_status: systemStatus,
      current_store_id: homeStoreId,
      home_store_id: homeStoreId,
      contract_entity_id: contractEntityId,
      dept_id: deptId,
      position_id: positionId,
      work_shift: workShiftValue,
      hire_date: hireDate.trim(),
    };
    if (importMode && isHq(profile) && empNoManual.trim()) {
      payload.emp_no = empNoManual.trim();
    }
    return payload;
  }

  async function submitInsuranceRequestIfNeeded(
    employeeId: string,
    storeId: string
  ): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase.from("insurance_requests").insert([
      { employee_id: employeeId, store_id: storeId, note: "新入职申请意外险" },
    ]);
    if (error) {
      console.error("意外险申请写入失败", error);
      return { success: false, error: error.message };
    }
    return { success: true };
  }

  const handleSubmit = async () => {
    const validation = validateForm();
    if (!validation.ok) {
      setMsg(validation.message);
      setMsgType("error");
      return;
    }

    setMsg("提交中...");
    setMsgType("info");
    setInsuranceRequestFailed(false);
    setSubmitLoading(true);

    const trimmedPhone = phone.trim().replace(/\s/g, "");
    const trimmedIdCard = idCard.trim();

    const { data: existingPhone } = await supabase
      .from("employees")
      .select("id")
      .eq("phone", trimmedPhone)
      .maybeSingle();
    if (existingPhone) {
      setMsg("该手机号已存在，请确认是否重复录入");
      setMsgType("error");
      setSubmitLoading(false);
      return;
    }
    const { data: existingIdCard } = await supabase
      .from("employees")
      .select("id")
      .eq("id_card", trimmedIdCard)
      .maybeSingle();
    if (existingIdCard) {
      setMsg("该身份证号已存在，请确认是否重复录入");
      setMsgType("error");
      setSubmitLoading(false);
      return;
    }

    const payload = buildEmployeePayload();
    const insertPayload = {
      name: payload.name,
      id_card: payload.id_card,
      phone: payload.phone,
      employment_status: payload.employment_status,
      system_status: payload.system_status,
      current_store_id: payload.current_store_id,
      home_store_id: payload.home_store_id,
      contract_entity_id: payload.contract_entity_id,
      dept_id: payload.dept_id,
      position_id: payload.position_id,
      work_shift: payload.work_shift,
      hire_date: payload.hire_date,
      ...(payload.emp_no !== undefined && payload.emp_no !== '' ? { emp_no: payload.emp_no } : {}),
    };
    
    const { data: inserted, error } = await supabase
      .from("employees")
      .insert([insertPayload])
      .select("id, emp_no, name")
      .single();

    if (error) {
      const errMsg = error.message ?? "";
      if (errMsg.includes("duplicate") || errMsg.includes("unique") || errMsg.includes("uq_")) {
        if (errMsg.toLowerCase().includes("emp_no") || errMsg.includes("emp_no")) {
          setMsg("员工编号冲突，请重试");
        } else if (errMsg.toLowerCase().includes("phone") || errMsg.includes("手机")) {
          setMsg("该手机号已存在，请确认是否重复录入");
        } else if (errMsg.toLowerCase().includes("id_card") || errMsg.includes("身份证")) {
          setMsg("该身份证号已存在，请确认是否重复录入");
        } else {
          setMsg("数据冲突，请检查是否重复录入后重试");
        }
      } else {
        setMsg("提交失败，请稍后重试");
      }
      setMsgType("error");
      console.error("员工入职插入失败", error);
      setSubmitLoading(false);
      return;
    }

    const insertedRow = inserted as { id: string; emp_no?: string; name?: string } | null;
    // TODO: 新增员工后未来应自动加入本店员工池（store_staff_pool），便于投保申请等按「门店可调用员工」过滤。本次先不实现。
    const newEmpNo = insertedRow?.emp_no ?? "";
    const newName = insertedRow?.name ?? name.trim();

    setLastCreatedEmpNo(newEmpNo);
    setLastCreatedName(newName);

    let insuranceOk = true;
    if (applyInsurance && isStoreManager(profile) && profile?.store_id && insertedRow?.id) {
      const result = await submitInsuranceRequestIfNeeded(insertedRow.id, profile.store_id);
      insuranceOk = result.success;
      setInsuranceRequestFailed(!result.success);
    }

    if (insuranceOk) {
      setMsg(
        applyInsurance && isStoreManager(profile)
          ? `提交成功！新员工已入职，并已提交意外险申请。员工编号：${newEmpNo}`
          : `提交成功！新员工已入职，员工编号：${newEmpNo}`
      );
      setMsgType("success");
    } else {
      setMsg(`提交成功！新员工已入职，员工编号：${newEmpNo}`);
      setMsgType("success");
    }

    loadRecentEmployees();

    setName("");
    setIdCard("");
    setPhone("");
    setEmploymentStatus("试用期");
    setSystemStatus("pending");
    if (stores.length > 1) setCurrentStoreId("");
    if (contractEntities.length > 1) setContractEntityId("");
    if (departments.length > 1) setDeptId("");
    if (positions.length > 1) setPositionId("");
    if (workShiftOptions.length > 0) setWorkShift(workShiftOptions[0].value);
    setHireDate(DEFAULT_HIRE_DATE());
    setApplyInsurance(false);
    if (importMode) {
      setEmpNoManual("");
      setImportMode(false);
    }
    setSubmitLoading(false);
  };

  if (loading) {
    return (
      <main className="page-container" style={{ maxWidth: 28 * 16 }}>
        <p className="muted-text">加载中...</p>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="page-container" style={{ maxWidth: 28 * 16 }}>
        <p className="muted-text">请先登录。</p>
        <Link href="/login" className="btn btn-ghost btn-sm" style={{ marginTop: "0.75rem", display: "inline-flex" }}>
          去登录
        </Link>
      </main>
    );
  }

  if (isFinance(profile)) {
    return (
      <main className="page-container" style={{ maxWidth: 28 * 16 }}>
        <h1 className="heading-1">员工入职</h1>
        <p className="muted-text" style={{ marginTop: "0.5rem" }}>您当前无权限在此页面新增员工。</p>
        <Link href="/workdays" className="btn btn-outline btn-sm" style={{ marginTop: "0.75rem", display: "inline-flex" }}>
          返回工作天数
        </Link>
      </main>
    );
  }

  return (
    <main className="page-container" style={{ maxWidth: 28 * 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <h1 className="heading-1">员工入职</h1>
        <Link href="/workdays" className="btn btn-outline btn-sm">
          返回工作天数
        </Link>
      </div>
      <p className="muted-text" style={{ marginBottom: "1rem" }}>
        当前为首次员工导入阶段，店长暂时允许手动调整【用工状态】和【系统状态】。
        <br />
        系统正式上线后，将收紧为默认：
        <br />
        - employment_status = 试用期
        <br />
        - system_status = pending
      </p>

      <div style={{ maxWidth: 25 * 16 }}>
        <div className="field">
          <label className="field-label">姓名 *</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="员工姓名" className="input" />
        </div>
        <div className="field">
          <label className="field-label">身份证号 *</label>
          <input
            type="text"
            value={idCard}
            onChange={(e) => setIdCard(e.target.value)}
            placeholder="18位身份证号"
            maxLength={18}
            className="input"
          />
        </div>
        <div className="field">
          <label className="field-label">电话号码 *</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="11位手机号"
            maxLength={11}
            className="input"
          />
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
          {/* TODO: 后续收紧为店长默认只能录「试用期」，不可改 */}
        </div>
        <div className="field">
          <label className="field-label">系统状态 *</label>
          <select
            value={systemStatus}
            onChange={(e) => setSystemStatus(e.target.value as SystemStatus)}
            className="input"
          >
            {SYSTEM_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {/* TODO: 后续收紧为店长默认只能录「pending」，不可改 */}
        </div>
        <div className="field">
          <label className="field-label">入职日期 *</label>
          <input type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} className="input" />
        </div>
        <div className="field">
          <label className="field-label">当前门店 *</label>
          <select value={currentStoreId} onChange={(e) => setCurrentStoreId(e.target.value)} className="input">
            <option value="">请选择门店</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field-label">签约主体 *</label>
          <select value={contractEntityId} onChange={(e) => setContractEntityId(e.target.value)} className="input">
            <option value="">请选择签约主体</option>
            {contractEntities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          {contractEntities.length === 0 && (
            <p className="field-hint">
              暂无签约主体可选。请在 Supabase 表 <code>legal_entities</code> 或 <code>contract_entity</code> 中新增数据。
            </p>
          )}
        </div>
        <div className="field">
          <label className="field-label">部门 *</label>
          <select value={deptId} onChange={(e) => setDeptId(e.target.value)} className="input">
            <option value="">请选择部门</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.dept_name}
              </option>
            ))}
          </select>
          {departments.length === 0 && (
            <p className="field-hint">暂无部门可选。请在 Supabase 表 <code>departments</code> 或 <code>department</code> 中新增数据。</p>
          )}
        </div>
        <div className="field">
          <label className="field-label">职位 *</label>
          <select value={positionId} onChange={(e) => setPositionId(e.target.value)} className="input">
            <option value="">请选择职位</option>
            {positions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {positions.length === 0 && (
            <p className="field-hint">暂无职位可选。请在 Supabase 表 <code>position_catalog</code> 中新增数据。</p>
          )}
        </div>
        <div className="field">
          <label className="field-label">工作时长 *</label>
          <select value={workShift} onChange={(e) => setWorkShift(e.target.value)} className="input">
            <option value="">请选择工作时长</option>
            {workShiftOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {workShiftOptions.length === 0 && (
            <p className="field-hint" style={{ color: "var(--destructive)" }}>
              暂无工作时长可选，请检查 work_shift 表或联系管理员。
            </p>
          )}
        </div>

        {isHq(profile) && (
          <section className="card" style={{ marginTop: "1.25rem", padding: "1rem" }}>
            <h3 className="heading-2" style={{ fontSize: "0.875rem", marginBottom: "0.5rem" }}>
              导入模式（仅 HQ）
            </h3>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", marginBottom: "0.5rem" }}>
              <input type="checkbox" checked={importMode} onChange={(e) => setImportMode(e.target.checked)} />
              导入模式
            </label>
            {importMode && (
              <div className="field" style={{ marginTop: "0.5rem" }}>
                <label className="field-label">员工编号（手填）</label>
                <input
                  type="text"
                  value={empNoManual}
                  onChange={(e) => setEmpNoManual(e.target.value)}
                  placeholder="如 E9999"
                  className="input"
                />
              </div>
            )}
          </section>
        )}

        <section className="card" style={{ marginTop: "1.25rem", padding: "1rem" }}>
          <h3 className="heading-2" style={{ fontSize: "0.875rem", marginBottom: "0.5rem" }}>
            意外险购买
          </h3>
          <p className="body-text muted-text" style={{ marginBottom: "0.625rem" }}>
            新员工入职后，店长可在「投保申请」页为该员工提交意外险申请，总部在「投保处理」页录入保单并激活员工。
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <Link href="/insurance-request" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }}>
              去投保申请页
            </Link>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.375rem",
                fontSize: "0.8125rem",
                cursor: isStoreManager(profile) ? "pointer" : "not-allowed",
              }}
            >
              <input
                type="checkbox"
                checked={applyInsurance}
                onChange={(e) => setApplyInsurance(e.target.checked)}
                disabled={!isStoreManager(profile)}
              />
              本次入职后同时提交意外险申请
              {!isStoreManager(profile) && (
                <span className="muted-text" style={{ fontSize: "0.75rem" }}>
                  （仅店长可选）
                </span>
              )}
            </label>
          </div>
        </section>

        <div style={{ marginTop: "1.25rem" }}>
          <button
            type="button"
            onClick={handleSubmit}
            className="btn btn-primary"
            disabled={submitLoading}
          >
            {submitLoading ? "提交中…" : "提交入职"}
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
          {lastCreatedEmpNo && (
            <p className="body-text" style={{ marginTop: "0.5rem", fontWeight: 600 }}>
              新员工已入职：{lastCreatedName ?? ""}，员工编号：{lastCreatedEmpNo}
            </p>
          )}
          {insuranceRequestFailed && (
            <div style={{ marginTop: "0.75rem" }}>
              <p style={{ color: "var(--destructive)", fontWeight: 600 }}>
                新员工已入职，但意外险申请失败，请立即去申请投保。
              </p>
              <Link href="/insurance-request" className="btn btn-outline btn-sm" style={{ marginTop: "0.5rem", display: "inline-flex" }}>
                继续去申请投保
              </Link>
            </div>
          )}
          {msgType === "success" && !insuranceRequestFailed && lastCreatedEmpNo && (
            <Link href="/insurance-request" className="btn btn-outline btn-sm" style={{ marginTop: "0.75rem", display: "inline-flex" }}>
              继续去申请投保
            </Link>
          )}
        </div>

        <section style={{ marginTop: "2rem" }}>
          <h2 className="heading-2" style={{ marginBottom: "0.75rem" }}>
            最近新增员工列表
          </h2>
          {recentLoading ? (
            <p className="muted-text">加载中…</p>
          ) : recentEmployees.length === 0 ? (
            <p className="muted-text">暂无记录</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="table" style={{ minWidth: 480 }}>
                <thead>
                  <tr>
                    <th>姓名</th>
                    <th>员工编号</th>
                    <th>用工状态</th>
                    <th>系统状态</th>
                    <th>当前门店</th>
                    <th>创建时间</th>
                  </tr>
                </thead>
                <tbody>
                  {recentEmployees.map((row) => (
                    <tr key={row.id}>
                      <td>{row.name ?? "—"}</td>
                      <td>{row.emp_no ?? "—"}</td>
                      <td>{row.employment_status ?? "—"}</td>
                      <td>{row.system_status ?? "—"}</td>
                      <td>{row.stores?.name ?? "—"}</td>
                      <td>{row.created_at ? new Date(row.created_at).toLocaleString("zh-CN") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {/* TODO: 若 employees 表无 created_at，需在库中新增该列或改用 id 排序 */}
          {/* TODO: 员工池逻辑：若系统已有 store_staff_pool 等表，新增员工后应自动加入本店员工池；当前未实现则保留此处 TODO */}
        </section>
      </div>
    </main>
  );
}
