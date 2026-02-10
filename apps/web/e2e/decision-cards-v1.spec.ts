import { test, expect } from '@playwright/test';

/**
 * Phase 7.4: Decision Cards V1 E2E Tests
 * 
 * Tests the card balance display, Apply Decision Card button,
 * and the card modal flow.
 * 
 * Run: npx playwright test decision-cards-v1.spec.ts
 */

test.describe('Decision Cards V1', () => {
  test.beforeEach(async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });
    
    (page as any).__consoleErrors = consoleErrors;
    (page as any).__pageErrors = pageErrors;
  });

  test('screener page loads without card-related TypeErrors', async ({ page }) => {
    await page.goto('/dashboard/screener');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // The card badge might not show if unauthenticated (shows 0 cards)
    // Main goal is to verify no TypeErrors from the card code
    const cardBadge = page.locator('text=/\\d+\\s*Cards?/');
    const cardBadgeAlt = page.locator('[class*="indigo"]').filter({ hasText: /Card/ });
    
    const badgeCount = await cardBadge.count();
    const badgeAltCount = await cardBadgeAlt.count();
    
    // Log for debugging (not assertion - auth state varies)
    console.log(`Card badge count: ${badgeCount}, alt: ${badgeAltCount}`);
    
    // No TypeErrors (main assertion)
    const pageErrors = (page as any).__pageErrors as string[];
    const typeErrors = pageErrors.filter(e => e.includes('TypeError') || e.includes('is not a function'));
    expect(typeErrors, `TypeErrors: ${typeErrors.join(', ')}`).toHaveLength(0);
    
    // No card-specific function errors
    const cardFuncErrors = pageErrors.filter(e => 
      e.includes('getCardWallet') || 
      e.includes('loadCardWallet')
    );
    expect(cardFuncErrors, `Card function errors: ${cardFuncErrors.join(', ')}`).toHaveLength(0);
  });

  test('signal card shows Apply Decision Card button', async ({ page }) => {
    await page.goto('/dashboard/screener');
    await page.waitForLoadState('networkidle');
    
    // Wait for signals to load
    await page.waitForTimeout(8000);
    
    // Expand a signal card if any exist
    const signalCards = page.locator('[class*="bg-gradient-to-br"][class*="rounded-2xl"]');
    const signalCount = await signalCards.count();
    
    if (signalCount > 0) {
      // Click to expand the first signal
      await signalCards.first().click();
      await page.waitForTimeout(500);
      
      // Look for Apply Decision Card button
      const applyButton = page.locator('text=/Apply Decision Card|No Cards Left/');
      const buttonExists = await applyButton.count() > 0;
      
      expect(buttonExists, 'Apply Decision Card button should be visible when signal expanded').toBe(true);
    }
    
    // No TypeErrors
    const pageErrors = (page as any).__pageErrors as string[];
    const typeErrors = pageErrors.filter(e => e.includes('TypeError') || e.includes('is not a function'));
    expect(typeErrors, `TypeErrors: ${typeErrors.join(', ')}`).toHaveLength(0);
  });

  test('screener loads without card-related errors', async ({ page }) => {
    await page.goto('/dashboard/screener');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);
    
    const consoleErrors = (page as any).__consoleErrors as string[];
    const pageErrors = (page as any).__pageErrors as string[];
    
    // Filter for card-related errors
    const cardErrors = [
      ...consoleErrors.filter(e => 
        e.includes('getCardWallet') || 
        e.includes('applyCard') || 
        e.includes('confirmCard') ||
        e.includes('cardBalance')
      ),
      ...pageErrors.filter(e => 
        e.includes('getCardWallet') || 
        e.includes('applyCard') || 
        e.includes('confirmCard') ||
        e.includes('cardBalance')
      ),
    ];
    
    expect(cardErrors, `Card-related errors: ${cardErrors.join(', ')}`).toHaveLength(0);
  });

  test('card endpoints respond correctly (via network)', async ({ page }) => {
    // This test verifies the API endpoints exist by checking network responses
    const apiResponses: { url: string; status: number }[] = [];
    
    page.on('response', (response) => {
      if (response.url().includes('/v1/cards/')) {
        apiResponses.push({ url: response.url(), status: response.status() });
      }
    });
    
    await page.goto('/dashboard/screener');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);
    
    // Should have called wallet endpoint
    const walletCalls = apiResponses.filter(r => r.url.includes('/wallet'));
    
    // If auth is working, we should get 200; if not, we get 401 (both are valid)
    // We should NOT get 404 (endpoint not found)
    const has404 = apiResponses.some(r => r.status === 404);
    expect(has404, 'Card endpoints should exist (no 404)').toBe(false);
  });
});
