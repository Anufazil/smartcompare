import { Queue, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import type { CompareRequest, CompareResponse } from '@smartcompare/shared';
import type { ComparisonService } from '../services/comparison-service';
import { ExternalServiceError } from '../utils/errors';
export const queueNames = {
  comparison: 'comparison-search',
  fetch: 'platform-fetch',
  matching: 'product-matching',
} as const;
export function queueConnection(url: string) {
  return new Redis(url, { maxRetriesPerRequest: null, connectTimeout: 1500 });
}
export function createQueues(connection: Redis) {
  const settings = {
    connection,
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 100 },
      timeout: 14000,
    },
  };
  return {
    comparison: new Queue(queueNames.comparison, settings),
    fetch: new Queue(queueNames.fetch, settings),
    matching: new Queue(queueNames.matching, settings),
  };
}
export class QueuedComparisonService implements ComparisonService {
  constructor(
    private queue: Queue,
    private events: QueueEvents,
  ) {}
  async compare(request: CompareRequest, requestId?: string): Promise<CompareResponse> {
    const job = await this.queue.add('compare', {
      request,
      requestId,
      deadline: Date.now() + 14000,
    });
    try {
      return (await job.waitUntilFinished(this.events, 14000)) as CompareResponse;
    } catch {
      throw new ExternalServiceError();
    }
  }
}
