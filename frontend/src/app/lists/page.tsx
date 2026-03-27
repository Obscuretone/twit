import styles from "../page.module.css";
import { getLists, createList } from "../../actions/lists";
import { getSession } from "../../actions/auth";
import Sidebar from "../../components/Sidebar";
import { redirect } from "next/navigation";

export default async function ListsPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  const lists = await getLists();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <a href="/" className={styles.logo}>Twit</a>
        <div className={styles.userInfo}>
          <span>@{user.username}</span>
        </div>
      </header>
      <div className={styles.layout}>
        <main className={styles.main}>
          <h1>Lists</h1>
          <div className={styles.createListBox}>
            <h2>Create a new list</h2>
            <form action={createList} className={styles.form}>
              <input type="text" name="name" placeholder="List Name" required className={styles.searchInput} />
              <textarea name="description" placeholder="Description" className={styles.textarea} style={{ height: '60px' }} />
              <label className={styles.checkboxLabel}>
                <input type="checkbox" name="private" /> Private
              </label>
              <button type="submit" className={styles.signupButton}>Create</button>
            </form>
          </div>

          <div className={styles.listContainer}>
            <h2>Your Lists</h2>
            {lists.length === 0 ? (
              <p className={styles.noTweets}>You haven't created any lists yet.</p>
            ) : (
              lists.map((l: any) => (
                <a key={l.id} href={`/lists/${l.id}`} className={styles.conversationCard}>
                  <div className={styles.conversationHeader}>
                    <span className={styles.displayName}>{l.name}</span>
                    {l.private && <span className={styles.dot}>🔒</span>}
                  </div>
                  <p className={styles.lastMessage}>{l.description}</p>
                </a>
              ))
            )}
          </div>
        </main>
        <Sidebar />
      </div>
    </div>
  );
}
