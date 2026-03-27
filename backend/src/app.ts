import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from './db';
import cache from './cache';
import { sendToQueue } from './queue';
import multer from 'multer';
import { uploadFile } from './storage';

const upload = multer({ storage: multer.memoryStorage() });

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey_change_in_prod';

app.use(cors());
app.use(express.json());

// TWEETS
app.post('/api/tweets', upload.single('media'), async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.split(' ')[1];
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

// SEARCH
app.get('/api/search', async (req, res) => {
  const { q, type } = req.query; // type: 'tweets' or 'users'
  if (!q) return res.json([]);

  try {
    if (type === 'users') {
      const users = await db('users')
        .whereRaw("to_tsvector('english', username || ' ' || COALESCE(display_name, '')) @@ plainto_tsquery('english', ?)", [q])
        .select('id', 'username', 'display_name', 'bio', 'avatar_url')
        .limit(20);
      return res.json(users);
    } else {
      const tweets = await db('tweets')
        .join('users', 'tweets.user_id', 'users.id')
        .whereRaw("to_tsvector('english', tweets.content) @@ plainto_tsquery('english', ?)", [q])
        .select('tweets.*', 'users.username', 'users.display_name')
        .orderBy('tweets.created_at', 'desc')
        .limit(50);
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

  const token = authHeader.split(' ')[1];
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

  const token = authHeader.split(' ')[1];
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

  const token = authHeader.split(' ')[1];
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

  const token = authHeader.split(' ')[1];
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

app.get('/api/tweets', async (req, res) => {
  const authHeader = req.headers.authorization;
  let currentUserId: string | null = null;
  if (authHeader) {
    try {
      const token = authHeader.split(' ')[1];
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
      query.select(
        db.raw('EXISTS(SELECT 1 FROM likes WHERE user_id = ? AND tweet_id = tweets.id) as has_liked', [currentUserId]),
        db.raw('EXISTS(SELECT 1 FROM retweets WHERE user_id = ? AND tweet_id = tweets.id) as has_retweeted', [currentUserId])
      );
    }

    const tweets = await query;
    res.json(tweets);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// THREADS (Get tweet and its replies)
app.get('/api/tweets/:id', async (req, res) => {
  const { id } = req.params;
  const authHeader = req.headers.authorization;
  let currentUserId: string | null = null;
  if (authHeader) {
    try {
      const token = authHeader.split(' ')[1];
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

    res.json({ tweet, replies });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PERSONALIZED FEED
app.get('/api/feed', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.split(' ')[1];
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

  const token = authHeader.split(' ')[1];
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

  const token = authHeader.split(' ')[1];
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

app.get('/api/users/:username', async (req, res) => {
  const { username } = req.params;
  try {
    const user = await db('users')
      .where('username', username)
      .select('id', 'username', 'display_name', 'bio', 'created_at')
      .first();
    if (!user) return res.status(404).json({ error: 'User not found' });
    
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

  const token = authHeader.split(' ')[1];
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    const notifications = await db('notifications')
      .join('users', 'notifications.from_user_id', 'users.id')
      .leftJoin('tweets', 'notifications.tweet_id', 'tweets.id')
      .where('notifications.user_id', decoded.id)
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

  const token = authHeader.split(' ')[1];
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    const { receiver_username, content } = req.body;

    const receiver = await db('users').where('username', receiver_username).first();
    if (!receiver) return res.status(404).json({ error: 'User not found' });

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

  const token = authHeader.split(' ')[1];
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
        WHERE sender_id = ? OR receiver_id = ?
        ORDER BY created_at DESC
      ) m
      JOIN users u ON u.id = m.contact_id
      ORDER BY contact_id, last_message_at DESC
    `, [decoded.id, decoded.id, decoded.id]);

    res.json(conversations.rows);
  } catch (err) {
    console.error('Failed to get conversations:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/messages/:username', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.split(' ')[1];
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

    res.json(messages);
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
app.get('/api/auth/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.split(' ')[1];
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
