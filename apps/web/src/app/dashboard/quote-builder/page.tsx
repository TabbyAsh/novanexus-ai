'use client';

/**
 * Service Quote Builder — generate professional quotes instantly.
 *
 * For contractors, freelancers, service businesses, cleaners, handymen,
 * lawn care, pressure washing, painting, photography, design, etc.
 *
 * Fills out and generates a professional quote in under 2 minutes.
 * Printable. Shareable. No account setup required.
 */

import { useState, useRef } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { Plus, Trash2, Download, Copy, CheckCircle } from 'lucide-react';

interface LineItem {
  id: string;
  description: string;
  qty: number;
  rate: number;
}

interface QuoteForm {
  businessName: string;
  businessEmail: string;
  businessPhone: string;
  clientName: string;
  clientEmail: string;
  jobDescription: string;
  jobAddress: string;
  validDays: number;
  depositPercent: number;
  notes: string;
  items: LineItem[];
}

const EMPTY_ITEM = (): LineItem => ({
  id: Date.now().toString(),
  description: '',
  qty: 1,
  rate: 0,
});

const DEFAULT_FORM: QuoteForm = {
  businessName: '',
  businessEmail: '',
  businessPhone: '',
  clientName: '',
  clientEmail: '',
  jobDescription: '',
  jobAddress: '',
  validDays: 30,
  depositPercent: 25,
  notes: 'This quote is valid for the number of days stated above. Work begins upon receipt of deposit. Final payment due upon completion.',
  items: [EMPTY_ITEM()],
};

