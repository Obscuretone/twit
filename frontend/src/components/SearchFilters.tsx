import styles from "../app/page.module.css";

export default function SearchFilters({ query, currentFilters }: { query: string, currentFilters: any }) {
  return (
    <div className={styles.trendingCard} style={{ marginTop: '20px' }}>
      <h2>Search Filters</h2>
      <form action="/search" method="GET" style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
        <input type="hidden" name="q" value={query} />
        
        <div>
          <label style={{ fontSize: '13px', color: '#71767b' }}>From user</label>
          <input 
            type="text" 
            name="from" 
            placeholder="@username" 
            defaultValue={currentFilters.from}
            style={{ width: '100%', padding: '8px', background: 'transparent', border: '1px solid #333639', color: 'white', borderRadius: '4px' }}
          />
        </div>

        <div>
          <label style={{ fontSize: '13px', color: '#71767b' }}>Since</label>
          <input 
            type="date" 
            name="since" 
            defaultValue={currentFilters.since}
            style={{ width: '100%', padding: '8px', background: 'transparent', border: '1px solid #333639', color: 'white', borderRadius: '4px' }}
          />
        </div>

        <div>
          <label style={{ fontSize: '13px', color: '#71767b' }}>Until</label>
          <input 
            type="date" 
            name="until" 
            defaultValue={currentFilters.until}
            style={{ width: '100%', padding: '8px', background: 'transparent', border: '1px solid #333639', color: 'white', borderRadius: '4px' }}
          />
        </div>

        <div>
          <label style={{ fontSize: '13px', color: '#71767b' }}>Min Likes</label>
          <input 
            type="number" 
            name="min_likes" 
            defaultValue={currentFilters.min_likes}
            style={{ width: '100%', padding: '8px', background: 'transparent', border: '1px solid #333639', color: 'white', borderRadius: '4px' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <input 
            type="checkbox" 
            name="has_media" 
            value="true" 
            defaultChecked={currentFilters.has_media === 'true'}
          />
          <label style={{ fontSize: '14px' }}>Has media</label>
        </div>

        <button type="submit" style={{ padding: '10px', backgroundColor: '#1d9bf0', color: 'white', border: 'none', borderRadius: '20px', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px' }}>
          Apply Filters
        </button>
        <a href={`/search?q=${query}`} style={{ textAlign: 'center', fontSize: '13px', color: '#71767b' }}>Clear all</a>
      </form>
    </div>
  );
}
