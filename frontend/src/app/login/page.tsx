import styles from "../page.module.css";
import { login } from "../../actions/auth";

export default function Login() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.authBox}>
          <h1>Log in to Twit</h1>
          <form action={login} className={styles.form}>
            <input type="text" name="identifier" placeholder="Username or email" required />
            <input type="password" name="password" placeholder="Password" required />
            <button type="submit" className={styles.loginButton}>Log In</button>
          </form>
          <div className={styles.action}>
            <p>Don't have an account? <a href="/signup" className={styles.link}>Sign up</a></p>
          </div>
        </div>
      </main>
    </div>
  );
}
