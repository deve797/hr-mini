"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Profile = {
  role: string | null;
  store_id: string | null;
} | null;

export default function MePage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!loading && profile?.role === "store_manager") {
      const t = setTimeout(() => router.replace("/"), 2000);
      return () => clearTimeout(t);
    }
  }, [loading, profile?.role, router]);

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
        <p className="muted-text">未登录</p>
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
        {profile?.role === "store_manager" && (
          <div style={{ marginTop: "1rem", color: "var(--primary)", fontSize: "0.8125rem" }}>
            2 秒后返回主页进行操作
          </div>
        )}
      </div>
    </main>
  );
}
