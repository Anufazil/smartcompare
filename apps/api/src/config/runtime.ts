import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { createMockConnectors } from '@smartcompare/shared';
import { MemoryComparisonCache, RedisComparisonCache } from '../cache/comparison-cache';
import { ConnectorRegistry } from '../connectors/registry';
import { DefaultComparisonService } from '../services/comparison-service';
import { PrismaListingRepository } from '../services/repository';
import { allowDegraded, env } from './env';
import { logger } from '../utils/logger';
export async function createRuntime() {
  const registry = new ConnectorRegistry();
  createMockConnectors().forEach((c) => registry.register(c));
  let redis: Redis | undefined;
  let db: PrismaClient | undefined;
  if (env.REDIS_URL) {
    redis = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 1000,
      commandTimeout: 1000,
      retryStrategy: (n) => (n <= 3 ? n * 250 : null),
    });
    redis.on('error', () => logger.warn('redis.unavailable'));
    try {
      await redis.connect();
      await redis.ping();
    } catch (error) {
      if (!allowDegraded) throw error;
      logger.warn('Using process-local development cache');
      redis.disconnect();
      redis = undefined;
    }
  } else if (!allowDegraded) throw new Error('REDIS_URL is required');
  if (env.DATABASE_URL) {
    const databaseUrl = new URL(env.DATABASE_URL);
    databaseUrl.searchParams.set('connect_timeout', '2');
    databaseUrl.searchParams.set('pool_timeout', '2');
    db = new PrismaClient({ datasourceUrl: databaseUrl.toString() });
    try {
      await db.$connect();
    } catch (error) {
      if (!allowDegraded) throw error;
      logger.warn('database.unavailable');
      await db.$disconnect();
      db = undefined;
    }
  } else if (!allowDegraded) throw new Error('DATABASE_URL is required');
  const cache = redis ? new RedisComparisonCache(redis) : new MemoryComparisonCache();
  const service = new DefaultComparisonService(
    registry,
    cache,
    db ? new PrismaListingRepository(db) : undefined,
  );
  return {
    registry,
    cache,
    service,
    redis,
    db,
    async close() {
      await Promise.allSettled([redis?.quit(), db?.$disconnect()]);
    },
  };
}
