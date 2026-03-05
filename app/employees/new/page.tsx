"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Profile = { role: string | null; store_id: string | null } | null;

type Store = { id: string; name: string };

type ContractEntity = { id: string; name: string };

type Department = { id: string; dept_name: string };

type Position = { id: string; name: string };

function isStoreManager(profile: Profile): boolean {
  return profile?.role === "store_manager" && !!profile?.store_id;
}

export default function NewEmployeePage() {
  const [profile, setProfile] = useState<Profile>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [contractEntities, setContractEntities] = useState<ContractEntity[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [workShiftOptions, setWorkShiftOptions] = useState<{ value: string; label: string }[]>([]);
  const [name, setName] = useState("");
  const [empNo, setEmpNo] = useState("");
  const [idCard, setIdCard] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<"试用期" | "转正">("试用期");
  const [currentStoreId, setCurrentStoreId] = useState("");
  const [contractEntityId, setContractEntityId] = useState("");
  const [deptId, setDeptId] = useState("");
  const [positionId, setPositionId] = useState("");
  const [workShift, setWorkShift] = useState("");
  const [hireDate, setHireDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [applyInsurance, setApplyInsurance] = useState(false);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

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
        setMsg("门店加载失败：" + storeError.message);
        setLoading(false);
        return;
      }
      if (storeData) {
        setStores(storeData);
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
        const firstId = entityData[0].id;
        if (entityData.length === 1 && firstId) {
          setContractEntityId(String(firstId));
        }
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
        if (posByTitle?.length) posData = (posByTitle as { id: string; position_name: string }[]).map((r) => ({ id: r.id, name: r.position_name }));
      }
      if (!posData?.length) {
        const { data: posByTitle2 } = await supabase.from("position_catalog").select("id,title").order("title");
        if (posByTitle2?.length) posData = (posByTitle2 as { id: string; title: string }[]).map((r) => ({ id: r.id, name: r.title }));
      }
      if (posData?.length) {
        setPositions(posData);
        if (posData.length === 1) setPositionId(posData[0].id);
      }

      const { data: wsData } = await supabase.from("work_shift").select("id,name").order("id");
      if (wsData?.length) {
        const allowedIds = [9, 10, 12];
        const opts = wsData
          .filter((r: { id: number }) => allowedIds.includes(Number(r.id)))
          .map((r: { id: number | string; name: string }) => ({ value: String(r.id), label: r.name }));
        if (opts.length > 0) {
          setWorkShiftOptions(opts);
          setWorkShift(opts[0].value);
        } else {
          setWorkShiftOptions([
            { value: "9", label: "9小时/天" },
            { value: "10", label: "10小时/天" },
            { value: "12", label: "12小时/天" },
          ]);
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
            setWorkShiftOptions([
              { value: "9", label: "9小时/天" },
              { value: "10", label: "10小时/天" },
              { value: "12", label: "12小时/天" },
            ]);
            setWorkShift("9");
          }
        } else {
          setWorkShiftOptions([
            { value: "9", label: "9小时/天" },
            { value: "10", label: "10小时/天" },
            { value: "12", label: "12小时/天" },
          ]);
          setWorkShift("9");
        }
      }

      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (contractEntities.length === 1 && !contractEntityId && contractEntities[0].id) {
      setContractEntityId(String(contractEntities[0].id));
    }
  }, [contractEntities, contractEntityId]);

  useEffect(() => {
    if (departments.length === 1 && !deptId && departments[0].id) {
      setDeptId(departments[0].id);
    }
  }, [departments, deptId]);

  useEffect(() => {
    if (positions.length === 1 && !positionId && positions[0].id) {
      setPositionId(positions[0].id);
    }
  }, [positions, positionId]);

  useEffect(() => {
    if (workShiftOptions.length > 0 && !workShift) {
      setWorkShift(workShiftOptions[0].value);
    }
  }, [workShiftOptions, workShift]);

  const submit = async () => {
    const trimmedName = name.trim();
    const trimmedEmpNo = empNo.trim();
    if (!trimmedName) {
      setMsg("请填写员工姓名");
      return;
    }
    if (!trimmedEmpNo) {
      setMsg("请填写工号");
      return;
    }
    if (!currentStoreId) {
      setMsg("请选择当前门店");
      return;
    }
    if (!contractEntityId) {
      setMsg("请选择签约主体");
      return;
    }
    if (!deptId) {
      setMsg("请选择部门");
      return;
    }
    if (!positionId) {
      setMsg("请选择职位");
      return;
    }
    if (!workShift) {
      setMsg("请选择工作时长");
      return;
    }
    if (!hireDate || !hireDate.trim()) {
      setMsg("请选择入职日期");
      return;
    }

    const homeStoreId = String(currentStoreId).trim();
    if (!homeStoreId || homeStoreId.length < 10) {
      setMsg("请选择当前门店");
      return;
    }

    setMsg("提交中...");
    const workShiftValue = /^\d+$/.test(String(workShift)) ? parseInt(String(workShift), 10) : workShift;
    const payload = {
      emp_no: trimmedEmpNo,
      id_number: trimmedEmpNo,
      name: trimmedName,
      status,
      current_store_id: homeStoreId,
      home_store_id: homeStoreId,
      contract_entity_id: contractEntityId,
      dept_id: deptId,
      position_id: positionId,
      work_shift: workShiftValue,
      hire_date: hireDate.trim(),
      ...(idCard.trim() && { id_card: idCard.trim() }),
      ...(phone.trim() && { phone: phone.trim() }),
    };
    console.log("员工入职提交 payload:", payload, "work_shift 类型:", typeof payload.work_shift);
    if (!payload.home_store_id) {
      setMsg("提交参数异常：缺少 home_store_id，请刷新页面后重试");
      return;
    }
    const { data: inserted, error } = await supabase
      .from("employees")
      .insert([payload])
      .select("id")
      .single();

    if (error) {
      if (error.message.includes("duplicate") || error.message.includes("unique")) {
        setMsg("工号已存在，请更换工号");
        return;
      }
      setMsg("提交失败：" + error.message);
      return;
    }

    if (applyInsurance && isStoreManager(profile) && profile?.store_id && inserted?.id) {
      const { error: irError } = await supabase.from("insurance_requests").insert([
        { employee_id: inserted.id, store_id: profile.store_id, note: "新入职申请意外险" },
      ]);
      if (irError) {
        setMsg("提交成功！新员工已入职。意外险申请提交失败：" + irError.message);
      } else {
        setMsg("提交成功！新员工已入职，并已提交意外险申请。");
      }
    } else {
      setMsg("提交成功！新员工已入职。");
    }
    setName("");
    setEmpNo("");
    setIdCard("");
    setPhone("");
    setStatus("试用期");
    if (stores.length > 1) setCurrentStoreId("");
    if (contractEntities.length > 1) setContractEntityId("");
    if (departments.length > 1) setDeptId("");
    if (positions.length > 1) setPositionId("");
    if (workShiftOptions.length > 0) setWorkShift(workShiftOptions[0].value);
    const d = new Date();
    setHireDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  };

  if (loading) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui" }}>
        <p>加载中...</p>
      </main>
    );
  }

  if (!profile) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui" }}>
        <p>请先登录。</p>
        <Link href="/login" style={{ marginTop: 12, display: "inline-block" }}>
          去登录
        </Link>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>员工入职</h1>
        <Link
          href="/workdays"
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
          录入工作天数
        </Link>
      </div>

      <div style={{ maxWidth: 400 }}>
        <div style={{ marginTop: 12 }}>
          <label style={{ display: "block", fontSize: 14, marginBottom: 4 }}>姓名 *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="员工姓名"
            style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8 }}
          />
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={{ display: "block", fontSize: 14, marginBottom: 4 }}>工号 *</label>
          <input
            type="text"
            value={empNo}
            onChange={(e) => setEmpNo(e.target.value)}
            placeholder="工号"
            style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8 }}
          />
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={{ display: "block", fontSize: 14, marginBottom: 4 }}>身份证号码</label>
          <input
            type="text"
            value={idCard}
            onChange={(e) => setIdCard(e.target.value)}
            placeholder="身份证号码"
            maxLength={18}
            style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8 }}
          />
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={{ display: "block", fontSize: 14, marginBottom: 4 }}>电话号码</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="电话号码"
            style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8 }}
          />
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={{ display: "block", fontSize: 14, marginBottom: 4 }}>状态</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as "试用期" | "转正")}
            style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8 }}
          >
            <option value="试用期">试用期</option>
            <option value="转正">转正</option>
          </select>
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={{ display: "block", fontSize: 14, marginBottom: 4 }}>入职日期 *</label>
          <input
            type="date"
            value={hireDate}
            onChange={(e) => setHireDate(e.target.value)}
            style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8 }}
          />
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={{ display: "block", fontSize: 14, marginBottom: 4 }}>当前门店 *</label>
          <select
            value={currentStoreId}
            onChange={(e) => setCurrentStoreId(e.target.value)}
            style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8 }}
          >
            <option value="">请选择门店</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={{ display: "block", fontSize: 14, marginBottom: 4 }}>签约主体 *</label>
          <select
            value={contractEntityId}
            onChange={(e) => setContractEntityId(e.target.value)}
            style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8 }}
          >
            <option value="">请选择签约主体</option>
            {contractEntities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          {contractEntities.length === 0 && (
            <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
              暂无签约主体可选。请在 Supabase 表 <code>legal_entities</code> 中新增数据，并确保 RLS 允许当前用户读取。
            </div>
          )}
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={{ display: "block", fontSize: 14, marginBottom: 4 }}>部门 *</label>
          <select
            value={deptId}
            onChange={(e) => setDeptId(e.target.value)}
            style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8 }}
          >
            <option value="">请选择部门</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.dept_name}
              </option>
            ))}
          </select>
          {departments.length === 0 && (
            <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
              暂无部门可选。请在 Supabase 表 <code>departments</code> 或 <code>department</code> 中新增数据。
            </div>
          )}
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={{ display: "block", fontSize: 14, marginBottom: 4 }}>职位 *</label>
          <select
            value={positionId}
            onChange={(e) => setPositionId(e.target.value)}
            style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8 }}
          >
            <option value="">请选择职位</option>
            {positions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {positions.length === 0 && (
            <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
              暂无职位可选。请在 Supabase 表 <code>position_catalog</code> 中新增数据。
            </div>
          )}
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={{ display: "block", fontSize: 14, marginBottom: 4 }}>工作时长 *</label>
          <select
            value={workShift}
            onChange={(e) => setWorkShift(e.target.value)}
            style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8 }}
          >
            <option value="">请选择工作时长</option>
            {workShiftOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {workShiftOptions.length === 0 && (
            <div style={{ marginTop: 6, fontSize: 12, color: "#c00" }}>
              暂无工作时长可选，请检查 work_shift 表或联系管理员。
            </div>
          )}
        </div>

        <section style={{ marginTop: 20, padding: 12, border: "1px solid #e5e7eb", borderRadius: 8, background: "#f9fafb" }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 8px 0" }}>意外险购买</h3>
          <p style={{ fontSize: 13, color: "#374151", margin: 0, lineHeight: 1.5 }}>
            新员工入职后，店长可在「投保申请」页为该员工提交意外险申请，总部在「投保处理」页录入保单并激活员工。
          </p>
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Link
              href="/insurance-request"
              style={{
                fontSize: 13,
                color: "#2563eb",
                textDecoration: "underline",
              }}
            >
              去投保申请页
            </Link>
            {isStoreManager(profile) && (
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={applyInsurance}
                  onChange={(e) => setApplyInsurance(e.target.checked)}
                />
                本次入职后同时提交意外险申请
              </label>
            )}
          </div>
        </section>

        <button
          onClick={submit}
          style={{ marginTop: 20, padding: "10px 16px", borderRadius: 8, border: "1px solid #ddd", background: "#fff", fontWeight: 600 }}
        >
          提交入职
        </button>
        <div style={{ marginTop: 12, fontSize: 14 }}>{msg}</div>
      </div>
    </main>
  );
}
