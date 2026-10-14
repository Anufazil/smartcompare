import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import {
  createMockConnectors,
  defaultLocation,
  type CommerceConnector,
} from '@smartcompare/shared';
import { createApp } from '../src/app';
import { ConnectorRegistry } from '../src/connectors/registry';
import { ConnectorError } from '../src/utils/errors';
import { DefaultComparisonService } from '../src/services/comparison-service';
import {
  MemoryComparisonCache,
  RedisComparisonCache,
  createComparisonCacheKey,
} from '../src/cache/comparison-cache';
const payload = { query: 'iPhone 15', ...defaultLocation, preference: 'balanced' as const };
function setup(connectors = createMockConnectors(), limit = 30) {
  const registry = new ConnectorRegistry();
  connectors.forEach((c) => registry.register(c, { retries: 0 }));
  const cache = new MemoryComparisonCache();
  return {
    app: createApp(new DefaultComparisonService(registry, cache), { rateLimit: limit }),
    cache,
    registry,
  };
}
describe('comparison API', () => {
  it('responds with real calculation, fees, score and request id', async () => {
    const { app } = setup();
    const res = await request(app).post('/api/v1/compare').send(payload);
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(4);
    expect(res.headers['x-request-id']).toBeTruthy();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(
      res.body.results.filter((r: { isRecommended: boolean }) => r.isRecommended),
    ).toHaveLength(1);
  });
  it.each([
    { ...payload, lat: 91 },
    { ...payload, lng: -181 },
    { ...payload, query: 'x' },
    { ...payload, query: '<script>' },
    { ...payload, preference: 'random' },
    {},
  ])('rejects invalid or missing fields', async (body) =>
    expect((await request(setup().app).post('/api/v1/compare').send(body)).status).toBe(400),
  );
  it('uses a cache hit only after the first request', async () => {
    const { app } = setup();
    const a = await request(app).post('/api/v1/compare').send(payload),
      b = await request(app).post('/api/v1/compare').send(payload);
    expect(a.body.metadata.cached).toBe(false);
    expect(b.body.metadata.cached).toBe(true);
    expect(a.body.results).toEqual(b.body.results);
  });
  it('isolates location and preference in hashed cache keys', () => {
    const base = createComparisonCacheKey(payload);
    expect(base).not.toBe(createComparisonCacheKey({ ...payload, pincode: '560002' }));
    expect(base).not.toBe(createComparisonCacheKey({ ...payload, lat: 13 }));
    expect(base).not.toBe(createComparisonCacheKey({ ...payload, preference: 'fastest' }));
    expect(base).toMatch(/^smartcompare:compare:[a-f0-9]{64}$/);
  });
  it('returns successful stores when one fails, without caching the partial result', async () => {
    const connectors = createMockConnectors();
    connectors[0]!.search = async () => {
      throw new ConnectorError('Amazon');
    };
    const { app } = setup(connectors);
    const res = await request(app).post('/api/v1/compare').send(payload);
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(3);
    expect(
      res.body.metadata.connectorStatuses.filter((s: { success: boolean }) => !s.success),
    ).toHaveLength(1);
    expect((await request(app).post('/api/v1/compare').send(payload)).body.metadata.cached).toBe(
      false,
    );
  });
  it('returns a controlled 503 when every connector fails', async () => {
    const c = createMockConnectors();
    c.forEach(
      (x) =>
        (x.search = async () => {
          throw Error('secret database password');
        }),
    );
    const res = await request(setup(c).app).post('/api/v1/compare').send(payload);
    expect(res.status).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain('secret');
  });
  it('returns an empty result instead of fabricating a match', async () => {
    const res = await request(setup().app)
      .post('/api/v1/compare')
      .send({ ...payload, query: 'product absent from catalog' });
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([]);
  });
  it('rate limits comparisons', async () => {
    const { app } = setup(undefined, 1);
    await request(app).post('/api/v1/compare').send(payload);
    expect((await request(app).post('/api/v1/compare').send(payload)).status).toBe(429);
  });
  it('rejects malformed JSON and oversized input without internal errors', async () => {
    const { app } = setup();
    expect((await request(app).post('/api/v1/compare').type('json').send('{oops')).status).toBe(
      400,
    );
    expect(
      (
        await request(app)
          .post('/api/v1/compare')
          .send({ ...payload, query: 'a'.repeat(18000) })
      ).status,
    ).toBe(413);
  });
  it('continues when persistence fails', async () => {
    const { registry, cache } = setup();
    const service = new DefaultComparisonService(registry, cache, {
      save: async () => {
        throw Error('database offline');
      },
    });
    const r = await service.compare(payload);
    expect(r.metadata.storage).toBe('unavailable');
    expect(r.results).toHaveLength(4);
  });
  it('falls back to process memory if Redis fails', async () => {
    const redis = {
      get: async () => {
        throw Error();
      },
      set: async () => {
        throw Error();
      },
      del: async () => {
        throw Error();
      },
    };
    const cache = new RedisComparisonCache(
      redis as unknown as ConstructorParameters<typeof RedisComparisonCache>[0],
    );
    const response = await new DefaultComparisonService(setup().registry, cache).compare(payload);
    await cache.set('key', response);
    expect((await cache.get('key'))?.results).toHaveLength(4);
  });
});
describe('connector resilience', () => {
  it('opens, probes and closes the circuit breaker', async () => {
    const search = vi
      .fn<CommerceConnector['search']>()
      .mockRejectedValue(new ConnectorError('Test'));
    const registry = new ConnectorRegistry();
    registry.register(
      { platform: 'Test', category: 'ECOMMERCE', search },
      { retries: 0, failureThreshold: 2, resetMs: 1 },
    );
    await registry.searchAll({ query: 'milk', location: defaultLocation });
    await registry.searchAll({ query: 'milk', location: defaultLocation });
    expect(search).toHaveBeenCalledTimes(2);
    await new Promise((r) => setTimeout(r, 5));
    search.mockResolvedValue([]);
    await registry.searchAll({ query: 'milk', location: defaultLocation });
    expect(search).toHaveBeenCalledTimes(3);
  });
  it('bounds timeout and passes an aborted signal', async () => {
    let signal: AbortSignal | undefined;
    const registry = new ConnectorRegistry();
    registry.register(
      {
        platform: 'slow',
        category: 'ECOMMERCE',
        search: async (r) => {
          signal = r.signal;
          return new Promise(() => {});
        },
      },
      { timeoutMs: 10, retries: 0 },
    );
    const r = await registry.searchAll({ query: 'milk', location: defaultLocation });
    expect(r.statuses[0]?.code).toBe('CONNECTOR_TIMEOUT');
    expect(signal?.aborted).toBe(true);
  });
  it('does not retry permanent authentication errors', async () => {
    const search = vi
      .fn<CommerceConnector['search']>()
      .mockRejectedValue(new ConnectorError('Test', 'UNAUTHORIZED', false));
    const registry = new ConnectorRegistry();
    registry.register({ platform: 'Test', category: 'ECOMMERCE', search });
    await registry.searchAll({ query: 'milk', location: defaultLocation });
    expect(search).toHaveBeenCalledTimes(1);
  });
  it('enforces platform concurrency', async () => {
    let finish: ((v: []) => void) | undefined;
    const registry = new ConnectorRegistry();
    registry.register(
      {
        platform: 'Test',
        category: 'ECOMMERCE',
        search: async () =>
          new Promise<[]>((r) => {
            finish = r;
          }),
      },
      { concurrency: 1, retries: 0 },
    );
    const pending = registry.search('Test', { query: 'milk', location: defaultLocation });
    await expect(
      registry.search('Test', { query: 'milk', location: defaultLocation }),
    ).rejects.toMatchObject({ code: 'CONNECTOR_THROTTLED' });
    finish?.([]);
    await pending;
  });
});
