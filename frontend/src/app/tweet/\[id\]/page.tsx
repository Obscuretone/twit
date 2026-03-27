import styles from "../../page.module.css";
import { getTweetThread } from "../../../actions/tweets";
import { getSession } from "../../../actions/auth";
import TweetForm from "../../../components/TweetForm";
import TweetList from "../../../components/TweetList";

export default async function TweetPage({ params }: { params: { id: string } }) {
  const { id } = await params;
  const thread = await getTweetThread(id);
  const user = await getSession();

  if (!thread) {
    return (
      <div className={styles.page}>
        <main className={styles.main}>
          <h1>Tweet not found</h1>
          <a href="/" className={styles.link}>Go Home</a>
        </main>
      </div>
    );
  }

  const { tweet, replies } = thread;
  const S3_URL = process.env.NEXT_PUBLIC_S3_PUBLIC_URL || "http://localhost:9000/twit-media";

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <a href="/" className={styles.logo}>Twit</a>
        {user && <span className={styles.userInfo}>@{user.username}</span>}
      </header>
      <main className={styles.main}>
        <div className={styles.tweetDetail}>
          <div className={styles.tweetHeader}>
            <span className={styles.displayName}>{tweet.display_name || tweet.username}</span>
            <a href={`/${tweet.username}`} className={styles.username}>@{tweet.username}</a>
          </div>
          <p className={styles.tweetDetailContent}>{tweet.content}</p>
          {tweet.media_url && (
            <div className={styles.tweetDetailMedia}>
              <img src={`${S3_URL}/${tweet.media_url}`} alt="Tweet media" className={styles.detailMediaImage} />
            </div>
          )}
          <div className={styles.tweetTime}>
            {new Date(tweet.created_at).toLocaleString()}
          </div>
          <div className={styles.tweetStats}>
            <span><strong>{tweet.retweet_count || 0}</strong> Retweets</span>
            <span><strong>{tweet.like_count || 0}</strong> Likes</span>
          </div>
        </div>

        {user && (
          <div className={styles.replyBox}>
            <TweetForm parentId={id} />
          </div>
        )}

        <div className={styles.replies}>
          <h2>Replies</h2>
          <TweetList tweets={replies} />
        </div>
      </main>
    </div>
  );
}
