import request from 'supertest';
import { Express } from 'express';
import { buildTestApp, closeTestInfra } from './testApp';
import { registerUser, createOrganization, authHeaders } from './helpers';

describe('Caching (integration, real Redis)', () => {
  let app: Express;

  beforeEach(async () => {
    const built = await buildTestApp();
    app = built.app;
  });

  afterAll(async () => {
    await closeTestInfra();
  });

  it('first list is a MISS, second is a HIT', async () => {
    const user = await registerUser(app);
    const { organizationId } = await createOrganization(app, user.token);

    const first = await request(app).get('/api/v1/projects').set(authHeaders(user.token, organizationId));
    const second = await request(app).get('/api/v1/projects').set(authHeaders(user.token, organizationId));

    expect(first.headers['x-cache']).toBe('MISS');
    expect(second.headers['x-cache']).toBe('HIT');
  });

  it('creating a project invalidates the cache immediately, not after TTL', async () => {
    const user = await registerUser(app);
    const { organizationId } = await createOrganization(app, user.token);

    // warm the cache
    await request(app).get('/api/v1/projects').set(authHeaders(user.token, organizationId));
    const warmed = await request(app).get('/api/v1/projects').set(authHeaders(user.token, organizationId));
    expect(warmed.headers['x-cache']).toBe('HIT');

    await request(app)
      .post('/api/v1/projects')
      .set(authHeaders(user.token, organizationId))
      .send({ name: 'New Project' });

    // the very next read must be a MISS (fresh data), not a stale HIT
    const afterWrite = await request(app).get('/api/v1/projects').set(authHeaders(user.token, organizationId));
    expect(afterWrite.headers['x-cache']).toBe('MISS');
    expect(afterWrite.body.items).toHaveLength(1);
  });

  it('two different organizations never share a cache entry', async () => {
    const userA = await registerUser(app);
    const userB = await registerUser(app);
    const orgA = await createOrganization(app, userA.token);
    const orgB = await createOrganization(app, userB.token);

    await request(app)
      .post('/api/v1/projects')
      .set(authHeaders(userA.token, orgA.organizationId))
      .send({ name: 'Org A Project' });

    // org A's list is now cached (warm it)
    await request(app).get('/api/v1/projects').set(authHeaders(userA.token, orgA.organizationId));

    // org B's list must be independently computed -- a cache key collision
    // here would be a tenant-isolation bug hiding inside the cache layer
    const orgBList = await request(app).get('/api/v1/projects').set(authHeaders(userB.token, orgB.organizationId));
    expect(orgBList.headers['x-cache']).toBe('MISS');
    expect(orgBList.body.items).toHaveLength(0);
  });

  it('v2 project list also benefits from the same cache (shared service layer)', async () => {
    const user = await registerUser(app);
    const { organizationId } = await createOrganization(app, user.token);

    await request(app).get('/api/v1/projects').set(authHeaders(user.token, organizationId)); // warms it via v1
    const v2Res = await request(app).get('/api/v2/projects').set(authHeaders(user.token, organizationId));

    expect(v2Res.headers['x-cache']).toBe('HIT');
    expect(v2Res.body.meta.projectCount).toBe(0);
  });
});
