import {
  catalog,
  compareSchema,
  matchProduct,
  productTitle,
  rankListings,
  type CompareRequest,
  type CompareResponse,
} from '@smartcompare/shared';
import { ConnectorRegistry } from '../connectors/registry';
import {
  getComparisonCache,
  setComparisonCache,
  type ComparisonCache,
} from '../cache/comparison-cache';
import { ExternalServiceError } from '../utils/errors';
import { listingSchema, safeProductUrl } from '../validation/listing';
import { logger } from '../utils/logger';
import type { ListingRepository } from './repository';
export interface ComparisonService {
  compare(input: CompareRequest, requestId?: string): Promise<CompareResponse>;
}
export class DefaultComparisonService implements ComparisonService {
  constructor(
    private registry: ConnectorRegistry,
    private cache: ComparisonCache,
    private repository?: ListingRepository,
  ) {}
  async compare(input: CompareRequest, requestId = 'worker'): Promise<CompareResponse> {
    const request = compareSchema.parse(input);
    const start = performance.now();
    const cached = await getComparisonCache(this.cache, request);
    if (cached) {
      logger.info(
        { requestId, cacheHit: true, resultCount: cached.results.length },
        'comparison.completed',
      );
      return {
        ...cached,
        metadata: {
          ...cached.metadata,
          cached: true,
          durationMs: Math.round(performance.now() - start),
        },
      };
    }
    const location = { lat: request.lat, lng: request.lng, pincode: request.pincode };
    const { listings, statuses } = await this.registry.searchAll({
      query: request.query,
      location,
      signal: AbortSignal.timeout(11500),
    });
    if (!statuses.some((s) => s.success)) throw new ExternalServiceError();
    const valid = listings.flatMap((l) => {
      const parsed = listingSchema.safeParse(l);
      if (!parsed.success) return [];
      const normalized = parsed.data;
      const canonical = catalog.find(
        (p) => matchProduct(normalized.title, productTitle(p), p.id).matched,
      );
      return [
        {
          ...normalized,
          canonicalProductId: canonical?.id,
          productUrl: safeProductUrl(normalized.productUrl, normalized.platform),
        },
      ];
    });
    let storage: CompareResponse['metadata']['storage'] = 'disabled';
    if (this.repository) {
      try {
        await this.repository.save(valid);
        storage = 'persisted';
      } catch {
        storage = 'unavailable';
        logger.warn({ requestId }, 'database.write_unavailable');
      }
    }
    const response: CompareResponse = {
      success: true,
      query: request.query,
      preference: request.preference,
      location,
      results: rankListings(valid, request.preference),
      metadata: {
        cached: false,
        demo: true,
        generatedAt: new Date().toISOString(),
        connectorStatuses: statuses,
        durationMs: Math.round(performance.now() - start),
        storage,
      },
    };
    // Do not cache a degraded connector response; recovered stores must reappear immediately.
    if (statuses.every((s) => s.success)) await setComparisonCache(this.cache, request, response);
    logger.info(
      {
        requestId,
        query: request.query,
        preference: request.preference,
        pincode: request.pincode,
        cacheHit: false,
        connectorStatuses: statuses,
        duration: response.metadata.durationMs,
        resultCount: response.results.length,
      },
      'comparison.completed',
    );
    return response;
  }
}
