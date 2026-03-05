"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  const signIn = async () => {
    setMsg("登录中...");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      const code = (error as { code?: string }).code ?? "";
      const isInvalidCreds =
        code === "invalid_credentials" ||
        error.message?.toLowerCase().includes("invalid login") ||
        error.message?.toLowerCase().includes("invalid_credentials");
      const isEmailNotConfirmed =
        code === "email_not_confirmed" ||
        error.message?.toLowerCase().includes("email not confirmed");
      let hint = "";
      if (isInvalidCreds)
        hint =
          " 请确认：1) 该用户已在 Supabase → Authentication → Users 中存在；2) 密码正确。";
      else if (isEmailNotConfirmed)
        hint =
          " 请在 Supabase → Authentication → Users 中点击该用户，勾选 Email 已确认；或到 Authentication → Providers → Email 关闭 “Confirm email”。";
      setMsg(`登录失败 [${code || "—"}]: ${error.message}${hint}`);
      return;
    }
    setMsg("登录成功，跳转中...");
    router.push("/me");
  };

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 420 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>登录</h1>

      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 14, marginBottom: 6 }}>邮箱</div>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          style={{
            width: "100%",
            padding: 10,
            border: "1px solid #ddd",
            borderRadius: 10,
          }}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 14, marginBottom: 6 }}>密码</div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
          style={{
            width: "100%",
            padding: 10,
            border: "1px solid #ddd",
            borderRadius: 10,
          }}
        />
      </div>

      <button
        onClick={signIn}
        style={{
          marginTop: 16,
          width: "100%",
          padding: 12,
          borderRadius: 12,
          border: "1px solid #ddd",
          background: "#fff",
          fontWeight: 600,
        }}
      >
        登录
      </button>

      <div style={{ marginTop: 12, fontSize: 14 }}>{msg}</div>

      <div style={{ marginTop: 16, fontSize: 12, color: "#666" }}>
        <p>提示：账号请在 Supabase Dashboard → Authentication → Users 创建并设置密码。</p>
        <p style={{ marginTop: 6 }}>
          店长账号还需在表 users_profile 中有一行：user_id=该用户 UUID，role=store_manager，store_id=所属门店 UUID。并执行 <code>scripts/users_profile_rls.sql</code> 确保可读自己的 profile。
        </p>
      </div>
    </main>
  );
}