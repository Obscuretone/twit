import { getAdminStats } from "@/actions/admin";
import styles from "../page.module.css";

export default async function AdminDashboard() {
  const stats = await getAdminStats();

  if (!stats) return <div>Failed to load stats</div>;

  return (
    <div>
      <h1 style={{ marginBottom: '20px' }}>Dashboard Overview</h1>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '40px' }}>
        <div style={{ padding: '20px', border: '1px solid #333639', borderRadius: '8px' }}>
          <h3>Total Users</h3>
          <p style={{ fontSize: '32px', fontWeight: 'bold' }}>{stats.totals.users}</p>
        </div>
        <div style={{ padding: '20px', border: '1px solid #333639', borderRadius: '8px' }}>
          <h3>Total Tweets</h3>
          <p style={{ fontSize: '32px', fontWeight: 'bold' }}>{stats.totals.tweets}</p>
        </div>
        <div style={{ padding: '20px', border: '1px solid #333639', borderRadius: '8px' }}>
          <h3>Total Likes</h3>
          <p style={{ fontSize: '32px', fontWeight: 'bold' }}>{stats.totals.likes}</p>
        </div>
      </div>

      <h2>Activity (Last 24 Hours)</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px', marginTop: '20px' }}>
        <div style={{ padding: '20px', border: '1px solid #333639', borderRadius: '8px' }}>
          <h3>New Users</h3>
          <p style={{ fontSize: '24px' }}>{stats.last24h.newUsers}</p>
        </div>
        <div style={{ padding: '20px', border: '1px solid #333639', borderRadius: '8px' }}>
          <h3>New Tweets</h3>
          <p style={{ fontSize: '24px' }}>{stats.last24h.newTweets}</p>
        </div>
      </div>
    </div>
  );
}
