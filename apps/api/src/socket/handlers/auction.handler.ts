import { Socket } from 'socket.io';
import type { TypedServer } from '../index.js';
import type { SocketData, ClientToServerEvents, ServerToClientEvents } from '@gdkp/shared';
import { BidService } from '../../services/bid.service.js';
import { AuctionService } from '../../services/auction.service.js';
import { logger } from '../../config/logger.js';

type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents, unknown, SocketData>;

const bidService = new BidService();
const auctionService = new AuctionService();

export function registerAuctionHandlers(io: TypedServer, socket: TypedSocket) {
  const { user_id, username } = socket.data;

  // Start an auction
  socket.on('auction:start', async ({ item_id, duration }) => {
    try {
      const raid_id = socket.data.current_raid_id;
      if (!raid_id) {
        socket.emit('error', { code: 'NOT_IN_RAID', message: 'Must be in a raid' });
        return;
      }

      const result = await auctionService.startAuction(item_id, user_id, duration);

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
}
