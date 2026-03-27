"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.spamDetector = void 0;
const cache_1 = __importDefault(require("../cache"));
const crypto_1 = __importDefault(require("crypto"));
const SPAM_KEYWORDS = [
    'crypto pump', 'buy followers', 'get rich quick', 'earn money fast',
    'cheap viagra', 'casinogames', 'win real money'
];
const spamDetector = async (req, res, next) => {
    const { content } = req.body;
    if (!content)
        return next();
    const userId = req.user?.id;
    if (!userId)
        return next();
    // 1. Keyword check
    const lowerContent = content.toLowerCase();
    for (const keyword of SPAM_KEYWORDS) {
        if (lowerContent.includes(keyword)) {
            return res.status(400).json({ error: 'Post rejected by spam filter.' });
        }
    }
    // 2. Duplicate content check (within 60s)
    // Use hash of content + userId
    const contentHash = crypto_1.default.createHash('md5').update(content).digest('hex');
    const cacheKey = `spam_dup_${userId}_${contentHash}`;
    try {
        const existing = await cache_1.default.get(cacheKey);
        if (existing && existing.value) {
            return res.status(429).json({ error: 'Duplicate post detected. Please wait a moment.' });
        }
        // Set for 60s
        await cache_1.default.set(cacheKey, '1', { expires: 60 });
        next();
    }
    catch (err) {
        console.error('Spam detector error:', err);
        next();
    }
};
exports.spamDetector = spamDetector;
//# sourceMappingURL=spamDetector.js.map