"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const app_1 = __importDefault(require("../app"));
const queue = __importStar(require("../queue"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
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
const token = jsonwebtoken_1.default.sign({ id: 'user-uuid-123', username: 'testuser' }, JWT_SECRET);
describe('Tweets API', () => {
    it('should create a tweet and send mention to queue', async () => {
        const res = await (0, supertest_1.default)(app_1.default)
            .post('/api/tweets')
            .set('Authorization', `Bearer ${token}`)
            .send({ content: 'hello @mentioneduser' });
        expect(res.status).toBe(201);
        expect(res.body.content).toBe('hello @testuser'); // Mock returns this
        expect(queue.sendToQueue).toHaveBeenCalledWith('mentions', expect.objectContaining({ username: 'mentioneduser' }));
    });
    it('should list tweets', async () => {
        const res = await (0, supertest_1.default)(app_1.default).get('/api/tweets');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body[0].username).toBe('testuser');
    });
});
//# sourceMappingURL=tweets.test.js.map