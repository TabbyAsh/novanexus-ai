import type { Metadata } from 'next';

/**
 * /webull — a personal referral page.
 *
 * Deliberately noindex: this is a link to paste, not a page to rank. Letting a
 * broker-promo page into the index would muddy the product domain for the
 * search terms that actually matter (/check, /flip-calculator).
 *
 * Every number here is one I could verify. The "deposit, then withdraw in a few
 * days and keep the shares" framing is NOT on this page: Webull's promo terms
 * commonly reduce or void a bonus if funds leave during the promo window, and
 * the specific T&Cs for this offer could not be retrieved. Promising that would
 * cost a reader their shares and cost the referrer their credibility.
 */
export const metadata: Metadata = {
  title: 'Get 10 free fractional shares on Webull',
  description:
    'Open a Webull account, fund it with $100, and Webull gives you 10 free fractional shares. Here is exactly how it works, and the fine print worth reading first.',
  robots: { index: false, follow: false },
};

const REF_URL = 'https://www.webull.com/s/3Khte2ukuGc9VNjVNh';

const STEPS = [
  {
    n: '1',
    t: 'Open the account',
    d: 'Standard brokerage signup — ID, the usual questions. It is a regulated US broker, not an app of the week.',
  },
  {
    n: '2',
    t: 'Fund it with $100',
    d: 'This is the threshold that triggers the reward. Anything at or above $100 counts the same.',
  },
  {
    n: '3',
    t: 'Webull drops in 10 fractional shares',
    d: 'Each one is randomly valued between $3 and $300. They land in your account as real equity you own outright.',
  },
];

export default function WebullPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at 50% -10%, #071120 0%, #01030a 55%)', color: '#c8e8f5' }}>
      <div style={{ maxWidth: 620, margin: '0 auto', padding: '28px 20px 80px' }}>

        <div style={{ fontSize: 11, letterSpacing: '0.4em', textTransform: 'uppercase', color: '#7fa6c2' }}>
          a referral, openly
        </div>

        <h1 style={{ fontSize: 34, fontWeight: 700, lineHeight: 1.12, marginTop: 36, color: '#eafcff' }}>
          Put $100 into Webull.<br />Get 10 free shares.
        </h1>

        <p style={{ fontSize: 16, color: '#7d99ad', marginTop: 14, lineHeight: 1.55 }}>
          Webull is running a referral promotion. You fund a new account with $100 and they hand you
          10 fractional shares, each randomly valued between <strong style={{ color: '#c8e8f5' }}>$3 and $300</strong>.
          The $100 stays yours — it is your money in your brokerage account, not a fee.
        </p>

        {/* the disclosure, up top rather than buried */}
        <div style={{ marginTop: 22, border: '1px solid rgba(125,216,255,.2)', borderRadius: 12, padding: '14px 16px', background: 'rgba(125,216,255,.05)', fontSize: 14, lineHeight: 1.55, color: '#9dbdd2' }}>
          Straight up: this is my referral link, and I get free fractional shares too if you sign up
          through it. That is the whole arrangement. You are not doing me a favour for nothing —
          we both get paid by Webull for the introduction.
        </div>

        <div style={{ marginTop: 30 }}>
          {STEPS.map((s) => (
            <div key={s.n} style={{ display: 'flex', gap: 14, marginBottom: 18 }}>
              <div style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 9, border: '1px solid rgba(125,216,255,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#7dd8ff' }}>
                {s.n}
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#eafcff' }}>{s.t}</div>
                <div style={{ fontSize: 14, color: '#7d99ad', marginTop: 3, lineHeight: 1.5 }}>{s.d}</div>
              </div>
            </div>
          ))}
        </div>

        <a
          href={REF_URL}
          target="_blank"
          rel="noopener noreferrer nofollow sponsored"
          style={{ display: 'block', textAlign: 'center', background: 'linear-gradient(140deg,#eafcff,#7dd8ff)', color: '#04131c', fontWeight: 700, fontSize: 16, padding: '15px', borderRadius: 12, textDecoration: 'none', marginTop: 12 }}
        >
          Claim the 10 free shares →
        </a>
        <div style={{ fontSize: 12, color: '#5d7891', textAlign: 'center', marginTop: 9 }}>
          Opens webull.com · takes about 10 minutes
        </div>

        {/* the fine print that actually matters, said plainly */}
        <div style={{ marginTop: 30, border: '1px solid rgba(224,168,96,.28)', borderRadius: 12, padding: '16px 18px', background: 'rgba(224,168,96,.05)' }}>
          <div style={{ fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#e0a860', marginBottom: 8 }}>
            Read this before you withdraw
          </div>
          <p style={{ fontSize: 14, color: '#b9c9d6', lineHeight: 1.6, margin: 0 }}>
            Do not assume you can pull the $100 straight back out and keep the shares. Webull&apos;s
            promotions commonly require the deposit to stay in the account for a set window, and
            money withdrawn during that window can reduce or void the reward. The exact terms are
            shown in the app when you claim the offer — <strong style={{ color: '#eafcff' }}>read them there</strong> and
            leave the deposit alone until the stated period is up. I would rather you know that now
            than lose the shares on my say-so.
          </p>
        </div>

        <p style={{ fontSize: 12, color: '#3d5266', marginTop: 26, lineHeight: 1.7 }}>
          Not investment advice, and I am not a licensed financial adviser. I am not affiliated with,
          endorsed by, or speaking for Webull — this is a personal referral to their public promotion,
          and their terms govern it entirely. Share values are set by Webull and awarded at random
          within the stated range; the specific shares you receive, and what they are worth later, are
          not something I control or can predict. Investing puts your money at risk, including the
          $100 you deposit. Promotion terms can change or end at any time.
        </p>
      </div>
    </div>
  );
}
