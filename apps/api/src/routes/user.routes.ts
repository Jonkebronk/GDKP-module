import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { requireAuth } from '../middleware/auth.js';
import { AppError, ERROR_CODES } from '@gdkp/shared';

const updateProfileSchema = z.object({
  crypto_wallet_address: z.string().max(255).optional().nullable(),
});

const updateAliasSchema = z.object({
  alias: z.string()
    .min(2, 'Alias must be at least 2 characters')
    .max(32, 'Alias must be at most 32 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Alias can only contain letters, numbers, underscores, and hyphens'),
});

const userRoutes: FastifyPluginAsync = async (fastify) => {
  // Get user profile by ID
  fastify.get('/:id', { preHandler: [requireAuth] }, async (request) => {
    const { id } = request.params as { id: string };
    const isAdmin = request.user.role === 'ADMIN';

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        discord_username: true,
        discord_avatar: true,
        alias: true,
        gold_balance: true,
        role: true,
        created_at: true,
      },
    });

    if (!user) {
      throw new AppError(ERROR_CODES.USER_NOT_FOUND, 'User not found', 404);
    }

    // Always provide display_name (alias or fallback)
    const display_name = user.alias || user.discord_username;

    return {
      id: user.id,
      display_name,
      discord_avatar: user.discord_avatar,
      alias: user.alias,
      // Only expose discord_username to admins
      ...(isAdmin ? { discord_username: user.discord_username } : {}),
      gold_balance: Number(user.gold_balance),
      role: user.role,
      created_at: user.created_at,
    };
  });

  // Update current user profile
  fastify.patch('/me', { preHandler: [requireAuth] }, async (request) => {
    const data = updateProfileSchema.parse(request.body);

    // Basic wallet address validation (if provided)
    if (data.crypto_wallet_address && data.crypto_wallet_address.length < 26) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Invalid wallet address format', 400);
    }

    const user = await prisma.user.update({
      where: { id: request.user.id },
      data: {
        crypto_wallet_address: data.crypto_wallet_address,
      },
      select: {
        id: true,
        discord_username: true,
        discord_avatar: true,
        alias: true,
        crypto_wallet_address: true,
        gold_balance: true,
        role: true,
      },
    });

    return {
      ...user,
      gold_balance: Number(user.gold_balance),
      has_wallet: !!user.crypto_wallet_address,
    };
  });

  // Update user alias (display name)
  fastify.patch('/me/alias', { preHandler: [requireAuth] }, async (request) => {
    const { alias } = updateAliasSchema.parse(request.body);

    const user = await prisma.user.update({
      where: { id: request.user.id },
      data: { alias },
      select: {
        id: true,
        discord_id: true,
        discord_username: true,
        discord_avatar: true,
        alias: true,
        role: true,
      },
    });

    return user;
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
