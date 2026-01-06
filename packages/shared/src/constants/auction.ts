// Auction timing constants
export const AUCTION_DEFAULTS = {
  /** Default auction duration in seconds */
  DURATION: 60,
  /** Minimum auction duration in seconds */
  MIN_DURATION: 30,
  /** Maximum auction duration in seconds */
  MAX_DURATION: 300,
  /** Default minimum bid increment */
  MIN_INCREMENT: 10,
  /** Anti-snipe threshold in milliseconds (triggers extension if bid placed within this time) */
  ANTI_SNIPE_THRESHOLD_MS: 30_000,
  /** Anti-snipe extension time in milliseconds */
  ANTI_SNIPE_EXTENSION_MS: 30_000,
  /** Countdown tick interval in milliseconds */
  TICK_INTERVAL_MS: 1000,
  /** Time before end to show "ending soon" warning */
  ENDING_WARNING_MS: 10_000,
} as const;

// Quick bid amounts for UI
export const QUICK_BID_INCREMENTS = [100, 500, 1000, 5000] as const;

// Maximum bid to prevent accidents
export const MAX_BID_AMOUNT = 999_999_999;
