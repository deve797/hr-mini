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
    <main className="page-container" style={{ maxWidth: 28 * 16 }}>
      <h1 className="heading-1" style={{ marginBottom: "1.5rem" }}>
        登录
      </h1>

      <div className="field">
        <label htmlFor="email" className="field-label">
          邮箱
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="input"
        />
      </div>

      <div className="field">
        <label htmlFor="password" className="field-label">
          密码
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
          className="input"
        />
      </div>

      <button type="button" onClick={signIn} className="btn btn-primary" style={{ width: "100%", marginTop: "0.5rem" }}>
        登录
      </button>

      <p className="muted-text" style={{ marginTop: "1rem" }}>
        {msg}
      </p>

      <div className="muted-text" style={{ marginTop: "1.5rem", fontSize: "0.8125rem", lineHeight: 1.6 }}>
        <p>提示：账号请在 Supabase Dashboard → Authentication → Users 创建并设置密码。</p>
        <p style={{ marginTop: "0.5rem" }}>
          店长账号还需在表 users_profile 中有一行：user_id=该用户 UUID，role=store_manager，store_id=所属门店 UUID。并执行 <code>scripts/users_profile_rls.sql</code> 确保可读自己的 profile。
        </p>
      </div>
    </main>
  );
}
