import styles from "../app/page.module.css";

interface Tweet {
  id: string;
  content: string;
  username: string;
  display_name: string;
  created_at: string;
}

export default function TweetList({ tweets }: { tweets: Tweet[] }) {
  if (tweets.length === 0) {
    return <p className={styles.noTweets}>No tweets yet. Start the conversation!</p>;
  }

  return (
    <div className={styles.tweetList}>
      {tweets.map((tweet) => (
        <div key={tweet.id} className={styles.tweetCard}>
          <div className={styles.tweetHeader}>
            <span className={styles.displayName}>{tweet.display_name || tweet.username}</span>
            <span className={styles.username}>@{tweet.username}</span>
            <span className={styles.dot}>·</span>
            <span className={styles.time}>{new Date(tweet.created_at).toLocaleDateString()}</span>
          </div>
          <p className={styles.tweetContent}>{tweet.content}</p>
        </div>
      ))}
    </div>
  );
}
