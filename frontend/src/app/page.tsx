import styles from "./page.module.css";
import { getSession, logout } from "../actions/auth";

export default async function Home() {
  const user = await getSession();

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.twitHeader}>
          <h1>{user ? `Welcome back, @${user.username}` : "Welcome to Twit"}</h1>
          <p>The massively scalable, privacy-focused microblogging platform.</p>
        </div>

        <div className={styles.authBox}>
          {user ? (
            <div className={styles.action}>
              <h2>You're logged in.</h2>
              <p>User ID: {user.id}</p>
              <form action={logout}>
                <button type="submit" className={styles.loginButton}>Log Out</button>
              </form>
            </div>
          ) : (
            <>
              <div className={styles.action}>
                <h2>Join Twit today.</h2>
                <a href="/signup" className={styles.signupButton}>Create Account</a>
              </div>
              <div className={styles.action}>
                <h3>Already have an account?</h3>
                <a href="/login" className={styles.loginButton}>Sign In</a>
              </div>
            </>
          )}
        </div>
      </main>

      <footer className={styles.footer}>
        <p>&copy; 2026 Twit. Dark Web Friendly.</p>
      </footer>
    </div>
  );
}
