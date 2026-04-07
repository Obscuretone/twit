import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from './db';
import cache from './cache';
import { sendToQueue } from './queue';
import multer from 'multer';
import { uploadFile } from './storage';
import { rateLimiter } from './middleware/rateLimiter';
import { spamDetector } from './middleware/spamDetector';
import cookieParser from 'cookie-parser';
import path from 'path';

const upload = multer({ storage: multer.memoryStorage() });

const app = express();
const JWT_SECRET: string = process.env.JWT_SECRET || 'supersecretkey_change_in_prod';

// Configure EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));
app.use(express.static(path.join(__dirname, '../public')));
app.use(cookieParser());

const isAdmin = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    const user = await db('users').where('id', decoded.id).first();
    if (!user || !user.is_admin) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (user.is_banned) {
      return res.status(403).json({ error: 'Account is banned' });
    }
    (req as any).user = user;
    next();
  } catch (err) {
    if (err instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    console.error('isAdmin middleware error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const authenticate = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    
    // Check if user is banned in cache first for scalability
    try {
      const cacheKey = `banned_${decoded.id}`;
      const cachedBanned = await cache.get(cacheKey);
      if (cachedBanned && cachedBanned.value?.toString() === 'true') {
        return res.status(403).json({ error: 'Account is banned' });
      }
    } catch (cacheErr) {
      console.error('Cache error in authenticate middleware (ignoring):', cacheErr);
    }

    (req as any).user = decoded;
    next();
  } catch (err) {
    if (err instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    console.error('Authentication middleware error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const optionalAuthenticate = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
  if (token) {
    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);
      (req as any).user = decoded;
    } catch (err) {}
  }
  next();
};

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Helper to get global view data
const getViewData = async (req: express.Request) => {
  const user = (req as any).user;
  const trending = await db('hashtags').orderBy('tweet_count', 'desc').limit(10);
  let notificationsCount = 0;
  if (user) {
    const result = await db('notifications').where({ user_id: user.id, is_read: false }).count('id as count').first();
    notificationsCount = parseInt((result?.count as string) || '0');
  }
  return { user, trending, notificationsCount, title: 'Twit' };
};

// VIEW ROUTES
app.get('/', optionalAuthenticate, async (req, res) => {
  const data = await getViewData(req);
  let tweets = [];
  if (data.user) {
    // Get feed for logged in user
    const currentUserId = data.user.id;
    tweets = await db('tweets')
      .join('users', 'tweets.user_id', 'users.id')
      .leftJoin('follows', 'tweets.user_id', 'follows.following_id')
      .where(function() {
        this.where('follows.follower_id', currentUserId)
            .orWhere('tweets.user_id', currentUserId);
      })
      .whereNull('tweets.parent_tweet_id')
      .whereNull('tweets.deleted_at')
      .select('tweets.*', 'users.username', 'users.display_name')
      .select(
        db.raw('EXISTS(SELECT 1 FROM likes WHERE user_id = ? AND tweet_id = tweets.id) as has_liked', [currentUserId]),
        db.raw('EXISTS(SELECT 1 FROM retweets WHERE user_id = ? AND tweet_id = tweets.id) as has_retweeted', [currentUserId])
      )
      .orderBy('tweets.created_at', 'desc')
      .limit(100);
  } else {
    // Get latest tweets for guests
    tweets = await db('tweets')
      .join('users', 'tweets.user_id', 'users.id')
      .whereNull('tweets.parent_tweet_id')
      .whereNull('tweets.deleted_at')
      .select('tweets.*', 'users.username', 'users.display_name')
      .orderBy('tweets.created_at', 'desc')
      .limit(20);
  }
  res.render('index', { ...data, tweets });
});

app.get('/login', optionalAuthenticate, async (req, res) => {
  if ((req as any).user) return res.redirect('/');
  const data = await getViewData(req);
  res.render('login', { ...data, title: 'Login', error: req.query.error });
});

app.get('/tweet/:id', optionalAuthenticate, async (req, res) => {
  const { id } = req.params;
  const data = await getViewData(req);
  const currentUserId = data.user?.id;

  const tweetQuery = db('tweets')
    .join('users', 'tweets.user_id', 'users.id')
    .where('tweets.id', id)
    .whereNull('tweets.deleted_at')
    .select('tweets.*', 'users.username', 'users.display_name')
    .first();

  const repliesQuery = db('tweets')
    .join('users', 'tweets.user_id', 'users.id')
    .where('tweets.parent_tweet_id', id)
    .whereNull('tweets.deleted_at')
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
  if (!tweet) return res.status(404).render('error', { ...data, title: 'Not Found', message: 'Tweet not found' });

  res.render('tweet', { ...data, title: `Tweet by @${tweet.username}`, tweet, replies });
});

app.get('/u/:username', optionalAuthenticate, async (req, res) => {
  const { username } = req.params;
  const data = await getViewData(req);
  const currentUserId = data.user?.id;

  const profile = await db('users')
    .where('username', username)
    .select('id', 'username', 'display_name', 'bio', 'avatar_url', 'created_at')
    .first();
  if (!profile) return res.status(404).render('error', { ...data, title: 'Not Found', message: 'User not found' });

  const tweets = await db('tweets')
    .join('users', 'tweets.user_id', 'users.id')
    .where('tweets.user_id', profile.id)
    .whereNull('tweets.deleted_at')
    .select('tweets.*', 'users.username', 'users.display_name')
    .orderBy('tweets.created_at', 'desc')
    .limit(100);

  res.render('profile', { ...data, title: `${profile.display_name} (@${profile.username})`, profile, tweets });
});

// FORM HANDLERS
app.post('/auth/login', async (req, res) => {
  const { identifier, password } = req.body;
  try {
    const user = await db('users')
      .where('username', identifier)
      .orWhere('email', identifier)
      .first();

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.redirect('/login?error=Invalid credentials');
    }

    if (user.is_banned) {
      return res.redirect('/login?error=Account is banned');
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '1d' });
    res.cookie('token', token, { httpOnly: true, maxAge: 86400000 });
    res.redirect('/');
  } catch (err) {
    res.redirect('/login?error=Internal server error');
  }
});

