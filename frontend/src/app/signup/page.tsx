import styles from "../page.module.css";
import { signup } from "../../actions/auth";

export default function Signup() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.authBox}>
          <h1>Create your account</h1>
          <form action={signup} className={styles.form}>
            <input type="text" name="username" placeholder="Username" required />
            <input type="email" name="email" placeholder="Email" required />
            <input type="password" name="password" placeholder="Password" required />
            <button type="submit" className={styles.signupButton}>Sign Up</button>
          </form>
          <div className={styles.action}>
            <p>Have an account? <a href="/login" className={styles.link}>Log in</a></p>
          </div>
        </div>
      </main>
    </div>
  );
}
