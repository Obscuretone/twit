'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { getRealtimeToken } from '@/actions/auth';

interface RealtimeContextType {
  newNotificationsCount: number;
  newDms: any[];
  newFeedAvailable: boolean;
  clearNotifications: () => void;
  clearFeedAvailable: () => void;
}

const RealtimeContext = createContext<RealtimeContextType | undefined>(undefined);

export const RealtimeProvider = ({ children }: { children: ReactNode }) => {
  const [newNotificationsCount, setNewNotificationsCount] = useState(0);
  const [newDms, setNewDms] = useState<any[]>([]);
  const [newFeedAvailable, setNewFeedAvailable] = useState(false);

  useEffect(() => {
    let eventSource: EventSource | null = null;

    const connect = async () => {
      const token = await getRealtimeToken();
      if (!token) return;

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      eventSource = new EventSource(`${apiUrl}/api/realtime/stream?token=${token}`);

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('Real-time event:', data);

        if (data.type === 'notification') {
          setNewNotificationsCount(prev => prev + 1);
        } else if (data.type === 'dm') {
          setNewDms(prev => [...prev, data.payload]);
        } else if (data.type === 'feed_update') {
          setNewFeedAvailable(true);
        }
      };

      eventSource.onerror = (err) => {
        console.error('EventSource failed:', err);
        eventSource?.close();
        // Try to reconnect after 5 seconds
        setTimeout(connect, 5000);
      };
    };

    connect();

    return () => {
      eventSource?.close();
    };
  }, []);

  const clearNotifications = () => setNewNotificationsCount(0);
  const clearFeedAvailable = () => setNewFeedAvailable(false);

  return (
    <RealtimeContext.Provider value={{ 
      newNotificationsCount, 
      newDms, 
      newFeedAvailable,
      clearNotifications,
      clearFeedAvailable
    }}>
      {children}
    </RealtimeContext.Provider>
  );
};

export const useRealtime = () => {
  const context = useContext(RealtimeContext);
  if (context === undefined) {
    throw new Error('useRealtime must be used within a RealtimeProvider');
  }
  return context;
};
