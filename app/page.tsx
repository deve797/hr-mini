"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import styles from "./page.module.css";

type Profile = { role: string | null; store_id: string | null } | null;

type PageStatus = "loading" | "guest" | "redirecting" | "error";

function isValidRole(profile: Profile): boolean {
  if (!profile || !profile.role) return false;
  const r = profile.role;
  if (r === "store_manager") return !!profile.store_id;
  return r === "hq" || r === "finance";
}

function getRedirectMessage(role: string | null): string {
  if (role === "store_manager") return "正在进入店长工作台…";
  if (role === "hq") return "正在进入总部工作台…";
  if (role === "finance") return "正在进入财务工作台…";
  return "正在进入工作台…";
}

export default function Home() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile>(null);
  const [status, setStatus] = useState<PageStatus>("loading");
  const hasRedirected = useRef(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user ?? null;

      if (cancelled) return;
      if (!user) {
        setProfile(null);
        setStatus("guest");
        return;
      }

      const { data: profileData } = await supabase
        .from("users_profile")
        .select("role, store_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;

      const nextProfile: Profile = profileData
        ? { role: profileData.role ?? null, store_id: profileData.store_id ?? null }
        : null;

      setProfile(nextProfile);

      if (nextProfile && isValidRole(nextProfile)) {
        setStatus("redirecting");
      } else {
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (status !== "redirecting" || !profile || !isValidRole(profile) || hasRedirected.current) {
      return;
    }
    hasRedirected.current = true;
    router.replace("/dashboard");
  }, [status, profile, router]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setStatus("guest");
    router.refresh();
  };

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.welcomeHeader}>
          <div className={styles.welcomeText}>
            <span className={styles.welcomeLine1}>欢迎来到左林右果</span>
            <span className={styles.welcomeLine2}>人事管理系统</span>
          </div>
          <div className={styles.welcomeImageSlot} aria-hidden />
        </header>
        <div className={styles.intro}>
          <h1>HR Mini</h1>

          {status === "loading" && (
            <p className={styles.mutedText}>正在加载用户信息…</p>
          )}

          {status === "guest" && <p>请选择入口：</p>}

          {status === "redirecting" && (
            <p className={styles.mutedText}>{getRedirectMessage(profile?.role ?? null)}</p>
          )}

          {status === "error" && (
            <p className={styles.errorMessage}>
              账号已登录，但未配置可用权限，请联系总部管理员。
            </p>
          )}
        </div>
        {(status === "guest" || status === "error") && (
          <nav className={styles.nav}>
            {status === "guest" && <Link href="/login">登录</Link>}
            {status === "error" && (
              <button
                type="button"
                onClick={handleSignOut}
                className={styles.navButton}
              >
                退出登录
              </button>
            )}
          </nav>
        )}
      </main>
    </div>
  );
}
