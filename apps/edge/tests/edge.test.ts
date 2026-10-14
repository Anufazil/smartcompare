import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
import { defaultLocation } from '@smartcompare/shared';
vi.mock('@cloudflare/puppeteer', () => ({ default: { launch: vi.fn() } }));
import handler, { D1Store, type Env } from '../src';
function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/0001_cache.sql', import.meta.url), 'utf8'));
  return {
    sqlite,
    db: {
      prepare(sql: string) {
        let bindings: SQLInputValue[] = [];
        return {
          bind(...values: SQLInputValue[]) {
            bindings = values;
            return this;
          },
          async first() {
            return sqlite.prepare(sql).get(...bindings) ?? null;
          },
          async run() {
            return sqlite.prepare(sql).run(...bindings);
          },
        };
      },
    } as unknown as D1Database,
  };
}
describe('Cloudflare persistence and API', () => {
  it('enforces atomic D1 quotas and expiry using the actual migration SQL', async () => {
    const { db, sqlite } = database();
    try {
      const store = new D1Store(db);
      const reservations = await Promise.all(
        Array.from({ length: 30 }, () => store.reserve('browser', 8, 60)),
      );
      expect(reservations.filter(Boolean)).toHaveLength(8);
      sqlite.exec('UPDATE quotas SET expires = 0');
      expect(await store.reserve('browser', 8, 60)).toBe(true);
      expect(sqlite.prepare('SELECT used FROM quotas').get()?.used).toBe(1);
      await store.set('observation', 'first', 3600);
      await store.set('observation', 'second', 3600);
      expect(await store.get('observation')).toBe('second');
      sqlite.exec('UPDATE cache SET expires = 0');
      expect(await store.get('observation')).toBeUndefined();
    } finally {
      sqlite.close();
    }
  });
  it('rejects an unapproved origin before reading input or consuming quota', async () => {
    const env = { ALLOWED_ORIGINS: 'https://smartcompare.example' } as Env;
    const result = await handler.fetch(
      new Request('https://api.example/api/v1/compare/live', {
        method: 'POST',
        headers: { Origin: 'https://evil.example' },
        body: '{}',
      }),
      env,
    );
    expect(result.status).toBe(403);
    expect(result.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
  it('allows configured preflight and rejects invalid request data', async () => {
    const env = { ALLOWED_ORIGINS: 'https://smartcompare.example' } as Env;
    const preflight = await handler.fetch(
      new Request('https://api.example/api/v1/compare/live', {
        method: 'OPTIONS',
        headers: { Origin: 'https://smartcompare.example' },
      }),
      env,
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://smartcompare.example',
    );
    for (const body of ['{', JSON.stringify({ query: 'x', lat: 200 }), 'x'.repeat(9000)]) {
      const result = await handler.fetch(
        new Request('https://api.example/api/v1/compare/live', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        }),
        env,
      );
      expect(result.status).toBe(400);
    }
  });
  it('fails closed when budget storage is unavailable', async () => {
    const env = { ALLOWED_ORIGINS: '' } as Env;
    const result = await handler.fetch(
      new Request('https://api.example/api/v1/compare/live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'Dove shampoo', ...defaultLocation }),
      }),
      env,
    );
    expect(result.status).toBe(503);
  });
});
