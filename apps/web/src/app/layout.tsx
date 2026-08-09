import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL('https://novanexus-ai.com'),
  title: 'Nova — The Economic Operating System for Humanity™',
  description: 'Nova makes potential and choice legible. Nexus governs the interaction among human intention, AI intelligence, connected capabilities, and evidence from reality.',
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
