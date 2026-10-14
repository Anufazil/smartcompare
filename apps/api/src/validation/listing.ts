import { z } from 'zod';
import { locationSchema } from '@smartcompare/shared';
const money = z.number().finite().nonnegative().max(100000000);
export const listingSchema = z.object({
  platform: z.string().max(80),
  category: z.enum(['ECOMMERCE', 'QUICK_COMMERCE', 'FOOD_DELIVERY']),
  externalId: z.string().min(1).max(200),
  canonicalProductId: z.string().optional(),
  title: z.string().min(1).max(500),
  brand: z.string().optional(),
  imageUrl: z.string().optional(),
  productUrl: z.string().optional(),
  basePrice: money,
  deliveryFee: money.optional(),
  handlingFee: money.optional(),
  platformFee: money.optional(),
  etaMinutes: z.number().finite().nonnegative().optional(),
  available: z.boolean(),
  location: locationSchema,
  metadata: z.record(z.unknown()).optional(),
});
const hosts: Record<string, string[]> = {
  Amazon: ['www.amazon.in'],
  Flipkart: ['www.flipkart.com'],
  Blinkit: ['blinkit.com'],
  'Swiggy Instamart': ['www.swiggy.com'],
};
export function safeProductUrl(value: string | undefined, platform: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      hosts[platform]?.includes(url.hostname)
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}
