"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import styles from "./page.module.css";

type Profile = { role: string | null; store_id: string | null } | null;

export default function Home() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user ?? null;
      if (!user) {
        setProfile(null);
        setLoading(false);
        return;
      }
      const { data: profileData } = await supabase
        .from("users_profile")
        .select("role, store_id")
        .eq("user_id", user.id)
        .maybeSingle();
      setProfile(
        profileData
          ? { role: profileData.role ?? null, store_id: profileData.store_id ?? null }
          : null
      );
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!profile) return;
    const r = profile.role ?? null;
    if ((r === "store_manager" && profile.store_id) || r === "hq" || r === "finance") {
      router.replace("/dashboard");
      return;
    }
  }, [loading, profile, router]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.refresh();
    setProfile(null);
  };

  const role = profile?.role ?? null;
  const isStoreManager = role === "store_manager" && !!profile?.store_id;
  const isHq = role === "hq";
  const isFinance = role === "finance";
  const hasKnownRole = isStoreManager || isHq || isFinance;

  const navLinks: { href: string; label: string; show: boolean }[] = [
    { href: "/insurance-request", label: "投保申请（店长）", show: isStoreManager },
    { href: "/insurance", label: "投保处理（总部）", show: isHq || isFinance },
    { href: "/employees/new", label: "员工入职", show: isStoreManager },
    { href: "/workdays", label: "工作天数", show: isStoreManager },
    { href: "/payroll", label: "薪酬", show: isHq || isFinance },
  ].filter((item) => item.show);

  if (loading || (profile && hasKnownRole)) {
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
            <p className="muted-text">加载中…</p>
          </div>
        </main>
      </div>
    );
  }

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
          <p>请选择入口：</p>
        </div>
        <nav className={styles.nav}>
          {profile ? (
            <>
              {navLinks.map((item) => (
                <Link key={item.href} href={item.href}>
                  {item.label}
                </Link>
              ))}
              <button
                type="button"
                onClick={handleSignOut}
                className={styles.navButton}
              >
                退出
              </button>
            </>
          ) : (
            <Link href="/login">登录</Link>
          )}
        </nav>
      </main>
    </div>
  );
}
