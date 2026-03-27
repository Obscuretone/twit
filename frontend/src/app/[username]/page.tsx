import styles from "../page.module.css";
import { getUserProfile, followUser, unfollowUser } from "../../actions/follows";
import { getSession } from "../../actions/auth";
import { blockUser, muteUser } from "../../actions/relationships";

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
  const S3_URL = process.env.NEXT_PUBLIC_S3_PUBLIC_URL || "http://localhost:9000/twit-media";

  if (profile.is_blocked && !isSelf) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <a href="/" className={styles.logo}>Twit</a>
        </header>
        <main className={styles.main}>
          <div className={styles.profileHeader}>
            <h1>@{profile.username}</h1>
          </div>
          <div className={styles.blockedMessage}>
            <h2>You are blocked</h2>
            <p>You cannot follow or see @{profile.username}'s tweets.</p>
            <form action={async () => {
              'use server';
              await blockUser(username, true);
            }}>
              <button type="submit" className={styles.loginButton}>Unblock</button>
            </form>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <a href="/" className={styles.logo}>Twit</a>
        {isSelf && <a href="/settings" className={styles.link}>Edit Profile</a>}
      </header>
      <main className={styles.main}>
        <div className={styles.profileHeader}>
          <div className={styles.profileAvatar}>
            {profile.avatar_url ? (
              <img src={`${S3_URL}/${profile.avatar_url}`} alt="Avatar" className={styles.avatarLarge} />
            ) : (
              <div className={styles.avatarPlaceholder} />
            )}
          </div>
          <div className={styles.profileInfo}>
            <h1>{profile.display_name || profile.username}</h1>
            <p className={styles.username}>@{profile.username}</p>
          </div>
          <div className={styles.profileActions}>
            {!isSelf && currentUser && (
              <>
                <form action={async () => {
                  'use server';
                  if (profile.is_following) await unfollowUser(username);
                  else await followUser(username);
                }}>
                  <button type="submit" className={profile.is_following ? styles.loginButton : styles.signupButton}>
                    {profile.is_following ? 'Unfollow' : 'Follow'}
                  </button>
                </form>
                
                <form action={async () => {
                  'use server';
                  await muteUser(username, !!profile.is_muted);
                }}>
                  <button type="submit" className={styles.engagementButton}>
                    {profile.is_muted ? 'Unmute' : 'Mute'}
                  </button>
                </form>

                <form action={async () => {
                  'use server';
                  await blockUser(username, false);
                }}>
                  <button type="submit" className={styles.engagementButton} style={{ color: '#f4212e' }}>
                    Block
                  </button>
                </form>
              </>
            )}
          </div>
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
