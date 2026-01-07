import { Socket } from 'socket.io';
import type { TypedServer } from '../index.js';
import type { SocketData, ClientToServerEvents, ServerToClientEvents } from '@gdkp/shared';
import { prisma } from '../../config/database.js';
import { logger } from '../../config/logger.js';

type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents, unknown, SocketData>;

export function registerRaidHandlers(io: TypedServer, socket: TypedSocket) {
  const { user_id, username } = socket.data;

  // Join a raid room
  socket.on('join:raid', async ({ raid_id }) => {
    try {
      // Verify user is a participant
      const participant = await prisma.raidParticipant.findUnique({
        where: {
          raid_id_user_id: { raid_id, user_id },
        },
        include: {
          raid: {
            include: {
              leader: {
                select: { id: true, discord_username: true, discord_avatar: true, alias: true },
              },
              participants: {
                include: {
                  user: {
                    select: { id: true, discord_username: true, discord_avatar: true, alias: true },
                  },
                },
              },
              items: {
                orderBy: { created_at: 'asc' },
              },
              chat_messages: {
                orderBy: { created_at: 'desc' },
                take: 50,
                include: {
                  user: {
                    select: { id: true, discord_username: true, discord_avatar: true },
                  },
                },
              },
            },
          },
        },
      });

      if (!participant) {
        socket.emit('error', { code: 'RAID_NOT_PARTICIPANT', message: 'Not a raid participant' });
        return;
      }

      const { raid } = participant;

      // Leave previous raid room if any
      if (socket.data.current_raid_id) {
        socket.leave(`raid:${socket.data.current_raid_id}`);
        io.to(`raid:${socket.data.current_raid_id}`).emit('user:left', {
          user_id,
          username,
        });
      }

      // Join new raid room
      socket.join(`raid:${raid_id}`);
      socket.data.current_raid_id = raid_id;

      // Find active auction
      const activeAuction = raid.items.find((item) => item.status === 'ACTIVE') || null;

      // Get recent bids for active auction
      let recentBids: Array<{
        id: string;
        item_id: string;
        user_id: string;
        amount: number;
        is_winning: boolean;
        created_at: Date;
        user: { id: string; discord_username: string; discord_avatar: string | null };
      }> = [];

      if (activeAuction) {
        recentBids = await prisma.bid.findMany({
          where: { item_id: activeAuction.id },
          orderBy: { created_at: 'desc' },
          take: 20,
          include: {
            user: {
              select: { id: true, discord_username: true, discord_avatar: true },
            },
          },
        });
      }

      // Send raid state
      socket.emit('raid:state', {
        raid: {
          id: raid.id,
          name: raid.name,
          instance: raid.instance,
          leader_id: raid.leader_id,
          status: raid.status,
          pot_total: Number(raid.pot_total),
          split_config: raid.split_config as any,
          created_at: raid.created_at,
          started_at: raid.started_at,
          ended_at: raid.ended_at,
        },
        participants: raid.participants.map((p) => ({
          id: p.id,
          raid_id: p.raid_id,
          user_id: p.user_id,
          role: p.role,
          payout_amount: p.payout_amount ? Number(p.payout_amount) : null,
          paid_at: p.paid_at,
          joined_at: p.joined_at,
          user: p.user,
        })),
        items: raid.items.map((item) => ({
          id: item.id,
          raid_id: item.raid_id,
          name: item.name,
          wowhead_id: item.wowhead_id,
          icon_url: item.icon_url,
          status: item.status,
          starting_bid: Number(item.starting_bid),
          current_bid: Number(item.current_bid),
          min_increment: Number(item.min_increment),
          winner_id: item.winner_id,
          auction_duration: item.auction_duration,
          started_at: item.started_at,
          ends_at: item.ends_at,
          completed_at: item.completed_at,
        })),
        active_auction: activeAuction
          ? {
              id: activeAuction.id,
              raid_id: activeAuction.raid_id,
              name: activeAuction.name,
              wowhead_id: activeAuction.wowhead_id,
              icon_url: activeAuction.icon_url,
              status: activeAuction.status,
              starting_bid: Number(activeAuction.starting_bid),
              current_bid: Number(activeAuction.current_bid),
              min_increment: Number(activeAuction.min_increment),
              winner_id: activeAuction.winner_id,
              auction_duration: activeAuction.auction_duration,
              started_at: activeAuction.started_at,
              ends_at: activeAuction.ends_at,
              completed_at: activeAuction.completed_at,
            }
          : null,
        recent_bids: recentBids.map((bid) => ({
          id: bid.id,
          item_id: bid.item_id,
          user_id: bid.user_id,
          amount: Number(bid.amount),
          is_winning: bid.is_winning,
          created_at: bid.created_at,
          user: bid.user,
        })),
        chat_history: raid.chat_messages.reverse().map((msg) => ({
          id: msg.id,
          raid_id: msg.raid_id,
          user_id: msg.user_id,
          username: msg.user.discord_username,
          avatar: msg.user.discord_avatar,
          message: msg.message,
          timestamp: msg.created_at.toISOString(),
          is_system: msg.is_system,
        })),
      });

      // Notify others
      socket.to(`raid:${raid_id}`).emit('user:joined', {
        user_id,
        username,
        avatar: socket.data.avatar,
        alias: socket.data.alias,
      });

      logger.info({ user_id, raid_id }, 'User joined raid');
    } catch (error) {
      logger.error({ user_id, raid_id, error }, 'Failed to join raid');
      socket.emit('error', { code: 'INTERNAL_ERROR', message: 'Failed to join raid' });
    }
  });

  // Leave a raid room
  socket.on('leave:raid', ({ raid_id }) => {
    socket.leave(`raid:${raid_id}`);

    if (socket.data.current_raid_id === raid_id) {
      socket.data.current_raid_id = undefined;
    }

    io.to(`raid:${raid_id}`).emit('user:left', {
      user_id,
      username,
    });

    logger.info({ user_id, raid_id }, 'User left raid');
  });
}
