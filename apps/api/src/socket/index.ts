import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from '@gdkp/shared';
import { redisPub, redisSub } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';
import { socketAuth } from './middleware/socketAuth.js';
import { registerAuctionHandlers } from './handlers/auction.handler.js';
import { registerRaidHandlers } from './handlers/raid.handler.js';
import { registerChatHandlers } from './handlers/chat.handler.js';
import { AuctionService } from '../services/auction.service.js';

const auctionService = new AuctionService();

export type TypedServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export function createSocketServer(httpServer: HttpServer): TypedServer {
  const io: TypedServer = new Server(httpServer, {
    cors: {
      origin: env.FRONTEND_URL,
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Use Redis adapter for horizontal scaling
  io.adapter(createAdapter(redisPub, redisSub));

  // Auth middleware
  io.use(socketAuth);

  // Connection handler
  io.on('connection', (socket) => {
    const { user_id, username, role } = socket.data;
    logger.info({ user_id, socket_id: socket.id }, 'Client connected');

    // Join user's private room for wallet updates and session events
    socket.join(`user:${user_id}`);

    // Admins join the waiting room management channel
    if (role === 'ADMIN') {
      socket.join('admin:waiting-room');
    }

    // Send connection confirmation
    socket.emit('connected', {
      user_id,
      socket_id: socket.id,
    });

    // Register event handlers
    registerRaidHandlers(io, socket);
    registerAuctionHandlers(io, socket);
    registerChatHandlers(io, socket);

    // Disconnection
    socket.on('disconnect', (reason) => {
      logger.info({ user_id, socket_id: socket.id, reason }, 'Client disconnected');
    });

    // Error handling
    socket.on('error', (error) => {
      logger.error({ user_id, socket_id: socket.id, error }, 'Socket error');
    });
  });

  logger.info('Socket.io server initialized');

  // Recover any stale auctions from before server restart
  auctionService.recoverStaleAuctions(io).catch((err) => {
    logger.error({ error: err }, 'Failed to recover stale auctions on startup');
  });

  return io;
}
