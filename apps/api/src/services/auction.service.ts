import { Prisma } from '@gdkp/prisma-client';
import { prisma } from '../config/database.js';
import { AUCTION_DEFAULTS } from '@gdkp/shared';
import { logger } from '../config/logger.js';
import type { TypedServer } from '../socket/index.js';
import type { Item } from '@gdkp/shared';

interface StartAuctionResult {
  success: boolean;
  item?: Item;
  error?: string;
  message?: string;
}

interface CompleteAuctionResult {
  success: boolean;
  had_winner: boolean;
  winner_id?: string;
  winner_name?: string;
  final_amount?: number;
  error?: string;
}

interface StopAuctionResult {
  success: boolean;
  item_id?: string;
  item_name?: string;
  error?: string;
  message?: string;
}

// Store active countdown intervals
const activeCountdowns = new Map<string, NodeJS.Timeout>();

export class AuctionService {
  /**
   * Recover any stale auctions on server startup
   * This handles cases where the server restarted while auctions were active
   */
  async recoverStaleAuctions(io: TypedServer) {
    try {
      const activeItems = await prisma.item.findMany({
        where: { status: 'ACTIVE' },
        include: { raid: true },
      });

      logger.info({ count: activeItems.length }, 'Checking for stale auctions to recover');

      for (const item of activeItems) {
        const now = new Date();

        if (!item.ends_at || now > item.ends_at) {
          // Auction should have ended - complete it
          logger.info({ itemId: item.id, endsAt: item.ends_at }, 'Completing stale auction');
          await this.completeAuction(io, item.raid_id, item.id);
        } else {
          // Auction still has time - restart countdown
          logger.info({ itemId: item.id, remaining: item.ends_at.getTime() - now.getTime() }, 'Restarting countdown for active auction');
          this.startCountdown(io, item.raid_id, item.id);
        }
      }
    } catch (error) {
      logger.error({ error }, 'Failed to recover stale auctions');
    }
  }

  /**
   * Start an auction on an item
   */
  async startAuction(
    itemId: string,
    userId: string,
    duration?: number,
    minBid?: number,
    increment?: number
  ): Promise<StartAuctionResult> {
    try {
      // Validate duration
      const auctionDuration = duration || AUCTION_DEFAULTS.DURATION;
      if (
        auctionDuration < AUCTION_DEFAULTS.MIN_DURATION ||
        auctionDuration > AUCTION_DEFAULTS.MAX_DURATION
      ) {
        return {
          success: false,
          error: 'INVALID_DURATION',
          message: `Duration must be between ${AUCTION_DEFAULTS.MIN_DURATION} and ${AUCTION_DEFAULTS.MAX_DURATION} seconds`,
        };
      }

      return await prisma.$transaction(async (tx) => {
        // Get item and lock
        const item = await tx.item.findUnique({
          where: { id: itemId },
          include: {
            raid: {
              include: {
                participants: {
                  where: { user_id: userId },
                },
              },
            },
          },
        });

        if (!item) {
          return { success: false, error: 'AUCTION_NOT_FOUND' };
        }

        // Verify user is leader or officer
        const participant = item.raid.participants[0];
        if (!participant || !['LEADER', 'OFFICER'].includes(participant.role)) {
          return { success: false, error: 'RAID_NOT_LEADER', message: 'Only leaders/officers can start auctions' };
        }

        // Check raid is active
        if (item.raid.status !== 'ACTIVE') {
          return { success: false, error: 'RAID_NOT_ACTIVE', message: 'Raid must be active' };
        }

        // Check item is pending
        if (item.status !== 'PENDING') {
          return { success: false, error: 'AUCTION_ALREADY_STARTED', message: 'Auction already started or completed' };
        }

        // Check no other active auction in this raid
        const activeAuction = await tx.item.findFirst({
          where: {
            raid_id: item.raid_id,
            status: 'ACTIVE',
          },
        });

        if (activeAuction) {
          return { success: false, error: 'AUCTION_ALREADY_ACTIVE', message: 'Another auction is already active' };
        }

        // Start the auction
        const now = new Date();
        const endsAt = new Date(now.getTime() + auctionDuration * 1000);

        // Use provided values or item's defaults
        const startingBid = minBid !== undefined ? minBid : Number(item.starting_bid);
        const minIncrement = increment !== undefined ? increment : Number(item.min_increment);

        const updatedItem = await tx.item.update({
          where: { id: itemId },
          data: {
            status: 'ACTIVE',
            starting_bid: startingBid,
            current_bid: startingBid,
            min_increment: minIncrement,
            started_at: now,
            ends_at: endsAt,
            auction_duration: auctionDuration,
          },
        });

        logger.info({ itemId, userId, duration: auctionDuration, endsAt }, 'Auction started');

        return {
          success: true,
          item: {
            id: updatedItem.id,
            raid_id: updatedItem.raid_id,
            name: updatedItem.name,
            wowhead_id: updatedItem.wowhead_id,
            icon_url: updatedItem.icon_url,
            status: updatedItem.status,
            starting_bid: Number(updatedItem.starting_bid),
            current_bid: Number(updatedItem.current_bid),
            min_increment: Number(updatedItem.min_increment),
            winner_id: updatedItem.winner_id,
            auction_duration: updatedItem.auction_duration,
            started_at: updatedItem.started_at,
            ends_at: updatedItem.ends_at,
            completed_at: updatedItem.completed_at,
            is_bundle: updatedItem.is_bundle,
            bundle_item_names: updatedItem.bundle_item_names,
          },
        };
      });
    } catch (error) {
      logger.error({ itemId, userId, error }, 'Failed to start auction');
      throw error;
    }
  }

