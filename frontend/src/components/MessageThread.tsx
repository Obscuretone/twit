'use client';

import { useState, useEffect, useRef } from 'react';
import { useRealtime } from './RealtimeProvider';
import styles from '../app/page.module.css';

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
}

export default function MessageThread({ initialMessages, currentUserId, contactUsername, contactId }: { 
  initialMessages: Message[], 
  currentUserId: string,
  contactUsername: string,
  contactId: string 
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const { newDms } = useRealtime();
  const threadEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Filter new messages for this specific conversation
    const relevantDms = newDms.filter(dm => 
      dm.sender_id === contactId || (dm.sender_id === currentUserId && dm.receiver_id === contactId)
    );

    // Add only messages we don't already have
    const existingIds = new Set(messages.map(m => m.id));
    const toAdd = relevantDms.filter(dm => !existingIds.has(dm.id));

    if (toAdd.length > 0) {
      setMessages(prev => [...prev, ...toAdd]);
    }
  }, [newDms, contactId, currentUserId, messages]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className={styles.messageThread}>
      {messages.map((m) => (
        <div key={m.id} className={`${styles.messageBubble} ${m.sender_id === currentUserId ? styles.sent : styles.received}`}>
          <p>{m.content}</p>
          <span className={styles.messageTime}>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      ))}
      <div ref={threadEndRef} />
    </div>
  );
}
