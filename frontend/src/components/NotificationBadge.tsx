'use client';

import { useRealtime } from './RealtimeProvider';
import styles from '../app/page.module.css';

export default function NotificationBadge() {
  const { newNotificationsCount } = useRealtime();

  if (newNotificationsCount === 0) return null;

  return (
    <span className={styles.badge}>
      {newNotificationsCount > 9 ? '9+' : newNotificationsCount}
    </span>
  );
}
