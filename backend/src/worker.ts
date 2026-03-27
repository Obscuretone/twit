import { consumeQueue, sendToQueue } from './queue';
import db from './db';
import cache from './cache';

export async function startWorker() {
  console.log('Starting background workers...');

  // 1. Mention Processing -> Notification Trigger
  consumeQueue('mentions', async (data) => {
    const { tweet_id, username, mentioner, mentioner_id } = data;
    console.log(`Processing mention: @${username} by @${mentioner}`);
    const user = await db('users').where('username', username).first();
    if (user) {
      // Find the user_id for the mentioner if not provided
      const from_user = await db('users').where('username', mentioner).first();
      if (from_user) {
        sendToQueue('notifications', { 
          user_id: user.id, 
          from_user_id: from_user.id, 
          tweet_id, 
          type: 'mention' 
        });
      }
    }
  });

  // 2. Feed Fan-out
  consumeQueue('feeds', async (data) => {
    // ... same as before
    const { tweet_id, user_id, type } = data;
    if (type === 'fan_out') {
      const followers = await db('follows').where('following_id', user_id).select('follower_id');
      for (const follower of followers) {
        const cacheKey = `feed_${follower.follower_id}`;
        const cachedFeed = await cache.get(cacheKey);
        let feed = [];
        if (cachedFeed && cachedFeed.value) {
          feed = JSON.parse(cachedFeed.value.toString());
        }
        feed.unshift(tweet_id);
        feed = feed.slice(0, 100);
        await cache.set(cacheKey, JSON.stringify(feed), { expires: 86400 });
      }
    }
  });

  // 3. Notification Persistent Store
  consumeQueue('notifications', async (data) => {
    const { user_id, from_user_id, tweet_id, type } = data;
    console.log(`Creating notification of type ${type} for user ${user_id}`);
    try {
      await db('notifications').insert({
        user_id,
        from_user_id,
        tweet_id,
        type,
        read: false
      });
      // In the future, we could trigger a WebSocket/SSE push here for real-time users.
    } catch (err) {
      console.error('Failed to create notification:', err);
    }
  });

  // 4. Engagement Counts (Async Update)
  consumeQueue('engagement', async (data) => {
    const { tweet_id, type, action } = data; // type: 'like', 'retweet', action: 'inc', 'dec'
    console.log(`Updating ${type} count for tweet ${tweet_id}: ${action}`);
    
    const field = type === 'like' ? 'like_count' : 'retweet_count';
    const amount = action === 'inc' ? 1 : -1;

    try {
      await db('tweets').where('id', tweet_id).increment(field, amount);
    } catch (err) {
      console.error(`Failed to update ${field} for tweet ${tweet_id}:`, err);
    }
  });

  // 5. Hashtag Tracking
  consumeQueue('hashtags', async (data) => {
    const { tag } = data;
    console.log(`Updating hashtag count for: #${tag}`);
    try {
      await db('hashtags')
        .insert({ tag, tweet_count: 1, last_used_at: db.fn.now() })
        .onConflict('tag')
        .merge({
          tweet_count: db.raw('hashtags.tweet_count + 1'),
          last_used_at: db.fn.now()
        });
    } catch (err) {
      console.error(`Failed to update hashtag #${tag}:`, err);
    }
  });

  // 6. Direct Messages
  consumeQueue('direct_messages', async (data) => {
    const { message_id, sender_id, receiver_id } = data;
    console.log(`Delivering message ${message_id} from ${sender_id} to ${receiver_id}`);
    // Future: WebSocket push
  });

  // 7. Analytics (View Counts)
  consumeQueue('analytics', async (data) => {
    const { tweet_id } = data;
    try {
      await db('tweets').where('id', tweet_id).increment('view_count', 1);
    } catch (err) {
      console.error(`Failed to update view count for tweet ${tweet_id}:`, err);
    }
  });
}
