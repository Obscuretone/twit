import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from './db';
import cache from './cache';
import { sendToQueue } from './queue';
import multer from 'multer';
import { uploadFile } from './storage';
import { realtimeBroadcaster } from './realtime';

const upload = multer({ storage: multer.memoryStorage() });

const app = express();
const JWT_SECRET: string = process.env.JWT_SECRET || 'supersecretkey_change_in_prod';

app.use(cors());
app.use(express.json());

// TWEETS
app.post('/api/tweets', upload.single('media'), async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.split(' ')[1]!;
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    const { content, parent_tweet_id } = req.body;
    
    if (!content || content.length > 280) {
      return res.status(400).json({ error: 'Invalid content' });
    }

    let media_url = null;
    if (req.file) {
      const key = await uploadFile(req.file);
      media_url = key;
    }

    const [tweet] = await db('tweets').insert({
      user_id: decoded.id,
      content,
      parent_tweet_id: parent_tweet_id || null,
      media_url
    }).returning('*');

    // If it's a reply, increment parent's reply count
    if (parent_tweet_id) {
      await db('tweets').where('id', parent_tweet_id).increment('reply_count', 1);
    }

    // Fan-out to followers (send to queue for processing)
    sendToQueue('feeds', { tweet_id: tweet.id, user_id: decoded.id, type: 'fan_out' });

    // Parse mentions
    const mentions = content.match(/@(\w+)/g);
    if (mentions) {
      mentions.forEach((mention: string) => {
        const username = mention.substring(1);
        sendToQueue('mentions', { tweet_id: tweet.id, username, mentioner: decoded.username });
      });
    }

    // Parse hashtags
    const hashtags = content.match(/#(\w+)/g);
    if (hashtags) {
      hashtags.forEach((tag: string) => {
        sendToQueue('hashtags', { tag: tag.substring(1).toLowerCase() });
      });
    }

    res.status(201).json(tweet);
  } catch (err) {
    console.error('Failed to create tweet:', err);
    res.status(401).json({ error: 'Invalid token' });
  }
});

