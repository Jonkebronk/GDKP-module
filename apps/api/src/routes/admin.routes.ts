import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { requireAdmin } from '../middleware/auth.js';
import { logger } from '../config/logger.js';

const updateExchangeRatesSchema = z.object({
  SEK: z.number().positive(),
  EUR: z.number().positive(),
  USD: z.number().positive(),
});

const adjustBalanceSchema = z.object({
  user_id: z.string().uuid(),
  amount: z.number().int(),
  reason: z.string().min(1).max(255),
});

const adminRoutes: FastifyPluginAsync = async (fastify) => {
  // Get all users
  fastify.get('/users', { preHandler: [requireAdmin] }, async (request) => {
    const { limit = 50, offset = 0, search } = request.query as {
      limit?: number;
      offset?: number;
      search?: string;
    };

    const where = search
      ? { discord_username: { contains: search, mode: 'insensitive' as const } }
      : {};

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: Math.min(Number(limit), 100),
        skip: Number(offset),
        select: {
          id: true,
          discord_id: true,
          discord_username: true,
          discord_avatar: true,
          paypal_email: true,
          gold_balance: true,
          role: true,
          created_at: true,
          _count: {
            select: { bids: true, transactions: true },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return {
      users: users.map((u) => ({
        ...u,
        gold_balance: Number(u.gold_balance),
        bid_count: u._count.bids,
        transaction_count: u._count.transactions,
      })),
      total,
    };
  });

  // Get exchange rates
  fastify.get('/exchange-rates', { preHandler: [requireAdmin] }, async () => {
    const config = await prisma.config.findUnique({
      where: { key: 'exchange_rates' },
    });

    return config?.value || { SEK: 100, EUR: 1000, USD: 900 };
  });

  // Update exchange rates
  fastify.put('/exchange-rates', { preHandler: [requireAdmin] }, async (request) => {
    const data = updateExchangeRatesSchema.parse(request.body);

    const config = await prisma.config.upsert({
      where: { key: 'exchange_rates' },
      update: {
        value: { ...data, updated_at: new Date().toISOString() },
        updated_by: request.user.id,
      },
      create: {
        key: 'exchange_rates',
        value: { ...data, updated_at: new Date().toISOString() },
        updated_by: request.user.id,
      },
    });

    logger.info({ userId: request.user.id, rates: data }, 'Exchange rates updated');

    return config.value;
  });

  // Adjust user balance (admin action)
  fastify.post('/adjust-balance', { preHandler: [requireAdmin] }, async (request) => {
    const data = adjustBalanceSchema.parse(request.body);

    return await prisma.$transaction(async (tx) => {
      // Update user balance
      const user = await tx.user.update({
        where: { id: data.user_id },
        data: { gold_balance: { increment: data.amount } },
      });

      // Create transaction record
      await tx.transaction.create({
        data: {
          user_id: data.user_id,
          type: 'ADMIN_ADJUST',
          gold_amount: data.amount,
          status: 'COMPLETED',
          completed_at: new Date(),
          metadata: {
            admin_id: request.user.id,
            reason: data.reason,
          },
        },
      });

      logger.info(
        { adminId: request.user.id, userId: data.user_id, amount: data.amount, reason: data.reason },
        'Admin balance adjustment'
      );

      return {
        user_id: user.id,
        new_balance: Number(user.gold_balance),
        adjustment: data.amount,
      };
    });
  });

  // Get platform statistics
  fastify.get('/stats', { preHandler: [requireAdmin] }, async () => {
    const [userCount, raidCount, totalPot, transactionStats] = await Promise.all([
      prisma.user.count(),
      prisma.raid.count(),
      prisma.raid.aggregate({
        _sum: { pot_total: true },
      }),
      prisma.transaction.groupBy({
        by: ['type'],
        _sum: { gold_amount: true },
        _count: true,
      }),
    ]);

    return {
      users: userCount,
      raids: raidCount,
      total_pot_ever: Number(totalPot._sum.pot_total || 0),
      transactions: transactionStats.map((t) => ({
        type: t.type,
        count: t._count,
        total_gold: Number(t._sum.gold_amount || 0),
      })),
    };
  });

  // Clear all TBC raid items from the database
  fastify.delete('/tbc-items', { preHandler: [requireAdmin] }, async (request) => {
    const deleted = await prisma.tbcRaidItem.deleteMany({});

    logger.info({ adminId: request.user.id, deletedCount: deleted.count }, 'TBC items cleared');

    return {
      deleted: deleted.count,
      message: `Deleted ${deleted.count} TBC items from database`,
    };
  });
};

export default adminRoutes;
