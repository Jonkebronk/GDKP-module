import { MAX_BID_AMOUNT, AUCTION_DEFAULTS } from '../constants/auction';

/**
 * Validate bid amount
 */
export function isValidBidAmount(
  amount: number,
  currentBid: number,
  minIncrement: number
): { valid: boolean; error?: string; minRequired?: number } {
  if (!Number.isInteger(amount) || amount <= 0) {
    return { valid: false, error: 'Bid must be a positive integer' };
  }

  if (amount > MAX_BID_AMOUNT) {
    return { valid: false, error: `Bid exceeds maximum of ${MAX_BID_AMOUNT}` };
  }

  const minRequired = currentBid + minIncrement;
  if (amount < minRequired) {
    return { valid: false, error: `Bid must be at least ${minRequired}`, minRequired };
  }

  return { valid: true };
}

/**
 * Validate auction duration
 */
export function isValidAuctionDuration(seconds: number): boolean {
  return (
    Number.isInteger(seconds) &&
    seconds >= AUCTION_DEFAULTS.MIN_DURATION &&
    seconds <= AUCTION_DEFAULTS.MAX_DURATION
  );
}

/**
 * Validate Discord username format
 */
export function isValidDiscordUsername(username: string): boolean {
  // Discord usernames are 2-32 characters
  return username.length >= 2 && username.length <= 32;
}

/**
 * Validate PayPal email (basic validation)
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate raid name
 */
export function isValidRaidName(name: string): boolean {
  return name.length >= 3 && name.length <= 100;
}

/**
 * Sanitize user input for chat messages
 */
export function sanitizeChatMessage(message: string): string {
  return message
    .trim()
    .slice(0, 500) // Max 500 characters
    .replace(/[<>]/g, ''); // Remove potential HTML
}

/**
 * Generate a short ID for display purposes
 */
export function shortId(uuid: string): string {
  return uuid.slice(0, 8);
}
