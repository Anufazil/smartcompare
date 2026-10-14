'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowUpRight, X, Tags, Zap, Equal } from 'lucide-react';
import { weights, type ComparisonResult } from '@smartcompare/shared';
import { StoreMark } from '../comparison/comparison-card';
import { rupees, etaLabel } from '@/lib/formatters';
export function InfoDialogs({
  helpOpen,
  setHelpOpen,
  selectedDeal: r,
  setSelectedDeal,
}: {
  helpOpen: boolean;
  setHelpOpen: (v: boolean) => void;
  selectedDeal: ComparisonResult | null;
  setSelectedDeal: (r: ComparisonResult | null) => void;
}) {
  return (
    <>
      <Dialog.Root open={helpOpen} onOpenChange={setHelpOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content help-dialog">
            <Dialog.Close className="icon-button dialog-close" aria-label="Close explanation">
              <X />
            </Dialog.Close>
            <span className="eyebrow">GOOD DECISIONS START HERE.</span>
            <Dialog.Title>What makes a smart pick?</Dialog.Title>
            <Dialog.Description>
              We compare the same product and variant, then score available options using your
              preference.
            </Dialog.Description>
            <div className="weight-table">
              {[
                { id: 'cheapest' as const, name: 'Lowest price', icon: Tags },
                { id: 'fastest' as const, name: 'Fastest delivery', icon: Zap },
                { id: 'balanced' as const, name: 'Best balance', icon: Equal },
              ].map((p) => (
                <div key={p.id}>
                  <p.icon size={19} />
                  <strong>{p.name}</strong>
                  <span>
                    {weights[p.id].price * 100}% price · {weights[p.id].eta * 100}% delivery
                  </span>
                </div>
              ))}
            </div>
            <p>
              Availability contributes the remaining 10%. Prices and delivery times are normalized
              before scoring. Unavailable options are never recommended, and incomplete totals are
              clearly labeled.
            </p>
            <div className="demo-explainer">
              <b>Two modes. Clear sources.</b>
              <p>
                Live mode attempts permitted public retailer pages and shows the source status and
                observation time. Some pages cannot be read automatically. Fees, delivery and stock
                for your pincode remain unverified, so live listings do not receive a Smart Pick.
                Demo catalog uses fixed simulated prices to demonstrate the scoring above. Failed
                live searches never use demo prices.
              </p>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={!!r} onOpenChange={(v) => !v && setSelectedDeal(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content deal-dialog">
            <Dialog.Close className="icon-button dialog-close" aria-label="Close deal">
              <X />
            </Dialog.Close>
            {r && (
              <>
                <span className="eyebrow">ONE LAST LOOK.</span>
                <Dialog.Title>Your {r.platform} option</Dialog.Title>
                <Dialog.Description>{r.title}</Dialog.Description>
                <div className="deal-summary">
                  <StoreMark platform={r.platform} />
                  <div>
                    <strong>{rupees(r.price.total)}</strong>
                    <span>
                      {r.metadata?.observed
                        ? 'Observed item price · checkout fees unknown'
                        : `Simulated total · ${etaLabel(r.etaMinutes)}`}
                    </span>
                  </div>
                </div>
                <p>
                  {r.metadata?.observed
                    ? 'Open the source product page to confirm the exact variant, current price, delivery fees and stock for your address.'
                    : 'This is a demo comparison. Continue to the retailer’s search to check the current product, price, fees and availability before purchasing.'}
                </p>
                {r.productUrl && (
                  <a
                    href={r.productUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="button lime full-width"
                  >
                    Continue to {r.platform} <ArrowUpRight size={18} />
                  </a>
                )}
                <button className="text-button full-width" onClick={() => setSelectedDeal(null)}>
                  Keep comparing
                </button>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
