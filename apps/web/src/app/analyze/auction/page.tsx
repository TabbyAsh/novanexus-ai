/** Companion to /analyze, not a replacement for item valuation or Nova's runtime.
 * Browser-local dossier storage; no provider, account or bidding permissions.
 */
export default function AuctionDeskPage() {
  return (
    <iframe
      src="/tools/auction-desk/index.html"
      title="Nova Auction Desk — evidence, scenarios, forecasts and outcomes"
      style={{ display: 'block', width: '100%', height: '100dvh', border: 0 }}
    />
  );
}
