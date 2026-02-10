import { NextResponse } from 'next/server';
import { api } from '@/lib/api';

/**
 * API Contract Verification Endpoint
 * Returns the list of required API methods and their existence status.
 * Used by verify:prod to detect method drift before users hit it.
 * 
 * GET /api/contract
 */

// Critical methods that MUST exist on the API client
const REQUIRED_METHODS = [
  'runScreener',
  'runAIScreener',
  'getDecisionCards',
  'getAlpacaHistory',
  'getAlpacaStatus',
  'getAlpacaAccount',
  'getPaperTrades',
  'createPaperTrade',
  'getUsage',
  'startGuidedFlow',
  'createThesis',
  'generateThesis',
  'getMarketQuote',
  'saveScreenerReport',
] as const;

export async function GET() {
  const results: Record<string, boolean> = {};
  const missing: string[] = [];
  
  for (const method of REQUIRED_METHODS) {
    const exists = typeof (api as any)[method] === 'function';
    results[method] = exists;
    if (!exists) {
      missing.push(method);
    }
  }
  
  const allPresent = missing.length === 0;
  
  return NextResponse.json({
    success: allPresent,
    contract: {
      required: REQUIRED_METHODS.length,
      present: REQUIRED_METHODS.length - missing.length,
      missing,
    },
    methods: results,
    error: allPresent ? null : `Missing methods: ${missing.join(', ')}`,
  });
}
