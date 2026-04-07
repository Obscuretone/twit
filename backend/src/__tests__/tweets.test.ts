import request from 'supertest';
import app from '../app';
import db from '../db';
import * as queue from '../queue';
import jwt from 'jsonwebtoken';

jest.mock('../storage', () => ({
  uploadFile: jest.fn().mockResolvedValue('uploads/test-media.jpg'),
  initS3: jest.fn().mockResolvedValue(true),
}));

jest.mock('../db', () => {
  const mKnex = {
    insert: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue([{ id: 'tweet-uuid-123', content: 'hello @testuser' }]),
    join: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue([{ id: 'tweet-uuid-123', content: 'hello @testuser', username: 'testuser' }]),
    where: jest.fn().mockReturnThis(),
    whereIn: jest.fn().mockReturnThis(),
    whereNull: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    increment: jest.fn().mockResolvedValue(1),
    first: jest.fn().mockResolvedValue({ id: 'user-uuid-123', username: 'testuser' }),
  };
  return jest.fn(() => mKnex);
});

jest.mock('../queue', () => ({
  sendToQueue: jest.fn().mockResolvedValue(true),
  connectQueue: jest.fn().mockResolvedValue(true),
  consumeQueue: jest.fn().mockResolvedValue(true),
}));

jest.mock('../cache', () => ({
  get: jest.fn().mockResolvedValue({ value: null }),
  set: jest.fn().mockResolvedValue(true),
}));

const JWT_SECRET = 'supersecretkey_change_in_prod';
const token = jwt.sign({ id: 'user-uuid-123', username: 'testuser' }, JWT_SECRET);

describe('Tweets Flow', () => {
  it('should create a tweet and send mention to queue', async () => {
    const res = await request(app)
      .post('/tweets')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'hello @mentioneduser' });
    
    expect(res.status).toBe(302);
    expect(res.header.location).toBe('/');
    expect(queue.sendToQueue).toHaveBeenCalledWith('mentions', expect.objectContaining({ username: 'mentioneduser' }));
  });

  it('should list tweets', async () => {
    const res = await request(app).get('/api/tweets');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].username).toBe('testuser');
  });
});
