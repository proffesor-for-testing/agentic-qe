# API Test Scaffold Template

## REST API Test Structure (Jest/Supertest)
```typescript
import request from 'supertest';
import { app } from '../src/app';

describe('{{Resource}} API', () => {
  // Setup
  let authToken: string;

  beforeAll(async () => {
    authToken = await getTestToken();
  });

  describe('GET /api/{{resource}}', () => {
    it('returns paginated list with valid auth', async () => {
      const res = await request(app)
        .get('/api/{{resource}}')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ page: 1, limit: 10 });

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.pagination).toMatchObject({
        page: 1,
        limit: 10,
        total: expect.any(Number)
      });
    });

    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/{{resource}}');
      expect(res.status).toBe(401);
    });

    it('returns 400 for invalid query params', async () => {
      const res = await request(app)
        .get('/api/{{resource}}')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ page: -1 });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/{{resource}}', () => {
    it('creates resource with valid payload', async () => {
      const payload = { /* valid fields */ };
      const res = await request(app)
        .post('/api/{{resource}}')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
    });

    it('returns 422 for invalid payload', async () => {
      const res = await request(app)
        .post('/api/{{resource}}')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});
      expect(res.status).toBe(422);
      expect(res.body.errors).toBeDefined();
    });

    it('is idempotent with same request ID', async () => {
      const requestId = crypto.randomUUID();
      const payload = { /* valid fields */ };

      const res1 = await request(app)
        .post('/api/{{resource}}')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Request-ID', requestId)
        .send(payload);

      const res2 = await request(app)
        .post('/api/{{resource}}')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Request-ID', requestId)
        .send(payload);

      expect(res1.body.id).toBe(res2.body.id);
    });
  });
});
```
