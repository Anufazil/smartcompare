import { PrismaClient } from '@prisma/client';
import {
  catalog,
  normalizeTitle,
  productTitle,
  type NormalizedListing,
} from '@smartcompare/shared';
export interface ListingRepository {
  save(listings: NormalizedListing[]): Promise<void>;
}
export class PrismaListingRepository implements ListingRepository {
  constructor(private db: PrismaClient) {}
  async save(listings: NormalizedListing[]) {
    await this.db.$transaction(
      async (tx) => {
        for (const listing of listings) {
          const product = catalog.find((p) => p.id === listing.canonicalProductId);
          if (!product) continue;
          const slug = listing.platform.toLowerCase().replace(/\s+/g, '-');
          const platform = await tx.platform.upsert({
            where: { slug },
            update: {},
            create: {
              slug,
              name: listing.platform,
              type: listing.category,
              baseUrl: listing.productUrl ? new URL(listing.productUrl).origin : '',
            },
          });
          await tx.canonicalProduct.upsert({
            where: { id: product.id },
            update: {},
            create: {
              id: product.id,
              title: productTitle(product),
              normalizedTitle: normalizeTitle(productTitle(product)),
              brand: product.brand,
              category: product.category,
              unit: product.unit,
              unitValue: product.unitValue,
              imageUrl: product.imageUrl,
            },
          });
          const locationKey = [
            listing.location.lat.toFixed(6),
            listing.location.lng.toFixed(6),
            listing.location.pincode ?? '',
          ].join(':');
          const data = {
            title: listing.title,
            productUrl: listing.productUrl,
            imageUrl: listing.imageUrl,
            price: listing.basePrice,
            deliveryFee: listing.deliveryFee ?? null,
            handlingFee: listing.handlingFee ?? null,
            platformFee: listing.platformFee ?? null,
            etaMinutes: listing.etaMinutes,
            available: listing.available,
            pincode: listing.location.pincode ?? '',
            latitude: listing.location.lat,
            longitude: listing.location.lng,
            lastFetchedAt: new Date(),
          };
          await tx.platformPosting.upsert({
            where: {
              platformId_externalId_locationKey: {
                platformId: platform.id,
                externalId: listing.externalId,
                locationKey,
              },
            },
            update: data,
            create: {
              ...data,
              platformId: platform.id,
              canonicalProductId: product.id,
              externalId: listing.externalId,
              locationKey,
            },
          });
        }
      },
      { timeout: 2500, maxWait: 1000 },
    );
  }
}
