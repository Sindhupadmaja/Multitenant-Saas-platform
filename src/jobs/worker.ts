import 'dotenv/config';
import { createDb } from '../db';
import { createInvoiceWorker } from './invoiceWorker';
import { getQueueConnectionOptions } from './connection';
import { UsageRepository } from '../modules/billing/usage.repository';
import { InvoicesRepository } from '../modules/billing/invoices.repository';
import { OrganizationsRepository } from '../modules/organizations/organizations.repository';
import { AuditRepository } from '../modules/audit/audit.repository';
import { BillingService } from '../modules/billing/billing.service';
import { logger } from '../common/observability/logger';

/**
 * A separate OS process from the web server (see docker-compose.yml's
 * `worker` service and package.json's `start:worker` script) -- this is
 * the realistic production topology: the API stays responsive to HTTP
 * traffic while invoice generation, which does real (if modest) database
 * aggregation work, runs on its own process and can be scaled
 * independently.
 */
async function main(): Promise<void> {
  const db = createDb(process.env.NODE_ENV || 'development');
  await db.raw('SELECT 1');

  const usageRepo = new UsageRepository(db);
  const invoicesRepo = new InvoicesRepository(db);
  const orgsRepo = new OrganizationsRepository(db);
  const auditRepo = new AuditRepository(db);
  const billingService = new BillingService(usageRepo, invoicesRepo, orgsRepo, auditRepo);

  const worker = createInvoiceWorker(getQueueConnectionOptions(), billingService);

  worker.on('completed', (job) => logger.info({ jobId: job.id }, 'Job completed'));
  worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, 'Job failed'));

  logger.info('Invoice worker started, waiting for jobs...');

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down worker...');
    await worker.close();
    await db.destroy();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start worker');
  process.exit(1);
});
