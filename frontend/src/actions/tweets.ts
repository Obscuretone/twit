'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

const API_URL = process.env.API_URL || 'http://backend:4000';

export async function postTweet(formData: FormData) {
  const content = formData.get('content');
  const cookieStore = await cookies();
  const token = cookieStore.get('twit_session')?.value;

  if (!token || !content) return;

  const response = await fetch(`${API_URL}/api/tweets`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ content }),
  });

  if (response.ok) {
    revalidatePath('/');
  }
}

export async function getTweets() {
  try {
    const response = await fetch(`${API_URL}/api/tweets`, { cache: 'no-store' });
    if (!response.ok) return [];
    return response.json();
  } catch (err) {
    console.error('Failed to fetch tweets:', err);
    return [];
  }
}

export async function getFeed() {
  const cookieStore = await cookies();
  const token = cookieStore.get('twit_session')?.value;
  if (!token) return [];

  try {
    const response = await fetch(`${API_URL}/api/feed`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store'
    });
    if (!response.ok) return [];
    return response.json();
  } catch (err) {
    console.error('Failed to fetch feed:', err);
    return [];
  }
}
