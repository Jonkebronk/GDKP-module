import { Prisma } from '@gdkp/prisma-client';
import { prisma } from '../config/database.js';
import { logger } from '../config/logger.js';
import type { TypedServer } from '../socket/index.js';
import type { SplitConfig } from '@gdkp/shared';

interface ParticipantShare {
  user_id: string;
  discord_username: string;
  alias?: string | null;
  role: string;
  share_amount: number;
  share_percentage: number;
  total_spent: number;
  net_amount: number;
}

interface DistributionPreview {
  raid_id: string;
  raid_name: string;
  pot_total: number;
  leader_cut: number;
  leader_cut_amount: number;
  member_share: number;
  participant_count: number;
  shares: ParticipantShare[];
}

interface DistributionResult {
  success: boolean;
  pot_total?: number;
  distributed_amount?: number;
  participant_count?: number;
  error?: string;
  message?: string;
}

export class PotDistributionService {
  /**
   * Calculate the distribution preview without executing
   */
  async calculateDistribution(raidId: string): Promise<DistributionPreview | null> {
    const raid = await prisma.raid.findUnique({
      where: { id: raidId },
      include: {
        participants: {
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

    if (!raid) {
      return null;
    }

    const potTotal = Number(raid.pot_total);
    const splitConfig = raid.split_config as SplitConfig;
    const participants = raid.participants;

    // Fetch items won to calculate spending per user
    const itemsWon = await prisma.item.findMany({
      where: {
        raid_id: raidId,
        status: 'COMPLETED',
        winner_id: { not: null },
      },
      select: {
        winner_id: true,
        current_bid: true,
      },
    });

    // Build spending map per user
    const spendingByUser = new Map<string, number>();
    for (const item of itemsWon) {
      if (item.winner_id) {
        const current = spendingByUser.get(item.winner_id) || 0;
        spendingByUser.set(item.winner_id, current + Number(item.current_bid));
      }
    }

    if (participants.length === 0) {
      return {
        raid_id: raid.id,
        raid_name: raid.name,
        pot_total: potTotal,
        leader_cut: 0,
        leader_cut_amount: 0,
        member_share: 0,
        participant_count: 0,
        shares: [],
      };
    }

    // Calculate leader cut
    const leaderCutPercent = splitConfig.leader_cut_percent || 0;
    const leaderCutAmount = Math.floor(potTotal * (leaderCutPercent / 100));
    const remainingPot = potTotal - leaderCutAmount;

    // Calculate shares based on split type
    const shares = this.calculateShares(
      participants,
      remainingPot,
      leaderCutAmount,
      raid.leader_id,
      splitConfig,
      spendingByUser
    );

    return {
      raid_id: raid.id,
      raid_name: raid.name,
      pot_total: potTotal,
      leader_cut: leaderCutPercent,
      leader_cut_amount: leaderCutAmount,
      member_share: participants.length > 0 ? Math.floor(remainingPot / participants.length) : 0,
      participant_count: participants.length,
      shares,
    };
  }

  /**
   * Calculate individual shares based on split configuration
   */
  private calculateShares(
    participants: Array<{
      user_id: string;
      role: string;
      user: { id: string; discord_username: string; alias: string | null };
    }>,
    remainingPot: number,
    leaderCutAmount: number,
    leaderId: string,
    splitConfig: SplitConfig,
    spendingByUser: Map<string, number>
  ): ParticipantShare[] {
    const totalPot = remainingPot + leaderCutAmount;

    if (splitConfig.type === 'custom' && splitConfig.custom_shares) {
      // Custom shares defined per user
      return participants.map((p) => {
        const customShare = splitConfig.custom_shares![p.user_id] || 0;
        const shareAmount = Math.floor(totalPot * (customShare / 100));
        const totalSpent = spendingByUser.get(p.user_id) || 0;
        return {
          user_id: p.user_id,
          discord_username: p.user.discord_username,
          alias: p.user.alias,
          role: p.role,
          share_amount: shareAmount,
          share_percentage: customShare,
          total_spent: totalSpent,
          net_amount: shareAmount - totalSpent,
        };
      });
    }

    // Equal split (default)
    // Leader gets their cut + equal share of remaining
    const equalShare = Math.floor(remainingPot / participants.length);

    return participants.map((p) => {
      const isLeader = p.user_id === leaderId;
      const shareAmount = isLeader ? equalShare + leaderCutAmount : equalShare;
      const sharePercentage = totalPot > 0 ? (shareAmount / totalPot) * 100 : 0;
      const totalSpent = spendingByUser.get(p.user_id) || 0;

      return {
        user_id: p.user_id,
        discord_username: p.user.discord_username,
        alias: p.user.alias,
        role: p.role,
        share_amount: shareAmount,
        share_percentage: Math.round(sharePercentage * 100) / 100,
        total_spent: totalSpent,
        net_amount: shareAmount - totalSpent,
      };
    });
  }

  /**
   * Execute the pot distribution atomically
   */
  async distributePot(
    raidId: string,
    userId: string,
    io?: TypedServer
  ): Promise<DistributionResult> {
    try {
      return await prisma.$transaction(
        async (tx) => {
          // Lock the raid
          const raids = await tx.$queryRaw<
            Array<{
              id: string;
              name: string;
              status: string;
              leader_id: string;
              pot_total: Prisma.Decimal;
              split_config: unknown;
            }>
          >`
            SELECT id, name, status, leader_id, pot_total, split_config
            FROM "Raid"
            WHERE id = ${raidId}::uuid
            FOR UPDATE
          `;

          const raid = raids[0];
          if (!raid) {
            return { success: false, error: 'RAID_NOT_FOUND', message: 'Raid not found' };
          }

          // Only leader can distribute pot
          if (raid.leader_id !== userId) {
            return { success: false, error: 'RAID_NOT_LEADER', message: 'Only the leader can distribute the pot' };
          }

          // Check raid is active (not already completed)
          if (raid.status === 'COMPLETED') {
            return { success: false, error: 'ALREADY_DISTRIBUTED', message: 'Pot has already been distributed' };
          }

          if (raid.status === 'CANCELLED') {
            return { success: false, error: 'RAID_CANCELLED', message: 'Cannot distribute pot for cancelled raid' };
          }

          // Check all auctions are completed
          const activeItems = await tx.item.count({
            where: {
              raid_id: raidId,
              status: { in: ['PENDING', 'ACTIVE'] },
            },
          });

          if (activeItems > 0) {
            return {
              success: false,
              error: 'AUCTIONS_PENDING',
              message: `${activeItems} auctions are still pending or active`,
            };
          }

          const potTotal = Number(raid.pot_total);

          if (potTotal <= 0) {
            // Mark as completed even with zero pot
            await tx.raid.update({
              where: { id: raidId },
              data: {
                status: 'COMPLETED',
                ended_at: new Date(),
              },
            });

            return {
              success: true,
              pot_total: 0,
              distributed_amount: 0,
              participant_count: 0,
            };
          }

          // Get participants
          const participants = await tx.raidParticipant.findMany({
            where: { raid_id: raidId },
            include: {
              user: {
                select: { id: true, discord_username: true },
              },
            },
          });

          if (participants.length === 0) {
            return { success: false, error: 'NO_PARTICIPANTS', message: 'No participants to distribute to' };
          }

          const splitConfig = raid.split_config as SplitConfig;

          // Calculate shares
          const leaderCutPercent = splitConfig.leader_cut_percent || 0;
          const leaderCutAmount = Math.floor(potTotal * (leaderCutPercent / 100));
          const remainingPot = potTotal - leaderCutAmount;
          const equalShare = Math.floor(remainingPot / participants.length);

          let distributedAmount = 0;
          const now = new Date();

          // Process each participant
          for (const participant of participants) {
            const isLeader = participant.user_id === raid.leader_id;
            const shareAmount = isLeader ? equalShare + leaderCutAmount : equalShare;

            if (shareAmount <= 0) continue;

            // Lock user and update balance
            await tx.$queryRaw`
              SELECT id FROM "User" WHERE id = ${participant.user_id}::uuid FOR UPDATE
            `;

            await tx.user.update({
              where: { id: participant.user_id },
              data: {
                gold_balance: { increment: shareAmount },
              },
            });

            // Create transaction record
            await tx.transaction.create({
              data: {
                user_id: participant.user_id,
                type: 'POT_PAYOUT',
                gold_amount: shareAmount,
                status: 'COMPLETED',
                completed_at: now,
                metadata: {
                  raid_id: raidId,
                  raid_name: raid.name,
                  pot_total: potTotal,
                  share_percentage: isLeader
                    ? ((shareAmount / potTotal) * 100).toFixed(2)
                    : ((equalShare / potTotal) * 100).toFixed(2),
                  is_leader: isLeader,
                  leader_cut_included: isLeader ? leaderCutAmount : 0,
                },
              },
            });

            // Update participant record
            await tx.raidParticipant.update({
              where: { id: participant.id },
              data: {
                payout_amount: shareAmount,
                paid_at: now,
              },
            });

            distributedAmount += shareAmount;

            // Emit wallet update to participant
            if (io) {
              const updatedUser = await tx.user.findUnique({
                where: { id: participant.user_id },
                select: { gold_balance: true },
              });

              io.to(`user:${participant.user_id}`).emit('wallet:updated', {
                balance: Number(updatedUser?.gold_balance || 0),
                locked_amount: 0,
              });

              // Send individual payout notification
              io.to(`user:${participant.user_id}`).emit('pot:payout', {
                raid_id: raidId,
                raid_name: raid.name,
                amount: shareAmount,
                pot_total: potTotal,
              });
            }
          }

          // Mark raid as completed
          await tx.raid.update({
            where: { id: raidId },
            data: {
              status: 'COMPLETED',
              ended_at: now,
            },
          });

          logger.info(
            {
              raidId,
              potTotal,
              distributedAmount,
              participantCount: participants.length,
              leaderId: raid.leader_id,
              leaderCut: leaderCutPercent,
            },
            'Pot distributed successfully'
          );

          // Emit raid completion to all
          if (io) {
            io.to(`raid:${raidId}`).emit('raid:completed', {
              raid_id: raidId,
              pot_total: potTotal,
              distributed_amount: distributedAmount,
              participant_count: participants.length,
            });
          }

          return {
            success: true,
            pot_total: potTotal,
            distributed_amount: distributedAmount,
            participant_count: participants.length,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 30000, // 30 second timeout for large raids
        }
      );
    } catch (error) {
      logger.error({ raidId, userId, error }, 'Failed to distribute pot');

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2034') {
          // Transaction conflict
          return {
            success: false,
            error: 'TRANSACTION_CONFLICT',
            message: 'Transaction conflict, please retry',
          };
        }
      }

      throw error;
    }
  }

  /**
   * Cancel a raid and refund all participants
   */
  async cancelRaid(
    raidId: string,
    userId: string,
    reason: string,
    io?: TypedServer
  ): Promise<DistributionResult> {
    try {
      return await prisma.$transaction(
        async (tx) => {
          // Lock the raid
          const raids = await tx.$queryRaw<
            Array<{
              id: string;
              name: string;
              status: string;
              leader_id: string;
              pot_total: Prisma.Decimal;
            }>
          >`
            SELECT id, name, status, leader_id, pot_total
            FROM "Raid"
            WHERE id = ${raidId}::uuid
            FOR UPDATE
          `;

          const raid = raids[0];
          if (!raid) {
            return { success: false, error: 'RAID_NOT_FOUND', message: 'Raid not found' };
          }

          if (raid.leader_id !== userId) {
            return { success: false, error: 'RAID_NOT_LEADER', message: 'Only the leader can cancel the raid' };
          }

          if (raid.status === 'COMPLETED' || raid.status === 'CANCELLED') {
            return { success: false, error: 'INVALID_STATUS', message: 'Raid is already completed or cancelled' };
          }

          const now = new Date();

          // Cancel any active auctions
          await tx.item.updateMany({
            where: {
              raid_id: raidId,
              status: 'ACTIVE',
            },
            data: {
              status: 'CANCELLED',
              completed_at: now,
            },
          });

          // Get all completed items and refund winners
          const completedItems = await tx.item.findMany({
            where: {
              raid_id: raidId,
              status: 'COMPLETED',
              winner_id: { not: null },
            },
            include: {
              bids: {
                where: { is_winning: true },
                include: {
                  user: { select: { id: true } },
                },
              },
            },
          });

          let refundedAmount = 0;

          for (const item of completedItems) {
            const winningBid = item.bids[0];
            if (!winningBid) continue;

            const refundAmount = Number(winningBid.amount);

            // Refund the winner
            await tx.$queryRaw`
              SELECT id FROM "User" WHERE id = ${winningBid.user_id}::uuid FOR UPDATE
            `;

            await tx.user.update({
              where: { id: winningBid.user_id },
              data: {
                gold_balance: { increment: refundAmount },
              },
            });

            // Create refund transaction
            await tx.transaction.create({
              data: {
                user_id: winningBid.user_id,
                type: 'REFUND',
                gold_amount: refundAmount,
                status: 'COMPLETED',
                completed_at: now,
                metadata: {
                  raid_id: raidId,
                  raid_name: raid.name,
                  item_id: item.id,
                  item_name: item.name,
                  reason: 'Raid cancelled',
                  cancel_reason: reason,
                },
              },
            });

            refundedAmount += refundAmount;

            // Emit wallet update
            if (io) {
              io.to(`user:${winningBid.user_id}`).emit('wallet:updated', {
                balance: 0, // Will be fetched client-side
                locked_amount: 0,
              });
            }

            // Update item status
            await tx.item.update({
              where: { id: item.id },
              data: { status: 'CANCELLED' },
            });
          }

          // Mark pending items as cancelled
          await tx.item.updateMany({
            where: {
              raid_id: raidId,
              status: 'PENDING',
            },
            data: {
              status: 'CANCELLED',
              completed_at: now,
            },
          });

          // Mark raid as cancelled
          await tx.raid.update({
            where: { id: raidId },
            data: {
              status: 'CANCELLED',
              pot_total: 0,
              ended_at: now,
            },
          });

          logger.info(
            { raidId, reason, refundedAmount, itemsRefunded: completedItems.length },
            'Raid cancelled and refunds processed'
          );

          // Emit cancellation
          if (io) {
            io.to(`raid:${raidId}`).emit('raid:cancelled', {
              raid_id: raidId,
              reason,
              refunded_amount: refundedAmount,
            });
          }

          return {
            success: true,
            pot_total: Number(raid.pot_total),
            distributed_amount: refundedAmount,
            participant_count: completedItems.length,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 30000,
        }
      );
    } catch (error) {
      logger.error({ raidId, userId, reason, error }, 'Failed to cancel raid');
      throw error;
    }
  }
}
