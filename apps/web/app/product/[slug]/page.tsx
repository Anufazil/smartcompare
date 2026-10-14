import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { catalog, productTitle } from '@smartcompare/shared';
import { SmartCompare } from '@/components/smartcompare';
export function generateStaticParams() {
  return catalog.map((p) => ({ slug: p.slug }));
}
export const dynamicParams = false;
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params,
    product = catalog.find((p) => p.slug === slug);
  if (!product) return { title: 'Product not found' };
  const title = `Compare ${productTitle(product)} prices`,
    description = `Compare the total price, fees, delivery and availability of ${productTitle(product)} across stores. Simulated MVP catalog.`;
  const images = product.imageUrl ? [{ url: product.imageUrl, alt: productTitle(product) }] : [];
  return {
    title,
    description,
    alternates: { canonical: `/product/${slug}` },
    openGraph: { title, description, images },
    twitter: { card: 'summary', title, description, images: images.map((i) => i.url) },
  };
}
export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params,
    p = catalog.find((p) => p.slug === slug);
  if (!p) notFound();
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: productTitle(p),
    brand: { '@type': 'Brand', name: p.brand },
    description: 'Product comparison using simulated store listings.',
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <SmartCompare initialQuery={productTitle(p)} />
    </>
  );
}
