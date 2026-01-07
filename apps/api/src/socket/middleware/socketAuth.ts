import { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import type { AuthUser, SocketData } from '@gdkp/shared';

export async function socketAuth(
  socket: Socket<unknown, unknown, unknown, SocketData>,
  next: (err?: Error) => void
) {
  try {
    // Get token from handshake auth or query
    const token =
      socket.handshake.auth.token ||
      socket.handshake.query.token;

    if (!token || typeof token !== 'string') {
      return next(new Error('Authentication required'));
    }

    // Verify JWT
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthUser;

    if (!payload.id || !payload.discord_id) {
      return next(new Error('Invalid token'));
    }

    // Attach user data to socket
    socket.data.user_id = payload.id;
    socket.data.username = payload.alias || payload.discord_username; // Display name (alias preferred)
    socket.data.discord_username = payload.discord_username; // Real Discord username (for admin)
    socket.data.alias = payload.alias || null;
    socket.data.display_name = payload.display_name || null;
    socket.data.avatar = payload.discord_avatar || null;
    socket.data.role = payload.role;

    logger.debug({ user_id: payload.id, username: socket.data.username }, 'Socket authenticated');
    next();
  } catch (error) {
    logger.warn({ error }, 'Socket authentication failed');
    next(new Error('Authentication failed'));
  }
}
