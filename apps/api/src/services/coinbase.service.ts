import crypto from 'crypto';
import { env } from '../config/env.js';

const COINBASE_API_URL = 'https://api.commerce.coinbase.com';

export interface CreateChargeParams {
  userId: string;
  discordUsername: string;
  goldAmount: number;
  priceUsd: number;
  description?: string;
}

export interface CoinbaseCharge {
  id: string;
  code: string;
  hosted_url: string;
  pricing: {
    local: {
      amount: string;
      currency: string;
    };
  };
}

export interface CoinbaseChargeResponse {
  data: CoinbaseCharge;
}

/**
 * Create a Coinbase Commerce charge for gold purchase
 */
export async function createCharge({
  userId,
  discordUsername,
  goldAmount,
  priceUsd,
  description,
}: CreateChargeParams): Promise<CoinbaseChargeResponse> {
  const response = await fetch(`${COINBASE_API_URL}/charges`, {
    method: 'POST',
    headers: {
      'X-CC-Api-Key': env.COINBASE_API_KEY,
      'X-CC-Version': '2018-03-22',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: `${goldAmount.toLocaleString()}g - GDKP Platform`,
      description: description || `Gold purchase for GDKP auctions`,
      pricing_type: 'fixed_price',
      local_price: {
        amount: priceUsd.toFixed(2),
        currency: 'USD',
      },
      metadata: {
        user_id: userId,
        discord_username: discordUsername,
        gold_amount: goldAmount.toString(),
      },
      redirect_url: `${env.FRONTEND_URL}/wallet?status=success`,
      cancel_url: `${env.FRONTEND_URL}/wallet?status=cancelled`,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to create Coinbase charge');
  }

  return response.json();
}

/**
 * Verify Coinbase webhook signature
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string
): boolean {
  try {
    const hmac = crypto.createHmac('sha256', env.COINBASE_WEBHOOK_SECRET);
    hmac.update(payload);
    const computedSignature = hmac.digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(computedSignature)
    );
  } catch {
    return false;
  }
}

/**
 * Parse Coinbase webhook event
 */
export interface CoinbaseWebhookEvent {
  id: string;
  type: string;
  data: {
    id: string;
    code: string;
    metadata: {
      user_id: string;
      discord_username: string;
      gold_amount: string;
    };
    payments?: Array<{
      transaction_id: string;
      network: string;
      value: {
        local: {
          amount: string;
          currency: string;
        };
        crypto: {
          amount: string;
          currency: string;
        };
      };
    }>;
    pricing: {
      local: {
        amount: string;
        currency: string;
      };
    };
  };
}

export function parseWebhookEvent(payload: string): CoinbaseWebhookEvent {
  return JSON.parse(payload);
}
