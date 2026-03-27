import styles from "../../page.module.css";
import { getMessages, sendMessage } from "../../../actions/messages";
import { getSession } from "../../../actions/auth";
import { redirect } from "next/navigation";
import MessageThread from "../../../components/MessageThread";

export default async function MessageThreadPage({ params }: { params: { username: string } }) {
  const { username } = await params;
  const user = await getSession();
  if (!user) redirect("/login");

  const { contact, messages } = await getMessages(username);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <a href="/messages" className={styles.logo}>← Back to Messages</a>
        <div className={styles.userInfo}>
          <span>Chatting with @{contact.display_name || contact.username}</span>
        </div>
      </header>
      <main className={styles.main}>
        <MessageThread 
          initialMessages={messages} 
          currentUserId={user.id} 
          contactUsername={contact.username}
          contactId={contact.id}
        />

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
