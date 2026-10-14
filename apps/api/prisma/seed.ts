import '../src/config/env';
import { PrismaClient } from '@prisma/client';
import { catalog, createMockConnectors, defaultLocation, productTitle } from '@smartcompare/shared';
import { PrismaListingRepository } from '../src/services/repository';
const db = new PrismaClient();
try {
  const repository = new PrismaListingRepository(db);
  for (const product of catalog) {
    const listings = (
      await Promise.all(
        createMockConnectors().map((c) =>
          c.search({ query: productTitle(product), location: defaultLocation }),
        ),
      )
    ).flat();
    await repository.save(listings);
  }
  console.log('Seeded 4 platforms, 5 canonical products and location-specific postings.');
} finally {
  await db.$disconnect();
}
