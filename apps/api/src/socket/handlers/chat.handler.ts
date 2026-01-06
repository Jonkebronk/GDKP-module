import { Socket } from 'socket.io';
import type { TypedServer } from '../index.js';
import type { SocketData, ClientToServerEvents, ServerToClientEvents } from '@gdkp/shared';
import { prisma } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { sanitizeChatMessage } from '@gdkp/shared';

type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents, unknown, SocketData>;

export function registerChatHandlers(io: TypedServer, socket: TypedSocket) {
  const { user_id, username } = socket.data;

  socket.on('chat:send', async ({ raid_id, message }) => {
    try {
      // Validate user is in this raid
      if (socket.data.current_raid_id !== raid_id) {
        socket.emit('error', { code: 'NOT_IN_RAID', message: 'Not in this raid' });
        return;
      }

      // Sanitize message
      const sanitized = sanitizeChatMessage(message);
      if (!sanitized) {
        return; // Empty message, ignore
      }

      // Get user avatar
      const user = await prisma.user.findUnique({
        where: { id: user_id },
        select: { discord_avatar: true },
      });

      // Save message to database
      const chatMessage = await prisma.chatMessage.create({
        data: {
          raid_id,
          user_id,
          message: sanitized,
          is_system: false,
        },
      });

      // Confirm to sender
      socket.emit('chat:sent', {
        message_id: chatMessage.id,
        timestamp: chatMessage.created_at.toISOString(),
      });

      // Broadcast to all raid participants
      io.to(`raid:${raid_id}`).emit('chat:message', {
        id: chatMessage.id,
        raid_id,
        user_id,
        username,
        avatar: user?.discord_avatar || null,
        message: sanitized,
        timestamp: chatMessage.created_at.toISOString(),
        is_system: false,
      });

      logger.debug({ user_id, raid_id, message_id: chatMessage.id }, 'Chat message sent');
    } catch (error) {
      logger.error({ user_id, raid_id, error }, 'Failed to send chat message');
      socket.emit('error', { code: 'INTERNAL_ERROR', message: 'Failed to send message' });
    }
  });
}

// Helper to send system messages
export async function sendSystemMessage(
  io: TypedServer,
  raid_id: string,
  message: string
) {
  // Get system user or use a placeholder
  const systemUserId = '00000000-0000-0000-0000-000000000000';

  const chatMessage = await prisma.chatMessage.create({
    data: {
      raid_id,
      user_id: systemUserId,
      message,
      is_system: true,
    },
  }).catch(() => null);

  if (chatMessage) {
    io.to(`raid:${raid_id}`).emit('chat:message', {
      id: chatMessage.id,
      raid_id,
      user_id: systemUserId,
      username: 'System',
      avatar: null,
      message,
      timestamp: chatMessage.created_at.toISOString(),
      is_system: true,
    });
  }
}
