import 'dotenv/config';
import { createApp } from './app.js';
import { createSocketServer } from './socket/index.js';
import { logger } from './config/logger.js';

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

async function main() {
  try {
    // Create Fastify app
    const app = await createApp();

    // Create Socket.io server attached to Fastify
    const io = createSocketServer(app.server);

    // Make io available to routes
    app.decorate('io', io);

    // Start server
    await app.listen({ port: PORT, host: HOST });

    logger.info(`Server running at http://${HOST}:${PORT}`);
    logger.info(`WebSocket server ready`);

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down gracefully...');
      io.close();
      await app.close();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    logger.error(error, 'Failed to start server');
    process.exit(1);
  }
}

main();
