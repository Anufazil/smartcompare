# SmartCompare

A neo-brutalist commerce comparison MVP: lime highlights, lilac surfaces, heavy outlines, offset shadows, responsive product cards, and explicit fee breakdowns.

**Live mode is experimental.** It attempts permitted public retailer pages, displays observed INR item prices, and explains blocked/unreadable sources. Fees, delivery time and stock for your pincode remain unverified. The separate Demo catalog uses simulated prices. There is no purchasing, retailer authentication or affiliate tracking.

Start with [Free integration and deployment](docs/free-integration.md) for the new Cloudflare Worker + Browser Run + D1 API and Vercel frontend. Cloud provisioning and remote source access require verification after you sign in to your hosting accounts. The original Express/PostgreSQL/Redis setup is retained below.

## What is implemented

- Next.js App Router with TypeScript, Tailwind, Framer Motion, accessible Radix dialogs, React Hook Form and Zod.
- Home, search, compare, deals and statically generated product routes, with product metadata.
- Product search, pincode/city/manual coordinates and optional geolocation.
- Weighted cheapest / fastest / balanced preferences.
- All four fees, known total, availability, ETA, recommendation, explanation and SmartScore.
- Card/table views and store, availability, category and budget filters.
- Loading, empty, error, cached and partial-result states.
- Express service, deterministic mock connectors, registry, per-store throttling, timeouts, transient retries and circuit breakers.
- Variant-aware matching, integer-paise arithmetic and normalized recommendation scores shared by browser preview and API.
- Prisma PostgreSQL models, migration and idempotent seed.
- Redis comparison cache (300-second TTL), hashed keys, invalidation, Redis-backed rate limiting with local fallback.
- BullMQ comparison-search, platform-fetch and product-matching workers.
- A network-blocked Playwright fixture connector and disabled proxy abstraction.
- Structured Pino logs, Helmet, CORS allowlist, request IDs, validation, body limits and safe errors.
- Unit/API/extraction/quota tests, frontend Playwright specifications, infrastructure integration smoke test and CI workflow.
- Progressive WebMCP comparison tool using the same visible search action.

## Architecture

Next.js -> Express -> comparison service -> connector registry -> normalization/matching -> total cost -> weighted ranking.

The service reads/writes Redis and persists normalized observations with Prisma. Optional queue mode sends comparisons to BullMQ; workers run the same application service. Separate platform-fetch and product-matching queues support explicitly submitted jobs. No browser automation runs in Express.

The web app defaults to Live mode and calls NEXT_PUBLIC_API_URL. The explicit Demo catalog tab uses local fixtures without PostgreSQL, Redis or BullMQ. A failed Live request never falls back to the sample catalog. The local Express API supports live HTTP extraction; the separate Cloudflare Worker adds bounded browser rendering and persistent D1 caching.

## Repository

- apps/web: pages, comparison UI, location dialog, API client, formatting, WebMCP hook.
- apps/api: config, app/server, connectors, validation, cache, services, queues, tests and Prisma.
- apps/worker: BullMQ consumers and local Playwright fixture.
- packages/shared: schemas, types, catalog, mock connectors, matching, pricing and recommendations.
- packages/config: shared strict TypeScript configuration.
- packages/ui: reusable button primitive.
- docker: API and worker container definitions.
- docs: architecture notes, deployment and verification status.
- tests/e2e: browser specifications.
- .github/workflows/ci.yml: checks with PostgreSQL and Redis services.

## Local setup

Prerequisites: Node 24 LTS, pnpm 12.5.1, Docker Compose for PostgreSQL/Redis.

1. Run `pnpm install`.
2. Copy `.env.example` to `.env`.
3. Copy `apps/web/.env.example` to `apps/web/.env.local`.
4. Run `docker compose up -d`.
5. Run `pnpm db:generate`, `pnpm db:migrate`, then `pnpm db:seed`.
6. Run `pnpm dev`.
7. Open http://localhost:3000. Express listens on port 4000.

The database seed creates four platforms, five canonical products and eighteen location-specific postings. Re-running it updates existing records.

The root dev command runs the web app and API; workers are started separately. To start the UI without infrastructure, leave DATABASE_URL and REDIS_URL unset, or permit degraded development mode. API health explicitly identifies disabled dependencies. This is not equivalent to infrastructure verification.

### Running background jobs

Run `pnpm worker` in another terminal with REDIS_URL set. Set USE_QUEUE=true on the API to route comparisons through the comparison-search queue, then restart the API. Keep the worker running. Browser connector jobs belong in the worker process only.

### Commands

| Command               | Purpose                                                               |
| --------------------- | --------------------------------------------------------------------- |
| pnpm dev              | Web and API development                                               |
| pnpm build            | Build the Next.js app and executable API/worker ESM bundles           |
| pnpm test             | Unit, connector, cache-fallback and Supertest API tests               |
| pnpm typecheck        | Strict TypeScript across workspace packages                           |
| pnpm lint             | ESLint                                                                |
| pnpm test:integration | Live PostgreSQL, Redis and BullMQ smoke test; requires migration/seed |
| pnpm test:e2e         | Playwright desktop/mobile suite; start the API first                  |
| pnpm db:generate      | Generate Prisma Client                                                |
| pnpm db:migrate       | Apply committed PostgreSQL migrations                                 |
| pnpm db:seed          | Idempotent fixture seed                                               |
| pnpm worker           | Development workers                                                   |
| pnpm format           | Format source                                                         |

