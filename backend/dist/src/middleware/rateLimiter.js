"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimiter = void 0;
const cache_1 = __importDefault(require("../cache"));
const rateLimiter = (windowSecs, limit, prefix = 'rl') => {
    return async (req, res, next) => {
        // Get user ID if authenticated, otherwise use IP
        const userId = req.user?.id || req.ip;
        const windowId = Math.floor(Date.now() / (windowSecs * 1000));
        const key = `${prefix}_${userId}_${windowId}`;
        try {
            // Get current count
            const cachedValue = await cache_1.default.get(key);
            let count = 0;
            if (cachedValue && cachedValue.value) {
                count = parseInt(cachedValue.value.toString());
            }
            if (count >= limit) {
                return res.status(429).json({
                    error: 'Too many requests',
                    retry_after: windowSecs - (Math.floor(Date.now() / 1000) % windowSecs)
                });
            }
            // Increment count (or set if first request in window)
            if (count === 0) {
                await cache_1.default.set(key, '1', { expires: windowSecs });
            }
            else {
                await cache_1.default.increment(key, 1, { initial: 1, expires: windowSecs });
            }
            // Add headers for the client
            res.setHeader('X-RateLimit-Limit', limit);
            res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - count - 1));
            next();
        }
        catch (err) {
            console.error('Rate limiting error:', err);
            // Fallback: allow request if cache fails
            next();
        }
    };
};
exports.rateLimiter = rateLimiter;
//# sourceMappingURL=rateLimiter.js.map