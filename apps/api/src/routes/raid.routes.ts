import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { requireAuth } from '../middleware/auth.js';
import { AppError, ERROR_CODES, WOW_INSTANCES } from '@gdkp/shared';
import { PotDistributionService } from '../services/pot-distribution.service.js';

const potDistributionService = new PotDistributionService();

const createRaidSchema = z.object({
  instances: z.array(z.string()).min(1),
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

const reorderItemsSchema = z.object({
  item_ids: z.array(z.string().uuid()).min(1),
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
          orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
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

    // Auto-generate raid name as "GDKP YYYY-MM-DD"
    const today = new Date().toISOString().split('T')[0];
    const raidName = `GDKP ${today}`;

    const raid = await prisma.raid.create({
      data: {
        name: raidName,
        instances: data.instances,
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

    // Notify all users about new raid
    fastify.io.emit('raids:updated');

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

    // Notify clients in the raid about the new item
    fastify.io.to(`raid:${id}`).emit('raid:updated', { raid_id: id, items_changed: true });

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

    // Notify clients about the item deletion
    fastify.io.to(`raid:${id}`).emit('raid:updated', { raid_id: id, items_changed: true });

    return { deleted: true };
  });

  // Reorder items in the auction queue
  fastify.patch('/:id/items/reorder', { preHandler: [requireAuth] }, async (request) => {
    const { id } = request.params as { id: string };
    const { item_ids } = reorderItemsSchema.parse(request.body);

    // Verify user is leader/officer
    const participant = await prisma.raidParticipant.findUnique({
      where: {
        raid_id_user_id: { raid_id: id, user_id: request.user.id },
      },
    });

    if (!participant || !['LEADER', 'OFFICER'].includes(participant.role)) {
      throw new AppError(ERROR_CODES.RAID_NOT_LEADER, 'Only leaders/officers can reorder items', 403);
    }

    // Verify all items belong to this raid and are PENDING
    const items = await prisma.item.findMany({
      where: {
        id: { in: item_ids },
        raid_id: id,
      },
    });

    if (items.length !== item_ids.length) {
      throw new AppError(ERROR_CODES.ITEM_NOT_FOUND, 'Some items not found in this raid', 404);
    }

    const nonPendingItems = items.filter((item) => item.status !== 'PENDING');
    if (nonPendingItems.length > 0) {
      throw new AppError(
        ERROR_CODES.INVALID_REQUEST,
        'Can only reorder pending items',
        400
      );
    }

    // Update sort_order for each item based on position in array
    await prisma.$transaction(
      item_ids.map((itemId, index) =>
        prisma.item.update({
          where: { id: itemId },
          data: { sort_order: index },
        })
      )
    );

    // Notify clients about the reorder
    fastify.io.to(`raid:${id}`).emit('raid:updated', { raid_id: id, items_changed: true });

    return { reordered: true };
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

    // Allow awarding PENDING items or COMPLETED items with no winner (unsold)
    const canAward = item.status === 'PENDING' || (item.status === 'COMPLETED' && !item.winner_id);
    if (!canAward) {
      throw new AppError(ERROR_CODES.INVALID_REQUEST, 'Can only award pending or unsold items', 400);
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

  // Create goodie bag from unsold items
  fastify.post('/:id/goodie-bag', { preHandler: [requireAuth] }, async (request) => {
    const { id } = request.params as { id: string };
    const { item_ids } = request.body as { item_ids: string[] };

    // Validate at least 2 items
    if (!item_ids || item_ids.length < 2) {
      throw new AppError(ERROR_CODES.INVALID_REQUEST, 'At least 2 items required for goodie bag', 400);
    }

    // Verify user is leader/officer
    const participant = await prisma.raidParticipant.findUnique({
      where: {
        raid_id_user_id: { raid_id: id, user_id: request.user.id },
      },
    });

    if (!participant || !['LEADER', 'OFFICER'].includes(participant.role)) {
      throw new AppError(ERROR_CODES.RAID_NOT_LEADER, 'Only leaders/officers can create goodie bags', 403);
    }

    // Verify raid is active
    const raid = await prisma.raid.findUnique({ where: { id } });
    if (!raid || raid.status !== 'ACTIVE') {
      throw new AppError(ERROR_CODES.RAID_NOT_ACTIVE, 'Raid must be active', 400);
    }

    // Fetch all selected items and verify they're unsold
    const items = await prisma.item.findMany({
      where: {
        id: { in: item_ids },
        raid_id: id,
      },
    });

    if (items.length !== item_ids.length) {
      throw new AppError(ERROR_CODES.ITEM_NOT_FOUND, 'Some items not found', 404);
    }

    // Verify all items are unsold (COMPLETED without winner or CANCELLED)
    const invalidItems = items.filter(
      (item) => !((item.status === 'COMPLETED' && !item.winner_id) || item.status === 'CANCELLED')
    );

    if (invalidItems.length > 0) {
      throw new AppError(
        ERROR_CODES.INVALID_REQUEST,
        `Items must be unsold: ${invalidItems.map((i) => i.name).join(', ')}`,
        400
      );
    }

    // Get item names and highest quality
    const itemNames = items.map((i) => i.name);
    const highestQuality = Math.max(...items.map((i) => i.quality));
    const firstIcon = items[0].icon_url;

    // Create the bundle and delete original items in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Delete original items
      await tx.item.deleteMany({
        where: { id: { in: item_ids } },
      });

      // Create bundle item
      const bundle = await tx.item.create({
        data: {
          raid_id: id,
          name: 'Goodie Bag',
          icon_url: firstIcon,
          quality: highestQuality,
          status: 'PENDING',
          starting_bid: 0,
          current_bid: 0,
          min_increment: 10,
          auction_duration: 60,
          is_bundle: true,
          bundle_item_names: itemNames,
        },
      });

      return bundle;
    });

    // Notify clients about the change
    fastify.io.to(`raid:${id}`).emit('raid:updated', { raid_id: id, items_changed: true });

    return {
      created: true,
      bundle: {
        ...result,
        starting_bid: Number(result.starting_bid),
        current_bid: Number(result.current_bid),
        min_increment: Number(result.min_increment),
      },
    };
  });

  // Break up a goodie bag back into individual items
  fastify.delete('/:id/goodie-bag/:itemId', { preHandler: [requireAuth] }, async (request) => {
    const { id, itemId } = request.params as { id: string; itemId: string };

    // Verify user is leader/officer
    const participant = await prisma.raidParticipant.findUnique({
      where: {
        raid_id_user_id: { raid_id: id, user_id: request.user.id },
      },
    });

    if (!participant || !['LEADER', 'OFFICER'].includes(participant.role)) {
      throw new AppError(ERROR_CODES.RAID_NOT_LEADER, 'Only leaders/officers can break up goodie bags', 403);
    }

    // Find the bundle item
    const bundle = await prisma.item.findUnique({
      where: { id: itemId },
    });

    if (!bundle || bundle.raid_id !== id) {
      throw new AppError(ERROR_CODES.ITEM_NOT_FOUND, 'Item not found', 404);
    }

    if (!bundle.is_bundle) {
      throw new AppError(ERROR_CODES.INVALID_REQUEST, 'Item is not a goodie bag', 400);
    }

    // Allow breaking up PENDING or unsold (COMPLETED without winner) goodie bags
    const isUnsold = bundle.status === 'COMPLETED' && !bundle.winner_id;
    if (bundle.status !== 'PENDING' && !isUnsold) {
      throw new AppError(ERROR_CODES.INVALID_REQUEST, 'Can only break up pending or unsold goodie bags', 400);
    }

    // Recreate individual items from bundle_item_names
    const itemNames = bundle.bundle_item_names || [];

    // Try to look up icons from TBC item database
    const tbcItems = await prisma.tbcRaidItem.findMany({
      where: {
        name: { in: itemNames },
      },
    });
    const iconMap = new Map(tbcItems.map((item) => [item.name, `https://wow.zamimg.com/images/wow/icons/large/${item.icon}.jpg`]));
    const qualityMap = new Map(tbcItems.map((item) => [item.name, item.quality]));

    const result = await prisma.$transaction(async (tx) => {
      // Create individual items as COMPLETED without winner (unsold)
      const createdItems = await Promise.all(
        itemNames.map((name) =>
          tx.item.create({
            data: {
              raid_id: id,
              name,
              icon_url: iconMap.get(name) || null, // Use TBC database icon if found
              quality: qualityMap.get(name) || bundle.quality,
              status: 'COMPLETED', // Return to unsold state
              winner_id: null, // No winner = unsold
              starting_bid: 0,
              current_bid: 0,
              min_increment: 10,
              auction_duration: 60,
              is_bundle: false,
              bundle_item_names: [],
            },
          })
        )
      );

      // Delete the bundle
      await tx.item.delete({
        where: { id: itemId },
      });

      return createdItems;
    });

    // Notify clients about the change
    fastify.io.to(`raid:${id}`).emit('raid:updated', { raid_id: id, items_changed: true });

    return {
      broken_up: true,
      items: result.map((item) => ({
        ...item,
        starting_bid: Number(item.starting_bid),
        current_bid: Number(item.current_bid),
        min_increment: Number(item.min_increment),
      })),
    };
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

    // Build spending map per user from items won
    const spendingByUser = new Map<string, number>();
    for (const item of raid.items) {
      if (item.winner_id) {
        const current = spendingByUser.get(item.winner_id) || 0;
        spendingByUser.set(item.winner_id, current + Number(item.current_bid));
      }
    }

    // Build participants with payouts
    const participants = raid.participants.map((p) => {
      const isLeader = p.role === 'LEADER';
      const basePayout = sharePerMember;
      const leaderBonus = isLeader ? leaderCutAmount : 0;
      const totalPayout = basePayout + leaderBonus;
      const sharePercentage = potTotal > 0 ? (totalPayout / potTotal) * 100 : 0;
      const payoutAmount = p.payout_amount ? Number(p.payout_amount) : totalPayout;
      const totalSpent = spendingByUser.get(p.user.id) || 0;

      return {
        user_id: p.user.id,
        display_name: getDisplayName(p.user),
        role: p.role,
        payout_amount: payoutAmount,
        share_percentage: sharePercentage,
        total_spent: totalSpent,
        net_amount: payoutAmount - totalSpent,
      };
    });

    // Build items sold
    const items = raid.items.map((item) => ({
      id: item.id,
      name: item.name,
      icon_url: item.icon_url,
      wowhead_id: item.wowhead_id,
      winner_name: item.winner ? getDisplayName(item.winner) : 'No winner',
      final_bid: item.winner ? Number(item.current_bid) : 0,
      quality: item.quality,
    }));

    return {
      raid_id: raid.id,
      raid_name: raid.name,
      instances: raid.instances,
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
