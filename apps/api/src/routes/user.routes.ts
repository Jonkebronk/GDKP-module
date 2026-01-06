import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { requireAuth } from '../middleware/auth.js';
import { AppError, ERROR_CODES, isValidEmail } from '@gdkp/shared';

const updateProfileSchema = z.object({
  paypal_email: z.string().email().optional().nullable(),
});

const userRoutes: FastifyPluginAsync = async (fastify) => {
  // Get user profile by ID
  fastify.get('/:id', { preHandler: [requireAuth] }, async (request) => {
    const { id } = request.params as { id: string };

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        discord_username: true,
        discord_avatar: true,
        gold_balance: true,
        role: true,
        created_at: true,
      },
    });

    if (!user) {
      throw new AppError(ERROR_CODES.USER_NOT_FOUND, 'User not found', 404);
    }

    return {
      ...user,
      gold_balance: Number(user.gold_balance),
    };
  });

  // Update current user profile
  fastify.patch('/me', { preHandler: [requireAuth] }, async (request) => {
    const data = updateProfileSchema.parse(request.body);

    if (data.paypal_email && !isValidEmail(data.paypal_email)) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Invalid email format', 400);
    }

    const user = await prisma.user.update({
      where: { id: request.user.id },
      data: {
        paypal_email: data.paypal_email,
      },
      select: {
        id: true,
        discord_username: true,
        discord_avatar: true,
        paypal_email: true,
        gold_balance: true,
        role: true,
      },
    });

    return {
      ...user,
      gold_balance: Number(user.gold_balance),
      has_paypal: !!user.paypal_email,
    };
  });

  // Get transaction history
  fastify.get('/me/transactions', { preHandler: [requireAuth] }, async (request) => {
    const { limit = 50, offset = 0, type } = request.query as {
      limit?: number;
      offset?: number;
      type?: string;
    };

    const where: { user_id: string; type?: string } = {
      user_id: request.user.id,
    };

    if (type) {
      where.type = type;
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: Math.min(Number(limit), 100),
        skip: Number(offset),
      }),
      prisma.transaction.count({ where }),
    ]);

    return {
      transactions: transactions.map((t) => ({
        ...t,
        gold_amount: Number(t.gold_amount),
        real_amount: t.real_amount ? Number(t.real_amount) : null,
        exchange_rate: t.exchange_rate ? Number(t.exchange_rate) : null,
      })),
      total,
      has_more: Number(offset) + transactions.length < total,
    };
  });
};

export default userRoutes;
