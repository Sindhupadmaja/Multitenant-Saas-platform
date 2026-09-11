import request from 'supertest';
import { Express } from 'express';
import { Queue, QueueEvents } from 'bullmq';
import { buildTestApp, closeTestInfra, getTestInfra } from './testApp';
import { registerUser, createOrganization, authHeaders } from './helpers';
import { GenerateInvoiceJobData } from '../../src/jobs/invoiceQueue';

describe('Billing / background jobs (integration, real BullMQ + Redis)', () => {
  let app: Express;
  let invoiceQueue: Queue<GenerateInvoiceJobData>;
  let queueEvents: QueueEvents;

  beforeEach(async () => {
    const built = await buildTestApp();
    app = built.app;
    invoiceQueue = built.invoiceQueue;
    queueEvents = built.queueEvents;
  });

  afterAll(async () => {
    await closeTestInfra();
  });

  it('enqueuing invoice generation returns 202 immediately, and a REAL worker completes it asynchronously', async () => {
    const user = await registerUser(app);
    const { organizationId } = await createOrganization(app, user.token);

    await request(app)
      .post('/api/v1/projects')
      .set(authHeaders(user.token, organizationId))
      .send({ name: 'Billable Project' });

    const periodStart = new Date(Date.now() - 1000 * 60 * 60);
    const periodEnd = new Date(Date.now() + 1000 * 60 * 60);

    const enqueueRes = await request(app)
      .post('/api/v1/billing/invoices/generate')
      .set(authHeaders(user.token, organizationId))
      .send({ periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString() });

    expect(enqueueRes.status).toBe(202);
    expect(enqueueRes.body.jobId).toBeDefined();

    // Wait for the REAL worker (running in this test process, see
    // testApp.ts) to actually finish the job -- not a mock, not a
    // synchronous shortcut. This is what proves the background-job
    // pipeline (route -> queue -> worker -> DB write) works end to end.
    const job = await invoiceQueue.getJob(enqueueRes.body.jobId);
    const result = await job!.waitUntilFinished(queueEvents, 10000);
    expect(result.invoiceId).toBeDefined();

    const listRes = await request(app).get('/api/v1/billing/invoices').set(authHeaders(user.token, organizationId));
    expect(listRes.status).toBe(200);
    expect(listRes.body.invoices).toHaveLength(1);
    expect(listRes.body.invoices[0].amount_cents).toBeGreaterThan(0);
  });

  it('the invoice amount reflects both the plan base fee and metered usage', async () => {
    const user = await registerUser(app);
    const { organizationId } = await createOrganization(app, user.token); // 'free' plan, base fee $0

    for (let i = 0; i < 3; i++) {
      await request(app)
        .post('/api/v1/projects')
        .set(authHeaders(user.token, organizationId))
        .send({ name: `Project ${i}` });
    }

    const periodStart = new Date(Date.now() - 1000 * 60 * 60);
    const periodEnd = new Date(Date.now() + 1000 * 60 * 60);

    const enqueueRes = await request(app)
      .post('/api/v1/billing/invoices/generate')
      .set(authHeaders(user.token, organizationId))
      .send({ periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString() });

    const job = await invoiceQueue.getJob(enqueueRes.body.jobId);
    await job!.waitUntilFinished(queueEvents, 10000);

    const listRes = await request(app).get('/api/v1/billing/invoices').set(authHeaders(user.token, organizationId));
    expect(listRes.body.invoices[0].amount_cents).toBe(150); // 0 base fee + 3 x 50c
    expect(listRes.body.invoices[0].line_items).toHaveLength(2);
  });

  it('generating an invoice twice for the same period is rejected as a conflict', async () => {
    const user = await registerUser(app);
    const { organizationId } = await createOrganization(app, user.token);
    const periodStart = new Date(Date.now() - 1000 * 60 * 60).toISOString();
    const periodEnd = new Date(Date.now() + 1000 * 60 * 60).toISOString();

    const first = await request(app)
      .post('/api/v1/billing/invoices/generate')
      .set(authHeaders(user.token, organizationId))
      .send({ periodStart, periodEnd });
    const firstJob = await invoiceQueue.getJob(first.body.jobId);
    await firstJob!.waitUntilFinished(queueEvents, 10000);

    const second = await request(app)
      .post('/api/v1/billing/invoices/generate')
      .set(authHeaders(user.token, organizationId))
      .send({ periodStart, periodEnd });
    const secondJob = await invoiceQueue.getJob(second.body.jobId);
    const secondResult = await secondJob!.waitUntilFinished(queueEvents, 10000);

    expect(secondResult.skipped).toBe(true);

    const listRes = await request(app).get('/api/v1/billing/invoices').set(authHeaders(user.token, organizationId));
    expect(listRes.body.invoices).toHaveLength(1);
  });

  it('only an owner or admin can trigger invoice generation, not a plain member', async () => {
    const owner = await registerUser(app);
    const member = await registerUser(app);
    const { organizationId } = await createOrganization(app, owner.token);

    await request(app)
      .post('/api/v1/organizations/members')
      .set(authHeaders(owner.token, organizationId))
      .send({ email: member.email, role: 'member' });

    const res = await request(app)
      .post('/api/v1/billing/invoices/generate')
      .set(authHeaders(member.token, organizationId))
      .send({ periodStart: new Date().toISOString(), periodEnd: new Date().toISOString() });

    expect(res.status).toBe(403);
  });

  it('audit log records the invoice generation as a system action (no actor)', async () => {
    const user = await registerUser(app);
    const { organizationId } = await createOrganization(app, user.token);
    const periodStart = new Date(Date.now() - 1000 * 60 * 60).toISOString();
    const periodEnd = new Date(Date.now() + 1000 * 60 * 60).toISOString();

    const enqueueRes = await request(app)
      .post('/api/v1/billing/invoices/generate')
      .set(authHeaders(user.token, organizationId))
      .send({ periodStart, periodEnd });
    const job = await invoiceQueue.getJob(enqueueRes.body.jobId);
    await job!.waitUntilFinished(queueEvents, 10000);

    const { db } = await getTestInfra();
    const log = await db('audit_logs').where({ organization_id: organizationId, action: 'invoice.generated' }).first();
    expect(log).toBeDefined();
    expect(log.actor_id).toBeNull();
  });
});
