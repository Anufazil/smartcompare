import { describe, it, expect } from 'vitest';
import {
  calculateTotalCost,
  normalizeTitle,
  calculateSimilarity,
  matchProduct,
  rankListings,
  createMockConnectors,
  defaultLocation,
  searchCatalog,
  type NormalizedListing,
} from '../src';
const listing = (override: Partial<NormalizedListing> = {}): NormalizedListing => ({
  platform: 'Amazon',
  category: 'ECOMMERCE',
  externalId: 'x',
  title: 'Milk 1L',
  canonicalProductId: 'milk',
  basePrice: 100,
  deliveryFee: 0,
  handlingFee: 0,
  platformFee: 0,
  etaMinutes: 60,
  available: true,
  location: defaultLocation,
  ...override,
});
describe('total cost', () => {
  it('adds all fees in integer paise', () => {
    expect(
      calculateTotalCost(
        listing({ basePrice: 0.1, deliveryFee: 0.2, handlingFee: 0.3, platformFee: 0.4 }),
      ).total,
    ).toBe(1);
  });
  it('does not present missing fees as exact', () => {
    const c = calculateTotalCost(listing({ deliveryFee: undefined }));
    expect(c.confidence).toBe('partial');
    expect(c.unknownFees).toEqual(['deliveryFee']);
  });
  it('tracks estimates', () =>
    expect(calculateTotalCost(listing({ metadata: { estimatedFees: true } })).confidence).toBe(
      'estimated',
    ));
  it.each([NaN, Infinity, -1])('rejects invalid base price %s', (n) =>
    expect(() => calculateTotalCost(listing({ basePrice: n }))).toThrow(),
  );
});
describe('matching', () => {
  it('normalizes punctuation, unit spacing and whitespace', () =>
    expect(normalizeTitle('Apple iPhone 15 - 128 GB  Black!')).toBe('apple iphone 15 128gb black'));
  it('matches model, inferred brand and storage', () =>
    expect(matchProduct('Apple iPhone 15 128GB Black', 'iPhone 15 - 128 GB - Black').matched).toBe(
      true,
    ));
  it.each([
    ['Milk 500ml', 'Milk 1L'],
    ['Apple iPhone 15 128GB', 'Apple iPhone 15 256GB'],
    ['Apple iPhone 15 128GB Black', 'Apple iPhone 15 128GB Blue'],
    ['Apple iPhone 15 128GB', 'Apple iPhone 15 Pro 128GB'],
  ])('rejects variant mismatch %s / %s', (a, b) => expect(matchProduct(a, b).matched).toBe(false));
  it('has zero similarity for unrelated tokens and empty text', () => {
    expect(calculateSimilarity('milk', 'phone')).toBe(0);
    expect(calculateSimilarity('', '')).toBe(0);
  });
  it('does not infer an unspecified storage variant', () =>
    expect(matchProduct('Apple iPhone 15 Black', 'Apple iPhone 15 128GB Black').matched).toBe(
      false,
    ));
  it('does not return a different pack size for an exact query', () =>
    expect(searchCatalog('milk 500ml')).toEqual([]));
  it('finds abbreviated product searches', () =>
    expect(searchCatalog('Sony headphones')[0]?.id).toBe('sony-xm5-black'));
  it('handles fractional unit sizes without conflation', () =>
    expect(matchProduct('Amul Milk 0.5L', 'Amul Milk 5L').matched).toBe(false));
});
describe('recommendations', () => {
  const options = [
    listing({ externalId: 'cheap', platform: 'Amazon', basePrice: 100, etaMinutes: 120 }),
    listing({ externalId: 'fast', platform: 'Blinkit', basePrice: 120, etaMinutes: 10 }),
    listing({ externalId: 'middle', platform: 'Flipkart', basePrice: 105, etaMinutes: 30 }),
  ];
  it('weights cheapest as specified', () =>
    expect(rankListings(options, 'cheapest')[0]?.externalId).toBe('cheap'));
  it('weights fastest as specified', () =>
    expect(rankListings(options, 'fastest')[0]?.externalId).toBe('fast'));
  it('balances normalized units', () =>
    expect(rankListings(options, 'balanced')[0]?.externalId).toBe('middle'));
  it('never recommends unavailable inventory', () =>
    expect(
      rankListings(
        options.map((x) => ({ ...x, available: false })),
        'balanced',
      ).some((x) => x.isRecommended),
    ).toBe(false));
  it('uses deterministic tie breaks and one recommendation', () => {
    const r = rankListings(
      [listing({ externalId: '2', platform: 'Flipkart' }), listing({ externalId: '1' })],
      'balanced',
    );
    expect(r[0]?.platform).toBe('Amazon');
    expect(r.filter((x) => x.isRecommended)).toHaveLength(1);
  });
  it('handles missing ETA and identical prices without NaN', () => {
    const r = rankListings(
      [listing({ etaMinutes: undefined }), listing({ externalId: '2' })],
      'balanced',
    );
    expect(r.every((x) => Number.isFinite(x.score))).toBe(true);
    expect(r[0]?.etaMinutes).toBe(60);
  });
  it('does not recommend deceptively incomplete fees', () => {
    const r = rankListings(
      [listing({ basePrice: 1, deliveryFee: undefined }), listing({ externalId: 'known' })],
      'cheapest',
    );
    expect(r[0]?.externalId).toBe('known');
  });
  it('deduplicates and rejects unavailable prices', () => {
    expect(
      rankListings(
        [listing(), listing(), listing({ basePrice: NaN, externalId: 'bad' })],
        'balanced',
      ),
    ).toHaveLength(1);
  });
  it('compares per product instead of making cheap milk beat a phone', () => {
    const r = rankListings(
      [
        listing(),
        listing({
          externalId: 'phone',
          canonicalProductId: 'phone',
          title: 'Phone',
          basePrice: 100000,
        }),
      ],
      'balanced',
    );
    expect(r.filter((x) => x.isRecommended)).toHaveLength(2);
  });
  it('all mock connectors return distinct deterministic prices and receive location', async () => {
    const connectors = createMockConnectors();
    const result = await Promise.all(
      connectors.map((c) => c.search({ query: 'iPhone 15', location: defaultLocation })),
    );
    expect(new Set(result.map((r) => r[0]?.basePrice)).size).toBe(4);
    expect(result.every((r) => r[0]?.location.pincode === '560001')).toBe(true);
  });
});
