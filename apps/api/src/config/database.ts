import { PrismaClient } from '@gdkp/prisma-client';
import { logger } from './logger.js';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

export const prisma =
  global.prisma ||
  new PrismaClient({
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'warn' },
    ],
  });

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

// Log slow queries in development
if (process.env.NODE_ENV === 'development') {
  prisma.$on('query' as never, (e: { duration: number; query: string }) => {
    if (e.duration > 100) {
      logger.warn({ duration: e.duration, query: e.query }, 'Slow query detected');
    }
  });
}

prisma.$on('error' as never, (e: { message: string }) => {
  logger.error({ error: e.message }, 'Prisma error');
});
