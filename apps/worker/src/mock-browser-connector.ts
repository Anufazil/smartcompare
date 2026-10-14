import { chromium } from 'playwright';
import type {
  CommerceConnector,
  ConnectorSearchRequest,
  NormalizedListing,
} from '@smartcompare/shared';
import { ConnectorError } from '../../api/src/utils/errors';
import { listingSchema } from '../../api/src/validation/listing';
/** Safe demonstration: opens ONLY an inline fixture; performs no requests to commerce sites. */
export class MockBrowserConnector implements CommerceConnector {
  readonly platform = 'Local browser fixture';
  readonly category = 'ECOMMERCE' as const;
  private active = false;
  async search(request: ConnectorSearchRequest): Promise<NormalizedListing[]> {
    if (this.active) throw new ConnectorError(this.platform, 'CONNECTOR_THROTTLED');
    if (request.signal?.aborted) throw new ConnectorError(this.platform, 'CONNECTOR_TIMEOUT');
    this.active = true;
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
    let abort: (() => void) | undefined;
    try {
      browser = await chromium.launch({ timeout: 5000 });
      abort = () => {
        void browser?.close();
      };
      request.signal?.addEventListener('abort', abort, { once: true });
      if (request.signal?.aborted) throw new ConnectorError(this.platform, 'CONNECTOR_TIMEOUT');
      const context = await browser.newContext();
      // No outgoing network is permitted by this fixture.
      await context.route('**/*', (route) => route.abort());
      const page = await context.newPage();
      page.setDefaultTimeout(3000);
      page.setDefaultNavigationTimeout(3000);
      await page.setContent(
        '<main><article data-title="Amul Taaza Milk 1L" data-price="75">Mock product fixture</article></main>',
        { timeout: 3000 },
      );
      const rows = await page
        .locator('article')
        .evaluateAll((elements) =>
          elements.map((e) => ({
            title: e.getAttribute('data-title'),
            basePrice: Number(e.getAttribute('data-price')),
          })),
        );
      return rows
        .filter((r) => r.title?.toLowerCase().includes(request.query.toLowerCase()))
        .map((row) =>
          listingSchema.parse({
            ...row,
            platform: this.platform,
            category: this.category,
            externalId: 'fixture-milk',
            available: true,
            deliveryFee: 0,
            handlingFee: 0,
            platformFee: 0,
            etaMinutes: 60,
            location: request.location,
            metadata: { mock: true },
          }),
        );
    } catch {
      throw new ConnectorError(this.platform, 'BROWSER_FIXTURE_FAILED');
    } finally {
      if (abort) request.signal?.removeEventListener('abort', abort);
      await browser?.close();
      this.active = false;
    }
  }
}
