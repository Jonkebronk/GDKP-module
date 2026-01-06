/**
 * Format a gold amount for display
 * @param amount - Gold amount as number
 * @param options - Formatting options
 */
export function formatGold(
  amount: number,
  options: { abbreviated?: boolean; showSign?: boolean } = {}
): string {
  const { abbreviated = false, showSign = false } = options;

  const sign = showSign && amount > 0 ? '+' : '';
  const absAmount = Math.abs(amount);

  if (abbreviated && absAmount >= 1_000_000) {
    return `${sign}${(amount / 1_000_000).toFixed(1)}M g`;
  }

  if (abbreviated && absAmount >= 1_000) {
    return `${sign}${(amount / 1_000).toFixed(1)}K g`;
  }

  return `${sign}${amount.toLocaleString()} g`;
}

/**
 * Parse a gold amount string to number
 * Supports formats like "1000", "1,000", "1k", "1.5m"
 */
export function parseGold(input: string): number | null {
  const cleaned = input.trim().toLowerCase().replace(/[,\s]/g, '').replace(/g$/, '');

  // Handle K/M suffixes
  const multipliers: Record<string, number> = { k: 1_000, m: 1_000_000 };
  const match = cleaned.match(/^(\d+(?:\.\d+)?)(k|m)?$/);

  if (!match) return null;

  const [, num, suffix] = match;
  const value = parseFloat(num) * (multipliers[suffix] || 1);

  return Number.isFinite(value) ? Math.floor(value) : null;
}

/**
 * Format a gold amount as currency with exchange rate
 */
export function goldToCurrency(
  goldAmount: number,
  exchangeRate: number,
  currency: string = 'EUR'
): string {
  const realAmount = goldAmount / exchangeRate;
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(realAmount);
}

/**
 * Format currency amount to gold
 */
export function currencyToGold(
  realAmount: number,
  exchangeRate: number
): number {
  return Math.floor(realAmount * exchangeRate);
}