export default function QuoteBuilderPage() {
  const [form, setForm] = useState<QuoteForm>(DEFAULT_FORM);
  const [quoteNum] = useState(`Q-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000 + 1000)}`);
  const [copied, setCopied] = useState(false);
  const quoteRef = useRef<HTMLDivElement>(null);

  const set = <K extends keyof QuoteForm>(key: K, val: QuoteForm[K]) =>
    setForm(p => ({ ...p, [key]: val }));

  const setItem = (id: string, field: keyof LineItem, val: string | number) =>
    setForm(p => ({
      ...p,
      items: p.items.map(item => item.id === id ? { ...item, [field]: val } : item),
    }));

  const addItem = () => setForm(p => ({ ...p, items: [...p.items, EMPTY_ITEM()] }));
  const removeItem = (id: string) => setForm(p => ({ ...p, items: p.items.filter(i => i.id !== id) }));

  const subtotal = form.items.reduce((s, i) => s + i.qty * i.rate, 0);
  const deposit = subtotal * (form.depositPercent / 100);
  const balance = subtotal - deposit;

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

  const copyText = () => {
    const text = `QUOTE ${quoteNum}
Date: ${new Date().toLocaleDateString()}
Valid for: ${form.validDays} days

FROM: ${form.businessName}
${form.businessEmail} · ${form.businessPhone}

TO: ${form.clientName}
${form.clientEmail}

JOB: ${form.jobDescription}
${form.jobAddress ? `Address: ${form.jobAddress}` : ''}

ITEMS:
${form.items.map(i => `${i.description}: ${i.qty} × ${fmt(i.rate)} = ${fmt(i.qty * i.rate)}`).join('\n')}

SUBTOTAL: ${fmt(subtotal)}
DEPOSIT (${form.depositPercent}%): ${fmt(deposit)}
BALANCE DUE ON COMPLETION: ${fmt(balance)}

${form.notes}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const print = () => {
    if (quoteRef.current) window.print();
  };

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Service Quote Builder</h1>
          <p className="text-gray-500 text-sm mt-1">
            Generate a professional quote in 2 minutes. Copy to text or print.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* LEFT: Form */}
          <div className="space-y-5">

            {/* Your info */}
            <div className="rounded-2xl border border-gray-800 bg-gray-900/50 p-5 space-y-3">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Your Business</div>
              <input value={form.businessName} onChange={e => set('businessName', e.target.value)}
                placeholder="Business name" className="w-full input-field" />
              <div className="grid grid-cols-2 gap-3">
                <input value={form.businessEmail} onChange={e => set('businessEmail', e.target.value)}
                  placeholder="Email" type="email" className="input-field" />
                <input value={form.businessPhone} onChange={e => set('businessPhone', e.target.value)}
                  placeholder="Phone" className="input-field" />
              </div>
            </div>

            {/* Client info */}
            <div className="rounded-2xl border border-gray-800 bg-gray-900/50 p-5 space-y-3">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Client</div>
              <input value={form.clientName} onChange={e => set('clientName', e.target.value)}
                placeholder="Client name" className="w-full input-field" />
              <input value={form.clientEmail} onChange={e => set('clientEmail', e.target.value)}
                placeholder="Client email" type="email" className="w-full input-field" />
            </div>

            {/* Job info */}
            <div className="rounded-2xl border border-gray-800 bg-gray-900/50 p-5 space-y-3">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Job</div>
              <input value={form.jobDescription} onChange={e => set('jobDescription', e.target.value)}
                placeholder="Job description (e.g. Full exterior pressure wash + driveway)" className="w-full input-field" />
              <input value={form.jobAddress} onChange={e => set('jobAddress', e.target.value)}
                placeholder="Job address (optional)" className="w-full input-field" />
            </div>

            {/* Line items */}
            <div className="rounded-2xl border border-gray-800 bg-gray-900/50 p-5 space-y-3">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Line Items</div>
              {form.items.map(item => (
                <div key={item.id} className="flex gap-2 items-start">
                  <input value={item.description}
                    onChange={e => setItem(item.id, 'description', e.target.value)}
                    placeholder="Description" className="flex-1 input-field text-xs" />
                  <input type="number" value={item.qty} min={1}
                    onChange={e => setItem(item.id, 'qty', parseFloat(e.target.value) || 1)}
                    className="w-12 input-field text-xs text-center" />
                  <input type="number" value={item.rate} min={0} step={0.01}
                    onChange={e => setItem(item.id, 'rate', parseFloat(e.target.value) || 0)}
                    placeholder="Rate" className="w-20 input-field text-xs" />
                  {form.items.length > 1 && (
                    <button onClick={() => removeItem(item.id)}
                      className="p-2 text-gray-600 hover:text-red-400 transition shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <button onClick={addItem}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-white transition">
                <Plus className="w-3.5 h-3.5" /> Add line item
              </button>
            </div>

            {/* Terms */}
            <div className="rounded-2xl border border-gray-800 bg-gray-900/50 p-5 space-y-3">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Terms</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">Valid for (days)</label>
                  <input type="number" value={form.validDays}
                    onChange={e => set('validDays', parseInt(e.target.value) || 30)}
                    className="w-full input-field" />
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">Deposit %</label>
                  <input type="number" value={form.depositPercent} min={0} max={100}
                    onChange={e => set('depositPercent', parseInt(e.target.value) || 0)}
                    className="w-full input-field" />
                </div>
              </div>
              <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
                className="w-full input-field text-xs resize-none" />
            </div>
          </div>

          {/* RIGHT: Quote preview */}
          <div>
            <div ref={quoteRef} className="rounded-2xl border border-gray-700 bg-gray-950 p-6 space-y-5 print:bg-white print:text-black">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-lg font-bold text-white print:text-black">{form.businessName || 'Your Business'}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{form.businessEmail} {form.businessPhone && `· ${form.businessPhone}`}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">Quote</div>
                  <div className="text-sm font-mono text-white print:text-black">{quoteNum}</div>
                  <div className="text-xs text-gray-500">{new Date().toLocaleDateString()}</div>
                </div>
              </div>

              {/* Client */}
              <div className="pt-3 border-t border-gray-800">
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Prepared for</div>
                <div className="text-sm font-semibold text-white print:text-black">{form.clientName || 'Client Name'}</div>
                {form.clientEmail && <div className="text-xs text-gray-500">{form.clientEmail}</div>}
              </div>

              {/* Job */}
              {form.jobDescription && (
                <div className="pt-3 border-t border-gray-800">
                  <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Scope of Work</div>
                  <div className="text-sm text-gray-300 print:text-gray-800">{form.jobDescription}</div>
                  {form.jobAddress && <div className="text-xs text-gray-500 mt-1">{form.jobAddress}</div>}
                </div>
              )}

              {/* Line items */}
              <div className="pt-3 border-t border-gray-800 space-y-2">
                {form.items.filter(i => i.description).map(item => (
                  <div key={item.id} className="flex items-start justify-between text-sm">
                    <div className="text-gray-300 print:text-gray-800 flex-1 pr-4">{item.description}</div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-gray-500">{item.qty} × {fmt(item.rate)}</div>
                      <div className="font-semibold text-white print:text-black">{fmt(item.qty * item.rate)}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="pt-3 border-t border-gray-700 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Subtotal</span>
                  <span className="text-white print:text-black font-semibold">{fmt(subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Deposit ({form.depositPercent}%) — due before start</span>
                  <span className="text-amber-400 font-semibold">{fmt(deposit)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold border-t border-gray-700 pt-2">
                  <span className="text-gray-300">Balance on completion</span>
                  <span className="text-emerald-400">{fmt(balance)}</span>
                </div>
              </div>

              {/* Terms */}
              <div className="pt-3 border-t border-gray-800">
                <div className="text-xs text-gray-600 leading-relaxed">{form.notes}</div>
                <div className="text-xs text-gray-700 mt-2">Valid for {form.validDays} days from issue date.</div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-4">
              <button onClick={copyText}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-700 hover:border-gray-500 text-sm text-gray-400 hover:text-white transition">
                {copied ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied!' : 'Copy as text'}
              </button>
              <button onClick={print}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-white transition">
                <Download className="w-4 h-4" /> Print / Save PDF
              </button>
            </div>
          </div>
        </div>

        <style jsx global>{`
          .input-field {
            background: #0d0d14;
            border: 1px solid #1f2937;
            border-radius: 8px;
            padding: 8px 12px;
            font-size: 13px;
            color: white;
            width: 100%;
            outline: none;
          }
          .input-field:focus { border-color: rgba(16,185,129,0.5); }
          @media print {
            body > *:not(main) { display: none !important; }
            .no-print { display: none !important; }
          }
        `}</style>
      </div>
    </DashboardLayout>
  );
}
