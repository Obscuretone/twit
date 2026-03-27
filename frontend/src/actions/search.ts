'use server';

const API_URL = process.env.API_URL || 'http://backend:4000';

export async function search(query: string, type: 'tweets' | 'users' = 'tweets') {
  if (!query) return [];
  try {
    const response = await fetch(`${API_URL}/api/search?q=${encodeURIComponent(query)}&type=${type}`, {
      cache: 'no-store'
    });
    if (!response.ok) return [];
    return response.json();
  } catch (err) {
    return [];
  }
}

export async function getTrending() {
  try {
    const response = await fetch(`${API_URL}/api/trending`, {
      next: { revalidate: 300 } // Cache for 5 mins
    });
    if (!response.ok) return [];
    return response.json();
  } catch (err) {
    return [];
  }
}
