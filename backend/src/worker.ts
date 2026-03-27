import { consumeQueue } from './queue';
import db from './db';
import cache from './cache';

export async function startWorker() {
  console.log('Starting background workers...');

  // Mention Processing
  consumeQueue('mentions', async (data) => {
    const { tweet_id, username, mentioner } = data;
    console.log(`Processing mention: @${username} in tweet ${tweet_id} by @${mentioner}`);
    const user = await db('users').where('username', username).first();
    if (user) {
      console.log(`User ${username} found! Notification queued.`);
    }
  });

  // Feed Fan-out
  consumeQueue('feeds', async (data) => {
    const { tweet_id, user_id, type } = data;
    if (type === 'fan_out') {
      console.log(`Fanning out tweet ${tweet_id} from user ${user_id}`);
      
      // 1. Get all followers
      const followers = await db('follows').where('following_id', user_id).select('follower_id');
      
      // 2. Update their pre-computed feeds in Memcached
      for (const follower of followers) {
        const cacheKey = `feed_${follower.follower_id}`;
        const cachedFeed = await cache.get(cacheKey);
        let feed = [];
        if (cachedFeed && cachedFeed.value) {
          feed = JSON.parse(cachedFeed.value.toString());
        }
        
        // Add new tweet to the top and keep last 100
        feed.unshift(tweet_id);
        feed = feed.slice(0, 100);
        
        await cache.set(cacheKey, JSON.stringify(feed), { expires: 86400 }); // 1 day
      }
    }
  });
}
