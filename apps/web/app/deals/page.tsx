import type { Metadata } from 'next';
import { SmartCompare } from '@/components/smartcompare';
export const metadata: Metadata = {
  title: 'Explore demo deals',
  description:
    'Compare complete prices on electronics and everyday essentials in the SmartCompare demo catalog.',
};
export default function Deals() {
  return <SmartCompare mode="deals" />;
}
