'use client';

import { useRealtime } from './RealtimeProvider';
import styles from '../app/page.module.css';

export default function FeedRefreshButton() {
  const { newFeedAvailable, clearFeedAvailable } = useRealtime();

  if (!newFeedAvailable) return null;

  return (
    <button 
      onClick={() => {
        clearFeedAvailable();
        window.location.reload();
      }}
      className={styles.refreshButton}
    >
      Show new tweets
    </button>
  );
}
