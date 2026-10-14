# Verification status

## Free experimental integration — 22 September 2026

- 76 Vitest/Supertest tests passed, including 25 live extraction/service tests and four edge API/D1 tests. Extraction fixtures are offline test data, not evidence of live retailer availability.
- ESLint and TypeScript checks passed for the web, API, background worker, live package and edge API.
- The Next.js production build passed. API and background-worker bundles compiled and the API started successfully. The edge API bundled through esbuild (about 1.1 MB uncompressed).
- A real local search for `Dove intense repair shampoo` returned 15 Amazon listings at 08:29 UTC, including shampoo-only products and clearly separated bundle/size variants. A repeat request returned the cached observation. Prices are observations, not verified checkout totals.
- In that search, Flipkart's access-policy retrieval failed, Blinkit disallowed automated search, and Swiggy Instamart returned no readable matching prices. Each outcome appeared in the UI with direct search links.
- A real Amazon product-URL request returned an explicit `TOO_LARGE` status because its page exceeded the 1 MB extraction limit; no demo prices were substituted.
- Connected-browser checks passed for live search, cards/table views, unknown-fee labels, retailer handoff, switching to demo and restoring demo mode on reload. The updated live results had no document overflow at a 390 px mobile viewport.

Still unverified: Cloudflare account provisioning, remote D1 migrations, Browser Run execution, and public Vercel deployment. Wrangler's dry-run could not run in this Windows sandbox because its esbuild subprocess was denied (`spawn EPERM`); the independent edge bundle and type checks do not establish cloud runtime compatibility. The full Playwright CLI suite was not run. See [free-integration.md](free-integration.md) for account setup and deployment steps.

## Original demo verification

Previously verified in this workspace:

- 47 Vitest/Supertest tests passed: pricing, variant matching, weighted ranking, validation, rate limiting, cache hits/keys, partial/total connector failure, Redis fallback, persistence failure, circuit recovery, timeouts and concurrency.
- ESLint passed.
- Strict TypeScript passed for the web, API, worker and test sources.
- Next.js optimized production build passed and generated all product routes.
- API and worker ESM bundles compiled.
- Prisma schema validation and Prisma Client generation passed.
- The running Express endpoint returned four store options and explicit prices.
- Browser checks covered search, preferences, location changes, filtered empty state and reset, retailer handoff dialog, direct product-page loading, API connection error messaging and successful retry recovery.
- Browser layout checks found no horizontal overflow at 360, 390, 768, 1024 or 1440 px.
- The WebMCP tool registered, returned the same visible comparison for a valid request, and rejected invalid coordinates/query input.

Not verified here:

- Live PostgreSQL connection, committed migration execution, Prisma seed, or persistence against a real server.
- Live Redis TTL/invalidation/distributed limits and BullMQ job processing.
- The full Playwright CLI suite. Browser checks above used the connected browser.
- Cloud deployment, hosting account setup, production proxy configuration or authenticated commerce integrations.

PostgreSQL, Redis and Docker were not installed on the host. The repository includes docker-compose.yml, an integration smoke test and a CI job with both services so these checks can run in the intended environment. Do not mark the infrastructure checklist complete until they pass.

Windows-specific environment notes:

- Child-process pipes are restricted, so optional package install scripts could not all execute normally.
- Prisma Client was generated directly; esbuild was exercised through its CLI.
- The dev preview runs the Next.js server in process with supported TypeScript compiler API/worker-thread options.
- The migration SQL was authored to match schema.prisma (including additional nonnegative-fee/coordinate checks); the migration diff command could not launch its separate schema engine in this sandbox.
