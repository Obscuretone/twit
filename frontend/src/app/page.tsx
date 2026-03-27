import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.twitHeader}>
          <h1>Welcome to Twit</h1>
          <p>The massively scalable, privacy-focused microblogging platform.</p>
        </div>

        <div className={styles.authBox}>
          <div className={styles.action}>
            <h2>Join Twit today.</h2>
            <button className={styles.signupButton}>Create Account</button>
          </div>
          <div className={styles.action}>
            <h3>Already have an account?</h3>
            <button className={styles.loginButton}>Sign In</button>
          </div>
        </div>
      </main>

      <footer className={styles.footer}>
        <p>&copy; 2026 Twit. Dark Web Friendly.</p>
      </footer>
    </div>
  );
}
