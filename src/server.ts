import 'dotenv/config';
import { createApp } from './app';
import { createDb } from './db';
import { createRedisClient } from './common/cache/cacheService';
import { createInvoiceQueue } from './jobs/invoiceQueue';
import { getQueueConnectionOptions } from './jobs/connection';
import { logger } from './common/observability/logger';

const PORT = Number(process.env.PORT) || 4003;

async function main(): Promise<void> {
  const db = createDb(process.env.NODE_ENV || 'development');
  await db.raw('SELECT 1');
  logger.info('Database connection established.');

  const redis = createRedisClient();
  const invoiceQueue = createInvoiceQueue(getQueueConnectionOptions());

  const app = createApp({ db, redis, invoiceQueue });
  const server = app.listen(PORT, () => {
    logger.info({ port: PORT }, 'Multi-Tenant SaaS Platform listening');
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down gracefully...');
    server.close(async () => {
      await invoiceQueue.close();
      await redis.quit();
      await db.destroy();
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});
