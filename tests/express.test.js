"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const express_1 = __importDefault(require("express"));
const express_2 = require("../src/adapters/express");
describe('Express Adapter', () => {
    const app = (0, express_1.default)();
    app.use(express_1.default.json());
    // Use middleware
    app.use('/api', (0, express_2.jsonqlExpress)());
    // Handler
    app.get('/api/users', (req, res) => {
        const query = req.jsonql;
        res.json({ received: query });
    });
    it('should parse valid JSONQL query from query param', async () => {
        const q = JSON.stringify({ version: '1.0', fields: ['id', 'name'] });
        const res = await (0, supertest_1.default)(app).get(`/api/users?q=${encodeURIComponent(q)}`);
        expect(res.status).toBe(200);
        expect(res.body.received).toEqual({
            version: '1.0',
            fields: ['id', 'name']
        });
    });
    it('should reject invalid JSONQL', async () => {
        const q = JSON.stringify({ version: '99.0' }); // Invalid version
        const res = await (0, supertest_1.default)(app).get(`/api/users?q=${encodeURIComponent(q)}`);
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Invalid JSONQL Query');
    });
});
