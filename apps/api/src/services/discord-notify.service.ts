import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

interface PaymentConfirmedData {
  discordUsername: string;
  goldAmount: number;
  amountUsd: string;
  cryptoCurrency?: string;
  transactionHash?: string;
}

interface PaymentFailedData {
  discordUsername: string;
  goldAmount: number;
  reason?: string;
}

interface WithdrawalRequestedData {
  discordUsername: string;
  goldAmount: number;
  amountUsd: number;
  walletAddress: string;
  userId: string;
}

interface WithdrawalDeliveredData {
  discordUsername: string;
  goldAmount: number;
  deliveredBy: string;
  transactionHash?: string;
}

/**
 * Send Discord embed notification via webhook
 */
async function sendDiscordEmbed(embed: object): Promise<void> {
  if (!env.DISCORD_WEBHOOK_URL) {
    logger.warn('Discord webhook URL not configured, skipping notification');
    return;
  }

  try {
    const response = await fetch(env.DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });

    if (!response.ok) {
      logger.error({ status: response.status }, 'Discord notification failed');
    }
  } catch (error) {
    logger.error({ error }, 'Discord notification error');
  }
}

/**
 * Notify when a deposit payment is confirmed
 */
export async function sendPaymentConfirmed(data: PaymentConfirmedData): Promise<void> {
  const embed = {
    title: '💰 Ny insättning bekräftad!',
    color: 0x00ff00, // Green
    fields: [
      { name: 'Discord', value: data.discordUsername || 'Okänd', inline: true },
      { name: 'Guld', value: `${data.goldAmount.toLocaleString()}g`, inline: true },
      { name: 'Belopp', value: `$${data.amountUsd}`, inline: true },
      ...(data.cryptoCurrency
        ? [{ name: 'Crypto', value: data.cryptoCurrency, inline: true }]
        : []),
      ...(data.transactionHash
        ? [{ name: 'TX Hash', value: `\`${data.transactionHash.slice(0, 16)}...\``, inline: false }]
        : []),
    ],
    footer: { text: 'GDKP Platform' },
    timestamp: new Date().toISOString(),
  };

  await sendDiscordEmbed(embed);
}

/**
 * Notify when a deposit payment fails
 */
export async function sendPaymentFailed(data: PaymentFailedData): Promise<void> {
  const embed = {
    title: '❌ Betalning misslyckades',
    color: 0xff0000, // Red
    fields: [
      { name: 'Discord', value: data.discordUsername || 'Okänd', inline: true },
      { name: 'Guld', value: `${data.goldAmount.toLocaleString()}g`, inline: true },
      ...(data.reason ? [{ name: 'Anledning', value: data.reason, inline: false }] : []),
    ],
    footer: { text: 'GDKP Platform' },
    timestamp: new Date().toISOString(),
  };

  await sendDiscordEmbed(embed);
}

/**
 * Notify admins when a withdrawal is requested
 */
export async function sendWithdrawalRequested(data: WithdrawalRequestedData): Promise<void> {
  const embed = {
    title: '📤 Ny uttagsbegäran!',
    color: 0xffa500, // Orange
    fields: [
      { name: 'Discord', value: data.discordUsername || 'Okänd', inline: true },
      { name: 'Guld', value: `${data.goldAmount.toLocaleString()}g`, inline: true },
      { name: 'USD Värde', value: `$${data.amountUsd.toFixed(2)}`, inline: true },
      { name: 'Wallet-adress', value: `\`${data.walletAddress}\``, inline: false },
      { name: 'User ID', value: `\`${data.userId}\``, inline: false },
    ],
    footer: { text: 'Väntar på manuell utbetalning' },
    timestamp: new Date().toISOString(),
  };

  await sendDiscordEmbed(embed);
}

/**
 * Notify when a withdrawal is delivered
 */
export async function sendWithdrawalDelivered(data: WithdrawalDeliveredData): Promise<void> {
  const embed = {
    title: '✅ Uttag levererat!',
    color: 0x0099ff, // Blue
    fields: [
      { name: 'Discord', value: data.discordUsername || 'Okänd', inline: true },
      { name: 'Guld', value: `${data.goldAmount.toLocaleString()}g`, inline: true },
      { name: 'Levererat av', value: data.deliveredBy, inline: true },
      ...(data.transactionHash
        ? [{ name: 'TX Hash', value: `\`${data.transactionHash}\``, inline: false }]
        : []),
    ],
    footer: { text: 'GDKP Platform' },
    timestamp: new Date().toISOString(),
  };

  await sendDiscordEmbed(embed);
}
