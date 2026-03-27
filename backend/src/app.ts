import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from './db';
import cache from './cache';
import { sendToQueue } from './queue';

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey_change_in_prod';

app.use(cors());
app.use(express.json());

// TWEETS
app.post('/api/tweets', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    const { content } = req.body;
    if (!content || content.length > 280) {
      return res.status(400).json({ error: 'Invalid content' });
    }

    const [tweet] = await db('tweets').insert({
      user_id: decoded.id,
      content
    }).returning('*');

    // Parse mentions
    const mentions = content.match(/@(\w+)/g);
    if (mentions) {
      mentions.forEach((mention: string) => {
        const username = mention.substring(1);
        sendToQueue('mentions', { tweet_id: tweet.id, username, mentioner: decoded.username });
      });
    }

    res.status(201).json(tweet);
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.get('/api/tweets', async (req, res) => {
  try {
    const tweets = await db('tweets')
      .join('users', 'tweets.user_id', 'users.id')
      .select('tweets.*', 'users.username', 'users.display_name')
      .orderBy('tweets.created_at', 'desc')
      .limit(100);
    res.json(tweets);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
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
