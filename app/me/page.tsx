"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Profile = {
  role: string | null;
  store_id: string | null;
} | null;

export default function MePage() {
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkedEmployee, setLinkedEmployee] = useState<{
    id: string;
    emp_no: string | null;
    name: string | null;
  } | null>(null);

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

      if (profileErr) {
        console.error("users_profile 查询失败:", profileErr);
        setProfileError(profileErr.message);
      } else {
        setProfileError(null);
      }

      setProfile(profileData ? { role: profileData.role ?? null, store_id: profileData.store_id ?? null } : null);

      const { data: empRow, error: empErr } = await supabase
        .from("employees")
        .select("id, emp_no, name")
        .eq("user_id", user.id)
        .maybeSingle();
      if (empErr) {
        console.error("employees user_id 查询失败:", empErr);
        setLinkedEmployee(null);
      } else {
        setLinkedEmployee(empRow ?? null);
      }

      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <main className="page-container" style={{ maxWidth: 32 * 16 }}>
        <h1 className="heading-1" style={{ marginBottom: "1rem" }}>
          我是谁
        </h1>
        <p className="muted-text">加载中...</p>
      </main>
    );
  }

  if (!userId) {
    return (
      <main className="page-container" style={{ maxWidth: 32 * 16 }}>
        <h1 className="heading-1" style={{ marginBottom: "1rem" }}>
          我是谁
        </h1>
        <p className="muted-text" style={{ marginBottom: "1rem" }}>未登录</p>
        <Link href="/login" className="btn btn-primary" style={{ display: "inline-flex" }}>
          去登录
        </Link>
      </main>
    );
  }

  return (
    <main className="page-container" style={{ maxWidth: 32 * 16 }}>
      <h1 className="heading-1" style={{ marginBottom: "1rem" }}>
        我是谁
      </h1>
      <div className="body-text" style={{ fontSize: "0.875rem", lineHeight: 1.8, color: "var(--muted-foreground)" }}>
        <div><strong>email:</strong> {email ?? "—"}</div>
        <div><strong>user_id:</strong> {userId}</div>
        <div><strong>role:</strong> {profile?.role ?? "—"}</div>
        <div><strong>store_id:</strong> {profile?.store_id ?? "—"}</div>
        {profileError && (
          <div className="msg-error" style={{ marginTop: "1rem" }}>
            查询 users_profile 报错: {profileError}
          </div>
        )}
        {!profile && !profileError && (
          <div className="muted-text" style={{ marginTop: "1rem" }}>
            未在 users_profile 中查到该 user_id 的记录（请检查表主键是 id 还是 user_id，以及是否有对应行）
          </div>
        )}
        {linkedEmployee && (
          <div className="body-text" style={{ marginTop: "1rem", color: "var(--foreground)" }}>
            <strong>绑定员工档案：</strong>
            {linkedEmployee.name ?? "—"}（工号 {linkedEmployee.emp_no ?? "—"}）
          </div>
        )}
        {!linkedEmployee && profile && (
          <div className="muted-text" style={{ marginTop: "1rem", fontSize: "0.875rem" }}>
            未绑定员工档案：店长可在「员工入职」勾选绑定本人，或由管理员在数据库为 employees.user_id 赋值。
          </div>
        )}
      </div>
    </main>
  );
}
