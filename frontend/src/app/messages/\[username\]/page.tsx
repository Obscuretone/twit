import styles from "../../page.module.css";
import { getMessages, sendMessage } from "../../../actions/messages";
import { getSession } from "../../../actions/auth";
import { redirect } from "next/navigation";

export default async function MessageThreadPage({ params }: { params: { username: string } }) {
  const { username } = await params;
  const user = await getSession();
  if (!user) redirect("/login");

  const messages = await getMessages(username);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <a href="/messages" className={styles.logo}>← Back to Messages</a>
        <div className={styles.userInfo}>
          <span>Chatting with @{username}</span>
        </div>
      </header>
      <main className={styles.main}>
        <div className={styles.messageThread}>
          {messages.map((m: any) => (
            <div key={m.id} className={`${styles.messageBubble} ${m.sender_id === user.id ? styles.sent : styles.received}`}>
              <p>{m.content}</p>
              <span className={styles.messageTime}>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          ))}
        </div>

        <div className={styles.messageFormBox}>
          <form action={sendMessage} className={styles.messageForm}>
            <input type="hidden" name="receiver_username" value={username} />
            <textarea name="content" placeholder="Start a new message" required className={styles.textarea} style={{ height: '60px' }} />
            <button type="submit" className={styles.signupButton}>Send</button>
          </form>
        </div>
      </main>
    </div>
  );
}
