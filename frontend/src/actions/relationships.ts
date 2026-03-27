'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

const API_URL = process.env.API_URL || 'http://backend:4000';

export async function blockUser(username: string, isBlocked: boolean) {
  const cookieStore = await cookies();
  const token = cookieStore.get('twit_session')?.value;
  if (!token) return;

  const method = isBlocked ? 'DELETE' : 'POST';
  const response = await fetch(`${API_URL}/api/users/${username}/block`, {
    method,
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (response.ok) {
    revalidatePath(`/${username}`);
    revalidatePath(`/`);
  }
}

export async function muteUser(username: string, isMuted: boolean) {
  const cookieStore = await cookies();
  const token = cookieStore.get('twit_session')?.value;
  if (!token) return;

  const method = isMuted ? 'DELETE' : 'POST';
  const response = await fetch(`${API_URL}/api/users/${username}/mute`, {
    method,
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (response.ok) {
    revalidatePath(`/${username}`);
    revalidatePath(`/`);
  }
}
