'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

const API_URL = process.env.API_URL || 'http://backend:4000';

export async function followUser(username: string) {
  const cookieStore = await cookies();
  const token = cookieStore.get('twit_session')?.value;
  if (!token) return;

  const response = await fetch(`${API_URL}/api/follow/${username}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (response.ok) {
    revalidatePath(`/${username}`);
  }
}

export async function unfollowUser(username: string) {
  const cookieStore = await cookies();
  const token = cookieStore.get('twit_session')?.value;
  if (!token) return;

  const response = await fetch(`${API_URL}/api/follow/${username}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (response.ok) {
    revalidatePath(`/${username}`);
  }
}

export async function getUserProfile(username: string) {
  try {
    const response = await fetch(`${API_URL}/api/users/${username}`, { cache: 'no-store' });
    if (!response.ok) return null;
    return response.json();
  } catch (err) {
    return null;
  }
}
