# Free experimental integration

The application now has separate **Live · experimental** and **Demo catalog** modes. Live is the default and uses `POST /api/v1/compare/live`. It never substitutes demo prices. Demo remains available without calling an external API.

## What it can do

- Search public retailer pages for arbitrary product names, independent of the five-product seed.
- Accept supported HTTPS product URLs from Amazon India, Flipkart, Blinkit and Swiggy Instamart.
- Read INR offers from structured Product/Offer JSON-LD, including nested ItemList and graph data. Amazon also has scoped visible-price selectors.
- Read publicly exposed product prices with unknown fees, unknown delivery times and unverified local stock clearly labeled.
- Show each source's result, access restriction or failure, plus direct retailer and Google Shopping links.
- Cache successful observations for one hour and unsuccessful searches for two minutes; retain the observation timestamp.
- Run HTTP extraction locally through the existing Express app. The Cloudflare deployment adds a tightly bounded browser fallback for permitted JavaScript pages.

## What it cannot promise

No retailer integration is guaranteed. Google `/search` and Blinkit `/s/` currently disallow automated access in robots.txt. Google Shopping is a direct link only, not an automated fallback. Flipkart and Swiggy returned 403 during initial access checks. A browser does not remove those restrictions. Missing structured metadata also means no extractable offer. An empty live result is a valid, honest outcome.

The app does not use private retailer APIs, log into retailer accounts, bypass CAPTCHAs, spoof a human browser or acquire proxy services. The Cloudflare renderer blocks third-party traffic and private XHR/fetch calls. This deliberately limits compatibility with complex storefronts. Robots permission is only an access signal, not a licence or a guarantee about site terms; review each source's terms before a public launch.

Pincode is part of the cache key, but **is not sent into retailer sessions**. Thus neither local stock nor delivery fees are location-verified. The UI says so. No live listing gets a Smart Pick or score based on invented fees. Exact normalized titles or GTINs group observations conservatively; users must still verify variants. Product URLs identify supported public product paths only; unsupported hosts, ports, credentials and cross-host redirects are rejected.

## Local preview

Use Node 24 and pnpm 12.5.1. Run `pnpm install`, then `pnpm dev` with `apps/web/.env.local` containing:

```dotenv
NEXT_PUBLIC_API_URL=http://127.0.0.1:4000
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000
```

PostgreSQL and Redis are not required for the experimental local endpoint. Its bounded in-memory cache and quotas reset on restart. Cloudflare D1 makes those limits shared and persistent in deployment. The old Express demo endpoint and PostgreSQL/BullMQ architecture remain available for the original MVP.

## Free Cloudflare deployment

This is a separate edge API in `apps/edge`, not a direct deployment of the Express/PostgreSQL service. No paid search provider or retailer credential is required. You still need your own free hosting account and normal login.

From the repository root:

```sh
pnpm --filter @smartcompare/edge exec wrangler login
pnpm --filter @smartcompare/edge exec wrangler d1 create smartcompare-cache
```

Paste the resulting database ID over the all-zero placeholder in `apps/edge/wrangler.jsonc`. Set `ALLOWED_ORIGINS` to the exact Vercel URL, including `https://` and no trailing slash. Keep `ENABLE_BROWSER` set to `true` only when you want Browser Run enabled. The `BROWSER` binding uses the signed-in Cloudflare account; no token is sent to the website.

```sh
pnpm --filter @smartcompare/edge db:remote
pnpm --filter @smartcompare/edge deploy
```

Confirm `/health` at the returned `workers.dev` URL. Then POST a comparison to `/api/v1/compare/live`. A returned source restriction is not a deployment error. Check Cloudflare logs if the API returns `SERVICE_UNAVAILABLE`; it fails closed when quota storage is missing or unavailable.

Use the **Workers Free** plan. Current documented allocations are 100,000 Worker requests/day, 10 ms CPU/invocation, and 10 Browser Run minutes/day. D1 has its own free read/write/storage limits. Large HTML parsing or a cold Puppeteer load can exceed the CPU allowance; the frontend reports a source/API error, and you can disable browser rendering without paying. Do not upgrade a plan automatically.

The app limits uncached searches to 120/day, each source to one attempt per 30 seconds, and Browser Run starts to eight/day with at least 25 seconds between starts. Each browser has a seven-second close timer after launch and a six-second inactivity timeout. The eight-start budget reserves a conservative 60 seconds per session. These are application caps, not a billing guarantee: other Workers sharing the account also consume the provider allowance. Daily cleanup removes expired cache and quota records. The public API also limits clients to 10 requests/minute. CORS is not authentication; all global budgets remain enforced for requests without an Origin header.

To test D1 locally without cloud access:

```sh
pnpm --filter @smartcompare/edge db:local
pnpm --filter @smartcompare/edge dev
```

Browser Run requires a remote binding or deployment; local emulation does not prove cloud rendering. For an HTTP-only local Worker, use `wrangler dev --var ENABLE_BROWSER:false`. The Express preview already supplies that mode without Wrangler.

## Vercel deployment

1. Upload the source to a GitHub repository and import it into Vercel (or use Vercel CLI; GitHub is optional).
2. Root directory: `apps/web`; framework: Next.js. Include source files outside the root directory so workspace packages are available.
3. Install with `pnpm install --frozen-lockfile`; build with `pnpm build` from the web root.
4. Set `NEXT_PUBLIC_API_URL` to the Cloudflare Worker origin and `NEXT_PUBLIC_SITE_URL` to the public frontend origin.
5. Deploy, add that exact frontend origin to Cloudflare's `ALLOWED_ORIGINS`, then redeploy the Worker if the origin changed.
6. Test a live query, a product URL, the Demo catalog switch, and source-failure messages on the public site.

Public environment variables are embedded at build time. Rebuild Vercel when the API URL changes. No account tokens, passwords or cookies belong in them. Vercel Hobby is for personal/non-commercial use; review its current terms if adding monetization.

## Sources checked during implementation

- https://developers.cloudflare.com/browser-run/pricing/
- https://developers.cloudflare.com/browser-run/limits/
- https://developers.cloudflare.com/browser-run/reference/wrangler/
- https://developers.cloudflare.com/browser-run/reference/robots-txt/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://vercel.com/docs/plans/hobby
- https://www.google.com/robots.txt
- https://blinkit.com/robots.txt

Cloud account provisioning, remote D1 migration, remote rendering and public Vercel deployment require your hosting login and are not implied by a passing local build.
