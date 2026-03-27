'use client';

import { deleteAdminTweet } from "@/actions/admin";
import { useState } from "react";

export default function TweetModerationRow({ tweet }: { tweet: any }) {
  const [deleted, setDeleted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this tweet?')) return;
    setLoading(true);
    const result = await deleteAdminTweet(tweet.id);
    if (result.success) setDeleted(true);
    setLoading(false);
  };

  if (deleted) return null;

  return (
    <div style={{ padding: '15px', borderBottom: '1px solid #333639', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div>
        <p style={{ fontWeight: 'bold', marginBottom: '5px' }}>@{tweet.username}</p>
        <p style={{ fontSize: '15px' }}>{tweet.content}</p>
        <p style={{ fontSize: '12px', color: '#71767b', marginTop: '5px' }}>{new Date(tweet.created_at).toLocaleString()}</p>
      </div>
      <button 
        onClick={handleDelete} 
        disabled={loading}
        style={{ backgroundColor: '#f4212e', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}
      >
        Delete
      </button>
    </div>
  );
}
