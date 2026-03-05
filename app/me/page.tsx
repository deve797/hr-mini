"use client";

import { useEffect, useState } from "react";
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
      <main style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>我是谁</h1>
        <p style={{ marginTop: 12 }}>加载中...</p>
      </main>
    );
  }

  if (!userId) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>我是谁</h1>
        <p style={{ marginTop: 12 }}>未登录</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>我是谁</h1>
      <div style={{ marginTop: 12, fontSize: 14, lineHeight: 1.8 }}>
        <div><strong>email:</strong> {email ?? "—"}</div>
        <div><strong>user_id:</strong> {userId}</div>
        <div><strong>role:</strong> {profile?.role ?? "—"}</div>
        <div><strong>store_id:</strong> {profile?.store_id ?? "—"}</div>
        {profileError && (
          <div style={{ marginTop: 12, color: "#c00", fontSize: 12 }}>
            查询 users_profile 报错: {profileError}
          </div>
        )}
        {!profile && !profileError && (
          <div style={{ marginTop: 12, color: "#666", fontSize: 12 }}>
            未在 users_profile 中查到该 user_id 的记录（请检查表主键是 id 还是 user_id，以及是否有对应行）
          </div>
        )}
      </div>
    </main>
  );
}