  /**
   * Start the countdown ticker for an auction
   */
  startCountdown(io: TypedServer, raidId: string, itemId: string) {
    // Clear any existing countdown for this item
    this.stopCountdown(itemId);

    const tick = async () => {
      try {
        const item = await prisma.item.findUnique({
          where: { id: itemId },
          select: { status: true, ends_at: true },
        });

        if (!item || item.status !== 'ACTIVE' || !item.ends_at) {
          this.stopCountdown(itemId);
          return;
        }

        const remaining = item.ends_at.getTime() - Date.now();

        if (remaining <= 0) {
          // Auction ended
          this.stopCountdown(itemId);
          await this.completeAuction(io, raidId, itemId);
          return;
        }

        // Send tick
        io.to(`raid:${raidId}`).emit('auction:tick', {
          item_id: itemId,
          remaining_ms: remaining,
        });

        // Send ending warning
        if (remaining <= AUCTION_DEFAULTS.ENDING_WARNING_MS && remaining > AUCTION_DEFAULTS.ENDING_WARNING_MS - AUCTION_DEFAULTS.TICK_INTERVAL_MS) {
          io.to(`raid:${raidId}`).emit('auction:ending', {
            item_id: itemId,
            remaining_ms: remaining,
          });
        }
      } catch (error) {
        logger.error({ itemId, error }, 'Countdown tick error');
      }
    };

    // Start ticking every second
    const interval = setInterval(tick, AUCTION_DEFAULTS.TICK_INTERVAL_MS);
    activeCountdowns.set(itemId, interval);

    // Initial tick
    tick();
  }

  /**
   * Stop the countdown for an item
   */
  stopCountdown(itemId: string) {
    const interval = activeCountdowns.get(itemId);
    if (interval) {
      clearInterval(interval);
      activeCountdowns.delete(itemId);
    }
  }

