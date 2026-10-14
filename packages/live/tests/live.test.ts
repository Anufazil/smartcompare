import { describe, it, expect, vi } from 'vitest';
import { defaultLocation } from '@smartcompare/shared';
import {
  allowedByRobots,
  boundedText,
  extractListings,
  LiveComparisonService,
  MemoryLiveStore,
  sourceForUrl,
  sources,
} from '../src';
const input = {
  query: 'Dove Intense Repair Shampoo',
  ...defaultLocation,
  preference: 'balanced' as const,
};
const source = sources[2]!;
const url = 'https://blinkit.com/prn/dove-intense-repair-shampoo/prid/123';
const product = {
  '@type': 'Product',
  name: 'Dove Intense Repair Shampoo 650ml',
  url,
  offers: {
    '@type': 'Offer',
    price: '399.00',
    priceCurrency: 'INR',
    availability: 'https://schema.org/InStock',
  },
};
const html = (value: unknown) =>
  `<html><script type="application/ld+json">${JSON.stringify(value)}</script></html>`;
describe('public extraction', () => {
  it('separates retailer brand and product headings and ignores crossed-out prices', () => {
    const page = `<div data-component-type="s-search-result">
      <h2>Dove</h2><a href="/dp/B0BRG63JP3"><h2>Intense Repair Shampoo 650ml</h2></a>
      <span class="a-price a-text-price"><span class="a-offscreen">₹900</span></span>
      <span class="a-price"><span class="a-offscreen">₹399</span></span>
    </div>`;
    const result = extractListings(page, 'https://www.amazon.in/s?k=dove', sources[0]!, input);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ title: 'Dove Intense Repair Shampoo 650ml', basePrice: 399 });
  });
  it('reads nested JSON-LD without using the seed catalog or inventing fees', () => {
    const result = extractListings(html({ '@graph': [product] }), url, source, input);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      title: product.name,
      basePrice: 399,
      available: true,
      metadata: { observed: true, locationVerified: false, stock: 'in_stock' },
    });
    expect(result[0]?.deliveryFee).toBeUndefined();
    expect(result[0]?.etaMinutes).toBeUndefined();
  });
  it.each(['USD', '', 'EUR'])('rejects non-INR or unspecified currency %s', (currency) => {
    expect(
      extractListings(
        html({ ...product, offers: { ...product.offers, priceCurrency: currency } }),
        url,
        source,
        input,
      ),
    ).toEqual([]);
  });
  it.each(['NaN', '-5', '0', '399-499', '3.999'])('rejects invalid offer price %s', (price) => {
    expect(
      extractListings(
        html({ ...product, offers: { ...product.offers, price } }),
        url,
        source,
        input,
      ),
    ).toEqual([]);
  });
  it('does not treat aggregate price ranges as a real variant offer', () => {
    expect(
      extractListings(
        html({
          ...product,
          offers: { ...product.offers, '@type': 'AggregateOffer', lowPrice: 100 },
        }),
        url,
        source,
        input,
      ),
    ).toEqual([]);
  });
  it('rejects wrong sizes, unrelated results and expired offers', () => {
    expect(
      extractListings(html(product), url, source, {
        ...input,
        query: 'Dove Intense Repair Shampoo 180ml',
      }),
    ).toEqual([]);
    expect(
      extractListings(html(product), url, source, { ...input, query: 'Sony headphones' }),
    ).toEqual([]);
    expect(
      extractListings(
        html({ ...product, offers: { ...product.offers, priceValidUntil: '2020-01-01' } }),
        url,
        source,
        input,
      ),
    ).toEqual([]);
  });
  it('does not infer stock from the presence of a price', () => {
    const result = extractListings(
      html({ ...product, offers: { ...product.offers, availability: undefined } }),
      url,
      source,
      input,
    );
    expect(result[0]).toMatchObject({ available: false, metadata: { stock: 'unknown' } });
  });
  it('fails on challenge pages even if metadata is present', () => {
    expect(() =>
      extractListings('<title>Robot Check</title>' + html(product), url, source, input),
    ).toThrow();
  });
  it('rejects source URLs pointing to another host or account path', () => {
    expect(
      extractListings(
        html({ ...product, url: 'https://evil.example/product' }),
        url,
        source,
        input,
      ),
    ).toEqual([]);
    for (const value of [
      'http://blinkit.com/prn/a/prid/1',
      'https://blinkit.com.evil.test/prn/a/prid/1',
      'https://user@blinkit.com/prn/a/prid/1',
      'https://127.0.0.1/',
      'https://www.amazon.in/ap/signin',
      'https://blinkit.com:444/prn/a/prid/1',
    ])
      expect(sourceForUrl(value)).toBeUndefined();
  });
  it('reads supported product URLs without searching unrelated products', () => {
    expect(extractListings(html(product), url, source, { ...input, query: url })).toHaveLength(1);
  });
  it('obeys robots wildcard, specific groups and crawl delays', () => {
    expect(allowedByRobots('User-agent: *\nDisallow: /s/*', 'https://blinkit.com/s/?q=dove')).toBe(
      false,
    );
    expect(
      allowedByRobots('User-agent: *\nAllow: /\nUser-agent: SmartCompareBot\nDisallow: /', url),
    ).toBe(false);
    expect(allowedByRobots('User-agent: *\nCrawl-delay: 60\nAllow: /', url)).toBe(false);
    expect(allowedByRobots('User-agent: *\nDisallow: /s/*', url)).toBe(true);
  });
  it('bounds a streaming response even without content-length', async () => {
    await expect(boundedText(new Response('123456'), 5)).rejects.toThrow();
  });
});
describe('live service', () => {
  it('caches a real observation separately from the demo and retains its timestamp', async () => {
    const fetcher = vi.fn(
      async (target: string | URL | Request) =>
        new Response(
          String(target).endsWith('/robots.txt') ? 'User-agent: *\nAllow: /' : html(product),
          {
            headers: {
              'Content-Type': String(target).endsWith('/robots.txt') ? 'text/plain' : 'text/html',
            },
          },
        ),
    ) as unknown as typeof fetch;
    const service = new LiveComparisonService(new MemoryLiveStore(), undefined, fetcher);
    const first = await service.compare({ ...input, query: url });
    const second = await service.compare({ ...input, query: url });
    expect(first.results).toHaveLength(1);
    expect(first.metadata.demo).toBe(false);
    expect(first.results[0]?.price.unknownFees).toHaveLength(3);
    expect(first.results[0]?.isRecommended).toBe(false);
    expect(second.metadata.cached).toBe(true);
    expect(second.metadata.generatedAt).toBe(first.metadata.generatedAt);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('does not fetch a denied page or call a browser to bypass robots', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response('User-agent: *\nDisallow: /', { headers: { 'Content-Type': 'text/plain' } }),
    ) as unknown as typeof fetch;
    const render = vi.fn();
    const result = await new LiveComparisonService(new MemoryLiveStore(), render, fetcher).compare({
      ...input,
      query: url,
    });
    expect(result.results).toEqual([]);
    expect(result.metadata.connectorStatuses[0]?.code).toBe('ROBOTS_DISALLOWED');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(render).not.toHaveBeenCalled();
  });
  it('does not fall back to a renderer after 403 or a CAPTCHA', async () => {
    const fetcher = vi.fn(async (target: string | URL | Request) =>
      String(target).endsWith('/robots.txt')
        ? new Response('User-agent: *\nAllow: /', { headers: { 'Content-Type': 'text/plain' } })
        : new Response('Blocked', { status: 403 }),
    ) as unknown as typeof fetch;
    const render = vi.fn();
    const result = await new LiveComparisonService(new MemoryLiveStore(), render, fetcher).compare({
      ...input,
      query: url,
    });
    expect(result.metadata.connectorStatuses[0]?.code).toBe('BLOCKED');
    expect(render).not.toHaveBeenCalled();
  });
  it('uses rendering for a permitted JS-only page and preserves unknown fees', async () => {
    const fetcher = vi.fn(
      async (target: string | URL | Request) =>
        new Response(
          String(target).endsWith('/robots.txt')
            ? 'User-agent: *\nAllow: /'
            : '<html><main>Loading</main></html>',
          {
            headers: {
              'Content-Type': String(target).endsWith('/robots.txt') ? 'text/plain' : 'text/html',
            },
          },
        ),
    ) as unknown as typeof fetch;
    const render = vi.fn(async () => html(product));
    const result = await new LiveComparisonService(new MemoryLiveStore(), render, fetcher).compare({
      ...input,
      query: url,
    });
    expect(result.results[0]?.price.confidence).toBe('partial');
    expect(render).toHaveBeenCalledOnce();
  });
  it('blocks unsupported URLs without making network calls', async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;
    const response = await new LiveComparisonService(
      new MemoryLiveStore(),
      undefined,
      fetcher,
    ).compare({ ...input, query: 'https://localhost/private' });
    expect(fetcher).not.toHaveBeenCalled();
    expect(response.metadata.notice).toContain('supported HTTPS');
  });
  it('never follows redirects or substitutes sample prices on failure', async () => {
    const fetcher = vi.fn(
      async () => new Response('', { status: 302, headers: { location: 'http://127.0.0.1/' } }),
    ) as unknown as typeof fetch;
    const response = await new LiveComparisonService(
      new MemoryLiveStore(),
      undefined,
      fetcher,
    ).compare({ ...input, query: 'iPhone 15' });
    expect(response.results).toEqual([]);
    expect(response.metadata.demo).toBe(false);
    expect(response.metadata.searchLinks).toHaveLength(5);
    expect(
      vi.mocked(fetcher).mock.calls.every(([, options]) => options?.redirect === 'manual'),
    ).toBe(true);
  });
  it('keeps concurrent local budget reservations bounded', async () => {
    const store = new MemoryLiveStore();
    const attempts = await Promise.all(
      Array.from({ length: 30 }, () => store.reserve('budget', 8, 60)),
    );
    expect(attempts.filter(Boolean)).toHaveLength(8);
  });
});
