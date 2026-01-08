import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { requireAdmin } from '../middleware/auth.js';
import { logger } from '../config/logger.js';

const adjustBalanceSchema = z.object({
  user_id: z.string().uuid(),
  amount: z.number().int(),
  reason: z.string().max(255).optional(),
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
      ? {
          OR: [
            { discord_username: { contains: search, mode: 'insensitive' as const } },
            { alias: { contains: search, mode: 'insensitive' as const } },
          ],
        }
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
          alias: true,
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

  // Get alias to Discord username mappings (for admin panel)
  fastify.get('/alias-mappings', { preHandler: [requireAdmin] }, async (request) => {
    const { limit = 50, offset = 0, search } = request.query as {
      limit?: number;
      offset?: number;
      search?: string;
    };

    const where = search
      ? {
          OR: [
            { alias: { contains: search, mode: 'insensitive' as const } },
            { discord_username: { contains: search, mode: 'insensitive' as const } },
          ],
        }
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
          alias: true,
          role: true,
          created_at: true,
        },
      }),
      prisma.user.count({ where }),
    ]);

    return { users, total };
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

  // Clear all user gold balances
  fastify.post('/clear-all-gold', { preHandler: [requireAdmin] }, async (request) => {
    const result = await prisma.$transaction(async (tx) => {
      // Count users with balance > 0
      const usersWithBalance = await tx.user.count({
        where: { gold_balance: { gt: 0 } },
      });

      // Reset all gold balances to 0
      await tx.user.updateMany({
        data: { gold_balance: 0 },
      });

      return { users_cleared: usersWithBalance };
    });

    logger.info({ adminId: request.user.id, usersCleared: result.users_cleared }, 'All gold balances cleared');

    return result;
  });

  // Get pending gold reports
  fastify.get('/gold-reports', { preHandler: [requireAdmin] }, async () => {
    const reports = await prisma.goldReport.findMany({
      where: { status: 'PENDING' },
      orderBy: { created_at: 'asc' },
      include: {
        user: {
          select: {
            id: true,
            discord_username: true,
            discord_avatar: true,
            alias: true,
            gold_balance: true,
          },
        },
      },
    });

    return {
      reports: reports.map((r) => ({
        ...r,
        reported_amount: Number(r.reported_amount),
        user: {
          ...r.user,
          gold_balance: Number(r.user.gold_balance),
        },
      })),
    };
  });

  // Approve gold report
  fastify.post('/gold-reports/:id/approve', { preHandler: [requireAdmin] }, async (request) => {
    const { id } = request.params as { id: string };

    return await prisma.$transaction(async (tx) => {
      // Get the report
      const report = await tx.goldReport.findUnique({
        where: { id },
      });

      if (!report) {
        throw new Error('Report not found');
      }

      if (report.status !== 'PENDING') {
        throw new Error('Report already processed');
      }

      // Update report status
      await tx.goldReport.update({
        where: { id },
        data: {
          status: 'APPROVED',
          reviewed_at: new Date(),
          reviewed_by: request.user.id,
        },
      });

      // Set user balance to reported amount
      const user = await tx.user.update({
        where: { id: report.user_id },
        data: { gold_balance: report.reported_amount },
      });

      // Create transaction record
      await tx.transaction.create({
        data: {
          user_id: report.user_id,
          type: 'ADMIN_ADJUST',
          gold_amount: report.reported_amount,
          status: 'COMPLETED',
          completed_at: new Date(),
          metadata: {
            admin_id: request.user.id,
            reason: 'Gold report approved',
            report_id: id,
          },
        },
      });

      logger.info(
        { adminId: request.user.id, userId: report.user_id, amount: Number(report.reported_amount) },
        'Gold report approved'
      );

      return {
        success: true,
        user_id: user.id,
        new_balance: Number(user.gold_balance),
      };
    });
  });

  // Reject gold report
  fastify.post('/gold-reports/:id/reject', { preHandler: [requireAdmin] }, async (request) => {
    const { id } = request.params as { id: string };

    const report = await prisma.goldReport.findUnique({
      where: { id },
    });

    if (!report) {
      throw new Error('Report not found');
    }

    if (report.status !== 'PENDING') {
      throw new Error('Report already processed');
    }

    await prisma.goldReport.update({
      where: { id },
      data: {
        status: 'REJECTED',
        reviewed_at: new Date(),
        reviewed_by: request.user.id,
      },
    });

    logger.info({ adminId: request.user.id, reportId: id }, 'Gold report rejected');

    return { success: true };
  });

  // ============================================
  // WAITING ROOM / LOBBY
  // ============================================

  // Get all users waiting for approval
  fastify.get('/waiting-room', { preHandler: [requireAdmin] }, async () => {
    const waitingUsers = await prisma.user.findMany({
      where: { session_status: 'WAITING' },
      orderBy: { updated_at: 'asc' }, // Oldest first (first come first serve)
      select: {
        id: true,
        discord_id: true,
        discord_username: true,
        discord_avatar: true,
        alias: true,
        updated_at: true, // When they entered the waiting room
      },
    });

    return { users: waitingUsers };
  });

  // Approve a waiting user
  fastify.post('/approve/:userId', { preHandler: [requireAdmin] }, async (request) => {
    const { userId } = request.params as { userId: string };

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (user.session_status !== 'WAITING') {
      throw new Error('User is not in waiting room');
    }

    await prisma.user.update({
      where: { id: userId },
      data: { session_status: 'APPROVED' },
    });

    logger.info({ adminId: request.user.id, userId }, 'User approved from waiting room');

    // Notify the user they've been approved
    fastify.io.to(`user:${userId}`).emit('session:approved', {
      message: 'You have been approved to enter',
    });

    // Notify admins of waiting room update
    fastify.io.to('admin:waiting-room').emit('waiting-room:updated', {});

    return { success: true, user_id: userId };
  });

  // Kick a waiting user
  fastify.post('/kick/:userId', { preHandler: [requireAdmin] }, async (request) => {
    const { userId } = request.params as { userId: string };

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        session_status: 'OFFLINE',
        alias: null, // Clear alias too
      },
    });

    logger.info({ adminId: request.user.id, userId }, 'User kicked from waiting room');

    // Notify the user they've been kicked
    fastify.io.to(`user:${userId}`).emit('session:kicked', {
      message: 'You have been removed by an admin',
    });

    // Notify admins of waiting room update
    fastify.io.to('admin:waiting-room').emit('waiting-room:updated', {});

    return { success: true, user_id: userId };
  });
};

export default adminRoutes;
