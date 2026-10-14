import type { Metadata } from 'next';
import { SmartCompare } from '@/components/smartcompare';
export const metadata: Metadata = {
  title: 'Compare complete prices',
  robots: { index: false, follow: true },
};
export default function Compare() {
  return <SmartCompare />;
}
