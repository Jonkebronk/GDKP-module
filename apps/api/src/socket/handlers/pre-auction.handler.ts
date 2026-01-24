import { Socket } from 'socket.io';
import type { TypedServer } from '../index.js';
import type { SocketData, ClientToServerEvents, ServerToClientEvents } from '@gdkp/shared';
import { PreAuctionService } from '../../services/pre-auction.service.js';
import { BidService } from '../../services/bid.service.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../config/database.js';

type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents, unknown, SocketData>;

const preAuctionService = new PreAuctionService();
const bidService = new BidService();

export function registerPreAuctionHandlers(io: TypedServer, socket: TypedSocket) {
  const { user_id, username } = socket.data;

  // Join pre-auction room for a raid
  socket.on('preauction:join', async ({ raid_id }) => {
    try {
      // Verify user is a participant
      const participant = await prisma.raidParticipant.findUnique({
        where: {
          raid_id_user_id: { raid_id, user_id },
        },
      });

      if (!participant) {
        socket.emit('error', { code: 'NOT_IN_RAID', message: 'Must be a raid participant' });
        return;
      }

      // Join the pre-auction room (same as raid room for now)
      socket.join(`raid:${raid_id}`);
      socket.data.current_raid_id = raid_id;

      logger.info({ user_id, raid_id }, 'User joined pre-auction room');
    } catch (error) {
      logger.error({ user_id, raid_id, error }, 'Failed to join pre-auction room');
      socket.emit('error', { code: 'INTERNAL_ERROR', message: 'Failed to join pre-auction room' });
    }
  });

  // Leave pre-auction room
  socket.on('preauction:leave', async ({ raid_id }) => {
    socket.leave(`raid:${raid_id}`);
    if (socket.data.current_raid_id === raid_id) {
      socket.data.current_raid_id = undefined;
    }
    logger.info({ user_id, raid_id }, 'User left pre-auction room');
  });

  // Place a bid via socket
  socket.on('preauction:bid', async ({ pre_auction_item_id, amount }) => {
    try {
      const raid_id = socket.data.current_raid_id;
      if (!raid_id) {
        socket.emit('error', { code: 'NOT_IN_RAID', message: 'Must be in a raid' });
        return;
      }

      // Verify the item belongs to this raid
      const preAuctionItem = await prisma.preAuctionItem.findUnique({
        where: { id: pre_auction_item_id },
        include: { tbc_item: true },
      });

      if (!preAuctionItem || preAuctionItem.raid_id !== raid_id) {
        socket.emit('preauction:bid:rejected', { error: 'ITEM_NOT_FOUND' });
        return;
      }

      const result = await preAuctionService.placeBid(user_id, pre_auction_item_id, amount);

      if (!result.success) {
        socket.emit('preauction:bid:rejected', {
          error: result.error!,
          min_required: result.min_required,
        });
        return;
      }

      // Send confirmation to bidder
      socket.emit('preauction:bid:accepted', {
        bid_id: result.bid!.id,
        amount: Number(result.bid!.amount),
        timestamp: result.bid!.created_at.toISOString(),
      });

      // Send wallet update to bidder
      const liveLockedAmount = await bidService.getLockedAmount(user_id);
      const preAuctionLockedAmount = await preAuctionService.getPreAuctionLockedAmount(user_id);
      const totalLocked = liveLockedAmount + preAuctionLockedAmount;

      const userBalance = await prisma.user.findUnique({
        where: { id: user_id },
        select: { gold_balance: true },
      });

      socket.emit('wallet:updated', {
        balance: Number(userBalance?.gold_balance || 0),
        locked_amount: totalLocked,
      });

      // If someone was outbid, send them a wallet update too
      if (result.previous_winner_id && result.previous_winner_id !== user_id) {
        const prevLiveLockedAmount = await bidService.getLockedAmount(result.previous_winner_id);
        const prevPreAuctionLockedAmount = await preAuctionService.getPreAuctionLockedAmount(result.previous_winner_id);
        const prevTotalLocked = prevLiveLockedAmount + prevPreAuctionLockedAmount;

        const prevUserBalance = await prisma.user.findUnique({
          where: { id: result.previous_winner_id },
          select: { gold_balance: true },
        });

        io.to(`user:${result.previous_winner_id}`).emit('wallet:updated', {
          balance: Number(prevUserBalance?.gold_balance || 0),
          locked_amount: prevTotalLocked,
        });
      }

      // Broadcast new bid to all raid participants
      io.to(`raid:${raid_id}`).emit('preauction:bid:new', {
        pre_auction_item_id,
        bid_id: result.bid!.id,
        user_id,
        username,
        amount: Number(result.bid!.amount),
        timestamp: result.bid!.created_at.toISOString(),
        previous_winner_id: result.previous_winner_id || null,
      });

      logger.info({ user_id, pre_auction_item_id, amount, raid_id }, 'Pre-auction bid placed');
    } catch (error) {
      logger.error({ user_id, pre_auction_item_id, amount, error }, 'Failed to place pre-auction bid');
      socket.emit('error', { code: 'INTERNAL_ERROR', message: 'Failed to place bid' });
    }
  });
}
