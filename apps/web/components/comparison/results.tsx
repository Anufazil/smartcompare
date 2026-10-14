'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Check, RotateCcw, Search, SlidersHorizontal } from 'lucide-react';
import { catalog, type CompareResponse, type ComparisonResult } from '@smartcompare/shared';
import { ComparisonCard, StoreMark } from './comparison-card';
import { rupees, etaLabel } from '@/lib/formatters';
const stores = ['Amazon', 'Flipkart', 'Blinkit', 'Swiggy Instamart'];
export function Results({
  response,
  category,
  resetCategory,
  onView,
  onRefresh,
}: {
  response: CompareResponse;
  category: string;
  resetCategory: () => void;
  onView: (r: ComparisonResult) => void;
  onRefresh: () => void;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false),
    [platforms, setPlatforms] = useState(stores),
    [availableOnly, setAvailableOnly] = useState(false),
    [maxPrice, setMaxPrice] = useState(''),
    [view, setView] = useState<'cards' | 'table'>('cards');
  const visible = response.results.filter(
    (r) =>
      platforms.includes(r.platform) &&
      (!availableOnly || r.available) &&
      (!maxPrice || r.price.total <= Number(maxPrice)) &&
      (!response.metadata.demo ||
        category === 'all' ||
        catalog.find((p) => p.id === r.canonicalProductId)?.category === category),
  );
  const groups = [...new Set(visible.map((r) => r.canonicalProductId ?? r.title))],
    count = response.metadata.connectorStatuses.filter((s) => s.success).length;
  const active =
    Number(availableOnly) + Number(!!maxPrice) + Number(platforms.length !== stores.length);
  function reset() {
    setPlatforms(stores);
    setAvailableOnly(false);
    setMaxPrice('');
    resetCategory();
  }
  return (
    <section className="page-width results-section" aria-label="Comparison results">
      <div className="section-heading">
        <div>
          <div className="eyebrow">THE NUMBERS ARE IN.</div>
          <h2>
            Your options, <span className="serif-word">unpacked.</span>
          </h2>
        </div>
        <div className="result-tools">
          <button
            className={`filter-button ${filtersOpen ? 'selected' : ''}`}
            onClick={() => setFiltersOpen(!filtersOpen)}
            aria-expanded={filtersOpen}
          >
            <SlidersHorizontal size={17} /> Filters {active ? <b>{active}</b> : null}
          </button>
          <div className="view-switch" aria-label="Results view">
            {(['cards', 'table'] as const).map((v) => (
              <button
                key={v}
                className={view === v ? 'selected' : ''}
                aria-pressed={view === v}
                onClick={() => setView(v)}
              >
                {v === 'cards' ? 'Cards' : 'Table'}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="result-meta">
        <span>
          {visible.length} options for <strong>“{response.query}”</strong> ·{' '}
          {response.location.pincode ?? 'Your location'}
        </span>
        <span>
          {count} of {response.metadata.connectorStatuses.length} stores responded ·{' '}
          {response.metadata.cached ? 'Cached observation' : 'Just checked'}{' '}
          <button aria-label="Refresh comparison" onClick={onRefresh}>
            <RotateCcw size={13} />
          </button>
        </span>
      </div>
      {!response.metadata.demo && (
        <div className="live-source-panel">
          <p>{response.metadata.notice}</p>
          <p>
            Last checked: {new Date(response.metadata.generatedAt).toLocaleString()} · Public prices
            may change.
          </p>
          <div className="source-status-grid">
            {response.metadata.connectorStatuses.map((source) => (
              <div key={source.platform} className="source-status">
                <strong>{source.platform}</strong>
                <span>{source.message || source.code}</span>
              </div>
            ))}
          </div>
          <div className="retailer-links" aria-label="Search retailers directly">
            {response.metadata.searchLinks?.map((link) => (
              <a
                key={link.platform}
                className="button"
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open {link.platform} <ArrowUpRight size={14} />
              </a>
            ))}
          </div>
        </div>
      )}
      {count < response.metadata.connectorStatuses.length && (
        <p className="partial-notice">
          Some stores are temporarily unavailable. You can still compare the options below.
        </p>
      )}
      {filtersOpen && (
        <div className="filters-panel">
          <fieldset>
            <legend>Stores</legend>
            {stores.map((p) => (
              <label key={p}>
                <input
                  type="checkbox"
                  checked={platforms.includes(p)}
                  onChange={(e) =>
                    setPlatforms(
                      e.target.checked ? [...platforms, p] : platforms.filter((s) => s !== p),
                    )
                  }
                />
                {p}
              </label>
            ))}
          </fieldset>
          <label className="max-price">
            Maximum total (₹)
            <input
              type="number"
              min="0"
              value={maxPrice}
              placeholder="No limit"
              onChange={(e) => setMaxPrice(e.target.value)}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={availableOnly}
              onChange={(e) => setAvailableOnly(e.target.checked)}
            />{' '}
            In stock only
          </label>
          <button className="text-button" onClick={reset}>
            Reset filters
          </button>
        </div>
      )}
      {!visible.length ? (
        <div className="empty-state">
          <Search size={34} />
          <h3>
            {response.results.length
              ? 'No options match these filters.'
              : response.metadata.demo
                ? 'No matching products. Yet.'
                : 'No readable live prices this time.'}
          </h3>
          <p>
            {response.results.length
              ? 'Try a higher budget or include more stores.'
              : response.metadata.demo
                ? 'Try iPhone 15, Sony headphones, Amul milk or Coca-Cola from our demo catalog.'
                : 'The sources above explain why. Try a supported product URL, or open a retailer to see its current price. No sample prices have been substituted.'}
          </p>
          {response.results.length > 0 && (
            <button className="button lime" onClick={reset}>
              Reset filters
            </button>
          )}
        </div>
      ) : (
        groups.map((group) => {
          const rows = visible.filter((r) => (r.canonicalProductId ?? r.title) === group),
            product = catalog.find((p) => p.id === rows[0]?.canonicalProductId);
          return (
            <div className="product-result-group" key={group}>
              <div className="matched-product">
                <span>
                  <Check size={15} />{' '}
                  {response.metadata.demo
                    ? 'SAME PRODUCT. SAME VARIANT.'
                    : 'OBSERVED LISTING · VERIFY PACK SIZE'}
                </span>
                <strong>{rows[0]?.title}</strong>
                {product && (
                  <Link href={`/product/${product.slug}`}>
                    Product details <ArrowUpRight size={14} />
                  </Link>
                )}
              </div>
              {view === 'cards' ? (
                <div className="comparison-grid">
                  {rows.map((r) => (
                    <ComparisonCard key={r.externalId} listing={r} onView={onView} />
                  ))}
                </div>
              ) : (
                <div className="table-scroll">
                  <table>
                    <caption className="sr-only">Complete price comparison</caption>
                    <thead>
                      <tr>
                        <th>Store</th>
                        <th>Item</th>
                        <th>Delivery fee</th>
                        <th>Handling</th>
                        <th>Platform fee</th>
                        <th>Total</th>
                        <th>Arrives in</th>
                        <th>{response.metadata.demo ? 'SmartScore' : 'Price status'}</th>
                        <th>Deal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr className={r.isRecommended ? 'recommended-row' : ''} key={r.externalId}>
                          <th>
                            <StoreMark platform={r.platform} />
                            {r.platform}
                            {r.isRecommended && <small>Smart pick</small>}
                          </th>
                          <td>{rupees(r.price.base)}</td>
                          <td>
                            {r.price.unknownFees.includes('deliveryFee')
                              ? 'Unknown'
                              : rupees(r.price.delivery)}
                          </td>
                          <td>
                            {r.price.unknownFees.includes('handlingFee')
                              ? 'Unknown'
                              : rupees(r.price.handling)}
                          </td>
                          <td>
                            {r.price.unknownFees.includes('platformFee')
                              ? 'Unknown'
                              : rupees(r.price.platform)}
                          </td>
                          <td>
                            <strong>
                              {rupees(r.price.total)}
                              {r.price.confidence === 'partial' ? '+' : ''}
                            </strong>
                          </td>
                          <td>{etaLabel(r.etaMinutes)}</td>
                          <td>
                            {response.metadata.demo
                              ? `${Math.round(r.score * 100)}/100`
                              : 'Fees unknown'}
                          </td>
                          <td>
                            <button
                              className="button"
                              disabled={!r.available && !r.metadata?.observed}
                              onClick={() => onView(r)}
                            >
                              {r.metadata?.observed
                                ? 'Check retailer'
                                : r.available
                                  ? 'View'
                                  : 'Out of stock'}
                              <ArrowUpRight size={15} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })
      )}
      <p className="simulation-note">
        <span className="outlined-dot" />
        {response.metadata.demo
          ? 'Simulated prices and delivery estimates. Confirm current offers with the retailer.'
          : 'Publicly observed prices. Delivery, fees and stock for your pincode need confirmation at the retailer.'}
      </p>
    </section>
  );
}
