import { createHash } from 'node:crypto';
import type { Redis } from 'ioredis';
import { normalizeTitle, type CompareRequest, type CompareResponse } from '@smartcompare/shared';
import { logger } from '../utils/logger';
export const CACHE_TTL_SECONDS = 300;
export function createComparisonCacheKey(request: CompareRequest) {
  const canonical = JSON.stringify([
    normalizeTitle(request.query),
    request.lat.toFixed(6),
    request.lng.toFixed(6),
    request.pincode ?? '',
    request.preference,
    'fixtures-v1',
  ]);
  return 'smartcompare:compare:' + createHash('sha256').update(canonical).digest('hex');
}
export interface ComparisonCache {
  get(key: string): Promise<CompareResponse | undefined>;
  set(key: string, value: CompareResponse): Promise<void>;
  invalidate(key: string): Promise<void>;
}
export class MemoryComparisonCache implements ComparisonCache {
  private values = new Map<string, { expires: number; value: CompareResponse }>();
  async get(key: string) {
    const entry = this.values.get(key);
    if (!entry || entry.expires <= Date.now()) {
      this.values.delete(key);
      return undefined;
    }
    return structuredClone(entry.value);
  }
  async set(key: string, value: CompareResponse) {
    if (this.values.size >= 500) this.values.delete(this.values.keys().next().value!);
    this.values.set(key, {
      expires: Date.now() + CACHE_TTL_SECONDS * 1000,
      value: structuredClone(value),
    });
  }
  async invalidate(key: string) {
    this.values.delete(key);
  }
}
export class RedisComparisonCache implements ComparisonCache {
  constructor(
    private redis: Redis,
    private fallback: ComparisonCache = new MemoryComparisonCache(),
  ) {}
  async get(key: string) {
    try {
      const value = await this.redis.get(key);
      return value ? (JSON.parse(value) as CompareResponse) : undefined;
    } catch {
      logger.warn('cache.read_unavailable');
      return this.fallback.get(key);
    }
  }
  async set(key: string, value: CompareResponse) {
    await this.fallback.set(key, value);
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', CACHE_TTL_SECONDS);
    } catch {
      logger.warn('cache.write_unavailable');
    }
  }
  async invalidate(key: string) {
    await this.fallback.invalidate(key);
    await this.redis.del(key);
  }
}
export const getComparisonCache = (cache: ComparisonCache, request: CompareRequest) =>
  cache.get(createComparisonCacheKey(request));
export const setComparisonCache = (
  cache: ComparisonCache,
  request: CompareRequest,
  value: CompareResponse,
) => cache.set(createComparisonCacheKey(request), value);
export const invalidateComparisonCache = (cache: ComparisonCache, request: CompareRequest) =>
  cache.invalidate(createComparisonCacheKey(request));
