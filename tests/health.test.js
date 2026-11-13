const request = require('supertest');
const app = require('../src/app');

describe('Health Check API', () => {
  it('GET /api/health should return 200 with service status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe('healthy');
    expect(res.body).toHaveProperty('uptime');
    expect(res.body).toHaveProperty('database');
  });

  it('GET / should return welcome json', async () => {
    const res = await request(app).get('/');
    expect(res.statusCode).toEqual(200);
    expect(res.body.service).toBe('NumberHub API');
  });
});
