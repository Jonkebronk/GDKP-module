import { Prisma } from '@gdkp/prisma-client';
import { prisma } from '../config/database.js';
import { AUCTION_DEFAULTS, isValidBidAmount, MAX_BID_AMOUNT } from '@gdkp/shared';
import { logger } from '../config/logger.js';

interface PlaceBidResult {
  success: boolean;
  bid?: {
    id: string;
    item_id: string;
    user_id: string;
    amount: Prisma.Decimal;
    is_winning: boolean;
    created_at: Date;
  };
  error?: string;
  min_required?: number;
  new_end_time?: Date;
  previous_winner_id?: string | null;
}

export class BidService {
  /**
   * Place a bid on an item with full atomic transaction handling
   */
  async placeBid(
    userId: string,
    itemId: string,
    amount: number
  ): Promise<PlaceBidResult> {
    // Basic validation
    if (!Number.isInteger(amount) || amount <= 0) {
      return { success: false, error: 'BID_INVALID_AMOUNT' };
    }

    if (amount > MAX_BID_AMOUNT) {
      return { success: false, error: 'BID_EXCEEDS_MAX' };
    }

    try {
      return await prisma.$transaction(
        async (tx) => {
          // 1. Lock and get item with FOR UPDATE
          const items = await tx.$queryRaw<
            Array<{
              id: string;
              raid_id: string;
              status: string;
              current_bid: Prisma.Decimal;
              min_increment: Prisma.Decimal;
              winner_id: string | null;
              ends_at: Date | null;
            }>
          >`
            SELECT id, raid_id, status, current_bid, min_increment, winner_id, ends_at
            FROM "Item"
            WHERE id = ${itemId}::uuid
            FOR UPDATE
          `;

          const item = items[0];
          if (!item) {
            return { success: false, error: 'AUCTION_NOT_FOUND' };
          }

          // 2. Validate auction is active
          if (item.status !== 'ACTIVE') {
            return { success: false, error: 'AUCTION_NOT_ACTIVE' };
          }

          // 3. Validate auction hasn't ended
          const now = new Date();
          if (!item.ends_at || now > item.ends_at) {
            return { success: false, error: 'AUCTION_ENDED' };
          }

          // 4. Validate bid amount
          const currentBid = Number(item.current_bid);
          const minIncrement = Number(item.min_increment);
          const minRequired = currentBid > 0 ? currentBid + minIncrement : minIncrement;

          if (amount < minRequired) {
            return { success: false, error: 'BID_TOO_LOW', min_required: minRequired };
          }

          // 5. Prevent bidding on own winning bid
          if (item.winner_id === userId) {
            return { success: false, error: 'BID_ALREADY_WINNING' };
          }

          // 6. Lock user and check balance
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

          // 7. Calculate locked amount (sum of user's winning bids in active auctions)
          const lockedResult = await tx.bid.aggregate({
            where: {
              user_id: userId,
              is_winning: true,
              item: { status: 'ACTIVE' },
            },
            _sum: { amount: true },
          });

          const lockedAmount = Number(lockedResult._sum.amount || 0);
          const availableBalance = Number(user.gold_balance) - lockedAmount;

          if (availableBalance < amount) {
            return { success: false, error: 'BID_INSUFFICIENT_BALANCE' };
          }

          // 8. Remove winning status from previous winning bid
          await tx.bid.updateMany({
            where: { item_id: itemId, is_winning: true },
            data: { is_winning: false },
          });

          // 9. Create new bid
          const bid = await tx.bid.create({
            data: {
              item_id: itemId,
              user_id: userId,
              amount,
              is_winning: true,
            },
          });

          // 10. Calculate if anti-snipe should trigger
          let newEndTime: Date | undefined;
          const timeRemaining = item.ends_at!.getTime() - now.getTime();

          if (timeRemaining < AUCTION_DEFAULTS.ANTI_SNIPE_THRESHOLD_MS) {
            newEndTime = new Date(now.getTime() + AUCTION_DEFAULTS.ANTI_SNIPE_EXTENSION_MS);
          }

          // 11. Update item with new bid info
          await tx.item.update({
            where: { id: itemId },
            data: {
              current_bid: amount,
              winner_id: userId,
              ends_at: newEndTime || item.ends_at,
              version: { increment: 1 },
            },
          });

          logger.info(
            { userId, itemId, amount, previousBid: currentBid, extended: !!newEndTime },
            'Bid placed successfully'
          );

          return {
            success: true,
            bid,
            new_end_time: newEndTime,
            previous_winner_id: item.winner_id,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 10000,
        }
      );
    } catch (error) {
      logger.error({ userId, itemId, amount, error }, 'Failed to place bid');

      // Handle serialization failures (concurrent bid conflicts)
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
   * Get the total locked amount for a user (winning bids in active auctions)
   */
  async getLockedAmount(userId: string): Promise<number> {
    const result = await prisma.bid.aggregate({
      where: {
        user_id: userId,
        is_winning: true,
        item: { status: 'ACTIVE' },
      },
      _sum: { amount: true },
    });

    return Number(result._sum.amount || 0);
  }

  /**
   * Get available balance for a user
   */
  async getAvailableBalance(userId: string): Promise<number> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { gold_balance: true },
    });

    if (!user) return 0;

    const locked = await this.getLockedAmount(userId);
    return Number(user.gold_balance) - locked;
  }
}
