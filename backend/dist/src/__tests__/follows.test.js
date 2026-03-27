"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const app_1 = __importDefault(require("../app"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
jest.mock('../db', () => {
    const mKnex = {
        insert: jest.fn().mockReturnThis(),
        onConflict: jest.fn().mockReturnThis(),
        ignore: jest.fn().mockResolvedValue([{ success: true }]),
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockImplementation((idOrUsername) => {
            return { id: 'followed-uuid-123', username: 'followeduser' };
        }),
        del: jest.fn().mockResolvedValue(1),
        select: jest.fn().mockReturnThis(),
        count: jest.fn().mockReturnThis(),
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
const token = jsonwebtoken_1.default.sign({ id: 'follower-uuid-123', username: 'followeruser' }, JWT_SECRET);
describe('Follows API', () => {
    it('should follow a user', async () => {
        const res = await (0, supertest_1.default)(app_1.default)
            .post('/api/follow/followeduser')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
    it('should unfollow a user', async () => {
        const res = await (0, supertest_1.default)(app_1.default)
            .delete('/api/follow/followeduser')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});
//# sourceMappingURL=follows.test.js.map