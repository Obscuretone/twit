"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = __importDefault(require("./db"));
const cache_1 = __importDefault(require("./cache"));
const queue_1 = require("./queue");
const multer_1 = __importDefault(require("multer"));
const storage_1 = require("./storage");
const realtime_1 = require("./realtime");
const rateLimiter_1 = require("./middleware/rateLimiter");
const spamDetector_1 = require("./middleware/spamDetector");
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
const app = (0, express_1.default)();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey_change_in_prod';
const isAdmin = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader)
        return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const user = await (0, db_1.default)('users').where('id', decoded.id).first();
        if (!user || !user.is_admin) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        if (user.is_banned) {
            return res.status(403).json({ error: 'Account is banned' });
        }
        req.user = user;
        next();
    }
    catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
};
const authenticate = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader)
        return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        // Check if user is banned in cache first for scalability
        const cacheKey = `banned_${decoded.id}`;
        const cachedBanned = await cache_1.default.get(cacheKey);
        if (cachedBanned && cachedBanned.value?.toString() === 'true') {
            return res.status(403).json({ error: 'Account is banned' });
        }
        req.user = decoded;
        next();
    }
    catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
};
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// TWEETS
app.post('/api/tweets', authenticate, (0, rateLimiter_1.rateLimiter)(60, 10, 'tweet'), spamDetector_1.spamDetector, upload.single('media'), async (req, res) => {
    const user = req.user;
    try {
        const { content, parent_tweet_id } = req.body;
        if (!content || content.length > 280) {
            return res.status(400).json({ error: 'Invalid content' });
        }
        let media_url = null;
        if (req.file) {
            const key = await (0, storage_1.uploadFile)(req.file);
            media_url = key;
        }
        const [tweet] = await (0, db_1.default)('tweets').insert({
            user_id: user.id,
            content,
            parent_tweet_id: parent_tweet_id || null,
            media_url
        }).returning('*');
        // If it's a reply, increment parent's reply count
        if (parent_tweet_id) {
            await (0, db_1.default)('tweets').where('id', parent_tweet_id).increment('reply_count', 1);
        }
        // Fan-out to followers (send to queue for processing)
        (0, queue_1.sendToQueue)('feeds', { tweet_id: tweet.id, user_id: user.id, type: 'fan_out' });
        // Parse mentions
        const mentions = content.match(/@(\w+)/g);
        if (mentions) {
            mentions.forEach((mention) => {
                const username = mention.substring(1);
                (0, queue_1.sendToQueue)('mentions', { tweet_id: tweet.id, username, mentioner: user.username });
            });
        }
        // Parse hashtags
        const hashtags = content.match(/#(\w+)/g);
        if (hashtags) {
            hashtags.forEach((tag) => {
                (0, queue_1.sendToQueue)('hashtags', { tag: tag.substring(1).toLowerCase() });
            });
        }
        res.status(201).json(tweet);
    }
    catch (err) {
        console.error('Failed to create tweet:', err);
        res.status(401).json({ error: 'Invalid token' });
    }
});
// BOOKMARKS
app.post('/api/tweets/:id/bookmark', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader)
        return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const { id } = req.params;
        await (0, db_1.default)('bookmarks').insert({ user_id: decoded.id, tweet_id: id })
            .onConflict(['user_id', 'tweet_id']).ignore();
        res.json({ success: true });
    }
    catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
});
app.delete('/api/tweets/:id/bookmark', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader)
        return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const { id } = req.params;
        await (0, db_1.default)('bookmarks').where({ user_id: decoded.id, tweet_id: id }).del();
        res.json({ success: true });
    }
    catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
});
app.get('/api/bookmarks', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader)
        return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const tweets = await (0, db_1.default)('tweets')
            .join('users', 'tweets.user_id', 'users.id')
            .join('bookmarks', 'tweets.id', 'bookmarks.tweet_id')
            .where('bookmarks.user_id', decoded.id)
            .whereNull('tweets.deleted_at')
            .select('tweets.*', 'users.username', 'users.display_name')
            .select(db_1.default.raw('EXISTS(SELECT 1 FROM likes WHERE user_id = ? AND tweet_id = tweets.id) as has_liked', [decoded.id]), db_1.default.raw('EXISTS(SELECT 1 FROM retweets WHERE user_id = ? AND tweet_id = tweets.id) as has_retweeted', [decoded.id]), db_1.default.raw('1 as has_bookmarked'))
            .orderBy('bookmarks.created_at', 'desc');
        res.json(tweets);
    }
    catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
});
// LISTS
app.post('/api/lists', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader)
        return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const { name, description, private: isPrivate } = req.body;
        const [list] = await (0, db_1.default)('lists').insert({
            owner_id: decoded.id,
            name,
            description,
            private: !!isPrivate
        }).returning('*');
        res.status(201).json(list);
    }
    catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
});
app.get('/api/lists', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader)
        return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const lists = await (0, db_1.default)('lists').where('owner_id', decoded.id).orderBy('created_at', 'desc');
        res.json(lists);
    }
    catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
});
app.get('/api/lists/:id/tweets', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader)
        return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const { id } = req.params;
        const tweets = await (0, db_1.default)('tweets')
            .join('users', 'tweets.user_id', 'users.id')
            .join('list_members', 'tweets.user_id', 'list_members.user_id')
            .where('list_members.list_id', id)
            .whereNull('tweets.deleted_at')
            .select('tweets.*', 'users.username', 'users.display_name')
            .select(db_1.default.raw('EXISTS(SELECT 1 FROM likes WHERE user_id = ? AND tweet_id = tweets.id) as has_liked', [decoded.id]), db_1.default.raw('EXISTS(SELECT 1 FROM retweets WHERE user_id = ? AND tweet_id = tweets.id) as has_retweeted', [decoded.id]), db_1.default.raw('EXISTS(SELECT 1 FROM bookmarks WHERE user_id = ? AND tweet_id = tweets.id) as has_bookmarked', [decoded.id]))
            .orderBy('tweets.created_at', 'desc')
            .limit(100);
        res.json(tweets);
    }
    catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
});
app.get('/api/tweets', async (req, res) => {
    const authHeader = req.headers.authorization;
    let currentUserId = null;
    if (authHeader) {
        try {
            const token = authHeader.split(' ')[1];
            const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
            currentUserId = decoded.id;
        }
        catch (err) { }
    }
    try {
        const query = (0, db_1.default)('tweets')
            .join('users', 'tweets.user_id', 'users.id')
            .select('tweets.*', 'users.username', 'users.display_name')
            .whereNull('tweets.parent_tweet_id')
            .whereNull('tweets.deleted_at')
            .orderBy('tweets.created_at', 'desc')
            .limit(100);
        if (currentUserId) {
            // Filter out blocks and mutes
            query.whereNotExists(db_1.default.select(1).from('blocks').whereRaw('blocker_id = ? AND blocked_id = tweets.user_id', [currentUserId]));
            query.whereNotExists(db_1.default.select(1).from('blocks').whereRaw('blocker_id = tweets.user_id AND blocked_id = ?', [currentUserId]));
            query.whereNotExists(db_1.default.select(1).from('mutes').whereRaw('muter_id = ? AND muted_id = tweets.user_id', [currentUserId]));
            query.select(db_1.default.raw('EXISTS(SELECT 1 FROM likes WHERE user_id = ? AND tweet_id = tweets.id) as has_liked', [currentUserId]), db_1.default.raw('EXISTS(SELECT 1 FROM retweets WHERE user_id = ? AND tweet_id = tweets.id) as has_retweeted', [currentUserId]), db_1.default.raw('EXISTS(SELECT 1 FROM bookmarks WHERE user_id = ? AND tweet_id = tweets.id) as has_bookmarked', [currentUserId]));
        }
        const tweets = await query;
        res.json(tweets);
    }
    catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
// SEARCH
app.get('/api/search', async (req, res) => {
    const q = req.query.q;
    const type = req.query.type;
    const authHeader = req.headers.authorization;
    let currentUserId = null;
    if (authHeader) {
        try {
            const token = authHeader.split(' ')[1];
            const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
            currentUserId = decoded.id;
        }
        catch (err) { }
    }
    if (!q)
        return res.json([]);
    try {
        if (type === 'users') {
            const query = (0, db_1.default)('users')
                .whereRaw("to_tsvector('english', username || ' ' || COALESCE(display_name, '')) @@ plainto_tsquery('english', ?)", [q])
                .select('id', 'username', 'display_name', 'bio', 'avatar_url')
                .limit(20);
            if (currentUserId) {
                query.whereNotExists(db_1.default.select(1).from('blocks').whereRaw('blocker_id = ? AND blocked_id = users.id', [currentUserId]));
                query.whereNotExists(db_1.default.select(1).from('blocks').whereRaw('blocker_id = users.id AND blocked_id = ?', [currentUserId]));
            }
            const users = await query;
            return res.json(users);
        }
        else {
            const query = (0, db_1.default)('tweets')
                .join('users', 'tweets.user_id', 'users.id')
                .whereRaw("to_tsvector('english', tweets.content) @@ plainto_tsquery('english', ?)", [q])
                .select('tweets.*', 'users.username', 'users.display_name')
                .orderBy('tweets.created_at', 'desc')
                .limit(50);
            if (currentUserId) {
                query.whereNotExists(db_1.default.select(1).from('blocks').whereRaw('blocker_id = ? AND blocked_id = tweets.user_id', [currentUserId]));
                query.whereNotExists(db_1.default.select(1).from('blocks').whereRaw('blocker_id = tweets.user_id AND blocked_id = ?', [currentUserId]));
                query.whereNotExists(db_1.default.select(1).from('mutes').whereRaw('muter_id = ? AND muted_id = tweets.user_id', [currentUserId]));
            }
            const tweets = await query;
            return res.json(tweets);
        }
    }
    catch (err) {
        console.error('Search failed:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// TRENDING
app.get('/api/trending', async (req, res) => {
    try {
        const trending = await (0, db_1.default)('hashtags')
            .orderBy('tweet_count', 'desc')
            .limit(10);
        res.json(trending);
    }
    catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
// ENGAGEMENT (Likes & Retweets)
app.post('/api/tweets/:id/like', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader)
        return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const { id } = req.params;
        const tweet = await (0, db_1.default)('tweets').where('id', id).whereNull('deleted_at').first();
        if (!tweet)
            return res.status(404).json({ error: 'Tweet not found' });
        await (0, db_1.default)('likes').insert({
            user_id: decoded.id,
            tweet_id: id
        }).onConflict(['user_id', 'tweet_id']).ignore();
        (0, queue_1.sendToQueue)('engagement', { tweet_id: id, type: 'like', action: 'inc' });
        if (tweet.user_id !== decoded.id) {
            (0, queue_1.sendToQueue)('notifications', { user_id: tweet.user_id, from_user_id: decoded.id, tweet_id: id, type: 'like' });
        }
        res.json({ success: true });
    }
    catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
});
app.delete('/api/tweets/:id/like', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader)
        return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const { id } = req.params;
        const deleted = await (0, db_1.default)('likes').where({ user_id: decoded.id, tweet_id: id }).del();
        if (deleted) {
            (0, queue_1.sendToQueue)('engagement', { tweet_id: id, type: 'like', action: 'dec' });
        }
        res.json({ success: true });
    }
    catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
});
app.post('/api/tweets/:id/retweet', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader)
        return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const { id } = req.params;
        const tweet = await (0, db_1.default)('tweets').where('id', id).whereNull('deleted_at').first();
        if (!tweet)
            return res.status(404).json({ error: 'Tweet not found' });
        await (0, db_1.default)('retweets').insert({
            user_id: decoded.id,
            tweet_id: id
        }).onConflict(['user_id', 'tweet_id']).ignore();
        (0, queue_1.sendToQueue)('engagement', { tweet_id: id, type: 'retweet', action: 'inc' });
        if (tweet.user_id !== decoded.id) {
            (0, queue_1.sendToQueue)('notifications', { user_id: tweet.user_id, from_user_id: decoded.id, tweet_id: id, type: 'retweet' });
        }
        res.json({ success: true });
    }
    catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
});
app.delete('/api/tweets/:id/retweet', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader)
        return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const { id } = req.params;
        const deleted = await (0, db_1.default)('retweets').where({ user_id: decoded.id, tweet_id: id }).del();
        if (deleted) {
            (0, queue_1.sendToQueue)('engagement', { tweet_id: id, type: 'retweet', action: 'dec' });
        }
        res.json({ success: true });
    }
    catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
});
// THREADS (Get tweet and its replies)
app.get('/api/tweets/:id', async (req, res) => {
    const { id } = req.params;
    const authHeader = req.headers.authorization;
    let currentUserId = null;
    if (authHeader) {
        try {
            const token = authHeader.split(' ')[1];
            const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
            currentUserId = decoded.id;
        }
        catch (err) { }
    }
    try {
        const tweetQuery = (0, db_1.default)('tweets')
            .join('users', 'tweets.user_id', 'users.id')
            .where('tweets.id', id)
            .whereNull('tweets.deleted_at')
            .select('tweets.*', 'users.username', 'users.display_name')
            .first();
        const repliesQuery = (0, db_1.default)('tweets')
            .join('users', 'tweets.user_id', 'users.id')
            .where('tweets.parent_tweet_id', id)
            .whereNull('tweets.deleted_at')
            .select('tweets.*', 'users.username', 'users.display_name')
            .orderBy('tweets.created_at', 'asc');
        if (currentUserId) {
            tweetQuery.select(db_1.default.raw('EXISTS(SELECT 1 FROM likes WHERE user_id = ? AND tweet_id = tweets.id) as has_liked', [currentUserId]), db_1.default.raw('EXISTS(SELECT 1 FROM retweets WHERE user_id = ? AND tweet_id = tweets.id) as has_retweeted', [currentUserId]));
            repliesQuery.select(db_1.default.raw('EXISTS(SELECT 1 FROM likes WHERE user_id = ? AND tweet_id = tweets.id) as has_liked', [currentUserId]), db_1.default.raw('EXISTS(SELECT 1 FROM retweets WHERE user_id = ? AND tweet_id = tweets.id) as has_retweeted', [currentUserId]));
        }
        const [tweet, replies] = await Promise.all([tweetQuery, repliesQuery]);
        if (!tweet)
            return res.status(404).json({ error: 'Tweet not found' });
        // Track view asynchronously
        (0, queue_1.sendToQueue)('analytics', { tweet_id: id });
        res.json({ tweet, replies });
    }
    catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
// PERSONALIZED FEED
app.get('/api/feed', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader)
        return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const currentUserId = decoded.id;
        const cacheKey = `feed_${currentUserId}`;
        const cachedFeed = await cache_1.default.get(cacheKey);
        let tweetIds = [];
        if (cachedFeed && cachedFeed.value) {
            tweetIds = JSON.parse(cachedFeed.value.toString());
        }
        if (tweetIds.length > 0) {
            const tweets = await (0, db_1.default)('tweets')
                .join('users', 'tweets.user_id', 'users.id')
                .whereIn('tweets.id', tweetIds)
                .whereNull('tweets.deleted_at')
                .select('tweets.*', 'users.username', 'users.display_name')
                .select(db_1.default.raw('EXISTS(SELECT 1 FROM likes WHERE user_id = ? AND tweet_id = tweets.id) as has_liked', [currentUserId]), db_1.default.raw('EXISTS(SELECT 1 FROM retweets WHERE user_id = ? AND tweet_id = tweets.id) as has_retweeted', [currentUserId]))
                .orderBy('tweets.created_at', 'desc');
            return res.json(tweets);
        }
        const tweets = await (0, db_1.default)('tweets')
            .join('users', 'tweets.user_id', 'users.id')
            .join('follows', 'tweets.user_id', 'follows.following_id')
            .where('follows.follower_id', currentUserId)
            .whereNull('tweets.deleted_at')
            .select('tweets.*', 'users.username', 'users.display_name')
            .select(db_1.default.raw('EXISTS(SELECT 1 FROM likes WHERE user_id = ? AND tweet_id = tweets.id) as has_liked', [currentUserId]), db_1.default.raw('EXISTS(SELECT 1 FROM retweets WHERE user_id = ? AND tweet_id = tweets.id) as has_retweeted', [currentUserId]))
            .orderBy('tweets.created_at', 'desc')
            .limit(100);
        if (tweets.length > 0) {
            const idsToCache = tweets.map((t) => t.id);
            cache_1.default.set(cacheKey, JSON.stringify(idsToCache), { expires: 86400 });
        }
        res.json(tweets);
    }
    catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
});
// FOLLOWS
app.post('/api/follow/:username', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader)
        return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const { username } = req.params;
        const userToFollow = await (0, db_1.default)('users').where('username', username).first();
        if (!userToFollow)
            return res.status(404).json({ error: 'User not found' });
        if (userToFollow.id === decoded.id)
            return res.status(400).json({ error: 'Cannot follow yourself' });
        await (0, db_1.default)('follows').insert({
            follower_id: decoded.id,
            following_id: userToFollow.id
        }).onConflict(['follower_id', 'following_id']).ignore();
        // Trigger notification
        (0, queue_1.sendToQueue)('notifications', { user_id: userToFollow.id, from_user_id: decoded.id, type: 'follow' });
        res.status(200).json({ success: true });
    }
    catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
});
app.delete('/api/follow/:username', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader)
        return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const { username } = req.params;
        const userToUnfollow = await (0, db_1.default)('users').where('username', username).first();
        if (!userToUnfollow)
            return res.status(404).json({ error: 'User not found' });
        await (0, db_1.default)('follows')
            .where({ follower_id: decoded.id, following_id: userToUnfollow.id })
            .del();
        res.status(200).json({ success: true });
    }
    catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
});
// RELATIONSHIPS (Blocks & Mutes)
app.post('/api/users/:username/block', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader)
        return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const { username } = req.params;
        const userToBlock = await (0, db_1.default)('users').where('username', username).first();
        if (!userToBlock)
            return res.status(404).json({ error: 'User not found' });
        if (userToBlock.id === decoded.id)
            return res.status(400).json({ error: 'Cannot block yourself' });
        await (0, db_1.default)('blocks').insert({ blocker_id: decoded.id, blocked_id: userToBlock.id })
            .onConflict(['blocker_id', 'blocked_id']).ignore();
        // Auto-unfollow both ways
        await (0, db_1.default)('follows').where({ follower_id: decoded.id, following_id: userToBlock.id }).del();
        await (0, db_1.default)('follows').where({ follower_id: userToBlock.id, following_id: decoded.id }).del();
        res.json({ success: true });
    }
    catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
});
app.delete('/api/users/:username/block', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader)
        return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const { username } = req.params;
        const userToUnblock = await (0, db_1.default)('users').where('username', username).first();
        if (!userToUnblock)
            return res.status(404).json({ error: 'User not found' });
        await (0, db_1.default)('blocks').where({ blocker_id: decoded.id, blocked_id: userToUnblock.id }).del();
        res.json({ success: true });
    }
    catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
});
app.post('/api/users/:username/mute', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader)
        return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const { username } = req.params;
        const userToMute = await (0, db_1.default)('users').where('username', username).first();
        if (!userToMute)
            return res.status(404).json({ error: 'User not found' });
        await (0, db_1.default)('mutes').insert({ muter_id: decoded.id, muted_id: userToMute.id })
            .onConflict(['muter_id', 'muted_id']).ignore();
        res.json({ success: true });
    }
    catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
});
app.delete('/api/users/:username/mute', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader)
        return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const { username } = req.params;
        const userToUnmute = await (0, db_1.default)('users').where('username', username).first();
        if (!userToUnmute)
            return res.status(404).json({ error: 'User not found' });
        await (0, db_1.default)('mutes').where({ muter_id: decoded.id, muted_id: userToUnmute.id }).del();
        res.json({ success: true });
    }
    catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
});
app.get('/api/users/:username', async (req, res) => {
    const { username } = req.params;
    const authHeader = req.headers.authorization;
    let currentUserId = null;
    if (authHeader) {
        try {
            const token = authHeader.split(' ')[1];
            const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
            currentUserId = decoded.id;
        }
        catch (err) { }
    }
    try {
        const user = await (0, db_1.default)('users')
            .where('username', username)
            .select('id', 'username', 'display_name', 'bio', 'avatar_url', 'created_at')
            .first();
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        // Check if blocked by current user or blocking current user
        if (currentUserId) {
            const block = await (0, db_1.default)('blocks')
                .where(function () {
                this.where({ blocker_id: currentUserId, blocked_id: user.id })
                    .orWhere({ blocker_id: user.id, blocked_id: currentUserId });
            }).first();
            if (block) {
                return res.json({ ...user, is_blocked: true, followers_count: 0, following_count: 0 });
            }
            const mute = await (0, db_1.default)('mutes').where({ muter_id: currentUserId, muted_id: user.id }).first();
            user.is_muted = !!mute;
            const follow = await (0, db_1.default)('follows').where({ follower_id: currentUserId, following_id: user.id }).first();
            user.is_following = !!follow;
        }
        const follows = await (0, db_1.default)('follows').where('following_id', user.id).count('follower_id as count').first();
        const following = await (0, db_1.default)('follows').where('follower_id', user.id).count('following_id as count').first();
        res.json({ ...user, followers_count: follows?.count, following_count: following?.count });
    }
    catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
// NOTIFICATIONS
app.get('/api/notifications', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader)
        return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const notifications = await (0, db_1.default)('notifications')
            .join('users', 'notifications.from_user_id', 'users.id')
            .leftJoin('tweets', 'notifications.tweet_id', 'tweets.id')
            .where('notifications.user_id', decoded.id)
            // Filter out notifications from blocked or muted users
            .whereNotExists(db_1.default.select(1).from('blocks').whereRaw('blocker_id = ? AND blocked_id = notifications.from_user_id', [decoded.id]))
            .whereNotExists(db_1.default.select(1).from('mutes').whereRaw('muter_id = ? AND muted_id = notifications.from_user_id', [decoded.id]))
            .select('notifications.*', 'users.username as from_username', 'tweets.content as tweet_content')
            .orderBy('notifications.created_at', 'desc')
            .limit(50);
        res.json(notifications);
    }
    catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
});
// DIRECT MESSAGES
app.post('/api/messages', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader)
        return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const { receiver_username, content } = req.body;
        const receiver = await (0, db_1.default)('users').where('username', receiver_username).first();
        if (!receiver)
            return res.status(404).json({ error: 'User not found' });
        // Check for block
        const block = await (0, db_1.default)('blocks')
            .where(function () {
            this.where({ blocker_id: decoded.id, blocked_id: receiver.id })
                .orWhere({ blocker_id: receiver.id, blocked_id: decoded.id });
        }).first();
        if (block)
            return res.status(403).json({ error: 'Cannot message this user' });
        const [message] = await (0, db_1.default)('messages').insert({
            sender_id: decoded.id,
            receiver_id: receiver.id,
            content
        }).returning('*');
        (0, queue_1.sendToQueue)('direct_messages', { message_id: message.id, sender_id: decoded.id, receiver_id: receiver.id });
        res.status(201).json(message);
    }
    catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
});
app.get('/api/messages', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader)
        return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        // Get unique conversations (users the current user has messaged or received messages from)
        const conversations = await db_1.default.raw(`
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
    }
    catch (err) {
        console.error('Failed to get conversations:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.get('/api/messages/:username', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader)
        return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const { username } = req.params;
        const contact = await (0, db_1.default)('users').where('username', username).first();
        if (!contact)
            return res.status(404).json({ error: 'User not found' });
        const messages = await (0, db_1.default)('messages')
            .where(function () {
            this.where({ sender_id: decoded.id, receiver_id: contact.id })
                .orWhere({ sender_id: contact.id, receiver_id: decoded.id });
        })
            .orderBy('created_at', 'asc')
            .limit(100);
        res.json({
            contact: { id: contact.id, username: contact.username, display_name: contact.display_name },
            messages
        });
    }
    catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
});
app.get('/api/realtime/stream', async (req, res) => {
    const authHeader = req.headers.authorization;
    const queryToken = req.query.token;
    if (!authHeader && !queryToken)
        return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader ? authHeader.split(' ')[1] : queryToken;
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const userId = decoded.id;
        const clientId = realtime_1.realtimeBroadcaster.addClient(userId, res);
        req.on('close', () => {
            realtime_1.realtimeBroadcaster.removeClient(clientId);
        });
    }
    catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
});
// ADMIN ENDPOINTS
app.get('/api/admin/stats', isAdmin, async (req, res) => {
    try {
        const [userCount] = await (0, db_1.default)('users').count('id as count');
        const [tweetCount] = await (0, db_1.default)('tweets').whereNull('deleted_at').count('id as count');
        const [likeCount] = await (0, db_1.default)('likes').count('user_id as count');
        // Recent activity (last 24h)
        const [newUsers] = await (0, db_1.default)('users').where('created_at', '>', db_1.default.raw("NOW() - INTERVAL '24 HOURS'")).count('id as count');
        const [newTweets] = await (0, db_1.default)('tweets').whereNull('deleted_at').where('created_at', '>', db_1.default.raw("NOW() - INTERVAL '24 HOURS'")).count('id as count');
        res.json({
            totals: {
                users: parseInt(userCount?.count || '0'),
                tweets: parseInt(tweetCount?.count || '0'),
                likes: parseInt(likeCount?.count || '0')
            },
            last24h: {
                newUsers: parseInt(newUsers?.count || '0'),
                newTweets: parseInt(newTweets?.count || '0')
            }
        });
    }
    catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.get('/api/admin/users', isAdmin, async (req, res) => {
    const { q } = req.query;
    try {
        const query = (0, db_1.default)('users').select('id', 'username', 'display_name', 'email', 'is_admin', 'is_banned', 'created_at').orderBy('created_at', 'desc').limit(100);
        if (q) {
            query.where('username', 'ilike', `%${q}%`).orWhere('email', 'ilike', `%${q}%`);
        }
        const users = await query;
        res.json(users);
    }
    catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.patch('/api/admin/users/:id', isAdmin, async (req, res) => {
    const { id } = req.params;
    const { is_admin, is_banned } = req.body;
    try {
        const updateData = {};
        if (is_admin !== undefined)
            updateData.is_admin = is_admin;
        if (is_banned !== undefined)
            updateData.is_banned = is_banned;
        await (0, db_1.default)('users').where('id', id).update(updateData);
        if (is_banned !== undefined) {
            const cacheKey = `banned_${id}`;
            if (is_banned) {
                await cache_1.default.set(cacheKey, 'true', { expires: 86400 }); // 1 day
            }
            else {
                await cache_1.default.delete(cacheKey);
            }
        }
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.get('/api/admin/tweets', isAdmin, async (req, res) => {
    try {
        const tweets = await (0, db_1.default)('tweets')
            .join('users', 'tweets.user_id', 'users.id')
            .select('tweets.*', 'users.username')
            .whereNull('tweets.deleted_at')
            .orderBy('tweets.created_at', 'desc')
            .limit(100);
        res.json(tweets);
    }
    catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.delete('/api/admin/tweets/:id', isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await (0, db_1.default)('tweets').where('id', id).update({ deleted_at: db_1.default.fn.now() });
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'backend' });
});
// SIGNUP
app.post('/api/auth/signup', (0, rateLimiter_1.rateLimiter)(60, 5, 'auth'), async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    try {
        const password_hash = await bcryptjs_1.default.hash(password, 10);
        const [user] = await (0, db_1.default)('users').insert({
            username,
            email,
            password_hash,
            display_name: username // default display name
        }).returning(['id', 'username', 'email']);
        const token = jsonwebtoken_1.default.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '1d' });
        res.status(201).json({ user, token });
    }
    catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'Username or email already exists' });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
});
// LOGIN
app.post('/api/auth/login', (0, rateLimiter_1.rateLimiter)(60, 5, 'auth'), async (req, res) => {
    const { identifier, password } = req.body; // identifier can be username or email
    if (!identifier || !password) {
        return res.status(400).json({ error: 'Missing credentials' });
    }
    try {
        const user = await (0, db_1.default)('users')
            .where('username', identifier)
            .orWhere('email', identifier)
            .first();
        if (!user || !(await bcryptjs_1.default.compare(password, user.password_hash))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        if (user.is_banned) {
            return res.status(403).json({ error: 'Account is banned' });
        }
        const token = jsonwebtoken_1.default.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '1d' });
        res.json({
            user: { id: user.id, username: user.username, email: user.email },
            token
        });
    }
    catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
// ME (Get current user)
// PROFILE
app.patch('/api/auth/profile', upload.single('avatar'), async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader)
        return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const { display_name, bio } = req.body;
        let avatar_url = undefined;
        if (req.file) {
            avatar_url = await (0, storage_1.uploadFile)(req.file);
        }
        const updateData = {};
        if (display_name !== undefined)
            updateData.display_name = display_name;
        if (bio !== undefined)
            updateData.bio = bio;
        if (avatar_url !== undefined)
            updateData.avatar_url = avatar_url;
        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ error: 'No data provided for update' });
        }
        const [user] = await (0, db_1.default)('users')
            .where('id', decoded.id)
            .update(updateData)
            .returning(['id', 'username', 'display_name', 'bio', 'avatar_url']);
        // Invalidate cache
        const cacheKey = `user_profile_${decoded.id}`;
        await cache_1.default.delete(cacheKey);
        res.json(user);
    }
    catch (err) {
        console.error('Failed to update profile:', err);
        res.status(401).json({ error: 'Invalid token' });
    }
});
app.get('/api/auth/me', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader)
        return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        // Check cache first
        const cacheKey = `user_profile_${decoded.id}`;
        const cachedValue = await cache_1.default.get(cacheKey);
        if (cachedValue && cachedValue.value) {
            return res.json(JSON.parse(cachedValue.value.toString()));
        }
        const user = await (0, db_1.default)('users').where('id', decoded.id).first();
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        const userProfile = {
            id: user.id,
            username: user.username,
            email: user.email,
            display_name: user.display_name,
            is_admin: !!user.is_admin,
            is_banned: !!user.is_banned
        };
        // Set cache (10 mins)
        await cache_1.default.set(cacheKey, JSON.stringify(userProfile), { expires: 600 });
        res.json(userProfile);
    }
    catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
});
exports.default = app;
//# sourceMappingURL=app.js.map