import { Worker } from 'bullmq';
import { matchProduct } from '@smartcompare/shared';
import { createRuntime } from '../../api/src/config/runtime';
import { env } from '../../api/src/config/env';
import { logger } from '../../api/src/utils/logger';
import { queueConnection, queueNames } from '../../api/src/queues';
import { ExternalServiceError } from '../../api/src/utils/errors';
const runtime = await createRuntime();
if (!env.REDIS_URL) throw new Error('REDIS_URL is required for workers');
const connection = queueConnection(env.REDIS_URL);
const comparison = new Worker(
  queueNames.comparison,
  async (job) => {
    if (job.data.deadline < Date.now()) throw new ExternalServiceError();
    return runtime.service.compare(job.data.request, job.data.requestId);
  },
  { connection, concurrency: 4, limiter: { max: 30, duration: 60000 } },
);
const fetchWorker = new Worker(
  queueNames.fetch,
  async (job) => {
    return runtime.registry.search(job.data.platform, {
      ...job.data.request,
      signal: AbortSignal.timeout(10000),
    });
  },
  { connection, concurrency: 2, limiter: { max: 30, duration: 60000 } },
);
const matching = new Worker(
  queueNames.matching,
  async (job) => matchProduct(job.data.title, job.data.canonicalTitle, job.data.canonicalProductId),
  { connection, concurrency: 4 },
);
const workers = [comparison, fetchWorker, matching];
workers.forEach((worker) => {
  worker.on('failed', (job, error) =>
    logger.error({ queue: worker.name, jobId: job?.id, errorType: error.name }, 'job.failed'),
  );
  worker.on('error', (error) =>
    logger.error({ queue: worker.name, errorType: error.name }, 'worker.error'),
  );
});
logger.info('workers.ready');
async function shutdown() {
  await Promise.all(workers.map((w) => w.close()));
  await connection.quit();
  await runtime.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
