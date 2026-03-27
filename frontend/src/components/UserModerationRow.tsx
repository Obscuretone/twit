'use client';

import { updateAdminUser } from "@/actions/admin";
import { useState } from "react";

export default function UserModerationRow({ user }: { user: any }) {
  const [isAdmin, setIsAdmin] = useState(user.is_admin);
  const [isBanned, setIsBanned] = useState(user.is_banned);
  const [loading, setLoading] = useState(false);

  const handleToggleAdmin = async () => {
    setLoading(true);
    const result = await updateAdminUser(user.id, { is_admin: !isAdmin });
    if (result.success) setIsAdmin(!isAdmin);
    setLoading(false);
  };

  const handleToggleBanned = async () => {
    setLoading(true);
    const result = await updateAdminUser(user.id, { is_banned: !isBanned });
    if (result.success) setIsBanned(!isBanned);
    setLoading(false);
  };

  return (
    <tr style={{ borderBottom: '1px solid #333639' }}>
      <td style={{ padding: '10px' }}>{user.username}</td>
      <td style={{ padding: '10px' }}>{user.email}</td>
      <td style={{ padding: '10px' }}>{isAdmin ? 'Yes' : 'No'}</td>
      <td style={{ padding: '10px' }}>{isBanned ? 'Banned' : 'Active'}</td>
      <td style={{ padding: '10px' }}>
        <button onClick={handleToggleAdmin} disabled={loading} style={{ marginRight: '10px' }}>
          {isAdmin ? 'Revoke Admin' : 'Make Admin'}
        </button>
        <button onClick={handleToggleBanned} disabled={loading} style={{ backgroundColor: isBanned ? '#1d9bf0' : '#f4212e', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px' }}>
          {isBanned ? 'Unban' : 'Ban'}
        </button>
      </td>
    </tr>
  );
}
