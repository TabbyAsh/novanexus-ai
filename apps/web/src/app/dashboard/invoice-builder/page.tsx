'use client';

/**
 * Invoice Builder — create and print professional invoices.
 * Builds on the same structure as the Quote Builder.
 * Adds: Invoice number, due date, paid/unpaid status, payment methods.
 */

import { useState, useRef } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { Plus, Trash2, Printer, Copy, CheckCircle } from 'lucide-react';

interface LineItem { id: string; description: string; qty: number; rate: number; }
const EMPTY_ITEM = (): LineItem => ({ id: Date.now().toString(), description: '', qty: 1, rate: 0 });

export default function InvoiceBuilderPage() {
  const [invoiceNum] = useState(`INV-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000 + 1000)}`);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({
    businessName: '', businessEmail: '', businessPhone: '',
    clientName: '', clientEmail: '',
    dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    paymentMethods: 'Venmo, Cash App, Zelle, Check',
    notes: 'Payment is due by the date stated above. Late payments may incur a 5% fee after 7 days.',
    items: [EMPTY_ITEM()],
  });

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(p => ({ ...p, [k]: v }));
  const setItem = (id: string, field: keyof LineItem, val: string | number) =>
    setForm(p => ({ ...p, items: p.items.map(i => i.id === id ? { ...i, [field]: val } : i) }));

  const subtotal = form.items.reduce((s, i) => s + i.qty * i.rate, 0);
  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

  const copyText = () => {
    const text = `INVOICE ${invoiceNum}
Date: ${new Date().toLocaleDateString()}
Due: ${new Date(form.dueDate).toLocaleDateString()}

FROM: ${form.businessName}
${form.businessEmail} · ${form.businessPhone}

TO: ${form.clientName}
${form.clientEmail}

ITEMS:
${form.items.filter(i => i.description).map(i => `${i.description}: ${i.qty} × ${fmt(i.rate)} = ${fmt(i.qty * i.rate)}`).join('\n')}

TOTAL DUE: ${fmt(subtotal)}

Payment accepted via: ${form.paymentMethods}

${form.notes}`;
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Invoice Builder</h1>
          <p className="text-gray-500 text-sm mt-1">Create a professional invoice in under 2 minutes. Print or copy to send.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Form */}
          <div className="space-y-4">
            {[
              { label: 'Your Business', fields: [
                { key: 'businessName', placeholder: 'Business name', full: true },
                { key: 'businessEmail', placeholder: 'Your email', type: 'email' },
                { key: 'businessPhone', placeholder: 'Your phone' },
              ]},
              { label: 'Client', fields: [
                { key: 'clientName', placeholder: 'Client name', full: true },
                { key: 'clientEmail', placeholder: 'Client email', type: 'email', full: true },
              ]},
            ].map(section => (
              <div key={section.label} className="rounded-2xl border border-gray-800 bg-gray-900/50 p-5 space-y-3">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{section.label}</div>
                {section.fields.map((f, i) => (
                  <input key={i}
                    value={(form as any)[f.key]}
                    onChange={e => set(f.key as any, e.target.value)}
                    placeholder={f.placeholder}
                    type={(f as any).type || 'text'}
                    className={`bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50 ${(f as any).full ? 'w-full' : 'w-full'}`}
                  />
                ))}
              </div>
            ))}

            <div className="rounded-2xl border border-gray-800 bg-gray-900/50 p-5 space-y-3">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Line Items</div>
              {form.items.map(item => (
                <div key={item.id} className="flex gap-2">
                  <input value={item.description} onChange={e => setItem(item.id, 'description', e.target.value)}
                    placeholder="Description" className="flex-1 bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-emerald-500/50" />
                  <input type="number" value={item.qty} min={1} onChange={e => setItem(item.id, 'qty', parseFloat(e.target.value)||1)}
                    className="w-12 bg-gray-950 border border-gray-800 rounded-lg px-2 py-2 text-xs text-white outline-none text-center" />
                  <input type="number" value={item.rate} min={0} step={0.01} onChange={e => setItem(item.id, 'rate', parseFloat(e.target.value)||0)}
                    placeholder="$" className="w-20 bg-gray-950 border border-gray-800 rounded-lg px-2 py-2 text-xs text-white outline-none" />
                  {form.items.length > 1 && (
                    <button onClick={() => setForm(p => ({...p, items: p.items.filter(i => i.id !== item.id)}))}
                      className="p-1 text-gray-600 hover:text-red-400 transition">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <button onClick={() => setForm(p => ({...p, items: [...p.items, EMPTY_ITEM()]}))}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-white transition">
                <Plus className="w-3.5 h-3.5" /> Add item
              </button>
            </div>

            <div className="rounded-2xl border border-gray-800 bg-gray-900/50 p-5 space-y-3">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Payment</div>
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Due date</label>
                <input type="date" value={form.dueDate} onChange={e => set('dueDate', e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white outline-none" />
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Payment methods accepted</label>
                <input value={form.paymentMethods} onChange={e => set('paymentMethods', e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white outline-none" />
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Notes</label>
                <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-xs text-white outline-none resize-none" />
              </div>
            </div>
          </div>

          {/* Preview */}
          <div>
            <div className="rounded-2xl border border-gray-700 bg-gray-950 p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-lg font-bold text-white">{form.businessName || 'Your Business'}</div>
                  <div className="text-xs text-gray-500">{form.businessEmail}{form.businessPhone && ` · ${form.businessPhone}`}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold text-red-400 uppercase tracking-widest">Invoice</div>
                  <div className="text-sm font-mono text-white">{invoiceNum}</div>
                  <div className="text-xs text-gray-500">Issued: {new Date().toLocaleDateString()}</div>
                  <div className="text-xs text-amber-400">Due: {new Date(form.dueDate).toLocaleDateString()}</div>
                </div>
              </div>

              <div className="pt-3 border-t border-gray-800">
                <div className="text-xs text-gray-500 mb-1">Bill To</div>
                <div className="text-sm font-semibold text-white">{form.clientName || 'Client Name'}</div>
                {form.clientEmail && <div className="text-xs text-gray-500">{form.clientEmail}</div>}
              </div>

              <div className="pt-3 border-t border-gray-800 space-y-2">
                {form.items.filter(i => i.description).map(item => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <div className="text-gray-300 flex-1 pr-4">{item.description}</div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-gray-500">{item.qty} × {fmt(item.rate)}</div>
                      <div className="font-semibold text-white">{fmt(item.qty * item.rate)}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-gray-700">
                <div className="flex justify-between text-base font-bold">
                  <span className="text-white">Total Due</span>
                  <span className="text-red-400 text-xl">{fmt(subtotal)}</span>
                </div>
              </div>

              <div className="pt-3 border-t border-gray-800">
                <div className="text-xs text-gray-500 mb-1">Payment via</div>
                <div className="text-xs text-gray-300">{form.paymentMethods}</div>
              </div>

              {form.notes && (
                <div className="text-xs text-gray-600 leading-relaxed border-t border-gray-800 pt-3">{form.notes}</div>
              )}
            </div>

            <div className="flex gap-3 mt-4">
              <button onClick={copyText}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-700 hover:border-gray-500 text-sm text-gray-400 hover:text-white transition">
                {copied ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied!' : 'Copy text'}
              </button>
              <button onClick={() => window.print()}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-white transition">
                <Printer className="w-4 h-4" /> Print / PDF
              </button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
