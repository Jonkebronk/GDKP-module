import { Prisma } from '@gdkp/prisma-client';
import { prisma } from '../config/database.js';
import { logger } from '../config/logger.js';
import type { TypedServer } from '../socket/index.js';
import type { PreAuctionFilters, PreAuctionItem, PreAuctionItemWithBids } from '@gdkp/shared';

interface LockRosterResult {
  success: boolean;
  error?: string;
  message?: string;
  preauction_ends_at?: Date;
  item_count?: number;
}

interface PlaceBidResult {
  success: boolean;
  bid?: {
    id: string;
    pre_auction_item_id: string;
    user_id: string;
    amount: Prisma.Decimal;
    is_winning: boolean;
    created_at: Date;
  };
  error?: string;
  min_required?: number;
  previous_winner_id?: string | null;
}

interface ClaimPreAuctionResult {
  success: boolean;
  error?: string;
  message?: string;
  winner_id?: string;
  winner_name?: string;
  amount?: number;
  item_id?: string;
}

export class PreAuctionService {
  /**
   * Lock the roster and start pre-auctions for all items in selected raid instances
   */
  async lockRosterAndStartPreAuction(
    raidId: string,
    userId: string,
    durationHours: number
  ): Promise<LockRosterResult> {
    if (durationHours < 1 || durationHours > 72) {
      return { success: false, error: 'INVALID_DURATION', message: 'Duration must be between 1 and 72 hours' };
    }

    try {
      return await prisma.$transaction(async (tx) => {
        // Get raid and verify user is leader
        const raid = await tx.raid.findUnique({
          where: { id: raidId },
          include: {
            participants: {
              where: { user_id: userId },
            },
          },
        });

        if (!raid) {
          return { success: false, error: 'RAID_NOT_FOUND' };
        }

        const participant = raid.participants[0];
        if (!participant || participant.role !== 'LEADER') {
          return { success: false, error: 'RAID_NOT_LEADER', message: 'Only leaders can lock roster' };
        }

        if (raid.roster_locked_at) {
          return { success: false, error: 'ROSTER_ALREADY_LOCKED', message: 'Roster is already locked' };
        }

        if (raid.status !== 'PENDING') {
          return { success: false, error: 'INVALID_RAID_STATUS', message: 'Raid must be in PENDING status' };
        }

        // Get all items from the raid's instances
        const items = await tx.tbcRaidItem.findMany({
          where: {
            raid_instance: { in: raid.instances },
            quality: { gte: 3 }, // Only rare+ items
          },
        });

        if (items.length === 0) {
          return { success: false, error: 'NO_ITEMS', message: 'No items found for selected instances' };
        }

        const now = new Date();
        const endsAt = new Date(now.getTime() + durationHours * 60 * 60 * 1000);

        // Lock roster and set pre-auction end time
        await tx.raid.update({
          where: { id: raidId },
          data: {
            roster_locked_at: now,
            preauction_ends_at: endsAt,
          },
        });

        // Create pre-auction items for all TBC items
        await tx.preAuctionItem.createMany({
          data: items.map((item) => ({
            raid_id: raidId,
            tbc_item_id: item.id,
            status: 'ACTIVE',
            current_bid: 0,
            min_increment: 10,
            ends_at: endsAt,
          })),
        });

        logger.info(
          { raidId, userId, itemCount: items.length, endsAt },
          'Roster locked and pre-auction started'
        );

        return {
          success: true,
          preauction_ends_at: endsAt,
          item_count: items.length,
        };
      });
    } catch (error) {
      logger.error({ raidId, userId, error }, 'Failed to lock roster and start pre-auction');
      throw error;
    }
  }

