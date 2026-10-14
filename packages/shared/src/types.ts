import { z } from 'zod';

export const preferenceSchema = z.enum(['cheapest', 'fastest', 'balanced']);
export type Preference = z.infer<typeof preferenceSchema>;
export const locationSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  pincode: z
    .string()
    .regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit pincode')
    .optional(),
});
export const compareSchema = locationSchema.extend({
  query: z
    .string()
    .trim()
    .min(2)
    .max(2048)
    .refine(
      (v) => v.length <= 200 || /^https:\/\//i.test(v),
      'Use at most 200 characters for a product name',
    )
    .refine(
      (v) => ![...v].some((c) => c.charCodeAt(0) < 32 || c === '<' || c === '>'),
      'Use a plain-text product name',
    ),
  preference: preferenceSchema.default('balanced'),
});
export type UserLocation = z.infer<typeof locationSchema>;
export type CompareRequest = z.infer<typeof compareSchema>;
export type Category = 'ECOMMERCE' | 'QUICK_COMMERCE' | 'FOOD_DELIVERY';
export interface ConnectorSearchRequest {
  query: string;
  location: UserLocation;
  limit?: number;
  signal?: AbortSignal;
}
export interface NormalizedListing {
  platform: string;
  category: Category;
  externalId: string;
  canonicalProductId?: string;
  title: string;
  brand?: string;
  imageUrl?: string;
  productUrl?: string;
  basePrice: number;
  deliveryFee?: number;
  handlingFee?: number;
  platformFee?: number;
  etaMinutes?: number;
  available: boolean;
  location: UserLocation;
  metadata?: Record<string, unknown>;
}
export interface CommerceConnector {
  readonly platform: string;
  readonly category: Category;
  search(request: ConnectorSearchRequest): Promise<NormalizedListing[]>;
}
export type CostConfidence = 'exact' | 'estimated' | 'partial';
export interface TotalCost {
  basePrice: number;
  deliveryFee: number;
  handlingFee: number;
  platformFee: number;
  total: number;
  confidence: CostConfidence;
  unknownFees: Array<'deliveryFee' | 'handlingFee' | 'platformFee'>;
}
export interface RecommendationResult {
  score: number;
  priceScore: number;
  etaScore: number;
  availabilityScore: number;
  recommendationReason: string;
}
export interface ComparisonResult extends NormalizedListing, RecommendationResult {
  price: {
    base: number;
    delivery: number;
    handling: number;
    platform: number;
    total: number;
    confidence: CostConfidence;
    unknownFees: TotalCost['unknownFees'];
  };
  isRecommended: boolean;
}
export interface ConnectorStatus {
  platform: string;
  success: boolean;
  durationMs: number;
  code?: string;
  message?: string;
  url?: string;
}
export interface CompareResponse {
  success: true;
  query: string;
  preference: Preference;
  location: UserLocation;
  results: ComparisonResult[];
  metadata: {
    cached: boolean;
    generatedAt: string;
    demo: boolean;
    cacheTtlSeconds?: number;
    notice?: string;
    searchLinks?: Array<{ platform: string; url: string }>;
    connectorStatuses: ConnectorStatus[];
    durationMs: number;
    storage?: 'persisted' | 'unavailable' | 'disabled';
  };
}
export interface Product {
  id: string;
  slug: string;
  title: string;
  brand: string;
  category: 'electronics' | 'essentials';
  unitValue: number;
  unit: string;
  imageUrl: string;
  color: string;
  keywords: string[];
}
