import styles from "./page.module.css";
import { getSession, logout } from "../actions/auth";
import { getTweets } from "../actions/tweets";
import TweetForm from "../components/TweetForm";
import TweetList from "../components/TweetList";

export default async function Home() {
  const user = await getSession();
  const tweets = await getTweets();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.logo}>Twit</div>
        {user && (
          <div className={styles.userInfo}>
            <span>@{user.username}</span>
            <form action={logout}>
              <button type="submit" className={styles.logoutLink}>Log Out</button>
            </form>
          </div>
        )}
      </header>

      <main className={styles.main}>
        {user ? (
          <>
            <TweetForm />
            <TweetList tweets={tweets} />
          </>
        ) : (
          <div className={styles.hero}>
            <div className={styles.twitHeader}>
              <h1>Welcome to Twit</h1>
              <p>The massively scalable, privacy-focused microblogging platform.</p>
            </div>

            <div className={styles.authBox}>
              <div className={styles.action}>
                <h2>Join Twit today.</h2>
                <a href="/signup" className={styles.signupButton}>Create Account</a>
              </div>
              <div className={styles.action}>
                <h3>Already have an account?</h3>
                <a href="/login" className={styles.loginButton}>Sign In</a>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className={styles.footer}>
        <p>&copy; 2026 Twit. Dark Web Friendly.</p>
      </footer>
    </div>
  );
}
