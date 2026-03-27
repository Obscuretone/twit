'use server';

const API_URL = process.env.API_URL || 'http://backend:4000';

export async function search(query: string, type: 'tweets' | 'users' = 'tweets', filters: any = {}) {
  if (!query) return [];
  try {
    let url = `${API_URL}/api/search?q=${encodeURIComponent(query)}&type=${type}`;
    
    if (type === 'tweets') {
      if (filters.from) url += `&from=${encodeURIComponent(filters.from)}`;
      if (filters.since) url += `&since=${encodeURIComponent(filters.since)}`;
      if (filters.until) url += `&until=${encodeURIComponent(filters.until)}`;
      if (filters.min_likes) url += `&min_likes=${filters.min_likes}`;
      if (filters.min_retweets) url += `&min_retweets=${filters.min_retweets}`;
      if (filters.has_media) url += `&has_media=true`;
    }

    const response = await fetch(url, {
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
