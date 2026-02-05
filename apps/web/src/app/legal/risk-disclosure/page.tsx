'use client';

import Link from 'next/link';

export default function RiskDisclosurePage() {
  return (
    <div className="min-h-screen bg-gray-950 py-16 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg" />
            <span className="text-2xl font-bold text-white">Nova Hub Lite</span>
          </Link>
          <h1 className="text-4xl font-bold text-white mb-4">
            Risk Disclosure Statement
          </h1>
          <p className="text-gray-400">
            Last updated: January 2026
          </p>
        </div>

        {/* Content */}
        <div className="prose prose-invert prose-gray max-w-none">
          <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-6 mb-8">
            <h2 className="text-red-400 text-xl font-bold mt-0">Important Warning</h2>
            <p className="text-gray-300 mb-0">
              Trading and investing in financial markets involves substantial risk of loss and is not 
              suitable for all investors. You should carefully consider whether trading is suitable 
              for you in light of your circumstances, knowledge, and financial resources.
            </p>
          </div>

          <h2 className="text-white text-2xl font-bold mt-8 mb-4">1. No Financial Advice</h2>
          <p className="text-gray-300">
            Nova Hub Lite is an <strong>educational and analytical tool</strong> designed to help users 
            research and analyze market data. The information, analysis, thesis cards, scanner results, 
            and any other content provided through our service are for <strong>informational and 
            educational purposes only</strong>.
          </p>
          <p className="text-gray-300">
            Nothing on Nova Hub Lite constitutes:
          </p>
          <ul className="text-gray-300 space-y-2">
            <li>Financial advice or recommendations</li>
            <li>Investment advice or recommendations</li>
            <li>Tax, legal, or accounting advice</li>
            <li>An offer or solicitation to buy or sell any security</li>
            <li>A guarantee of any future results or performance</li>
          </ul>

          <h2 className="text-white text-2xl font-bold mt-8 mb-4">2. Paper Trading Limitations</h2>
          <p className="text-gray-300">
            Our paper trading feature simulates trades without using real money. <strong>Paper trading 
            results do not reflect actual trading results</strong> and have significant limitations:
          </p>
          <ul className="text-gray-300 space-y-2">
            <li>Paper trades do not account for slippage, liquidity, or market impact</li>
            <li>Execution prices in paper trading may differ significantly from real markets</li>
            <li>Emotional factors present in real trading are absent in paper trading</li>
            <li>Past paper trading performance does not guarantee future results</li>
            <li>Market conditions during paper trading may not represent future conditions</li>
          </ul>

          <h2 className="text-white text-2xl font-bold mt-8 mb-4">3. Market Risk</h2>
          <p className="text-gray-300">
            Trading financial instruments involves inherent risks including but not limited to:
          </p>
          <ul className="text-gray-300 space-y-2">
            <li><strong>Loss of Principal:</strong> You may lose some or all of your invested capital</li>
            <li><strong>Volatility Risk:</strong> Prices can move rapidly and unpredictably</li>
            <li><strong>Liquidity Risk:</strong> You may not be able to exit positions at desired prices</li>
            <li><strong>Gap Risk:</strong> Prices can move significantly between trading sessions</li>
            <li><strong>Systemic Risk:</strong> Broad market events can affect all positions</li>
          </ul>

          <h2 className="text-white text-2xl font-bold mt-8 mb-4">4. Technical Indicators Disclaimer</h2>
          <p className="text-gray-300">
            The technical indicators provided (RSI, MACD, Moving Averages, etc.) are mathematical 
            calculations based on historical price data. These indicators:
          </p>
          <ul className="text-gray-300 space-y-2">
            <li>Are <strong>lagging indicators</strong> that reflect past price action</li>
            <li>Cannot predict future price movements with certainty</li>
            <li>May generate false signals in ranging or choppy markets</li>
            <li>Should not be used as the sole basis for trading decisions</li>
            <li>Work differently in different market conditions</li>
          </ul>

          <h2 className="text-white text-2xl font-bold mt-8 mb-4">5. Data Accuracy</h2>
          <p className="text-gray-300">
            While we strive to provide accurate market data, we cannot guarantee the accuracy, 
            completeness, or timeliness of any information. Market data may be delayed, and 
            prices shown may not reflect current market prices. <strong>Always verify data with 
            your broker before making trading decisions.</strong>
          </p>

          <h2 className="text-white text-2xl font-bold mt-8 mb-4">6. Your Responsibilities</h2>
          <p className="text-gray-300">
            By using Nova Hub Lite, you acknowledge and agree that:
          </p>
          <ul className="text-gray-300 space-y-2">
            <li>You are solely responsible for your own trading decisions</li>
            <li>You will conduct your own research before making any trades</li>
            <li>You will consult with qualified professionals for financial advice</li>
            <li>You will only trade with money you can afford to lose</li>
            <li>You understand the risks involved in trading</li>
          </ul>

          <h2 className="text-white text-2xl font-bold mt-8 mb-4">7. Limitation of Liability</h2>
          <p className="text-gray-300">
            Nova Enterprises and Nova Hub Lite shall not be liable for any losses, damages, or 
            expenses arising from:
          </p>
          <ul className="text-gray-300 space-y-2">
            <li>Your use of or reliance on information provided by our service</li>
            <li>Trading decisions made based on our analysis or thesis cards</li>
            <li>Technical failures, data inaccuracies, or service interruptions</li>
            <li>Any direct, indirect, incidental, or consequential damages</li>
          </ul>

          <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-6 mt-8">
            <h3 className="text-yellow-400 text-lg font-bold mt-0">Acknowledgment</h3>
            <p className="text-gray-300 mb-0">
              By subscribing to or using Nova Hub Lite, you acknowledge that you have read, 
              understood, and agree to this Risk Disclosure Statement. If you do not agree 
              with any part of this disclosure, please do not use our services.
            </p>
          </div>

          <h2 className="text-white text-2xl font-bold mt-8 mb-4">8. Contact Information</h2>
          <p className="text-gray-300">
            If you have questions about this Risk Disclosure Statement or our services, 
            please contact us at{' '}
            <a href="mailto:legal@nova-enterprises.dev" className="text-blue-400 hover:underline">
              legal@nova-enterprises.dev
            </a>
          </p>
        </div>

        {/* Back Links */}
        <div className="mt-12 flex gap-4">
          <Link href="/pricing" className="text-blue-400 hover:text-blue-300 transition">
            ← Back to Pricing
          </Link>
          <Link href="/" className="text-gray-400 hover:text-white transition">
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
