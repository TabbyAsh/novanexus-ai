import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg"></div>
            <span className="text-xl font-bold">Nova</span>
          </div>
          <nav className="flex items-center gap-6">
            <Link href="/dashboard" className="hover:text-blue-400 transition">Dashboard</Link>
            <Link href="/trade" className="hover:text-blue-400 transition">Trade</Link>
            <Link href="/store" className="hover:text-blue-400 transition">Store</Link>
            <Link href="/social" className="hover:text-blue-400 transition">Social</Link>
            <button className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition">
              Login
            </button>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl font-bold mb-6 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            The AI-Orchestrated Operating System for Money, Markets & Commerce
          </h1>
          <p className="text-xl text-gray-400 mb-8">
            Nova unifies trading, e-commerce, and content creation into a single platform 
            where every action compounds into a self-improving system.
          </p>
          <div className="flex justify-center gap-4">
            <button className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg font-medium transition">
              Get Started
            </button>
            <button className="border border-gray-700 hover:border-gray-600 px-6 py-3 rounded-lg font-medium transition">
              Learn More
            </button>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-16 px-6 bg-gray-900/50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Platform Capabilities</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {/* TradeBot */}
            <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
              <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-2">TradeBot</h3>
              <p className="text-gray-400">
                AI-powered market scanning, backtesting, and paper trading with your customized checklist strategy.
              </p>
            </div>

            {/* StoreBot */}
            <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
              <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-2">StoreBot</h3>
              <p className="text-gray-400">
                Automated product sourcing, pricing optimization, and order management for your e-commerce operation.
              </p>
            </div>

            {/* SocialBot */}
            <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
              <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-2">SocialBot</h3>
              <p className="text-gray-400">
                Content planning, script generation, and performance analytics to grow your audience systematically.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* NovaCore Section */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-6">Powered by NovaCore</h2>
          <p className="text-gray-400 mb-8">
            The AI orchestration layer that routes your goals to specialized bots, 
            maintains priorities and constraints, and enforces safety guardrails.
          </p>
          <div className="bg-gray-800/50 rounded-xl p-8 border border-gray-700">
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>Goal → Plan → Tasks → Bots → Results → Learning</span>
            </div>
            <div className="mt-4 h-2 bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full w-3/4 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"></div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-8 px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <p className="text-gray-500">© 2026 Nova Enterprises</p>
          <div className="flex items-center gap-6 text-gray-500">
            <Link href="/docs" className="hover:text-white transition">Docs</Link>
            <Link href="/api" className="hover:text-white transition">API</Link>
            <Link href="/status" className="hover:text-white transition">Status</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
