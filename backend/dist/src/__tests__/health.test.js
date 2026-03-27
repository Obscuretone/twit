"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const app_1 = __importDefault(require("../app"));
describe('GET /health', () => {
    it('should return 200 and ok status', async () => {
        const res = await (0, supertest_1.default)(app_1.default).get('/health');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ status: 'ok', service: 'backend' });
    });
});
//# sourceMappingURL=health.test.js.map