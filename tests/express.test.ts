import request from 'supertest';
import express from 'express';
import { jsonqlExpress } from '../src/adapters/express';

describe('Express Adapter', () => {
  const app = express();
  app.use(express.json());
  
  // Use middleware
  app.use('/api', jsonqlExpress());
  
  // Handler
  app.get('/api/users', (req, res) => {
    const query = (req as any).jsonql;
    res.json({ received: query });
  });

  it('should parse valid JSONQL query from query param', async () => {
    const q = JSON.stringify({ version: '1.0', fields: ['id', 'name'] });
    const res = await request(app).get(`/api/users?q=${encodeURIComponent(q)}`);
    
    expect(res.status).toBe(200);
    expect(res.body.received).toEqual({
      version: '1.0',
      fields: ['id', 'name']
    });
  });

  it('should reject invalid JSONQL', async () => {
    const q = JSON.stringify({ version: '99.0' }); // Invalid version
    const res = await request(app).get(`/api/users?q=${encodeURIComponent(q)}`);
    
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid JSONQL Query');
  });
});
