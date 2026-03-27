"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startWorker = startWorker;
const queue_1 = require("./queue");
const db_1 = __importDefault(require("./db"));
const cache_1 = __importDefault(require("./cache"));
const realtime_1 = require("./realtime");
async function startWorker() {
    console.log('Starting background workers...');
    // 1. Mention Processing -> Notification Trigger
    (0, queue_1.consumeQueue)('mentions', async (data) => {
        const { tweet_id, username, mentioner, mentioner_id } = data;
        console.log(`Processing mention: @${username} by @${mentioner}`);
        const user = await (0, db_1.default)('users').where('username', username).first();
        if (user) {
            // Find the user_id for the mentioner if not provided
            const from_user = await (0, db_1.default)('users').where('username', mentioner).first();
            if (from_user) {
                (0, queue_1.sendToQueue)('notifications', {
                    user_id: user.id,
                    from_user_id: from_user.id,
                    tweet_id,
                    type: 'mention'
                });
            }
        }
    });
    // 2. Feed Fan-out
    (0, queue_1.consumeQueue)('feeds', async (data) => {
        // ... same as before
        const { tweet_id, user_id, type } = data;
        if (type === 'fan_out') {
            const followers = await (0, db_1.default)('follows').where('following_id', user_id).select('follower_id');
            for (const follower of followers) {
                const cacheKey = `feed_${follower.follower_id}`;
                const cachedFeed = await cache_1.default.get(cacheKey);
                let feed = [];
                if (cachedFeed && cachedFeed.value) {
                    feed = JSON.parse(cachedFeed.value.toString());
                }
                feed.unshift(tweet_id);
                feed = feed.slice(0, 100);
                await cache_1.default.set(cacheKey, JSON.stringify(feed), { expires: 86400 });
                // Notify user about new feed item
                realtime_1.realtimeBroadcaster.publishEvent(follower.follower_id, 'feed_update', { tweet_id });
            }
        }
    });
    // 3. Notification Persistent Store
    (0, queue_1.consumeQueue)('notifications', async (data) => {
        const { user_id, from_user_id, tweet_id, type } = data;
        console.log(`Creating notification of type ${type} for user ${user_id}`);
        try {
            await (0, db_1.default)('notifications').insert({
                user_id,
                from_user_id,
                tweet_id,
                type,
                read: false
            });
            // Trigger a real-time push for notifications
            realtime_1.realtimeBroadcaster.publishEvent(user_id, 'notification', {
                type,
                from_user_id,
                tweet_id
            });
        }
        catch (err) {
            console.error('Failed to create notification:', err);
        }
    });
    // 4. Engagement Counts (Async Update)
    (0, queue_1.consumeQueue)('engagement', async (data) => {
        const { tweet_id, type, action } = data; // type: 'like', 'retweet', action: 'inc', 'dec'
        console.log(`Updating ${type} count for tweet ${tweet_id}: ${action}`);
        const field = type === 'like' ? 'like_count' : 'retweet_count';
        const amount = action === 'inc' ? 1 : -1;
        try {
            await (0, db_1.default)('tweets').where('id', tweet_id).increment(field, amount);
        }
        catch (err) {
            console.error(`Failed to update ${field} for tweet ${tweet_id}:`, err);
        }
    });
    // 5. Hashtag Tracking
    (0, queue_1.consumeQueue)('hashtags', async (data) => {
        const { tag } = data;
        console.log(`Updating hashtag count for: #${tag}`);
        try {
            await (0, db_1.default)('hashtags')
                .insert({ tag, tweet_count: 1, last_used_at: db_1.default.fn.now() })
                .onConflict('tag')
                .merge({
                tweet_count: db_1.default.raw('hashtags.tweet_count + 1'),
                last_used_at: db_1.default.fn.now()
            });
        }
        catch (err) {
            console.error(`Failed to update hashtag #${tag}:`, err);
        }
    });
    (0, queue_1.consumeQueue)('direct_messages', async (data) => {
        const { message_id, sender_id, receiver_id } = data;
        console.log(`Delivering message ${message_id} from ${sender_id} to ${receiver_id}`);
        // Get message details
        const message = await (0, db_1.default)('messages').where('id', message_id).first();
        if (message) {
            realtime_1.realtimeBroadcaster.publishEvent(receiver_id, 'dm', message);
            realtime_1.realtimeBroadcaster.publishEvent(sender_id, 'dm', message);
        }
    });
    // 7. Analytics (View Counts)
    (0, queue_1.consumeQueue)('analytics', async (data) => {
        const { tweet_id } = data;
        try {
            await (0, db_1.default)('tweets').where('id', tweet_id).increment('view_count', 1);
        }
        catch (err) {
            console.error(`Failed to update view count for tweet ${tweet_id}:`, err);
        }
    });
}
//# sourceMappingURL=worker.js.map