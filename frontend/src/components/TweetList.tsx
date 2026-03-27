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

  const S3_URL = process.env.NEXT_PUBLIC_S3_PUBLIC_URL || "http://localhost:9000/twit-media";

  return (
    <div className={styles.tweetList}>
      {tweets.map((tweet: any) => (
        <div key={tweet.id} className={styles.tweetCard}>
          <div className={styles.tweetHeader}>
            <span className={styles.displayName}>{tweet.display_name || tweet.username}</span>
            <a href={`/${tweet.username}`} className={styles.username}>@{tweet.username}</a>
            <span className={styles.dot}>·</span>
            <span className={styles.time}>{new Date(tweet.created_at).toLocaleDateString()}</span>
          </div>
          <a href={`/tweet/${tweet.id}`} className={styles.tweetLink}>
            <p className={styles.tweetContent}>{tweet.content}</p>
            {tweet.media_url && (
              <div className={styles.tweetMedia}>
                <img src={`${S3_URL}/${tweet.media_url}`} alt="Tweet media" className={styles.mediaImage} />
              </div>
            )}
          </a>
          <div className={styles.tweetEngagement}>
            <span className={styles.engagementItem}>💬 {tweet.reply_count || 0}</span>
            <span className={styles.engagementItem}>🔁 {tweet.retweet_count || 0}</span>
            <span className={styles.engagementItem}>❤️ {tweet.like_count || 0}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
