import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nova Admin',
  description: 'Founder command center',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-gray-950 text-white antialiased">
        {/* Top nav */}
        <header className="border-b border-gray-800 px-6 py-3 flex items-center justify-between sticky top-0 z-50 bg-gray-950/90 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded bg-violet-600 flex items-center justify-center text-xs font-bold">N</div>
            <span className="font-semibold text-sm tracking-wide text-white">Nova Admin</span>
            <span className="text-gray-600 text-xs">founder only</span>
          </div>
          <nav className="flex items-center gap-6 text-sm text-gray-400">
            <a href="/dashboard" className="hover:text-white transition">Dashboard</a>
            <a href="/users"     className="hover:text-white transition">Users</a>
            <a href="/email"     className="hover:text-white transition text-amber-400 font-medium">✉ Broadcast</a>
            <a href="/system"    className="hover:text-white transition">System</a>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
