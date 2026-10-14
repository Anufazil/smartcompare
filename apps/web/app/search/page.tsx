import type { Metadata } from 'next';
import { SmartCompare } from '@/components/smartcompare';
export const metadata: Metadata = {
  title: 'Search products',
  robots: { index: false, follow: true },
};
export default function Search() {
  return <SmartCompare />;
}
