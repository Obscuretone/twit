import { getSession } from "@/actions/auth";
import { redirect } from "next/navigation";
import styles from "../page.module.css";
import React from "react";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!user || !user.is_admin) {
    redirect("/");
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.logo}>Twit Admin</div>
        <div className={styles.userInfo}>
          <span>@{user.username}</span>
          <a href="/" className={styles.link}>Exit Admin</a>
        </div>
      </header>

      <div className={styles.layout}>
        <aside className={styles.sidebar} style={{ borderRight: '1px solid #333639' }}>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '20px' }}>
            <a href="/admin" className={styles.link}>Dashboard Stats</a>
            <a href="/admin/users" className={styles.link}>Manage Users</a>
            <a href="/admin/tweets" className={styles.link}>Moderate Tweets</a>
          </nav>
        </aside>
        <main className={styles.main} style={{ borderLeft: 'none' }}>
          {children}
        </main>
      </div>
    </div>
  );
}
