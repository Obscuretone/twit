'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

const API_URL = process.env.API_URL || 'http://backend:4000';

export async function likeTweet(id: string, hasLiked: boolean) {
  const cookieStore = await cookies();
  const token = cookieStore.get('twit_session')?.value;
  if (!token) return;

  const method = hasLiked ? 'DELETE' : 'POST';
  const response = await fetch(`${API_URL}/api/tweets/${id}/like`, {
    method,
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (response.ok) {
    revalidatePath('/');
    revalidatePath(`/tweet/${id}`);
  }
}

export async function retweetTweet(id: string, hasRetweeted: boolean) {
  const cookieStore = await cookies();
  const token = cookieStore.get('twit_session')?.value;
  if (!token) return;

  const method = hasRetweeted ? 'DELETE' : 'POST';
  const response = await fetch(`${API_URL}/api/tweets/${id}/retweet`, {
    method,
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (response.ok) {
    revalidatePath('/');
    revalidatePath(`/tweet/${id}`);
  }
}
