import { getAdminUsers } from "@/actions/admin";
import UserModerationRow from "@/components/UserModerationRow";

export default async function AdminUsersPage({ searchParams }: { searchParams: { q?: string } }) {
  const { q } = await searchParams;
  const users = await getAdminUsers(q);

  return (
    <div>
      <h1 style={{ marginBottom: '20px' }}>User Management</h1>
      
      <form action="/admin/users" method="GET" style={{ marginBottom: '20px' }}>
        <input 
          type="text" 
          name="q" 
          placeholder="Search by username or email..." 
          defaultValue={q}
          style={{ padding: '8px', width: '300px', borderRadius: '4px', border: '1px solid #333639', background: 'transparent', color: 'white' }}
        />
        <button type="submit" style={{ padding: '8px 16px', marginLeft: '10px' }}>Search</button>
      </form>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #333639', textAlign: 'left' }}>
            <th style={{ padding: '10px' }}>Username</th>
            <th style={{ padding: '10px' }}>Email</th>
            <th style={{ padding: '10px' }}>Admin</th>
            <th style={{ padding: '10px' }}>Status</th>
            <th style={{ padding: '10px' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user: any) => (
            <UserModerationRow key={user.id} user={user} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
