import styles from "../page.module.css";
import { getBookmarks } from "../../actions/bookmarks";
import { getSession } from "../../actions/auth";
import TweetList from "../../components/TweetList";
import Sidebar from "../../components/Sidebar";
import { redirect } from "next/navigation";

export default async function BookmarksPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  const tweets = await getBookmarks();

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
          <h1>Bookmarks</h1>
          <TweetList tweets={tweets} />
        </main>
        <Sidebar />
      </div>
    </div>
  );
}
