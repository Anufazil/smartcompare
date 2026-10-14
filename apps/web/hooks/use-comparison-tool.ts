'use client';
import { useEffect, useRef } from 'react';
import { compareSchema, type CompareResponse } from '@smartcompare/shared';
type ModelContext = {
  registerTool(
    tool: {
      name: string;
      title: string;
      description: string;
      inputSchema: object;
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute: (input: unknown) => Promise<unknown>;
    },
    options: { signal: AbortSignal },
  ): void | Promise<void>;
};
export function useComparisonTool(
  search: (
    query: string,
    preference: 'cheapest' | 'fastest' | 'balanced',
    location: { lat: number; lng: number; pincode?: string },
  ) => Promise<CompareResponse | undefined>,
) {
  const current = useRef(search);
  current.current = search;
  useEffect(() => {
    const context = (document as Document & { modelContext?: ModelContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(
        context.registerTool(
          {
            name: 'compare_products',
            title: 'Compare products',
            description:
              'Compare products using the selected Live or Demo mode. Live mode sends the product query to supported public retailer pages; no purchase is made. Results identify observations, unknown fees and blocked sources.',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string', minLength: 2, maxLength: 2048 },
                preference: { type: 'string', enum: ['cheapest', 'fastest', 'balanced'] },
                lat: { type: 'number', minimum: -90, maximum: 90 },
                lng: { type: 'number', minimum: -180, maximum: 180 },
                pincode: { type: 'string', pattern: '^[1-9][0-9]{5}$' },
              },
              required: ['query', 'lat', 'lng', 'preference'],
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false, untrustedContentHint: true },
            execute: async (input) => {
              const request = compareSchema.parse(input);
              const response = await current.current(request.query, request.preference, request);
              if (!response) throw new Error('Comparison did not complete');
              return {
                query: response.query,
                count: response.results.length,
                demo: response.metadata.demo,
                sources: response.metadata.connectorStatuses,
                results: response.results.map((r) => ({
                  platform: r.platform,
                  total: r.price.total,
                  confidence: r.price.confidence,
                  unknownFees: r.price.unknownFees,
                  stock: r.metadata?.stock,
                  etaMinutes: r.etaMinutes,
                  recommended: r.isRecommended,
                })),
              };
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => {});
    } catch {
      /* WebMCP is progressive enhancement. */
    }
    return () => lifecycle.abort();
  }, []);
}
