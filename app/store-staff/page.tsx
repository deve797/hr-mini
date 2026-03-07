"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Profile = { role: string | null; store_id: string | null } | null;

type Store = { id: string; name: string | null };

type Employee = {
  id: string;
  name: string | null;
  emp_no: string | null;
  phone: string | null;
  employment_status: string | null;
  system_status: string | null;
};

type PoolRow = {
  id: string;
  store_id: string;
  employee_id: string;
  status: string;
  employees: {
    id: string;
    name: string | null;
    emp_no: string | null;
    phone: string | null;
    employment_status: string | null;
    system_status: string | null;
  } | null;
};

function isHqOrFinance(profile: Profile): boolean {
  const role = profile?.role ?? "";
  return role === "hq" || role === "finance";
}

function isStoreManager(profile: Profile): boolean {
  return profile?.role === "store_manager" && !!profile?.store_id;
}

function getEmployeeDisplayName(emp: { name: string | null; emp_no: string | null } | null): string {
  if (!emp) return "—";
  if (emp.name && emp.emp_no) return `${emp.name} (${emp.emp_no})`;
  if (emp.name) return emp.name;
  if (emp.emp_no) return emp.emp_no;
  return "—";
}

export default function StoreStaffPage() {
  const [profile, setProfile] = useState<Profile>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const [storeName, setStoreName] = useState<string>("");
  const [poolRows, setPoolRows] = useState<PoolRow[]>([]);
  const [poolLoading, setPoolLoading] = useState(false);
  const [poolSearch, setPoolSearch] = useState("");
  const [addSearchQuery, setAddSearchQuery] = useState("");
  const [addSearchResults, setAddSearchResults] = useState<Employee[]>([]);
  const [addSearching, setAddSearching] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"info" | "error" | "success">("info");
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  const canEdit = isHqOrFinance(profile);
  const isManager = isStoreManager(profile);

  // 店长只能看自己门店：effectiveStoreId 仅来自 profile.store_id，不从 URL/选择器来
  const effectiveStoreId = isManager ? profile?.store_id ?? "" : selectedStoreId;

  const loadProfileAndStores = useCallback(async () => {
    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user ?? null;
    if (!user) {
      setProfile(null);
      setEmail(null);
      setProfileLoading(false);
      return;
    }
    setEmail(user.email ?? null);
    const { data: profileData } = await supabase
      .from("users_profile")
      .select("role, store_id")
      .eq("user_id", user.id)
      .maybeSingle();
    const p: Profile = profileData
      ? { role: profileData.role ?? null, store_id: profileData.store_id ?? null }
      : null;
    setProfile(p);

    if (isHqOrFinance(p)) {
      const { data: storeData, error: storeErr } = await supabase
        .from("stores")
        .select("id, name")
        .order("name");
      if (storeErr) {
        console.error("加载门店列表失败:", storeErr);
        setStores([]);
      } else {
        const list = (storeData as Store[]) ?? [];
        setStores(list);
        if (list.length) {
          setSelectedStoreId((prev) => prev || list[0].id);
          setStoreName(list[0].name ?? "");
        }
      }
    } else if (isStoreManager(p) && p?.store_id) {
      const { data: storeData } = await supabase
        .from("stores")
        .select("name")
        .eq("id", p.store_id)
        .maybeSingle();
      setStoreName((storeData?.name as string) ?? "本门店");
    }
    setProfileLoading(false);
  }, []);

  const loadPool = useCallback(async () => {
    if (!effectiveStoreId) {
      setPoolRows([]);
      return;
    }
    setPoolLoading(true);
    const { data, error } = await supabase
      .from("store_staff_pool")
      .select("id, store_id, employee_id, status, employees(id, name, emp_no, phone, employment_status, system_status)")
      .eq("store_id", effectiveStoreId)
      .eq("status", "active");

    if (error) {
      console.error("加载员工池失败:", error);
      setPoolRows([]);
      setMsg("加载失败：" + (error.message || "请稍后重试"));
      setMsgType("error");
    } else {
      setPoolRows((data as PoolRow[]) ?? []);
    }
    setPoolLoading(false);
  }, [effectiveStoreId]);

  useEffect(() => {
    loadProfileAndStores();
  }, [loadProfileAndStores]);

  useEffect(() => {
    if (canEdit && effectiveStoreId && stores.length) {
      const s = stores.find((x) => x.id === effectiveStoreId);
      setStoreName(s?.name ?? "");
    }
  }, [canEdit, effectiveStoreId, stores]);

  useEffect(() => {
    loadPool();
  }, [loadPool]);

  // 全公司员工搜索（仅 HQ/finance 使用）
  useEffect(() => {
    if (!canEdit || !addSearchQuery.trim()) {
      setAddSearchResults([]);
      return;
    }
    const t = addSearchQuery.trim().replace(/%/g, "");
    if (!t) {
      setAddSearchResults([]);
      return;
    }
    setAddSearching(true);
    supabase
      .from("employees")
      .select("id, name, emp_no, phone, employment_status, system_status")
      .or(`name.ilike.%${t}%,emp_no.ilike.%${t}%,phone.ilike.%${t}%`)
      .limit(20)
      .then(({ data, error }) => {
        if (error) {
          console.error("搜索员工失败:", error);
          setAddSearchResults([]);
        } else {
          setAddSearchResults((data as Employee[]) ?? []);
        }
        setAddSearching(false);
      });
  }, [canEdit, addSearchQuery]);

  const handleRemove = async (poolId: string) => {
    if (!confirm("确定将该员工从本店员工池移除吗？")) return;
    setRemovingId(poolId);
    setMsg("");
    const { error } = await supabase
      .from("store_staff_pool")
      .update({ status: "inactive" })
      .eq("id", poolId);
    setRemovingId(null);
    if (error) {
      console.error("移除员工池记录失败:", error);
      setMsg("移除失败：" + (error.message || "请稍后重试"));
      setMsgType("error");
      return;
    }
    setMsg("已从本店员工池移除");
    setMsgType("success");
    loadPool();
  };

  const handleAddToPool = async (employeeId: string) => {
    if (!effectiveStoreId) {
      setMsg("请先选择门店");
      setMsgType("error");
      return;
    }
    setAddingId(employeeId);
    setMsg("");

    const { data: existing } = await supabase
      .from("store_staff_pool")
      .select("id, status")
      .eq("store_id", effectiveStoreId)
      .eq("employee_id", employeeId)
      .maybeSingle();

    if (existing) {
      if (existing.status === "active") {
        setMsg("该员工已在本店员工池中");
        setMsgType("info");
      } else {
        const { error: updateErr } = await supabase
          .from("store_staff_pool")
          .update({ status: "active" })
          .eq("id", existing.id);
        if (updateErr) {
          console.error("恢复员工池记录失败:", updateErr);
          setMsg("操作失败：" + (updateErr.message || "请稍后重试"));
          setMsgType("error");
        } else {
          setMsg("已重新加入本店员工池");
          setMsgType("success");
          loadPool();
        }
      }
      setAddingId(null);
      return;
    }

    const { error } = await supabase.from("store_staff_pool").insert([
      { store_id: effectiveStoreId, employee_id: employeeId, status: "active" },
    ]);
    setAddingId(null);
    if (error) {
      if (error.code === "23505" || error.message?.includes("unique") || error.message?.includes("duplicate")) {
        setMsg("该员工已在员工池中");
        setMsgType("info");
      } else {
        console.error("加入员工池失败:", error);
        setMsg("加入失败：" + (error.message || "请稍后重试"));
        setMsgType("error");
      }
      return;
    }
    setMsg("已加入本店员工池");
    setMsgType("success");
    loadPool();
  };

  const filteredPoolRows = poolSearch.trim()
    ? poolRows.filter((row) => {
        const e = row.employees;
        if (!e) return false;
        const term = poolSearch.trim().toLowerCase();
        const name = (e.name ?? "").toLowerCase();
        const empNo = (e.emp_no ?? "").toLowerCase();
        const phone = (e.phone ?? "").replace(/\s/g, "");
        return name.includes(term) || empNo.includes(term) || phone.includes(term);
      })
    : poolRows;

  const activeCount = poolRows.length;

  if (profileLoading) {
    return (
      <main className="page-container" style={{ maxWidth: 32 * 16 }}>
        <h1 className="heading-1" style={{ marginBottom: "0.75rem" }}>
          门店人员配置（员工池）
        </h1>
        <p className="muted-text">加载中…</p>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="page-container" style={{ maxWidth: 32 * 16 }}>
        <h1 className="heading-1" style={{ marginBottom: "0.75rem" }}>
          门店人员配置（员工池）
        </h1>
        <p className="muted-text">请先登录</p>
        <Link href="/me" className="btn btn-ghost btn-sm" style={{ marginTop: "1rem", display: "inline-flex" }}>
          返回个人页
        </Link>
      </main>
    );
  }

  if (!isHqOrFinance(profile) && !isManager) {
    return (
      <main className="page-container" style={{ maxWidth: 32 * 16 }}>
        <h1 className="heading-1" style={{ marginBottom: "0.75rem" }}>
          门店人员配置（员工池）
        </h1>
        <p className="msg-error" style={{ marginTop: "0.5rem" }}>
          无权限访问此页
        </p>
        <Link href="/me" className="btn btn-ghost btn-sm" style={{ marginTop: "1rem", display: "inline-flex" }}>
          返回个人页
        </Link>
      </main>
    );
  }

  return (
    <main className="page-container" style={{ maxWidth: 32 * 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.75rem", marginBottom: "1.5rem" }}>
        <h1 className="heading-1">门店人员配置（员工池）</h1>
        <Link href="/me" className="btn btn-outline btn-sm">
          返回个人页
        </Link>
      </div>

      {/* A) 顶部信息卡片 */}
      <div className="card" style={{ padding: "1rem 1.25rem", marginBottom: "1.5rem" }}>
        <p className="muted-text" style={{ marginBottom: "0.5rem" }}>
          当前用户：{email ?? "—"} · 角色：{profile?.role ?? "—"} · 绑定门店ID：{profile?.store_id ?? "—"}
        </p>
        <p className="body-text" style={{ fontWeight: 600 }}>
          当前门店：{storeName || (effectiveStoreId ? "—" : "请选择门店")}
        </p>
        <p className="body-text">
          本店配置人数（active）：<strong>{activeCount}</strong> 人
        </p>
      </div>

      {/* B) 门店选择（仅 HQ/finance） */}
      {canEdit && (
        <div className="field" style={{ marginBottom: "1.5rem" }}>
          <label className="field-label">选择门店</label>
          <select
            className="input"
            value={selectedStoreId}
            onChange={(e) => {
              setSelectedStoreId(e.target.value);
            }}
          >
            <option value="">请选择</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name ?? s.id}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* C) 员工池列表 */}
      <section style={{ marginBottom: "2rem" }}>
        <h2 className="heading-2" style={{ marginBottom: "0.75rem" }}>
          本店员工池
        </h2>
        {!effectiveStoreId ? (
          <p className="muted-text">请先选择门店</p>
        ) : (
          <>
            <div className="field" style={{ marginBottom: "0.75rem" }}>
              <input
                type="search"
                placeholder="搜索姓名、工号、手机号"
                className="input"
                value={poolSearch}
                onChange={(e) => setPoolSearch(e.target.value)}
              />
            </div>
            {poolLoading ? (
              <p className="muted-text">加载中…</p>
            ) : filteredPoolRows.length === 0 ? (
              <p className="muted-text">暂无配置员工</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {filteredPoolRows.map((row) => {
                  const e = row.employees;
                  return (
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
                      <div>
                        <span className="body-text" style={{ fontWeight: 600 }}>
                          {getEmployeeDisplayName(e)}
                        </span>
                        <span className="muted-text" style={{ marginLeft: "0.5rem" }}>
                          {e?.employment_status ?? "—"} · {e?.system_status ?? "—"}
                        </span>
                      </div>
                      {canEdit && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ color: "var(--destructive)" }}
                          disabled={removingId === row.id}
                          onClick={() => handleRemove(row.id)}
                        >
                          {removingId === row.id ? "处理中…" : "移除"}
                        </button>
                      )}
                      {/* TODO：未来可放开店长增删本店员工池 */}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </section>

      {/* D) 添加员工到本店（仅 HQ/finance） */}
      {canEdit && effectiveStoreId && (
        <section>
          <h2 className="heading-2" style={{ marginBottom: "0.75rem" }}>
            添加员工到本店
          </h2>
          <p className="muted-text" style={{ marginBottom: "0.5rem" }}>
            按姓名、工号或手机号搜索全公司员工，加入本店员工池
          </p>
          <div className="field" style={{ marginBottom: "0.75rem" }}>
            <input
              type="search"
              placeholder="搜索姓名、工号、手机号"
              className="input"
              value={addSearchQuery}
              onChange={(e) => setAddSearchQuery(e.target.value)}
            />
          </div>
          {addSearching && <p className="muted-text">搜索中…</p>}
          {addSearchQuery.trim() && !addSearching && (
            <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {addSearchResults.length === 0 ? (
                <li className="muted-text">未找到匹配员工</li>
              ) : (
                addSearchResults.map((emp) => (
                  <li
                    key={emp.id}
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
                    <span className="body-text">
                      {getEmployeeDisplayName(emp)} · {emp.employment_status ?? "—"} · {emp.system_status ?? "—"}
                    </span>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={addingId === emp.id}
                      onClick={() => handleAddToPool(emp.id)}
                    >
                      {addingId === emp.id ? "处理中…" : "加入本店"}
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </section>
      )}

      {msg && (
        <p
          className={msgType === "error" ? "msg-error" : msgType === "success" ? "msg-success" : "muted-text"}
          style={{ marginTop: "1rem" }}
        >
          {msg}
        </p>
      )}
    </main>
  );
}
