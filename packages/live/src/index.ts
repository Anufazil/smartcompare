import { load } from 'cheerio/slim';
import robotsParser from 'robots-parser';
import {
  attributes,
  compareSchema,
  normalizeTitle,
  rankListings,
  type CompareRequest,
  type CompareResponse,
  type NormalizedListing,
} from '@smartcompare/shared';

export const USER_AGENT = 'SmartCompareBot/1.0';
export const MAX_HTML_BYTES = 1_000_000;
export const ROBOTS_TIMEOUT_MS = 6_000;
export const SOURCE_TIMEOUT_MS = 8_000;
export interface Source {
  name: string;
  origin: string;
  searchPath: string;
  productPath: RegExp;
  category: 'ECOMMERCE' | 'QUICK_COMMERCE';
}
export const sources: Source[] = [
  {
    name: 'Amazon',
    origin: 'https://www.amazon.in',
    searchPath: '/s?k=',
    productPath: /\/(?:dp|gp\/product)\/[A-Z0-9]{10}(?:\/|$)/i,
    category: 'ECOMMERCE',
  },
  {
    name: 'Flipkart',
    origin: 'https://www.flipkart.com',
    searchPath: '/search?q=',
    productPath: /\/p\/[a-z0-9]+(?:\/|$)/i,
    category: 'ECOMMERCE',
  },
  {
    name: 'Blinkit',
    origin: 'https://blinkit.com',
    searchPath: '/s/?q=',
    productPath: /^\/prn\/[^/]+\/prid\/\d+\/?$/,
    category: 'QUICK_COMMERCE',
  },
  {
    name: 'Swiggy Instamart',
    origin: 'https://www.swiggy.com',
    searchPath: '/instamart/search?query=',
    productPath: /^\/instamart\/p\/[a-z0-9-]+\/?$/i,
    category: 'QUICK_COMMERCE',
  },
];
export class SourceError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function sourceForUrl(value: string): Source | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return undefined;
    return sources.find((s) => s.origin === url.origin && s.productPath.test(url.pathname));
  } catch {
    return undefined;
  }
}
export function searchLinks(query: string) {
  const q = /^https?:\/\//i.test(query) ? 'product price comparison India' : query;
  return [
    ...sources.map((s) => ({
      platform: s.name,
      url: s.origin + s.searchPath + encodeURIComponent(q),
    })),
    {
      platform: 'Google Shopping',
      url: 'https://www.google.com/search?tbm=shop&q=' + encodeURIComponent(q),
    },
  ];
}
export function allowedByRobots(text: string, target: string) {
  const parser = robotsParser(new URL('/robots.txt', target).href, text);
  const delay = parser.getCrawlDelay(USER_AGENT);
  return parser.isAllowed(target, USER_AGENT) !== false && (!delay || delay <= 1);
}
export async function boundedText(response: Response, max = MAX_HTML_BYTES) {
  if (Number(response.headers.get('content-length')) > max) {
    await response.body?.cancel();
    throw new SourceError(
      'TOO_LARGE',
      'The source page is too large to read within the free limits.',
    );
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '',
    bytes = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      bytes += result.value.byteLength;
      if (bytes > max)
        throw new SourceError(
          'TOO_LARGE',
          'The source page is too large to read within the free limits.',
        );
      text += decoder.decode(result.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
  }
}
export function blockedPage(html: string) {
  const $ = load(html);
  const title = $('title').text();
  return (
    /captcha|robot check|access denied|request blocked|just a moment/i.test(title) ||
    /your request looks automated|enter the characters you see below|verify you are human/i.test(
      $('body').text(),
    ) ||
    $('#captchacharacters, #challenge-form, form[action*="validateCaptcha"]').length > 0
  );
}
type RecordValue = Record<string, unknown>;
const record = (v: unknown): RecordValue | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as RecordValue) : undefined;
const string = (v: unknown) => (typeof v === 'string' ? v : '');
const list = (v: unknown): unknown[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
function price(value: unknown): number | undefined {
  const cleaned =
    typeof value === 'number' ? String(value) : string(value).replace(/,/g, '').trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(cleaned)) return undefined;
  const n = Number(cleaned);
  return n > 0 && n < 100_000_000 ? n : undefined;
}
function relevant(title: string, query: string) {
  if (sourceForUrl(query)) return true;
  const haystack = normalizeTitle(title).split(' ');
  const wanted = normalizeTitle(query).split(' ').filter(Boolean);
  if (!wanted.every((t) => haystack.includes(t))) return false;
  const a = attributes(query),
    b = attributes(title);
  return !(['size', 'unit', 'model', 'color', 'brand'] as const).some(
    (k) => a[k] !== undefined && a[k] !== b[k],
  );
}
function productUrl(value: string, source: Source, base: string): string | undefined {
  try {
    const u = new URL(value, base);
    if (u.origin !== source.origin || !sourceForUrl(u.href)) return undefined;
    u.hash = '';
    // Retailer product IDs in these supported paths identify the product without tracking params.
    u.search = '';
    return u.href;
  } catch {
    return undefined;
  }
}
export function extractListings(
  html: string,
  pageUrl: string,
  source: Source,
  request: CompareRequest,
): NormalizedListing[] {
  if (blockedPage(html))
    throw new SourceError(
      'BLOCKED',
      'The retailer blocked automated access. Open its search directly.',
    );
  const $ = load(html);
  const output: NormalizedListing[] = [];
  const observedAt = new Date().toISOString();
  const add = (title: string, amount: unknown, url: string, availability = '', gtin = '') => {
    const basePrice = price(amount),
      product = productUrl(url, source, pageUrl);
    if (!basePrice || !product || !title || title.length > 400 || !relevant(title, request.query))
      return;
    const inStock = /(?:^|\/)InStock$/i.test(availability);
    const outOfStock = /(?:^|\/)(?:OutOfStock|SoldOut|Discontinued)$/i.test(availability);
    output.push({
      platform: source.name,
      category: source.category,
      externalId: product,
      // Deliberately conservative: fuzzy matches and different pack sizes never share a winner.
      canonicalProductId: 'observed:' + (/^\d{8,14}$/.test(gtin) ? gtin : normalizeTitle(title)),
      title: title.trim(),
      productUrl: product,
      basePrice,
      available: inStock,
      location: { lat: request.lat, lng: request.lng, pincode: request.pincode },
      metadata: {
        observed: true,
        observedAt,
        sourceUrl: pageUrl,
        stock: inStock ? 'in_stock' : outOfStock ? 'out_of_stock' : 'unknown',
        locationVerified: false,
      },
    });
  };
  function visit(value: unknown, depth = 0) {
    if (depth > 12 || output.length >= 24) return;
    if (Array.isArray(value)) {
      value.slice(0, 100).forEach((v) => visit(v, depth + 1));
      return;
    }
    const node = record(value);
    if (!node) return;
    if (list(node['@type']).some((t) => /(?:^|\/)Product$/.test(string(t)))) {
      for (const item of list(node.offers).slice(0, 8)) {
        const offer = record(item);
        if (!offer || string(offer.priceCurrency).toUpperCase() !== 'INR') continue;
        // Aggregate lowPrice is a range, not a verified offer for a selected variant.
        if (string(offer['@type']).includes('AggregateOffer')) continue;
        const until = Date.parse(string(offer.priceValidUntil));
        if (Number.isFinite(until) && until + 86400000 < Date.now()) continue;
        const title = string(node.name);
        const identifier =
          string(node.gtin13) || string(node.gtin14) || string(node.gtin8) || string(node.gtin);
        add(
          title,
          offer.price,
          string(offer.url) || string(node.url) || pageUrl,
          string(offer.availability),
          identifier,
        );
      }
    }
    for (const [key, child] of Object.entries(node)) if (key !== 'offers') visit(child, depth + 1);
  }
  $('script[type="application/ld+json"]')
    .slice(0, 30)
    .each((_, el) => {
      try {
        visit(JSON.parse($(el).text()));
      } catch {
        /* Ignore invalid publisher metadata. */
      }
    });
  // Scoped selectors: never associate an unrelated or crossed-out MRP with a product.
  if (source.name === 'Amazon') {
    $('[data-component-type="s-search-result"]')
      .slice(0, 24)
      .each((_, el) => {
        const card = $(el),
          title = card
            .find('h2')
            .map((_, heading) => $(heading).text().trim())
            .get()
            .join(' ');
        const amount = card.find('.a-price:not(.a-text-price) .a-offscreen').first().text();
        if (!amount.includes('₹')) return;
        add(
          title,
          amount.replace('₹', '').trim(),
          card.find('a:has(h2), h2 a').first().attr('href') || '',
        );
      });
    if (sourceForUrl(pageUrl)) {
      const amount = $('#corePrice_feature_div .a-price:not(.a-text-price) .a-offscreen')
        .first()
        .text();
      if (amount.includes('₹'))
        add($('#productTitle').text().trim(), amount.replace('₹', '').trim(), pageUrl);
    }
  }
  return [...new Map(output.map((v) => [v.externalId, v])).values()].slice(0, 24);
}
export interface LiveStore {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, ttl: number): Promise<void>;
  reserve(key: string, limit: number, ttl: number): Promise<boolean>;
}
export class MemoryLiveStore implements LiveStore {
  private values = new Map<string, { value: string; expires: number }>();
  async get(key: string) {
    const entry = this.values.get(key);
    if (!entry || entry.expires <= Date.now()) {
      this.values.delete(key);
      return undefined;
    }
    return entry.value;
  }
  async set(key: string, value: string, ttl: number) {
    if (this.values.size >= 500) {
      for (const [k, v] of this.values) if (v.expires <= Date.now()) this.values.delete(k);
      if (this.values.size >= 500)
        throw new SourceError('CAPACITY', 'Local cache is full. Try again later.');
    }
    this.values.set(key, { value, expires: Date.now() + ttl * 1000 });
  }
  async reserve(key: string, limit: number, ttl: number) {
    // No await between read and update: reservations stay atomic in the local process.
    const entry = this.values.get(key);
    const count = entry && entry.expires > Date.now() ? Number(entry.value) : 0;
    if (count >= limit) return false;
    const expires = entry && entry.expires > Date.now() ? entry.expires : Date.now() + ttl * 1000;
    if (!entry && this.values.size >= 500) return false;
    this.values.set(key, { value: String(count + 1), expires });
    return true;
  }
}
export async function digest(value: string) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
export type Renderer = (url: string, source: Source) => Promise<string>;
export class LiveComparisonService {
  constructor(
    private store: LiveStore,
    private render?: Renderer,
    private fetcher: typeof fetch = fetch,
  ) {}
  private async permitted(target: string) {
    const url = new URL('/robots.txt', target).href;
    const key = 'robots:' + url;
    let body = await this.store.get(key);
    if (body === undefined) {
      const r = await this.fetcher(url, {
        redirect: 'manual',
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(ROBOTS_TIMEOUT_MS),
      });
      if (r.status === 404) body = 'User-agent: *\nAllow: /';
      else {
        if (!r.ok || !(r.headers.get('content-type') || '').includes('text/plain')) {
          await r.body?.cancel();
          throw new SourceError(
            'POLICY_UNAVAILABLE',
            'Could not verify this retailer’s access rules. Open its search directly.',
          );
        }
        body = await boundedText(r, 128000);
      }
      await this.store.set(key, body, 3600);
    }
    if (!allowedByRobots(body, target))
      throw new SourceError(
        'ROBOTS_DISALLOWED',
        'This page disallows automated access. Open it directly.',
      );
  }
  private async read(source: Source, target: string, request: CompareRequest) {
    await this.permitted(target);
    if (!(await this.store.reserve('source:' + source.name, 1, 30)))
      throw new SourceError(
        'SOURCE_COOLDOWN',
        'This source is cooling down. Please try again in 30 seconds.',
      );
    let r: Response;
    try {
      r = await this.fetcher(target, {
        redirect: 'manual',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html',
          'Accept-Language': 'en-IN,en;q=0.9',
        },
        signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS),
      });
    } catch (error) {
      // Browser Run is deliberately an Amazon-only last attempt. It is used only after
      // robots permission was verified and an ordinary Cloudflare fetch timed out.
      if (error instanceof DOMException && error.name === 'TimeoutError' && this.render && source.name === 'Amazon') {
        const rendered = await this.render(target, source);
        return extractListings(rendered, target, source, request);
      }
      if (error instanceof DOMException && error.name === 'TimeoutError')
        throw new SourceError('TIMEOUT', 'This source did not respond within the search limits.');
      throw error;
    }
    if (!r.ok) {
      await r.body?.cancel();
      throw new SourceError(
        r.status === 429
          ? 'RATE_LIMITED'
          : r.status >= 300 && r.status < 400
            ? 'REDIRECT'
            : 'BLOCKED',
        'The retailer could not be read automatically. Open it directly.',
      );
    }
    if (!(r.headers.get('content-type') || '').includes('text/html')) {
      await r.body?.cancel();
      throw new SourceError('UNSUPPORTED', 'This source did not return a product page.');
    }
    const html = await boundedText(r);
    let listings = extractListings(html, target, source, request);
    // Rendering is for ordinary JS pages only; never retry a challenge or a denied request.
    if (!listings.length && this.render) {
      const rendered = await this.render(target, source);
      if (new TextEncoder().encode(rendered).length > MAX_HTML_BYTES)
        throw new SourceError('TOO_LARGE', 'Rendered source exceeded the page size limit.');
      listings = extractListings(rendered, target, source, request);
    }
    return listings;
  }
  async compare(input: CompareRequest): Promise<CompareResponse> {
    const request = compareSchema.parse(input);
    const started = Date.now();
    const isUrl = /^https?:\/\//i.test(request.query);
    const direct = sourceForUrl(request.query);
    const targets = isUrl ? sources.filter((s) => s === direct) : sources;
    const key =
      'live:v1:' +
      (await digest(
        JSON.stringify([
          isUrl ? request.query.trim() : request.query.trim().toLowerCase(),
          request.pincode,
          request.lat,
          request.lng,
          request.preference,
        ]),
      ));
    const cached = await this.store.get(key);
    if (cached) {
      const value = JSON.parse(cached) as CompareResponse;
      return { ...value, metadata: { ...value.metadata, cached: true } };
    }
    const allowed = await this.store.reserve(
      'search:' + new Date().toISOString().slice(0, 10),
      120,
      172800,
    );
    const outcomes = await Promise.all(
      targets.map(async (source) => {
        const time = Date.now();
        const url = direct
          ? request.query
          : source.origin + source.searchPath + encodeURIComponent(request.query);
        try {
          if (!allowed)
            throw new SourceError(
              'DAILY_LIMIT',
              'Today’s free search budget is used. Cached results and direct links are still available.',
            );
          const listings = await this.read(source, url, request);
          return {
            listings,
            status: {
              platform: source.name,
              success: true,
              durationMs: Date.now() - time,
              code: listings.length ? 'OBSERVED' : 'NO_PRICES',
              message: listings.length
                ? 'Public prices retrieved. Location and checkout fees are unverified.'
                : 'No readable matching prices were found on this page.',
              url,
            },
          };
        } catch (error) {
          const known = error instanceof SourceError;
          return {
            listings: [] as NormalizedListing[],
            status: {
              platform: source.name,
              success: false,
              durationMs: Date.now() - time,
              code: known ? error.code : 'SOURCE_UNAVAILABLE',
              message: known
                ? error.message
                : 'This source did not respond within the search limits.',
              url,
            },
          };
        }
      }),
    );
    const listings = outcomes.flatMap((o) => o.listings);
    const results = rankListings(listings, request.preference).map((r) => ({
      ...r,
      isRecommended: false,
      recommendationReason:
        'Observed item price only. Checkout fees, delivery time and stock for your pincode are unverified.',
    }));
    const response: CompareResponse = {
      success: true,
      query: request.query,
      preference: request.preference,
      location: { lat: request.lat, lng: request.lng, pincode: request.pincode },
      results,
      metadata: {
        demo: false,
        cached: false,
        generatedAt: new Date().toISOString(),
        durationMs: Date.now() - started,
        connectorStatuses: outcomes.map((o) => o.status),
        storage: 'disabled',
        cacheTtlSeconds: results.length ? 3600 : 120,
        searchLinks: direct
          ? [{ platform: direct.name, url: request.query }]
          : searchLinks(request.query),
        notice:
          isUrl && !direct
            ? 'Paste a supported HTTPS product URL from Amazon India, Flipkart, Blinkit or Swiggy Instamart.'
            : 'Experimental public-page search. Prices are observations, not checkout totals. Pincode-specific inventory is not verified. Google Shopping opens as a direct link.',
      },
    };
    await this.store.set(key, JSON.stringify(response), results.length ? 3600 : 120);
    return response;
  }
}