// BOOKMARKS
app.post('/api/tweets/:id/bookmark', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.split(' ')[1]!;
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    const { id } = req.params;
    await db('bookmarks').insert({ user_id: decoded.id, tweet_id: id })
      .onConflict(['user_id', 'tweet_id']).ignore();
    res.json({ success: true });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.delete('/api/tweets/:id/bookmark', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.split(' ')[1]!;
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    const { id } = req.params;
    await db('bookmarks').where({ user_id: decoded.id, tweet_id: id }).del();
    res.json({ success: true });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.get('/api/bookmarks', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.split(' ')[1]!;
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    const tweets = await db('tweets')
      .join('users', 'tweets.user_id', 'users.id')
      .join('bookmarks', 'tweets.id', 'bookmarks.tweet_id')
      .where('bookmarks.user_id', decoded.id)
      .select('tweets.*', 'users.username', 'users.display_name')
      .select(
        db.raw('EXISTS(SELECT 1 FROM likes WHERE user_id = ? AND tweet_id = tweets.id) as has_liked', [decoded.id]),
        db.raw('EXISTS(SELECT 1 FROM retweets WHERE user_id = ? AND tweet_id = tweets.id) as has_retweeted', [decoded.id]),
        db.raw('1 as has_bookmarked')
      )
      .orderBy('bookmarks.created_at', 'desc');
    res.json(tweets);
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// LISTS
app.post('/api/lists', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.split(' ')[1]!;
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    const { name, description, private: isPrivate } = req.body;
    const [list] = await db('lists').insert({
      owner_id: decoded.id,
      name,
      description,
      private: !!isPrivate
    }).returning('*');
    res.status(201).json(list);
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.get('/api/lists', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.split(' ')[1]!;
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    const lists = await db('lists').where('owner_id', decoded.id).orderBy('created_at', 'desc');
    res.json(lists);
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.get('/api/lists/:id/tweets', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.split(' ')[1]!;
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    const { id } = req.params;

    const tweets = await db('tweets')
      .join('users', 'tweets.user_id', 'users.id')
      .join('list_members', 'tweets.user_id', 'list_members.user_id')
      .where('list_members.list_id', id)
      .select('tweets.*', 'users.username', 'users.display_name')
      .select(
        db.raw('EXISTS(SELECT 1 FROM likes WHERE user_id = ? AND tweet_id = tweets.id) as has_liked', [decoded.id]),
        db.raw('EXISTS(SELECT 1 FROM retweets WHERE user_id = ? AND tweet_id = tweets.id) as has_retweeted', [decoded.id]),
        db.raw('EXISTS(SELECT 1 FROM bookmarks WHERE user_id = ? AND tweet_id = tweets.id) as has_bookmarked', [decoded.id])
      )
      .orderBy('tweets.created_at', 'desc')
      .limit(100);
    
    res.json(tweets);
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.get('/api/tweets', async (req, res) => {
  const authHeader = req.headers.authorization;
  let currentUserId: string | null = null;
  if (authHeader) {
    try {
      const token = authHeader.split(' ')[1]!;
      const decoded: any = jwt.verify(token, JWT_SECRET);
      currentUserId = decoded.id;
    } catch (err) {}
  }

  try {
    const query = db('tweets')
      .join('users', 'tweets.user_id', 'users.id')
      .select('tweets.*', 'users.username', 'users.display_name')
      .whereNull('tweets.parent_tweet_id')
      .orderBy('tweets.created_at', 'desc')
      .limit(100);

    if (currentUserId) {
      // Filter out blocks and mutes
      query.whereNotExists(db.select(1).from('blocks').whereRaw('blocker_id = ? AND blocked_id = tweets.user_id', [currentUserId]));
      query.whereNotExists(db.select(1).from('blocks').whereRaw('blocker_id = tweets.user_id AND blocked_id = ?', [currentUserId]));
      query.whereNotExists(db.select(1).from('mutes').whereRaw('muter_id = ? AND muted_id = tweets.user_id', [currentUserId]));

      query.select(
        db.raw('EXISTS(SELECT 1 FROM likes WHERE user_id = ? AND tweet_id = tweets.id) as has_liked', [currentUserId]),
        db.raw('EXISTS(SELECT 1 FROM retweets WHERE user_id = ? AND tweet_id = tweets.id) as has_retweeted', [currentUserId]),
        db.raw('EXISTS(SELECT 1 FROM bookmarks WHERE user_id = ? AND tweet_id = tweets.id) as has_bookmarked', [currentUserId])
      );
    }

    const tweets = await query;
    res.json(tweets);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// SEARCH
app.get('/api/search', async (req, res) => {
  const q = req.query.q as string;
  const type = req.query.type as string;
  const authHeader = req.headers.authorization;
  let currentUserId: string | null = null;
  if (authHeader) {
    try {
      const token = authHeader.split(' ')[1]!;
      const decoded: any = jwt.verify(token, JWT_SECRET);
      currentUserId = decoded.id;
    } catch (err) {}
  }

  if (!q) return res.json([]);

  try {
    if (type === 'users') {
      const query = db('users')
        .whereRaw("to_tsvector('english', username || ' ' || COALESCE(display_name, '')) @@ plainto_tsquery('english', ?)", [q])
        .select('id', 'username', 'display_name', 'bio', 'avatar_url')
        .limit(20);
      
      if (currentUserId) {
        query.whereNotExists(db.select(1).from('blocks').whereRaw('blocker_id = ? AND blocked_id = users.id', [currentUserId]));
        query.whereNotExists(db.select(1).from('blocks').whereRaw('blocker_id = users.id AND blocked_id = ?', [currentUserId]));
      }

      const users = await query;
      return res.json(users);
    } else {
      const query = db('tweets')
        .join('users', 'tweets.user_id', 'users.id')
        .whereRaw("to_tsvector('english', tweets.content) @@ plainto_tsquery('english', ?)", [q])
        .select('tweets.*', 'users.username', 'users.display_name')
        .orderBy('tweets.created_at', 'desc')
        .limit(50);

      if (currentUserId) {
        query.whereNotExists(db.select(1).from('blocks').whereRaw('blocker_id = ? AND blocked_id = tweets.user_id', [currentUserId]));
        query.whereNotExists(db.select(1).from('blocks').whereRaw('blocker_id = tweets.user_id AND blocked_id = ?', [currentUserId]));
        query.whereNotExists(db.select(1).from('mutes').whereRaw('muter_id = ? AND muted_id = tweets.user_id', [currentUserId]));
      }

      const tweets = await query;
      return res.json(tweets);
    }
  } catch (err) {
    console.error('Search failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// TRENDING
app.get('/api/trending', async (req, res) => {
  try {
    const trending = await db('hashtags')
      .orderBy('tweet_count', 'desc')
      .limit(10);
    res.json(trending);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ENGAGEMENT (Likes & Retweets)
app.post('/api/tweets/:id/like', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.split(' ')[1]!;
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    const { id } = req.params;

    const tweet = await db('tweets').where('id', id).first();
    if (!tweet) return res.status(404).json({ error: 'Tweet not found' });

    await db('likes').insert({
      user_id: decoded.id,
      tweet_id: id
    }).onConflict(['user_id', 'tweet_id']).ignore();

    sendToQueue('engagement', { tweet_id: id, type: 'like', action: 'inc' });
    
    if (tweet.user_id !== decoded.id) {
      sendToQueue('notifications', { user_id: tweet.user_id, from_user_id: decoded.id, tweet_id: id, type: 'like' });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.delete('/api/tweets/:id/like', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.split(' ')[1]!;
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    const { id } = req.params;

    const deleted = await db('likes').where({ user_id: decoded.id, tweet_id: id }).del();
    if (deleted) {
      sendToQueue('engagement', { tweet_id: id, type: 'like', action: 'dec' });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.post('/api/tweets/:id/retweet', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.split(' ')[1]!;
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    const { id } = req.params;

    const tweet = await db('tweets').where('id', id).first();
    if (!tweet) return res.status(404).json({ error: 'Tweet not found' });

    await db('retweets').insert({
      user_id: decoded.id,
      tweet_id: id
    }).onConflict(['user_id', 'tweet_id']).ignore();

    sendToQueue('engagement', { tweet_id: id, type: 'retweet', action: 'inc' });
    
    if (tweet.user_id !== decoded.id) {
      sendToQueue('notifications', { user_id: tweet.user_id, from_user_id: decoded.id, tweet_id: id, type: 'retweet' });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.delete('/api/tweets/:id/retweet', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.split(' ')[1]!;
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    const { id } = req.params;

    const deleted = await db('retweets').where({ user_id: decoded.id, tweet_id: id }).del();
    if (deleted) {
      sendToQueue('engagement', { tweet_id: id, type: 'retweet', action: 'dec' });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// THREADS (Get tweet and its replies)
app.get('/api/tweets/:id', async (req, res) => {
  const { id } = req.params;
  const authHeader = req.headers.authorization;
  let currentUserId: string | null = null;
  if (authHeader) {
    try {
      const token = authHeader.split(' ')[1]!;
      const decoded: any = jwt.verify(token, JWT_SECRET);
      currentUserId = decoded.id;
    } catch (err) {}
  }

  try {
    const tweetQuery = db('tweets')
      .join('users', 'tweets.user_id', 'users.id')
      .where('tweets.id', id)
      .select('tweets.*', 'users.username', 'users.display_name')
      .first();

    const repliesQuery = db('tweets')
      .join('users', 'tweets.user_id', 'users.id')
      .where('tweets.parent_tweet_id', id)
      .select('tweets.*', 'users.username', 'users.display_name')
      .orderBy('tweets.created_at', 'asc');

    if (currentUserId) {
      tweetQuery.select(
        db.raw('EXISTS(SELECT 1 FROM likes WHERE user_id = ? AND tweet_id = tweets.id) as has_liked', [currentUserId]),
        db.raw('EXISTS(SELECT 1 FROM retweets WHERE user_id = ? AND tweet_id = tweets.id) as has_retweeted', [currentUserId])
      );
      repliesQuery.select(
        db.raw('EXISTS(SELECT 1 FROM likes WHERE user_id = ? AND tweet_id = tweets.id) as has_liked', [currentUserId]),
        db.raw('EXISTS(SELECT 1 FROM retweets WHERE user_id = ? AND tweet_id = tweets.id) as has_retweeted', [currentUserId])
      );
    }

    const [tweet, replies] = await Promise.all([tweetQuery, repliesQuery]);
    
    if (!tweet) return res.status(404).json({ error: 'Tweet not found' });

    // Track view asynchronously
    sendToQueue('analytics', { tweet_id: id });

    res.json({ tweet, replies });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PERSONALIZED FEED
app.get('/api/feed', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.split(' ')[1]!;
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    const currentUserId = decoded.id;
    const cacheKey = `feed_${currentUserId}`;
    
    const cachedFeed = await cache.get(cacheKey);
    let tweetIds: string[] = [];
    if (cachedFeed && cachedFeed.value) {
      tweetIds = JSON.parse(cachedFeed.value.toString());
    }

    if (tweetIds.length > 0) {
      const tweets = await db('tweets')
        .join('users', 'tweets.user_id', 'users.id')
        .whereIn('tweets.id', tweetIds)
        .select('tweets.*', 'users.username', 'users.display_name')
        .select(
          db.raw('EXISTS(SELECT 1 FROM likes WHERE user_id = ? AND tweet_id = tweets.id) as has_liked', [currentUserId]),
          db.raw('EXISTS(SELECT 1 FROM retweets WHERE user_id = ? AND tweet_id = tweets.id) as has_retweeted', [currentUserId])
        )
        .orderBy('tweets.created_at', 'desc');
      return res.json(tweets);
    }

    const tweets = await db('tweets')
      .join('users', 'tweets.user_id', 'users.id')
      .join('follows', 'tweets.user_id', 'follows.following_id')
      .where('follows.follower_id', currentUserId)
      .select('tweets.*', 'users.username', 'users.display_name')
      .select(
        db.raw('EXISTS(SELECT 1 FROM likes WHERE user_id = ? AND tweet_id = tweets.id) as has_liked', [currentUserId]),
        db.raw('EXISTS(SELECT 1 FROM retweets WHERE user_id = ? AND tweet_id = tweets.id) as has_retweeted', [currentUserId])
      )
      .orderBy('tweets.created_at', 'desc')
      .limit(100);

    if (tweets.length > 0) {
      const idsToCache = tweets.map((t: any) => t.id);
      cache.set(cacheKey, JSON.stringify(idsToCache), { expires: 86400 });
    }

    res.json(tweets);
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// FOLLOWS
app.post('/api/follow/:username', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.split(' ')[1]!;
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    const { username } = req.params;
    
    const userToFollow = await db('users').where('username', username).first();
    if (!userToFollow) return res.status(404).json({ error: 'User not found' });
    if (userToFollow.id === decoded.id) return res.status(400).json({ error: 'Cannot follow yourself' });

    await db('follows').insert({
      follower_id: decoded.id,
      following_id: userToFollow.id
    }).onConflict(['follower_id', 'following_id']).ignore();

    // Trigger notification
    sendToQueue('notifications', { user_id: userToFollow.id, from_user_id: decoded.id, type: 'follow' });

    res.status(200).json({ success: true });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.delete('/api/follow/:username', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.split(' ')[1]!;
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    const { username } = req.params;

    const userToUnfollow = await db('users').where('username', username).first();
    if (!userToUnfollow) return res.status(404).json({ error: 'User not found' });

    await db('follows')
      .where({ follower_id: decoded.id, following_id: userToUnfollow.id })
      .del();

    res.status(200).json({ success: true });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// RELATIONSHIPS (Blocks & Mutes)
app.post('/api/users/:username/block', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.split(' ')[1]!;
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    const { username } = req.params;

    const userToBlock = await db('users').where('username', username).first();
    if (!userToBlock) return res.status(404).json({ error: 'User not found' });
    if (userToBlock.id === decoded.id) return res.status(400).json({ error: 'Cannot block yourself' });

    await db('blocks').insert({ blocker_id: decoded.id, blocked_id: userToBlock.id })
      .onConflict(['blocker_id', 'blocked_id']).ignore();
    
    // Auto-unfollow both ways
    await db('follows').where({ follower_id: decoded.id, following_id: userToBlock.id }).del();
    await db('follows').where({ follower_id: userToBlock.id, following_id: decoded.id }).del();

    res.json({ success: true });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.delete('/api/users/:username/block', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.split(' ')[1]!;
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    const { username } = req.params;
    const userToUnblock = await db('users').where('username', username).first();
    if (!userToUnblock) return res.status(404).json({ error: 'User not found' });

    await db('blocks').where({ blocker_id: decoded.id, blocked_id: userToUnblock.id }).del();
    res.json({ success: true });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.post('/api/users/:username/mute', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.split(' ')[1]!;
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    const { username } = req.params;
    const userToMute = await db('users').where('username', username).first();
    if (!userToMute) return res.status(404).json({ error: 'User not found' });

    await db('mutes').insert({ muter_id: decoded.id, muted_id: userToMute.id })
      .onConflict(['muter_id', 'muted_id']).ignore();
    res.json({ success: true });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.delete('/api/users/:username/mute', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.split(' ')[1]!;
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    const { username } = req.params;
    const userToUnmute = await db('users').where('username', username).first();
    if (!userToUnmute) return res.status(404).json({ error: 'User not found' });

    await db('mutes').where({ muter_id: decoded.id, muted_id: userToUnmute.id }).del();
    res.json({ success: true });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.get('/api/users/:username', async (req, res) => {
  const { username } = req.params;
  const authHeader = req.headers.authorization;
  let currentUserId: string | null = null;
  if (authHeader) {
    try {
      const token = authHeader.split(' ')[1]!;
      const decoded: any = jwt.verify(token, JWT_SECRET);
      currentUserId = decoded.id;
    } catch (err) {}
  }

  try {
    const user = await db('users')
      .where('username', username)
      .select('id', 'username', 'display_name', 'bio', 'avatar_url', 'created_at')
      .first();
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    // Check if blocked by current user or blocking current user
    if (currentUserId) {
      const block = await db('blocks')
        .where(function() {
          this.where({ blocker_id: currentUserId, blocked_id: user.id })
              .orWhere({ blocker_id: user.id, blocked_id: currentUserId });
        }).first();
      
      if (block) {
        return res.json({ ...user, is_blocked: true, followers_count: 0, following_count: 0 });
      }

      const mute = await db('mutes').where({ muter_id: currentUserId, muted_id: user.id }).first();
      user.is_muted = !!mute;
      
      const follow = await db('follows').where({ follower_id: currentUserId, following_id: user.id }).first();
      user.is_following = !!follow;
    }

    const follows = await db('follows').where('following_id', user.id).count('follower_id as count').first();
    const following = await db('follows').where('follower_id', user.id).count('following_id as count').first();
    
    res.json({ ...user, followers_count: follows?.count, following_count: following?.count });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// NOTIFICATIONS
app.get('/api/notifications', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.split(' ')[1]!;
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    const notifications = await db('notifications')
      .join('users', 'notifications.from_user_id', 'users.id')
      .leftJoin('tweets', 'notifications.tweet_id', 'tweets.id')
      .where('notifications.user_id', decoded.id)
      // Filter out notifications from blocked or muted users
      .whereNotExists(db.select(1).from('blocks').whereRaw('blocker_id = ? AND blocked_id = notifications.from_user_id', [decoded.id]))
      .whereNotExists(db.select(1).from('mutes').whereRaw('muter_id = ? AND muted_id = notifications.from_user_id', [decoded.id]))
      .select('notifications.*', 'users.username as from_username', 'tweets.content as tweet_content')
      .orderBy('notifications.created_at', 'desc')
      .limit(50);
    res.json(notifications);
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// DIRECT MESSAGES
app.post('/api/messages', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.split(' ')[1]!;
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    const { receiver_username, content } = req.body;

    const receiver = await db('users').where('username', receiver_username).first();
    if (!receiver) return res.status(404).json({ error: 'User not found' });

    // Check for block
    const block = await db('blocks')
      .where(function() {
        this.where({ blocker_id: decoded.id, blocked_id: receiver.id })
            .orWhere({ blocker_id: receiver.id, blocked_id: decoded.id });
      }).first();
    
    if (block) return res.status(403).json({ error: 'Cannot message this user' });

    const [message] = await db('messages').insert({
      sender_id: decoded.id,
      receiver_id: receiver.id,
      content
    }).returning('*');

    sendToQueue('direct_messages', { message_id: message.id, sender_id: decoded.id, receiver_id: receiver.id });

    res.status(201).json(message);
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.get('/api/messages', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.split(' ')[1]!;
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    
    // Get unique conversations (users the current user has messaged or received messages from)
    const conversations = await db.raw(`
      SELECT DISTINCT ON (contact_id)
        u.id as contact_id,
        u.username,
        u.display_name,
        m.content as last_message,
        m.created_at as last_message_at
      FROM (
        SELECT 
          CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END as contact_id,
          content,
          created_at
        FROM messages
        WHERE (sender_id = ? OR receiver_id = ?)
        -- Filter out blocked users from conversation list
        AND NOT EXISTS (SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = (CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END)) OR (blocker_id = (CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END) AND blocked_id = ?))
        ORDER BY created_at DESC
      ) m
      JOIN users u ON u.id = m.contact_id
      ORDER BY contact_id, last_message_at DESC
    `, [decoded.id, decoded.id, decoded.id, decoded.id, decoded.id, decoded.id, decoded.id]);

    res.json(conversations.rows);
  } catch (err) {
    console.error('Failed to get conversations:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/messages/:username', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.split(' ')[1]!;
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    const { username } = req.params;

    const contact = await db('users').where('username', username).first();
    if (!contact) return res.status(404).json({ error: 'User not found' });

    const messages = await db('messages')
      .where(function() {
        this.where({ sender_id: decoded.id, receiver_id: contact.id })
            .orWhere({ sender_id: contact.id, receiver_id: decoded.id });
      })
      .orderBy('created_at', 'asc')
      .limit(100);

    res.json({ 
      contact: { id: contact.id, username: contact.username, display_name: contact.display_name },
      messages 
    });

  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.get('/api/realtime/stream', async (req, res) => {
  const authHeader = req.headers.authorization;
  const queryToken = req.query.token as string;
  
  if (!authHeader && !queryToken) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader ? authHeader.split(' ')[1]! : queryToken;
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    const userId = decoded.id;

    const clientId = realtimeBroadcaster.addClient(userId, res);

    req.on('close', () => {
      realtimeBroadcaster.removeClient(clientId);
    });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'backend' });
});

// SIGNUP
app.post('/api/auth/signup', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const password_hash = await bcrypt.hash(password, 10);
    const [user] = await db('users').insert({
      username,
      email,
      password_hash,
      display_name: username // default display name
    }).returning(['id', 'username', 'email']);

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '1d' });
    res.status(201).json({ user, token });
  } catch (err: any) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Username or email already exists' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// LOGIN
app.post('/api/auth/login', async (req, res) => {
  const { identifier, password } = req.body; // identifier can be username or email
  if (!identifier || !password) {
    return res.status(400).json({ error: 'Missing credentials' });
  }

  try {
    const user = await db('users')
      .where('username', identifier)
      .orWhere('email', identifier)
      .first();

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '1d' });
    res.json({
      user: { id: user.id, username: user.username, email: user.email },
      token
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ME (Get current user)
// PROFILE
app.patch('/api/auth/profile', upload.single('avatar'), async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.split(' ')[1]!;
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    const { display_name, bio } = req.body;
    
    let avatar_url = undefined;
    if (req.file) {
      avatar_url = await uploadFile(req.file);
    }

    const updateData: any = {};
    if (display_name !== undefined) updateData.display_name = display_name;
    if (bio !== undefined) updateData.bio = bio;
    if (avatar_url !== undefined) updateData.avatar_url = avatar_url;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No data provided for update' });
    }

    const [user] = await db('users')
      .where('id', decoded.id)
      .update(updateData)
      .returning(['id', 'username', 'display_name', 'bio', 'avatar_url']);

    // Invalidate cache
    const cacheKey = `user_profile_${decoded.id}`;
    await cache.delete(cacheKey);

    res.json(user);
  } catch (err) {
    console.error('Failed to update profile:', err);
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.get('/api/auth/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.split(' ')[1]!;
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    
    // Check cache first
    const cacheKey = `user_profile_${decoded.id}`;
    const cachedValue = await cache.get(cacheKey);
    if (cachedValue && cachedValue.value) {
      return res.json(JSON.parse(cachedValue.value.toString()));
    }

    const user = await db('users').where('id', decoded.id).first();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const userProfile = { id: user.id, username: user.username, email: user.email, display_name: user.display_name };
    
    // Set cache (10 mins)
    await cache.set(cacheKey, JSON.stringify(userProfile), { expires: 600 });

    res.json(userProfile);
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

export default app;
