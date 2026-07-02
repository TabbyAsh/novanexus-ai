import type { Metadata } from 'next';
import SectorDoor from '../../components/world/SectorDoor';

export const metadata: Metadata = {
  title: 'The Bazaar — Know the flip before you buy | NovaNexus',
  description: 'Paste any item and price. Get a resale band, fees, a max buy price, and a negotiation script — before you hand over cash.',
};

export default function BazaarDoor() {
  return (
    <SectorDoor
      name="The Bazaar"
      accent="#ffc773"
      promise="Know the flip before you buy."
      sub="Any item, any asking price — get the resale band, the real costs, a safe max buy price, and the exact negotiation line to say."
      points={[
        'A clear verdict: BUY, NEGOTIATE, WATCH, or PASS — with the max price that still leaves profit.',
        'Honest data labels: real sold comps when available, clearly-marked category models when not. Never a fake number.',
        'A negotiation script and seller questions you can send word-for-word.',
      ]}
      ctaLabel="Analyze a flip — free"
      ctaHref="/analyze"
      disclaimer="3 free analyses per day without an account. Estimates are decision support, not guarantees."
    />
  );
}
