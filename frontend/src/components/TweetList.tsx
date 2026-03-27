import styles from "../app/page.module.css";
import { likeTweet, retweetTweet } from "../actions/engagement";

interface Tweet {
  id: string;
  content: string;
  username: string;
  display_name: string;
  created_at: string;
  reply_count?: number;
  retweet_count?: number;
  like_count?: number;
  has_liked?: boolean;
  has_retweeted?: boolean;
  media_url?: string;
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
            
            <form action={async () => {
              'use server';
              await retweetTweet(tweet.id, !!tweet.has_retweeted);
            }}>
              <button type="submit" className={`${styles.engagementButton} ${tweet.has_retweeted ? styles.retweeted : ''}`}>
                🔁 {tweet.retweet_count || 0}
              </button>
            </form>

            <form action={async () => {
              'use server';
              await likeTweet(tweet.id, !!tweet.has_liked);
            }}>
              <button type="submit" className={`${styles.engagementButton} ${tweet.has_liked ? styles.liked : ''}`}>
                {tweet.has_liked ? '❤️' : '🤍'} {tweet.like_count || 0}
              </button>
            </form>
          </div>
        </div>
      ))}
    </div>
  );
}
