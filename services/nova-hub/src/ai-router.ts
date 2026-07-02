/**
 * Nova AI Router — Zero-cost intelligence layer.
 *
 * Priority chain (highest quality free → deterministic fallback):
 *   1. Google Gemini 1.5 Flash   — 1M tokens/day FREE
 *   2. Groq (Llama 3.3 70B)      — 14,400 requests/day FREE
 *   3. Anthropic Claude Haiku     — free tier if ANTHROPIC_API_KEY set
 *   4. Deterministic engine        — ALWAYS works, zero cost, zero latency
 *
 * The deterministic engine produces real, structured, useful output
 * using pattern matching + template filling. It is not a fallback of
 * last resort — it is a valid product tier.
 *
 * Nova's law: if AI is unavailable, say so AND still produce value.
 * Never block the user because a paid API is down.
 */

import { createLogger } from '@nova/telemetry';

const logger = createLogger('ai-router');

export interface AIRequest {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AIResponse {
  content: string;
  provider: string;
  free: boolean;
}

// ── Provider 1: Google Gemini (OpenAI-compatible endpoint) ────────────
async function callGemini(req: AIRequest): Promise<AIResponse | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: 'gemini-2.5-flash',
          messages: [
            { role: 'system', content: req.system },
            { role: 'user',   content: req.user },
          ],
          max_tokens: req.maxTokens ?? 700,
          temperature: req.temperature ?? 0.7,
        }),
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      logger.warn('Gemini failed', { status: res.status, error: err.slice(0, 200) });
      return null;
    }

    const d = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = d.choices?.[0]?.message?.content;
    if (!content) return null;

    return { content, provider: 'gemini-2.5-flash', free: true };
  } catch (err) {
    logger.warn('Gemini error', { error: (err as Error).message });
    return null;
  }
}

// ── Provider 2: Groq (Llama 3.3 70B — OpenAI-compatible) ─────────────
async function callGroq(req: AIRequest): Promise<AIResponse | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: req.system },
          { role: 'user',   content: req.user },
        ],
        max_tokens: req.maxTokens ?? 700,
        temperature: req.temperature ?? 0.7,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return null;

    const d = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = d.choices?.[0]?.message?.content;
    if (!content) return null;

    return { content, provider: 'groq-llama3.3-70b', free: true };
  } catch (err) {
    logger.warn('Groq error', { error: (err as Error).message });
    return null;
  }
}

// ── Provider: xAI Grok (OpenAI-compatible) ────────────────────────────
async function callGrok(req: AIRequest): Promise<AIResponse | null> {
  const key = process.env.XAI_API_KEY;
  if (!key) return null;

  try {
    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'grok-3-mini',
        messages: [
          { role: 'system', content: req.system },
          { role: 'user',   content: req.user },
        ],
        max_tokens: req.maxTokens ?? 700,
        temperature: req.temperature ?? 0.7,
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      const err = await res.text();
      logger.warn('Grok failed', { status: res.status, error: err.slice(0, 200) });
      return null;
    }

    const d = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = d.choices?.[0]?.message?.content;
    if (!content) return null;

    return { content, provider: 'grok-3-mini', free: false };
  } catch (err) {
    logger.warn('Grok error', { error: (err as Error).message });
    return null;
  }
}

// ── Provider 3: Anthropic Claude Haiku ───────────────────────────────
async function callClaude(req: AIRequest): Promise<AIResponse | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: req.maxTokens ?? 700,
        system: req.system,
        messages: [{ role: 'user', content: req.user }],
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) return null;

    const d = await res.json() as { content?: Array<{ text?: string }> };
    const content = d.content?.[0]?.text;
    if (!content) return null;

    return { content, provider: 'claude-haiku', free: false };
  } catch (err) {
    logger.warn('Claude error', { error: (err as Error).message });
    return null;
  }
}

