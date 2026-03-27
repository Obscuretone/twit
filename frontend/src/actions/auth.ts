'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const API_URL = process.env.API_URL || 'http://backend:4000';

export async function signup(formData: FormData) {
  const username = formData.get('username');
  const email = formData.get('email');
  const password = formData.get('password');

  const response = await fetch(`${API_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password }),
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('Signup failed:', error);
    // In a real app, you'd handle this better (e.g. by passing back state)
    // but for now we'll just redirect to the home page or error page.
    return redirect('/signup?error=signup_failed');
  }

  const { token } = await response.json();
  const cookieStore = await cookies();
  cookieStore.set('twit_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24, // 1 day
  });

  redirect('/');
}

export async function login(formData: FormData) {
  const identifier = formData.get('identifier');
  const password = formData.get('password');

  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('Login failed:', error);
    return redirect('/login?error=invalid_credentials');
  }

  const { token } = await response.json();
  const cookieStore = await cookies();
  cookieStore.set('twit_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24, // 1 day
  });

  redirect('/');
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete('twit_session');
  redirect('/');
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get('twit_session')?.value;
  if (!token) return null;

  try {
    const response = await fetch(`${API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    return response.json();
  } catch (err) {
    return null;
  }
}
