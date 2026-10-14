import puppeteer from '@cloudflare/puppeteer';
import { compareSchema } from '@smartcompare/shared';
import {
  LiveComparisonService,
  SourceError,
  USER_AGENT,
  MAX_HTML_BYTES,
  digest,
  type LiveStore,
  type Source,
} from '@smartcompare/live';

export interface Env {
  DB: D1Database;
  BROWSER: Fetcher;
  ALLOWED_ORIGINS: string;
  ENABLE_BROWSER?: string;
}
export class D1Store implements LiveStore {
  constructor(private db: D1Database) {}
  async get(key: string) {
    const row = await this.db
      .prepare('SELECT value FROM cache WHERE key = ? AND expires > ?')
      .bind(key, Date.now())
      .first<{ value: string }>();
    return row?.value;
  }
  async set(key: string, value: string, ttl: number) {
    await this.db
      .prepare(
        'INSERT INTO cache(key,value,expires) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, expires=excluded.expires',
      )
      .bind(key, value, Date.now() + ttl * 1000)
      .run();
  }
  async reserve(key: string, limit: number, ttl: number) {
    const now = Date.now();
    // One conditional SQLite statement: simultaneous isolates cannot overdraw the budget.
    const row = await this.db
      .prepare(
        `INSERT INTO quotas(key, used, expires) VALUES(?,1,?)
      ON CONFLICT(key) DO UPDATE SET
        used = CASE WHEN quotas.expires <= ? THEN 1 ELSE quotas.used + 1 END,
        expires = CASE WHEN quotas.expires <= ? THEN excluded.expires ELSE quotas.expires END
      WHERE quotas.expires <= ? OR quotas.used < ? RETURNING used`,
      )
      .bind(key, now + ttl * 1000, now, now, now, limit)
      .first();
    return !!row;
  }
}
async function renderPage(env: Env, store: LiveStore, url: string, source: Source) {
  const day = new Date().toISOString().slice(0, 10);
  if (!(await store.reserve('browser-start', 1, 25)))
    throw new SourceError(
      'BROWSER_COOLDOWN',
      'Another page is using the free browser slot. Try again shortly.',
    );
  // Reserve a worst-case 60-second provider session, never refund failed starts.
  // Eight starts/day leave a two-minute safety margin under the 10-minute free allocation.
  if (!(await store.reserve('browser-day:' + day, 8, 172800)))
    throw new SourceError(
      'BROWSER_LIMIT',
      'Today’s free browser budget is used. Open the retailer directly.',
    );
  const browser = await puppeteer.launch(env.BROWSER, { keep_alive: 6000 });
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    deadline = setTimeout(() => {
      void browser.close().catch(() => {});
    }, 7000);
    const page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      // Only the approved document and its same-origin scripts/styles. No private APIs,
      // ads, tracking, images, arbitrary navigations, redirects, or third-party requests.
      const target = new URL(request.url());
      const kind = request.resourceType();
      const permitted =
        target.origin === source.origin &&
        request.method() === 'GET' &&
        ((kind === 'document' && request.url() === url && request.redirectChain().length === 0) ||
          ((kind === 'script' || kind === 'stylesheet') && /\.(?:js|css)$/.test(target.pathname)));
      void (permitted ? request.continue() : request.abort()).catch(() => {});
    });
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 4500 });
    if (!response?.ok())
      throw new SourceError('BLOCKED', 'The retailer did not allow browser access.');
    await page
      .waitForSelector(
        'script[type="application/ld+json"], [data-component-type="s-search-result"]',
        { timeout: 1000 },
      )
      .catch(() => {});
    const html = await page.content();
    if (new TextEncoder().encode(html).length > MAX_HTML_BYTES)
      throw new SourceError('TOO_LARGE', 'Rendered page exceeded the size limit.');
    return html;
  } finally {
    clearTimeout(deadline);
    await browser.close().catch(() => {});
  }
}
async function jsonBody(request: Request) {
  if (!request.headers.get('content-type')?.includes('application/json'))
    throw new SourceError('INVALID_REQUEST', 'Send a JSON comparison request.');
  if (Number(request.headers.get('content-length')) > 8192)
    throw new SourceError('INVALID_REQUEST', 'Request is too large.');
  const reader = request.body?.getReader();
  if (!reader) throw new SourceError('INVALID_REQUEST', 'Missing request body.');
  let bytes = 0,
    body = '';
  const decoder = new TextDecoder();
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      bytes += item.value.byteLength;
      if (bytes > 8192) throw new SourceError('INVALID_REQUEST', 'Request is too large.');
      body += decoder.decode(item.value, { stream: true });
    }
    return JSON.parse(body + decoder.decode()) as unknown;
  } finally {
    await reader.cancel().catch(() => {});
  }
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigins = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim());
    const headers = new Headers({
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      Vary: 'Origin',
    });
    if (allowedOrigins.includes(origin)) {
      headers.set('Access-Control-Allow-Origin', origin);
      headers.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Content-Type');
    }
    const send = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status, headers });
    if (origin && !allowedOrigins.includes(origin))
      return send(
        { success: false, error: { code: 'ORIGIN_DENIED', message: 'Origin is not allowed.' } },
        403,
      );
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    const path = new URL(request.url).pathname;
    if (path === '/health' && request.method === 'GET')
      return send({
        status: 'ok',
        mode: 'experimental',
        browserEnabled: env.ENABLE_BROWSER === 'true',
      });
    if (!['/api/v1/compare', '/api/v1/compare/live'].includes(path) || request.method !== 'POST')
      return send(
        { success: false, error: { code: 'NOT_FOUND', message: 'Endpoint not found.' } },
        404,
      );
    try {
      const parsed = compareSchema.safeParse(await jsonBody(request));
      if (!parsed.success)
        return send(
          {
            success: false,
            error: {
              code: 'INVALID_REQUEST',
              message: 'Check the product name or URL, location and preference.',
            },
          },
          400,
        );
      const store = new D1Store(env.DB);
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const minute = Math.floor(Date.now() / 60000);
      if (!(await store.reserve('client:' + (await digest(ip + ':' + minute)), 10, 120)))
        return send(
          {
            success: false,
            error: {
              code: 'RATE_LIMITED',
              message: 'Please wait a minute before searching again.',
            },
          },
          429,
        );
      const service = new LiveComparisonService(
        store,
        env.ENABLE_BROWSER === 'true'
          ? (url, source) => renderPage(env, store, url, source)
          : undefined,
      );
      return send(await service.compare(parsed.data));
    } catch (error) {
      if (
        error instanceof SyntaxError ||
        (error instanceof SourceError && error.code === 'INVALID_REQUEST')
      )
        return send(
          {
            success: false,
            error: { code: 'INVALID_REQUEST', message: 'Invalid comparison request.' },
          },
          400,
        );
      // Quota/cache storage failures fail closed: never spend browser time without accounting.
      return send(
        {
          success: false,
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Comparison storage is unavailable. Check the deployment and try again later.',
          },
        },
        503,
      );
    }
  },
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      env.DB.batch([
        env.DB.prepare('DELETE FROM cache WHERE expires <= ?').bind(Date.now()),
        env.DB.prepare('DELETE FROM quotas WHERE expires <= ?').bind(Date.now()),
      ]),
    );
  },
};
