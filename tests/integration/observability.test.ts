import request from 'supertest';
import { Express } from 'express';
import { buildTestApp, closeTestInfra } from './testApp';
import { registerUser, createOrganization, authHeaders } from './helpers';

describe('Observability (integration)', () => {
  let app: Express;

  beforeEach(async () => {
    const built = await buildTestApp();
    app = built.app;
  });

  afterAll(async () => {
    await closeTestInfra();
  });

  it('GET /metrics returns real Prometheus-format text', async () => {
    await request(app).get('/health'); // generate at least one request to have metrics recorded

    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    // genuine Prometheus exposition format markers, not a stub
    expect(res.text).toMatch(/# HELP http_requests_total/);
    expect(res.text).toMatch(/# TYPE http_requests_total counter/);
    expect(res.text).toMatch(/http_requests_total\{/);
  });

  it('records a distinct counter entry per route and status code', async () => {
    await request(app).get('/api/v1/does-not-exist'); // a 404

    const res = await request(app).get('/metrics');
    expect(res.text).toMatch(/status_code="404"/);
  });

  it('assigns a request id and echoes it back on the response', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-request-id'].length).toBeGreaterThan(10);
  });

  it('reuses a caller-supplied X-Request-Id rather than generating a new one', async () => {
    const res = await request(app).get('/health').set('X-Request-Id', 'my-custom-trace-id');
    expect(res.headers['x-request-id']).toBe('my-custom-trace-id');
  });

  it('includes the request id in error responses, for support correlation', async () => {
    const res = await request(app).get('/api/v1/does-not-exist').set('X-Request-Id', 'trace-abc-123');
    expect(res.body.requestId).toBe('trace-abc-123');
  });
});

describe('API versioning (integration)', () => {
  let app: Express;

  beforeEach(async () => {
    const built = await buildTestApp();
    app = built.app;
  });

  afterAll(async () => {
    await closeTestInfra();
  });

  it('v1 and v2 health checks both work independently', async () => {
    const v1 = await request(app).get('/health');
    const v2 = await request(app).get('/api/v2/health');
    expect(v1.status).toBe(200);
    expect(v2.status).toBe(200);
    expect(v2.body.version).toBe('v2');
  });

  it('v1 and v2 project listings share the same data but different response shapes', async () => {
    const user = await registerUser(app);
    const { organizationId } = await createOrganization(app, user.token);
    await request(app).post('/api/v1/projects').set(authHeaders(user.token, organizationId)).send({ name: 'Shared Project' });

    const v1Res = await request(app).get('/api/v1/projects').set(authHeaders(user.token, organizationId));
    const v2Res = await request(app).get('/api/v2/projects').set(authHeaders(user.token, organizationId));

    expect(v1Res.body.items).toHaveLength(1); // v1 shape: {items: [...]}
    expect(v2Res.body.data).toHaveLength(1); // v2 shape: {data: [...], meta: {...}}
    expect(v2Res.body.meta.projectCount).toBe(1);
    expect(v1Res.body.items[0].name).toBe(v2Res.body.data[0].name);
  });
});
