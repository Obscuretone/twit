'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

const API_URL = process.env.API_URL || 'http://backend:4000';

export async function toggleBookmark(id: string, hasBookmarked: boolean) {
  const cookieStore = await cookies();
  const token = cookieStore.get('twit_session')?.value;
  if (!token) return;

  const method = hasBookmarked ? 'DELETE' : 'POST';
  const response = await fetch(`${API_URL}/api/tweets/${id}/bookmark`, {
    method,
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (response.ok) {
    revalidatePath('/');
    revalidatePath('/bookmarks');
    revalidatePath(`/tweet/${id}`);
  }
}

export async function getBookmarks() {
  const cookieStore = await cookies();
  const token = cookieStore.get('twit_session')?.value;
  if (!token) return [];

  try {
    const response = await fetch(`${API_URL}/api/bookmarks`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store'
    });
    if (!response.ok) return [];
    return response.json();
  } catch (err) {
    return [];
  }
}
