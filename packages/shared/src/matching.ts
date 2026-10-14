import { catalog, productTitle } from './catalog';
import type { Product } from './types';

export const normalizeTitle = (value: string) =>
  value
    .toLowerCase()
    .replace(/(\d)\s+(gb|tb|ml|kg|g|l)\b/g, '$1$2')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
export function attributes(title: string) {
  const text = normalizeTitle(title);
  const size = title.toLowerCase().match(/\b(\d+(?:\.\d+)?)\s*(gb|tb|ml|kg|g|l)\b/);
  const sizes: Record<string, number> = { ml: 1, l: 1000, g: 1, kg: 1000, gb: 1, tb: 1024 };
  const unit = size?.[2];
  const color = text.match(/\b(black|white|blue|green|pink|navy|silver|gold)\b/)?.[1];
  const model =
    text.match(
      /\b(?:iphone|samsung galaxy|galaxy)\s+(s?\d+(?:\s+(?:pro max|pro|plus|ultra|mini))?)/,
    )?.[1] ?? text.match(/\bwh\s*(\d+xm\d+)\b/)?.[1];
  const brand =
    ['apple', 'samsung', 'sony', 'amul', 'coca cola'].find((b) => text.includes(b)) ??
    (text.includes('iphone') ? 'apple' : undefined);
  return {
    size: size && unit ? Number(size[1]) * sizes[unit]! : undefined,
    unit: unit
      ? ['ml', 'l'].includes(unit)
        ? 'volume'
        : ['g', 'kg'].includes(unit)
          ? 'weight'
          : 'storage'
      : undefined,
    color,
    model,
    brand,
  };
}
export function calculateSimilarity(a: string, b: string) {
  const left = new Set(normalizeTitle(a).split(' ').filter(Boolean));
  const right = new Set(normalizeTitle(b).split(' ').filter(Boolean));
  if (!left.size || !right.size) return 0;
  return (2 * [...left].filter((t) => right.has(t)).length) / (left.size + right.size);
}
export interface MatchResult {
  canonicalProductId?: string;
  confidence: number;
  matched: boolean;
  reasons: string[];
}
export function matchProduct(a: string, b: string, canonicalProductId?: string): MatchResult {
  const x = attributes(a),
    y = attributes(b);
  const conflicts = (['size', 'unit', 'color', 'model', 'brand'] as const).filter(
    (key) => x[key] !== undefined && y[key] !== undefined && x[key] !== y[key],
  );
  if (conflicts.length)
    return { confidence: 0, matched: false, reasons: conflicts.map((k) => `Different ${k}`) };
  const missingVariant = (['size', 'model', 'color'] as const).filter(
    (key) => (x[key] === undefined) !== (y[key] === undefined),
  );
  if (missingVariant.length)
    return {
      confidence: 0.4,
      matched: false,
      reasons: missingVariant.map((k) => 'Unspecified ' + k + ' on one listing'),
    };
  const similarity = calculateSimilarity(a, b);
  const corroborating =
    Number(!!x.brand && x.brand === y.brand) * 0.08 +
    Number(!!x.model && x.model === y.model) * 0.12 +
    Number(x.size !== undefined && x.size === y.size) * 0.06;
  const confidence = Math.min(1, similarity + corroborating);
  return {
    canonicalProductId: confidence >= 0.72 ? canonicalProductId : undefined,
    confidence,
    matched: confidence >= 0.72,
    reasons: [
      `${Math.round(similarity * 100)}% token similarity`,
      ...(corroborating ? ['Compatible product attributes'] : []),
    ],
  };
}
export function searchCatalog(query: string): Product[] {
  const normalized = normalizeTitle(query);
  const tokens = normalized.split(' ').filter(Boolean);
  const searchAttributes = attributes(query);
  return catalog.filter((p) => {
    const productAttributes = attributes(productTitle(p));
    if (
      (['size', 'unit', 'color', 'model', 'brand'] as const).some(
        (k) =>
          searchAttributes[k] !== undefined &&
          productAttributes[k] !== undefined &&
          searchAttributes[k] !== productAttributes[k],
      )
    )
      return false;
    const haystack = normalizeTitle([productTitle(p), ...p.keywords].join(' '));
    return tokens.length > 0 && tokens.every((t) => haystack.includes(t));
  });
}
