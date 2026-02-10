import { test, expect } from '@playwright/test';

/**
 * Production UI Smoke Tests - Screener
 * These tests verify that critical UI flows work without console errors.
 * 
 * Run: npx playwright test
 * Or: npm run test:e2e
 */

test.describe('AI Screener', () => {
  test.beforeEach(async ({ page }) => {
    // Collect console errors
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    // Collect page errors (uncaught exceptions)
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });
    
    // Store for later assertions
    (page as any).__consoleErrors = consoleErrors;
    (page as any).__pageErrors = pageErrors;
  });

  test('screener page loads without TypeError', async ({ page }) => {
    // Navigate to screener
    await page.goto('/dashboard/screener');
    
    // Wait for page to stabilize
    await page.waitForLoadState('networkidle');
    
    // Wait a bit for any async errors
    await page.waitForTimeout(3000);
    
    // Get collected errors
    const consoleErrors = (page as any).__consoleErrors as string[];
    const pageErrors = (page as any).__pageErrors as string[];
    
    // Filter for TypeError (the specific "is not a function" errors)
    const typeErrors = [
      ...consoleErrors.filter(e => e.includes('TypeError') || e.includes('is not a function')),
      ...pageErrors.filter(e => e.includes('TypeError') || e.includes('is not a function')),
    ];
    
    // FAIL if any TypeError found
    expect(typeErrors, `TypeErrors found in console: ${typeErrors.join(', ')}`).toHaveLength(0);
  });

  test('screener renders results or typed error message', async ({ page }) => {
    await page.goto('/dashboard/screener');
    await page.waitForLoadState('networkidle');
    
    // Wait for scan to complete (scanning indicator disappears or results appear)
    // The page auto-scans on load
    await page.waitForTimeout(5000);
    
    // Check for either:
    // 1. Signal cards rendered (success)
    // 2. A typed error message (expected failure, not TypeError)
    // 3. "No signals found" message
    
    const hasSignals = await page.locator('[class*="signal"]').count() > 0;
    const hasErrorMessage = await page.locator('text=/failed|error|unavailable/i').count() > 0;
    const hasNoSignals = await page.locator('text=/no signals|0 signals/i').count() > 0;
    
    // At least one of these should be true
    const hasValidState = hasSignals || hasErrorMessage || hasNoSignals;
    expect(hasValidState, 'Screener should show signals, error message, or no signals state').toBe(true);
    
    // Get page errors
    const pageErrors = (page as any).__pageErrors as string[];
    const typeErrors = pageErrors.filter(e => e.includes('is not a function'));
    expect(typeErrors, `Runtime TypeError: ${typeErrors.join(', ')}`).toHaveLength(0);
  });

  test('decision cards page loads without errors', async ({ page }) => {
    await page.goto('/dashboard/decision-cards');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    const pageErrors = (page as any).__pageErrors as string[];
    const typeErrors = pageErrors.filter(e => 
      e.includes('is not a function') || 
      e.includes('getDecisionCards')
    );
    
    expect(typeErrors, `Decision cards TypeError: ${typeErrors.join(', ')}`).toHaveLength(0);
  });

  test('analytics page loads without getAlpacaHistory errors', async ({ page }) => {
    await page.goto('/dashboard/analytics');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    const pageErrors = (page as any).__pageErrors as string[];
    const typeErrors = pageErrors.filter(e => 
      e.includes('is not a function') || 
      e.includes('getAlpacaHistory')
    );
    
    expect(typeErrors, `Analytics TypeError: ${typeErrors.join(', ')}`).toHaveLength(0);
  });

  test('dashboard home loads and calls runScreener without error', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    const pageErrors = (page as any).__pageErrors as string[];
    const typeErrors = pageErrors.filter(e => 
      e.includes('is not a function') || 
      e.includes('runScreener')
    );
    
    expect(typeErrors, `Dashboard TypeError: ${typeErrors.join(', ')}`).toHaveLength(0);
  });
});
