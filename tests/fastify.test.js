"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const fastify_2 = require("../src/adapters/fastify");
describe('Fastify Adapter', () => {
    let app;
    beforeAll(async () => {
        app = (0, fastify_1.default)();
        await app.register(fastify_2.jsonqlFastify);
        app.get('/api/users', async (req, reply) => {
            return { received: req.jsonql };
        });
        app.post('/api/users', async (req, reply) => {
            return { received: req.jsonql };
        });
        await app.ready();
    });
    afterAll(async () => {
        await app.close();
    });
    it('should parse valid JSONQL query from query param', async () => {
        const q = JSON.stringify({ version: '1.0', fields: ['id', 'email'] });
        const res = await app.inject({
            method: 'GET',
            url: `/api/users?q=${encodeURIComponent(q)}`
        });
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.payload).received).toEqual({
            version: '1.0',
            fields: ['id', 'email']
        });
    });
    it('should parse valid JSONQL query from body', async () => {
        const q = { version: '1.0', fields: ['id', 'email'] };
        const res = await app.inject({
            method: 'POST',
            url: '/api/users',
            payload: q
        });
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.payload).received).toEqual(q);
    });
    it('should reject invalid JSONQL', async () => {
        const q = JSON.stringify({ version: '99.0' });
        const res = await app.inject({
            method: 'GET',
            url: `/api/users?q=${encodeURIComponent(q)}`
        });
        expect(res.statusCode).toBe(400);
        const body = JSON.parse(res.payload);
        expect(body.error).toBe('Invalid JSONQL Query');
    });
});
