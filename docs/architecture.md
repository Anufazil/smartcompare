# Architecture decisions

- Shared domain modules contain no Node-only imports. The offline UI and API use the same deterministic fixtures, matching, arithmetic and scoring.
- The Express application is constructed separately from the listener. Supertest can inject an isolated service/cache/registry without opening deployment ports.
- Canonical grouping precedes ranking. A search for “phone” can return several separate products, each with its own recommendation.
- Fees are represented in rupees at the connector boundary for compatibility with the brief, summed as integer paise, and stored as PostgreSQL Decimal. Missing fees remain nullable in the database.
- Listings are unique by platform, external ID and location key. A pincode alone is not enough to distinguish coordinate-dependent observations.
- Infrastructure adapters sit behind ComparisonCache and ListingRepository. Development can degrade to bounded process memory; production is strict unless explicitly configured otherwise.
- Only fully successful connector comparisons are cached. A transient failed store is retried on the next request rather than disappearing for five minutes.
- ConnectorRegistry owns per-store limits and health. Authentication/permanent errors are not retried; typed transient errors use 500ms and 1s backoff. Calls are bounded; response handling has an overall 14.5-second deadline.
- Full comparison jobs run in BullMQ only when USE_QUEUE=true. platform-fetch and product-matching consumers support independently submitted work; they are not mandatory extra hops in every mock comparison.
- Application errors expose an intentional code and plain-language message. Internal exception messages and stack traces are not returned.
- Location preferences are device-local only. Manual known-city pins use coarse city coordinates. An unknown pincode requires manually supplied coordinates; no unauthorized geocoding provider is assumed.
- The default app is a shopping workspace. The neo-brutalist treatment uses typography, thick borders, tangible shadows, lime priority controls and lilac category/help surfaces.
- No future wishlist, accounts, alerts, LLM or payment features are simulated. ShoppingAssistantService is an interface only.
- The provided TS loader is an optional in-process workaround for Windows sandbox environments that cannot create child-process pipes. Standard development uses tsx; production runs bundled ESM.
