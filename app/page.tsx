import Link from "next/link";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.intro}>
          <h1>HR Mini</h1>
          <p>请选择入口：</p>
        </div>
        <nav className={styles.nav}>
          <Link href="/login" className={styles.primary}>
            登录
          </Link>
          <Link href="/me" className={styles.secondary}>
            我是谁
          </Link>
          <Link href="/insurance-request" className={styles.secondary}>
            投保申请（店长）
          </Link>
          <Link href="/insurance" className={styles.secondary}>
            投保处理（总部）
          </Link>
          <Link href="/employees/new" className={styles.secondary}>
            员工入职
          </Link>
          <Link href="/workdays" className={styles.secondary}>
            工作天数
          </Link>
          <Link href="/payroll" className={styles.secondary}>
            薪酬
          </Link>
        </nav>
      </main>
    </div>
  );
}
