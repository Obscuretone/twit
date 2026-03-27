import { Request, Response, NextFunction } from 'express';
import cache from '../cache';
import crypto from 'crypto';

const SPAM_KEYWORDS = [
  'crypto pump', 'buy followers', 'get rich quick', 'earn money fast',
  'cheap viagra', 'casinogames', 'win real money'
];

export const spamDetector = async (req: Request, res: Response, next: NextFunction) => {
  const { content } = req.body;
  if (!content) return next();

  const userId = (req as any).user?.id;
  if (!userId) return next();

  // 1. Keyword check
  const lowerContent = content.toLowerCase();
  for (const keyword of SPAM_KEYWORDS) {
    if (lowerContent.includes(keyword)) {
      return res.status(400).json({ error: 'Post rejected by spam filter.' });
    }
  }

  // 2. Duplicate content check (within 60s)
  // Use hash of content + userId
  const contentHash = crypto.createHash('md5').update(content).digest('hex');
  const cacheKey = `spam_dup_${userId}_${contentHash}`;

  try {
    const existing = await cache.get(cacheKey);
    if (existing && existing.value) {
      return res.status(429).json({ error: 'Duplicate post detected. Please wait a moment.' });
    }

    // Set for 60s
    await cache.set(cacheKey, '1', { expires: 60 });
    next();
  } catch (err) {
    console.error('Spam detector error:', err);
    next();
  }
};