  /**
   * Complete an auction and transfer gold
   */
  async completeAuction(
    io: TypedServer,
    raidId: string,
    itemId: string
  ): Promise<CompleteAuctionResult> {
    try {
      return await prisma.$transaction(
        async (tx) => {
          // Lock item
          const items = await tx.$queryRaw<
            Array<{
              id: string;
              raid_id: string;
              name: string;
              status: string;
              current_bid: Prisma.Decimal;
              winner_id: string | null;
            }>
          >`
            SELECT id, raid_id, name, status, current_bid, winner_id
            FROM "Item"
            WHERE id = ${itemId}::uuid
            FOR UPDATE
          `;

          const item = items[0];
          if (!item || item.status !== 'ACTIVE') {
            return { success: false, had_winner: false, error: 'INVALID_AUCTION_STATE' };
          }

          // Get winning bid
          const winningBid = await tx.bid.findFirst({
            where: { item_id: itemId, is_winning: true },
            include: {
              user: { select: { id: true, discord_username: true, gold_balance: true } },
            },
          });

          if (!winningBid) {
            // No bids - mark as completed without winner
            await tx.item.update({
              where: { id: itemId },
              data: {
                status: 'COMPLETED',
                completed_at: new Date(),
              },
            });

            io.to(`raid:${raidId}`).emit('auction:ended', {
              item_id: itemId,
              item_name: item.name,
              winner_id: null,
              winner_name: null,
              final_amount: 0,
              pot_total: 0,
            });

            return { success: true, had_winner: false };
          }

          const winner = winningBid.user;
          const finalAmount = Number(winningBid.amount);

          // Lock winner's account
          await tx.$queryRaw`
            SELECT id FROM "User" WHERE id = ${winner.id}::uuid FOR UPDATE
          `;

          // Deduct gold from winner
          await tx.user.update({
            where: { id: winner.id },
            data: { gold_balance: { decrement: finalAmount } },
          });

          // Create transaction record
          await tx.transaction.create({
            data: {
              user_id: winner.id,
              type: 'AUCTION_WIN',
              gold_amount: -finalAmount,
              status: 'COMPLETED',
              completed_at: new Date(),
              metadata: {
                item_id: itemId,
                item_name: item.name,
                raid_id: item.raid_id,
              },
            },
          });

          // Update raid pot
          const updatedRaid = await tx.raid.update({
            where: { id: item.raid_id },
            data: { pot_total: { increment: finalAmount } },
          });

          // Mark item completed
          await tx.item.update({
            where: { id: itemId },
            data: {
              status: 'COMPLETED',
              completed_at: new Date(),
              winner_id: winner.id,
            },
          });

          logger.info(
            { itemId, winnerId: winner.id, amount: finalAmount },
            'Auction completed'
          );

          // Emit to all participants
          io.to(`raid:${raidId}`).emit('auction:ended', {
            item_id: itemId,
            item_name: item.name,
            winner_id: winner.id,
            winner_name: winner.discord_username,
            final_amount: finalAmount,
            pot_total: Number(updatedRaid.pot_total),
          });

          // Update winner's wallet via private channel
          const newBalance = Number(winner.gold_balance) - finalAmount;
          io.to(`user:${winner.id}`).emit('wallet:updated', {
            balance: newBalance,
            locked_amount: 0, // Will be recalculated client-side
          });

          return {
            success: true,
            had_winner: true,
            winner_id: winner.id,
            winner_name: winner.discord_username,
            final_amount: finalAmount,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 15000,
        }
      );
    } catch (error) {
      logger.error({ itemId, error }, 'Failed to complete auction');
      throw error;
    }
  }

  /**
   * Stop an auction and return item to PENDING status
   * Any winning bid is released (no longer locked)
   */
  async stopAuction(
    io: TypedServer,
    raidId: string,
    itemId: string,
    userId: string
  ): Promise<StopAuctionResult> {
    try {
      return await prisma.$transaction(async (tx) => {
        // Get item and verify user is leader/officer
        const item = await tx.item.findUnique({
          where: { id: itemId },
          include: {
            raid: {
              include: {
                participants: {
                  where: { user_id: userId },
                },
              },
            },
          },
        });

        if (!item) {
          return { success: false, error: 'ITEM_NOT_FOUND', message: 'Item not found' };
        }

        if (item.raid_id !== raidId) {
          return { success: false, error: 'INVALID_RAID', message: 'Item does not belong to this raid' };
        }

        const participant = item.raid.participants[0];
        if (!participant || !['LEADER', 'OFFICER'].includes(participant.role)) {
          return { success: false, error: 'RAID_NOT_LEADER', message: 'Only leaders/officers can stop auctions' };
        }

        if (item.status !== 'ACTIVE') {
          return { success: false, error: 'AUCTION_NOT_ACTIVE', message: 'Auction is not active' };
        }

        // Stop the countdown
        this.stopCountdown(itemId);

        // Clear all bids for this item (releases locked gold)
        await tx.bid.deleteMany({
          where: { item_id: itemId },
        });

        // Reset item to PENDING
        await tx.item.update({
          where: { id: itemId },
          data: {
            status: 'PENDING',
            current_bid: item.starting_bid,
            winner_id: null,
            started_at: null,
            ends_at: null,
          },
        });

        logger.info({ itemId, userId }, 'Auction stopped');

        // Emit to all participants
        io.to(`raid:${raidId}`).emit('auction:stopped', {
          item_id: itemId,
          item_name: item.name,
        });

        // Notify raid to refresh (item back in queue)
        io.to(`raid:${raidId}`).emit('raid:updated', { raid_id: raidId, items_changed: true });

        return {
          success: true,
          item_id: itemId,
          item_name: item.name,
        };
      });
    } catch (error) {
      logger.error({ itemId, userId, error }, 'Failed to stop auction');
      throw error;
    }
  }

  /**
   * Skip an auction and mark item as unsold (COMPLETED with no winner)
   * Any winning bid is released (no longer locked)
   */
  async skipAuction(
    io: TypedServer,
    raidId: string,
    itemId: string,
    userId: string
  ): Promise<StopAuctionResult> {
    try {
      return await prisma.$transaction(async (tx) => {
        // Get item and verify user is leader/officer
        const item = await tx.item.findUnique({
          where: { id: itemId },
          include: {
            raid: {
              include: {
                participants: {
                  where: { user_id: userId },
                },
              },
            },
          },
        });

        if (!item) {
          return { success: false, error: 'ITEM_NOT_FOUND', message: 'Item not found' };
        }

        if (item.raid_id !== raidId) {
          return { success: false, error: 'INVALID_RAID', message: 'Item does not belong to this raid' };
        }

        const participant = item.raid.participants[0];
        if (!participant || !['LEADER', 'OFFICER'].includes(participant.role)) {
          return { success: false, error: 'RAID_NOT_LEADER', message: 'Only leaders/officers can skip auctions' };
        }

        if (item.status !== 'ACTIVE') {
          return { success: false, error: 'AUCTION_NOT_ACTIVE', message: 'Auction is not active' };
        }

        // Stop the countdown
        this.stopCountdown(itemId);

        // Clear all bids for this item (releases locked gold)
        await tx.bid.deleteMany({
          where: { item_id: itemId },
        });

        // Mark item as COMPLETED with no winner (unsold)
        await tx.item.update({
          where: { id: itemId },
          data: {
            status: 'COMPLETED',
            current_bid: 0,
            winner_id: null,
            completed_at: new Date(),
          },
        });

        logger.info({ itemId, userId }, 'Auction skipped');

        // Emit to all participants
        io.to(`raid:${raidId}`).emit('auction:skipped', {
          item_id: itemId,
          item_name: item.name,
        });

        // Notify raid to refresh (item in unsold section)
        io.to(`raid:${raidId}`).emit('raid:updated', { raid_id: raidId, items_changed: true });

        return {
          success: true,
          item_id: itemId,
          item_name: item.name,
        };
      });
    } catch (error) {
      logger.error({ itemId, userId, error }, 'Failed to skip auction');
      throw error;
    }
  }
}
