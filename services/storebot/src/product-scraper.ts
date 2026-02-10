/**
 * Product Scraper - Real web scraping for product appraisal
 * Fetches actual pricing data from various e-commerce sources
 */

import { createLogger } from '@nova/telemetry';

const logger = createLogger('product-scraper');

// Rate limiter to be respectful to websites
class RateLimiter {
  private requests: number[] = [];
  constructor(private maxRequests: number, private windowMs: number) {}

  async acquire(): Promise<boolean> {
    const now = Date.now();
    this.requests = this.requests.filter(t => now - t < this.windowMs);
    if (this.requests.length >= this.maxRequests) return false;
    this.requests.push(now);
    return true;
  }
}

const rateLimiter = new RateLimiter(5, 60000); // 5 requests per minute

// ============================================================================
// Types
// ============================================================================

export interface ScrapedProduct {
  title: string;
  price: number;
  currency: string;
  source: string;
  url: string;
  imageUrl?: string;
  rating?: number;
  reviewCount?: number;
  availability?: string;
  seller?: string;
  condition?: 'new' | 'used' | 'refurbished';
  scrapedAt: string;
}

export interface ProductAppraisal {
  query: string;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  medianPrice: number;
  priceRange: string;
  recommendedPrice: number;
  marketDemand: 'low' | 'medium' | 'high';
  confidence: number;
  sources: ScrapedProduct[];
  appraisedAt: string;
}

export interface ProductSearchResult {
  products: ScrapedProduct[];
  totalFound: number;
  searchedAt: string;
}

// ============================================================================
// Web Scraping Functions (using public APIs and RSS feeds)
// ============================================================================

/**
 * Search eBay completed listings for price data
 * Uses eBay's browse API (requires API key) or public RSS feeds
 */
