import styles from "../page.module.css";
import { getNotifications } from "../../actions/notifications";
import { getSession } from "../../actions/auth";
import { redirect } from "next/navigation";

export default async function NotificationsPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  const notifications = await getNotifications();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <a href="/" className={styles.logo}>Twit</a>
        <div className={styles.userInfo}>
          <span>@{user.username}</span>
        </div>
      </header>
      <main className={styles.main}>
        <h1>Notifications</h1>
        <div className={styles.notificationList}>
          {notifications.length === 0 ? (
            <p className={styles.noTweets}>No notifications yet.</p>
          ) : (
            notifications.map((n: any) => (
              <div key={n.id} className={styles.tweetCard}>
                <p>
                  <strong>@{n.from_username}</strong> {n.type === 'mention' ? 'mentioned you in a tweet:' : 'followed you.'}
                </p>
                {n.tweet_content && (
                  <p className={styles.tweetContent} style={{ color: '#71767b' }}>
                    "{n.tweet_content}"
                  </p>
                )}
                <span className={styles.time}>{new Date(n.created_at).toLocaleDateString()}</span>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
