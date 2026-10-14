'use client';
import { ArrowUpRight, Check, Clock3, Sparkles } from 'lucide-react';
import type { ComparisonResult } from '@smartcompare/shared';
import { rupees, etaLabel } from '@/lib/formatters';
const brands: Record<string, { symbol: string; className: string }> = {
  Amazon: { symbol: 'a', className: 'amazon' },
  Flipkart: { symbol: 'F', className: 'flipkart' },
  Blinkit: { symbol: 'b', className: 'blinkit' },
  'Swiggy Instamart': { symbol: 'S', className: 'instamart' },
};
export function StoreMark({ platform }: { platform: string }) {
  const b = brands[platform] ?? { symbol: platform[0], className: '' };
  return (
    <span aria-hidden="true" className={`store-mark ${b.className}`}>
      {b.symbol}
    </span>
  );
}
export function ComparisonCard({
  listing: r,
  onView,
}: {
  listing: ComparisonResult;
  onView: (r: ComparisonResult) => void;
}) {
  const observed = r.metadata?.observed === true;
  const fees = [
    { label: 'Item price', value: r.price.base, unknown: false },
    {
      label: 'Delivery',
      value: r.price.delivery,
      unknown: r.price.unknownFees.includes('deliveryFee'),
    },
    {
      label: 'Handling',
      value: r.price.handling,
      unknown: r.price.unknownFees.includes('handlingFee'),
    },
    {
      label: 'Platform fee',
      value: r.price.platform,
      unknown: r.price.unknownFees.includes('platformFee'),
    },
  ];
  return (
    <article
      className={`comparison-card ${r.isRecommended ? 'recommended' : ''} ${!r.available && !observed ? 'unavailable' : ''}`}
    >
      <div className="card-ribbon">
        {observed ? (
          'PUBLIC PRICE OBSERVATION'
        ) : r.isRecommended ? (
          <>
            <Sparkles size={15} /> OUR SMART PICK
          </>
        ) : r.available ? (
          'ANOTHER OPTION'
        ) : (
          'OUT OF STOCK'
        )}
      </div>
      <div className="comparison-inner">
        <div className="store-title">
          <StoreMark platform={r.platform} />
          <h3>{r.platform === 'Swiggy Instamart' ? 'Instamart' : r.platform}</h3>
          {!observed && (
            <span className="score" title="Weighted price, delivery and availability score">
              {Math.round(r.score * 100)}
              <small>/100</small>
            </span>
          )}
        </div>
        <div className="listing-product">
          {r.imageUrl && <img src={r.imageUrl} alt="" />}
          <p>{r.title}</p>
        </div>
        <p className="price-caption">
          {observed
            ? 'ITEM PRICE · FEES NOT VERIFIED'
            : r.price.confidence === 'partial'
              ? 'KNOWN MINIMUM TOTAL'
              : 'TOTAL, FEES INCLUDED'}
        </p>
        <div className="total-price">{rupees(r.price.total)}</div>
        <div className="delivery-line">
          <span>
            <Clock3 size={15} />
            {etaLabel(r.etaMinutes)}
          </span>
          <span className={r.available ? 'stock' : 'no-stock'}>
            {observed ? (
              r.metadata?.stock === 'in_stock' ? (
                'Listed in stock · verify locally'
              ) : r.metadata?.stock === 'out_of_stock' ? (
                'Listed out of stock'
              ) : (
                'Stock unverified'
              )
            ) : r.available ? (
              <>
                <Check size={14} /> In stock
              </>
            ) : (
              'Unavailable'
            )}
          </span>
        </div>
        <dl className="fee-breakdown">
          {fees.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd>
                {f.unknown ? (
                  'Unknown'
                ) : f.value === 0 && f.label === 'Delivery' ? (
                  <span className="free">FREE</span>
                ) : (
                  rupees(f.value)
                )}
              </dd>
            </div>
          ))}
        </dl>
        <p className="reason">{r.recommendationReason}</p>
        <button
          className={`button deal-button ${r.isRecommended ? 'lime' : ''}`}
          disabled={!r.available && !observed}
          onClick={() => onView(r)}
        >
          {observed ? 'Check retailer' : 'View deal'} <ArrowUpRight size={18} />
        </button>
      </div>
    </article>
  );
}