async function searchEbay(query: string): Promise<ScrapedProduct[]> {
  const canProceed = await rateLimiter.acquire();
  if (!canProceed) {
    logger.warn('Rate limit exceeded for eBay');
    return [];
  }

  try {
    // Try eBay RSS feed (no API key needed)
    const encodedQuery = encodeURIComponent(query);
    const rssUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodedQuery}&_rss=1`;
    
    const response = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      logger.warn(`eBay RSS error: ${response.status}`);
      return [];
    }

    const text = await response.text();
    
    // Parse RSS XML to extract products
    const products: ScrapedProduct[] = [];
    const itemRegex = /<item>[\s\S]*?<title><!\[CDATA\[(.*?)\]\]><\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<\/item>/g;
    let match;
    
    while ((match = itemRegex.exec(text)) !== null && products.length < 10) {
      const title = match[1];
      const link = match[2];
      
      // Extract price from title if present (e.g., "Product Name - $29.99")
      const priceMatch = title.match(/\$(\d+(?:\.\d{2})?)/);
      const price = priceMatch ? parseFloat(priceMatch[1]) : 0;
      
      if (price > 0) {
        products.push({
          title: title.replace(/\s*-\s*\$[\d.]+$/, '').trim(),
          price,
          currency: 'USD',
          source: 'ebay',
          url: link,
          condition: title.toLowerCase().includes('used') ? 'used' : 'new',
          scrapedAt: new Date().toISOString(),
        });
      }
    }
    
    return products;
  } catch (error) {
    logger.error('eBay scraping failed', error as Error);
    return [];
  }
}

/**
 * Search using Google Shopping results (via RSS/API)
 * Falls back to generating reasonable estimates based on product type
 */
async function searchGoogleShopping(query: string): Promise<ScrapedProduct[]> {
  const canProceed = await rateLimiter.acquire();
  if (!canProceed) {
    return [];
  }

  // Google Shopping does not provide a public free API.
  // To avoid mock data, return empty unless a real integration is configured.
  logger.warn('Google Shopping search unavailable (no API integration configured)', { query });
  return [];
}

/**
 * Search PriceGrabber/similar price comparison sites
 */
async function searchPriceComparison(query: string): Promise<ScrapedProduct[]> {
  // Price comparison sites typically require API access
  // Return empty for now - could integrate with Keepa, CamelCamelCamel, etc.
  return [];
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Search multiple sources for product pricing
 */
export async function searchProducts(query: string): Promise<ProductSearchResult> {
  logger.info(`Searching products: ${query}`);
  
  // Search multiple sources in parallel
  const [ebayResults, googleResults] = await Promise.all([
    searchEbay(query),
    searchGoogleShopping(query),
  ]);
  
  const allProducts = [...ebayResults, ...googleResults];
  
  return {
    products: allProducts,
    totalFound: allProducts.length,
    searchedAt: new Date().toISOString(),
  };
}

// ============================================================================
// Heuristic Pricing (Keyless Mode)
// ============================================================================

/**
 * Category-based heuristic pricing when no comps available
 */
function detectCategory(query: string): { category: string; basePrice: number; variance: number } {
  const q = query.toLowerCase();
  
  // Electronics
  if (/iphone|samsung|pixel|android|phone|mobile/.test(q)) {
    return { category: 'smartphones', basePrice: 450, variance: 0.4 };
  }
  if (/macbook|laptop|chromebook|thinkpad|notebook/.test(q)) {
    return { category: 'laptops', basePrice: 800, variance: 0.5 };
  }
  if (/ipad|tablet|surface/.test(q)) {
    return { category: 'tablets', basePrice: 400, variance: 0.4 };
  }
  if (/airpods|earbuds|headphones|speaker/.test(q)) {
    return { category: 'audio', basePrice: 120, variance: 0.6 };
  }
  if (/tv|television|monitor|display/.test(q)) {
    return { category: 'displays', basePrice: 350, variance: 0.5 };
  }
  if (/playstation|xbox|nintendo|console|gaming/.test(q)) {
    return { category: 'gaming', basePrice: 350, variance: 0.4 };
  }
  if (/camera|canon|nikon|sony|gopro|dslr/.test(q)) {
    return { category: 'cameras', basePrice: 500, variance: 0.6 };
  }
  
  // Fashion
  if (/nike|adidas|jordan|sneaker|shoe/.test(q)) {
    return { category: 'sneakers', basePrice: 120, variance: 0.5 };
  }
  if (/jacket|coat|hoodie|sweater/.test(q)) {
    return { category: 'outerwear', basePrice: 80, variance: 0.5 };
  }
  if (/watch|rolex|omega|seiko|casio/.test(q)) {
    return { category: 'watches', basePrice: 200, variance: 0.8 };
  }
  if (/bag|purse|backpack|handbag/.test(q)) {
    return { category: 'bags', basePrice: 60, variance: 0.6 };
  }
  
  // Home
  if (/furniture|chair|desk|table|sofa|couch/.test(q)) {
    return { category: 'furniture', basePrice: 200, variance: 0.7 };
  }
  if (/kitchen|blender|mixer|appliance|instant pot/.test(q)) {
    return { category: 'kitchen', basePrice: 80, variance: 0.5 };
  }
  
  // Collectibles
  if (/pokemon|card|yugioh|trading|collectible/.test(q)) {
    return { category: 'collectibles', basePrice: 25, variance: 0.9 };
  }
  if (/lego|toy|figure|action/.test(q)) {
    return { category: 'toys', basePrice: 40, variance: 0.6 };
  }
  
  // Default
  return { category: 'general', basePrice: 50, variance: 0.5 };
}

/**
 * Generate heuristic-based appraisal when no real data available
 */
function generateHeuristicAppraisal(query: string): ProductAppraisal {
  const { category, basePrice, variance } = detectCategory(query);
  
  // Generate price range based on category
  const minPrice = Math.round(basePrice * (1 - variance) * 100) / 100;
  const maxPrice = Math.round(basePrice * (1 + variance) * 100) / 100;
  const avgPrice = Math.round(basePrice * 100) / 100;
  const medianPrice = avgPrice;
  const recommendedPrice = Math.round(basePrice * 0.9 * 100) / 100; // 10% below average
  
  return {
    query,
    avgPrice,
    minPrice,
    maxPrice,
    medianPrice,
    priceRange: `$${minPrice.toFixed(2)} - $${maxPrice.toFixed(2)}`,
    recommendedPrice,
    marketDemand: 'medium',
    confidence: 25, // Low confidence for heuristic
    sources: [], // No real sources
    appraisedAt: new Date().toISOString(),
    // Phase 7: Additional provenance fields
    provenance: {
      method: 'heuristic',
      category,
      note: 'No comparable listings found; estimate based on category heuristics',
    },
  } as ProductAppraisal & { provenance: { method: string; category: string; note: string } };
}

/**
 * Appraise a product by analyzing pricing across multiple sources
 * Phase 7: NEVER returns unavailable - falls back to heuristics
 */
export async function appraiseProduct(query: string): Promise<ProductAppraisal> {
  logger.info(`Appraising product: ${query}`);
  
  const searchResult = await searchProducts(query);
  const products = searchResult.products;
  
  // Phase 7: If no comps found, use heuristic pricing instead of throwing error
  if (products.length === 0) {
    logger.warn(`No comps found for "${query}", using heuristic pricing`);
    return generateHeuristicAppraisal(query);
  }
  
  // Calculate statistics
  const prices = products.map(p => p.price).sort((a, b) => a - b);
  const minPrice = prices[0];
  const maxPrice = prices[prices.length - 1];
  const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
  const medianPrice = prices[Math.floor(prices.length / 2)];
  
  // Determine market demand based on number of listings and price variance
  const priceVariance = (maxPrice - minPrice) / avgPrice;
  let marketDemand: 'low' | 'medium' | 'high' = 'medium';
  if (products.length > 15 && priceVariance < 0.3) {
    marketDemand = 'high';
  } else if (products.length < 5 || priceVariance > 0.5) {
    marketDemand = 'low';
  }
  
  // Calculate recommended price (competitive but profitable)
  // Slightly below median to be competitive
  const recommendedPrice = Math.round(medianPrice * 0.95 * 100) / 100;
  
  // Confidence based on data quality
  const confidence = Math.min(100, products.length * 10 + (1 - priceVariance) * 30);
  
  return {
    query,
    avgPrice: Math.round(avgPrice * 100) / 100,
    minPrice: Math.round(minPrice * 100) / 100,
    maxPrice: Math.round(maxPrice * 100) / 100,
    medianPrice: Math.round(medianPrice * 100) / 100,
    priceRange: `$${minPrice.toFixed(2)} - $${maxPrice.toFixed(2)}`,
    recommendedPrice,
    marketDemand,
    confidence: Math.round(confidence),
    sources: products.slice(0, 10), // Top 10 sources
    appraisedAt: new Date().toISOString(),
    // Phase 7: Provenance for comp-based appraisal
    provenance: {
      method: 'comps',
      sourceCount: products.length,
      note: `Based on ${products.length} comparable listings`,
    },
  } as ProductAppraisal & { provenance: { method: string; sourceCount?: number; note: string } };
}

/**
 * Batch appraise multiple products
 */
export async function batchAppraise(queries: string[]): Promise<ProductAppraisal[]> {
  const results: ProductAppraisal[] = [];
  
  for (const query of queries.slice(0, 10)) { // Limit to 10 products
    const appraisal = await appraiseProduct(query);
    results.push(appraisal);
    
    // Rate limiting between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  return results;
}

export default {
  searchProducts,
  appraiseProduct,
  batchAppraise,
};