// ── Provider 4: OpenAI (kept as last paid option) ─────────────────────
async function callOpenAI(req: AIRequest): Promise<AIResponse | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  try {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: key });
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: req.system },
        { role: 'user',   content: req.user },
      ],
      max_tokens: req.maxTokens ?? 700,
      temperature: req.temperature ?? 0.7,
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) return null;
    return { content, provider: 'gpt-4o-mini', free: false };
  } catch (err) {
    logger.warn('OpenAI error', { error: (err as Error).message });
    return null;
  }
}

// ── Deterministic fallback engine ────────────────────────────────────
// Generates real, structured, useful output with zero API calls.
// Pattern: extract key entities from context → fill template sections.

function extractEntities(context: string): {
  hasAmount: boolean; amount: string;
  hasName: boolean;  name: string;
  hasTopic: boolean; topic: string;
} {
  const amountMatch = context.match(/\$[\d,]+|\d+\s*(dollars?|k\b)/i);
  const nameMatch   = context.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:owes|hasn't|is|has)/);
  const topicMatch  = context.match(/about\s+([a-z\s]+?)\s*(?:\.|,|but|and|$)/i);

  return {
    hasAmount: !!amountMatch,
    amount:    amountMatch?.[0] || 'the amount',
    hasName:   !!nameMatch,
    name:      nameMatch?.[1]  || 'them',
    hasTopic:  !!topicMatch,
    topic:     topicMatch?.[1] || 'your area',
  };
}

