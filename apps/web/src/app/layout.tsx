import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Flip Card — Know If It\'s Worth Flipping Before You Buy',
  description: 'Enter any item and get a resale estimate, cost breakdown, risk flags, and a clear buy, negotiate, or pass decision. Free to try. Powered by Nova.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
