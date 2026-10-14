import { productTitle } from './catalog';
import { searchCatalog } from './matching';
import type {
  Category,
  CommerceConnector,
  ConnectorSearchRequest,
  NormalizedListing,
} from './types';
type Offer = [number, number, number, number, number];
const offers: Record<string, Record<string, Offer>> = {
  Amazon: {
    'iphone15-128-black': [54999, 0, 0, 0, 2880],
    'sony-xm5-black': [24990, 0, 0, 0, 1440],
    'amul-taaza-1l': [78, 40, 0, 0, 1440],
    'coca-cola-750ml': [40, 40, 0, 0, 1440],
    'samsung-s25-256': [74999, 0, 0, 0, 2880],
  },
  Flipkart: {
    'iphone15-128-black': [53999, 40, 0, 0, 2880],
    'sony-xm5-black': [23990, 40, 0, 0, 2880],
    'amul-taaza-1l': [75, 35, 0, 3, 1440],
    'coca-cola-750ml': [38, 35, 0, 3, 1440],
    'samsung-s25-256': [73999, 40, 0, 0, 2880],
  },
  Blinkit: {
    'iphone15-128-black': [55999, 25, 5, 3, 12],
    'sony-xm5-black': [25990, 25, 5, 3, 12],
    'amul-taaza-1l': [75, 20, 5, 3, 10],
    'coca-cola-750ml': [40, 20, 5, 3, 10],
  },
  'Swiggy Instamart': {
    'iphone15-128-black': [55499, 20, 5, 3, 18],
    'sony-xm5-black': [25490, 20, 5, 3, 16],
    'amul-taaza-1l': [74, 15, 5, 3, 15],
    'coca-cola-750ml': [38, 15, 5, 3, 15],
  },
};
const urls: Record<string, string> = {
  Amazon: 'https://www.amazon.in/s?k=',
  Flipkart: 'https://www.flipkart.com/search?q=',
  Blinkit: 'https://blinkit.com/s/?q=',
  'Swiggy Instamart': 'https://www.swiggy.com/instamart/search?query=',
};
abstract class MockConnector implements CommerceConnector {
  abstract readonly platform: string;
  abstract readonly category: Category;
  async search(request: ConnectorSearchRequest): Promise<NormalizedListing[]> {
    if (request.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const zone = request.location.pincode
      ? Number(request.location.pincode.slice(-1)) % 3
      : Math.abs(Math.round(request.location.lat * 10)) % 3;
    return searchCatalog(request.query)
      .slice(0, request.limit ?? 20)
      .flatMap((p) => {
        const data = offers[this.platform]?.[p.id];
        if (!data) return [];
        const [basePrice, deliveryFee, handlingFee, platformFee, eta] = data;
        const quick = this.category === 'QUICK_COMMERCE';
        return [
          {
            platform: this.platform,
            category: this.category,
            externalId: `${this.platform.toLowerCase().replace(/\s/g, '-')}-${p.id}`,
            canonicalProductId: p.id,
            title: productTitle(p),
            brand: p.brand,
            imageUrl: p.imageUrl,
            productUrl: urls[this.platform] + encodeURIComponent(productTitle(p)),
            basePrice,
            deliveryFee: deliveryFee + (quick ? zone * 2 : 0),
            handlingFee,
            platformFee,
            etaMinutes: eta + (quick ? zone * 2 : 0),
            available: !(quick && zone === 2 && p.category === 'electronics'),
            location: request.location,
            metadata: { mock: true, fixtureVersion: 1 },
          },
        ];
      });
  }
}
export class AmazonMockConnector extends MockConnector {
  readonly platform = 'Amazon';
  readonly category = 'ECOMMERCE' as const;
}
export class FlipkartMockConnector extends MockConnector {
  readonly platform = 'Flipkart';
  readonly category = 'ECOMMERCE' as const;
}
export class BlinkitMockConnector extends MockConnector {
  readonly platform = 'Blinkit';
  readonly category = 'QUICK_COMMERCE' as const;
}
export class InstamartMockConnector extends MockConnector {
  readonly platform = 'Swiggy Instamart';
  readonly category = 'QUICK_COMMERCE' as const;
}
export function createMockConnectors(): CommerceConnector[] {
  return [
    new AmazonMockConnector(),
    new FlipkartMockConnector(),
    new BlinkitMockConnector(),
    new InstamartMockConnector(),
  ];
}
