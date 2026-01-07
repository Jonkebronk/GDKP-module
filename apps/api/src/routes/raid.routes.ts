import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { requireAuth } from '../middleware/auth.js';
import { AppError, ERROR_CODES, WOW_INSTANCES } from '@gdkp/shared';
import { PotDistributionService } from '../services/pot-distribution.service.js';

const potDistributionService = new PotDistributionService();

const createRaidSchema = z.object({
  name: z.string().min(3).max(100),
  instance: z.string(),
  split_config: z.object({
    type: z.enum(['equal', 'custom', 'role_based']),
    leader_cut_percent: z.number().min(0).max(20).optional(),
    custom_shares: z.record(z.number()).optional(),
  }),
});

const updateRaidSchema = z.object({
  name: z.string().min(3).max(100).optional(),
  split_config: z.object({
    type: z.enum(['equal', 'custom', 'role_based']),
    leader_cut_percent: z.number().min(0).max(20).optional(),
    custom_shares: z.record(z.number()).optional(),
  }).optional(),
});

const addItemSchema = z.object({
  name: z.string().min(1).max(255),
  wowhead_id: z.number().optional(),
  icon_url: z.string().url().optional(),
  quality: z.number().int().min(0).max(5).default(4),
  starting_bid: z.number().int().min(0).default(0),
  min_increment: z.number().int().min(1).default(10),
  auction_duration: z.number().int().min(30).max(300).default(60),
});

