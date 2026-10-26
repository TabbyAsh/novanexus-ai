import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { organizationStructuredData, serializeStructuredData } from '@/lib/public-structured-data';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL('https://novanexus-ai.com'),
  applicationName: 'Nova',
  icons: { icon: '/favicon.ico' },
  title: 'Nova Enterprises LLC — Products, sourcing & business tools',
  description: 'Merchandise sourcing, practical software and scoped business support. Contact Nova Enterprises about your next project.',
  openGraph: {
    type: 'website',
    siteName: 'Nova',
    url: 'https://novanexus-ai.com',
    title: 'Nova Enterprises LLC — Products, sourcing & business tools',
    description: 'Merchandise sourcing, practical software and scoped business support. Clear scope, direct contact and useful tools.',
  },
  twitter: {
    card: 'summary',
    title: 'Nova Enterprises LLC — Products, sourcing & business tools',
    description: 'Merchandise sourcing, practical software and scoped business support. Clear scope, direct contact and useful tools.',
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
        <Analytics />
      </body>
    </html>
  );
}
