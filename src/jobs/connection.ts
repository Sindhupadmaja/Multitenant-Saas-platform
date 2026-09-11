import { ConnectionOptions } from 'bullmq';

/** BullMQ requires `maxRetriesPerRequest: null` on its Redis connection
 * (its docs are explicit about this -- it manages retries itself and a
 * finite limit here can cause blocking commands to fail silently). This is
 * why the job queue doesn't just reuse the ioredis client from
 * cacheService.ts -- different libraries, different connection
 * requirements, so they get separate connections. */
export function getQueueConnectionOptions(): ConnectionOptions {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port) || 6379,
    maxRetriesPerRequest: null,
  };
}