For E2E testing, install Chromium with `pnpm exec playwright install chromium`. The frontend tests reuse a running development server. Set NEXT_PUBLIC_API_URL=http://127.0.0.1:4000 before starting it; the error-state test exercises the API path.

## Environment

| Variable                                           | Meaning                                                                 |
| -------------------------------------------------- | ----------------------------------------------------------------------- |
| DATABASE_URL                                       | PostgreSQL connection URL; managed secret in production                 |
| REDIS_URL                                          | Redis connection URL; use a secured managed endpoint in production      |
| API_PORT                                           | API listener port, default 4000                                         |
| API_HOST                                           | Defaults to loopback in development, 0.0.0.0 in production              |
| CORS_ORIGIN                                        | Comma-separated exact permitted web origins                             |
| NEXT_PUBLIC_API_URL                                | Public Express base URL; absence explicitly enables standalone fixtures |
| NEXT_PUBLIC_SITE_URL                               | Trusted canonical web origin for metadata                               |
| USE_QUEUE                                          | true enables comparison jobs through BullMQ                             |
| ALLOW_DEGRADED_MODE                                | Development fallback; set false in production                           |
| LOG_LEVEL                                          | Pino log level                                                          |
| JWT_SECRET                                         | Reserved; accounts and tokens are not implemented                       |
| AMAZON_API_KEY / FLIPKART_API_KEY / SWIGGY_API_KEY | Reserved for future authorized adapters                                 |

Public-prefixed variables are embedded in the web bundle. Never put secrets in them. No actual secrets are included.

## API

POST /api/v1/compare

```json
{
  "query": "iPhone 15",
  "lat": 12.9716,
  "lng": 77.5947,
  "pincode": "560001",
  "preference": "balanced"
}
```

Successful responses contain the normalized query, location, preference, ranked listings, explicit price components, recommendation explanation, cached flag, generated timestamp, connector status and duration. An application deadline returns a controlled timeout within 15 seconds.

GET /health returns service mode and dependency state.

Queries require 2–200 plain-text characters. Coordinates are bounded; optional Indian pincodes require six digits. Unknown products return an empty list. Malformed requests return 400; throttled clients receive 429; total upstream failure returns 503; partial store failures still produce successful results.

## Scoring and matching

Price/delivery/availability weights:

- cheapest: 80% / 10% / 10%.
- fastest: 10% / 80% / 10%.
- balanced: 50% / 40% / 10%.

“Fastest” prioritizes delivery using these weights; it does not guarantee the absolute shortest ETA regardless of price. Scores normalize within the same canonical product, never across unrelated products. A tiny delivery difference can be outweighed by a substantial price difference. Explanations use actual price and ETA comparisons.

Unavailable listings receive zero and are never recommended. Missing ETAs score zero for delivery. A partial known total cannot beat a fully priced available listing or receive a recommendation. Missing fees are displayed as unknown and tracked separately; zero is only an arithmetic placeholder in the partial sum.

Matching uses normalized tokens plus brand, model, storage/volume/weight and color guards. Different package sizes and explicit variants are rejected. This remains conservative heuristic matching, not a trained entity-resolution system. Authorized connectors should provide complete variant descriptions.

## Adding a connector

Implement CommerceConnector from @smartcompare/shared:

```ts
class PartnerConnector implements CommerceConnector {
  readonly platform = 'Authorized Partner';
  readonly category = 'ECOMMERCE' as const;

  async search(request: ConnectorSearchRequest): Promise<NormalizedListing[]> {
    // Call an authorized API with its credentials and request.signal.
    // Validate the partner payload, convert currency/units and return a listing.
    // Omit an unknown fee instead of reporting zero.
    return [];
  }
}
registry.register(new PartnerConnector(), {
  concurrency: 2,
  requestsPerMinute: 30,
  timeoutMs: 3000,
  retries: 2,
});
```

Register adapters at the composition root, not inside the comparison engine. Extend the retailer URL allowlist when adding a trusted partner. Connectors must honor AbortSignal, categorize transient/permanent errors and obey platform agreements. The mock fixtures return immediately; real network requests must remain bounded.

## Security and operations

- Prisma performs parameterized writes. Decimal columns store money; coordinates and fees have database checks.
- Cache keys include normalized query, coordinates to six decimals, pincode, preference and fixture version. No location-only cache reuse across pincodes.
- Redis failures fall back to bounded process-local cache; a local rate limiter remains active if the shared store fails.
- Production startup fails without required dependencies unless degraded mode was explicitly permitted.
- Upstream URLs require HTTPS and an allowlisted store host; credentials and non-HTTP schemes are rejected.
- Logs exclude secrets. Query and coarse pincode are logged for observability; avoid sending sensitive personal data in search.
- Configure trusted reverse proxies to match the actual hosting network before scaling; the default trusts no forwarded IP headers.
- Keep the database and Redis private, use TLS where applicable, manage secrets at the host, and configure backup/retention and monitoring.
- The proxy provider is disabled. No CAPTCHA bypass, stealth, fingerprint spoofing or quota evasion is implemented.
- Product images are retailer packshots for prototype use. See docs/assets.md for sources and production licensing requirements.

## Deployment

See docs/deployment.md for Vercel plus a separate API/worker host. The requested deployment targets are preserved. No remote production deployment or account configuration has been performed.

## Verification status

See docs/verification.md. The source includes runnable integration checks, but live PostgreSQL/Redis connectivity, migration/seed execution and BullMQ processing were not verified in this workspace because those services and Docker were not available.

A successful frontend build and mock-backed tests do **not** mean the production infrastructure has been provisioned or verified.