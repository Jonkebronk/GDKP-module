import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { requireAuth } from '../middleware/auth.js';
import { AppError, ERROR_CODES } from '@gdkp/shared';
import { AuctionService } from '../services/auction.service.js';

const startAuctionSchema = z.object({
  duration: z.number().int().min(30).max(300).optional(),
});

const auctionService = new AuctionService();

const auctionRoutes: FastifyPluginAsync = async (fastify) => {
  // Get item with bid history
  fastify.get('/:id', { preHandler: [requireAuth] }, async (request) => {
    const { id } = request.params as { id: string };

    const item = await prisma.item.findUnique({
      where: { id },
      include: {
        winner: {
          select: { id: true, discord_username: true, discord_avatar: true },
        },
        bids: {
          orderBy: { created_at: 'desc' },
          take: 50,
          include: {
            user: {
              select: { id: true, discord_username: true, discord_avatar: true },
            },
          },
        },
        raid: {
          select: { id: true, name: true, status: true },
        },
      },
    });

    if (!item) {
      throw new AppError(ERROR_CODES.AUCTION_NOT_FOUND, 'Item not found', 404);
    }

    return {
      ...item,
      starting_bid: Number(item.starting_bid),
      current_bid: Number(item.current_bid),
      min_increment: Number(item.min_increment),
      bids: item.bids.map((bid) => ({
        ...bid,
        amount: Number(bid.amount),
      })),
    };
  });

  // Start auction via HTTP (alternative to WebSocket)
  fastify.post('/:id/start', { preHandler: [requireAuth] }, async (request) => {
    const { id } = request.params as { id: string };
    const data = startAuctionSchema.parse(request.body || {});

    const result = await auctionService.startAuction(id, request.user.id, data.duration);

    if (!result.success) {
      throw new AppError(
        result.error as keyof typeof ERROR_CODES,
        result.message || 'Failed to start auction',
        400
      );
    }

    // Start countdown
    const raidId = result.item!.raid_id;
    auctionService.startCountdown(fastify.io, raidId, id);

    // Broadcast to raid
    fastify.io.to(`raid:${raidId}`).emit('auction:started', {
      item: result.item!,
      ends_at: result.item!.ends_at!.toISOString(),
      min_increment: result.item!.min_increment,
    });

    return result.item;
  });

  // Cancel auction
  fastify.post('/:id/cancel', { preHandler: [requireAuth] }, async (request) => {
    const { id } = request.params as { id: string };

    const item = await prisma.item.findUnique({
      where: { id },
      include: {
        raid: {
          include: {
            participants: {
              where: { user_id: request.user.id },
            },
          },
        },
      },
    });

    if (!item) {
      throw new AppError(ERROR_CODES.AUCTION_NOT_FOUND, 'Item not found', 404);
    }

    // Verify user is leader
    const participant = item.raid.participants[0];
    if (!participant || participant.role !== 'LEADER') {
      throw new AppError(ERROR_CODES.RAID_NOT_LEADER, 'Only leaders can cancel auctions', 403);
    }

    if (item.status !== 'ACTIVE' && item.status !== 'PENDING') {
      throw new AppError(ERROR_CODES.AUCTION_NOT_ACTIVE, 'Cannot cancel this auction', 400);
    }

    // Stop countdown if active
    auctionService.stopCountdown(id);

    // Update item
    const updated = await prisma.item.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        completed_at: new Date(),
      },
    });

    // Release any winning bid locks (handled automatically by the bid query)

    // Notify raid
    fastify.io.to(`raid:${item.raid_id}`).emit('auction:ended', {
      item_id: id,
      winner_id: null,
      winner_name: null,
      final_amount: 0,
      pot_total: 0,
    });

    return {
      ...updated,
      starting_bid: Number(updated.starting_bid),
      current_bid: Number(updated.current_bid),
      min_increment: Number(updated.min_increment),
    };
  });

  // Re-auction a completed item
  fastify.post('/:id/reauction', { preHandler: [requireAuth] }, async (request) => {
    const { id } = request.params as { id: string };

    const item = await prisma.item.findUnique({
      where: { id },
      include: {
        winner: {
          select: { id: true, discord_username: true, alias: true },
        },
        raid: {
          include: {
            participants: {
              where: { user_id: request.user.id },
            },
          },
        },
      },
    });

    if (!item) {
      throw new AppError(ERROR_CODES.AUCTION_NOT_FOUND, 'Item not found', 404);
    }

    // Verify user is leader
    const participant = item.raid.participants[0];
    if (!participant || participant.role !== 'LEADER') {
      throw new AppError(ERROR_CODES.RAID_NOT_LEADER, 'Only leaders can re-auction items', 403);
    }

    if (item.status !== 'COMPLETED' && item.status !== 'CANCELLED') {
      throw new AppError(ERROR_CODES.AUCTION_NOT_ACTIVE, 'Can only re-auction completed or cancelled items', 400);
    }

    if (item.raid.status !== 'ACTIVE') {
      throw new AppError(ERROR_CODES.RAID_NOT_ACTIVE, 'Raid is not active', 400);
    }

    const previousWinnerName = item.winner?.alias || item.winner?.discord_username || null;
    const previousAmount = item.winner_id ? Number(item.current_bid) : 0;

    // Subtract from pot and reset item (only subtract if there was a winner with a bid)
    const [updatedRaid, updatedItem] = await prisma.$transaction([
      // Decrement pot_total by the winning bid amount (only if there was a winner)
      prisma.raid.update({
        where: { id: item.raid_id },
        data: previousAmount > 0 ? { pot_total: { decrement: previousAmount } } : {},
      }),
      // Reset item to pending state
      prisma.item.update({
        where: { id },
        data: {
          status: 'PENDING',
          winner_id: null,
          current_bid: item.starting_bid,
          ends_at: null,
          completed_at: null,
        },
      }),
      // Delete previous bids for this item
      prisma.bid.deleteMany({
        where: { item_id: id },
      }),
    ]);

    const newPotTotal = Number(updatedRaid.pot_total);

    // Broadcast re-auction event
    fastify.io.to(`raid:${item.raid_id}`).emit('auction:restarted', {
      item_id: id,
      item_name: item.name,
      previous_winner: previousWinnerName,
      previous_amount: previousAmount,
      new_pot_total: newPotTotal,
    });

    // Also send raid update for items changed (triggers refetch on all clients)
    fastify.io.to(`raid:${item.raid_id}`).emit('raid:updated', {
      pot_total: newPotTotal,
      items_changed: true,
      raid_id: item.raid_id,
    });

    return {
      success: true,
      item: {
        ...updatedItem,
        starting_bid: Number(updatedItem.starting_bid),
        current_bid: Number(updatedItem.current_bid),
        min_increment: Number(updatedItem.min_increment),
      },
      new_pot_total: newPotTotal,
      previous_winner: previousWinnerName,
      previous_amount: previousAmount,
    };
  });
};

export default auctionRoutes;
