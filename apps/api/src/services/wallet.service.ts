import { Prisma } from '@gdkp/prisma-client';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import { AppError, ERROR_CODES } from '@gdkp/shared';
import { logger } from '../config/logger.js';
import { nanoid } from 'nanoid';

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
        status: 'PENDING',
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
   * Create a deposit order
   */
  async createDeposit(
    userId: string,
    amount: number,
    currency: 'SEK' | 'EUR' | 'USD'
  ) {
    const rates = await this.getExchangeRates();
    const exchangeRate = rates[currency];
    const goldAmount = Math.floor(amount * exchangeRate);
    const idempotencyKey = `deposit-${userId}-${nanoid()}`;

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
      },
    });

    // TODO: Integrate with PayPal to create order
    // For now, return mock data
    const mockOrderId = `PAYPAL-${nanoid()}`;

    // Update transaction with PayPal order ID
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: { paypal_order_id: mockOrderId },
    });

    logger.info({ userId, amount, currency, goldAmount, orderId: mockOrderId }, 'Deposit order created');

    return {
      order_id: mockOrderId,
      approve_url: `https://www.sandbox.paypal.com/checkoutnow?token=${mockOrderId}`,
      gold_amount: goldAmount,
      exchange_rate: exchangeRate,
      transaction_id: transaction.id,
    };
  }

  /**
   * Capture a deposit after PayPal approval
   */
  async captureDeposit(userId: string, orderId: string) {
    // Find the pending transaction
    const transaction = await prisma.transaction.findFirst({
      where: {
        user_id: userId,
        paypal_order_id: orderId,
        type: 'DEPOSIT',
        status: 'PENDING',
      },
    });

    if (!transaction) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Deposit not found', 404);
    }

    // TODO: Verify with PayPal that the order was captured
    // For now, simulate success

    return await prisma.$transaction(async (tx) => {
      // Update user balance
      await tx.user.update({
        where: { id: userId },
        data: { gold_balance: { increment: transaction.gold_amount } },
      });

      // Update transaction
      const updated = await tx.transaction.update({
        where: { id: transaction.id },
        data: {
          status: 'COMPLETED',
          completed_at: new Date(),
          paypal_transaction_id: `CAPTURE-${nanoid()}`,
        },
      });

      logger.info({ userId, goldAmount: Number(transaction.gold_amount) }, 'Deposit completed');

      return {
        success: true,
        gold_amount: Number(updated.gold_amount),
        new_balance: 0, // Will be updated client-side
      };
    });
  }

  /**
   * Create a withdrawal request
   */
  async createWithdrawal(userId: string, goldAmount: number) {
    // Get user and verify balance
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { gold_balance: true, paypal_email: true },
    });

    if (!user) {
      throw new AppError(ERROR_CODES.USER_NOT_FOUND, 'User not found', 404);
    }

    if (!user.paypal_email) {
      throw new AppError(ERROR_CODES.USER_NO_PAYPAL, 'PayPal email not configured', 400);
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

    // Get exchange rate and calculate real amount
    const rates = await this.getExchangeRates();
    const exchangeRate = rates.EUR;
    const realAmount = goldAmount / exchangeRate;

    // Minimum withdrawal check
    if (realAmount < 10) {
      throw new AppError(ERROR_CODES.WALLET_MINIMUM_WITHDRAWAL, 'Minimum withdrawal is 10 EUR', 400);
    }

    const idempotencyKey = `withdrawal-${userId}-${nanoid()}`;

    return await prisma.$transaction(async (tx) => {
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
          currency: 'EUR',
          exchange_rate: exchangeRate,
          status: 'PROCESSING',
          idempotency_key: idempotencyKey,
        },
      });

      // TODO: Create PayPal payout
      // For now, log and return

      logger.info({ userId, goldAmount, realAmount, transactionId: transaction.id }, 'Withdrawal initiated');

      return {
        transaction_id: transaction.id,
        gold_amount: goldAmount,
        real_amount: realAmount,
        currency: 'EUR',
        status: transaction.status,
      };
    });
  }
}
