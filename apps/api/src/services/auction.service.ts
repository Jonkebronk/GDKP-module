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

// Store active countdown intervals
const activeCountdowns = new Map<string, NodeJS.Timeout>();

export class AuctionService {
  /**
   * Start an auction on an item
   */
  async startAuction(
    itemId: string,
    userId: string,
    duration?: number,
    minBid?: number
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

        // Use provided minBid or item's default starting_bid
        const startingBid = minBid !== undefined ? minBid : Number(item.starting_bid);

        const updatedItem = await tx.item.update({
          where: { id: itemId },
          data: {
            status: 'ACTIVE',
            starting_bid: startingBid,
            current_bid: startingBid,
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
}
