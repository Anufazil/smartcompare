# Deployment

## Frontend: Vercel

Import the monorepo and select apps/web as the root. Use the Next.js framework preset and the pnpm lockfile. Set Node 24, NEXT_PUBLIC_API_URL to the HTTPS API origin and NEXT_PUBLIC_SITE_URL to the final web origin. Enable access to files outside the root directory so workspace packages can be transpiled.

The build command is pnpm build in apps/web (next build --webpack). Product pages are statically generated from the public fixture catalog. User coordinates are client-side inputs and are not used to generate public SEO metadata.

Do not set STATIC_EXPORT for the standard Vercel deployment. Optional STATIC_EXPORT=true exists for a standalone exported preview without server bindings.

## API: Render / Railway / Fly.io or equivalent

Build from the repository root:

1. pnpm install --frozen-lockfile
2. pnpm --filter @smartcompare/api build
3. pnpm db:migrate (release job, once per deployment)
4. pnpm --filter @smartcompare/api start

Alternatively build docker/Dockerfile.api with the repository as Docker context.

Set NODE_ENV=production, ALLOW_DEGRADED_MODE=false, API_HOST=0.0.0.0, API_PORT to the host port, DATABASE_URL, REDIS_URL, CORS_ORIGIN to the exact Vercel origin, and LOG_LEVEL=info.

Use the host's secret manager. Set appropriately scoped TLS PostgreSQL and Redis endpoints. Before trusting X-Forwarded-For, configure Express trust proxy for the exact known proxy topology. A blanket trust-proxy setting lets direct clients spoof IPs.

The API's default no-proxy configuration is conservative but may rate-limit all visitors behind the same ingress as one IP until the host configuration is adjusted.

## Worker

Build the worker with pnpm db:generate and pnpm --filter @smartcompare/worker build. Start pnpm --filter @smartcompare/worker start in a persistent worker service, or use docker/Dockerfile.worker. Give it the same PostgreSQL/Redis credentials and set ALLOW_DEGRADED_MODE=false.

Set USE_QUEUE=true on the API only when the worker is healthy. Keep queues private. Failed/completed job retention is count-bounded. Set host shutdown grace periods to allow in-flight jobs to finish.

The Playwright connector is a network-blocked local fixture and is not registered by default. If you explicitly run it, install Chromium and system dependencies in that worker image. Real browser integrations require authorization.

## Before enabling production traffic

Run migration and seed on a disposable staging database, then pnpm test:integration. Run pnpm test:e2e against the API-connected web app. Verify TLS, exact CORS origin, correct listener port, proxy topology, startup health, backups and worker shutdown.

Replace the mock connectors only with official, partner or otherwise authorized feeds. Obtain permitted product imagery and avoid claiming live prices until authorized adapters are connected.

The current project intentionally retains a visible demo label and simulated-price disclosure.

# Experimental free deployment

For the current Live mode, follow [free-integration.md](free-integration.md). It deploys a separate Cloudflare Worker API using D1 and Browser Run. It does not need PostgreSQL, Redis or a paid retailer data provider. The original full-infrastructure deployment is preserved below.
