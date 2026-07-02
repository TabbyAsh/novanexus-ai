import type { Metadata } from 'next';
import SectorDoor from '../../components/world/SectorDoor';

export const metadata: Metadata = {
  title: 'The Market — Market chaos into structured research | NovaNexus',
  description: 'Screeners, momentum reads, and research cards built from live market data. Research tools — never financial advice.',
};

export default function MarketDoor() {
  return (
    <SectorDoor
      name="The Market"
      accent="#cfe0ff"
      promise="Market chaos, turned into structured research."
      sub="Live screening, momentum reads, and research cards built from real market data — so you study the board instead of drowning in it."
      points={[
        'A stock screener over live data with plain-language setups.',
        'Research cards: what moved, why it matters, what to watch — with the evidence attached.',
        'Paper-trade tracking so ideas earn a record before they earn your money.',
      ]}
      ctaLabel="Open the screener"
      ctaHref="/trading"
      disclaimer="Research tooling only. Nothing here is financial advice, a recommendation, or a promise of returns. Markets carry risk."
    />
  );
}