app.post('/auth/signup', async (req, res) => {
  const { username, email, password } = req.body;
  try {
    const password_hash = await bcrypt.hash(password, 10);
    const [user] = await db('users').insert({
      username,
      email,
      password_hash,
      display_name: username
    }).returning(['id', 'username']);

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '1d' });
    res.cookie('token', token, { httpOnly: true, maxAge: 86400000 });
    res.redirect('/');
  } catch (err: any) {
    if (err.code === '23505') {
      return res.redirect('/signup?error=Username or email already exists');
    }
    res.redirect('/signup?error=Internal server error');
  }
});

app.post('/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/');
});

app.post('/tweets', authenticate, upload.single('media'), async (req, res) => {
  const user = (req as any).user;
  try {
    const { content } = req.body;
    let media_url = null;
    if (req.file) {
      const key = await uploadFile(req.file);
      media_url = key;
    }

    const [tweet] = await db('tweets').insert({
      user_id: user.id,
      content,
      media_url
    }).returning('*');

    sendToQueue('feeds', { tweet_id: tweet.id, user_id: user.id, type: 'fan_out' });

    // Parse mentions
    const mentions = content.match(/@(\w+)/g);
    if (mentions) {
      mentions.forEach((mention: string) => {
        const username = mention.substring(1);
        sendToQueue('mentions', { tweet_id: tweet.id, username, mentioner: user.username });
      });
    }

    // Parse hashtags
    const hashtags = content.match(/#(\w+)/g);
    if (hashtags) {
      hashtags.forEach((tag: string) => {
        sendToQueue('hashtags', { tag: tag.substring(1).toLowerCase() });
      });
    }

    res.redirect('/');
  } catch (err) {
    res.redirect('/?error=Failed to post tweet');
  }
});

// TWEET ACTIONS (Redirect back)
app.post('/tweets/:id/like', authenticate, async (req, res) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;
    const tweet = await db('tweets').where('id', id).first();
    if (tweet) {
      await db('likes').insert({ user_id: user.id, tweet_id: id }).onConflict(['user_id', 'tweet_id']).ignore();
      sendToQueue('engagement', { tweet_id: id, type: 'like', action: 'inc' });
    }
    res.redirect('back');
  } catch (err) {
    res.redirect('back');
  }
});

