import styles from "../page.module.css";
import { getUserProfile, followUser, unfollowUser } from "../../actions/follows";
import { getSession } from "../../actions/auth";

export default async function Profile({ params }: { params: { username: string } }) {
  const { username } = await params;
  const profile = await getUserProfile(username);
  const currentUser = await getSession();

  if (!profile) {
    return (
      <div className={styles.page}>
        <main className={styles.main}>
          <h1>User not found</h1>
          <a href="/" className={styles.link}>Go Home</a>
        </main>
      </div>
    );
  }

  const isSelf = currentUser && currentUser.username === username;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <a href="/" className={styles.logo}>Twit</a>
      </header>
      <main className={styles.main}>
        <div className={styles.profileHeader}>
          <div className={styles.profileInfo}>
            <h1>{profile.display_name || profile.username}</h1>
            <p className={styles.username}>@{profile.username}</p>
          </div>
          {!isSelf && currentUser && (
            <form action={async () => {
              'use server';
              // In a real app we'd check if currently following
              // For simplicity, we'll just have a follow button.
              await followUser(username);
            }}>
              <button type="submit" className={styles.signupButton}>Follow</button>
            </form>
          )}
        </div>
        <div className={styles.stats}>
          <span><strong>{profile.following_count || 0}</strong> Following</span>
          <span><strong>{profile.followers_count || 0}</strong> Followers</span>
        </div>
        <div className={styles.bio}>
          <p>{profile.bio || "No bio yet."}</p>
        </div>
      </main>
    </div>
  );
}
