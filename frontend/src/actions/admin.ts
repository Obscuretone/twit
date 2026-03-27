'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

const API_URL = process.env.API_URL || 'http://backend:4000';

async function getAdminToken() {
  const cookieStore = await cookies();
  return cookieStore.get('twit_session')?.value;
}

export async function getAdminStats() {
  const token = await getAdminToken();
  if (!token) return null;

  try {
    const response = await fetch(`${API_URL}/api/admin/stats`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store'
    });
    if (!response.ok) return null;
    return response.json();
  } catch (err) {
    return null;
  }
}

export async function getAdminUsers(q?: string) {
  const token = await getAdminToken();
  if (!token) return [];

  try {
    const url = q ? `${API_URL}/api/admin/users?q=${q}` : `${API_URL}/api/admin/users`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store'
    });
    if (!response.ok) return [];
    return response.json();
  } catch (err) {
    return [];
  }
}

export async function updateAdminUser(id: string, data: { is_admin?: boolean, is_banned?: boolean }) {
  const token = await getAdminToken();
  if (!token) return { error: 'Unauthorized' };

  try {
    const response = await fetch(`${API_URL}/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}` 
      },
      body: JSON.stringify(data),
    });
    if (response.ok) {
      revalidatePath('/admin/users');
      return { success: true };
    }
    return { error: 'Failed to update' };
  } catch (err) {
    return { error: 'Internal server error' };
  }
}

export async function getAdminTweets() {
  const token = await getAdminToken();
  if (!token) return [];

  try {
    const response = await fetch(`${API_URL}/api/admin/tweets`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store'
    });
    if (!response.ok) return [];
    return response.json();
  } catch (err) {
    return [];
  }
}

export async function deleteAdminTweet(id: string) {
  const token = await getAdminToken();
  if (!token) return { error: 'Unauthorized' };

  try {
    const response = await fetch(`${API_URL}/api/admin/tweets/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) {
      revalidatePath('/admin/tweets');
      return { success: true };
    }
    return { error: 'Failed to delete' };
  } catch (err) {
    return { error: 'Internal server error' };
  }
}
