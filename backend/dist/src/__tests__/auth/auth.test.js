"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const app_1 = __importDefault(require("../../app"));
jest.mock('../../cache', () => ({
    get: jest.fn().mockResolvedValue({ value: null }),
    set: jest.fn().mockResolvedValue(true),
}));
jest.mock('../../db', () => {
    const mKnex = {
        insert: jest.fn().mockReturnThis(),
        returning: jest.fn().mockImplementation((fields) => {
            return [{ id: 'uuid-123', username: 'testuser', email: 'test@example.com' }];
        }),
        where: jest.fn().mockReturnThis(),
        orWhere: jest.fn().mockReturnThis(),
        first: jest.fn().mockImplementation(() => {
            return {
                id: 'uuid-123',
                username: 'testuser',
                email: 'test@example.com',
                password_hash: '$2a$10$abcdefghijklmnopqrstuv' // This won't work for real comparison but we can mock bcrypt too if needed
            };
        }),
    };
    return jest.fn(() => mKnex);
});
jest.mock('bcryptjs', () => ({
    hash: jest.fn().mockResolvedValue('$2a$10$hashedpassword'),
    compare: jest.fn().mockResolvedValue(true),
}));
describe('Auth API', () => {
    it('should sign up a user', async () => {
        const res = await (0, supertest_1.default)(app_1.default)
            .post('/api/auth/signup')
            .send({ username: 'testuser', email: 'test@example.com', password: 'Password123' });
        expect(res.status).toBe(201);
        expect(res.body.user.username).toBe('testuser');
        expect(res.body).toHaveProperty('token');
    });
    it('should login a user', async () => {
        const res = await (0, supertest_1.default)(app_1.default)
            .post('/api/auth/login')
            .send({ identifier: 'testuser', password: 'Password123' });
        expect(res.status).toBe(200);
        expect(res.body.user.username).toBe('testuser');
        expect(res.body).toHaveProperty('token');
    });
});
//# sourceMappingURL=auth.test.js.map