import { prisma } from '../config/database.js';
import { AppError, ERROR_CODES } from '@gdkp/shared';
import { logger } from '../config/logger.js';
import { nanoid } from 'nanoid';
import { createCharge } from './coinbase.service.js';
import { sendWithdrawalRequested } from './discord-notify.service.js';

interface WalletBalance {
  balance: number;
  locked_amount: number;
  available_balance: number;
  pending_deposits: number;
  pending_withdrawals: number;
}

interface ExchangeRates {
  SEK: number;
  EUR: number;
  USD: number;
  updated_at: string;
}

export class WalletService {
  /**
   * Get wallet balance with locked amounts
   */
  async getBalance(userId: string): Promise<WalletBalance> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { gold_balance: true },
    });

    if (!user) {
      throw new AppError(ERROR_CODES.USER_NOT_FOUND, 'User not found', 404);
    }

    // Get locked amount (winning bids in active auctions)
    const lockedResult = await prisma.bid.aggregate({
      where: {
        user_id: userId,
        is_winning: true,
        item: { status: 'ACTIVE' },
      },
      _sum: { amount: true },
    });

    // Get pending deposits
    const pendingDeposits = await prisma.transaction.count({
      where: {
        user_id: userId,
        type: 'DEPOSIT',
        status: { in: ['PENDING', 'PROCESSING'] },
      },
    });

    // Get pending withdrawals
    const pendingWithdrawals = await prisma.transaction.count({
      where: {
        user_id: userId,
        type: 'WITHDRAWAL',
        status: { in: ['PENDING', 'PROCESSING'] },
      },
    });

    const balance = Number(user.gold_balance);
    const lockedAmount = Number(lockedResult._sum.amount || 0);

    return {
      balance,
      locked_amount: lockedAmount,
      available_balance: balance - lockedAmount,
      pending_deposits: pendingDeposits,
      pending_withdrawals: pendingWithdrawals,
    };
  }

  /**
   * Get exchange rates
   */
  async getExchangeRates(): Promise<ExchangeRates> {
    const config = await prisma.config.findUnique({
      where: { key: 'exchange_rates' },
    });

    if (!config) {
      // Return default rates
      return {
        SEK: 100,
        EUR: 1000,
        USD: 900,
        updated_at: new Date().toISOString(),
      };
    }

    return config.value as ExchangeRates;
  }

  /**
   * Create a deposit via Coinbase Commerce
   */
  async createDeposit(
    userId: string,
    amount: number,
    currency: 'SEK' | 'EUR' | 'USD'
  ) {
    // Get user for Discord username
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { discord_username: true },
    });

    if (!user) {
      throw new AppError(ERROR_CODES.USER_NOT_FOUND, 'User not found', 404);
    }

    const rates = await this.getExchangeRates();
    const exchangeRate = rates[currency];
    const goldAmount = Math.floor(amount * exchangeRate);

    // Convert to USD for Coinbase (they use USD as base)
    const usdAmount = currency === 'USD' ? amount : amount * (rates.USD / rates[currency]);
    const idempotencyKey = `deposit-${userId}-${nanoid()}`;

    // Create Coinbase charge
    const charge = await createCharge({
      userId,
      discordUsername: user.discord_username,
      goldAmount,
      priceUsd: Math.round(usdAmount * 100) / 100, // Round to 2 decimals
      description: `${goldAmount.toLocaleString()}g for GDKP auctions`,
    });

    // Create pending transaction
    const transaction = await prisma.transaction.create({
      data: {
        user_id: userId,
        type: 'DEPOSIT',
        gold_amount: goldAmount,
        real_amount: amount,
        currency,
        exchange_rate: exchangeRate,
        status: 'PENDING',
        idempotency_key: idempotencyKey,
        coinbase_charge_id: charge.data.id,
        coinbase_charge_code: charge.data.code,
      },
    });

    logger.info(
      { userId, amount, currency, goldAmount, chargeId: charge.data.id },
      'Deposit order created via Coinbase'
    );

    return {
      checkout_url: charge.data.hosted_url,
      charge_id: charge.data.id,
      gold_amount: goldAmount,
      exchange_rate: exchangeRate,
      transaction_id: transaction.id,
    };
  }

  /**
   * Create a withdrawal request
   * Withdrawals are manual - admin receives Discord notification and sends crypto manually
   */
  async createWithdrawal(userId: string, goldAmount: number) {
    // Get user and verify balance + wallet address
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { gold_balance: true, crypto_wallet_address: true, discord_username: true },
    });

    if (!user) {
      throw new AppError(ERROR_CODES.USER_NOT_FOUND, 'User not found', 404);
    }

    if (!user.crypto_wallet_address) {
      throw new AppError(ERROR_CODES.USER_NO_WALLET, 'Crypto wallet address not configured. Please set it in your profile.', 400);
    }

    // Check for pending withdrawals
    const pendingWithdrawal = await prisma.transaction.findFirst({
      where: {
        user_id: userId,
        type: 'WITHDRAWAL',
        status: { in: ['PENDING', 'PROCESSING'] },
      },
    });

    if (pendingWithdrawal) {
      throw new AppError(ERROR_CODES.WALLET_PENDING_WITHDRAWAL, 'You already have a pending withdrawal', 400);
    }

    // Get locked amount
    const lockedResult = await prisma.bid.aggregate({
      where: {
        user_id: userId,
        is_winning: true,
        item: { status: 'ACTIVE' },
      },
      _sum: { amount: true },
    });

    const lockedAmount = Number(lockedResult._sum.amount || 0);
    const availableBalance = Number(user.gold_balance) - lockedAmount;

    if (availableBalance < goldAmount) {
      throw new AppError(ERROR_CODES.WALLET_INSUFFICIENT_BALANCE, 'Insufficient balance', 400);
    }

    // Get exchange rate and calculate USD amount
    const rates = await this.getExchangeRates();
    const exchangeRate = rates.USD;
    const realAmount = goldAmount / exchangeRate;

    // Minimum withdrawal check (10 USD)
    if (realAmount < 10) {
      throw new AppError(ERROR_CODES.WALLET_MINIMUM_WITHDRAWAL, 'Minimum withdrawal is $10 USD', 400);
    }

    const idempotencyKey = `withdrawal-${userId}-${nanoid()}`;

    const result = await prisma.$transaction(async (tx) => {
      // Deduct balance immediately
      await tx.user.update({
        where: { id: userId },
        data: { gold_balance: { decrement: goldAmount } },
      });

      // Create transaction
      const transaction = await tx.transaction.create({
        data: {
          user_id: userId,
          type: 'WITHDRAWAL',
          gold_amount: -goldAmount,
          real_amount: realAmount,
          currency: 'USD',
          exchange_rate: exchangeRate,
          status: 'PROCESSING',
          idempotency_key: idempotencyKey,
          metadata: {
            wallet_address: user.crypto_wallet_address,
          },
        },
      });

      logger.info(
        { userId, goldAmount, realAmount, transactionId: transaction.id },
        'Withdrawal initiated'
      );

      return {
        transaction_id: transaction.id,
        gold_amount: goldAmount,
        real_amount: realAmount,
        currency: 'USD',
        status: transaction.status,
        wallet_address: user.crypto_wallet_address,
      };
    });

    // Send Discord notification to admin
    await sendWithdrawalRequested({
      discordUsername: user.discord_username,
      goldAmount,
      amountUsd: realAmount,
      walletAddress: user.crypto_wallet_address!,
      userId,
    });

    return result;
  }
}
