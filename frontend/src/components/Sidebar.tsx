import styles from "../app/page.module.css";
import { getTrending } from "../actions/search";

export default async function Sidebar() {
  const trending = await getTrending();

  return (
    <aside className={styles.sidebar}>
      <div className={styles.searchBox}>
        <form action="/search" method="GET" className={styles.searchForm}>
          <input type="text" name="q" placeholder="Search Twit" className={styles.searchInput} required />
          <button type="submit" style={{ display: 'none' }}>Search</button>
        </form>
      </div>

      <div className={styles.trendingCard}>
        <h2>What's happening</h2>
        {trending.length === 0 ? (
          <p className={styles.noTrending}>No trends yet.</p>
        ) : (
          trending.map((trend: any) => (
            <a key={trend.tag} href={`/search?q=${trend.tag}`} className={styles.trendItem}>
              <span className={styles.trendName}>#{trend.tag}</span>
              <span className={styles.trendCount}>{trend.tweet_count} Tweets</span>
            </a>
          ))
        )}
      </div>
    </aside>
  );
}