  /**
   * Place a bid on a pre-auction item
   */
  async placeBid(
    userId: string,
    preAuctionItemId: string,
    amount: number
  ): Promise<PlaceBidResult> {
    if (!Number.isInteger(amount) || amount <= 0) {
      return { success: false, error: 'BID_INVALID_AMOUNT' };
    }

    try {
      return await prisma.$transaction(
        async (tx) => {
          // Lock and get pre-auction item
          const items = await tx.$queryRaw<
            Array<{
              id: string;
              raid_id: string;
              status: string;
              current_bid: Prisma.Decimal;
              min_increment: Prisma.Decimal;
              winner_id: string | null;
              ends_at: Date;
            }>
          >`
            SELECT id, raid_id, status, current_bid, min_increment, winner_id, ends_at
            FROM "PreAuctionItem"
            WHERE id = ${preAuctionItemId}::uuid
            FOR UPDATE
          `;

          const item = items[0];
          if (!item) {
            return { success: false, error: 'PRE_AUCTION_NOT_FOUND' };
          }

          // Validate pre-auction is active
          if (item.status !== 'ACTIVE') {
            return { success: false, error: 'PRE_AUCTION_NOT_ACTIVE' };
          }

          // Validate pre-auction hasn't ended
          const now = new Date();
          if (now > item.ends_at) {
            return { success: false, error: 'PRE_AUCTION_ENDED' };
          }

          // Verify user is a participant in the raid
          const participant = await tx.raidParticipant.findUnique({
            where: {
              raid_id_user_id: {
                raid_id: item.raid_id,
                user_id: userId,
              },
            },
          });

          if (!participant) {
            return { success: false, error: 'NOT_IN_RAID', message: 'You must be in the raid to bid' };
          }

          // Validate bid amount
          const currentBid = Number(item.current_bid);
          const minIncrement = Number(item.min_increment);
          const minRequired = currentBid > 0 ? currentBid + minIncrement : minIncrement;

          if (amount < minRequired) {
            return { success: false, error: 'BID_TOO_LOW', min_required: minRequired };
          }

          // Prevent bidding on own winning bid
          if (item.winner_id === userId) {
            return { success: false, error: 'BID_ALREADY_WINNING' };
          }

          // Lock user and check balance
          const users = await tx.$queryRaw<
            Array<{ id: string; gold_balance: Prisma.Decimal }>
          >`
            SELECT id, gold_balance
            FROM "User"
            WHERE id = ${userId}::uuid
            FOR UPDATE
          `;

          const user = users[0];
          if (!user) {
            return { success: false, error: 'USER_NOT_FOUND' };
          }

          // Calculate locked amount (winning bids in active auctions + pre-auctions)
          const liveAuctionLocked = await tx.bid.aggregate({
            where: {
              user_id: userId,
              is_winning: true,
              item: { status: 'ACTIVE' },
            },
            _sum: { amount: true },
          });

          const preAuctionLocked = await tx.preAuctionBid.aggregate({
            where: {
              user_id: userId,
              is_winning: true,
              pre_auction_item: {
                status: { in: ['ACTIVE', 'ENDED'] },
              },
            },
            _sum: { amount: true },
          });

          const lockedAmount = Number(liveAuctionLocked._sum.amount || 0) + Number(preAuctionLocked._sum.amount || 0);
          const availableBalance = Number(user.gold_balance) - lockedAmount;

          if (availableBalance < amount) {
            return { success: false, error: 'BID_INSUFFICIENT_BALANCE' };
          }

          // Remove winning status from previous winning bid
          await tx.preAuctionBid.updateMany({
            where: { pre_auction_item_id: preAuctionItemId, is_winning: true },
            data: { is_winning: false },
          });

          // Create new bid
          const bid = await tx.preAuctionBid.create({
            data: {
              pre_auction_item_id: preAuctionItemId,
              user_id: userId,
              amount,
              is_winning: true,
            },
          });

          // Update pre-auction item with new bid info
          await tx.preAuctionItem.update({
            where: { id: preAuctionItemId },
            data: {
              current_bid: amount,
              winner_id: userId,
            },
          });

          logger.info(
            { userId, preAuctionItemId, amount, previousBid: currentBid },
            'Pre-auction bid placed successfully'
          );

          return {
            success: true,
            bid,
            previous_winner_id: item.winner_id,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 10000,
        }
      );
    } catch (error) {
      logger.error({ userId, preAuctionItemId, amount, error }, 'Failed to place pre-auction bid');

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      ) {
        return { success: false, error: 'BID_CONFLICT_RETRY' };
      }

      throw error;
    }
  }

