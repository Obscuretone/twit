'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

const API_URL = process.env.API_URL || 'http://backend:4000';

export async function createList(formData: FormData) {
  const name = formData.get('name');
  const description = formData.get('description');
  const isPrivate = formData.get('private') === 'on';
  
  const cookieStore = await cookies();
  const token = cookieStore.get('twit_session')?.value;
  if (!token) return;

  const response = await fetch(`${API_URL}/api/lists`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ name, description, private: isPrivate }),
  });

  if (response.ok) {
    revalidatePath('/lists');
    redirect('/lists');
  }
}

export async function getLists() {
  const cookieStore = await cookies();
  const token = cookieStore.get('twit_session')?.value;
  if (!token) return [];

  try {
    const response = await fetch(`${API_URL}/api/lists`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store'
    });
    if (!response.ok) return [];
    return response.json();
  } catch (err) {
    return [];
  }
}

export async function getListFeed(id: string) {
  const cookieStore = await cookies();
  const token = cookieStore.get('twit_session')?.value;
  if (!token) return [];

  try {
    const response = await fetch(`${API_URL}/api/lists/${id}/tweets`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store'
    });
    if (!response.ok) return [];
    return response.json();
  } catch (err) {
    return [];
  }
}
