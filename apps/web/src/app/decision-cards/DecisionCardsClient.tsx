'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronDown, ChevronUp, Lock, CheckCircle, AlertTriangle, FileText, MessageSquare, List } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// ── The 10 starter cards ─────────────────────────────────────────────
const CARDS = [
  {
    id: 'customer-hasnt-paid',
    tag: 'Collections',
    tagColor: 'bg-red-500/15 text-red-400 border-red-500/25',
    title: "Customer Hasn't Paid",
    situation: 'A client owes you money. They agreed to pay. Now they are not responding or making excuses.',
    goal: 'Get paid without destroying the relationship — but without tolerating non-payment.',
    checklist: [
      'Confirm the invoice was sent and received',
      'Check what payment method was agreed upon',
      'Note how many days overdue it is',
      'Decide: is this a follow-up situation or a collections situation?',
      'Send the reminder message (see script)',
      'Set a firm deadline — 5 business days is standard',
      'If no response after deadline, send the final notice',
      'If still no payment, decide between small claims, collections, or writing it off',
    ],
    script: `Hi [Name],

Following up on invoice #[NUM] for [amount], which was due on [date]. I want to make sure it didn't get lost.

If there's an issue with the invoice, let me know and I'll sort it out. If everything looks right, I'd appreciate payment by [deadline — 5 business days from now].

You can pay via [your payment link or method].

Thanks,
[Your name]`,
    template: `INVOICE FOLLOW-UP LOG

Client: _______________
Invoice #: _______________
Amount owed: $_______________
Due date: _______________
Days overdue: _______________

First reminder sent: _______________
Response received: Yes / No
Second reminder sent: _______________
Final notice sent: _______________
Outcome: Paid / Dispute / Small claims / Written off`,
    risks: [
      'Do not threaten legal action in the first message — it closes the door on resolution',
      'Do not reduce the amount owed without a written agreement',
      'Keep all communication in writing — no verbal-only agreements',
      'If client disputes the work quality, get specifics in writing before adjusting the invoice',
    ],
    nextAction: 'Send the reminder message today. Set a calendar reminder for the deadline date.',
    free: true,
  },
  {
    id: 'price-a-job',
    tag: 'Pricing',
    tagColor: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    title: 'Price a Job',
    situation: "A potential client wants a quote. You don't want to underprice and lose money or overprice and lose the job.",
    goal: 'Give a quote that covers your costs, reflects your value, and wins the job at a margin worth working for.',
    checklist: [
      'List every cost this job requires (materials, travel, subcontractors, supplies)',
      'Estimate your labor hours — be honest, not optimistic',
      'Multiply labor hours by your hourly cost-to-operate (not what you want to earn, what it costs to show up)',
      'Add 20–30% margin on top of all costs',
      'Check competitor pricing in your market — you do not have to beat it, just justify yours',
      'Decide: flat rate or hourly? Flat rate is usually better for the client; hourly is safer for you on unknowns',
      'Write the quote clearly — itemized, no vague totals',
      'Include what is NOT included (scope creep protection)',
    ],
    script: `Hi [Name],

Thanks for reaching out. Based on what you described, here's my quote for [job]:

[Item 1]: $___
[Item 2]: $___
Labor ([X] hours at $[rate]/hr): $___
Materials: $___

Total: $___

This includes [what's included]. It does not include [what's excluded — changes, additional materials, etc.].

Payment terms: [deposit %, balance on completion].

Let me know if you have questions or want to adjust scope.

[Your name]`,
    template: `JOB PRICING WORKSHEET

Job: _______________
Client: _______________
Date quoted: _______________

COSTS
Materials: $_______________
Labor hours: _______________
Labor cost (hrs × rate): $_______________
Travel/transport: $_______________
Subcontractors: $_______________
Other: $_______________
TOTAL COST: $_______________

MARGIN (20–30% recommended)
Margin %: ___%
Margin $: $_______________

QUOTE TOTAL: $_______________

Competitor price range: $_______ to $_______
Decision: Flat rate / Hourly
Deposit required: $_______________`,
    risks: [
      'Never quote from the hip — calculate first, every time',
      'Optimistic hour estimates are the #1 cause of losing money on jobs',
      'If scope is unclear, add a contingency or quote hourly for unknowns',
      'Get the deposit before starting — protects you if client disappears',
    ],
    nextAction: 'Fill out the pricing worksheet. Then write the quote from the numbers, not from a feeling.',
    free: true,
  },
  {
    id: 'new-client-intake',
    tag: 'Intake',
    tagColor: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
    title: 'New Client Intake',
    situation: 'A new client wants to work with you. You need to get the right information before starting.',
    goal: 'Collect everything you need upfront so the job runs clean — no confusion, no scope creep, no unpaid work.',
    checklist: [
      'Get the client\'s full name, business name, and contact info',
      'Clarify exactly what they want (not what you assume they want)',
      'Set a clear start date and expected completion date',
      'Agree on payment terms before any work begins',
      'Get a signed or written confirmation of the scope',
      'Collect the deposit before starting',
      'Add client to your tracking system',
    ],
    script: `Hi [Name],

Excited to work with you. Before we get started, I want to make sure we're aligned on the details.

Here's what I have so far: [summary of what they described].

A few things I need to confirm:
1. What is the exact outcome you're expecting?
2. What is your target completion date?
3. Are there any constraints I should know about (budget cap, specific materials, access restrictions)?

Once we confirm these, I'll send over the quote and we can get started.

[Your name]`,
    template: `CLIENT INTAKE FORM

Date: _______________
Client name: _______________
Business name: _______________
Phone: _______________
Email: _______________

JOB DETAILS
Description: _______________
Expected outcome: _______________
Start date: _______________
Completion date: _______________
Location/address: _______________

PAYMENT
Quote total: $_______________
Deposit amount: $_______________
Deposit paid: Yes / No / Date: _______________
Balance due: $_______________
Balance due date: _______________

NOTES
Special requirements: _______________
What is NOT included: _______________
Client signed/confirmed: Yes / No`,
    risks: [
      'Never start work without a written confirmation of scope and price',
      'Verbal agreements are not enough — always get written (text or email is fine)',
      '"We\'ll figure it out" is not a payment term',
    ],
    nextAction: 'Send the intake questions. Do not start any work until you have all the information and the deposit.',
    free: true,
  },
  {
    id: 'friend-business-deal',
    tag: 'Deals',
    tagColor: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
    title: 'Friend Business Deal',
    situation: 'A friend, family member, or someone you have a personal relationship with wants to do business together.',
    goal: 'Protect the relationship and the business — which means being more structured, not less.',
    checklist: [
      'Write down exactly what each person contributes (money, time, skills, connections)',
      'Write down exactly what each person receives (percentage, salary, equity, one-time payment)',
      'Clarify who makes final decisions if you disagree',
      'Clarify what happens if one person wants to stop',
      'Clarify what happens if the business makes money (how it\'s split)',
      'Clarify what happens if the business loses money (who owes what)',
      'Put all of it in writing — even a text message thread is better than nothing',
      'If real money is involved ($1,000+), get a simple partnership agreement',
    ],
    script: `Hey [Name], I'm excited about this idea. Before we move forward I want to make sure we're both protected — not because I don't trust you, but because agreements make things cleaner and save the friendship if something goes sideways.

Can we talk through:
- What each of us is bringing to this
- How we split profits (and losses)
- Who makes the call if we disagree
- What happens if one of us needs to step back

I'll put together a simple one-page summary after we talk.`,
    risks: [
      '"We\'re friends, we don\'t need an agreement" — this is how friendships end',
      'Unequal effort with equal splits causes resentment',
      'Never mix personal loans with business ownership without explicit terms',
      'If you can\'t have this conversation with them, do not do business with them',
    ],
    nextAction: 'Have the conversation. Write down what you agreed. Send them the summary by text or email.',
    free: false,
  },
  {
    id: 'invoice-follow-up',
    tag: 'Admin',
    tagColor: 'bg-purple-500/15 text-purple-400 border-purple-500/25',
    title: 'Invoice Follow-Up',
    situation: 'You sent an invoice and have not received payment or confirmation.',
    goal: 'Get paid or get clarity on when you will be paid — professionally and without apology.',
    checklist: [
      'Verify the invoice was sent to the right email/address',
      'Check your payment method is clear and correct on the invoice',
      'Confirm the due date',
      'Send a follow-up 2 days before due (friendly reminder)',
      'Send a follow-up on the due date if not paid',
      'Send a final notice 5 days overdue',
      'Add a late fee if your terms include one',
    ],
    script: `Hi [Name],

Just a quick follow-up on invoice #[NUMBER] for $[AMOUNT], due [DATE].

If you have any questions about the invoice or need a different payment method, just let me know.

Payment link: [link]

Thanks,
[Your name]`,
    template: `INVOICE TRACKING

Invoice #: ___
Client: ___
Amount: $___
Sent date: ___
Due date: ___

Follow-up 1 (2 days before): ___ / Sent: Y/N
Follow-up 2 (due date): ___ / Sent: Y/N
Final notice (5 days overdue): ___ / Sent: Y/N
Payment received: ___ / Amount: $___`,
    risks: [
      'Do not reduce the invoice amount without a written reason',
      'Late fees are only enforceable if stated in the original agreement',
    ],
    nextAction: 'Check which stage you are at. Send the appropriate message today.',
    free: false,
  },
  {
    id: 'hiring-help',
    tag: 'Hiring',
    tagColor: 'bg-pink-500/15 text-pink-400 border-pink-500/25',
    title: 'Hiring Help',
    situation: 'You need someone to help with your business — a contractor, helper, or part-time employee.',
    goal: 'Bring someone on clearly so you both know what is expected, what they are paid, and how it ends if it needs to.',
    checklist: [
      'Write the role description: exactly what tasks, exactly what hours',
      'Decide: employee or independent contractor? (this has tax and legal implications)',
      'Set pay rate and payment schedule',
      'Define a trial period (2–4 weeks) before committing',
      'Write an expectations agreement — even a simple one',
      'Clarify: who owns the work they produce?',
      'Clarify: what are grounds for ending the arrangement?',
    ],
    script: `Hi [Name],

I'd like to bring you on to help with [role/tasks]. Here's what I'm thinking:

Role: [description]
Hours: [X hours per week / as needed]
Pay: $[rate] per [hour/week/project]
Start: [date]
Trial period: 2–4 weeks

I'll put together a short written agreement so we're both clear. If this sounds right, let's talk through the details.`,
    risks: [
      'Hiring a friend without clear terms is one of the top ways small businesses damage relationships',
      'Contractors are not employees — but misclassifying employees as contractors has IRS consequences',
      'Do not pay anyone before defining the role',
    ],
    nextAction: 'Write the role description first. Everything else follows from that.',
    free: false,
  },
  {
    id: 'partnership-terms',
    tag: 'Deals',
    tagColor: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
    title: 'Partnership Terms',
    situation: 'You are entering a business partnership and need to define the terms before anything starts.',
    goal: 'A clear, written record of who owns what, who does what, who decides what, and how the partnership ends.',
    checklist: [
      'Define ownership percentages',
      'Define each partner\'s role and responsibilities',
      'Define how profits are distributed',
      'Define how decisions are made (majority vote, one partner has final say, etc.)',
      'Define what happens if one partner wants to exit',
      'Define what happens if the business cannot continue',
      'Sign a simple partnership agreement or at minimum a written confirmation',
    ],
    script: `Before we formalize this, let's make sure we're aligned on the basics.

I want to document: ownership split, who handles what, how we make big decisions, and what happens if one of us wants to leave.

This protects both of us and removes assumptions. It's not about trust — it's about clarity.

Can we schedule 30 minutes to go through these points?`,
    risks: [
      'A handshake partnership is a lawsuit waiting to happen',
      'Equal ownership with no tie-breaking mechanism creates deadlock',
      'Undefined exit terms make it nearly impossible to dissolve cleanly',
    ],
    nextAction: 'Draft a one-page summary of the terms you are proposing before the next conversation.',
    free: false,
  },
  {
    id: 'contractor-estimate',
    tag: 'Pricing',
    tagColor: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    title: 'Contractor Estimate',
    situation: 'You are a contractor (construction, cleaning, landscaping, repairs, etc.) and need to give a formal estimate.',
    goal: 'A professional, itemized estimate that protects you from scope creep and wins the job.',
    checklist: [
      'Visit the site or get detailed information before estimating',
      'List every line item (materials, labor, permits, disposal, etc.)',
      'Note what is NOT included',
      'Set an estimate expiry date (estimates are not permanent — prices change)',
      'Include your payment terms',
      'Include a change order clause',
    ],
    template: `CONTRACTOR ESTIMATE

[Your Business Name]
[Phone] | [Email]

Date: _______________
Estimate #: _______________
Valid until: _______________

Client: _______________
Job address: _______________
Job description: _______________

SCOPE OF WORK
1. _______________  $___
2. _______________  $___
3. _______________  $___
Materials:           $___
Disposal/cleanup:    $___
                    ────
SUBTOTAL:           $___
Tax (if applicable): $___
TOTAL:              $___

PAYMENT TERMS
Deposit: ___% due before start
Balance: Due on completion

NOTES
This estimate covers [specific scope]. Any changes in scope will require a written change order and may affect the total price.

Estimate valid for 30 days.

Signature (acceptance): _______________ Date: ___`,
    risks: [
      'An estimate is not a contract — get it signed or confirmed in writing',
      'Change orders protect you when clients ask for extras mid-job',
      'Material prices fluctuate — add a materials cost clause if your timeline is long',
    ],
    nextAction: 'Fill out the template for your current job. Send it before starting any work.',
    free: false,
  },
  {
    id: 'local-service-setup',
    tag: 'Launch',
    tagColor: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25',
    title: 'Local Service Business Setup',
    situation: 'You are starting or cleaning up a local service business (lawn care, cleaning, pressure washing, repairs, delivery, etc.).',
    goal: 'A minimal, functional business foundation that lets you find clients, get paid, and operate cleanly.',
    checklist: [
      'Set your service offering and pricing (write it down)',
      'Create a Google Business Profile — this is free and gets you found',
      'Set up a simple way to get paid (Venmo, Cash App, PayPal, Square — pick one)',
      'Create a simple estimate template',
      'Create a simple invoice template',
      'Create a customer intake process (even just a text script)',
      'Set up a basic job tracking sheet (client name, job, date, amount, paid/unpaid)',
      'Ask your first 3 clients for a Google review',
    ],
    script: `Hi, I'm [name] and I offer [service] in [city/area]. I wanted to reach out because [reason — you saw their property, you're in their neighborhood, etc.].

I do [specific services]. I'm available [when].

Would you be interested in a free estimate?`,
    risks: [
      'Do not spend money on a logo or website before you have paying clients',
      'Your first clients come from your network — text 20 people before running ads',
      'Google reviews compound over time — ask for them early and consistently',
    ],
    nextAction: 'Set up your Google Business Profile today. It takes 20 minutes and starts working immediately.',
    free: false,
  },
  {
    id: 'clothing-brand-launch',
    tag: 'Launch',
    tagColor: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25',
    title: 'Clothing Brand Launch Checklist',
    situation: 'You are launching or building a clothing brand and need to know what to do in what order.',
    goal: 'A real, working brand foundation — not just designs and ideas, but a functioning sales and fulfillment operation.',
    checklist: [
      'Define the brand identity: who is the customer, what do they believe, why would they buy from you specifically',
      'Pick a supplier (Printful, Printify, local manufacturer, or blank wholesale)',
      'Design 3–5 core products before spending on anything else',
      'Price correctly: supplier cost × 2.5–3x = retail price minimum',
      'Set up the storefront (Shopify, Etsy, Instagram Shop, or website)',
      'Set up payment processing',
      'Create product photos before launch — no phone screenshots',
      'Set up an email capture (even a simple link)',
      'Plan the launch: post 3–5 days of content before launch day',
      'Track: units sold, revenue, cost of goods, ad spend, profit',
    ],
    risks: [
      'Do not order bulk inventory before proving demand — start with print-on-demand',
      'The brand aesthetic means nothing if the product quality is poor',
      'Social followers ≠ customers — build your email list from day one',
      'Do not spend more on ads than you have proven in organic sales',
    ],
    nextAction: 'Pick your first 3 products. Price them correctly. Build the store before building the audience.',
    free: false,
  },
];

