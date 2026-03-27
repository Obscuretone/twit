import styles from "../page.module.css";
import { getSession, updateProfile } from "../../actions/auth";
import { redirect } from "next/navigation";

export default async function SettingsPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <a href="/" className={styles.logo}>Twit</a>
        <div className={styles.userInfo}>
          <span>@{user.username}</span>
        </div>
      </header>
      <main className={styles.main}>
        <h1>Edit Profile</h1>
        <form action={updateProfile} className={styles.form} encType="multipart/form-data" style={{ maxWidth: '500px' }}>
          <div className={styles.formField}>
            <label>Display Name</label>
            <input type="text" name="display_name" defaultValue={user.display_name} maxLength={50} className={styles.searchInput} />
          </div>
          
          <div className={styles.formField}>
            <label>Bio</label>
            <textarea name="bio" defaultValue={user.bio} maxLength={160} className={styles.textarea} style={{ height: '100px' }} />
          </div>

          <div className={styles.formField}>
            <label>Avatar Image</label>
            <input type="file" name="avatar" accept="image/*" className={styles.fileInput} />
          </div>

          <button type="submit" className={styles.signupButton} style={{ marginTop: '24px' }}>Save Changes</button>
        </form>
      </main>
    </div>
  );
}