const raidRoutes: FastifyPluginAsync = async (fastify) => {
  // List raids
  fastify.get('/', { preHandler: [requireAuth] }, async (request) => {
    const { status, mine } = request.query as { status?: string; mine?: string };

    const where: Record<string, unknown> = {};
    if (status) {
      // Handle comma-separated status values (e.g., "ACTIVE,PENDING")
      const statuses = status.split(',');
      if (statuses.length > 1) {
        where.status = { in: statuses };
      } else {
        where.status = status;
      }
    }
    if (mine === 'true') {
      where.leader_id = request.user.id;
    }

    const raids = await prisma.raid.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: 50,
      include: {
        leader: {
          select: { id: true, discord_username: true, discord_avatar: true, alias: true },
        },
        _count: {
          select: { participants: true, items: true },
        },
      },
    });

    return raids.map((r) => ({
      ...r,
      pot_total: Number(r.pot_total),
      participant_count: r._count.participants,
      item_count: r._count.items,
    }));
  });

  // Get raid details
  fastify.get('/:id', { preHandler: [requireAuth] }, async (request) => {
    const { id } = request.params as { id: string };

    const raid = await prisma.raid.findUnique({
      where: { id },
      include: {
        leader: {
          select: { id: true, discord_username: true, discord_avatar: true, alias: true },
        },
        participants: {
          include: {
            user: {
              select: { id: true, discord_username: true, discord_avatar: true, alias: true },
            },
          },
        },
        items: {
          orderBy: { created_at: 'asc' },
          include: {
            winner: {
              select: { id: true, discord_username: true, discord_avatar: true, alias: true },
            },
          },
        },
      },
    });

    if (!raid) {
      throw new AppError(ERROR_CODES.RAID_NOT_FOUND, 'Raid not found', 404);
    }

    return {
      ...raid,
      pot_total: Number(raid.pot_total),
      items: raid.items.map((item) => ({
        ...item,
        starting_bid: Number(item.starting_bid),
        current_bid: Number(item.current_bid),
        min_increment: Number(item.min_increment),
      })),
      participants: raid.participants.map((p) => ({
        ...p,
        payout_amount: p.payout_amount ? Number(p.payout_amount) : null,
      })),
    };
  });

  // Create raid
  fastify.post('/', { preHandler: [requireAuth] }, async (request) => {
    const data = createRaidSchema.parse(request.body);

    const raid = await prisma.raid.create({
      data: {
        name: data.name,
        instance: data.instance,
        leader_id: request.user.id,
        split_config: data.split_config,
      },
    });

    // Add creator as leader participant
    await prisma.raidParticipant.create({
      data: {
        raid_id: raid.id,
        user_id: request.user.id,
        role: 'LEADER',
      },
    });

    return {
      ...raid,
      pot_total: Number(raid.pot_total),
    };
  });

  // Update raid
  fastify.patch('/:id', { preHandler: [requireAuth] }, async (request) => {
    const { id } = request.params as { id: string };
    const data = updateRaidSchema.parse(request.body);

    // Verify user is leader
    const raid = await prisma.raid.findUnique({
      where: { id },
    });

    if (!raid) {
      throw new AppError(ERROR_CODES.RAID_NOT_FOUND, 'Raid not found', 404);
    }

    if (raid.leader_id !== request.user.id) {
      throw new AppError(ERROR_CODES.RAID_NOT_LEADER, 'Only the raid leader can update the raid', 403);
    }

    if (raid.status === 'COMPLETED' || raid.status === 'CANCELLED') {
      throw new AppError(ERROR_CODES.RAID_ALREADY_COMPLETED, 'Cannot update completed/cancelled raid', 400);
    }

    const updated = await prisma.raid.update({
      where: { id },
      data: {
        name: data.name,
        split_config: data.split_config,
      },
    });

    return {
      ...updated,
      pot_total: Number(updated.pot_total),
    };
  });

  // Start raid
  fastify.post('/:id/start', { preHandler: [requireAuth] }, async (request) => {
    const { id } = request.params as { id: string };

    const raid = await prisma.raid.findUnique({ where: { id } });

    if (!raid) {
      throw new AppError(ERROR_CODES.RAID_NOT_FOUND, 'Raid not found', 404);
    }

    if (raid.leader_id !== request.user.id) {
      throw new AppError(ERROR_CODES.RAID_NOT_LEADER, 'Only the raid leader can start the raid', 403);
    }

    if (raid.status !== 'PENDING') {
      throw new AppError(ERROR_CODES.RAID_NOT_ACTIVE, 'Raid is not in pending status', 400);
    }

    const updated = await prisma.raid.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        started_at: new Date(),
      },
    });

    // Notify via socket
    fastify.io.to(`raid:${id}`).emit('raid:updated', {
      status: updated.status,
      started_at: updated.started_at,
    });

    return {
      ...updated,
      pot_total: Number(updated.pot_total),
    };
  });

  // Join raid
  fastify.post('/:id/join', { preHandler: [requireAuth] }, async (request) => {
    const { id } = request.params as { id: string };

    const raid = await prisma.raid.findUnique({ where: { id } });

    if (!raid) {
      throw new AppError(ERROR_CODES.RAID_NOT_FOUND, 'Raid not found', 404);
    }

    if (raid.status === 'COMPLETED' || raid.status === 'CANCELLED') {
      throw new AppError(ERROR_CODES.RAID_ALREADY_COMPLETED, 'Cannot join completed/cancelled raid', 400);
    }

    // Check if already participant
    const existing = await prisma.raidParticipant.findUnique({
      where: {
        raid_id_user_id: { raid_id: id, user_id: request.user.id },
      },
    });

    if (existing) {
      return { already_joined: true };
    }

    await prisma.raidParticipant.create({
      data: {
        raid_id: id,
        user_id: request.user.id,
        role: 'MEMBER',
      },
    });

    return { joined: true };
  });

  // Leave raid
  fastify.delete('/:id/leave', { preHandler: [requireAuth] }, async (request) => {
    const { id } = request.params as { id: string };

    const raid = await prisma.raid.findUnique({ where: { id } });

    if (!raid) {
      throw new AppError(ERROR_CODES.RAID_NOT_FOUND, 'Raid not found', 404);
    }

    // Leader cannot leave
    if (raid.leader_id === request.user.id) {
      throw new AppError(ERROR_CODES.RAID_NOT_LEADER, 'Leader cannot leave the raid', 400);
    }

    await prisma.raidParticipant.delete({
      where: {
        raid_id_user_id: { raid_id: id, user_id: request.user.id },
      },
    }).catch(() => null); // Ignore if not found

    return { left: true };
  });

  // Kick participant (leader only)
  fastify.delete('/:id/participants/:userId', { preHandler: [requireAuth] }, async (request) => {
    const { id, userId } = request.params as { id: string; userId: string };

    const raid = await prisma.raid.findUnique({ where: { id } });

    if (!raid) {
      throw new AppError(ERROR_CODES.RAID_NOT_FOUND, 'Raid not found', 404);
    }

    // Only leader can kick
    if (raid.leader_id !== request.user.id) {
      throw new AppError(ERROR_CODES.RAID_NOT_LEADER, 'Only the raid leader can remove participants', 403);
    }

    // Cannot kick self (the leader)
    if (userId === request.user.id) {
      throw new AppError(ERROR_CODES.INVALID_REQUEST, 'Cannot remove yourself from the raid', 400);
    }

    // Check if user has winning bids in active auctions
    const activeWinningBids = await prisma.bid.findFirst({
      where: {
        user_id: userId,
        is_winning: true,
        item: {
          raid_id: id,
          status: 'ACTIVE',
        },
      },
    });

    if (activeWinningBids) {
      throw new AppError(ERROR_CODES.INVALID_REQUEST, 'Cannot remove participant with active winning bids', 400);
    }

    // Remove participant
    await prisma.raidParticipant.delete({
      where: {
        raid_id_user_id: { raid_id: id, user_id: userId },
      },
    }).catch(() => null);

    // Notify via socket
    fastify.io.to(`raid:${id}`).emit('participant:left', {
      user_id: userId,
    });

    return { removed: true };
  });

  // Add item to raid
  fastify.post('/:id/items', { preHandler: [requireAuth] }, async (request) => {
    const { id } = request.params as { id: string };
    const data = addItemSchema.parse(request.body);

    // Verify user is leader/officer
    const participant = await prisma.raidParticipant.findUnique({
      where: {
        raid_id_user_id: { raid_id: id, user_id: request.user.id },
      },
    });

    if (!participant || !['LEADER', 'OFFICER'].includes(participant.role)) {
      throw new AppError(ERROR_CODES.RAID_NOT_LEADER, 'Only leaders/officers can add items', 403);
    }

    const item = await prisma.item.create({
      data: {
        raid_id: id,
        name: data.name,
        wowhead_id: data.wowhead_id,
        icon_url: data.icon_url,
        quality: data.quality,
        starting_bid: data.starting_bid,
        min_increment: data.min_increment,
        auction_duration: data.auction_duration,
      },
    });

    return {
      ...item,
      starting_bid: Number(item.starting_bid),
      current_bid: Number(item.current_bid),
      min_increment: Number(item.min_increment),
    };
  });

  // Delete item from raid
  fastify.delete('/:id/items/:itemId', { preHandler: [requireAuth] }, async (request) => {
    const { id, itemId } = request.params as { id: string; itemId: string };

    // Verify user is leader/officer
    const participant = await prisma.raidParticipant.findUnique({
      where: {
        raid_id_user_id: { raid_id: id, user_id: request.user.id },
      },
    });

    if (!participant || !['LEADER', 'OFFICER'].includes(participant.role)) {
      throw new AppError(ERROR_CODES.RAID_NOT_LEADER, 'Only leaders/officers can delete items', 403);
    }

    // Check item exists and belongs to this raid
    const item = await prisma.item.findFirst({
      where: { id: itemId, raid_id: id },
    });

    if (!item) {
      throw new AppError(ERROR_CODES.ITEM_NOT_FOUND, 'Item not found', 404);
    }

    // Don't allow deleting active or completed items
    if (item.status !== 'PENDING') {
      throw new AppError(ERROR_CODES.INVALID_REQUEST, 'Cannot delete active or completed items', 400);
    }

    await prisma.item.delete({
      where: { id: itemId },
    });

    return { deleted: true };
  });

  // Manually award item (without auction)
  fastify.post('/:id/items/:itemId/award', { preHandler: [requireAuth] }, async (request) => {
    const { id, itemId } = request.params as { id: string; itemId: string };
    const { winnerId, price } = request.body as { winnerId: string; price: number };

    // Verify user is leader/officer
    const participant = await prisma.raidParticipant.findUnique({
      where: {
        raid_id_user_id: { raid_id: id, user_id: request.user.id },
      },
    });

    if (!participant || !['LEADER', 'OFFICER'].includes(participant.role)) {
      throw new AppError(ERROR_CODES.RAID_NOT_LEADER, 'Only leaders/officers can award items', 403);
    }

    // Check item exists and is pending
    const item = await prisma.item.findFirst({
      where: { id: itemId, raid_id: id },
    });

    if (!item) {
      throw new AppError(ERROR_CODES.ITEM_NOT_FOUND, 'Item not found', 404);
    }

    if (item.status !== 'PENDING') {
      throw new AppError(ERROR_CODES.INVALID_REQUEST, 'Can only award pending items', 400);
    }

    // Verify winner is a participant
    const winnerParticipant = await prisma.raidParticipant.findUnique({
      where: {
        raid_id_user_id: { raid_id: id, user_id: winnerId },
      },
    });

    if (!winnerParticipant) {
      throw new AppError(ERROR_CODES.INVALID_REQUEST, 'Winner must be a raid participant', 400);
    }

    // Award the item
    const updatedItem = await prisma.item.update({
      where: { id: itemId },
      data: {
        winner_id: winnerId,
        current_bid: price,
        status: 'COMPLETED',
        completed_at: new Date(),
      },
      include: {
        winner: {
          select: { id: true, discord_username: true, alias: true },
        },
      },
    });

    // Update pot total
    await prisma.raid.update({
      where: { id },
      data: {
        pot_total: { increment: price },
      },
    });

    // Get updated pot total
    const raid = await prisma.raid.findUnique({ where: { id } });
    const potTotal = raid ? Number(raid.pot_total) : price;

    // Notify via socket - use auction:ended so frontend auction feed picks it up
    fastify.io.to(`raid:${id}`).emit('auction:ended', {
      item_id: itemId,
      item_name: item.name,
      winner_id: winnerId,
      winner_name: updatedItem.winner?.alias || updatedItem.winner?.discord_username,
      final_amount: price,
      pot_total: potTotal,
      is_manual_award: true,
    });

    return {
      awarded: true,
      item: {
        id: updatedItem.id,
        name: updatedItem.name,
        winner: updatedItem.winner,
        final_bid: Number(updatedItem.current_bid),
      },
    };
  });

  // Get pot distribution preview
  fastify.get('/:id/distribution-preview', { preHandler: [requireAuth] }, async (request) => {
    const { id } = request.params as { id: string };

    const preview = await potDistributionService.calculateDistribution(id);

    if (!preview) {
      throw new AppError(ERROR_CODES.RAID_NOT_FOUND, 'Raid not found', 404);
    }

    return preview;
  });

  // Distribute the pot to all participants
  fastify.post('/:id/distribute', { preHandler: [requireAuth] }, async (request) => {
    const { id } = request.params as { id: string };

    const result = await potDistributionService.distributePot(
      id,
      request.user.id,
      fastify.io
    );

    if (!result.success) {
      throw new AppError(
        result.error || 'DISTRIBUTION_FAILED',
        result.message || 'Failed to distribute pot',
        400
      );
    }

    return result;
  });

  // Delete raid (leader only)
  fastify.delete('/:id', { preHandler: [requireAuth] }, async (request) => {
    const { id } = request.params as { id: string };

    const raid = await prisma.raid.findUnique({
      where: { id },
    });

    if (!raid) {
      throw new AppError(ERROR_CODES.RAID_NOT_FOUND, 'Raid not found', 404);
    }

    if (raid.leader_id !== request.user.id) {
      throw new AppError(ERROR_CODES.RAID_NOT_LEADER, 'Only the raid leader can delete the raid', 403);
    }

    // Delete in order: chat messages, bids, items, participants, raid
    await prisma.$transaction([
      prisma.chatMessage.deleteMany({ where: { raid_id: id } }),
      prisma.bid.deleteMany({ where: { item: { raid_id: id } } }),
      prisma.item.deleteMany({ where: { raid_id: id } }),
      prisma.raidParticipant.deleteMany({ where: { raid_id: id } }),
      prisma.raid.delete({ where: { id } }),
    ]);

    return { deleted: true };
  });

  // Cancel raid and refund all auction winners
  fastify.post('/:id/cancel', { preHandler: [requireAuth] }, async (request) => {
    const { id } = request.params as { id: string };
    const { reason } = request.body as { reason?: string };

    const result = await potDistributionService.cancelRaid(
      id,
      request.user.id,
      reason || 'Raid cancelled by leader',
      fastify.io
    );

    if (!result.success) {
      throw new AppError(
        result.error || 'CANCEL_FAILED',
        result.message || 'Failed to cancel raid',
        400
      );
    }

    return result;
  });

  // Get raid summary (for completed raids - export/history)
  fastify.get('/:id/summary', { preHandler: [requireAuth] }, async (request) => {
    const { id } = request.params as { id: string };

    const raid = await prisma.raid.findUnique({
      where: { id },
      include: {
        leader: {
          select: { id: true, discord_username: true, alias: true },
        },
        participants: {
          include: {
            user: {
              select: { id: true, discord_username: true, alias: true },
            },
          },
        },
        items: {
          where: { status: 'COMPLETED' },
          include: {
            winner: {
              select: { id: true, discord_username: true, alias: true },
            },
          },
          orderBy: { completed_at: 'asc' },
        },
      },
    });

    if (!raid) {
      throw new AppError(ERROR_CODES.RAID_NOT_FOUND, 'Raid not found', 404);
    }

    // Parse split config
    const splitConfig = raid.split_config as { leader_cut_percent?: number } | null;
    const leaderCutPercent = splitConfig?.leader_cut_percent ?? 15;
    const potTotal = Number(raid.pot_total);
    const leaderCutAmount = Math.floor(potTotal * (leaderCutPercent / 100));
    const distributedAmount = potTotal - leaderCutAmount;

    // Calculate participant shares (excluding leader cut, then equal split)
    const participantCount = raid.participants.length;
    const sharePerMember = participantCount > 0 ? Math.floor(distributedAmount / participantCount) : 0;

    // Get display name helper
    const getDisplayName = (user: { alias: string | null; discord_username: string }) =>
      user.alias || user.discord_username;

    // Build participants with payouts
    const participants = raid.participants.map((p) => {
      const isLeader = p.role === 'LEADER';
      const basePayout = sharePerMember;
      const leaderBonus = isLeader ? leaderCutAmount : 0;
      const totalPayout = basePayout + leaderBonus;
      const sharePercentage = potTotal > 0 ? (totalPayout / potTotal) * 100 : 0;

      return {
        user_id: p.user.id,
        display_name: getDisplayName(p.user),
        role: p.role,
        payout_amount: p.payout_amount ? Number(p.payout_amount) : totalPayout,
        share_percentage: sharePercentage,
      };
    });

    // Build items sold
    const items = raid.items.map((item) => ({
      id: item.id,
      name: item.name,
      icon_url: item.icon_url,
      winner_name: item.winner ? getDisplayName(item.winner) : 'No winner',
      final_bid: Number(item.current_bid),
      quality: item.quality,
    }));

    return {
      raid_id: raid.id,
      raid_name: raid.name,
      instance: raid.instance,
      status: raid.status,
      leader_name: getDisplayName(raid.leader),
      pot_total: potTotal,
      leader_cut_percent: leaderCutPercent,
      leader_cut_amount: leaderCutAmount,
      distributed_amount: distributedAmount,
      participant_count: participantCount,
      participants,
      items,
      started_at: raid.started_at?.toISOString() || null,
      completed_at: raid.ended_at?.toISOString() || new Date().toISOString(),
    };
  });
};

export default raidRoutes;
