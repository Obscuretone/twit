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
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const path_1 = __importDefault(require("path"));
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
const app = (0, express_1.default)();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey_change_in_prod';
// Configure EJS
app.set('view engine', 'ejs');
app.set('views', path_1.default.join(__dirname, '../views'));
app.use(express_1.default.static(path_1.default.join(__dirname, '../public')));
app.use((0, cookie_parser_1.default)());
const isAdmin = async (req, res, next) => {
    const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
    if (!token)
        return res.status(401).json({ error: 'Unauthorized' });
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
        if (err instanceof jsonwebtoken_1.default.JsonWebTokenError) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        console.error('isAdmin middleware error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};
const authenticate = async (req, res, next) => {
    const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
    if (!token)
        return res.status(401).json({ error: 'Unauthorized' });
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        // Check if user is banned in cache first for scalability
        try {
            const cacheKey = `banned_${decoded.id}`;
            const cachedBanned = await cache_1.default.get(cacheKey);
            if (cachedBanned && cachedBanned.value?.toString() === 'true') {
                return res.status(403).json({ error: 'Account is banned' });
            }
        }
        catch (cacheErr) {
            console.error('Cache error in authenticate middleware (ignoring):', cacheErr);
        }
        req.user = decoded;
        next();
    }
    catch (err) {
        if (err instanceof jsonwebtoken_1.default.JsonWebTokenError) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        console.error('Authentication middleware error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};
const optionalAuthenticate = async (req, res, next) => {
    const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
    if (token) {
        try {
            const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
            req.user = decoded;
        }
        catch (err) { }
    }
    next();
};
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// Helper to get global view data
const getViewData = async (req) => {
    const user = req.user;
    const trending = await (0, db_1.default)('hashtags').orderBy('tweet_count', 'desc').limit(10);
    let notificationsCount = 0;
    if (user) {
        const result = await (0, db_1.default)('notifications').where({ user_id: user.id, is_read: false }).count('id as count').first();
        notificationsCount = parseInt(result?.count || '0');
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
        tweets = await (0, db_1.default)('tweets')
            .join('users', 'tweets.user_id', 'users.id')
            .leftJoin('follows', 'tweets.user_id', 'follows.following_id')
            .where(function () {
            this.where('follows.follower_id', currentUserId)
                .orWhere('tweets.user_id', currentUserId);
        })
            .whereNull('tweets.parent_tweet_id')
            .whereNull('tweets.deleted_at')
            .select('tweets.*', 'users.username', 'users.display_name')
            .select(db_1.default.raw('EXISTS(SELECT 1 FROM likes WHERE user_id = ? AND tweet_id = tweets.id) as has_liked', [currentUserId]), db_1.default.raw('EXISTS(SELECT 1 FROM retweets WHERE user_id = ? AND tweet_id = tweets.id) as has_retweeted', [currentUserId]))
            .orderBy('tweets.created_at', 'desc')
            .limit(100);
    }
    else {
        // Get latest tweets for guests
        tweets = await (0, db_1.default)('tweets')
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
    if (req.user)
        return res.redirect('/');
    const data = await getViewData(req);
    res.render('login', { ...data, title: 'Login', error: req.query.error });
});
app.get('/search', optionalAuthenticate, async (req, res) => {
    const q = req.query.q;
    const data = await getViewData(req);
    let results = [];
    if (q) {
        results = await (0, db_1.default)('tweets')
            .join('users', 'tweets.user_id', 'users.id')
            .whereRaw("to_tsvector('english', tweets.content) @@ plainto_tsquery('english', ?)", [q])
            .whereNull('tweets.deleted_at')
            .select('tweets.*', 'users.username', 'users.display_name')
            .orderBy('tweets.created_at', 'desc')
            .limit(50);
    }
    res.render('search', { ...data, title: `Search: ${q || ''}`, q, results });
});
// FORM HANDLERS
app.post('/auth/login', async (req, res) => {
    const { identifier, password } = req.body;
    try {
        const user = await (0, db_1.default)('users')
            .where('username', identifier)
            .orWhere('email', identifier)
            .first();
        if (!user || !(await bcryptjs_1.default.compare(password, user.password_hash))) {
            return res.redirect('/login?error=Invalid credentials');
        }
        if (user.is_banned) {
            return res.redirect('/login?error=Account is banned');
        }
        const token = jsonwebtoken_1.default.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '1d' });
        res.cookie('token', token, { httpOnly: true, maxAge: 86400000 });
        res.redirect('/');
    }
    catch (err) {
        res.redirect('/login?error=Internal server error');
    }
});
app.post('/auth/signup', async (req, res) => {
    const { username, email, password } = req.body;
    try {
        const password_hash = await bcryptjs_1.default.hash(password, 10);
        const [user] = await (0, db_1.default)('users').insert({
            username,
            email,
            password_hash,
            display_name: username
        }).returning(['id', 'username']);
        const token = jsonwebtoken_1.default.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '1d' });
        res.cookie('token', token, { httpOnly: true, maxAge: 86400000 });
        res.redirect('/');
    }
    catch (err) {
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
    const user = req.user;
    try {
        const { content } = req.body;
        let media_url = null;
        if (req.file) {
            const key = await (0, storage_1.uploadFile)(req.file);
            media_url = key;
        }
        const [tweet] = await (0, db_1.default)('tweets').insert({
            user_id: user.id,
            content,
            media_url
        }).returning('*');
        (0, queue_1.sendToQueue)('feeds', { tweet_id: tweet.id, user_id: user.id, type: 'fan_out' });
        res.redirect('/');
    }
    catch (err) {
        res.redirect('/?error=Failed to post tweet');
    }
});
// TWEET ACTIONS (Redirect back)
app.post('/tweets/:id/like', authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { id } = req.params;
        const tweet = await (0, db_1.default)('tweets').where('id', id).first();
        if (tweet) {
            await (0, db_1.default)('likes').insert({ user_id: user.id, tweet_id: id }).onConflict(['user_id', 'tweet_id']).ignore();
            (0, queue_1.sendToQueue)('engagement', { tweet_id: id, type: 'like', action: 'inc' });
        }
        res.redirect('back');
    }
    catch (err) {
        res.redirect('back');
    }
});
app.post('/tweets/:id/retweet', authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { id } = req.params;
        const tweet = await (0, db_1.default)('tweets').where('id', id).first();
        if (tweet) {
            await (0, db_1.default)('retweets').insert({ user_id: user.id, tweet_id: id }).onConflict(['user_id', 'tweet_id']).ignore();
            (0, queue_1.sendToQueue)('engagement', { tweet_id: id, type: 'retweet', action: 'inc' });
        }
        res.redirect('back');
    }
    catch (err) {
        res.redirect('back');
    }
});
// BOOKMARKS
app.post('/api/tweets/:id/bookmark', authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { id } = req.params;
        await (0, db_1.default)('bookmarks').insert({ user_id: user.id, tweet_id: id })
            .onConflict(['user_id', 'tweet_id']).ignore();
        res.json({ success: true });
    }
    catch (err) {
        console.error('Failed to bookmark tweet:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.delete('/api/tweets/:id/bookmark', authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { id } = req.params;
        await (0, db_1.default)('bookmarks').where({ user_id: user.id, tweet_id: id }).del();
        res.json({ success: true });
    }
    catch (err) {
        console.error('Failed to remove bookmark:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.get('/api/bookmarks', authenticate, async (req, res) => {
    try {
        const user = req.user;
        const tweets = await (0, db_1.default)('tweets')
            .join('users', 'tweets.user_id', 'users.id')
            .join('bookmarks', 'tweets.id', 'bookmarks.tweet_id')
            .where('bookmarks.user_id', user.id)
            .whereNull('tweets.deleted_at')
            .select('tweets.*', 'users.username', 'users.display_name')
            .select(db_1.default.raw('EXISTS(SELECT 1 FROM likes WHERE user_id = ? AND tweet_id = tweets.id) as has_liked', [user.id]), db_1.default.raw('EXISTS(SELECT 1 FROM retweets WHERE user_id = ? AND tweet_id = tweets.id) as has_retweeted', [user.id]), db_1.default.raw('1 as has_bookmarked'))
            .orderBy('bookmarks.created_at', 'desc');
        res.json(tweets);
    }
    catch (err) {
        console.error('Failed to get bookmarks:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// LISTS
app.post('/api/lists', authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { name, description, private: isPrivate } = req.body;
        const [list] = await (0, db_1.default)('lists').insert({
            owner_id: user.id,
            name,
            description,
            private: !!isPrivate
        }).returning('*');
        res.status(201).json(list);
    }
    catch (err) {
        console.error('Failed to create list:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.get('/api/lists', authenticate, async (req, res) => {
    try {
        const user = req.user;
        const lists = await (0, db_1.default)('lists').where('owner_id', user.id).orderBy('created_at', 'desc');
        res.json(lists);
    }
    catch (err) {
        console.error('Failed to get lists:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.get('/api/lists/:id/tweets', authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { id } = req.params;
        const tweets = await (0, db_1.default)('tweets')
            .join('users', 'tweets.user_id', 'users.id')
            .join('list_members', 'tweets.user_id', 'list_members.user_id')
            .where('list_members.list_id', id)
            .whereNull('tweets.deleted_at')
            .select('tweets.*', 'users.username', 'users.display_name')
            .select(db_1.default.raw('EXISTS(SELECT 1 FROM likes WHERE user_id = ? AND tweet_id = tweets.id) as has_liked', [user.id]), db_1.default.raw('EXISTS(SELECT 1 FROM retweets WHERE user_id = ? AND tweet_id = tweets.id) as has_retweeted', [user.id]), db_1.default.raw('EXISTS(SELECT 1 FROM bookmarks WHERE user_id = ? AND tweet_id = tweets.id) as has_bookmarked', [user.id]))
            .orderBy('tweets.created_at', 'desc')
            .limit(100);
        res.json(tweets);
    }
    catch (err) {
        console.error('Failed to get list tweets:', err);
        res.status(500).json({ error: 'Internal server error' });
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
            const { from, since, until, min_likes, min_retweets, has_media } = req.query;
            const query = (0, db_1.default)('tweets')
                .join('users', 'tweets.user_id', 'users.id')
                .whereRaw("to_tsvector('english', tweets.content) @@ plainto_tsquery('english', ?)", [q])
                .whereNull('tweets.deleted_at')
                .select('tweets.*', 'users.username', 'users.display_name')
                .orderBy('tweets.created_at', 'desc')
                .limit(50);
            if (from) {
                query.where('users.username', from);
            }
            if (since) {
                query.where('tweets.created_at', '>=', since);
            }
            if (until) {
                query.where('tweets.created_at', '<=', until);
            }
            if (min_likes) {
                query.where('tweets.like_count', '>=', parseInt(min_likes));
            }
            if (min_retweets) {
                query.where('tweets.retweet_count', '>=', parseInt(min_retweets));
            }
            if (has_media === 'true') {
                query.whereNotNull('tweets.media_url');
            }
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
app.post('/api/tweets/:id/like', authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { id } = req.params;
        const tweet = await (0, db_1.default)('tweets').where('id', id).whereNull('deleted_at').first();
        if (!tweet)
            return res.status(404).json({ error: 'Tweet not found' });
        await (0, db_1.default)('likes').insert({
            user_id: user.id,
            tweet_id: id
        }).onConflict(['user_id', 'tweet_id']).ignore();
        (0, queue_1.sendToQueue)('engagement', { tweet_id: id, type: 'like', action: 'inc' });
        if (tweet.user_id !== user.id) {
            (0, queue_1.sendToQueue)('notifications', { user_id: tweet.user_id, from_user_id: user.id, tweet_id: id, type: 'like' });
        }
        res.json({ success: true });
    }
    catch (err) {
        console.error('Failed to like tweet:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.delete('/api/tweets/:id/like', authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { id } = req.params;
        const deleted = await (0, db_1.default)('likes').where({ user_id: user.id, tweet_id: id }).del();
        if (deleted) {
            (0, queue_1.sendToQueue)('engagement', { tweet_id: id, type: 'like', action: 'dec' });
        }
        res.json({ success: true });
    }
    catch (err) {
        console.error('Failed to unlike tweet:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.post('/api/tweets/:id/retweet', authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { id } = req.params;
        const tweet = await (0, db_1.default)('tweets').where('id', id).whereNull('deleted_at').first();
        if (!tweet)
            return res.status(404).json({ error: 'Tweet not found' });
        await (0, db_1.default)('retweets').insert({
            user_id: user.id,
            tweet_id: id
        }).onConflict(['user_id', 'tweet_id']).ignore();
        (0, queue_1.sendToQueue)('engagement', { tweet_id: id, type: 'retweet', action: 'inc' });
        if (tweet.user_id !== user.id) {
            (0, queue_1.sendToQueue)('notifications', { user_id: tweet.user_id, from_user_id: user.id, tweet_id: id, type: 'retweet' });
        }
        res.json({ success: true });
    }
    catch (err) {
        console.error('Failed to retweet:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.delete('/api/tweets/:id/retweet', authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { id } = req.params;
        const deleted = await (0, db_1.default)('retweets').where({ user_id: user.id, tweet_id: id }).del();
        if (deleted) {
            (0, queue_1.sendToQueue)('engagement', { tweet_id: id, type: 'retweet', action: 'dec' });
        }
        res.json({ success: true });
    }
    catch (err) {
        console.error('Failed to unretweet:', err);
        res.status(500).json({ error: 'Internal server error' });
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
        console.error('Failed to get tweet thread:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// PERSONALIZED FEED
app.get('/api/feed', authenticate, async (req, res) => {
    try {
        const user = req.user;
        const currentUserId = user.id;
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
            .leftJoin('follows', 'tweets.user_id', 'follows.following_id')
            .where(function () {
            this.where('follows.follower_id', currentUserId)
                .orWhere('tweets.user_id', currentUserId);
        })
            .whereNull('tweets.parent_tweet_id')
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
        console.error('Failed to get feed:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// FOLLOWS
app.post('/api/follow/:username', authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { username } = req.params;
        const userToFollow = await (0, db_1.default)('users').where('username', username).first();
        if (!userToFollow)
            return res.status(404).json({ error: 'User not found' });
        if (userToFollow.id === user.id)
            return res.status(400).json({ error: 'Cannot follow yourself' });
        await (0, db_1.default)('follows').insert({
            follower_id: user.id,
            following_id: userToFollow.id
        }).onConflict(['follower_id', 'following_id']).ignore();
        // Trigger notification
        (0, queue_1.sendToQueue)('notifications', { user_id: userToFollow.id, from_user_id: user.id, type: 'follow' });
        res.status(200).json({ success: true });
    }
    catch (err) {
        console.error('Failed to follow user:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.delete('/api/follow/:username', authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { username } = req.params;
        const userToUnfollow = await (0, db_1.default)('users').where('username', username).first();
        if (!userToUnfollow)
            return res.status(404).json({ error: 'User not found' });
        await (0, db_1.default)('follows')
            .where({ follower_id: user.id, following_id: userToUnfollow.id })
            .del();
        res.status(200).json({ success: true });
    }
    catch (err) {
        console.error('Failed to unfollow user:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// RELATIONSHIPS (Blocks & Mutes)
app.post('/api/users/:username/block', authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { username } = req.params;
        const userToBlock = await (0, db_1.default)('users').where('username', username).first();
        if (!userToBlock)
            return res.status(404).json({ error: 'User not found' });
        if (userToBlock.id === user.id)
            return res.status(400).json({ error: 'Cannot block yourself' });
        await (0, db_1.default)('blocks').insert({ blocker_id: user.id, blocked_id: userToBlock.id })
            .onConflict(['blocker_id', 'blocked_id']).ignore();
        // Auto-unfollow both ways
        await (0, db_1.default)('follows').where({ follower_id: user.id, following_id: userToBlock.id }).del();
        await (0, db_1.default)('follows').where({ follower_id: userToBlock.id, following_id: user.id }).del();
        res.json({ success: true });
    }
    catch (err) {
        console.error('Failed to block user:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.delete('/api/users/:username/block', authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { username } = req.params;
        const userToUnblock = await (0, db_1.default)('users').where('username', username).first();
        if (!userToUnblock)
            return res.status(404).json({ error: 'User not found' });
        await (0, db_1.default)('blocks').where({ blocker_id: user.id, blocked_id: userToUnblock.id }).del();
        res.json({ success: true });
    }
    catch (err) {
        console.error('Failed to unblock user:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.post('/api/users/:username/mute', authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { username } = req.params;
        const userToMute = await (0, db_1.default)('users').where('username', username).first();
        if (!userToMute)
            return res.status(404).json({ error: 'User not found' });
        await (0, db_1.default)('mutes').insert({ muter_id: user.id, muted_id: userToMute.id })
            .onConflict(['muter_id', 'muted_id']).ignore();
        res.json({ success: true });
    }
    catch (err) {
        console.error('Failed to mute user:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.delete('/api/users/:username/mute', authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { username } = req.params;
        const userToUnmute = await (0, db_1.default)('users').where('username', username).first();
        if (!userToUnmute)
            return res.status(404).json({ error: 'User not found' });
        await (0, db_1.default)('mutes').where({ muter_id: user.id, muted_id: userToUnmute.id }).del();
        res.json({ success: true });
    }
    catch (err) {
        console.error('Failed to unmute user:', err);
        res.status(500).json({ error: 'Internal server error' });
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
        console.error('Failed to get user profile:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// NOTIFICATIONS
app.get('/api/notifications', authenticate, async (req, res) => {
    try {
        const user = req.user;
        const notifications = await (0, db_1.default)('notifications')
            .join('users', 'notifications.from_user_id', 'users.id')
            .leftJoin('tweets', 'notifications.tweet_id', 'tweets.id')
            .where('notifications.user_id', user.id)
            // Filter out notifications from blocked or muted users
            .whereNotExists(db_1.default.select(1).from('blocks').whereRaw('blocker_id = ? AND blocked_id = notifications.from_user_id', [user.id]))
            .whereNotExists(db_1.default.select(1).from('mutes').whereRaw('muter_id = ? AND muted_id = notifications.from_user_id', [user.id]))
            .select('notifications.*', 'users.username as from_username', 'tweets.content as tweet_content')
            .orderBy('notifications.created_at', 'desc')
            .limit(50);
        res.json(notifications);
    }
    catch (err) {
        console.error('Failed to get notifications:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// DIRECT MESSAGES
app.post('/api/messages', authenticate, async (req, res) => {
    try {
        const userAuth = req.user;
        const { receiver_username, content } = req.body;
        const receiver = await (0, db_1.default)('users').where('username', receiver_username).first();
        if (!receiver)
            return res.status(404).json({ error: 'User not found' });
        // Check for block
        const block = await (0, db_1.default)('blocks')
            .where(function () {
            this.where({ blocker_id: userAuth.id, blocked_id: receiver.id })
                .orWhere({ blocker_id: receiver.id, blocked_id: userAuth.id });
        }).first();
        if (block)
            return res.status(403).json({ error: 'Cannot message this user' });
        const [message] = await (0, db_1.default)('messages').insert({
            sender_id: userAuth.id,
            receiver_id: receiver.id,
            content
        }).returning('*');
        (0, queue_1.sendToQueue)('direct_messages', { message_id: message.id, sender_id: userAuth.id, receiver_id: receiver.id });
        res.status(201).json(message);
    }
    catch (err) {
        console.error('Failed to send message:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.get('/api/messages', authenticate, async (req, res) => {
    try {
        const userAuth = req.user;
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
    `, [userAuth.id, userAuth.id, userAuth.id, userAuth.id, userAuth.id, userAuth.id, userAuth.id]);
        res.json(conversations.rows);
    }
    catch (err) {
        console.error('Failed to get conversations:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.get('/api/messages/:username', authenticate, async (req, res) => {
    try {
        const userAuth = req.user;
        const { username } = req.params;
        const contact = await (0, db_1.default)('users').where('username', username).first();
        if (!contact)
            return res.status(404).json({ error: 'User not found' });
        const messages = await (0, db_1.default)('messages')
            .where(function () {
            this.where({ sender_id: userAuth.id, receiver_id: contact.id })
                .orWhere({ sender_id: contact.id, receiver_id: userAuth.id });
        })
            .orderBy('created_at', 'asc')
            .limit(100);
        res.json({
            contact: { id: contact.id, username: contact.username, display_name: contact.display_name },
            messages
        });
    }
    catch (err) {
        console.error('Failed to get messages:', err);
        res.status(500).json({ error: 'Internal server error' });
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
        if (err instanceof jsonwebtoken_1.default.JsonWebTokenError) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        console.error('Realtime stream error:', err);
        res.status(500).json({ error: 'Internal server error' });
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
        console.error('Signup error:', err);
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
        console.error('Login error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// ME (Get current user)
// PROFILE
app.patch('/api/auth/profile', authenticate, upload.single('avatar'), async (req, res) => {
    try {
        const userAuth = req.user;
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
            .where('id', userAuth.id)
            .update(updateData)
            .returning(['id', 'username', 'display_name', 'bio', 'avatar_url']);
        // Invalidate cache
        const cacheKey = `user_profile_${userAuth.id}`;
        await cache_1.default.delete(cacheKey);
        res.json(user);
    }
    catch (err) {
        console.error('Failed to update profile:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.get('/api/auth/me', authenticate, async (req, res) => {
    try {
        const userAuth = req.user;
        // Check cache first
        const cacheKey = `user_profile_${userAuth.id}`;
        const cachedValue = await cache_1.default.get(cacheKey);
        if (cachedValue && cachedValue.value) {
            return res.json(JSON.parse(cachedValue.value.toString()));
        }
        const user = await (0, db_1.default)('users').where('id', userAuth.id).first();
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
        console.error('Failed to get current user:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = app;
//# sourceMappingURL=app.js.map