import { calculateTotalCost } from './pricing';
import type { ComparisonResult, NormalizedListing, Preference } from './types';
export const weights = {
  cheapest: { price: 0.8, eta: 0.1, availability: 0.1 },
  fastest: { price: 0.1, eta: 0.8, availability: 0.1 },
  balanced: { price: 0.5, eta: 0.4, availability: 0.1 },
};
function normalize(value: number | undefined, values: number[]) {
  if (value === undefined || !Number.isFinite(value)) return 0;
  if (values.length <= 1 || Math.max(...values) === Math.min(...values)) return 1;
  return 1 - (value - Math.min(...values)) / (Math.max(...values) - Math.min(...values));
}
export function rankListings(
  listings: NormalizedListing[],
  preference: Preference,
): ComparisonResult[] {
  const unique = [
    ...new Map(
      listings
        .filter((l) => Number.isFinite(l.basePrice) && l.basePrice >= 0)
        .map((l) => [`${l.platform}:${l.externalId}`, l]),
    ).values(),
  ];
  // Normalize per canonical product: milk must never win a phone search on price.
  const groups = new Map<string, NormalizedListing[]>();
  unique.forEach((l) => {
    const key = l.canonicalProductId ?? l.title;
    groups.set(key, [...(groups.get(key) ?? []), l]);
  });
  return [...groups.values()].flatMap((group) => {
    const costs = new Map(group.map((l) => [l, calculateTotalCost(l)]));
    const available = group.filter((l) => l.available);
    const known = available.filter((l) => costs.get(l)!.confidence !== 'partial');
    const eligible = known.length ? known : available;
    const prices = eligible.map((l) => costs.get(l)!.total);
    const etas = eligible.flatMap((l) => (l.etaMinutes === undefined ? [] : [l.etaMinutes]));
    const w = weights[preference];
    const ranked = group
      .map((l) => {
        const cost = costs.get(l)!;
        const priceScore = Math.max(0, Math.min(1, normalize(cost.total, prices)));
        const etaScore = Math.max(0, Math.min(1, normalize(l.etaMinutes, etas)));
        const availabilityScore = Number(l.available);
        const score = l.available
          ? Math.round((w.price * priceScore + w.eta * etaScore + w.availability) * 1000) / 1000
          : 0;
        const lowest = prices.length > 0 && cost.total === Math.min(...prices);
        const fastest =
          l.etaMinutes !== undefined && etas.length > 0 && l.etaMinutes === Math.min(...etas);
        let reason = !l.available
          ? 'Currently unavailable at your location.'
          : lowest && fastest
            ? 'Lowest known total and fastest delivery for this product.'
            : preference === 'fastest' && fastest
              ? 'Fastest available delivery for this product.'
              : lowest
                ? 'Lowest known total, with all listed fees included.'
                : fastest
                  ? 'Faster delivery balances the higher total cost.'
                  : 'Ranked using the total cost and delivery weights you selected.';
        const cheapest = eligible.find((x) => costs.get(x)!.total === Math.min(...prices));
        if (
          l.available &&
          !lowest &&
          !fastest &&
          cheapest?.etaMinutes !== undefined &&
          l.etaMinutes !== undefined &&
          l.etaMinutes < cheapest.etaMinutes
        ) {
          const saved = cheapest.etaMinutes - l.etaMinutes;
          const time =
            saved >= 60 ? Math.floor(saved / 60) + 'h ' + (saved % 60) + 'm' : saved + ' min';
          const extra = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(
            cost.total - costs.get(cheapest)!.total,
          );
          reason = 'Arrives ' + time + ' sooner for ₹' + extra + ' more than the cheapest option.';
        }
        if (preference === 'fastest' && l.available && !fastest && l.etaMinutes !== undefined) {
          const quickest = eligible.find((x) => x.etaMinutes === Math.min(...etas));
          if (quickest?.etaMinutes !== undefined && costs.get(quickest)!.total > cost.total) {
            const savings = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(
              costs.get(quickest)!.total - cost.total,
            );
            reason =
              'Only ' +
              (l.etaMinutes - quickest.etaMinutes) +
              ' min slower than the fastest option, for ₹' +
              savings +
              ' less.';
          }
        }
        if (cost.confidence === 'partial')
          reason = 'Some fees are unknown. This is a minimum total; confirm at checkout.';
        if (l.etaMinutes === undefined && l.available) reason += ' Delivery time is not available.';
        return {
          ...l,
          price: {
            base: cost.basePrice,
            delivery: cost.deliveryFee,
            handling: cost.handlingFee,
            platform: cost.platformFee,
            total: cost.total,
            confidence: cost.confidence,
            unknownFees: cost.unknownFees,
          },
          score,
          priceScore,
          etaScore,
          availabilityScore,
          recommendationReason: reason,
          isRecommended: false,
        };
      })
      .sort(
        (a, b) =>
          Number(b.available) - Number(a.available) ||
          Number(a.price.confidence === 'partial') - Number(b.price.confidence === 'partial') ||
          b.score - a.score ||
          a.price.total - b.price.total ||
          a.platform.localeCompare(b.platform),
      );
    if (ranked[0]?.available && ranked[0].price.confidence !== 'partial')
      ranked[0].isRecommended = true;
    return ranked;
  });
}
