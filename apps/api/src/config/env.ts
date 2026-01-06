import { z } from 'zod';

const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000'),
  HOST: z.string().default('0.0.0.0'),

  // Database
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Discord OAuth
  DISCORD_CLIENT_ID: z.string(),
  DISCORD_CLIENT_SECRET: z.string(),
  DISCORD_REDIRECT_URI: z.string(),

  // PayPal
  PAYPAL_CLIENT_ID: z.string(),
  PAYPAL_CLIENT_SECRET: z.string(),
  PAYPAL_MODE: z.enum(['sandbox', 'live']).default('sandbox'),
  PAYPAL_WEBHOOK_ID: z.string().optional(),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),

  // URLs
  API_URL: z.string().default('http://localhost:3000'),
  FRONTEND_URL: z.string().default('http://localhost:5173'),

  // Exchange rates
  GOLD_PER_EUR: z.string().default('1000'),
  PLATFORM_FEE_PERCENT: z.string().default('5'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  console.error(parsed.error.format());
  process.exit(1);
}

export const env = {
  ...parsed.data,
  PORT: Number(parsed.data.PORT),
  GOLD_PER_EUR: Number(parsed.data.GOLD_PER_EUR),
  PLATFORM_FEE_PERCENT: Number(parsed.data.PLATFORM_FEE_PERCENT),
  isDev: parsed.data.NODE_ENV === 'development',
  isProd: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
};
