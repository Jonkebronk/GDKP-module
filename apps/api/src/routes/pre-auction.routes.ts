import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { requireAuth } from '../middleware/auth.js';
import { AppError, ERROR_CODES } from '@gdkp/shared';
import { PreAuctionService } from '../services/pre-auction.service.js';
import { BidService } from '../services/bid.service.js';
import { env } from '../config/env.js';

// Fetch Discord message and extract user IDs from Raid Helper format
async function fetchRaidHelperSignups(channelId: string, messageId: string): Promise<string[]> {
  if (!env.DISCORD_BOT_TOKEN) {
    throw new AppError(ERROR_CODES.INVALID_REQUEST, 'Discord bot token not configured', 500);
  }

  // Fetch message from Discord API
  const response = await fetch(
    `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`,
    {
      headers: {
        Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new AppError(
      ERROR_CODES.INVALID_REQUEST,
      `Failed to fetch Discord message: ${response.status} ${error}`,
      400
    );
  }

  const message = await response.json();
  const discordIds: Set<string> = new Set();

  // Extract user IDs from message content (mentions like <@123456789>)
  const contentMatches = message.content?.match(/<@!?(\d{17,19})>/g) || [];
  for (const match of contentMatches) {
    const id = match.replace(/<@!?(\d{17,19})>/, '$1');
    discordIds.add(id);
  }

  // Extract user IDs from embeds
  if (message.embeds) {
    for (const embed of message.embeds) {
      // Check embed description
      if (embed.description) {
        const descMatches = embed.description.match(/<@!?(\d{17,19})>/g) || [];
        for (const match of descMatches) {
          const id = match.replace(/<@!?(\d{17,19})>/, '$1');
          discordIds.add(id);
        }
        // Also look for raw IDs in Raid Helper format (some versions use plain IDs)
        const rawIdMatches = embed.description.match(/\b(\d{17,19})\b/g) || [];
        for (const id of rawIdMatches) {
          discordIds.add(id);
        }
      }

      // Check embed fields
      if (embed.fields) {
        for (const field of embed.fields) {
          const fieldValue = field.value || '';
          const fieldMatches = fieldValue.match(/<@!?(\d{17,19})>/g) || [];
          for (const match of fieldMatches) {
            const id = match.replace(/<@!?(\d{17,19})>/, '$1');
            discordIds.add(id);
          }
          // Raw IDs
          const rawIdMatches = fieldValue.match(/\b(\d{17,19})\b/g) || [];
          for (const id of rawIdMatches) {
            discordIds.add(id);
          }
        }
      }
    }
  }

  // Also fetch reactions to get users who reacted (Raid Helper uses reactions for signups)
  try {
    // Get common Raid Helper reaction emojis
    const reactionEmojis = ['✅', '❌', '❔', '🛡️', '⚔️', '🏹', '✨'];

    for (const emoji of reactionEmojis) {
      const encodedEmoji = encodeURIComponent(emoji);
      const reactionsResponse = await fetch(
        `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}/reactions/${encodedEmoji}?limit=100`,
        {
          headers: {
            Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
          },
        }
      );

      if (reactionsResponse.ok) {
        const users = await reactionsResponse.json();
        for (const user of users) {
          if (user.id && !user.bot) {
            discordIds.add(user.id);
          }
        }
      }
    }
  } catch {
    // Ignore reaction fetch errors, continue with what we have
  }

  return Array.from(discordIds);
}

const preAuctionService = new PreAuctionService();
const bidService = new BidService();

const lockRosterSchema = z.object({
  duration_hours: z.number().int().min(1).max(72),
});

const placeBidSchema = z.object({
  amount: z.number().int().positive(),
});

const preAuctionRoutes: FastifyPluginAsync = async (fastify) => {
  // List all pre-auctions the user is participating in
  fastify.get('/pre-auctions', { preHandler: [requireAuth] }, async (request) => {
    const userId = request.user.id;

    // Get all raids where user is a participant and roster is locked
    const raids = await prisma.raid.findMany({
      where: {
        roster_locked_at: { not: null },
        participants: {
          some: { user_id: userId },
        },
      },
      include: {
        participants: true,
        pre_auction_items: {
          include: {
            bids: {
              where: { user_id: userId, is_winning: true },
            },
          },
        },
      },
      orderBy: { preauction_ends_at: 'asc' },
    });

    const now = new Date();

    const active: any[] = [];
    const ended: any[] = [];

    for (const raid of raids) {
      const isActive = raid.preauction_ends_at && raid.preauction_ends_at > now;
      const itemsWithBids = raid.pre_auction_items.filter((i) => Number(i.current_bid) > 0).length;
      const myWinningBids = raid.pre_auction_items.filter((i) => i.winner_id === userId).length;
      const myTotalBidAmount = raid.pre_auction_items
        .filter((i) => i.winner_id === userId)
        .reduce((sum, i) => sum + Number(i.current_bid), 0);

      const raidData = {
        id: raid.id,
        name: raid.name,
        instances: raid.instances,
        roster_locked_at: raid.roster_locked_at,
        preauction_ends_at: raid.preauction_ends_at,
        participant_count: raid.participants.length,
        item_count: raid.pre_auction_items.length,
        items_with_bids: itemsWithBids,
        my_winning_bids: myWinningBids,
        my_total_bid_amount: myTotalBidAmount,
      };

      if (isActive) {
        active.push(raidData);
      } else {
        ended.push(raidData);
      }
    }

    // Only return last 10 ended
    return {
      active,
      ended: ended.slice(0, 10),
    };
  });

  // Get available raids for starting pre-auction (admin only)
  fastify.get('/pre-auctions/available-raids', { preHandler: [requireAuth] }, async (request) => {
    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: { role: true },
    });

    if (user?.role !== 'ADMIN') {
      throw new AppError(ERROR_CODES.AUTH_FORBIDDEN, 'Admin access required', 403);
    }

    // Get raids that are PENDING and not yet locked
    const raids = await prisma.raid.findMany({
      where: {
        status: 'PENDING',
        roster_locked_at: null,
      },
      include: {
        participants: true,
      },
      orderBy: { created_at: 'desc' },
    });

    return raids.map((raid) => ({
      id: raid.id,
      name: raid.name,
      instances: raid.instances,
      status: raid.status,
      participant_count: raid.participants.length,
      created_at: raid.created_at,
    }));
  });

  // Import participants from Raid Helper (by Discord IDs)
  fastify.post('/raids/:id/import-participants', { preHandler: [requireAuth] }, async (request) => {
    const { id } = request.params as { id: string };
    const { discord_ids } = request.body as { discord_ids: string[] };

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: { role: true },
    });

    if (user?.role !== 'ADMIN') {
      throw new AppError(ERROR_CODES.AUTH_FORBIDDEN, 'Admin access required', 403);
    }

    // Get the raid
    const raid = await prisma.raid.findUnique({
      where: { id },
      include: { participants: true },
    });

    if (!raid) {
      throw new AppError(ERROR_CODES.RAID_NOT_FOUND, 'Raid not found', 404);
    }

    if (raid.roster_locked_at) {
      throw new AppError(ERROR_CODES.INVALID_REQUEST, 'Roster is already locked', 400);
    }

    // Find users by Discord IDs
    const users = await prisma.user.findMany({
      where: {
        discord_id: { in: discord_ids },
      },
      select: { id: true, discord_id: true },
    });

    const existingParticipantIds = new Set(raid.participants.map((p) => p.user_id));
    const foundDiscordIds = new Set(users.map((u) => u.discord_id));

    // Filter users not already in raid
    const usersToAdd = users.filter((u) => !existingParticipantIds.has(u.id));

    // Add participants
    if (usersToAdd.length > 0) {
      await prisma.raidParticipant.createMany({
        data: usersToAdd.map((u) => ({
          raid_id: id,
          user_id: u.id,
        })),
        skipDuplicates: true,
      });
    }

    // Find Discord IDs that weren't found in the system
    const notFound = discord_ids.filter((discordId) => !foundDiscordIds.has(discordId));

    return {
      matched: usersToAdd.length,
      already_in_raid: users.length - usersToAdd.length,
      not_found: notFound,
    };
  });

  // Fetch signups from Raid Helper Discord message and import participants
  fastify.post('/raids/:id/import-from-raidhelper', { preHandler: [requireAuth] }, async (request) => {
    const { id } = request.params as { id: string };
    const { channel_id, message_id } = request.body as { channel_id: string; message_id: string };

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: { role: true },
    });

    if (user?.role !== 'ADMIN') {
      throw new AppError(ERROR_CODES.AUTH_FORBIDDEN, 'Admin access required', 403);
    }

    // Get the raid
    const raid = await prisma.raid.findUnique({
      where: { id },
      include: { participants: true },
    });

    if (!raid) {
      throw new AppError(ERROR_CODES.RAID_NOT_FOUND, 'Raid not found', 404);
    }

    if (raid.roster_locked_at) {
      throw new AppError(ERROR_CODES.INVALID_REQUEST, 'Roster is already locked', 400);
    }

    // Fetch Discord user IDs from Raid Helper message
    const discordIds = await fetchRaidHelperSignups(channel_id, message_id);

    if (discordIds.length === 0) {
      return {
        matched: 0,
        created: 0,
        already_in_raid: 0,
        failed_to_fetch: [],
        message: 'No Discord user IDs found in the message',
      };
    }

    // Find existing users by Discord IDs
    const existingUsers = await prisma.user.findMany({
      where: {
        discord_id: { in: discordIds },
      },
      select: { id: true, discord_id: true },
    });

    const existingDiscordIds = new Set(existingUsers.map((u) => u.discord_id));
    const missingDiscordIds = discordIds.filter((discordId) => !existingDiscordIds.has(discordId));

    // Auto-create users for missing Discord IDs
    const createdUsers: { id: string; discord_id: string }[] = [];
    const failedToCreate: string[] = [];

    for (const discordId of missingDiscordIds) {
      try {
        // Try to fetch user info from Discord API (may fail if bot doesn't share a guild)
        let username = `User${discordId.slice(-4)}`;
        let avatar: string | null = null;

        try {
          const discordResponse = await fetch(`https://discord.com/api/v10/users/${discordId}`, {
            headers: {
              Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
            },
          });

          if (discordResponse.ok) {
            const discordUser = await discordResponse.json();
            username = discordUser.username || username;
            avatar = discordUser.avatar || null;
          }
          // If fetch fails, we still create with placeholder - they'll get updated on login
        } catch {
          // Ignore fetch errors, continue with placeholder data
        }

        // Create user in database (even if Discord fetch failed)
        const newUser = await prisma.user.create({
          data: {
            discord_id: discordId,
            discord_username: username,
            discord_avatar: avatar,
            gold_balance: 0,
            role: 'USER',
            session_status: 'APPROVED', // Auto-approve so they can access pre-auction
          },
          select: { id: true, discord_id: true },
        });

        createdUsers.push(newUser);
      } catch (err) {
        failedToCreate.push(discordId);
      }
    }

    // Combine existing and newly created users
    const allUsers = [...existingUsers, ...createdUsers];
    const existingParticipantIds = new Set(raid.participants.map((p) => p.user_id));

    // Filter users not already in raid
    const usersToAdd = allUsers.filter((u) => !existingParticipantIds.has(u.id));

    // Add participants
    if (usersToAdd.length > 0) {
      await prisma.raidParticipant.createMany({
        data: usersToAdd.map((u) => ({
          raid_id: id,
          user_id: u.id,
        })),
        skipDuplicates: true,
      });
    }

    return {
      matched: existingUsers.filter((u) => !existingParticipantIds.has(u.id)).length,
      created: createdUsers.length,
      already_in_raid: allUsers.length - usersToAdd.length,
      failed_to_create: failedToCreate,
      total_found_in_message: discordIds.length,
      total_added: usersToAdd.length,
    };
  });

  // Lock roster and start pre-auction
  fastify.post('/raids/:id/lock-roster', { preHandler: [requireAuth] }, async (request) => {
    const { id } = request.params as { id: string };
    const data = lockRosterSchema.parse(request.body);

    const result = await preAuctionService.lockRosterAndStartPreAuction(
      id,
      request.user.id,
      data.duration_hours
    );

    if (!result.success) {
      throw new AppError(
        result.error as keyof typeof ERROR_CODES,
        result.message || 'Failed to lock roster',
        400
      );
    }

    // Emit to all raid participants
    fastify.io.to(`raid:${id}`).emit('preauction:started', {
      raid_id: id,
      ends_at: result.preauction_ends_at!.toISOString(),
      item_count: result.item_count!,
    });

    // Notify dashboard about raid update
    fastify.io.emit('raids:updated');

    return {
      success: true,
      preauction_ends_at: result.preauction_ends_at,
      item_count: result.item_count,
    };
  });

  // Get pre-auction items for a raid
  fastify.get('/raids/:id/pre-auction', { preHandler: [requireAuth] }, async (request) => {
    const { id } = request.params as { id: string };
    const { slot, quality, boss, search, status } = request.query as {
      slot?: string;
      quality?: string;
      boss?: string;
      search?: string;
      status?: string;
    };

    // Verify user is in the raid
    const participant = await prisma.raidParticipant.findUnique({
      where: {
        raid_id_user_id: { raid_id: id, user_id: request.user.id },
      },
    });

    if (!participant) {
      throw new AppError(ERROR_CODES.INVALID_REQUEST, 'Must be a raid participant', 403);
    }

    // Get raid info
    const raid = await prisma.raid.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        instances: true,
        roster_locked_at: true,
        preauction_ends_at: true,
      },
    });

    if (!raid) {
      throw new AppError(ERROR_CODES.RAID_NOT_FOUND, 'Raid not found', 404);
    }

    if (!raid.roster_locked_at) {
      throw new AppError(ERROR_CODES.INVALID_REQUEST, 'Pre-auction not started', 400);
    }

    const items = await preAuctionService.getPreAuctionItems(id, {
      slot,
      quality: quality ? parseInt(quality, 10) : undefined,
      boss,
      search,
      status: status as 'ACTIVE' | 'ENDED' | 'CLAIMED' | 'UNCLAIMED' | undefined,
    });

    return {
      raid: {
        id: raid.id,
        name: raid.name,
        instances: raid.instances,
        preauction_ends_at: raid.preauction_ends_at,
      },
      items,
      total_count: items.length,
    };
  });

  // Get single pre-auction item with bid history
  fastify.get('/raids/:id/pre-auction/:itemId', { preHandler: [requireAuth] }, async (request) => {
    const { id, itemId } = request.params as { id: string; itemId: string };

    // Verify user is in the raid
    const participant = await prisma.raidParticipant.findUnique({
      where: {
        raid_id_user_id: { raid_id: id, user_id: request.user.id },
      },
    });

    if (!participant) {
      throw new AppError(ERROR_CODES.INVALID_REQUEST, 'Must be a raid participant', 403);
    }

    const item = await preAuctionService.getPreAuctionItemWithBids(itemId);

    if (!item || item.raid_id !== id) {
      throw new AppError(ERROR_CODES.ITEM_NOT_FOUND, 'Pre-auction item not found', 404);
    }

    return item;
  });

  // Place a bid on a pre-auction item
  fastify.post('/raids/:id/pre-auction/:itemId/bid', { preHandler: [requireAuth] }, async (request) => {
    const { id, itemId } = request.params as { id: string; itemId: string };
    const data = placeBidSchema.parse(request.body);

    // Verify the item belongs to this raid
    const preAuctionItem = await prisma.preAuctionItem.findUnique({
      where: { id: itemId },
      include: { tbc_item: true },
    });

    if (!preAuctionItem || preAuctionItem.raid_id !== id) {
      throw new AppError(ERROR_CODES.ITEM_NOT_FOUND, 'Pre-auction item not found', 404);
    }

    const result = await preAuctionService.placeBid(request.user.id, itemId, data.amount);

    if (!result.success) {
      throw new AppError(
        result.error as keyof typeof ERROR_CODES,
        result.error === 'BID_TOO_LOW'
          ? `Minimum bid is ${result.min_required}`
          : result.error || 'Failed to place bid',
        400
      );
    }

    // Get user info for socket event
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: { id: true, discord_username: true, alias: true },
    });

    const username = user?.alias || user?.discord_username || 'Unknown';

    // Emit to all raid participants
    fastify.io.to(`raid:${id}`).emit('preauction:bid:new', {
      pre_auction_item_id: itemId,
      bid_id: result.bid!.id,
      user_id: request.user.id,
      username,
      amount: Number(result.bid!.amount),
      timestamp: result.bid!.created_at.toISOString(),
      previous_winner_id: result.previous_winner_id || null,
    });

    // Send wallet update to bidder
    const liveLockedAmount = await bidService.getLockedAmount(request.user.id);
    const preAuctionLockedAmount = await preAuctionService.getPreAuctionLockedAmount(request.user.id);
    const totalLocked = liveLockedAmount + preAuctionLockedAmount;

    const userBalance = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: { gold_balance: true },
    });

    fastify.io.to(`user:${request.user.id}`).emit('wallet:updated', {
      balance: Number(userBalance?.gold_balance || 0),
      locked_amount: totalLocked,
    });

    // If someone was outbid, send them a wallet update too
    if (result.previous_winner_id && result.previous_winner_id !== request.user.id) {
      const prevLiveLockedAmount = await bidService.getLockedAmount(result.previous_winner_id);
      const prevPreAuctionLockedAmount = await preAuctionService.getPreAuctionLockedAmount(result.previous_winner_id);
      const prevTotalLocked = prevLiveLockedAmount + prevPreAuctionLockedAmount;

      const prevUserBalance = await prisma.user.findUnique({
        where: { id: result.previous_winner_id },
        select: { gold_balance: true },
      });

      fastify.io.to(`user:${result.previous_winner_id}`).emit('wallet:updated', {
        balance: Number(prevUserBalance?.gold_balance || 0),
        locked_amount: prevTotalLocked,
      });
    }

    return {
      success: true,
      bid_id: result.bid!.id,
      amount: Number(result.bid!.amount),
      timestamp: result.bid!.created_at.toISOString(),
    };
  });

  // Get unique filter options for a raid's pre-auction items
  fastify.get('/raids/:id/pre-auction/filters', { preHandler: [requireAuth] }, async (request) => {
    const { id } = request.params as { id: string };

    // Verify user is in the raid
    const participant = await prisma.raidParticipant.findUnique({
      where: {
        raid_id_user_id: { raid_id: id, user_id: request.user.id },
      },
    });

    if (!participant) {
      throw new AppError(ERROR_CODES.INVALID_REQUEST, 'Must be a raid participant', 403);
    }

    // Get unique slots, bosses for this raid's pre-auction items
    const items = await prisma.preAuctionItem.findMany({
      where: { raid_id: id },
      include: {
        tbc_item: {
          select: {
            slot: true,
            boss_name: true,
            quality: true,
          },
        },
      },
    });

    const slots = [...new Set(items.map((i) => i.tbc_item.slot).filter(Boolean))].sort();
    const bosses = [...new Set(items.map((i) => i.tbc_item.boss_name).filter(Boolean))].sort();
    const qualities = [...new Set(items.map((i) => i.tbc_item.quality))].sort((a, b) => b - a);

    return {
      slots,
      bosses,
      qualities,
    };
  });

  // Get user's pre-auction bids for a raid
  fastify.get('/raids/:id/pre-auction/my-bids', { preHandler: [requireAuth] }, async (request) => {
    const { id } = request.params as { id: string };

    const bids = await prisma.preAuctionBid.findMany({
      where: {
        user_id: request.user.id,
        pre_auction_item: {
          raid_id: id,
        },
      },
      include: {
        pre_auction_item: {
          include: {
            tbc_item: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    return bids.map((bid) => ({
      id: bid.id,
      pre_auction_item_id: bid.pre_auction_item_id,
      amount: Number(bid.amount),
      is_winning: bid.is_winning,
      created_at: bid.created_at,
      item_name: bid.pre_auction_item.tbc_item.name,
      item_icon: bid.pre_auction_item.tbc_item.icon,
      item_quality: bid.pre_auction_item.tbc_item.quality,
      current_bid: Number(bid.pre_auction_item.current_bid),
      status: bid.pre_auction_item.status,
    }));
  });
};

export default preAuctionRoutes;
