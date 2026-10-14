import { createServer } from 'node:http';
import { QueueEvents } from 'bullmq';
import { createRuntime } from './config/runtime';
import { env } from './config/env';
import { createApp } from './app';
import { logger } from './utils/logger';
import { createQueues, QueuedComparisonService, queueConnection, queueNames } from './queues';
const runtime = await createRuntime();
const connection =
  env.USE_QUEUE === 'true' && env.REDIS_URL ? queueConnection(env.REDIS_URL) : undefined;
if (env.USE_QUEUE === 'true' && !connection) throw new Error('Queue mode requires REDIS_URL');
const queues = connection ? createQueues(connection) : undefined;
const events = connection ? new QueueEvents(queueNames.comparison, { connection }) : undefined;
if (events) await events.waitUntilReady();
const service =
  queues && events ? new QueuedComparisonService(queues.comparison, events) : runtime.service;
const app = createApp(service, {
  redis: runtime.redis,
  health: async () => ({
    redis: runtime.redis?.status ?? 'disabled',
    postgres: runtime.db ? 'connected' : 'disabled',
    queue: !!queues,
  }),
});
const server = createServer(app);
server.requestTimeout = 15000;
server.headersTimeout = 16000;
server.listen(env.API_PORT, env.API_HOST, () =>
  logger.info({ port: env.API_PORT }, 'server.ready'),
);
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close();
  await Promise.allSettled([
    runtime.close(),
    events?.close(),
    ...(queues ? Object.values(queues).map((q) => q.close()) : []),
  ]);
  await connection?.quit();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
