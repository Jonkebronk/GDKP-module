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

  // Get items won by user (gold spent history)
  fastify.get('/me/items-won', { preHandler: [requireAuth] }, async (request) => {
    const items = await prisma.item.findMany({
      where: {
        winner_id: request.user.id,
        status: 'COMPLETED',
      },
      include: {
        raid: {
          select: {
            id: true,
            name: true,
            instance: true,
            ended_at: true,
          },
        },
      },
      orderBy: { completed_at: 'desc' },
    });

    // Group by raid
    const byRaid: Record<string, {
      raid_id: string;
      raid_name: string;
      instance: string;
      ended_at: string | null;
      items: Array<{
        id: string;
        name: string;
        icon_url: string | null;
        quality: number;
        final_bid: number;
        completed_at: string | null;
      }>;
      total_spent: number;
    }> = {};

    let totalSpent = 0;

    for (const item of items) {
      const finalBid = Number(item.current_bid);
      totalSpent += finalBid;

      if (!byRaid[item.raid_id]) {
        byRaid[item.raid_id] = {
          raid_id: item.raid_id,
          raid_name: item.raid.name,
          instance: item.raid.instance,
          ended_at: item.raid.ended_at?.toISOString() || null,
          items: [],
          total_spent: 0,
        };
      }

      byRaid[item.raid_id].items.push({
        id: item.id,
        name: item.name,
        icon_url: item.icon_url,
        quality: item.quality,
        final_bid: finalBid,
        completed_at: item.completed_at?.toISOString() || null,
      });
      byRaid[item.raid_id].total_spent += finalBid;
    }

    return {
      raids: Object.values(byRaid),
      total_spent: totalSpent,
      total_items: items.length,
    };
  });

  // Get payout history (cut payouts from raids)
  fastify.get('/me/payouts', { preHandler: [requireAuth] }, async (request) => {
    const participations = await prisma.raidParticipant.findMany({
      where: {
        user_id: request.user.id,
        payout_amount: { not: null },
        paid_at: { not: null },
      },
      include: {
        raid: {
          select: {
            id: true,
            name: true,
            instance: true,
            ended_at: true,
            pot_total: true,
          },
        },
      },
      orderBy: { paid_at: 'desc' },
    });

    let totalPayout = 0;
    const raids = participations.map((p) => {
      const payoutAmount = Number(p.payout_amount);
      totalPayout += payoutAmount;

      return {
        raid_id: p.raid_id,
        raid_name: p.raid.name,
        instance: p.raid.instance,
        ended_at: p.raid.ended_at?.toISOString() || null,
        pot_total: Number(p.raid.pot_total),
        payout_amount: payoutAmount,
        role: p.role,
        paid_at: p.paid_at?.toISOString() || null,
      };
    });

    return {
      raids,
      total_payout: totalPayout,
      total_raids: raids.length,
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
