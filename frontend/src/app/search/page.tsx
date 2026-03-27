import styles from "../page.module.css";
import { search } from "../../actions/search";
import TweetList from "../../components/TweetList";
import Sidebar from "../../components/Sidebar";
import SearchFilters from "../../components/SearchFilters";

export default async function SearchPage({ searchParams }: { searchParams: { q?: string, type?: string, from?: string, since?: string, until?: string, min_likes?: string, has_media?: string } }) {
  const { q, type, ...filters } = await searchParams;
  const results = q ? await search(q, (type as any) || 'tweets', filters) : [];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <a href="/" className={styles.logo}>Twit</a>
      </header>
      <div className={styles.layout}>
        <main className={styles.main}>
          <div className={styles.searchHeader}>
            <h1>Search results for "{q}"</h1>
            <div className={styles.tabs}>
              <a href={`/search?q=${q}&type=tweets`} className={type !== 'users' ? styles.activeTab : ''}>Tweets</a>
              <a href={`/search?q=${q}&type=users`} className={type === 'users' ? styles.activeTab : ''}>Users</a>
            </div>
          </div>

          {type === 'users' ? (
            <div className={styles.userList}>
              {results.length === 0 ? (
                <p className={styles.noTweets}>No users found.</p>
              ) : (
                results.map((u: any) => (
                  <div key={u.id} className={styles.userCard}>
                    <div className={styles.userInfo}>
                      <span className={styles.displayName}>{u.display_name || u.username}</span>
                      <a href={`/${u.username}`} className={styles.username}>@{u.username}</a>
                    </div>
                    <p className={styles.bio}>{u.bio}</p>
                  </div>
                ))
              )}
            </div>
          ) : (
            <TweetList tweets={results} />
          )}
        </main>
        <div className={styles.sidebarColumn}>
          <Sidebar />
          {q && type !== 'users' && <SearchFilters query={q} currentFilters={filters} />}
        </div>
      </div>
    </div>
  );
}
