'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

const API_URL = process.env.API_URL || 'http://backend:4000';

export async function sendMessage(formData: FormData) {
  const receiver_username = formData.get('receiver_username');
  const content = formData.get('content');
  const cookieStore = await cookies();
  const token = cookieStore.get('twit_session')?.value;

  if (!token || !receiver_username || !content) return;

  const response = await fetch(`${API_URL}/api/messages`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ receiver_username, content }),
  });

  if (response.ok) {
    revalidatePath(`/messages/${receiver_username}`);
  }
}

export async function getConversations() {
  const cookieStore = await cookies();
  const token = cookieStore.get('twit_session')?.value;
  if (!token) return [];

  try {
    const response = await fetch(`${API_URL}/api/messages`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store'
    });
    if (!response.ok) return [];
    return response.json();
  } catch (err) {
    return [];
  }
}

export async function getMessages(username: string) {
  const cookieStore = await cookies();
  const token = cookieStore.get('twit_session')?.value;
  if (!token) return [];

  try {
    const response = await fetch(`${API_URL}/api/messages/${username}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store'
    });
    if (!response.ok) return [];
    return response.json();
  } catch (err) {
    return [];
  }
}
