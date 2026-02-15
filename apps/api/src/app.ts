import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { logger } from './config/logger.js';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';

// Routes
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import raidRoutes from './routes/raid.routes.js';
import auctionRoutes from './routes/auction.routes.js';
import adminRoutes from './routes/admin.routes.js';
import itemRoutes from './routes/items.routes.js';
import preAuctionRoutes from './routes/pre-auction.routes.js';
import publicRoutes from './routes/public.routes.js';

export async function createApp() {
  const app = Fastify({
    loggerInstance: logger,
    trustProxy: true,
  });

  // Register plugins
  await app.register(cors, {
    origin: env.FRONTEND_URL,
    credentials: true,
  });

  await app.register(cookie, {
    secret: env.JWT_SECRET,
    hook: 'onRequest',
  });

  await app.register(jwt, {
    secret: env.JWT_SECRET,
    cookie: {
      cookieName: 'token',
      signed: false,
    },
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // Global error handler
  app.setErrorHandler(errorHandler);

  // Build version - change this on each deploy to trigger client refresh
  const BUILD_VERSION = '2026-02-15-v1';

  // Health check with version
  app.get('/health', async () => ({
    status: 'ok',
    version: BUILD_VERSION,
    timestamp: new Date().toISOString()
  }));

  // Version endpoint for client refresh check
  app.get('/api/version', async () => ({ version: BUILD_VERSION }));

  // API routes
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(userRoutes, { prefix: '/api/users' });
  await app.register(raidRoutes, { prefix: '/api/raids' });
  await app.register(auctionRoutes, { prefix: '/api/auctions' });
  await app.register(adminRoutes, { prefix: '/api/admin' });
  await app.register(itemRoutes, { prefix: '/api/items' });
  await app.register(preAuctionRoutes, { prefix: '/api' });
  await app.register(publicRoutes, { prefix: '/api/public' });

  return app;
}

// Type augmentation for Fastify
declare module 'fastify' {
  interface FastifyInstance {
    io: import('socket.io').Server;
  }
}
