'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

const API_URL = process.env.API_URL || 'http://backend:4000';

export async function postTweet(formData: FormData) {
  const cookieStore = await cookies();
  const token = cookieStore.get('twit_session')?.value;

  if (!token) return;

  const response = await fetch(`${API_URL}/api/tweets`, {
    method: 'POST',
    headers: { 
      'Authorization': `Bearer ${token}`
      // Note: Don't set Content-Type, let the browser set it for FormData
    },
    body: formData,
  });

  if (response.ok) {
    const tweet = await response.json();
    revalidatePath('/');
    if (tweet.parent_tweet_id) {
      revalidatePath(`/tweet/${tweet.parent_tweet_id}`);
    }
  }
}

export async function getTweetThread(id: string) {
  try {
    const response = await fetch(`${API_URL}/api/tweets/${id}`, { cache: 'no-store' });
    if (!response.ok) return null;
    return response.json();
  } catch (err) {
    console.error('Failed to fetch tweet thread:', err);
    return null;
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
