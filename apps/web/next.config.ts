import type { NextConfig } from 'next';
const config: NextConfig = {
  transpilePackages: ['@smartcompare/shared', '@smartcompare/ui'],
  poweredByHeader: false,
  experimental: {
    useTypeScriptCli: false,
    workerThreads: true,
    webpackBuildWorker: false,
    cpus: 2,
  },
  ...(process.env.STATIC_EXPORT === 'true'
    ? { output: 'export' as const, trailingSlash: true, images: { unoptimized: true } }
    : {}),
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};
export default config;
