import type {
  CommerceConnector,
  ConnectorSearchRequest,
  ConnectorStatus,
  NormalizedListing,
} from '@smartcompare/shared';
import { ConnectorError } from '../utils/errors';
export interface ConnectorPolicy {
  concurrency: number;
  requestsPerMinute: number;
  timeoutMs: number;
  retries: number;
  failureThreshold: number;
  resetMs: number;
}
const defaults: ConnectorPolicy = {
  concurrency: 2,
  requestsPerMinute: 60,
  timeoutMs: 3000,
  retries: 2,
  failureThreshold: 3,
  resetMs: 30000,
};
interface State {
  connector: CommerceConnector;
  policy: ConnectorPolicy;
  active: number;
  calls: number[];
  failures: number;
  openUntil: number;
  halfOpen: boolean;
}
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
export class ConnectorRegistry {
  private entries = new Map<string, State>();
  register(connector: CommerceConnector, policy: Partial<ConnectorPolicy> = {}) {
    if (this.entries.has(connector.platform)) throw new Error('Connector already registered');
    this.entries.set(connector.platform, {
      connector,
      policy: { ...defaults, ...policy },
      active: 0,
      calls: [],
      failures: 0,
      openUntil: 0,
      halfOpen: false,
    });
    return this;
  }
  get(platform: string) {
    return this.entries.get(platform)?.connector;
  }
  getAll() {
    return [...this.entries.values()].map((s) => s.connector);
  }
  async search(platform: string, request: ConnectorSearchRequest): Promise<NormalizedListing[]> {
    const state = this.entries.get(platform);
    if (!state) throw new ConnectorError(platform, 'CONNECTOR_NOT_FOUND');
    const { policy } = state;
    const now = Date.now();
    if (state.openUntil > now || state.halfOpen) throw new ConnectorError(platform, 'CIRCUIT_OPEN');
    state.calls = state.calls.filter((t) => now - t < 60000);
    if (state.calls.length >= policy.requestsPerMinute || state.active >= policy.concurrency)
      throw new ConnectorError(platform, 'CONNECTOR_THROTTLED');
    if (state.openUntil) state.halfOpen = true;
    state.active++;
    try {
      for (let attempt = 0; attempt <= policy.retries; attempt++) {
        if (request.signal?.aborted) throw new ConnectorError(platform, 'CONNECTOR_TIMEOUT');
        if (state.calls.length >= policy.requestsPerMinute)
          throw new ConnectorError(platform, 'CONNECTOR_THROTTLED');
        state.calls.push(Date.now());
        const controller = new AbortController();
        let timeout: ReturnType<typeof setTimeout> | undefined;
        const abort = () => controller.abort();
        request.signal?.addEventListener('abort', abort, { once: true });
        try {
          const result = await Promise.race([
            state.connector.search({ ...request, signal: controller.signal }),
            new Promise<never>((_, reject) => {
              timeout = setTimeout(() => {
                controller.abort();
                reject(new ConnectorError(platform, 'CONNECTOR_TIMEOUT', true));
              }, policy.timeoutMs);
            }),
          ]);
          state.failures = 0;
          state.openUntil = 0;
          return result;
        } catch (error) {
          if (
            !(error instanceof ConnectorError) ||
            !error.retryable ||
            attempt === policy.retries ||
            request.signal?.aborted
          )
            throw error;
          await pause(500 * 2 ** attempt);
        } finally {
          clearTimeout(timeout);
          request.signal?.removeEventListener('abort', abort);
        }
      }
      return [];
    } catch (error) {
      state.failures++;
      if (state.failures >= policy.failureThreshold) state.openUntil = Date.now() + policy.resetMs;
      throw error;
    } finally {
      state.active--;
      state.halfOpen = false;
    }
  }
  async searchAll(request: ConnectorSearchRequest) {
    const statuses: ConnectorStatus[] = [];
    const settled = await Promise.allSettled(
      this.getAll().map(async (c) => {
        const start = performance.now();
        try {
          const listings = await this.search(c.platform, request);
          statuses.push({
            platform: c.platform,
            success: true,
            durationMs: Math.round(performance.now() - start),
          });
          return listings;
        } catch (error) {
          statuses.push({
            platform: c.platform,
            success: false,
            durationMs: Math.round(performance.now() - start),
            code: error instanceof ConnectorError ? error.code : 'CONNECTOR_UNAVAILABLE',
          });
          throw error;
        }
      }),
    );
    return {
      listings: settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])),
      statuses,
    };
  }
}