  /**
   * Get pre-auction items for a raid with optional filters
   */
  async getPreAuctionItems(
    raidId: string,
    filters?: PreAuctionFilters
  ): Promise<PreAuctionItem[]> {
    const where: Prisma.PreAuctionItemWhereInput = {
      raid_id: raidId,
    };

    // Build TBC item filters
    const tbcItemWhere: Prisma.TbcRaidItemWhereInput = {};

    if (filters?.slot) {
      tbcItemWhere.slot = filters.slot;
    }
    if (filters?.quality !== undefined) {
      tbcItemWhere.quality = filters.quality;
    }
    if (filters?.boss) {
      tbcItemWhere.boss_name = filters.boss;
    }
    if (filters?.search) {
      tbcItemWhere.name = { contains: filters.search, mode: 'insensitive' };
    }
    if (filters?.status) {
      where.status = filters.status;
    }

    if (Object.keys(tbcItemWhere).length > 0) {
      where.tbc_item = tbcItemWhere;
    }

    const items = await prisma.preAuctionItem.findMany({
      where,
      include: {
        tbc_item: true,
        winner: {
          select: {
            id: true,
            discord_username: true,
            alias: true,
            discord_avatar: true,
          },
        },
        _count: {
          select: { bids: true },
        },
      },
      orderBy: [
        { tbc_item: { quality: 'desc' } },
        { tbc_item: { name: 'asc' } },
      ],
    });

    return items.map((item) => ({
      id: item.id,
      raid_id: item.raid_id,
      tbc_item_id: item.tbc_item_id,
      status: item.status as PreAuctionItem['status'],
      current_bid: Number(item.current_bid),
      min_increment: Number(item.min_increment),
      winner_id: item.winner_id,
      ends_at: item.ends_at,
      created_at: item.created_at,
      tbc_item: item.tbc_item,
      winner: item.winner,
    }));
  }

  /**
   * Get a single pre-auction item with full bid history
   */
  async getPreAuctionItemWithBids(
    preAuctionItemId: string
  ): Promise<PreAuctionItemWithBids | null> {
    const item = await prisma.preAuctionItem.findUnique({
      where: { id: preAuctionItemId },
      include: {
        tbc_item: true,
        winner: {
          select: {
            id: true,
            discord_username: true,
            alias: true,
            discord_avatar: true,
          },
        },
        bids: {
          orderBy: { created_at: 'desc' },
          take: 50,
          include: {
            user: {
              select: {
                id: true,
                discord_username: true,
                alias: true,
                discord_avatar: true,
              },
            },
          },
        },
      },
    });

    if (!item) return null;

    return {
      id: item.id,
      raid_id: item.raid_id,
      tbc_item_id: item.tbc_item_id,
      status: item.status as PreAuctionItem['status'],
      current_bid: Number(item.current_bid),
      min_increment: Number(item.min_increment),
      winner_id: item.winner_id,
      ends_at: item.ends_at,
      created_at: item.created_at,
      tbc_item: item.tbc_item,
      winner: item.winner,
      bids: item.bids.map((bid) => ({
        id: bid.id,
        pre_auction_item_id: bid.pre_auction_item_id,
        user_id: bid.user_id,
        amount: Number(bid.amount),
        is_winning: bid.is_winning,
        created_at: bid.created_at,
        user: bid.user,
      })),
      bid_count: item.bids.length,
    };
  }

  /**
   * End all pre-auctions for a raid when the timer expires
   */
  async endPreAuctionsForRaid(io: TypedServer, raidId: string): Promise<void> {
    try {
      const result = await prisma.$transaction(async (tx) => {
        // Update all active pre-auction items to ENDED
        const updated = await tx.preAuctionItem.updateMany({
          where: {
            raid_id: raidId,
            status: 'ACTIVE',
          },
          data: {
            status: 'ENDED',
          },
        });

        // Get counts for the event
        const withWinners = await tx.preAuctionItem.count({
          where: {
            raid_id: raidId,
            status: 'ENDED',
            winner_id: { not: null },
          },
        });

        const withoutWinners = await tx.preAuctionItem.count({
          where: {
            raid_id: raidId,
            status: 'ENDED',
            winner_id: null,
          },
        });

        return { updated: updated.count, withWinners, withoutWinners };
      });

      logger.info(
        { raidId, ...result },
        'Pre-auctions ended for raid'
      );

      // Emit to all raid participants
      io.to(`raid:${raidId}`).emit('preauction:ended', {
        raid_id: raidId,
        ended_at: new Date().toISOString(),
        items_with_winners: result.withWinners,
        items_without_winners: result.withoutWinners,
      });
    } catch (error) {
      logger.error({ raidId, error }, 'Failed to end pre-auctions for raid');
      throw error;
    }
  }

