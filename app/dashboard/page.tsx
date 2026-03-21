"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
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

function WelcomeBrandMark() {
  return (
    <div className={styles.welcomeImageSlot} aria-hidden>
      <Image
        src="/brand-zuolinyouguo.png"
        alt=""
        fill
        sizes="64px"
        className={styles.welcomeLogo}
        priority
      />
    </div>
  );
}

type LinkedSelfEmployee = { name: string | null; emp_no: string | null } | null;

export default function DashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile>(null);
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [linkedSelfEmployee, setLinkedSelfEmployee] = useState<LinkedSelfEmployee>(null);

  useEffect(() => {
    (async () => {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user ?? null;
      if (!user) {
        setLoggedIn(false);
        setProfile(null);
        setLinkedSelfEmployee(null);
        setLoading(false);
        return;
      }
      setLoggedIn(true);
      const { data: profileData } = await supabase
        .from("users_profile")
        .select("role, store_id")
        .eq("user_id", user.id)
        .maybeSingle();
      const nextProfile: Profile = profileData
        ? { role: profileData.role ?? null, store_id: profileData.store_id ?? null }
        : null;
      setProfile(nextProfile);

      if (nextProfile?.role === "store_manager" && nextProfile.store_id) {
        const { data: empRow } = await supabase
          .from("employees")
          .select("name, emp_no")
          .eq("user_id", user.id)
          .maybeSingle();
        setLinkedSelfEmployee(empRow ?? null);
      } else {
        setLinkedSelfEmployee(null);
      }

      setLoading(false);
    })();
  }, []);

  const tiles: ModuleTile[] = useMemo(() => {
    if (isStoreManager(profile)) {
      return [
        {
          key: "employees-new",
          title: "员工入职",
          description: "先建档：含店长本人，勾选绑定登录账号后再投保与录工时",
          href: "/employees/new",
        },
        {
          key: "insurance-request",
          title: "投保申请",
          description: "为新员工提交意外险（本人需先完成建档与投保）",
          href: "/insurance-request",
        },
        {
          key: "workdays",
          title: "录入工作天数",
          description: "已投保员工（含本人）录入本月工时，供财务算薪",
          href: "/workdays",
        },
        {
          key: "payroll-verify",
          title: "薪资核对",
          description: "审核本店当月工资，供财务确认提交",
          href: "/payroll-verify",
        },
        {
          key: "store-staff",
          title: "门店人员配置",
          description: "管理本店员工池，配置可调用员工",
          href: "/store-staff",
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
        {
          key: "store-staff",
          title: "门店人员配置",
          description: "查看与管理门店员工池",
          href: "/store-staff",
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
            <WelcomeBrandMark />
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
            <WelcomeBrandMark />
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
          <WelcomeBrandMark />
        </header>

        <div className={styles.intro}>
          <h1>工作台</h1>
          <p>当前角色：{roleLabel}</p>
        </div>

        {isStoreManager(profile) ? (
          linkedSelfEmployee ? (
            <div className={`${styles.managerFlow} ${styles.managerFlowOk}`} role="status">
              <div className={styles.managerFlowTitle}>店长本人档案已绑定</div>
              <p style={{ margin: 0, color: "var(--muted-foreground)" }}>
                {linkedSelfEmployee.name ?? "—"}（工号 {linkedSelfEmployee.emp_no ?? "—"}）· 可按顺序完成投保、录工时、薪资核对。
              </p>
            </div>
          ) : (
            <div className={`${styles.managerFlow} ${styles.managerFlowWarn}`} role="region" aria-label="店长流程">
              <div className={styles.managerFlowTitle}>店长标准流程（参与本人考勤与工资）</div>
              <ol>
                <li>
                  在「员工入职」填写<strong>本人</strong>信息，勾选「将本条档案绑定为当前登录账号」。
                </li>
                <li>在「投保申请」为本人提交意外险，待总部处理。</li>
                <li>在「录入工作天数」选择本人（需已投保）录入工时。</li>
                <li>财务算薪后，在「薪资核对」审核本店数据。</li>
              </ol>
              <p style={{ margin: "0.75rem 0 0 0", fontSize: "0.875rem" }}>
                <Link href="/employees/new" className="btn btn-primary btn-sm" style={{ display: "inline-flex" }}>
                  去员工入职
                </Link>
              </p>
            </div>
          )
        ) : null}

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

