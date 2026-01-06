import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { WalletService } from '../services/wallet.service.js';
import { BidService } from '../services/bid.service.js';

const depositSchema = z.object({
  amount: z.number().positive().min(5),
  currency: z.enum(['SEK', 'EUR', 'USD']),
});

const withdrawSchema = z.object({
  gold_amount: z.number().int().positive().min(5000),
});

const walletService = new WalletService();
const bidService = new BidService();

const walletRoutes: FastifyPluginAsync = async (fastify) => {
  // Get wallet balance
  fastify.get('/balance', { preHandler: [requireAuth] }, async (request) => {
    const balance = await walletService.getBalance(request.user.id);
    return balance;
  });

  // Create deposit order
  fastify.post('/deposit', { preHandler: [requireAuth] }, async (request) => {
    const data = depositSchema.parse(request.body);
    const result = await walletService.createDeposit(
      request.user.id,
      data.amount,
      data.currency
    );
    return result;
  });

  // Capture deposit after PayPal approval
  fastify.post('/deposit/capture', { preHandler: [requireAuth] }, async (request) => {
    const { order_id } = request.body as { order_id: string };
    const result = await walletService.captureDeposit(request.user.id, order_id);
    return result;
  });

  // Request withdrawal
  fastify.post('/withdraw', { preHandler: [requireAuth] }, async (request) => {
    const data = withdrawSchema.parse(request.body);
    const result = await walletService.createWithdrawal(
      request.user.id,
      data.gold_amount
    );
    return result;
  });

  // Get exchange rates
  fastify.get('/exchange-rates', async () => {
    const rates = await walletService.getExchangeRates();
    return rates;
  });
};

export default walletRoutes;
