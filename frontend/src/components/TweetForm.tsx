import { postTweet } from "../actions/tweets";
import styles from "../app/page.module.css";

export default function TweetForm({ parentId }: { parentId?: string }) {
  return (
    <form action={postTweet} className={styles.tweetForm} encType="multipart/form-data">
      {parentId && <input type="hidden" name="parent_tweet_id" value={parentId} />}
      <textarea 
        name="content" 
        placeholder={parentId ? "Post your reply" : "What is happening?!"} 
        maxLength={280} 
        required 
        className={styles.textarea}
      />
      <div className={styles.tweetFormActions}>
        <input 
          type="file" 
          name="media" 
          accept="image/*" 
          className={styles.fileInput} 
        />
        <button type="submit" className={styles.signupButton}>Post</button>
      </div>
    </form>
  );
}