function deterministicCard(context: string, haves: string[] = [], wants: string[] = []): string {
  const e = extractEntities(context);
  const lower = context.toLowerCase();

  // Collections / unpaid
  if (lower.includes("hasn't paid") || lower.includes("owes") || lower.includes("unpaid") || lower.includes("invoice")) {
    return `WHAT YOU'RE ACTUALLY DEALING WITH:
${e.hasName ? e.name : 'A client'} owes you ${e.hasAmount ? e.amount : 'money'} and you need to collect it professionally without burning the relationship.

YOUR NEXT 3 MOVES (in order):
1. Send a clear, brief reminder today — state the amount, the original due date, and a new deadline (5 business days). Keep it factual, not emotional.
2. If no response in 5 days, send a final notice. State that you will take further steps if unpaid by [specific date]. Do not threaten, just state facts.
3. Decide your line: small claims court (under $10k in most states, ~$30-100 filing fee), collections agency, or write it off. Know your line before you need it.

WHAT TO SAY:
"Hi [Name], following up on the invoice for ${e.hasAmount ? e.amount : '[amount]'} from [date]. I want to make sure it didn't get lost. Could you confirm receipt and let me know when I can expect payment? I'd like to have this settled by [5 days from now]. Thanks."

DON'T OVERLOOK THIS:
• Keep every communication in writing — texts and emails count as records.
• Do not reduce the amount owed without getting the agreement in writing first.

START HERE — TODAY:
Write the follow-up message. Send it before you do anything else today.`;
  }

  // Skill / monetization
  if (lower.includes('skill') || lower.includes('free') || lower.includes('charge') || lower.includes('paid') ||
      haves.some(h => h.toLowerCase().includes('skill') || h.toLowerCase().includes('craft'))) {
    return `WHAT YOU'RE ACTUALLY DEALING WITH:
You have a real skill that people already want — you know this because they keep asking for it. The gap is not the skill. The gap is the system around the skill: how you price it, how you present it, and how you find people who will pay.

YOUR NEXT 3 MOVES (in order):
1. Set a real price today. Cost of your time × 1.5 at minimum. If people have been paying you zero, start at a number that feels slightly uncomfortable. That's usually the right number.
2. Tell 5 people in your existing network that you now charge for this. Not strangers — people who already know you do this. They are your first paying customers or your first referrals.
3. Create one piece of proof: a before/after, a result, a photo, a testimonial. One real example of your work is worth more than any website.

WHAT TO SAY:
"Hey [Name], I've been helping people with [skill] and I'm starting to take on paying clients. I charge [price] for [what you do]. If you know anyone who needs this, I'd appreciate the connection."

DON'T OVERLOOK THIS:
• The people most likely to pay you first are people who have already benefited from your skill for free. Go back to them.
• Pricing too low signals low quality. A higher price gets taken more seriously.

START HERE — TODAY:
Pick a price. Write it down. Text one person who has already benefited from your skill and tell them you're now taking paid clients.`;
  }

  // Following / community
  if (lower.includes('follower') || lower.includes('community') || lower.includes('discord') || lower.includes('audience') ||
      haves.some(h => h.toLowerCase().includes('follow') || h.toLowerCase().includes('communit'))) {
    return `WHAT YOU'RE ACTUALLY DEALING WITH:
You've built something real — people who show up, engage, and trust you. That is the hardest part of any business. What's missing is not the audience. What's missing is an offer that matches what they already want from you.

YOUR NEXT 3 MOVES (in order):
1. Ask your community one direct question: "If I offered [a thing related to your content/niche], would you pay for it? What would make it worth it?" This single message will tell you more than any business plan.
2. Start with the smallest possible version of an offer: a guide, a template, a group call, a private channel, a simple product. Under $30. Get 10 people to buy it.
3. Use those 10 purchases as proof, as feedback, and as the basis for the next offer.

WHAT TO SAY:
"Quick question for you all — I've been thinking about offering [idea]. If this existed, would you use it? Drop a reply or DM me. If enough people are interested, I'll build it."

DON'T OVERLOOK THIS:
• Your audience will not tell you what they want unprompted. Ask directly and specifically.
• The first offer does not need to be perfect. It needs to exist and be purchasable.

START HERE — TODAY:
Post or message your community with one direct question about what they'd pay for. Read every response.`;
  }

  // Knowledge / expertise
  if (lower.includes('know') || lower.includes('expert') || lower.includes('deep') || lower.includes('niche') ||
      haves.some(h => h.toLowerCase().includes('knowledge') || h.toLowerCase().includes('expert'))) {
    return `WHAT YOU'RE ACTUALLY DEALING WITH:
You have accumulated knowledge that other people would pay to access — but knowledge alone doesn't sell. What sells is knowledge packaged as a solution to a specific problem someone has right now.

YOUR NEXT 3 MOVES (in order):
1. Name the exact problem your knowledge solves. Not "I know about [topic]" but "I help [who] do [what] without [pain]." Write that sentence.
2. Find 3 people who have that problem — forums, groups, social media, people you know. Talk to them before you build anything. Understand how they describe the problem in their own words.
3. Create the smallest possible version of a solution: a 30-minute consultation call at $50-100, a document that answers the top 5 questions, a simple workshop. Offer it to those 3 people first.

WHAT TO SAY:
"I've spent [time] learning about [topic] and I now help people [specific outcome]. I'm offering [offer] at [price] this month. Would you be interested or know someone who might be?"

DON'T OVERLOOK THIS:
• People don't pay for knowledge — they pay for outcomes. Always describe what they'll be able to DO after working with you.
• The first version doesn't need to be polished. It needs to solve the problem.

START HERE — TODAY:
Write the one sentence: "I help [who] do [what] without [pain]." If you can't write it, that's the work.`;
  }

  // Generic / any situation
  return `WHAT YOU'RE ACTUALLY DEALING WITH:
You're at a decision point — you have something real to work with and a direction you want to move, but you're not sure of the exact next step. That's a solvable problem.

YOUR NEXT 3 MOVES (in order):
1. Get specific: write down exactly what outcome you want in 90 days. Not vague goals — a specific measurable result. Without this, every action is equally valid and none of them move you forward.
2. Identify the single biggest obstacle between where you are and that result. Not all obstacles — the biggest one. That's your real project.
3. Find one person who has already solved the problem you're trying to solve. Study how they did it. Contact them if possible. Pattern-match before reinventing.

WHAT TO SAY (if you need to ask for help or direction):
"I'm working on [goal]. I'm stuck on [specific problem]. Have you dealt with this before? I'd value your perspective for 15 minutes."

DON'T OVERLOOK THIS:
• Clarity on the outcome is more valuable than any tactic. Get specific first.
• The person who has already solved your problem is a shortcut worth pursuing before anything else.

START HERE — TODAY:
Write one sentence: "In 90 days, I want to have [specific result]." If you can write it clearly, you have a destination. Everything else is navigation.`;
}

