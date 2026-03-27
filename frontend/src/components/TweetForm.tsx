import { postTweet } from "../actions/tweets";
import styles from "../app/page.module.css";

export default function TweetForm() {
  return (
    <form action={postTweet} className={styles.tweetForm}>
      <textarea 
        name="content" 
        placeholder="What is happening?!" 
        maxLength={280} 
        required 
        className={styles.textarea}
      />
      <button type="submit" className={styles.signupButton}>Post</button>
    </form>
  );
}
