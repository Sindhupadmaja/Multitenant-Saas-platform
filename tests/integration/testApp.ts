import { Knex } from 'knex';
import Redis from 'ioredis';
import { Queue, QueueEvents, Worker } from 'bullmq';
import { createDb } from '../../src/db';
import { createApp } from '../../src/app';
import { createInvoiceQueue, INVOICE_QUEUE_NAME, GenerateInvoiceJobData } from '../../src/jobs/invoiceQueue';
import { createInvoiceWorker } from '../../src/jobs/invoiceWorker';
import { getQueueConnectionOptions } from '../../src/jobs/connection';
import { UsageRepository } from '../../src/modules/billing/usage.repository';
import { InvoicesRepository } from '../../src/modules/billing/invoices.repository';
import { OrganizationsRepository } from '../../src/modules/organizations/organizations.repository';
import { AuditRepository } from '../../src/modules/audit/audit.repository';
import { BillingService } from '../../src/modules/billing/billing.service';

let sharedDb: Knex | null = null;
let sharedRedis: Redis | null = null;
let sharedQueue: Queue<GenerateInvoiceJobData> | null = null;
let sharedWorker: Worker<GenerateInvoiceJobData> | null = null;
let sharedQueueEvents: QueueEvents | null = null;

export async function getTestInfra() {
  if (!sharedDb) {
    sharedDb = createDb('test');
    await sharedDb.migrate.latest();
  }
  if (!sharedRedis) {
    sharedRedis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: 3 });
  }
  if (!sharedQueue) {
    sharedQueue = createInvoiceQueue(getQueueConnectionOptions());
  }
  if (!sharedWorker) {
    // A REAL worker processing REAL jobs during tests -- not mocked. The
    // background-job test (tests/integration/billing.test.ts) enqueues a
    // job through the actual HTTP route and waits for THIS worker to
    // actually finish it, the same as it would in production with the
    // worker running as a separate process.
    const usageRepo = new UsageRepository(sharedDb);
    const invoicesRepo = new InvoicesRepository(sharedDb);
    const orgsRepo = new OrganizationsRepository(sharedDb);
    const auditRepo = new AuditRepository(sharedDb);
    const billingService = new BillingService(usageRepo, invoicesRepo, orgsRepo, auditRepo);
    sharedWorker = createInvoiceWorker(getQueueConnectionOptions(), billingService);
  }
  if (!sharedQueueEvents) {
    sharedQueueEvents = new QueueEvents(INVOICE_QUEUE_NAME, { connection: getQueueConnectionOptions() });
  }

  return { db: sharedDb, redis: sharedRedis, invoiceQueue: sharedQueue, queueEvents: sharedQueueEvents };
}

export async function resetDb(db: Knex): Promise<void> {
  await db.raw(`
    TRUNCATE TABLE audit_logs, invoices, usage_events, projects, memberships, organizations, users
    RESTART IDENTITY CASCADE
  `);
}

export async function flushRedis(redis: Redis): Promise<void> {
  await redis.flushdb();
}

export async function buildTestApp() {
  const { db, redis, invoiceQueue, queueEvents } = await getTestInfra();
  await resetDb(db);
  await flushRedis(redis);
  const app = createApp({ db, redis, invoiceQueue });
  return { app, db, redis, invoiceQueue, queueEvents };
}

export async function closeTestInfra(): Promise<void> {
  if (sharedWorker) {
    await sharedWorker.close();
    sharedWorker = null;
  }
  if (sharedQueueEvents) {
    await sharedQueueEvents.close();
    sharedQueueEvents = null;
  }
  if (sharedQueue) {
    await sharedQueue.close();
    sharedQueue = null;
  }
  if (sharedRedis) {
    await sharedRedis.quit();
    sharedRedis = null;
  }
  if (sharedDb) {
    await sharedDb.destroy();
    sharedDb = null;
  }
}
