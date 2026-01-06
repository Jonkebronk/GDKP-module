import puppeteer, { Browser } from 'puppeteer';
import { logger } from '../config/logger.js';

export interface G2GPrice {
  pricePerGold: number;
  goldPerUnit: number;
  currency: string;
  lowestSeller: string;
  fetchedAt: Date;
}

// G2G server ID for Spineshatter EU (Anniversary) - Alliance
const SERVER_ID = '30389';
const FACTION = 'alliance';

// Currency codes to G2G currency parameter mapping
const CURRENCY_MAP: Record<string, string> = {
  SEK: 'SEK',
  EUR: 'EUR',
  USD: 'USD',
};

let browserInstance: Browser | null = null;

/**
 * Get or create a browser instance (reuse for efficiency)
 */
async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.connected) {
    browserInstance = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process',
      ],
    });
  }
  return browserInstance;
}

/**
 * Close the browser instance (call on shutdown)
 */
export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

/**
 * Fetch the lowest gold price from G2G for a specific currency
 */
export async function fetchG2GPrice(currency: 'SEK' | 'EUR' | 'USD'): Promise<G2GPrice | null> {
  const currencyParam = CURRENCY_MAP[currency];
  const url = `https://www.g2g.com/categories/wow-classic-era-gold?server=${SERVER_ID}&faction=${FACTION}&sort=lowest_price&currency=${currencyParam}`;

  logger.info({ currency, url }, 'Fetching G2G price');

  let browser: Browser | null = null;
  let page = null;

  try {
    browser = await getBrowser();
    page = await browser.newPage();

    // Set a reasonable viewport and user agent
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Navigate to page with timeout
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // Wait for seller list to load (adjust selector as needed)
    await page.waitForSelector('[class*="seller"], [class*="offer"], [class*="product"]', {
      timeout: 15000,
    }).catch(() => {
      // Selector might not match exactly, continue anyway
    });

    // Give extra time for JS to render
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Extract price data from the page
    const priceData = await page.evaluate((curr) => {
      // Try multiple strategies to find price
      const results: { price: number; seller: string }[] = [];

      // Strategy 1: Look for price text matching pattern like "0.123456 SEK"
      const priceRegex = new RegExp(`([0-9]+\\.?[0-9]*)\\s*${curr}`, 'i');

      // Get all text nodes and find prices
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null
      );

      let node;
      while ((node = walker.nextNode())) {
        const text = node.textContent?.trim() || '';
        const match = text.match(priceRegex);
        if (match && match[1]) {
          const price = parseFloat(match[1]);
          if (price > 0 && price < 10) { // Reasonable price range for gold
            results.push({ price, seller: 'unknown' });
          }
        }
      }

      // Strategy 2: Look for elements with price-like content
      const priceElements = document.querySelectorAll(
        '[class*="price"], [class*="amount"], [data-price]'
      );
      priceElements.forEach((el) => {
        const text = el.textContent?.trim() || '';
        const match = text.match(priceRegex);
        if (match && match[1]) {
          const price = parseFloat(match[1]);
          if (price > 0 && price < 10) {
            // Try to find seller name nearby
            const parent = el.closest('[class*="seller"], [class*="offer"], [class*="card"], [class*="row"]');
            const sellerEl = parent?.querySelector('[class*="name"], [class*="seller"]');
            const seller = sellerEl?.textContent?.trim() || 'unknown';
            results.push({ price, seller });
          }
        }
      });

      return results;
    }, currency);

    if (priceData.length === 0) {
      logger.warn({ currency }, 'No prices found on G2G page');
      return null;
    }

    // Get the lowest price
    const lowest = priceData.reduce((min, curr) =>
      curr.price < min.price ? curr : min
    );

    const goldPerUnit = 1 / lowest.price;

    const result: G2GPrice = {
      pricePerGold: lowest.price,
      goldPerUnit: Math.round(goldPerUnit * 100) / 100, // Round to 2 decimals
      currency,
      lowestSeller: lowest.seller,
      fetchedAt: new Date(),
    };

    logger.info(
      { currency, pricePerGold: result.pricePerGold, goldPerUnit: result.goldPerUnit },
      'G2G price fetched successfully'
    );

    return result;
  } catch (error) {
    logger.error({ error, currency }, 'Failed to fetch G2G price');
    return null;
  } finally {
    if (page) {
      await page.close().catch(() => {});
    }
  }
}

/**
 * Fetch all currency prices from G2G
 */
export async function fetchAllG2GPrices(): Promise<{
  SEK: G2GPrice | null;
  EUR: G2GPrice | null;
  USD: G2GPrice | null;
}> {
  // Fetch all currencies in sequence (to avoid overwhelming G2G)
  const [sek, eur, usd] = await Promise.all([
    fetchG2GPrice('SEK'),
    // Add delay between requests
    new Promise<G2GPrice | null>((resolve) =>
      setTimeout(async () => resolve(await fetchG2GPrice('EUR')), 2000)
    ),
    new Promise<G2GPrice | null>((resolve) =>
      setTimeout(async () => resolve(await fetchG2GPrice('USD')), 4000)
    ),
  ]);

  return { SEK: sek, EUR: eur, USD: usd };
}
