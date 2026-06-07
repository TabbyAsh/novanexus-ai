'use client';

/**
 * NovaCore — the central AI command center. The TRUNK.
 *
 * Per the founder's canonical vision: "NovaCore: a local-first AI command
 * center for personal research, market analysis, project planning, and learning."
 *
 * You talk to Nova. Nova helps you think, and routes you to the right branch
 * (flip, market, business, income, savings, decisions). This is what makes
 * the whole system feel like ONE AI operating system instead of scattered tools.
 */

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { Send, Sparkles, ArrowRight, Plus, MessageSquare } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('nova_access_token') || '' : '';

interface Message {
  role: 'user' | 'nova';
  content: string;
  branch?: { intent: string; label: string; href: string; description: string } | null;
}

const SUGGESTIONS = [
  'I have a skill but I\'m not making money from it',
  'Help me find items to flip this weekend',
  'I run a small business and I\'m disorganized',
  'What stocks are showing momentum today?',
  'I want to track my gig income',
  'Help me save money on my monthly expenses',
];

export default function NovaCorePage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = { role: 'user', content: text };
    setMessages(m => [...m, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const r = await fetch(`${API}/v1/nova/chat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, conversationId }),
      });
      const d = await r.json();
      if (d.success) {
        setConversationId(d.data.conversationId);
        setMessages(m => [...m, { role: 'nova', content: d.data.reply, branch: d.data.branch }]);
      } else {
        setMessages(m => [...m, { role: 'nova', content: 'I had trouble responding just now. Try asking again.' }]);
      }
    } catch {
      setMessages(m => [...m, { role: 'nova', content: 'Connection issue. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  const newChat = () => {
    setMessages([]);
    setConversationId(null);
    setInput('');
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-3.5rem)]">

        {/* Header */}
        <div className="border-b border-white/5 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center font-bold text-white">N</div>
            <div>
              <h1 className="text-lg font-bold text-white leading-none">Nova</h1>
              <p className="text-xs text-gray-600 mt-0.5">Your AI command center</p>
            </div>
          </div>
          {messages.length > 0 && (
            <button onClick={newChat} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-800 hover:border-gray-600 text-xs text-gray-400 hover:text-white transition">
              <Plus className="w-3.5 h-3.5" /> New chat
            </button>
          )}
        </div>

        {/* Messages / empty state */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
          {messages.length === 0 ? (
            <div className="max-w-2xl mx-auto text-center pt-8">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center font-bold text-2xl text-white mx-auto mb-5">N</div>
              <h2 className="text-2xl font-bold text-white mb-2">What can I help you with?</h2>
              <p className="text-gray-500 mb-8 leading-relaxed">
                I'm Nova. Tell me what you're working on, thinking about, or stuck on.
                I'll help you figure out the next move — and I can take you to the right tool when you need it.
              </p>
              <div className="grid sm:grid-cols-2 gap-2.5 text-left">
                {SUGGESTIONS.map(s => (
                  <button key={s} onClick={() => send(s)}
                    className="flex items-center gap-2.5 rounded-xl border border-gray-800 bg-gray-900/40 px-4 py-3 text-sm text-gray-400 hover:text-white hover:border-emerald-500/30 hover:bg-emerald-500/5 transition text-left">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-500/60 shrink-0" />
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto space-y-5">
              {messages.map((m, i) => (
                <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : ''}`}>
                  {m.role === 'nova' && (
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center text-xs font-bold text-white shrink-0 mt-1">N</div>
                  )}
                  <div className={`max-w-[80%] ${m.role === 'user' ? 'order-1' : ''}`}>
                    <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                      m.role === 'user'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-gray-900 border border-gray-800 text-gray-200'
                    }`}>
                      {m.content}
                    </div>
                    {/* Branch route card */}
                    {m.branch && (
                      <Link href={m.branch.href}
                        className="mt-2 flex items-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3 hover:bg-emerald-500/10 transition group">
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-emerald-400">{m.branch.label}</div>
                          <div className="text-xs text-gray-500">{m.branch.description}</div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-emerald-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
                      </Link>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center text-xs font-bold text-white shrink-0 mt-1">N</div>
                  <div className="bg-gray-900 border border-gray-800 rounded-2xl px-4 py-3">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 rounded-full bg-gray-600 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 rounded-full bg-gray-600 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 rounded-full bg-gray-600 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-white/5 px-6 py-4 shrink-0">
          <div className="max-w-2xl mx-auto">
            <div className="flex gap-3 items-end">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
                placeholder="Ask Nova anything, or describe what you're working on…"
                rows={1}
                className="flex-1 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 outline-none focus:border-emerald-500/50 resize-none max-h-32"
                style={{ minHeight: '46px' }}
              />
              <button onClick={() => send(input)} disabled={loading || !input.trim()}
                className="w-11 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 flex items-center justify-center text-white transition shrink-0">
                <Send className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-gray-700 text-center mt-2">
              Nova helps you think and routes you to the right tool. Not financial advice.
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