// ── Card detail modal ─────────────────────────────────────────────────
function CardModal({ card, onClose, isPaid }: {
  card: typeof CARDS[0];
  onClose: () => void;
  isPaid: boolean;
}) {
  const [generating, setGenerating] = useState(false);
  const [context, setContext] = useState('');
  const [generated, setGenerated] = useState<string | null>(null);

  const generate = async () => {
    if (!context.trim()) return;
    setGenerating(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('nova_access_token') || '' : '';
      const res = await fetch(`${API}/v1/cards/generate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardType: card.id, context }),
      });
      const d = await res.json();
      if (d.success) setGenerated(d.data?.content || null);
    } catch { /* */ } finally { setGenerating(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-gray-800 flex items-start justify-between">
          <div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${card.tagColor} mr-2`}>{card.tag}</span>
            <h2 className="text-xl font-bold text-white mt-2">{card.title}</h2>
            <p className="text-gray-500 text-sm mt-1">{card.situation}</p>
          </div>
          <button onClick={onClose} className="text-gray-600 hover:text-white text-2xl leading-none ml-4">×</button>
        </div>

        <div className="p-6 space-y-6">
          {/* Goal */}
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">
              <CheckCircle className="w-3.5 h-3.5" /> Goal
            </div>
            <p className="text-gray-300 text-sm leading-relaxed">{card.goal}</p>
          </div>

          {/* Checklist */}
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
              <List className="w-3.5 h-3.5" /> Checklist
            </div>
            <ul className="space-y-2">
              {card.checklist.map((item, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-gray-300">
                  <span className="w-5 h-5 rounded border border-gray-700 bg-gray-800 flex items-center justify-center text-[10px] text-gray-500 shrink-0 mt-0.5">{i + 1}</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Script */}
          {card.script && (
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
                <MessageSquare className="w-3.5 h-3.5" /> Script
              </div>
              <div className="bg-gray-950 rounded-xl border border-gray-800 p-4 text-sm text-gray-300 font-mono leading-relaxed whitespace-pre-wrap">
                {card.script}
              </div>
            </div>
          )}

          {/* Template */}
          {card.template && (
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
                <FileText className="w-3.5 h-3.5" /> Template
              </div>
              <div className="bg-gray-950 rounded-xl border border-gray-800 p-4 text-xs text-gray-400 font-mono leading-relaxed whitespace-pre-wrap">
                {card.template}
              </div>
            </div>
          )}

          {/* Risks */}
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-widest mb-3">
              <AlertTriangle className="w-3.5 h-3.5" /> Risk Warnings
            </div>
            <ul className="space-y-2">
              {card.risks.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-amber-300/70">
                  <span className="shrink-0 mt-1">⚠</span> {r}
                </li>
              ))}
            </ul>
          </div>

          {/* Next action */}
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
            <div className="text-xs font-bold text-emerald-400 mb-1">Next Action</div>
            <p className="text-sm text-emerald-300">{card.nextAction}</p>
          </div>

          {/* AI generation — paid feature */}
          <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-semibold text-white">Generate for my situation</span>
              {!isPaid && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/25">Pro · $29/mo</span>}
            </div>
            {isPaid ? (
              <div className="space-y-3">
                <textarea
                  value={context}
                  onChange={e => setContext(e.target.value)}
                  placeholder={`Describe your specific situation — client name, amount, how long overdue, relationship, etc. The more detail, the more specific the output.`}
                  rows={4}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500/60 resize-none"
                />
                <button onClick={generate} disabled={generating || !context.trim()}
                  className="w-full py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-sm font-semibold text-white transition">
                  {generating ? 'Generating…' : 'Generate My Card'}
                </button>
                {generated && (
                  <div className="bg-gray-950 rounded-xl border border-violet-500/30 p-4 text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">
                    {generated}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3 text-sm text-gray-500">
                <Lock className="w-4 h-4 shrink-0" />
                <span>Upgrade to Pro to generate this card with your specific context — client name, amounts, situation details filled in for you.</span>
                <Link href="/pricing" className="text-violet-400 hover:text-violet-300 shrink-0">Upgrade →</Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────
export default function DecisionCardsClient() {
  const [selected, setSelected] = useState<typeof CARDS[0] | null>(null);
  const [filter, setFilter] = useState<string>('All');
  const tags = ['All', ...Array.from(new Set(CARDS.map(c => c.tag)))];
  const isPaid = false; // TODO: read from auth store
  const freeUsed = 0;   // TODO: read from server

  const visible = filter === 'All' ? CARDS : CARDS.filter(c => c.tag === filter);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Nav */}
      <nav className="border-b border-gray-800/60 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center text-xs font-bold">N</div>
          <span className="font-semibold text-sm">Nova</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/services/back-office-os" className="text-gray-500 text-sm hover:text-white transition">Services</Link>
          <Link href="/field-manual"            className="text-gray-500 text-sm hover:text-white transition">Field Manual</Link>
          <Link href="/register"                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-white transition">
            Get Started
          </Link>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-12 space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 text-xs text-gray-500 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full mb-5">
            3 cards free per month · No signup required
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">Decision Cards</h1>
          <p className="text-gray-400 text-lg max-w-xl mx-auto leading-relaxed">
            Every business situation has a next move. Pick the card for your moment.
            Get the checklist, script, template, and action — not vague advice.
          </p>
        </div>

        {/* Filter tabs */}
        <div className="flex flex-wrap gap-2 justify-center">
          {tags.map(tag => (
            <button key={tag} onClick={() => setFilter(tag)}
              className={`px-3 py-1.5 rounded-lg text-sm transition ${
                filter === tag ? 'bg-white text-black font-semibold' : 'bg-white/5 text-gray-400 hover:text-white'
              }`}>
              {tag}
            </button>
          ))}
        </div>

        {/* Card grid */}
        <div className="grid md:grid-cols-2 gap-4">
          {visible.map(card => (
            <button key={card.id} onClick={() => setSelected(card)}
              className="text-left rounded-xl border border-gray-800 bg-gray-900/50 p-5 hover:border-gray-600 hover:bg-gray-900 transition-all group">
              <div className="flex items-start justify-between mb-3">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${card.tagColor}`}>{card.tag}</span>
                {card.free ? (
                  <span className="text-[10px] text-emerald-400 font-semibold">FREE</span>
                ) : (
                  <Lock className="w-3.5 h-3.5 text-gray-600 group-hover:text-gray-400 transition" />
                )}
              </div>
              <h3 className="text-base font-semibold text-white mb-2">{card.title}</h3>
              <p className="text-xs text-gray-500 leading-relaxed">{card.situation}</p>
              <div className="mt-4 flex items-center gap-1 text-xs text-gray-600 group-hover:text-gray-400 transition">
                Open card <ArrowRight className="w-3 h-3" />
              </div>
            </button>
          ))}
        </div>

        {/* Paywall note */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-6 text-center">
          <h3 className="text-lg font-semibold text-white mb-2">Unlock the full card library</h3>
          <p className="text-gray-500 text-sm mb-5 max-w-md mx-auto">
            Free: 3 cards per month. Starter ($9/mo): full library. Pro ($29/mo): AI-generated cards with your context filled in.
            Business ($79/mo): team workspace, branded forms, and advanced cards.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/register"
              className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-white transition">
              Start Free
            </Link>
            <Link href="/pricing"
              className="px-6 py-2.5 rounded-xl border border-gray-700 hover:border-gray-500 text-sm text-gray-400 hover:text-white transition">
              View Pricing
            </Link>
          </div>
        </div>
      </main>

      {/* Modal */}
      {selected && <CardModal card={selected} onClose={() => setSelected(null)} isPaid={isPaid} />}
    </div>
  );
}