app.post('/tweets/:id/reply', authenticate, async (req, res) => {
  const user = (req as any).user;
  const { id } = req.params;
  try {
    const { content } = req.body;
    const [tweet] = await db('tweets').insert({
      user_id: user.id,
      content,
      parent_tweet_id: id
    }).returning('*');

    await db('tweets').where('id', id).increment('reply_count', 1);
    sendToQueue('feeds', { tweet_id: tweet.id, user_id: user.id, type: 'fan_out' });
    res.redirect(`/tweet/${id}`);
  } catch (err) {
    res.redirect(`/tweet/${id}?error=Failed to post reply`);
  }
});

// BOOKMARKS
app.post('/api/tweets/:id/bookmark', authenticate, async (req, res) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;
    await db('bookmarks').insert({ user_id: user.id, tweet_id: id })
      .onConflict(['user_id', 'tweet_id']).ignore();
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to bookmark tweet:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/tweets/:id/bookmark', authenticate, async (req, res) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;
    await db('bookmarks').where({ user_id: user.id, tweet_id: id }).del();
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to remove bookmark:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/bookmarks', authenticate, async (req, res) => {
  try {
    const user = (req as any).user;
    const tweets = await db('tweets')
      .join('users', 'tweets.user_id', 'users.id')
      .join('bookmarks', 'tweets.id', 'bookmarks.tweet_id')
      .where('bookmarks.user_id', user.id)
      .whereNull('tweets.deleted_at')
      .select('tweets.*', 'users.username', 'users.display_name')
      .select(
        db.raw('EXISTS(SELECT 1 FROM likes WHERE user_id = ? AND tweet_id = tweets.id) as has_liked', [user.id]),
        db.raw('EXISTS(SELECT 1 FROM retweets WHERE user_id = ? AND tweet_id = tweets.id) as has_retweeted', [user.id]),
        db.raw('1 as has_bookmarked')
      )
      .orderBy('bookmarks.created_at', 'desc');
    res.json(tweets);
  } catch (err) {
    console.error('Failed to get bookmarks:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// LISTS
app.post('/api/lists', authenticate, async (req, res) => {
  try {
    const user = (req as any).user;
    const { name, description, private: isPrivate } = req.body;
    const [list] = await db('lists').insert({
      owner_id: user.id,
      name,
      description,
      private: !!isPrivate
    }).returning('*');
    res.status(201).json(list);
  } catch (err) {
    console.error('Failed to create list:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/lists', authenticate, async (req, res) => {
  try {
    const user = (req as any).user;
    const lists = await db('lists').where('owner_id', user.id).orderBy('created_at', 'desc');
    res.json(lists);
  } catch (err) {
    console.error('Failed to get lists:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/lists/:id/tweets', authenticate, async (req, res) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;

    const tweets = await db('tweets')
      .join('users', 'tweets.user_id', 'users.id')
      .join('list_members', 'tweets.user_id', 'list_members.user_id')
      .where('list_members.list_id', id)
      .whereNull('tweets.deleted_at')
      .select('tweets.*', 'users.username', 'users.display_name')
      .select(
        db.raw('EXISTS(SELECT 1 FROM likes WHERE user_id = ? AND tweet_id = tweets.id) as has_liked', [user.id]),
        db.raw('EXISTS(SELECT 1 FROM retweets WHERE user_id = ? AND tweet_id = tweets.id) as has_retweeted', [user.id]),
        db.raw('EXISTS(SELECT 1 FROM bookmarks WHERE user_id = ? AND tweet_id = tweets.id) as has_bookmarked', [user.id])
      )
      .orderBy('tweets.created_at', 'desc')
      .limit(100);
    
    res.json(tweets);
  } catch (err) {
    console.error('Failed to get list tweets:', err);
    res.status(500).json({ error: 'Internal server error' });
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
      .whereNull('tweets.deleted_at')
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
      const { from, since, until, min_likes, min_retweets, has_media } = req.query;

      const query = db('tweets')
        .join('users', 'tweets.user_id', 'users.id')
        .whereRaw("to_tsvector('english', tweets.content) @@ plainto_tsquery('english', ?)", [q])
        .whereNull('tweets.deleted_at')
        .select('tweets.*', 'users.username', 'users.display_name')
        .orderBy('tweets.created_at', 'desc')
        .limit(50);

      if (from) {
        query.where('users.username', from as string);
      }
      if (since) {
        query.where('tweets.created_at', '>=', since as string);
      }
      if (until) {
        query.where('tweets.created_at', '<=', until as string);
      }
      if (min_likes) {
        query.where('tweets.like_count', '>=', parseInt(min_likes as string));
      }
      if (min_retweets) {
        query.where('tweets.retweet_count', '>=', parseInt(min_retweets as string));
      }
      if (has_media === 'true') {
        query.whereNotNull('tweets.media_url');
      }

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
app.post('/api/tweets/:id/like', authenticate, async (req, res) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;

    const tweet = await db('tweets').where('id', id).whereNull('deleted_at').first();
    if (!tweet) return res.status(404).json({ error: 'Tweet not found' });

    await db('likes').insert({
      user_id: user.id,
      tweet_id: id
    }).onConflict(['user_id', 'tweet_id']).ignore();

    sendToQueue('engagement', { tweet_id: id, type: 'like', action: 'inc' });
    
    if (tweet.user_id !== user.id) {
      sendToQueue('notifications', { user_id: tweet.user_id, from_user_id: user.id, tweet_id: id, type: 'like' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Failed to like tweet:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/tweets/:id/like', authenticate, async (req, res) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;

    const deleted = await db('likes').where({ user_id: user.id, tweet_id: id }).del();
    if (deleted) {
      sendToQueue('engagement', { tweet_id: id, type: 'like', action: 'dec' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Failed to unlike tweet:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/tweets/:id/retweet', authenticate, async (req, res) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;

    const tweet = await db('tweets').where('id', id).whereNull('deleted_at').first();
    if (!tweet) return res.status(404).json({ error: 'Tweet not found' });

    await db('retweets').insert({
      user_id: user.id,
      tweet_id: id
    }).onConflict(['user_id', 'tweet_id']).ignore();

    sendToQueue('engagement', { tweet_id: id, type: 'retweet', action: 'inc' });
    
    if (tweet.user_id !== user.id) {
      sendToQueue('notifications', { user_id: tweet.user_id, from_user_id: user.id, tweet_id: id, type: 'retweet' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Failed to retweet:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/tweets/:id/retweet', authenticate, async (req, res) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;

    const deleted = await db('retweets').where({ user_id: user.id, tweet_id: id }).del();
    if (deleted) {
      sendToQueue('engagement', { tweet_id: id, type: 'retweet', action: 'dec' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Failed to unretweet:', err);
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
      const token = authHeader.split(' ')[1]!;
      const decoded: any = jwt.verify(token, JWT_SECRET);
      currentUserId = decoded.id;
    } catch (err) {}
  }

  try {
    const tweetQuery = db('tweets')
      .join('users', 'tweets.user_id', 'users.id')
      .where('tweets.id', id)
      .whereNull('tweets.deleted_at')
      .select('tweets.*', 'users.username', 'users.display_name')
      .first();

    const repliesQuery = db('tweets')
      .join('users', 'tweets.user_id', 'users.id')
      .where('tweets.parent_tweet_id', id)
      .whereNull('tweets.deleted_at')
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
    console.error('Failed to get tweet thread:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PERSONALIZED FEED
app.get('/api/feed', authenticate, async (req, res) => {
  try {
    const user = (req as any).user;
    const currentUserId = user.id;
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
        .whereNull('tweets.deleted_at')
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
      .leftJoin('follows', 'tweets.user_id', 'follows.following_id')
      .where(function() {
        this.where('follows.follower_id', currentUserId)
            .orWhere('tweets.user_id', currentUserId);
      })
      .whereNull('tweets.parent_tweet_id')
      .whereNull('tweets.deleted_at')
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
    console.error('Failed to get feed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// FOLLOWS
app.post('/api/follow/:username', authenticate, async (req, res) => {
  try {
    const user = (req as any).user;
    const { username } = req.params;
    
    const userToFollow = await db('users').where('username', username).first();
    if (!userToFollow) return res.status(404).json({ error: 'User not found' });
    if (userToFollow.id === user.id) return res.status(400).json({ error: 'Cannot follow yourself' });

    await db('follows').insert({
      follower_id: user.id,
      following_id: userToFollow.id
    }).onConflict(['follower_id', 'following_id']).ignore();

    // Trigger notification
    sendToQueue('notifications', { user_id: userToFollow.id, from_user_id: user.id, type: 'follow' });

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Failed to follow user:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/follow/:username', authenticate, async (req, res) => {
  try {
    const user = (req as any).user;
    const { username } = req.params;

    const userToUnfollow = await db('users').where('username', username).first();
    if (!userToUnfollow) return res.status(404).json({ error: 'User not found' });

    await db('follows')
      .where({ follower_id: user.id, following_id: userToUnfollow.id })
      .del();

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Failed to unfollow user:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// RELATIONSHIPS (Blocks & Mutes)
app.post('/api/users/:username/block', authenticate, async (req, res) => {
  try {
    const user = (req as any).user;
    const { username } = req.params;

    const userToBlock = await db('users').where('username', username).first();
    if (!userToBlock) return res.status(404).json({ error: 'User not found' });
    if (userToBlock.id === user.id) return res.status(400).json({ error: 'Cannot block yourself' });

    await db('blocks').insert({ blocker_id: user.id, blocked_id: userToBlock.id })
      .onConflict(['blocker_id', 'blocked_id']).ignore();
    
    // Auto-unfollow both ways
    await db('follows').where({ follower_id: user.id, following_id: userToBlock.id }).del();
    await db('follows').where({ follower_id: userToBlock.id, following_id: user.id }).del();

    res.json({ success: true });
  } catch (err) {
    console.error('Failed to block user:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/users/:username/block', authenticate, async (req, res) => {
  try {
    const user = (req as any).user;
    const { username } = req.params;
    const userToUnblock = await db('users').where('username', username).first();
    if (!userToUnblock) return res.status(404).json({ error: 'User not found' });

    await db('blocks').where({ blocker_id: user.id, blocked_id: userToUnblock.id }).del();
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to unblock user:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/users/:username/mute', authenticate, async (req, res) => {
  try {
    const user = (req as any).user;
    const { username } = req.params;
    const userToMute = await db('users').where('username', username).first();
    if (!userToMute) return res.status(404).json({ error: 'User not found' });

    await db('mutes').insert({ muter_id: user.id, muted_id: userToMute.id })
      .onConflict(['muter_id', 'muted_id']).ignore();
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to mute user:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/users/:username/mute', authenticate, async (req, res) => {
  try {
    const user = (req as any).user;
    const { username } = req.params;
    const userToUnmute = await db('users').where('username', username).first();
    if (!userToUnmute) return res.status(404).json({ error: 'User not found' });

    await db('mutes').where({ muter_id: user.id, muted_id: userToUnmute.id }).del();
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to unmute user:', err);
    res.status(500).json({ error: 'Internal server error' });
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
    console.error('Failed to get user profile:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// NOTIFICATIONS
app.get('/api/notifications', authenticate, async (req, res) => {
  try {
    const user = (req as any).user;
    const notifications = await db('notifications')
      .join('users', 'notifications.from_user_id', 'users.id')
      .leftJoin('tweets', 'notifications.tweet_id', 'tweets.id')
      .where('notifications.user_id', user.id)
      // Filter out notifications from blocked or muted users
      .whereNotExists(db.select(1).from('blocks').whereRaw('blocker_id = ? AND blocked_id = notifications.from_user_id', [user.id]))
      .whereNotExists(db.select(1).from('mutes').whereRaw('muter_id = ? AND muted_id = notifications.from_user_id', [user.id]))
      .select('notifications.*', 'users.username as from_username', 'tweets.content as tweet_content')
      .orderBy('notifications.created_at', 'desc')
      .limit(50);
    res.json(notifications);
  } catch (err) {
    console.error('Failed to get notifications:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DIRECT MESSAGES
app.post('/api/messages', authenticate, async (req, res) => {
  try {
    const userAuth = (req as any).user;
    const { receiver_username, content } = req.body;

    const receiver = await db('users').where('username', receiver_username).first();
    if (!receiver) return res.status(404).json({ error: 'User not found' });

    // Check for block
    const block = await db('blocks')
      .where(function() {
        this.where({ blocker_id: userAuth.id, blocked_id: receiver.id })
            .orWhere({ blocker_id: receiver.id, blocked_id: userAuth.id });
      }).first();
    
    if (block) return res.status(403).json({ error: 'Cannot message this user' });

    const [message] = await db('messages').insert({
      sender_id: userAuth.id,
      receiver_id: receiver.id,
      content
    }).returning('*');

    sendToQueue('direct_messages', { message_id: message.id, sender_id: userAuth.id, receiver_id: receiver.id });

    res.status(201).json(message);
  } catch (err) {
    console.error('Failed to send message:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/messages', authenticate, async (req, res) => {
  try {
    const userAuth = (req as any).user;
    
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
    `, [userAuth.id, userAuth.id, userAuth.id, userAuth.id, userAuth.id, userAuth.id, userAuth.id]);

    res.json(conversations.rows);
  } catch (err) {
    console.error('Failed to get conversations:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/messages/:username', authenticate, async (req, res) => {
  try {
    const userAuth = (req as any).user;
    const { username } = req.params;

    const contact = await db('users').where('username', username).first();
    if (!contact) return res.status(404).json({ error: 'User not found' });

    const messages = await db('messages')
      .where(function() {
        this.where({ sender_id: userAuth.id, receiver_id: contact.id })
            .orWhere({ sender_id: contact.id, receiver_id: userAuth.id });
      })
      .orderBy('created_at', 'asc')
      .limit(100);

    res.json({ 
      contact: { id: contact.id, username: contact.username, display_name: contact.display_name },
      messages 
    });

  } catch (err) {
    console.error('Failed to get messages:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ADMIN ENDPOINTS
app.get('/api/admin/stats', isAdmin, async (req, res) => {
  try {
    const [userCount] = await db('users').count('id as count');
    const [tweetCount] = await db('tweets').whereNull('deleted_at').count('id as count');
    const [likeCount] = await db('likes').count('user_id as count');
    
    // Recent activity (last 24h)
    const [newUsers] = await db('users').where('created_at', '>', db.raw("NOW() - INTERVAL '24 HOURS'")).count('id as count');
    const [newTweets] = await db('tweets').whereNull('deleted_at').where('created_at', '>', db.raw("NOW() - INTERVAL '24 HOURS'")).count('id as count');

    res.json({
      totals: {
        users: parseInt((userCount?.count as string) || '0'),
        tweets: parseInt((tweetCount?.count as string) || '0'),
        likes: parseInt((likeCount?.count as string) || '0')
      },
      last24h: {
        newUsers: parseInt((newUsers?.count as string) || '0'),
        newTweets: parseInt((newTweets?.count as string) || '0')
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/admin/users', isAdmin, async (req, res) => {
  const { q } = req.query;
  try {
    const query = db('users').select('id', 'username', 'display_name', 'email', 'is_admin', 'is_banned', 'created_at').orderBy('created_at', 'desc').limit(100);
    if (q) {
      query.where('username', 'ilike', `%${q}%`).orWhere('email', 'ilike', `%${q}%`);
    }
    const users = await query;
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/api/admin/users/:id', isAdmin, async (req, res) => {
  const { id } = req.params;
  const { is_admin, is_banned } = req.body;
  try {
    const updateData: any = {};
    if (is_admin !== undefined) updateData.is_admin = is_admin;
    if (is_banned !== undefined) updateData.is_banned = is_banned;

    await db('users').where('id', id).update(updateData);

    if (is_banned !== undefined) {
      const cacheKey = `banned_${id}`;
      if (is_banned) {
        await cache.set(cacheKey, 'true', { expires: 86400 }); // 1 day
      } else {
        await cache.delete(cacheKey);
      }
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/admin/tweets', isAdmin, async (req, res) => {
  try {
    const tweets = await db('tweets')
      .join('users', 'tweets.user_id', 'users.id')
      .select('tweets.*', 'users.username')
      .whereNull('tweets.deleted_at')
      .orderBy('tweets.created_at', 'desc')
      .limit(100);
    res.json(tweets);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/admin/tweets/:id', isAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await db('tweets').where('id', id).update({ deleted_at: db.fn.now() });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'backend' });
});

// SIGNUP
app.post('/api/auth/signup', rateLimiter(60, 5, 'auth'), async (req, res) => {
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
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// LOGIN
app.post('/api/auth/login', rateLimiter(60, 5, 'auth'), async (req, res) => {
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

    if (user.is_banned) {
      return res.status(403).json({ error: 'Account is banned' });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '1d' });
    res.json({
      user: { id: user.id, username: user.username, email: user.email },
      token
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ME (Get current user)
// PROFILE
app.patch('/api/auth/profile', authenticate, upload.single('avatar'), async (req, res) => {
  try {
    const userAuth = (req as any).user;
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
      .where('id', userAuth.id)
      .update(updateData)
      .returning(['id', 'username', 'display_name', 'bio', 'avatar_url']);

    // Invalidate cache
    const cacheKey = `user_profile_${userAuth.id}`;
    await cache.delete(cacheKey);

    res.json(user);
  } catch (err) {
    console.error('Failed to update profile:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/auth/me', authenticate, async (req, res) => {
  try {
    const userAuth = (req as any).user;
    
    // Check cache first
    const cacheKey = `user_profile_${userAuth.id}`;
    const cachedValue = await cache.get(cacheKey);
    if (cachedValue && cachedValue.value) {
      return res.json(JSON.parse(cachedValue.value.toString()));
    }

    const user = await db('users').where('id', userAuth.id).first();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const userProfile = { 
      id: user.id, 
      username: user.username, 
      email: user.email, 
      display_name: user.display_name,
      is_admin: !!user.is_admin,
      is_banned: !!user.is_banned
    };
    
    // Set cache (10 mins)
    await cache.set(cacheKey, JSON.stringify(userProfile), { expires: 600 });

    res.json(userProfile);
  } catch (err) {
    console.error('Failed to get current user:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default app;
