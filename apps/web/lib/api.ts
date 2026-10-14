import {
  compareSchema,
  createMockConnectors,
  rankListings,
  type CompareRequest,
  type CompareResponse,
} from '@smartcompare/shared';
const API_URL = process.env.NEXT_PUBLIC_API_URL;

function comparisonApiUrl() {
  if (API_URL) return API_URL;
  // Next.js embeds NEXT_PUBLIC_* values when the server starts or the app builds.
  // Keep local development usable when the web server was started before .env.local
  // existed, while requiring an explicit API URL for deployed sites.
  if (
    typeof window !== 'undefined' &&
    ['127.0.0.1', 'localhost'].includes(window.location.hostname)
  )
    return 'http://127.0.0.1:4000';
  return undefined;
}
const demoCache = new Map<string, { expires: number; value: CompareResponse }>();
export async function compareProducts(
  input: CompareRequest,
  signal?: AbortSignal,
  mode: 'live' | 'demo' = 'live',
): Promise<CompareResponse> {
  const request = compareSchema.parse(input);
  if (mode === 'live') {
    const apiUrl = comparisonApiUrl();
    if (!apiUrl)
      throw new Error(
        'Live search needs the comparison API. Configure NEXT_PUBLIC_API_URL or select Demo catalog.',
      );
    const response = await fetch(apiUrl.replace(/\/$/, '') + '/api/v1/compare/live', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
        : AbortSignal.timeout(20000),
    }).catch((error) => {
      if (signal?.aborted) throw error;
      throw new Error('We could not complete the comparison. Please try again.');
    });
    const data = await response.json();
    if (!response.ok || !data.success)
      throw new Error(
        data.error?.message || 'We could not complete the comparison. Please try again.',
      );
    if (data.metadata?.demo !== false)
      throw new Error('The API returned demo data. Check the live API deployment.');
    return data as CompareResponse;
  }
  // Demo mode is explicit; a failed live request never falls back to fixture prices.
  const key = JSON.stringify(request),
    cached = demoCache.get(key);
  if (cached && cached.expires > Date.now())
    return { ...cached.value, metadata: { ...cached.value.metadata, cached: true } };
  const started = performance.now();
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, 450);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
  const location = { lat: request.lat, lng: request.lng, pincode: request.pincode },
    connectors = createMockConnectors();
  const settled = await Promise.allSettled(
    connectors.map((c) => c.search({ query: request.query, location, signal })),
  );
  const listings = settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  const result: CompareResponse = {
    success: true,
    query: request.query,
    preference: request.preference,
    location,
    results: rankListings(listings, request.preference),
    metadata: {
      cached: false,
      generatedAt: new Date().toISOString(),
      demo: true,
      durationMs: Math.round(performance.now() - started),
      connectorStatuses: connectors.map((c, i) => ({
        platform: c.platform,
        success: settled[i]?.status === 'fulfilled',
        durationMs: 1,
      })),
    },
  };
  if (demoCache.size >= 100) demoCache.delete(demoCache.keys().next().value!);
  demoCache.set(key, { expires: Date.now() + 300000, value: result });
  return result;
}
