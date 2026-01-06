import cron from 'node-cron';
import { prisma } from '../config/database.js';
import { logger } from '../config/logger.js';
import { fetchAllG2GPrices, closeBrowser } from '../services/g2g-scraper.service.js';

// Default rates as fallback
const DEFAULT_RATES = {
  SEK: 4.5,   // ~4.5 gold per 1 SEK
  EUR: 45,    // ~45 gold per 1 EUR
  USD: 40,    // ~40 gold per 1 USD
};

let isRunning = false;

/**
 * Update exchange rates from G2G
 */
async function updateExchangeRates(): Promise<void> {
  if (isRunning) {
    logger.warn('Exchange rate update already in progress, skipping');
    return;
  }

  isRunning = true;
  logger.info('Starting exchange rate update from G2G');

  try {
    // Fetch prices from G2G
    const prices = await fetchAllG2GPrices();

    // Build new rates object
    const newRates: Record<string, number> = {};
    let hasValidRate = false;

    if (prices.SEK && prices.SEK.goldPerUnit > 0) {
      newRates.SEK = prices.SEK.goldPerUnit;
      hasValidRate = true;
    }
    if (prices.EUR && prices.EUR.goldPerUnit > 0) {
      newRates.EUR = prices.EUR.goldPerUnit;
      hasValidRate = true;
    }
    if (prices.USD && prices.USD.goldPerUnit > 0) {
      newRates.USD = prices.USD.goldPerUnit;
      hasValidRate = true;
    }

    if (!hasValidRate) {
      logger.warn('No valid rates fetched from G2G, keeping existing rates');
      return;
    }

    // Get current rates to fill in any missing values
    const currentConfig = await prisma.config.findUnique({
      where: { key: 'exchange_rates' },
    });

    const currentRates = (currentConfig?.value as Record<string, number>) || DEFAULT_RATES;

    // Merge: use new rates where available, keep old rates for missing currencies
    const finalRates = {
      SEK: newRates.SEK || currentRates.SEK || DEFAULT_RATES.SEK,
      EUR: newRates.EUR || currentRates.EUR || DEFAULT_RATES.EUR,
      USD: newRates.USD || currentRates.USD || DEFAULT_RATES.USD,
      updated_at: new Date().toISOString(),
      source: 'g2g',
      raw_prices: {
        SEK: prices.SEK?.pricePerGold,
        EUR: prices.EUR?.pricePerGold,
        USD: prices.USD?.pricePerGold,
      },
    };

    // Update database
    await prisma.config.upsert({
      where: { key: 'exchange_rates' },
      update: {
        value: finalRates,
      },
      create: {
        key: 'exchange_rates',
        value: finalRates,
      },
    });

    logger.info(
      {
        SEK: finalRates.SEK,
        EUR: finalRates.EUR,
        USD: finalRates.USD,
      },
      'Exchange rates updated from G2G'
    );
  } catch (error) {
    logger.error({ error }, 'Failed to update exchange rates');
  } finally {
    isRunning = false;
  }
}

/**
 * Start the exchange rate update cron job
 * Runs every 15 minutes
 */
export function startExchangeRateJob(): void {
  // Schedule: every 15 minutes
  cron.schedule('*/15 * * * *', () => {
    updateExchangeRates().catch((error) => {
      logger.error({ error }, 'Exchange rate job failed');
    });
  });

  logger.info('Exchange rate job scheduled (every 15 minutes)');

  // Run immediately on startup
  updateExchangeRates().catch((error) => {
    logger.error({ error }, 'Initial exchange rate update failed');
  });
}

/**
 * Stop the job and cleanup (for graceful shutdown)
 */
export async function stopExchangeRateJob(): Promise<void> {
  await closeBrowser();
  logger.info('Exchange rate job stopped');
}

/**
 * Manually trigger an exchange rate update (for admin use)
 */
export async function triggerExchangeRateUpdate(): Promise<void> {
  await updateExchangeRates();
}
