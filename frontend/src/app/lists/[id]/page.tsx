import styles from "../../page.module.css";
import { getListFeed } from "../../../actions/lists";
import { getSession } from "../../../actions/auth";
import TweetList from "../../../components/TweetList";
import Sidebar from "../../../components/Sidebar";
import { redirect } from "next/navigation";

export default async function ListFeedPage({ params }: { params: { id: string } }) {
  const { id } = await params;
  const user = await getSession();
  if (!user) redirect("/login");

  const tweets = await getListFeed(id);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <a href="/lists" className={styles.logo}>← Back to Lists</a>
        <div className={styles.userInfo}>
          <span>List Feed</span>
        </div>
      </header>
      <div className={styles.layout}>
        <main className={styles.main}>
          <TweetList tweets={tweets} />
        </main>
        <Sidebar />
      </div>
    </div>
  );
}
