import type { NormalizedListing, TotalCost } from './types';
export function calculateTotalCost(
  listing: Pick<
    NormalizedListing,
    'basePrice' | 'deliveryFee' | 'handlingFee' | 'platformFee' | 'metadata'
  >,
): TotalCost {
  const keys = ['deliveryFee', 'handlingFee', 'platformFee'] as const;
  if (!Number.isFinite(listing.basePrice) || listing.basePrice < 0)
    throw new Error('A valid base price is required');
  const unknownFees = keys.filter((k) => listing[k] === undefined);
  const amounts = [listing.basePrice, ...keys.map((k) => listing[k] ?? 0)];
  if (amounts.some((v) => !Number.isFinite(v) || v < 0))
    throw new Error('Prices must be finite and non-negative');
  // Integer paise avoids accumulation errors. Unknown fees remain explicitly identified.
  const total = amounts.reduce((sum, v) => sum + Math.round(v * 100), 0) / 100;
  return {
    basePrice: listing.basePrice,
    deliveryFee: listing.deliveryFee ?? 0,
    handlingFee: listing.handlingFee ?? 0,
    platformFee: listing.platformFee ?? 0,
    total,
    unknownFees,
    confidence: unknownFees.length
      ? 'partial'
      : listing.metadata?.estimatedFees
        ? 'estimated'
        : 'exact',
  };
}