  /**
   * Claim a pre-auction winner when an item drops during the raid
   * Returns the pre-auction winner info if exists, or null if no pre-bid
   */
  async claimPreAuctionWinner(
    io: TypedServer,
    raidId: string,
    wowheadId: number
  ): Promise<ClaimPreAuctionResult> {
    try {
      return await prisma.$transaction(
        async (tx) => {
          // Find the pre-auction item for this wowhead_id in this raid
          const preAuctionItem = await tx.preAuctionItem.findFirst({
            where: {
              raid_id: raidId,
              tbc_item: { wowhead_id: wowheadId },
              status: 'ENDED',
              winner_id: { not: null },
            },
            include: {
              tbc_item: true,
              winner: {
                select: {
                  id: true,
                  discord_username: true,
                  alias: true,
                  gold_balance: true,
                },
              },
            },
          });

          if (!preAuctionItem || !preAuctionItem.winner) {
            return { success: false, error: 'NO_PRE_AUCTION_WINNER' };
          }

          const winner = preAuctionItem.winner;
          const amount = Number(preAuctionItem.current_bid);

          // Lock winner's account
          await tx.$queryRaw`
            SELECT id FROM "User" WHERE id = ${winner.id}::uuid FOR UPDATE
          `;

          // Deduct gold from winner
          await tx.user.update({
            where: { id: winner.id },
            data: { gold_balance: { decrement: amount } },
          });

          // Create transaction record
          await tx.transaction.create({
            data: {
              user_id: winner.id,
              type: 'AUCTION_WIN',
              gold_amount: -amount,
              status: 'COMPLETED',
              completed_at: new Date(),
              metadata: {
                pre_auction_item_id: preAuctionItem.id,
                item_name: preAuctionItem.tbc_item.name,
                raid_id: raidId,
                is_pre_auction: true,
              },
            },
          });

          // Update raid pot
          await tx.raid.update({
            where: { id: raidId },
            data: { pot_total: { increment: amount } },
          });

          // Mark pre-auction item as claimed
          await tx.preAuctionItem.update({
            where: { id: preAuctionItem.id },
            data: { status: 'CLAIMED' },
          });

          // Create the Item record with COMPLETED status
          const item = await tx.item.create({
            data: {
              raid_id: raidId,
              name: preAuctionItem.tbc_item.name,
              wowhead_id: preAuctionItem.tbc_item.wowhead_id,
              icon_url: `https://wow.zamimg.com/images/wow/icons/large/${preAuctionItem.tbc_item.icon}.jpg`,
              quality: preAuctionItem.tbc_item.quality,
              status: 'COMPLETED',
              starting_bid: 0,
              current_bid: amount,
              min_increment: 10,
              winner_id: winner.id,
              completed_at: new Date(),
            },
          });

          logger.info(
            { raidId, wowheadId, winnerId: winner.id, amount },
            'Pre-auction item claimed'
          );

          // Emit to all raid participants
          io.to(`raid:${raidId}`).emit('preauction:item:claimed', {
            pre_auction_item_id: preAuctionItem.id,
            item_name: preAuctionItem.tbc_item.name,
            winner_id: winner.id,
            winner_name: winner.alias || winner.discord_username,
            amount,
          });

          // Update winner's wallet via private channel
          const newBalance = Number(winner.gold_balance) - amount;
          io.to(`user:${winner.id}`).emit('wallet:updated', {
            balance: newBalance,
            locked_amount: 0, // Will be recalculated client-side
          });

          return {
            success: true,
            winner_id: winner.id,
            winner_name: winner.alias || winner.discord_username,
            amount,
            item_id: item.id,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 15000,
        }
      );
    } catch (error) {
      logger.error({ raidId, wowheadId, error }, 'Failed to claim pre-auction winner');
      throw error;
    }
  }

  /**
   * Handle user leaving raid - reassign their winning pre-auction bids
   */
  async handleUserLeavingRaid(
    io: TypedServer,
    raidId: string,
    userId: string
  ): Promise<void> {
    try {
      await prisma.$transaction(async (tx) => {
        // Find all pre-auction items where this user is the winner
        const affectedItems = await tx.preAuctionItem.findMany({
          where: {
            raid_id: raidId,
            winner_id: userId,
            status: { in: ['ACTIVE', 'ENDED'] },
          },
          include: {
            tbc_item: true,
            bids: {
              orderBy: { amount: 'desc' },
              take: 2, // Get top 2 bids
              include: {
                user: {
                  select: {
                    id: true,
                    discord_username: true,
                    alias: true,
                  },
                },
              },
            },
          },
        });

        for (const item of affectedItems) {
          // Mark user's winning bid as not winning
          await tx.preAuctionBid.updateMany({
            where: {
              pre_auction_item_id: item.id,
              user_id: userId,
              is_winning: true,
            },
            data: { is_winning: false },
          });

          // Find next highest bid (not from leaving user)
          const nextBid = item.bids.find((b) => b.user_id !== userId);

          if (nextBid) {
            // Promote next highest bidder
            await tx.preAuctionBid.update({
              where: { id: nextBid.id },
              data: { is_winning: true },
            });

            await tx.preAuctionItem.update({
              where: { id: item.id },
              data: {
                winner_id: nextBid.user_id,
                current_bid: nextBid.amount,
              },
            });

            logger.info(
              { itemId: item.id, previousWinner: userId, newWinner: nextBid.user_id },
              'Pre-auction winner reassigned'
            );

            // Emit update
            io.to(`raid:${raidId}`).emit('preauction:item:updated', {
              item: {
                id: item.id,
                raid_id: item.raid_id,
                tbc_item_id: item.tbc_item_id,
                status: item.status as PreAuctionItem['status'],
                current_bid: Number(nextBid.amount),
                min_increment: Number(item.min_increment),
                winner_id: nextBid.user_id,
                ends_at: item.ends_at,
                created_at: item.created_at,
                tbc_item: item.tbc_item,
                winner: nextBid.user
                  ? {
                      id: nextBid.user.id,
                      discord_username: nextBid.user.discord_username,
                      alias: nextBid.user.alias,
                      discord_avatar: null,
                    }
                  : undefined,
              },
            });
          } else {
            // No other bids - reset item
            await tx.preAuctionItem.update({
              where: { id: item.id },
              data: {
                winner_id: null,
                current_bid: 0,
              },
            });

            logger.info({ itemId: item.id, previousWinner: userId }, 'Pre-auction winner cleared');

            io.to(`raid:${raidId}`).emit('preauction:item:updated', {
              item: {
                id: item.id,
                raid_id: item.raid_id,
                tbc_item_id: item.tbc_item_id,
                status: item.status as PreAuctionItem['status'],
                current_bid: 0,
                min_increment: Number(item.min_increment),
                winner_id: null,
                ends_at: item.ends_at,
                created_at: item.created_at,
                tbc_item: item.tbc_item,
              },
            });
          }
        }
      });
    } catch (error) {
      logger.error({ raidId, userId, error }, 'Failed to handle user leaving raid for pre-auction');
      throw error;
    }
  }

  /**
   * Get the total locked amount from pre-auctions for a user
   */
  async getPreAuctionLockedAmount(userId: string): Promise<number> {
    const result = await prisma.preAuctionBid.aggregate({
      where: {
        user_id: userId,
        is_winning: true,
        pre_auction_item: {
          status: { in: ['ACTIVE', 'ENDED'] },
        },
      },
      _sum: { amount: true },
    });

    return Number(result._sum.amount || 0);
  }

  /**
   * Recover stale pre-auctions on server startup
   */
  async recoverStalePreAuctions(io: TypedServer): Promise<void> {
    try {
      const now = new Date();

      // Find raids with expired pre-auctions that are still ACTIVE
      const raids = await prisma.raid.findMany({
        where: {
          preauction_ends_at: { lt: now },
          pre_auction_items: {
            some: { status: 'ACTIVE' },
          },
        },
        select: { id: true },
      });

      logger.info({ count: raids.length }, 'Checking for stale pre-auctions to recover');

      for (const raid of raids) {
        await this.endPreAuctionsForRaid(io, raid.id);
      }
    } catch (error) {
      logger.error({ error }, 'Failed to recover stale pre-auctions');
    }
  }
}