// ── Main router — tries providers in order, never fails ──────────────
export async function generateCard(req: AIRequest): Promise<AIResponse> {
  // Try free providers in order
  const providers = [callGemini, callGroq];

  // Add paid providers if keys exist
  if (process.env.XAI_API_KEY)       providers.push(callGrok);
  if (process.env.ANTHROPIC_API_KEY) providers.push(callClaude);
  if (process.env.OPENAI_API_KEY)    providers.push(callOpenAI as any);

  for (const provider of providers) {
    const result = await provider(req);
    if (result) {
      logger.info('AI card generated', { provider: result.provider, free: result.free });
      return result;
    }
  }

  // Deterministic fallback — always works
  logger.info('Using deterministic card engine (no AI providers available)');
  const content = deterministicCard(req.user);
  return { content, provider: 'deterministic', free: true };
}

// ── Chat router — providers only, NO deterministic fallback ──────────
// For conversational surfaces (the World hail). If no provider answers,
// return null and let the caller say "Unavailable" honestly, in Nova's
// voice. Law One of the World: nothing fake renders.
export async function generateChat(req: AIRequest): Promise<AIResponse | null> {
  const providers = [callGemini, callGroq];
  if (process.env.XAI_API_KEY)       providers.push(callGrok);
  if (process.env.ANTHROPIC_API_KEY) providers.push(callClaude);
  if (process.env.OPENAI_API_KEY)    providers.push(callOpenAI as any);

  for (const provider of providers) {
    const result = await provider(req);
    if (result) {
      logger.info('AI chat generated', { provider: result.provider, free: result.free });
      return result;
    }
  }
  return null;
}

// ── Intake-specific wrapper ───────────────────────────────────────────
export async function generateIntakeCard(
  context: string,
  haves: string[] = [],
  wants: string[] = []
): Promise<AIResponse> {
  const situationText = [
    haves.length > 0 ? `What they have: ${haves.join(', ')}.` : '',
    wants.length > 0 ? `What they want: ${wants.join(', ')}.` : '',
    context ? `Their situation: ${context}` : '',
  ].filter(Boolean).join('\n');

  const systemPrompt = `You are Nova — a practical advisor who gives specific, honest next moves to real people in real situations. Not business school advice. Real moves for real people.

The person may be anyone: a creator, a hobbyist, an expert who doesn't charge enough, a community leader, a service worker, a person with a specific problem.

Generate a personal Decision Card with exactly these sections:

WHAT YOU'RE ACTUALLY DEALING WITH:
One honest sentence.

YOUR NEXT 3 MOVES (in order):
Numbered. Specific. Each one is doable TODAY or THIS WEEK.

WHAT TO SAY (if needed):
A script or message template. Fill brackets with their specifics.

DON'T OVERLOOK THIS:
2 things specific to their situation that most people miss.

START HERE — TODAY:
One action they can take in the next hour.

Keep it tight. Keep it real. Use their actual details. No padding.`;

  const aiReq: AIRequest = {
    system: systemPrompt,
    user:   situationText || 'Someone who needs a next move.',
    maxTokens: 700,
    temperature: 0.75,
  };

  // Try AI providers first
  const providers = [callGemini, callGroq];
  if (process.env.ANTHROPIC_API_KEY) providers.push(callClaude);
  if (process.env.OPENAI_API_KEY)    providers.push(callOpenAI as any);

  for (const provider of providers) {
    const result = await provider(aiReq);
    if (result) return result;
  }

  // Deterministic fallback using the richer context
  const content = deterministicCard(context, haves, wants);
  return { content, provider: 'deterministic', free: true };
}
