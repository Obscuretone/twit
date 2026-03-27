import styles from "../page.module.css";
import { getConversations } from "../../actions/messages";
import { getSession } from "../../actions/auth";
import { redirect } from "next/navigation";

export default async function MessagesPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  const conversations = await getConversations();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <a href="/" className={styles.logo}>Twit</a>
        <div className={styles.userInfo}>
          <span>@{user.username}</span>
        </div>
      </header>
      <main className={styles.main}>
        <h1>Messages</h1>
        <div className={styles.conversationList}>
          {conversations.length === 0 ? (
            <p className={styles.noTweets}>No messages yet.</p>
          ) : (
            conversations.map((c: any) => (
              <a key={c.contact_id} href={`/messages/${c.username}`} className={styles.conversationCard}>
                <div className={styles.conversationHeader}>
                  <span className={styles.displayName}>{c.display_name || c.username}</span>
                  <span className={styles.username}>@{c.username}</span>
                  <span className={styles.dot}>·</span>
                  <span className={styles.time}>{new Date(c.last_message_at).toLocaleDateString()}</span>
                </div>
                <p className={styles.lastMessage}>{c.last_message}</p>
              </a>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
