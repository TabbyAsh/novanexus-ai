import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { organizationStructuredData, serializeStructuredData } from '@/lib/public-structured-data';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL('https://novanexus-ai.com'),
  applicationName: 'Nova',
  icons: { icon: '/favicon.ico' },
  title: 'Nova — Clear next steps for changing work',
  description: 'Nova helps turn a changing situation into a clear decision, an owned next action, and an evidence check. Try the local-only Nova Loop.',
  openGraph: {
    type: 'website',
    siteName: 'Nova',
    url: 'https://novanexus-ai.com',
    title: 'Nova — Clear next steps for changing work',
    description: 'Turn a changing situation into a clear decision, an owned next action, and an evidence check.',
  },
  twitter: {
    card: 'summary',
    title: 'Nova — Clear next steps for changing work',
    description: 'Turn a changing situation into a clear decision, an owned next action, and an evidence check.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <script
          id="nova-organization-structured-data"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeStructuredData(organizationStructuredData) }}
        />
        {children}
      </body>
    </html>
  );
}
