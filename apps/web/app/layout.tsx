import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title: { default: 'SmartCompare — One search. The smarter buy.', template: '%s | SmartCompare' },
  description: 'Compare the complete price, delivery time and availability across stores.',
  icons: { icon: '/favicon.svg' },
  openGraph: {
    title: 'SmartCompare — The smarter buy.',
    description: 'Every fee. Every option. One smarter decision.',
    type: 'website',
    siteName: 'SmartCompare',
  },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
