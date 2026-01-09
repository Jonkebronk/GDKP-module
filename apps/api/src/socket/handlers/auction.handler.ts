import { Socket } from 'socket.io';
import type { TypedServer } from '../index.js';
import type { SocketData, ClientToServerEvents, ServerToClientEvents } from '@gdkp/shared';
import { BidService } from '../../services/bid.service.js';
import { AuctionService } from '../../services/auction.service.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../config/database.js';

type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents, unknown, SocketData>;

const bidService = new BidService();
const auctionService = new AuctionService();

export function registerAuctionHandlers(io: TypedServer, socket: TypedSocket) {
  const { user_id, username } = socket.data;

  // Start an auction
  socket.on('auction:start', async ({ item_id, duration, min_bid, increment }) => {
    try {
      const raid_id = socket.data.current_raid_id;
      if (!raid_id) {
        socket.emit('error', { code: 'NOT_IN_RAID', message: 'Must be in a raid' });
        return;
      }

      const result = await auctionService.startAuction(item_id, user_id, duration, min_bid, increment);

      if (!result.success) {
        socket.emit('error', { code: result.error!, message: result.message! });
        return;
      }

      // Broadcast to all raid participants
      io.to(`raid:${raid_id}`).emit('auction:started', {
        item: result.item!,
        ends_at: result.item!.ends_at!.toISOString(),
        min_increment: result.item!.min_increment,
      });

      // Start the countdown ticker
      auctionService.startCountdown(io, raid_id, item_id);

      logger.info({ user_id, item_id, raid_id }, 'Auction started');
    } catch (error) {
      logger.error({ user_id, item_id: socket.data, error }, 'Failed to start auction');
      socket.emit('error', { code: 'INTERNAL_ERROR', message: 'Failed to start auction' });
    }
  });

  // Place a bid
  socket.on('bid:place', async ({ item_id, amount }) => {
    try {
      const raid_id = socket.data.current_raid_id;
      if (!raid_id) {
        socket.emit('error', { code: 'NOT_IN_RAID', message: 'Must be in a raid' });
        return;
      }

      const result = await bidService.placeBid(user_id, item_id, amount);

      if (!result.success) {
        socket.emit('bid:rejected', {
          error: result.error!,
          min_required: result.min_required,
        });
        return;
      }

      // Send confirmation to bidder
      socket.emit('bid:accepted', {
        bid_id: result.bid!.id,
        amount: Number(result.bid!.amount),
        timestamp: result.bid!.created_at.toISOString(),
      });

      // Send wallet update to bidder
      const lockedAmount = await bidService.getLockedAmount(user_id);
      const userBalance = await prisma.user.findUnique({
        where: { id: user_id },
        select: { gold_balance: true },
      });
      socket.emit('wallet:updated', {
        balance: Number(userBalance?.gold_balance || 0),
        locked_amount: lockedAmount,
      });

      // If someone was outbid, send them a wallet update too (their locked amount decreases)
      if (result.previous_winner_id && result.previous_winner_id !== user_id) {
        const prevLockedAmount = await bidService.getLockedAmount(result.previous_winner_id);
        const prevUserBalance = await prisma.user.findUnique({
          where: { id: result.previous_winner_id },
          select: { gold_balance: true },
        });
        io.to(`user:${result.previous_winner_id}`).emit('wallet:updated', {
          balance: Number(prevUserBalance?.gold_balance || 0),
          locked_amount: prevLockedAmount,
        });
      }

      // Broadcast new bid to all raid participants
      io.to(`raid:${raid_id}`).emit('bid:new', {
        bid_id: result.bid!.id,
        item_id,
        user_id,
        username,
        amount: Number(result.bid!.amount),
        timestamp: result.bid!.created_at.toISOString(),
        new_end_time: result.new_end_time?.toISOString(),
      });

      // If auction was extended, notify everyone
      if (result.new_end_time) {
        io.to(`raid:${raid_id}`).emit('auction:extended', {
          item_id,
          new_ends_at: result.new_end_time.toISOString(),
        });
      }

      logger.info({ user_id, item_id, amount, raid_id }, 'Bid placed');
    } catch (error) {
      logger.error({ user_id, item_id, amount, error }, 'Failed to place bid');
      socket.emit('error', { code: 'INTERNAL_ERROR', message: 'Failed to place bid' });
    }
  });

  // Stop an auction (return to queue)
  socket.on('auction:stop', async ({ item_id }) => {
    try {
      const raid_id = socket.data.current_raid_id;
      if (!raid_id) {
        socket.emit('error', { code: 'NOT_IN_RAID', message: 'Must be in a raid' });
        return;
      }

      const result = await auctionService.stopAuction(io, raid_id, item_id, user_id);

      if (!result.success) {
        socket.emit('error', { code: result.error!, message: result.message! });
        return;
      }

      logger.info({ user_id, item_id, raid_id }, 'Auction stopped');
    } catch (error) {
      logger.error({ user_id, item_id, error }, 'Failed to stop auction');
      socket.emit('error', { code: 'INTERNAL_ERROR', message: 'Failed to stop auction' });
    }
  });

  // Skip an auction (mark as unsold)
  socket.on('auction:skip', async ({ item_id }) => {
    try {
      const raid_id = socket.data.current_raid_id;
      if (!raid_id) {
        socket.emit('error', { code: 'NOT_IN_RAID', message: 'Must be in a raid' });
        return;
      }

      const result = await auctionService.skipAuction(io, raid_id, item_id, user_id);

      if (!result.success) {
        socket.emit('error', { code: result.error!, message: result.message! });
        return;
      }

      logger.info({ user_id, item_id, raid_id }, 'Auction skipped');
    } catch (error) {
      logger.error({ user_id, item_id, error }, 'Failed to skip auction');
      socket.emit('error', { code: 'INTERNAL_ERROR', message: 'Failed to skip auction' });
    }
  });
}
