'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Equal,
  HelpCircle,
  MapPin,
  Search,
  ShoppingBag,
  Smartphone,
  Tags,
  Zap,
  Asterisk,
  RotateCcw,
  LoaderCircle,
  X,
  Sparkles,
} from 'lucide-react';
import {
  catalog,
  cities,
  compareSchema,
  defaultLocation,
  productTitle,
  type CompareResponse,
  type ComparisonResult,
  type Preference,
  type Product,
  type UserLocation,
} from '@smartcompare/shared';
import { compareProducts } from '@/lib/api';
import { rupees } from '@/lib/formatters';
import { StoreMark } from './comparison/comparison-card';
import { Results } from './comparison/results';
import { LocationDialog } from './location/location-dialog';
import { useComparisonTool } from '@/hooks/use-comparison-tool';
import { InfoDialogs } from './layout/info-dialogs';
export const preferenceOptions = [
  { value: 'cheapest' as const, label: 'Lowest price', icon: Tags },
  { value: 'fastest' as const, label: 'Fastest delivery', icon: Zap },
  { value: 'balanced' as const, label: 'Best balance', icon: Equal },
];
const productPrices: Record<string, number> = {
  'iphone15-128-black': 54039,
  'sony-xm5-black': 24030,
  'amul-taaza-1l': 99,
  'coca-cola-750ml': 63,
};
export function SmartCompare({
  initialQuery = '',
  mode = 'compare',
}: {
  initialQuery?: string;
  mode?: 'compare' | 'deals';
}) {
  const [query, setQuery] = useState(initialQuery),
    [preference, setPreference] = useState<Preference>('balanced');
  const [location, setLocation] = useState<UserLocation>(defaultLocation),
    [locationLabel, setLocationLabel] = useState('Bengaluru');
  const [locationOpen, setLocationOpen] = useState(false),
    [response, setResponse] = useState<CompareResponse | null>(null);
  const [loading, setLoading] = useState(false),
    [loadingStep, setLoadingStep] = useState(0),
    [error, setError] = useState('');
  const [category, setCategory] = useState('all'),
    [selectedDeal, setSelectedDeal] = useState<ComparisonResult | null>(null),
    [helpOpen, setHelpOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null),
    resultRef = useRef<HTMLDivElement>(null),
    searchRef = useRef<HTMLInputElement>(null);
  const reducedMotion = useReducedMotion();
  const [dataMode, setDataMode] = useState<'live' | 'demo'>('live');
  const runSearch = useCallback(
    async (
      searchQuery: string,
      selectedPreference = preference,
      selectedLocation = location,
      selectedMode = dataMode,
    ) => {
      const parsed = compareSchema.safeParse({
        query: searchQuery,
        ...selectedLocation,
        preference: selectedPreference,
      });
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? 'Enter a product name.');
        searchRef.current?.focus();
        return;
      }
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setQuery(searchQuery);
      setLoading(true);
      setLoadingStep(0);
      setError('');
      try {
        const data = await compareProducts(parsed.data, controller.signal, selectedMode);
        if (!controller.signal.aborted) {
          setResponse(data);
          window.history.replaceState(
            null,
            '',
            `${window.location.pathname}?q=${encodeURIComponent(searchQuery)}&mode=${selectedMode}`,
          );
          return data;
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          setResponse(null);
          setError(
            e instanceof Error
              ? e.message
              : 'We could not complete the comparison. Please try again.',
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [preference, location, dataMode],
  );
  const initialSearch = useRef(runSearch);
  useComparisonTool(async (q, p, l) => {
    setPreference(p);
    setLocation(l);
    setLocationLabel(cities.find((c) => c.pincode === l.pincode)?.name ?? 'Selected location');
    return runSearch(q, p, l);
  });
  useEffect(() => {
    let saved: UserLocation = defaultLocation;
    try {
      const value = localStorage.getItem('smartcompare-location');
      if (value) {
        const data = JSON.parse(value);
        if (
          compareSchema.safeParse({ ...data.location, query: 'location', preference: 'balanced' })
            .success
        ) {
          saved = data.location;
          setLocation(saved);
          setLocationLabel(String(data.label).slice(0, 80));
        }
      }
    } catch {
      /* Device storage may be disabled. */
    }
    const q = initialQuery || new URLSearchParams(window.location.search).get('q');
    const initialMode =
      new URLSearchParams(window.location.search).get('mode') === 'demo' ? 'demo' : 'live';
    setDataMode(initialMode);
    if (q) void initialSearch.current(q, 'balanced', saved, initialMode);
    return () => abortRef.current?.abort();
  }, [initialQuery]);
  useEffect(() => {
    if (!loading) return;
    const timer = setInterval(() => setLoadingStep((s) => Math.min(s + 1, 2)), 300);
    return () => clearInterval(timer);
  }, [loading]);

  const onSaveLocation = (value: UserLocation, label: string) => {
    setLocation(value);
    setLocationLabel(label);
    try {
      localStorage.setItem('smartcompare-location', JSON.stringify({ location: value, label }));
    } catch {
      /* Device storage may be disabled. */
    }
    if (response) void runSearch(query, preference, value);
  };
  const onPreference = (value: Preference) => {
    setPreference(value);
    if (response) void runSearch(query, value);
  };
  const chooseProduct = (p: Product) => {
    setCategory('all');
    void runSearch(productTitle(p));
    setTimeout(
      () =>
        resultRef.current?.scrollIntoView({
          behavior: reducedMotion ? 'instant' : 'smooth',
          block: 'start',
        }),
      80,
    );
  };
  const products = catalog.filter(
    (p) => p.imageUrl && (category === 'all' || p.category === category),
  );
  return (
    <>
      <div className="announcement">
        <span>LESS TAB-HOPPING. MORE SMART SHOPPING.</span>
        <span className="announcement-right">
          Know what’s known. <ArrowDown size={13} />
        </span>
      </div>
      <header className="site-header">
        <div className="header-inner">
          <Link href="/" className="brand" aria-label="SmartCompare home">
            <span className="brand-icon">
              <ArrowLeftRight size={25} strokeWidth={2.6} />
            </span>
            smartcompare<span className="brand-period">.</span>
          </Link>
          <nav aria-label="Main navigation">
            <Link className={mode === 'compare' ? 'nav-active' : ''} href="/">
              Compare
            </Link>
            <Link className={mode === 'deals' ? 'nav-active' : ''} href="/deals">
              Explore deals <ArrowUpRight size={14} />
            </Link>
            <button onClick={() => setHelpOpen(true)}>How it works</button>
          </nav>
          <span className="demo-label">
            <span />
            {dataMode === 'live' ? 'EXPERIMENTAL LIVE' : 'DEMO CATALOG'}
          </span>
        </div>
      </header>
      <main>
        <section className="hero page-width">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="small-star">✳</span> YOUR MONEY DESERVES BETTER.
            </div>
            <h1>
              {mode === 'deals' ? (
                <>
                  GOOD FINDS.
                  <br />
                  <span className="highlight">BETTER PRICES.</span>
                </>
              ) : (
                <>
                  ONE SEARCH.
                  <br />
                  THE <span className="highlight">SMARTER BUY.</span>
                </>
              )}
            </h1>
            <p>
              Compare public prices. See what’s still unknown.
              <br className="desktop-break" /> Make your next purchase a no-brainer.
            </p>
          </div>
          <div className="hero-note" aria-label="Check the full cost">
            <div className="note-tape" />
            <Asterisk className="note-star" size={44} strokeWidth={2.4} />
            <span className="note-kicker">THE PRICE TAG ISN’T THE WHOLE STORY.</span>
            <strong>
              Small fees.
              <br />
              Big difference.
            </strong>
            <div className="note-line" />
            <p>
              Missing fees stay visible.
              <br />
              You make the smarter call.
            </p>
            <span className="note-arrow">
              <ArrowDown size={27} />
            </span>
          </div>
        </section>
        <section className="search-section page-width" aria-label="Product comparison search">
          <div className="data-mode-row" role="group" aria-label="Data source">
            {(['live', 'demo'] as const).map((value) => (
              <button
                key={value}
                aria-pressed={dataMode === value}
                className={dataMode === value ? 'selected' : ''}
                onClick={() => {
                  abortRef.current?.abort();
                  setLoading(false);
                  setResponse(null);
                  setError('');
                  setCategory('all');
                  setDataMode(value);
                }}
              >
                {value === 'live' ? 'Live · experimental' : 'Demo catalog'}
              </button>
            ))}
            <span>
              {dataMode === 'live'
                ? 'Any product name or supported retailer product URL'
                : 'Fixed sample products · simulated prices'}
            </span>
          </div>
          <div className="search-box">
            <div className="category-tabs" role="group" aria-label="Product category">
              {[
                { id: 'all', name: 'Everything', icon: ShoppingBag },
                { id: 'electronics', name: 'Electronics', icon: Smartphone },
                { id: 'essentials', name: 'Daily essentials', icon: ShoppingBag },
              ].map((c) => (
                <button
                  key={c.id}
                  className={category === c.id ? 'active' : ''}
                  aria-pressed={category === c.id}
                  onClick={() => setCategory(c.id)}
                >
                  <c.icon size={17} />
                  {c.name}
                </button>
              ))}
              <span className="search-caption">4 STORES. ONE CLEAR ANSWER.</span>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void runSearch(query);
              }}
              className="search-form"
            >
              <div className="search-main-row">
                <label className="search-input-wrap">
                  <Search size={23} />
                  <span className="sr-only">Search products</span>
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={
                      dataMode === 'live'
                        ? 'Search a product or paste its retailer URL'
                        : 'What’s on your shopping list?'
                    }
                    aria-label="Search products"
                    maxLength={2048}
                    required
                    minLength={2}
                  />
                  {query && (
                    <button
                      type="button"
                      className="clear-search"
                      aria-label="Clear search"
                      onClick={() => {
                        setQuery('');
                        searchRef.current?.focus();
                      }}
                    >
                      <X size={16} />
                    </button>
                  )}
                </label>
                <button
                  type="button"
                  className="location-button"
                  onClick={() => setLocationOpen(true)}
                >
                  <MapPin size={20} />
                  <span>
                    <small>DELIVERING TO</small>
                    <strong>{locationLabel}</strong>
                  </span>
                  <ChevronDown size={16} />
                </button>
                <button type="submit" className="button search-submit lime" disabled={loading}>
                  {loading ? (
                    <LoaderCircle className="spin" size={20} />
                  ) : (
                    <>
                      Compare prices <ArrowRight size={20} />
                    </>
                  )}
                </button>
              </div>
              <div className="preference-row">
                <span>What matters most?</span>
                <div className="preference-buttons">
                  {preferenceOptions.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      className={preference === p.value ? 'selected' : ''}
                      aria-pressed={preference === p.value}
                      onClick={() => onPreference(p.value)}
                    >
                      <p.icon size={15} />
                      {p.label}
                      {preference === p.value && <Check size={14} />}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="preference-help"
                  aria-label="Explain comparison preferences"
                  onClick={() => setHelpOpen(true)}
                >
                  <HelpCircle size={18} />
                </button>
              </div>
            </form>
            {error && (
              <div className="error-message" role="alert">
                <span>{error}</span>
                <button onClick={() => void runSearch(query)}>
                  <RotateCcw size={15} /> Try again
                </button>
              </div>
            )}
          </div>
          <div className="search-under">
            <p>
              Try{' '}
              <button onClick={() => void runSearch('iPhone 15')}>
                iPhone 15 <ArrowUpRight size={12} />
              </button>
              <button onClick={() => void runSearch('Amul Taaza Milk 1L')}>
                Amul milk <ArrowUpRight size={12} />
              </button>
              <button onClick={() => void runSearch('Sony headphones')}>
                Sony headphones <ArrowUpRight size={12} />
              </button>
            </p>
            <span>
              <Check size={15} />{' '}
              {dataMode === 'live' ? 'Unknown fees stay unknown.' : 'Simulated fees included.'}
            </span>
          </div>
        </section>
        <div ref={resultRef} className="results-anchor" />
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.section
              key="loading"
              className="page-width loading-panel"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              role="status"
              aria-live="polite"
            >
              <LoaderCircle size={30} className="spin" />
              <h2>
                {
                  ['Searching platforms…', 'Matching products…', 'Calculating total prices…'][
                    loadingStep
                  ]
                }
              </h2>
              <p>
                {dataMode === 'live'
                  ? 'Checking permitted public pages. Some stores may be unavailable.'
                  : 'Comparing simulated prices at all four stores.'}
              </p>
              <div className="loading-stores">
                {['Amazon', 'Flipkart', 'Blinkit', 'Swiggy Instamart'].map((s) => (
                  <StoreMark key={s} platform={s} />
                ))}
              </div>
            </motion.section>
          ) : response ? (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: reducedMotion ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Results
                response={response}
                category={category}
                resetCategory={() => setCategory('all')}
                onView={setSelectedDeal}
                onRefresh={() => void runSearch(query)}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
        <section className="page-width popular-section">
          <div className="section-heading">
            <div>
              <div className="eyebrow">
                {mode === 'deals' ? 'A FEW GOOD PLACES TO START.' : 'LESS SCROLLING. MORE SAVING.'}
              </div>
              <h2>
                {response ? 'What’s next on your list?' : 'Worth a comparison.'}
                <span className="heading-star">✳</span>
              </h2>
            </div>
            <span className="outlined-label">
              {dataMode === 'live' ? 'SEARCH INSPIRATION' : 'THE DEMO SHORTLIST'}
            </span>
          </div>
          <div className="product-grid">
            {products.map((p, index) => (
              <button className="product-card" key={p.id} onClick={() => chooseProduct(p)}>
                <div className={`product-image color-${catalog.indexOf(p)}`}>
                  <span className="product-category">
                    {p.category === 'electronics' ? 'TECH & GADGETS' : 'EVERYDAY ESSENTIALS'}
                  </span>
                  <img src={p.imageUrl} alt={productTitle(p)} />
                  <span className="product-arrow">
                    <ArrowUpRight size={22} />
                  </span>
                  {index === 0 && (
                    <span className="product-sticker">
                      SMART
                      <br />
                      FINDS
                    </span>
                  )}
                </div>
                <div className="product-info">
                  <h3>{p.title}</h3>
                  <p>
                    {p.unit === 'piece'
                      ? 'Wireless · Noise cancelling'
                      : `${p.unitValue}${p.unit}${p.color ? ' · ' + p.color : ''}`}
                  </p>
                  <div className="product-bottom">
                    <span>
                      {dataMode === 'demo' ? (
                        <>
                          From <strong>{rupees(productPrices[p.id] ?? 0)}</strong>
                          <small>simulated total · Bengaluru</small>
                        </>
                      ) : (
                        <>
                          Check public prices<small>Availability varies by source</small>
                        </>
                      )}
                    </span>
                    <span className="store-count">
                      {dataMode === 'live' ? '4 sources' : '4 stores'} <ArrowRight size={14} />
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
        <section className="page-width promise-strip">
          <div className="promise-heading">
            <Sparkles size={27} />
            <strong>
              The full picture.
              <br />
              Before you buy.
            </strong>
          </div>
          <div>
            <span className="step-number">01</span>
            <p>
              <b>The true total.</b>
              <span>Item + known fees. Missing fees labeled.</span>
            </p>
          </div>
          <div>
            <span className="step-number">02</span>
            <p>
              <b>Your time matters.</b>
              <span>From quick minutes to a few days.</span>
            </p>
          </div>
          <div>
            <span className="step-number">03</span>
            <p>
              <b>Your kind of best.</b>
              <span>Cheapest, fastest, or just right.</span>
            </p>
          </div>
        </section>
      </main>
      <footer className="page-width site-footer">
        <Link className="footer-brand" href="/">
          smartcompare.
        </Link>
        <p>A little comparison goes a long way.</p>
        <button onClick={() => setHelpOpen(true)}>
          About the data <ArrowUpRight size={14} />
        </button>
        <span>MADE FOR THE SMARTER SHOPPER.</span>
      </footer>
      <LocationDialog
        open={locationOpen}
        onOpenChange={setLocationOpen}
        location={location}
        label={locationLabel}
        onSave={onSaveLocation}
      />
      <InfoDialogs
        helpOpen={helpOpen}
        setHelpOpen={setHelpOpen}
        selectedDeal={selectedDeal}
        setSelectedDeal={setSelectedDeal}
      />
    </>
  );
}
