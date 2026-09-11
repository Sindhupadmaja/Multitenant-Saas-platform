import request from 'supertest';
import { Express } from 'express';
import { buildTestApp, closeTestInfra } from './testApp';

describe('Auth (integration)', () => {
  let app: Express;

  beforeEach(async () => {
    const built = await buildTestApp();
    app = built.app;
  });

  afterAll(async () => {
    await closeTestInfra();
  });

  it('registers and returns a token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Ada', email: 'ada@example.com', password: 'password123' });
    expect(res.status).toBe(201);
    expect(typeof res.body.token).toBe('string');
  });

  it('rejects duplicate emails', async () => {
    await request(app).post('/api/v1/auth/register').send({ name: 'A', email: 'dup@example.com', password: 'password123' });
    const res = await request(app).post('/api/v1/auth/register').send({ name: 'B', email: 'dup@example.com', password: 'password456' });
    expect(res.status).toBe(409);
  });

  it('login fails identically for wrong password vs nonexistent email', async () => {
    await request(app).post('/api/v1/auth/register').send({ name: 'Real', email: 'real@example.com', password: 'password123' });
    const wrongPw = await request(app).post('/api/v1/auth/login').send({ email: 'real@example.com', password: 'wrong' });
    const noUser = await request(app).post('/api/v1/auth/login').send({ email: 'ghost@example.com', password: 'x' });
    expect(wrongPw.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(wrongPw.body.error).toBe(noUser.body.error);
  });

  it('protected routes reject requests with no token', async () => {
    const res = await request(app).get('/api/v1/organizations/mine');
    expect(res.status).toBe(401);
  });
});
