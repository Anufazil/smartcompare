import assert from 'node:assert/strict';
import { QueueEvents, Worker } from 'bullmq';
import { createRuntime } from '../src/config/runtime';
import { createQueues, queueConnection, queueNames } from '../src/queues';
import { createComparisonCacheKey, invalidateComparisonCache } from '../src/cache/comparison-cache';
import { defaultLocation } from '@smartcompare/shared';
const runtime = await createRuntime();
assert(runtime.db, 'A live PostgreSQL instance is required');
assert(runtime.redis, 'A live Redis instance is required');
const connection = queueConnection(process.env.REDIS_URL!);
const queues = createQueues(connection);
const events = new QueueEvents(queueNames.comparison, { connection });
const worker = new Worker(
  queueNames.comparison,
  (job) => runtime.service.compare(job.data.request),
  { connection, concurrency: 1 },
);
try {
  await events.waitUntilReady();
  await worker.waitUntilReady();
  const input = { query: 'iPhone 15', ...defaultLocation, preference: 'balanced' as const };
  await invalidateComparisonCache(runtime.cache, input);
  const first = await runtime.service.compare(input, 'integration');
  assert.equal(first.metadata.cached, false);
  assert.equal(first.metadata.storage, 'persisted');
  const second = await runtime.service.compare(input, 'integration');
  assert.equal(second.metadata.cached, true);
  const ttl = await runtime.redis.ttl(createComparisonCacheKey(input));
  assert(ttl > 0 && ttl <= 300);
  assert.equal(await runtime.db.platform.count(), 4);
  assert.equal(await runtime.db.canonicalProduct.count(), 5);
  assert((await runtime.db.platformPosting.count()) >= 18);
  const job = await queues.comparison.add('integration', { request: input });
  const result = await job.waitUntilFinished(events, 15000);
  assert.equal(result.results.length, 4);
  await invalidateComparisonCache(runtime.cache, input);
  assert.equal(await runtime.redis.exists(createComparisonCacheKey(input)), 0);
  console.log(
    'PostgreSQL seed and persistence, Redis TTL/invalidation, and BullMQ round trip passed.',
  );
} finally {
  await worker.close();
  await events.close();
  await Promise.all(Object.values(queues).map((q) => q.close()));
  await connection.quit();
  await runtime.close();
}
