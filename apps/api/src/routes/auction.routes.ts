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
};

export default auctionRoutes;
