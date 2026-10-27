import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { PublicShell, PageIntro } from '@/components/public/PublicShell';
import { WORLD_COOKIE } from '@/lib/world/access';
import { readServiceInquiryQueue } from '@/lib/service-inquiry-queue.server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Private inquiry queue — Nova Headquarters',
  description: 'Private owner review of incoming Nova website requests.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

function receivedDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Indianapolis' }).format(date)
    : 'Date unavailable';
}

export default async function Inquiries() {
  const token = (await cookies()).get(WORLD_COOKIE)?.value;
  const result = await readServiceInquiryQueue(token);
  return <PublicShell>
    <PageIntro eyebrow="Private owner workspace" title="Incoming requests.">
      <p>Review the brief, confirm demand and scope, then bring the next action into Nova Headquarters.</p>
    </PageIntro>
    <section className="office-wrap" style={{ paddingBottom: 70 }}>
      {!result.ok ? <div className="office-form-panel">
        <h2>{result.status === 503 ? 'The inquiry queue is unavailable.' : 'Owner sign-in required.'}</h2>
        <p style={{ marginTop: 15 }}>{result.status === 503
          ? 'Nova could not verify access or read the stored records. Try again shortly.'
          : result.status === 403 ? 'This account does not have permission to read incoming business requests.'
            : 'Sign in to the private Nova workspace, then return here to review incoming requests.'}</p>
        <div className="office-actions"><Link className="office-button" href="/world">Sign in to owner workspace ↗</Link><Link className="office-outline" href="/office/inquiries">Check again</Link></div>
      </div> : <>
        <div className="office-actions" style={{ marginBottom: 30 }}>
          <Link className="office-button" href="https://nova-deal-desk-wyatt.tabbyash.chatgpt.site">Open private headquarters ↗</Link>
          <Link className="office-outline" href="/office/inquiries">Refresh requests</Link>
        </div>
        <p className="office-small" style={{ marginBottom: 25 }}>Latest {result.inquiries.length} recorded requests. Times shown for Indianapolis. Headquarters uses its own owner sign-in.</p>
        {result.inquiries.length === 0 ? <p>No recorded inquiries were returned.</p> : result.inquiries.map(row => <article key={row.receipt_id} className="office-form-panel" style={{ marginBottom: 20 }}>
          <span className="office-label">{row.service_code.replace(/_/g, ' ')} / {row.status.replace(/_/g, ' ')}</span>
          <h2 style={{ marginTop: 12 }}>{row.business}</h2>
          <p style={{ marginTop: 12 }}>{row.name} · {row.email}</p>
          <p className="office-small" style={{ overflowWrap: 'anywhere', marginTop: 10 }}>Receipt {row.receipt_id} · {receivedDate(row.created_at)}</p>
          <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginTop: 20 }}>{row.challenge}</p>
          {row.details && <dl style={{ marginTop: 20 }}>{Object.entries(row.details).filter(([, value]) => typeof value === 'string').map(([key, value]) => <div key={key} style={{ marginBottom: 10 }}><dt className="office-label">{key.replace(/_/g, ' ')}</dt><dd style={{ margin: '5px 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{value}</dd></div>)}</dl>}
          <details style={{ marginTop: 20 }}><summary>Notification and payment record</summary><p className="office-small" style={{ marginTop: 10 }}>Nova notification: {row.operator_email_status}. Confirmation: {row.confirmation_email_status}. Payment: {row.payment_status}. Notification acceptance does not establish inbox delivery or payment.</p></details>
        </article>)}
      </>}
    </section>
  </PublicShell>;
}
