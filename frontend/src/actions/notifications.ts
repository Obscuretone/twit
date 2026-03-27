'use server';

import { cookies } from 'next/headers';

const API_URL = process.env.API_URL || 'http://backend:4000';

export async function getNotifications() {
  const cookieStore = await cookies();
  const token = cookieStore.get('twit_session')?.value;
  if (!token) return [];

  try {
    const response = await fetch(`${API_URL}/api/notifications`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store'
    });
    if (!response.ok) return [];
    return response.json();
  } catch (err) {
    return [];
  }
}
