"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import styles from "./page.module.css";

type Profile = { role: string | null; store_id: string | null } | null;

type ModuleTile = {
  key: string;
  title: string;
  description: string;
  href: string;
};

function isStoreManager(profile: Profile): boolean {
  return profile?.role === "store_manager" && !!profile?.store_id;
}

export default function DashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile>(null);
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user ?? null;
      if (!user) {
        setLoggedIn(false);
        setProfile(null);
        setLoading(false);
        return;
      }
      setLoggedIn(true);
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

  const tiles: ModuleTile[] = useMemo(() => {
    if (isStoreManager(profile)) {
      return [
        {
          key: "insurance-request",
          title: "投保申请",
          description: "为新员工提交意外险投保申请",
          href: "/insurance-request",
        },
        {
          key: "employees-new",
          title: "员工入职",
          description: "为门店新员工创建入职信息",
          href: "/employees/new",
        },
        {
          key: "workdays",
          title: "录入工作天数",
          description: "录入员工本月工作天数（需已投保）",
          href: "/workdays",
        },
        {
          key: "payroll-verify",
          title: "薪资核对",
          description: "审核本店当月工资，供财务确认提交",
          href: "/payroll-verify",
        },
      ];
    }
    if (profile?.role === "hq" || profile?.role === "finance") {
      return [
        {
          key: "insurance",
          title: "投保处理",
          description: "录入保单并激活员工投保状态",
          href: "/insurance",
        },
        {
          key: "payroll",
          title: "薪酬管理",
          description: "核对与管理员工薪酬",
          href: "/payroll",
        },
      ];
    }
    return [];
  }, [profile]);

  const roleLabel = useMemo(() => {
    if (isStoreManager(profile)) return "店长";
    if (profile?.role === "hq") return "总部";
    if (profile?.role === "finance") return "财务";
    if (loggedIn) return "未配置";
    return "";
  }, [loggedIn, profile]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.refresh();
    router.replace("/");
  };

  if (loading) {
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
            <h1>工作台</h1>
            <p className="muted-text">加载中…</p>
          </div>
        </main>
      </div>
    );
  }

  if (!loggedIn) {
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
            <h1>工作台</h1>
            <p>请先登录后再进入工作台。</p>
          </div>
          <div className={styles.actions}>
            <Link href="/login" className={styles.primaryLink}>
              去登录
            </Link>
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
          <h1>工作台</h1>
          <p>当前角色：{roleLabel}</p>
        </div>

        {tiles.length > 0 ? (
          <section className={styles.grid} aria-label="可操作模块">
            {tiles.map((t) => (
              <Link key={t.key} href={t.href} className={styles.tile}>
                <div className={styles.tileTitle}>{t.title}</div>
                <div className={styles.tileDesc}>{t.description}</div>
              </Link>
            ))}
          </section>
        ) : (
          <div className={styles.empty}>
            暂无可操作模块，请联系管理员为该账号配置角色。
          </div>
        )}

        <div className={styles.actions}>
          <button type="button" onClick={handleSignOut} className={styles.secondaryButton}>
            退出登录
          </button>
        </div>
      </main>
    </div>
  );
}

